import type { CatalogItem, WorkOrder } from '../types';
import { stable } from '../services/osEditMerge';
import type { Role } from '../services/permissions';
import { splitCatalogItem, splitWorkOrder } from './split';
import type { CloudRow, CloudTable, CollectionKey } from './types';

// Fila de envio (outbox) como funções puras (docs/NUVEM-SPEC.md seção 4, "Outbox" e "Push").
// Nada de IndexedDB, relógio ou aleatoriedade aqui: relógio e id entram por parâmetro.
//
// REGRAS DE USO (contrato com o motor do PR 4):
// - Invariante: por `(actor, collection, recordId)` há no máximo 1 op fora de `sending`. A op `sending` está no ar
//   e não é trocada; edição nova entra ao lado dela e, quando a `sending` volta (rede, erro, conflito), as duas
//   se fundem (base/baseVersions/opId da antiga, value/kind da nova). `pendingFor` manda 1 op por registro por lote.
// - PULL: ao aplicar mudança remota em registro que tem op pendente (não `sending`), o pull chama `rebaseOp(op,
//   serverBase, serverVersions)`. Sem isso a base fica velha e uma edição que volte ao valor antigo é pulada
//   por `toPushGroups` (linha igual à base), perdendo a mudança.
// - `denied`/`failed`: o provider reverte o registro à `base` (`dropOp` devolve a base), guarda cópia de recuperação
//   e mostra toast. `enqueue` NÃO funde em op `denied`/`failed` (a mudança proibida seria reenviada): reverta antes.
// - `toPushGroups` não gera group para delete sem base; o motor só chama `markSending` nas ops que têm group.

export interface OutboxOp {
  opId: string;
  actor: string;
  deviceId: string;
  collection: CollectionKey;
  recordId: string;
  kind: 'upsert' | 'delete';
  /** Registro como o servidor o tinha quando a edição começou (null = novo). */
  base: unknown | null;
  /** Versões conhecidas por linha: `main`, `fin` (finance/preço) e `cost`. 0 = linha nova. */
  baseVersions: { main: number; fin?: number; cost?: number };
  value: unknown | null;
  createdAt: string;
  attempts: number;
  state: 'pending' | 'sending' | 'conflict' | 'denied' | 'failed';
  lastError?: string;
}

export interface OutboxDeps { now: () => string; newId: () => string }

export interface NewOpInput {
  actor: string;
  deviceId: string;
  collection: CollectionKey;
  recordId: string;
  kind: 'upsert' | 'delete';
  base: unknown | null;
  baseVersions: OutboxOp['baseVersions'];
  value: unknown | null;
}

/** Op nova em `pending`, com id e hora injetados. */
export function makeOp(input: NewOpInput, deps: OutboxDeps): OutboxOp {
  return { ...input, opId: deps.newId(), createdAt: deps.now(), attempts: 0, state: 'pending' };
}

type RecordKey = { actor: string; collection: CollectionKey; recordId: string };
const sameRecord = (a: RecordKey, b: RecordKey): boolean =>
  a.actor === b.actor && a.collection === b.collection && a.recordId === b.recordId;

const mergeable = (o: OutboxOp): boolean => o.state === 'pending' || o.state === 'conflict';

/** Funde a op mais nova na antiga: base/baseVersions/opId/createdAt da antiga; value/kind da nova. */
const fold = (older: OutboxOp, newer: Pick<OutboxOp, 'kind' | 'value'>, state: OutboxOp['state']): OutboxOp => {
  const r: OutboxOp = { ...older, kind: newer.kind, value: newer.value, state };
  if (state === 'pending') delete r.lastError;
  return r;
};

/** Registro que nasceu offline e foi excluído antes de ir ao servidor: nada a enviar. */
const bornAndDied = (older: OutboxOp, newer: Pick<OutboxOp, 'kind'>): boolean =>
  newer.kind === 'delete' && older.kind === 'upsert' && older.baseVersions.main === 0;

/**
 * Coloca a op na fila com coalescência: 1 op por registro fora de `sending`. A nova troca `value`/`kind` e mantém
 * `base`, `baseVersions`, `opId` e `createdAt` da existente. Nasceu e morreu offline: some (menos se há op `sending`
 * do registro, que pode já ter chegado ao servidor: aí vira delete). Op `denied`/`failed` não é fundida: a nova
 * entra ao lado e o provider deve ter revertido o registro antes (`dropOp`).
 */
export function enqueue(ops: readonly OutboxOp[], op: OutboxOp): OutboxOp[] {
  const idx = ops.findIndex(o => sameRecord(o, op) && mergeable(o));
  if (idx < 0) return [...ops, op];
  const ex = ops[idx];
  const inFlight = ops.some(o => sameRecord(o, op) && o.state === 'sending');
  if (bornAndDied(ex, op) && !inFlight) return ops.filter((_, i) => i !== idx);
  const merged = fold(ex, op, 'pending');
  merged.attempts = 0;
  return ops.map((o, i) => (i === idx ? merged : o));
}

/** Ops a enviar agora: do usuário atual, `pending`, sem outra do registro no ar, no máximo 1 por registro. */
export function pendingFor(ops: readonly OutboxOp[], actor: string): OutboxOp[] {
  const out: OutboxOp[] = [];
  for (const o of ops) {
    if (o.actor !== actor || o.state !== 'pending') continue;
    if (ops.some(s => s.state === 'sending' && sameRecord(s, o))) continue;
    if (out.some(p => sameRecord(p, o))) continue;
    out.push(o);
  }
  return out;
}

/** Marca as ops como `sending` (e conta a tentativa). */
export function markSending(ops: readonly OutboxOp[], opIds: readonly string[]): OutboxOp[] {
  const ids = new Set(opIds);
  return ops.map(o => (ids.has(o.opId) ? { ...o, state: 'sending', attempts: o.attempts + 1 } : o));
}

export const removeOp = (ops: readonly OutboxOp[], opId: string): OutboxOp[] => ops.filter(o => o.opId !== opId);

/**
 * Remove a op (denied/failed/descartada) e devolve a `base` para o provider reverter o registro
 * (null = o registro era novo: apagar da tela). Reverter, avisar com toast e gravar a cópia de recuperação é do provider.
 */
export function dropOp(
  ops: readonly OutboxOp[], opId: string,
): { ops: OutboxOp[]; reverted: { collection: CollectionKey; recordId: string; base: unknown | null; value: unknown | null } | null } {
  const op = ops.find(o => o.opId === opId);
  if (!op) return { ops: [...ops], reverted: null };
  return { ops: removeOp(ops, opId), reverted: { collection: op.collection, recordId: op.recordId, base: op.base, value: op.value } };
}

/** Pull aplicou mudança remota no registro: a base e as versões da op passam a ser as do servidor. */
export function rebaseOp(op: OutboxOp, serverBase: unknown | null, serverVersions: OutboxOp['baseVersions']): OutboxOp {
  return { ...op, base: serverBase, baseVersions: serverVersions };
}

/** Depois de resolver um conflito (`mergeRecord`): a op volta a `pending` sobre a base e as versões do servidor. */
export function resolveOp(
  ops: readonly OutboxOp[], opId: string, next: { base: unknown | null; baseVersions: OutboxOp['baseVersions']; value: unknown | null },
): OutboxOp[] {
  return ops.map(o => {
    if (o.opId !== opId) return o;
    const r: OutboxOp = { ...o, ...next, state: 'pending' };
    delete r.lastError;
    return r;
  });
}

// ---------- push ----------

export interface PushRow {
  table: CloudTable;
  id: string;
  /** Versão base conhecida da linha; 0 = nova. */
  version: number;
  data: unknown;
  deleted?: boolean;
  os_id?: string | null;
}

/** `key` = `opId`: o resultado volta casado por ele. */
export interface PushGroup { key: string; rows: PushRow[] }

const TABLE_OF: Record<Exclude<CollectionKey, 'workOrders' | 'catalogParts' | 'catalogServices'>, CloudTable> = {
  ledger: 'ledger', clients: 'clients', catalogTechnicians: 'technicians', appointments: 'appointments',
  auditLog: 'audit_log', settings: 'settings',
};

type VersionSlot = 'main' | 'fin' | 'cost';
const SLOT: Record<CloudTable, VersionSlot> = {
  work_orders: 'main', ledger: 'main', clients: 'main', catalog_parts: 'main', catalog_services: 'main',
  technicians: 'main', appointments: 'main', audit_log: 'main', settings: 'main',
  work_order_finance: 'fin', catalog_prices: 'fin',
  work_order_costs: 'cost', catalog_costs: 'cost',
};

const pure = (v: unknown): unknown => JSON.parse(JSON.stringify(v ?? {}));

/** Linhas da nuvem de um registro, para o papel. Só o Dono tem linhas de custo. */
function rowsOf(op: OutboxOp, value: unknown, role: Role): CloudRow[] {
  const hadCost = (op.baseVersions.cost ?? 0) > 0;
  if (op.collection === 'workOrders') {
    const s = splitWorkOrder(value as WorkOrder, role);
    const rows: CloudRow[] = [{ table: 'work_orders', id: op.recordId, data: s.main }];
    if (s.fin) rows.push({ table: 'work_order_finance', id: op.recordId, data: s.fin });
    if (role === 'dono' && (s.cost || hadCost)) {
      // Custos que sumiram: a linha existe no servidor, então vai vazia em vez de ficar velha.
      rows.push({ table: 'work_order_costs', id: op.recordId, data: s.cost ?? { costs: {} } });
    }
    return rows;
  }
  if (op.collection === 'catalogParts' || op.collection === 'catalogServices') {
    const kind = op.collection === 'catalogParts' ? 'part' : 'service';
    const s = splitCatalogItem(kind, value as CatalogItem, role);
    const rows: CloudRow[] = [s.main];
    if (s.price) rows.push(s.price);
    if (s.cost) rows.push(s.cost);
    else if (role === 'dono' && hadCost) {
      // Custo apagado: `cost: null` = "não informado" (a junção trata null como sem custo).
      rows.push({ table: 'catalog_costs', id: `${kind}:${op.recordId}`, data: { kind, item_id: op.recordId, cost: null } });
    }
    return rows;
  }
  const row: CloudRow = { table: TABLE_OF[op.collection], id: op.recordId, data: pure(value) };
  if (op.collection === 'ledger') row.os_id = null; // lançamento do cliente nunca pertence a OS
  return [row];
}

const versionOf = (op: OutboxOp, table: CloudTable): number => op.baseVersions[SLOT[table]] ?? 0;

/**
 * Monta o `groups` de `sync_push` (um group por op; OS manda as 2-3 linhas juntas). Só emite linhas que o papel
 * enxerga: o Mecânico nunca emite finance/costs, a Recepção nunca emite costs. Em upsert de registro que já existe,
 * linha igual à da base não vai (menos conflito e menos versão à toa). Delete grava `deleted: true` com os dados da
 * base, só nas linhas de versão conhecida (> 0); delete sem base ou sem linha conhecida não gera group.
 */
export function toPushGroups(ops: readonly OutboxOp[], role: Role): PushGroup[] {
  const groups: PushGroup[] = [];
  for (const op of ops) {
    if (op.kind === 'delete') {
      if (op.base === null) continue;
      const rows = rowsOf(op, op.base, role)
        .filter(r => versionOf(op, r.table) > 0)
        .map(r => ({ table: r.table, id: r.id, version: versionOf(op, r.table), data: r.data, deleted: true }));
      if (rows.length > 0) groups.push({ key: op.opId, rows });
      continue;
    }
    const baseRows = op.base !== null ? rowsOf(op, op.base, role) : [];
    const rows: PushRow[] = [];
    for (const r of rowsOf(op, op.value, role)) {
      const version = versionOf(op, r.table);
      const old = baseRows.find(b => b.table === r.table && b.id === r.id);
      if (version > 0 && old && stable(old.data) === stable(r.data)) continue;
      const row: PushRow = { table: r.table, id: r.id, version, data: r.data };
      if (r.os_id !== undefined) row.os_id = r.os_id;
      rows.push(row);
    }
    groups.push({ key: op.opId, rows });
  }
  return groups;
}

// ---------- resultado do push ----------

export interface PushVersionRow { table: CloudTable; id: string; version: number }
export interface PushServerRow extends PushVersionRow {
  data: unknown;
  deleted_at: string | null;
  updated_at: string;
  os_id?: string | null;
}

export type PushGroupResult =
  | { key: string; status: 'ok'; rows: PushVersionRow[] }
  | { key: string; status: 'conflict'; rows: PushServerRow[] }
  | { key: string; status: 'denied'; code: string; message: string };

/** Versões por linha, na forma de `baseVersions`, a partir de linhas do servidor. */
export function versionsFromRows(rows: readonly PushVersionRow[], prev: OutboxOp['baseVersions'] = { main: 0 }): OutboxOp['baseVersions'] {
  const v: OutboxOp['baseVersions'] = { ...prev };
  for (const r of rows) v[SLOT[r.table]] = r.version;
  return v;
}

export interface ConfirmedVersions {
  opId: string;
  collection: CollectionKey;
  recordId: string;
  /** Versões já mescladas com as conhecidas antes (linhas que não foram enviadas mantêm a versão). */
  versions: OutboxOp['baseVersions'];
}

export interface ConflictInfo {
  opId: string;
  collection: CollectionKey;
  recordId: string;
  /** Linhas atuais do servidor que o `sync_push` devolveu (só as do group enviado). */
  rows: PushServerRow[];
}

/** Op que volta a `pending` com espera: só reenviar a partir de `nextAttemptAt` (ISO). */
export interface RetryInfo { opId: string; nextAttemptAt: string }

export interface ApplyPushOutcome {
  ops: OutboxOp[];
  confirmed: ConfirmedVersions[];
  conflicts: ConflictInfo[];
  retries: RetryInfo[];
}

export const BACKOFF_BASE_MS = 2000;
export const BACKOFF_MAX_MS = 5 * 60 * 1000;
/** Tentativas antes de desistir de um erro transitório e de uma resposta que não veio. */
export const TRANSIENT_LIMIT = 10;
export const NO_RESPONSE_LIMIT = 50;
/** Espera fixa depois de falha de rede (a falha de rede não conta tentativa; o motor reescalona por conectividade). */
export const NETWORK_RETRY_MS = 5000;

const addMs = (iso: string, ms: number): string => new Date(Date.parse(iso) + ms).toISOString();
export const backoffMs = (attempts: number): number => Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_MAX_MS);

// Erros do `sync_push`: `code` é o sqlstate (ou `nao_encontrado`/`importacao_pendente`) e `message` o texto da exceção.
const DENIED_MESSAGE = /^(mecanico_|money_op_required|ledger_|exclusao_proibida|update_negado|sem_acesso|nao_encontrado)/;
const FAILED_NAMES = new Set(['id_divergente', 'status_invalido', 'tabela_invalida', 'linha_invalida', 'groups_invalido']);

type Verdict = 'denied' | 'failed' | 'wait' | 'retry';
function verdictOf(code: string, message: string): Verdict {
  if (code === 'importacao_pendente') return 'wait';
  if (code === '42501' || code === 'nao_encontrado' || DENIED_MESSAGE.test(message)) return 'denied';
  if (/^(22|23|42)/.test(code) || FAILED_NAMES.has(code) || FAILED_NAMES.has(message)) return 'failed';
  return 'retry'; // 40001, 40P01, 57014, 55P03, 53xxx...: transitório
}

/** Uma op `sending` que voltou: se já há edição mais nova do mesmo registro, as duas se fundem na antiga. */
function absorbNewer(ops: OutboxOp[], opId: string): OutboxOp[] {
  const idx = ops.findIndex(o => o.opId === opId);
  if (idx < 0) return ops;
  const me = ops[idx];
  const j = ops.findIndex((o, i) => i !== idx && sameRecord(o, me) && o.state === 'pending');
  if (j < 0) return ops;
  const newer = ops[j];
  if (me.state === 'pending' && bornAndDied(me, newer)) return ops.filter((_, i) => i !== idx && i !== j);
  const merged = fold(me, newer, me.state);
  return ops.filter((_, i) => i !== j).map(o => (o.opId === opId ? merged : o));
}

/**
 * Aplica o retorno de `sync_push` às ops `sending`:
 * - ok: sai da fila; `confirmed` traz as versões.
 * - conflict: fica `conflict` (a resolução é do `mergeRecord`); `conflicts` traz as linhas do servidor.
 * - erro definitivo de permissão (`42501`, `nao_encontrado`, `mecanico_*`, `money_op_required`, `ledger_*`...): `denied`.
 * - erro definitivo de dados (classes 22, 23, 42; `id_divergente`, `status_invalido`...): `failed`.
 * - `importacao_pendente`, sem resposta e demais códigos (40001, 40P01, 57014, 55P03, 53xxx): `pending` com backoff
 *   (`retries`); passou do limite de tentativas, `failed`.
 * Op que volta e já tem edição mais nova do mesmo registro absorve essa edição (1 op por registro).
 * Ack de op que tinha outra do mesmo registro esperando: a espera herda versões e base do que foi confirmado.
 */
export function applyPushResult(ops: readonly OutboxOp[], results: readonly PushGroupResult[], now: () => string): ApplyPushOutcome {
  const byKey = new Map(results.map(r => [r.key, r]));
  const confirmed: ConfirmedVersions[] = [];
  const conflicts: ConflictInfo[] = [];
  const retries: RetryInfo[] = [];
  const acked: { op: OutboxOp; versions: OutboxOp['baseVersions'] }[] = [];
  const returned: string[] = [];

  const back = (op: OutboxOp, lastError: string, limit: number): OutboxOp => {
    returned.push(op.opId);
    if (op.attempts >= limit) return { ...op, state: 'failed', lastError };
    retries.push({ opId: op.opId, nextAttemptAt: addMs(now(), backoffMs(op.attempts)) });
    return { ...op, state: 'pending', lastError };
  };

  const out = ops.flatMap((op): OutboxOp[] => {
    if (op.state !== 'sending') return [op];
    const res = byKey.get(op.opId);
    if (!res) return [back(op, 'sem_resposta', NO_RESPONSE_LIMIT)];
    if (res.status === 'ok') {
      const versions = versionsFromRows(res.rows, op.baseVersions);
      confirmed.push({ opId: op.opId, collection: op.collection, recordId: op.recordId, versions });
      acked.push({ op, versions });
      return [];
    }
    if (res.status === 'conflict') {
      returned.push(op.opId);
      conflicts.push({ opId: op.opId, collection: op.collection, recordId: op.recordId, rows: res.rows });
      return [{ ...op, state: 'conflict', lastError: 'conflito' }];
    }
    const lastError = res.message || res.code;
    const v = verdictOf(res.code, res.message);
    if (v === 'denied' || v === 'failed') { returned.push(op.opId); return [{ ...op, state: v, lastError }]; }
    return [back(op, lastError, v === 'wait' ? NO_RESPONSE_LIMIT : TRANSIENT_LIMIT)];
  });

  let next = out.map(o => {
    const a = acked.find(x => sameRecord(x.op, o));
    if (!a || o.state !== 'pending') return o;
    return { ...o, baseVersions: a.versions, base: a.op.value ?? a.op.base };
  });
  for (const id of returned) next = absorbNewer(next, id);
  return { ops: next, confirmed, conflicts, retries };
}

/**
 * Falha da chamada inteira (rede, 5xx sem corpo): as ops `sending` voltam a `pending` com espera fixa e NÃO contam
 * tentativa (devolve a que `markSending` somou). Funde edição mais nova do mesmo registro, como `applyPushResult`.
 */
export function applyPushFailure(ops: readonly OutboxOp[], error: string, now: () => string): { ops: OutboxOp[]; retries: RetryInfo[] } {
  const retries: RetryInfo[] = [];
  const ids: string[] = [];
  let next = ops.map((o): OutboxOp => {
    if (o.state !== 'sending') return o;
    ids.push(o.opId);
    retries.push({ opId: o.opId, nextAttemptAt: addMs(now(), NETWORK_RETRY_MS) });
    return { ...o, state: 'pending', attempts: Math.max(0, o.attempts - 1), lastError: error };
  });
  for (const id of ids) next = absorbNewer(next, id);
  return { ops: next, retries };
}
