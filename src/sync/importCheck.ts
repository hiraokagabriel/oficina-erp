import type { DatabaseSchema, WorkOrder } from '../types';
import { Money } from '../utils/helpers';
import { stable } from '../services/osEditMerge';
import { splitDatabase } from './split';
import type { CloudRow, CloudTable, CollectionKey } from './types';

// Conferências puras da importação para a nuvem (docs/NUVEM-PR9.md). Sem I/O, sem relógio.
// Entrada: o resultado de `prepareForCloud`. Textos em pt-BR simples (o Dono lê na tela).

type Collections = Omit<DatabaseSchema, 'meta'>;
type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Mesma ordem do SQL (`import_rows` / `import_finish`). */
export const IMPORT_TABLES: readonly CloudTable[] = [
  'work_orders', 'work_order_finance', 'work_order_costs', 'ledger', 'clients',
  'catalog_parts', 'catalog_services', 'catalog_prices', 'catalog_costs', 'technicians',
  'appointments', 'audit_log', 'settings',
];

const TABLE_LABEL: Record<CloudTable, string> = {
  work_orders: 'Ordens de serviço', work_order_finance: 'Valores das OS', work_order_costs: 'Custos das OS',
  ledger: 'Lançamentos', clients: 'Clientes', catalog_parts: 'Peças do catálogo',
  catalog_services: 'Serviços do catálogo', catalog_prices: 'Preços do catálogo', catalog_costs: 'Custos do catálogo',
  technicians: 'Técnicos', appointments: 'Agendamentos', audit_log: 'Auditoria', settings: 'Configurações',
};

export const COLLECTION_LABEL: Record<CollectionKey, string> = {
  workOrders: 'Ordens de serviço', ledger: 'Lançamentos', clients: 'Clientes', catalogParts: 'Peças do catálogo',
  catalogServices: 'Serviços do catálogo', catalogTechnicians: 'Técnicos', appointments: 'Agendamentos',
  auditLog: 'Auditoria', settings: 'Configurações',
};

// ---------- checkImportable ----------

export interface ImportProblem {
  collection: CollectionKey;
  /** Id do registro; vazio quando o problema é justamente o id ausente. */
  id: string;
  reason: string;
}

/** Texto de uma linha da lista mostrada ao Dono. */
export const describeProblem = (p: ImportProblem): string =>
  `${COLLECTION_LABEL[p.collection]}${p.id ? ` (${p.id})` : ''}: ${p.reason}`;

const show = (v: unknown): string => {
  if (typeof v === 'string') return `"${v.length > 20 ? `${v.slice(0, 20)}...` : v}"`;
  if (typeof v === 'number') return String(v);
  return typeof v === 'object' ? 'um objeto' : String(v);
};

/** Mensagem se o valor não serve como centavos; null se está bom. Ausente só passa se `required` for falso. */
function moneyIssue(v: unknown, required: boolean): string | null {
  if (v === undefined || v === null) return required ? 'valor ausente' : null;
  if (typeof v === 'string') return `o valor está em texto (${show(v)})`;
  if (typeof v !== 'number') return `o valor não é um número (${show(v)})`;
  if (!Number.isFinite(v)) return 'o valor não é um número válido';
  if (!Number.isInteger(v)) return `o valor não está em centavos inteiros (${v})`;
  return null;
}

/** Procura NUL (`\u0000`) em chaves e textos, em qualquer profundidade. */
function hasNul(v: unknown): boolean {
  if (typeof v === 'string') return v.includes('\u0000');
  if (Array.isArray(v)) return v.some(hasNul);
  if (isRec(v)) return Object.entries(v).some(([k, x]) => k.includes('\u0000') || hasNul(x));
  return false;
}

const idOf = (r: unknown): string => (isRec(r) && typeof r.id === 'string' ? r.id : '');

/** Caminho legível do campo de dinheiro, para a mensagem. */
function osMoneyProblems(os: Rec): string[] {
  const out: string[] = [];
  const check = (label: string, v: unknown, required = false) => {
    const m = moneyIssue(v, required);
    if (m) out.push(`${label}: ${m}`);
  };
  check('total', os.total);
  check('custo total', os.totalCost);
  check('lucro', os.profit);
  check('adiantamento antigo', os.advanceAmount);
  if (isRec(os.installmentConfig)) {
    const ic = os.installmentConfig;
    check('parcelamento, total', ic.totalAmount);
    check('parcelamento, valor da parcela', ic.installmentAmount);
    check('parcelamento, última parcela', ic.lastInstallmentAmount);
  }
  for (const [label, list] of [['peça', os.parts], ['serviço', os.services]] as const) {
    if (!Array.isArray(list)) continue;
    list.forEach((it, i) => {
      if (!isRec(it)) return;
      check(`${label} ${i + 1}, preço`, it.price);
      check(`${label} ${i + 1}, custo`, it.cost);
    });
  }
  if (Array.isArray(os.advances)) {
    os.advances.forEach((a, i) => check(`adiantamento ${i + 1}`, isRec(a) ? a.amount : undefined, true));
  }
  return out;
}

/** Lista de problemas que impedem a importação. Vazia = pode importar. */
export function checkImportable(prepared: Collections): ImportProblem[] {
  const problems: ImportProblem[] = [];
  const add = (collection: CollectionKey, id: string, reason: string) => problems.push({ collection, id, reason });

  const lists: [CollectionKey, unknown[]][] = [
    ['workOrders', prepared.workOrders], ['ledger', prepared.ledger], ['clients', prepared.clients],
    ['catalogParts', prepared.catalogParts], ['catalogServices', prepared.catalogServices],
    ['catalogTechnicians', prepared.catalogTechnicians], ['appointments', prepared.appointments],
    ['auditLog', prepared.auditLog],
  ];

  for (const [coll, list] of lists) {
    const seen = new Set<string>();
    const reported = new Set<string>();
    list.forEach((rec, i) => {
      const id = idOf(rec);
      if (id.trim() === '') {
        add(coll, '', `sem identificador (registro nº ${i + 1} da lista)`);
      } else if (seen.has(id)) {
        if (!reported.has(id)) add(coll, id, 'identificador repetido');
        reported.add(id);
      } else seen.add(id);
      if (hasNul(rec)) add(coll, id, 'tem um caractere inválido (nulo) em algum texto');

      if (coll === 'workOrders' && isRec(rec)) for (const m of osMoneyProblems(rec)) add(coll, id, m);
      if (coll === 'ledger' && isRec(rec)) {
        const m = moneyIssue(rec.amount, true);
        if (m) add(coll, id, `valor: ${m}`);
        if (rec.type !== 'CREDIT' && rec.type !== 'DEBIT') add(coll, id, `tipo inválido (${show(rec.type)}); deve ser entrada ou saída`);
      }
      if ((coll === 'catalogParts' || coll === 'catalogServices') && isRec(rec)) {
        const p = moneyIssue(rec.price, false);
        if (p) add(coll, id, `preço: ${p}`);
        const c = moneyIssue(rec.cost, false);
        if (c) add(coll, id, `custo: ${c}`);
      }
    });
  }
  if (hasNul(prepared.settings)) add('settings', 'main', 'tem um caractere inválido (nulo) em algum texto');
  return problems;
}

// ---------- expectedTotals / compareTotals ----------

/** Mesma forma do retorno de `import_finish`. `state` só vem do servidor (o esperado do arquivo não tem). */
export interface ImportTotals {
  counts: Record<CloudTable, number>;
  ledgerSignedCents: number;
  osTotalCents: number;
  paidEntries: number;
  advancesCents: number;
  state?: 'vazio' | 'importando' | 'concluido';
}

/** Totais de uma oficina sem nenhuma linha ("Começar sem dados"). */
export function emptyTotals(): ImportTotals {
  const counts = Object.fromEntries(IMPORT_TABLES.map(t => [t, 0])) as Record<CloudTable, number>;
  return { counts, ledgerSignedCents: 0, osTotalCents: 0, paidEntries: 0, advancesCents: 0 };
}

const cents = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Totais que o servidor deve devolver depois do envio. Mesma regra do SQL: tipo desconhecido vale 0. */
export function expectedTotals(prepared: Collections): ImportTotals {
  const rows = splitDatabase(prepared);
  const counts = Object.fromEntries(IMPORT_TABLES.map(t => [t, 0])) as Record<CloudTable, number>;
  let ledgerSignedCents = 0;
  let osTotalCents = 0;
  let paidEntries = 0;
  let advancesCents = 0;
  for (const r of rows) {
    counts[r.table] += 1;
    const d = isRec(r.data) ? r.data : {};
    if (r.table === 'ledger') {
      if (d.type === 'CREDIT') ledgerSignedCents += cents(d.amount);
      else if (d.type === 'DEBIT') ledgerSignedCents -= cents(d.amount);
      const pd = d.paymentDate;
      if (pd !== undefined && pd !== null && pd !== '') paidEntries += 1;
    } else if (r.table === 'work_order_finance') {
      osTotalCents += cents(d.total);
      if (Array.isArray(d.advances)) for (const a of d.advances) advancesCents += cents(isRec(a) ? a.amount : undefined);
    }
  }
  return { counts, ledgerSignedCents, osTotalCents, paidEntries, advancesCents };
}

/** Diferenças entre o esperado (arquivo) e o devolvido pelo servidor. Vazia = tudo igual. */
export function compareTotals(expected: ImportTotals, got: ImportTotals): string[] {
  const out: string[] = [];
  for (const t of IMPORT_TABLES) {
    const e = expected.counts[t] ?? 0;
    const g = got.counts?.[t] ?? 0;
    if (e !== g) out.push(`${TABLE_LABEL[t]}: o arquivo tem ${e}, a internet tem ${g}.`);
  }
  const money: [string, number, number][] = [
    ['Saldo dos lançamentos', expected.ledgerSignedCents, got.ledgerSignedCents],
    ['Soma dos totais das OS', expected.osTotalCents, got.osTotalCents],
    ['Soma dos adiantamentos', expected.advancesCents, got.advancesCents],
  ];
  for (const [label, e, g] of money) {
    if (e !== g) out.push(`${label}: o arquivo tem ${Money.format(e)}, a internet tem ${Money.format(g ?? 0)}.`);
  }
  if (expected.paidEntries !== got.paidEntries) {
    out.push(`Lançamentos pagos: o arquivo tem ${expected.paidEntries}, a internet tem ${got.paidEntries ?? 0}.`);
  }
  return out;
}

// ---------- buildBatches ----------

export interface BatchLimits { maxRows: number; maxBytes: number }
export const DEFAULT_BATCH_LIMITS: BatchLimits = { maxRows: 500, maxBytes: 1_000_000 };

export type RowsByTable = Partial<Record<CloudTable, CloudRow[]>>;

export function groupByTable(rows: CloudRow[]): RowsByTable {
  const out: RowsByTable = {};
  for (const r of rows) (out[r.table] ??= []).push(r);
  return out;
}

const encoder = new TextEncoder();
const byteSize = (r: CloudRow): number => encoder.encode(JSON.stringify(r)).length;

/**
 * Lotes de uma tabela só, na ordem de `IMPORT_TABLES`, com até `maxRows` linhas e `maxBytes` de JSON.
 * Linha maior que o limite vai sozinha. A ordem das linhas dentro da tabela é mantida.
 */
export function buildBatches(rowsByTable: RowsByTable, limits: BatchLimits = DEFAULT_BATCH_LIMITS): CloudRow[][] {
  const batches: CloudRow[][] = [];
  for (const t of IMPORT_TABLES) {
    const rows = rowsByTable[t];
    if (!rows || rows.length === 0) continue;
    let cur: CloudRow[] = [];
    let bytes = 0;
    for (const r of rows) {
      const size = byteSize(r);
      if (cur.length > 0 && (cur.length >= limits.maxRows || bytes + size > limits.maxBytes)) {
        batches.push(cur);
        cur = [];
        bytes = 0;
      }
      cur.push(r);
      bytes += size;
    }
    if (cur.length > 0) batches.push(cur);
  }
  return batches;
}

// ---------- photoManifest ----------

/** Um arquivo de foto achado na pasta `fotos` do disco. */
export interface PhotoFileInfo { osId: string; photoId: string; bytes: number; hasThumb: boolean }
export interface PhotoToSend extends PhotoFileInfo { osNumber: number }
export interface PhotoMissing { osId: string; osNumber: number; photoId: string; reason: string }
export interface PhotoManifest {
  /** Fotos dos metadados que existem no disco. */
  toSend: PhotoToSend[];
  /** Fotos dos metadados sem arquivo: vão para o relatório, não bloqueiam. */
  missing: PhotoMissing[];
  /** Arquivos no disco sem metadado: ignorados. */
  extras: PhotoFileInfo[];
  /** Soma dos bytes das fotos a enviar (original; a miniatura não entra na conta). */
  totalBytes: number;
}

const photoKey = (osId: string, photoId: string): string => `${osId}\u0001${photoId}`;

export function photoManifest(workOrders: Pick<WorkOrder, 'id' | 'osNumber' | 'photos'>[], inventory: PhotoFileInfo[]): PhotoManifest {
  const disk = new Map<string, PhotoFileInfo>();
  for (const f of inventory) disk.set(photoKey(f.osId, f.photoId), f);

  const toSend: PhotoToSend[] = [];
  const missing: PhotoMissing[] = [];
  const claimed = new Set<string>();
  let totalBytes = 0;
  for (const os of workOrders) {
    for (const p of os.photos ?? []) {
      const k = photoKey(os.id, p.id);
      if (claimed.has(k)) continue;
      claimed.add(k);
      const f = disk.get(k);
      if (!f) {
        missing.push({ osId: os.id, osNumber: os.osNumber, photoId: p.id, reason: 'arquivo não encontrado na pasta de fotos' });
        continue;
      }
      toSend.push({ ...f, osNumber: os.osNumber });
      totalBytes += f.bytes;
    }
  }
  const extras = [...disk.entries()].filter(([k]) => !claimed.has(k)).map(([, f]) => f);
  return { toSend, missing, extras, totalBytes };
}

// ---------- roundTripDiff ----------

export interface CollectionDiff {
  collection: CollectionKey;
  /** Existem dos dois lados, com conteúdo diferente. */
  different: string[];
  /** Só no arquivo (faltou na internet). */
  missing: string[];
  /** Só na internet (sobrou). */
  extra: string[];
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Compara por coleção, por id. Só devolve coleções com diferença; vazio = volta idêntica. */
export function roundTripDiff(local: Collections, remote: Collections): CollectionDiff[] {
  const lists: [CollectionKey, keyof Collections][] = [
    ['workOrders', 'workOrders'], ['ledger', 'ledger'], ['clients', 'clients'], ['catalogParts', 'catalogParts'],
    ['catalogServices', 'catalogServices'], ['catalogTechnicians', 'catalogTechnicians'],
    ['appointments', 'appointments'], ['auditLog', 'auditLog'],
  ];
  const out: CollectionDiff[] = [];
  const index = (list: unknown): Map<string, string> => {
    const m = new Map<string, string>();
    if (Array.isArray(list)) for (const r of list) m.set(idOf(r), stable(r));
    return m;
  };
  const diff = (collection: CollectionKey, l: Map<string, string>, r: Map<string, string>) => {
    const different: string[] = [];
    const missing: string[] = [];
    const extra: string[] = [];
    for (const [id, s] of l) {
      const o = r.get(id);
      if (o === undefined) missing.push(id);
      else if (o !== s) different.push(id);
    }
    for (const id of r.keys()) if (!l.has(id)) extra.push(id);
    if (different.length + missing.length + extra.length > 0) {
      out.push({ collection, different: different.sort(cmp), missing: missing.sort(cmp), extra: extra.sort(cmp) });
    }
  };
  for (const [coll, key] of lists) diff(coll, index(local[key]), index(remote[key]));
  diff('settings', new Map([['main', stable(local.settings)]]), new Map([['main', stable(remote.settings)]]));
  return out;
}
