import type { DatabaseMeta, DatabaseSchema } from '../types';
import { CURRENT_SCHEMA_VERSION, migrate } from '../utils/migrations';
import { Money } from '../utils/helpers';
import { pullAllRows } from './fullPull';
import {
  IMPORT_TABLES, buildBatches, checkImportable, compareTotals, expectedTotals, groupByTable, photoManifest, roundTripDiff,
} from './importCheck';
import type {
  BatchLimits, CollectionDiff, ImportProblem, ImportTotals, PhotoFileInfo, PhotoMissing, PhotoToSend,
} from './importCheck';
import { joinDatabaseReport, prepareForCloud, splitDatabase } from './split';
import type { PhotoUploader } from './photoQueue';
import { TransportError } from './syncEngine';
import type { Transport } from './syncEngine';
import type { CloudRow, CloudTable } from './types';

// Orquestrador PURO da importação para a nuvem (docs/NUVEM-PR9.md, passos 1 a 11). Tudo que toca o mundo (disco,
// RPC, Storage, relógio) entra por `ImportDeps`. Duas etapas: `run()` envia e confere; `commit()` conclui e lacra.

/** Versão gravada no arquivo lacrado: maior que qualquer versão do app, então a versão antiga abre só para leitura. */
export const SEALED_SCHEMA_VERSION = 1000;
const MAX_HISTORY = 50;
const PHOTO_PARALLEL = 3;

export interface DiskMetaInfo { status: 'ok' | 'no_meta' | 'not_found' | 'unreadable'; revision: string | null }

export interface SaveOutcome { status: 'ok' | 'conflict' | 'io_error'; message?: string }

export type ImportPhase = 'ler' | 'copia' | 'validar' | 'enviar' | 'totais' | 'fotos' | 'volta' | 'arquivo';

export interface ImportProgress { phase: ImportPhase; done: number; total: number; message: string }

export interface ImportDeps {
  workshopId: string;
  dbPath: string;
  /** `load_database`: o texto do arquivo. */
  readDatabase(path: string): Promise<string>;
  /** `read_db_meta`: revision atual do disco. */
  readMeta(path: string): Promise<DiskMetaInfo>;
  /** `backup_pre_cloud`: devolve o caminho da cópia. Lançar = parar. */
  backupPreCloud(content: string): Promise<string>;
  /** `photo_inventory`. */
  photoInventory(dbPath: string): Promise<PhotoFileInfo[]>;
  /** `parseDatabase` (o chamador passa a configuração padrão). */
  parseDatabase(content: string): DatabaseSchema;
  /** RPC `import_rows`. Falha de tempo (57014) deve vir como `TransportError` de tipo `timeout`. */
  importRows(workshopId: string, rows: CloudRow[]): Promise<void>;
  /** RPC `import_finish`. */
  importFinish(workshopId: string, commit: boolean): Promise<ImportTotals>;
  /** RPC `import_reset`. */
  importReset(workshopId: string): Promise<void>;
  transport: Pick<Transport, 'pull'>;
  /** Nomes dos objetos já no bucket para a OS (`<fotoId>.jpg`, `<fotoId>.t.jpg`). */
  listPhotoObjects(osId: string): Promise<string[]>;
  /** Bytes da foto no disco; null = não deu para ler. */
  readPhoto(osId: string, photoId: string, thumb: boolean): Promise<Blob | null>;
  uploadPhoto: PhotoUploader;
  /** `save_database_atomic` com a revision esperada. */
  saveDatabase(path: string, content: string, expectedRevision: string | null): Promise<SaveOutcome>;
  now(): string;
  newId(): string;
  onProgress?(p: ImportProgress): void;
  batchLimits?: BatchLimits;
  photoParallel?: number;
}

// ---------- resultados ----------

export interface ReportLine { label: string; file: string; cloud: string; same: boolean }

export interface PhotoFailure { osId: string; osNumber: number; photoId: string; message: string }

export interface PhotoReport {
  /** Fotos dos metadados que existem no disco. */
  onDisk: number;
  /** Fotos que já estavam na nuvem (envio anterior). */
  alreadyThere: number;
  sent: number;
  failed: PhotoFailure[];
  missing: PhotoMissing[];
  /** Arquivos no disco sem metadado. */
  extras: number;
  /** Fotos sem miniatura no disco (subiram só a original). */
  withoutThumb: number;
  totalBytes: number;
}

export interface ImportReport {
  /** Tudo igual: pode concluir. */
  ok: boolean;
  backupPath: string;
  /** "Arquivo × Internet". */
  lines: ReportLine[];
  /** Frases de `compareTotals`. */
  differences: string[];
  roundTrip: CollectionDiff[];
  skippedOrders: string[];
  photos: PhotoReport;
  /** Frases prontas para o Dono ler (o que impede de concluir). */
  blockers: string[];
}

export interface ImportSession {
  /** Dono do objeto: só um `run()` bem-sucedido cria. */
  readonly ready: boolean;
  readonly report: ImportReport;
  /** Banco migrado (v5), base do arquivo lacrado. */
  readonly db: DatabaseSchema;
  readonly revision: string | null;
}

export type RefusedReason = 'lacrado' | 'versao_futura' | 'ilegivel';

export type ImportRunResult =
  | { status: 'recusado'; reason: RefusedReason; message: string }
  | { status: 'bloqueado'; problems: ImportProblem[]; backupPath: string; message: string }
  /** Falha no meio (rede, servidor): reenviar tudo é seguro. */
  | { status: 'erro'; phase: ImportPhase; message: string }
  | { status: 'arquivo_mudou'; message: string }
  | { status: 'divergente'; report: ImportReport; message: string }
  | { status: 'pronto'; report: ImportReport; session: ImportSession };

export type CommitResult =
  | { status: 'concluido'; sealedRevision: string }
  /** A nuvem concluiu, mas o arquivo não pôde ser lacrado (o PC pode seguir; o arquivo fica como estava). */
  | { status: 'concluido_sem_lacre'; message: string }
  | { status: 'recusado'; message: string }
  | { status: 'arquivo_mudou'; message: string }
  | { status: 'erro'; message: string };

// ---------- peças puras ----------

/** Texto de um erro para a tela. */
const errText = (e: unknown): string => (e instanceof Error && e.message ? e.message : String(e));

const isTimeout = (e: unknown): boolean =>
  e instanceof TransportError && (e.kind === 'timeout' || e.code === '57014');

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Arquivo já lacrado por uma importação (ou de versão futura)? Lê o JSON cru: `parseDatabase` descarta `meta.cloud`. */
export function inspectFile(content: string): { kind: 'ok' } | { kind: 'refused'; reason: RefusedReason; message: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return { kind: 'refused', reason: 'ilegivel', message: 'O arquivo do banco não pôde ser lido (pode estar corrompido).' };
  }
  const meta = isRec(raw) && isRec(raw.meta) ? raw.meta : null;
  const version = meta && typeof meta.schemaVersion === 'number' ? meta.schemaVersion : 0;
  if (meta && (isRec(meta.cloud) || version >= SEALED_SCHEMA_VERSION)) {
    return { kind: 'refused', reason: 'lacrado', message: 'Este banco já foi enviado para a internet e foi lacrado. Não envie de novo.' };
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    return { kind: 'refused', reason: 'versao_futura', message: 'Este banco é de uma versão mais nova do aplicativo. Atualize o aplicativo antes de enviar.' };
  }
  return { kind: 'ok' };
}

/** Conteúdo do arquivo lacrado: o banco migrado com `schemaVersion = 1000` e `meta.cloud`. A versão antiga abre só para leitura. */
export function buildSealedContent(
  db: DatabaseSchema, oldRevision: string | null, ids: { workshopId: string; at: string; newRevision: string },
): string {
  const old: DatabaseMeta | undefined = db.meta;
  const meta: DatabaseMeta & { cloud: { workshopId: string; at: string } } = {
    schemaVersion: SEALED_SCHEMA_VERSION,
    revision: ids.newRevision,
    history: [oldRevision, ...(old?.history ?? [])].filter((r): r is string => !!r).slice(0, MAX_HISTORY),
    savedAt: ids.at,
    savedBy: 'envio para a nuvem',
    cloud: { workshopId: ids.workshopId, at: ids.at },
  };
  return JSON.stringify({ ...db, meta });
}

const LABEL: Record<CloudTable, string> = {
  work_orders: 'Ordens de serviço', work_order_finance: 'Valores das OS', work_order_costs: 'Custos das OS',
  ledger: 'Lançamentos', clients: 'Clientes', catalog_parts: 'Peças do catálogo',
  catalog_services: 'Serviços do catálogo', catalog_prices: 'Preços do catálogo', catalog_costs: 'Custos do catálogo',
  technicians: 'Técnicos', appointments: 'Agendamentos', audit_log: 'Auditoria', settings: 'Configurações',
};

/** Linhas do quadro "Arquivo × Internet". Só tabelas com algo de um dos lados, mais as somas. */
export function buildReportLines(expected: ImportTotals, got: ImportTotals): ReportLine[] {
  const lines: ReportLine[] = [];
  for (const t of IMPORT_TABLES) {
    const e = expected.counts[t] ?? 0;
    const g = got.counts?.[t] ?? 0;
    if (e === 0 && g === 0) continue;
    lines.push({ label: LABEL[t], file: String(e), cloud: String(g), same: e === g });
  }
  const money: [string, number, number][] = [
    ['Saldo dos lançamentos', expected.ledgerSignedCents, got.ledgerSignedCents],
    ['Soma dos totais das OS', expected.osTotalCents, got.osTotalCents],
    ['Soma dos adiantamentos', expected.advancesCents, got.advancesCents],
  ];
  for (const [label, e, g] of money) lines.push({ label, file: Money.format(e), cloud: Money.format(g ?? 0), same: e === g });
  lines.push({ label: 'Lançamentos pagos', file: String(expected.paidEntries), cloud: String(got.paidEntries ?? 0), same: expected.paidEntries === got.paidEntries });
  return lines;
}

/** Roda `fn` sobre os itens com no máximo `n` ao mesmo tempo. */
async function pool<T>(items: readonly T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

// ---------- orquestrador ----------

export function createImportRunner(deps: ImportDeps) {
  const progress = (phase: ImportPhase, done: number, total: number, message: string): void => {
    deps.onProgress?.({ phase, done, total, message });
  };

  /** Envia um lote; tempo esgotado (57014) divide ao meio. Uma linha só que estoura = erro. */
  async function sendBatch(rows: CloudRow[], onSent: (n: number) => void): Promise<void> {
    try {
      await deps.importRows(deps.workshopId, rows);
      onSent(rows.length);
    } catch (e) {
      if (isTimeout(e) && rows.length > 1) {
        const mid = Math.ceil(rows.length / 2);
        await sendBatch(rows.slice(0, mid), onSent);
        await sendBatch(rows.slice(mid), onSent);
        return;
      }
      throw e;
    }
  }

  async function sendPhotos(
    toSend: PhotoToSend[], photos: PhotoReport,
  ): Promise<void> {
    const byOs = new Map<string, PhotoToSend[]>();
    for (const p of toSend) { const l = byOs.get(p.osId); if (l) l.push(p); else byOs.set(p.osId, [p]); }
    const existing = new Map<string, Set<string>>();
    for (const osId of byOs.keys()) existing.set(osId, new Set(await deps.listPhotoObjects(osId)));

    let done = 0;
    progress('fotos', 0, toSend.length, 'Enviando fotos');
    await pool(toSend, deps.photoParallel ?? PHOTO_PARALLEL, async p => {
      const have = existing.get(p.osId) ?? new Set<string>();
      const needFull = !have.has(`${p.photoId}.jpg`);
      const needThumb = p.hasThumb && !have.has(`${p.photoId}.t.jpg`);
      if (!p.hasThumb) photos.withoutThumb += 1;
      const fail = (message: string): void => { photos.failed.push({ osId: p.osId, osNumber: p.osNumber, photoId: p.photoId, message }); };
      try {
        if (!needFull && !needThumb) { photos.alreadyThere += 1; return; }
        for (const [thumb, need] of [[false, needFull], [true, needThumb]] as const) {
          if (!need) continue;
          const bytes = await deps.readPhoto(p.osId, p.photoId, thumb);
          if (!bytes) {
            if (!thumb) {
              photos.missing.push({ osId: p.osId, osNumber: p.osNumber, photoId: p.photoId, reason: 'não foi possível ler o arquivo da foto' });
              return;
            }
            continue; // miniatura ilegível: a original basta
          }
          const res = await deps.uploadPhoto(p.osId, p.photoId, thumb, bytes);
          if (!res.ok) { fail(res.message); return; }
        }
        photos.sent += 1;
      } catch (e) {
        fail(errText(e));
      } finally {
        done += 1;
        progress('fotos', done, toSend.length, 'Enviando fotos');
      }
    });
  }

  /** Volta completa: lê tudo do servidor e junta. Se alguma OS não casar, tenta mais uma vez. */
  async function readBack(): Promise<ReturnType<typeof joinDatabaseReport>> {
    let rep = joinDatabaseReport(await pullAllRows(deps.transport, deps.workshopId));
    if (rep.skippedOrders.length > 0) rep = joinDatabaseReport(await pullAllRows(deps.transport, deps.workshopId));
    return rep;
  }

  async function run(): Promise<ImportRunResult> {
    let phase: ImportPhase = 'ler';
    try {
      // 1 e 2: ler, conferir versão e lacre.
      progress('ler', 0, 1, 'Lendo o banco');
      const meta = await deps.readMeta(deps.dbPath);
      if (meta.status === 'not_found' || meta.status === 'unreadable') {
        return { status: 'recusado', reason: 'ilegivel', message: 'Não encontrei o arquivo do banco neste caminho.' };
      }
      const startRevision = meta.revision;
      const content = await deps.readDatabase(deps.dbPath);
      const seen = inspectFile(content);
      if (seen.kind === 'refused') return { status: 'recusado', reason: seen.reason, message: seen.message };
      let parsed: DatabaseSchema;
      try {
        parsed = deps.parseDatabase(content);
      } catch (e) {
        return { status: 'recusado', reason: 'ilegivel', message: errText(e) };
      }
      const migrated = migrate(parsed);
      if (migrated.from > CURRENT_SCHEMA_VERSION) {
        return { status: 'recusado', reason: 'versao_futura', message: 'Este banco é de uma versão mais nova do aplicativo. Atualize o aplicativo antes de enviar.' };
      }
      const db = migrated.db;

      // 3: cópia antes de qualquer envio.
      phase = 'copia';
      progress('copia', 0, 1, 'Guardando uma cópia do banco');
      let backupPath: string;
      try {
        backupPath = await deps.backupPreCloud(content);
      } catch (e) {
        return { status: 'erro', phase: 'copia', message: `Não consegui guardar a cópia de segurança, então nada foi enviado. ${errText(e)}` };
      }

      // 4: dados que não podem ir.
      phase = 'validar';
      const prepared = prepareForCloud(db);
      const problems = checkImportable(prepared);
      if (problems.length > 0) {
        return { status: 'bloqueado', problems, backupPath, message: 'Há dados que precisam de conserto antes de enviar. Nada foi enviado.' };
      }

      // 5: lotes.
      phase = 'enviar';
      const rows = splitDatabase(prepared);
      const batches = buildBatches(groupByTable(rows), deps.batchLimits);
      let sentRows = 0;
      progress('enviar', 0, rows.length, 'Enviando os dados');
      for (const batch of batches) {
        await sendBatch(batch, n => { sentRows += n; progress('enviar', sentRows, rows.length, 'Enviando os dados'); });
      }

      // 6: totais.
      phase = 'totais';
      progress('totais', 0, 1, 'Conferindo os totais');
      const expected = expectedTotals(prepared);
      const got = await deps.importFinish(deps.workshopId, false);
      const differences = compareTotals(expected, got);
      const lines = buildReportLines(expected, got);
      const photos: PhotoReport = { onDisk: 0, alreadyThere: 0, sent: 0, failed: [], missing: [], extras: 0, withoutThumb: 0, totalBytes: 0 };
      const makeReport = (extra: Partial<ImportReport>): ImportReport => {
        const base: ImportReport = { ok: false, backupPath, lines, differences, roundTrip: [], skippedOrders: [], photos, blockers: [], ...extra };
        return base;
      };
      if (differences.length > 0) {
        const report = makeReport({ blockers: differences });
        return { status: 'divergente', report, message: 'Os totais da internet não batem com o arquivo. Não conclua.' };
      }

      // 7: fotos.
      phase = 'fotos';
      const manifest = photoManifest(prepared.workOrders, await deps.photoInventory(deps.dbPath));
      photos.onDisk = manifest.toSend.length;
      photos.missing.push(...manifest.missing);
      photos.extras = manifest.extras.length;
      photos.totalBytes = manifest.totalBytes;
      await sendPhotos(manifest.toSend, photos);

      // 8: volta completa.
      phase = 'volta';
      progress('volta', 0, 1, 'Lendo de volta da internet');
      const back = await readBack();
      const diffs = roundTripDiff(prepared, back.db);

      // 9: o arquivo mudou durante o envio?
      phase = 'arquivo';
      const after = await deps.readMeta(deps.dbPath);
      if (after.revision !== startRevision) {
        return { status: 'arquivo_mudou', message: 'O arquivo do banco foi alterado por outro computador durante o envio. Não conclua: apague o que foi enviado e comece de novo.' };
      }

      // 10: relatório.
      const blockers: string[] = [];
      if (back.skippedOrders.length > 0) blockers.push(`${back.skippedOrders.length} ordem(ns) de serviço não voltaram completas da internet.`);
      for (const d of diffs) {
        const n = d.different.length + d.missing.length + d.extra.length;
        blockers.push(`Depois de enviar, ${n} registro(s) ficaram diferentes na internet (${d.collection}).`);
      }
      if (photos.failed.length > 0) blockers.push(`${photos.failed.length} foto(s) não subiram. Envie de novo.`);
      const report = makeReport({ ok: blockers.length === 0, roundTrip: diffs, skippedOrders: back.skippedOrders, blockers });
      if (!report.ok) return { status: 'divergente', report, message: 'A conferência encontrou diferenças. Não conclua.' };
      return { status: 'pronto', report, session: { ready: true, report, db, revision: startRevision } };
    } catch (e) {
      return { status: 'erro', phase, message: errText(e) };
    }
  }

  /** Passos 10 (final) e 11: conclui na nuvem e lacra o arquivo. Só com uma sessão pronta. */
  async function commit(session: ImportSession): Promise<CommitResult> {
    if (!session.ready || !session.report.ok) return { status: 'recusado', message: 'A conferência não está completa. Não é possível concluir.' };
    try {
      const now = await deps.readMeta(deps.dbPath);
      if (now.revision !== session.revision) {
        return { status: 'arquivo_mudou', message: 'O arquivo do banco foi alterado depois da conferência. Não conclua: apague o que foi enviado e comece de novo.' };
      }
      await deps.importFinish(deps.workshopId, true);
    } catch (e) {
      return { status: 'erro', message: errText(e) };
    }
    // A nuvem já concluiu. Daqui em diante falha no arquivo não desfaz nada.
    const at = deps.now();
    const newRevision = deps.newId();
    const content = buildSealedContent(session.db, session.revision, { workshopId: deps.workshopId, at, newRevision });
    try {
      const res = await deps.saveDatabase(deps.dbPath, content, session.revision);
      if (res.status === 'ok') return { status: 'concluido', sealedRevision: newRevision };
      return { status: 'concluido_sem_lacre', message: res.status === 'conflict'
        ? 'A internet está pronta, mas o arquivo mudou e não foi lacrado. Não use o arquivo antigo como banco.'
        : `A internet está pronta, mas não consegui lacrar o arquivo. ${res.message ?? ''}`.trim() };
    } catch (e) {
      return { status: 'concluido_sem_lacre', message: `A internet está pronta, mas não consegui lacrar o arquivo. ${errText(e)}` };
    }
  }

  /** "Apagar e recomeçar". */
  async function reset(): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      await deps.importReset(deps.workshopId);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: errText(e) };
    }
  }

  return { run, commit, reset };
}
