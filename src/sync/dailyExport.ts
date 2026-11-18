import { uploadToDrive } from '../services/googleDrive';
import type { DatabaseSchema } from '../types';
import { pullAllRows } from './fullPull';
import { exportV5, joinDatabaseReport } from './split';
import type { Transport } from './syncEngine';

// Cópia diária (docs/NUVEM-PR9.md): a fonte é o servidor. `pullAllRows` + `joinDatabaseReport` + `exportV5` geram um
// banco v5 que o app antigo abre. Relógio, ids e I/O entram por `DailyExportDeps`.

const HOUR_MS = 3_600_000;
/** Cópia é devida quando a última tem mais de 20 h (ou nunca houve). */
export const EXPORT_DUE_HOURS = 20;
/** Aviso na tela depois de 2 dias sem cópia. */
export const EXPORT_WARN_DAYS = 2;

const toMs = (v: string | Date | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const ms = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
};

/** true se `lastExportAt` está vazio, ilegível ou tem MAIS de 20 h. Exatamente 20 h ainda não é devida. */
export function isExportDue(lastExportAt: string | Date | null | undefined, now: string | Date): boolean {
  const last = toMs(lastExportAt);
  const cur = toMs(now);
  if (last === null || cur === null) return true;
  return cur - last > EXPORT_DUE_HOURS * HOUR_MS;
}

/** Aviso para o Dono (pt-BR simples) com MAIS de 2 dias sem cópia; null se está em dia. Sem cópia nenhuma também avisa. */
export function exportWarning(lastExportAt: string | Date | null | undefined, now: string | Date): string | null {
  const last = toMs(lastExportAt);
  const cur = toMs(now);
  if (last === null) return 'Ainda não foi feita nenhuma cópia de segurança. Toque em "Fazer cópia agora".';
  if (cur === null) return null;
  const diff = cur - last;
  if (diff <= EXPORT_WARN_DAYS * 24 * HOUR_MS) return null;
  const days = Math.floor(diff / (24 * HOUR_MS));
  return `A última cópia de segurança foi há ${days} dias. Faça uma cópia agora.`;
}

export interface DriveConfig {
  accessToken: string;
  apiKey: string;
  /** Troca de `uploadToDrive` (testes). */
  upload?: typeof uploadToDrive;
}

export interface DailyExportDeps {
  transport: Pick<Transport, 'pull'>;
  workshopId: string;
  /** Quem fez a cópia (nome do PC); vai em `meta.savedBy`. */
  savedBy: string;
  now(): string;
  newId(): string;
  /** `save_daily_export`: grava e devolve o caminho. */
  saveDailyExport(content: string): Promise<string>;
  /** Grava `last_export_at` na nuvem. */
  markExported(at: string): Promise<void>;
  /** Presente só se o Drive está configurado. */
  drive?: DriveConfig | null;
}

export type DriveStatus = 'enviado' | 'nao_configurado' | 'falhou';

export type DailyExportResult =
  | {
    status: 'ok';
    path: string;
    at: string;
    drive: DriveStatus;
    driveError?: string;
    /** Falha ao gravar `last_export_at` (a cópia foi feita mesmo assim). */
    markError?: string;
    /** OS que não casaram na leitura: a cópia sai SEM elas, e a tela deve avisar. */
    skippedOrders: string[];
  }
  | { status: 'erro'; message: string };

const errText = (e: unknown): string => (e instanceof Error && e.message ? e.message : String(e));

/** Nome do arquivo no Drive: `oficinapro-nuvem-AAAAMMDD-HHMMSS.json` (UTC, a partir do relógio injetado). */
export const driveFileName = (iso: string): string =>
  `oficinapro-nuvem-${iso.replace(/\.\d+Z$/, 'Z').replace(/[-:]/g, '').replace('T', '-').replace('Z', '')}.json`;

export async function runDailyExport(deps: DailyExportDeps): Promise<DailyExportResult> {
  let content: string;
  let skippedOrders: string[];
  try {
    let rep = joinDatabaseReport(await pullAllRows(deps.transport, deps.workshopId));
    if (rep.skippedOrders.length > 0) rep = joinDatabaseReport(await pullAllRows(deps.transport, deps.workshopId));
    skippedOrders = rep.skippedOrders;
    const at = deps.now();
    const db: DatabaseSchema = exportV5(rep.db, { savedAt: at, savedBy: deps.savedBy, revision: deps.newId() });
    content = JSON.stringify(db);
  } catch (e) {
    console.error('Cópia diária: leitura da internet falhou', e); // detalhe técnico só no console
    return { status: 'erro', message: 'Não consegui ler os dados da internet para fazer a cópia. Confira a conexão e tente de novo.' };
  }

  let path: string;
  try {
    path = await deps.saveDailyExport(content);
  } catch (e) {
    console.error('Cópia diária: gravação no computador falhou', e); // detalhe técnico só no console
    return { status: 'erro', message: 'Não consegui gravar a cópia neste computador. Confira se há espaço no disco e tente de novo.' };
  }

  const at = deps.now();
  const out: Extract<DailyExportResult, { status: 'ok' }> = { status: 'ok', path, at, drive: 'nao_configurado', skippedOrders };

  if (deps.drive) {
    try {
      await (deps.drive.upload ?? uploadToDrive)(driveFileName(at), content, deps.drive.accessToken, deps.drive.apiKey);
      out.drive = 'enviado';
    } catch (e) {
      out.drive = 'falhou';
      out.driveError = errText(e);
    }
  }

  // Cópia sem alguma OS não conta como "cópia do dia": o aviso de cópia atrasada continua valendo.
  if (skippedOrders.length > 0) return out;
  try {
    await deps.markExported(at);
  } catch (e) {
    out.markError = errText(e);
  }
  return out;
}
