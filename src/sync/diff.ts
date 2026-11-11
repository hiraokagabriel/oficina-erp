import type { WorkOrder } from '../types';
import { stable } from '../services/osEditMerge';
import { can } from '../services/permissions';
import type { Action, Role } from '../services/permissions';
import type { CollectionKey } from './types';

// Diff dos `setX` e barreira de papel no cliente (docs/NUVEM-SPEC.md seção 4, "Diff dos setX").
// Puro: não muta as entradas nem guarda estado; o provider guarda o `lastSeen` devolvido em `next`.

// ---------- diffById ----------

/** O que o provider guarda por registro entre dois diffs: a referência vista e o JSON estável dela. */
export interface SeenEntry<T> { ref: T; json: string }

export interface DiffResult<T> {
  /** Registros novos ou mudados. `before` = o registro visto antes (null = novo). */
  upserts: { id: string; value: T; before: T | null }[];
  deletes: { id: string; before: T }[];
  /** Novo `lastSeen`: guarde-o depois de enfileirar. */
  next: Map<string, SeenEntry<T>>;
}

/**
 * Compara a coleção atual com o `lastSeen`. Mesma referência: pulada sem serializar. Referência nova:
 * compara pelo JSON estável (ordem de chaves não conta), então `setX` que só recria o objeto não gera op.
 * Id repetido na coleção: vale o último. Coleções sem `id` (settings) entram com id fixo, ex.: `[{ id: 'main', ... }]`.
 */
export function diffById<T extends { id: string }>(
  lastSeen: ReadonlyMap<string, SeenEntry<T>>,
  current: readonly T[],
): DiffResult<T> {
  const next = new Map<string, SeenEntry<T>>();
  const upserts: DiffResult<T>['upserts'] = [];
  const latest = new Map<string, T>();
  for (const item of current) latest.set(item.id, item);

  for (const [id, item] of latest) {
    const seen = lastSeen.get(id);
    if (seen && seen.ref === item) { next.set(id, seen); continue; }
    const json = stable(item);
    if (seen && seen.json === json) { next.set(id, { ref: item, json }); continue; }
    next.set(id, { ref: item, json });
    upserts.push({ id, value: item, before: seen ? seen.ref : null });
  }
  const deletes: DiffResult<T>['deletes'] = [];
  for (const [id, seen] of lastSeen) if (!latest.has(id)) deletes.push({ id, before: seen.ref });
  return { upserts, deletes, next };
}

// ---------- classify ----------

/** `online_only`: vai por `sync_push`, mas só online (lançamento manual do financeiro, decisão 4 do dono). */
export type Classification = 'ok' | 'money_op' | 'denied' | 'online_only';

/** Chaves planas que só o servidor muda (lista do `guard_finance` do SQL). */
export const MONEY_KEYS = [
  'financialId', 'paymentDate', 'paymentMethod', 'advances', 'advanceAmount', 'advanceEntryId', 'installmentConfig',
] as const;

/** Chaves derivadas: não contam (custo/lucro não chegam à Recepção; `profitMargin` é obsoleto). */
const DERIVED_KEYS = new Set<string>(['totalCost', 'profit', 'profitMargin']);

// Ação exigida por chave da OS. Chave fora da lista exige `os.editFields`.
const KEY_ACTION: Record<string, Action> = {
  status: 'os.status', checklist: 'os.inspect', photos: 'os.photos', mileage: 'os.mileage',
  parts: 'os.editItems', services: 'os.editItems',
  clientName: 'os.editClientVehicle', clientPhone: 'os.editClientVehicle', clientId: 'os.editClientVehicle',
  vehicle: 'os.editClientVehicle', vehicleId: 'os.editClientVehicle',
};

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const nz = (v: unknown): unknown => (v === undefined || v === null ? null : v);

/** Parte do dinheiro normalizada como `app.fin_money` (null = ausente; `advances` vazio = ausente; sem `description`). */
function moneyView(os: Partial<WorkOrder>): string {
  const ic = os.installmentConfig;
  let installment: unknown = nz(ic);
  if (isPlainObject(ic)) { const { description, ...rest } = ic; void description; installment = rest; }
  return stable({
    financialId: nz(os.financialId),
    paymentDate: nz(os.paymentDate),
    paymentMethod: nz(os.paymentMethod),
    advances: os.advances ?? [],
    advanceAmount: nz(os.advanceAmount) === 0 ? null : nz(os.advanceAmount),
    advanceEntryId: nz(os.advanceEntryId),
    installmentConfig: installment,
  });
}

/** `OrderItem.price` por id (o `work_order_finance.data.prices` do servidor). */
const pricesOf = (os: WorkOrder): string =>
  stable(Object.fromEntries([...(os.parts ?? []), ...(os.services ?? [])].map(i => [i.id, nz(i.price)])));

/** Espelha `guard_finance`: com receita (financialId/installmentConfig) ou FINALIZADO/ARQUIVADO, total e preços são dinheiro. */
const hasReceipt = (os: WorkOrder): boolean =>
  (typeof os.financialId === 'string' && os.financialId !== '') || isPlainObject(os.installmentConfig); // como jsonb_typeof = 'object'
const isLocked = (os: WorkOrder): boolean => hasReceipt(os) || os.status === 'FINALIZADO' || os.status === 'ARQUIVADO';

/** Espelha as transições de `guard_work_orders`. */
export function statusNeedsMoney(before: WorkOrder, to: WorkOrder['status']): boolean {
  const from = before.status;
  if (from === to) return false;
  if (to === 'FINALIZADO' || (from === 'FINALIZADO' && to !== 'ARQUIVADO')) return true;
  if (from === 'ARQUIVADO') return true;
  return from === 'AGUARDANDO_PAGAMENTO' && hasReceipt(before);
}

const field = (os: WorkOrder, k: string): unknown => (os as unknown as Record<string, unknown>)[k];

function classifyOS(role: Role, before: WorkOrder | null, after: WorkOrder | null): Classification {
  if (after === null) return can(role, 'os.delete') ? 'money_op' : 'denied';

  if (before === null) {
    if (!can(role, 'os.create')) return 'denied';
    // OS nova não nasce com dinheiro gravado nem finalizada (guard_work_orders/guard_finance no insert).
    if (after.status === 'FINALIZADO' || after.status === 'ARQUIVADO') return 'money_op';
    return moneyView(after) !== moneyView({}) ? 'money_op' : 'ok';
  }

  // 1) Permissão por chave mudada (denied vence money_op).
  const moneyKeys = new Set<string>(MONEY_KEYS);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (DERIVED_KEYS.has(k) || moneyKeys.has(k)) continue; // dinheiro é comparado em bloco, normalizado
    if (stable(field(before, k)) === stable(field(after, k))) continue;
    if (!can(role, KEY_ACTION[k] ?? 'os.editFields')) return 'denied';
  }
  const moneyChanged = moneyView(before) !== moneyView(after);
  if (moneyChanged && !can(role, 'os.receive')) return 'denied';

  // 2) Dinheiro: só o servidor grava.
  // Sem `os.seePrices` o cache não tem a finance: não dá para saber se há receita. Sair de AGUARDANDO_PAGAMENTO
  // é barrado (o servidor recusaria com money_op_required se houver receita).
  if (before.status === 'AGUARDANDO_PAGAMENTO' && after.status !== before.status && !can(role, 'os.seePrices')) return 'denied';
  if (moneyChanged) return 'money_op';
  if (statusNeedsMoney(before, after.status)) return 'money_op';
  if (isLocked(before) && (before.total !== after.total || pricesOf(before) !== pricesOf(after))) return 'money_op';
  return 'ok';
}

// Ação por coleção e operação para as coleções que não são OS.
type Op = 'create' | 'update' | 'delete';
const COLLECTION_ACTION: Partial<Record<CollectionKey, Record<Op, Action | null>>> = {
  ledger: { create: 'ledger.create', update: 'ledger.edit', delete: 'ledger.delete' },
  clients: { create: 'clients.create', update: 'clients.edit', delete: 'clients.delete' },
  catalogParts: { create: 'catalog.create', update: 'catalog.edit', delete: 'catalog.delete' },
  catalogServices: { create: 'catalog.create', update: 'catalog.edit', delete: 'catalog.delete' },
  catalogTechnicians: { create: 'technicians.create', update: 'technicians.edit', delete: 'technicians.delete' },
  appointments: { create: 'appointments.create', update: 'appointments.edit', delete: 'appointments.delete' },
  settings: { create: 'settings.edit', update: 'settings.edit', delete: null }, // sem exclusão (só service)
  auditLog: { create: null, update: null, delete: null }, // só trigger/service grava
};

const omitDescription = (v: unknown): string => {
  if (!isPlainObject(v)) return stable(v);
  const { description, ...rest } = v; void description;
  return stable(rest);
};

function classifyLedger(role: Role, before: unknown | null, after: unknown | null, ownerOsId: string | null): Classification {
  const op: Op = before === null ? 'create' : after === null ? 'delete' : 'update';
  const action = COLLECTION_ACTION.ledger?.[op] ?? null;
  if (action === null || !can(role, action)) return 'denied';
  if (op === 'create') return 'online_only';
  if (op === 'delete') return ownerOsId ? 'money_op' : 'online_only';
  const pay = (v: unknown): unknown => nz(isPlainObject(v) ? v.paymentDate : undefined);
  if (stable(pay(before)) !== stable(pay(after))) return 'money_op'; // pagar/estornar é `ledger.toggle`
  if (ownerOsId) return omitDescription(before) === omitDescription(after) ? 'ok' : 'money_op'; // só description é livre (cascata)
  return 'online_only';
}

/**
 * Barra no cliente o que o servidor recusaria. `denied` = erro de programação (reverte + toast).
 * `money_op` = não vai por `sync_push`: precisa da função `money` (online). `online_only` = lançamento manual.
 * `before`/`after` = null para criar/excluir. `ctx.ledgerOsId` = OS dona do lançamento (do `ledgerOwnerIndex` ou
 * `os_id` da linha); sem ele o lançamento conta como manual e o SQL ainda barra o travado por OS.
 */
export function classify(
  role: Role, collection: CollectionKey, before: unknown | null, after: unknown | null,
  ctx?: { ledgerOsId?: string | null },
): Classification {
  if (collection === 'workOrders') return classifyOS(role, before as WorkOrder | null, after as WorkOrder | null);
  if (collection === 'ledger') return classifyLedger(role, before, after, ctx?.ledgerOsId ?? null);
  const op: Op = before === null ? 'create' : after === null ? 'delete' : 'update';
  const action = COLLECTION_ACTION[collection]?.[op] ?? null;
  return action !== null && can(role, action) ? 'ok' : 'denied';
}
