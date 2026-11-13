import type { ChecklistSchema, InspectionCategory, InspectionItem, WorkOrder } from '../types';
import { conflictsMessage, mergeOSEdit, OS_DELETED_MESSAGE, stable } from '../services/osEditMerge';
import { statusNeedsMoney } from './diff';
import type { CollectionKey } from './types';

// Resolução de conflito do sync (docs/NUVEM-SPEC.md seção 4, "Conflito"). Pura.
// `base` = registro quando a edição começou; `value` = o que o usuário quer gravar (null = excluir);
// `server` = registro atual no servidor (null/undefined = não existe ou foi excluído).

export { OS_DELETED_MESSAGE };

export const RECORD_DELETED_MESSAGE =
  'Este registro foi excluído em outro aparelho enquanto você o editava. Nada foi salvo para não recriá-lo.';

export const RECORD_EDITED_MESSAGE =
  'Este registro foi alterado em outro aparelho antes da sua exclusão. A exclusão foi cancelada e ficou o que está lá.';

export const CHANGE_NOT_APPLIED_MESSAGE =
  'Uma alteração sua não foi aplicada: o registro já estava diferente em outro aparelho. Confira o que ficou.';

export type MergeRecordResult =
  /**
   * Op concluída. Sem `message`: o servidor já estava igual ao desejado (ack perdido). Com `message`: a mudança do
   * usuário NÃO foi aplicada (o servidor ficou diferente do valor local) e o usuário precisa saber.
   */
  | { kind: 'done'; message?: string }
  /** Regravar `value` (null = excluir) sobre a versão do servidor; `message` lista conflitos, se houve. */
  | { kind: 'merged'; value: unknown | null; conflicts: string[]; message?: string }
  /** Descartar a op e ficar com o servidor. */
  | { kind: 'drop'; reason: 'server_deleted' | 'server_edited'; message: string };

const eq = (a: unknown, b: unknown): boolean => stable(a) === stable(b);
const absent = (v: unknown): boolean => v === undefined || v === null;

/** 3 vias de um valor: o local vence se ele mexeu; senão vale o do servidor. */
function pick3<T>(b: T | undefined, v: T | undefined, s: T | undefined): { val: T | undefined; conflict: boolean } {
  if (eq(b, v)) return { val: s, conflict: false };
  return { val: v, conflict: !eq(s, b) && !eq(s, v) };
}

type Keyed = { id: string };

/** Lista com `id` por item. `mergeItem` resolve o item mexido dos dois lados. Ordem: a do servidor, depois os novos do local. */
function mergeById<T extends Keyed>(
  b: readonly T[] | undefined, v: readonly T[] | undefined, s: readonly T[] | undefined,
  mergeItem?: (b: T, v: T, s: T) => { val: T; conflict: boolean },
): { val: T[]; conflict: boolean } {
  const bm = new Map((b ?? []).map(x => [x.id, x]));
  const vm = new Map((v ?? []).map(x => [x.id, x]));
  const sm = new Map((s ?? []).map(x => [x.id, x]));
  let conflict = false;
  const out: T[] = [];
  const seen = new Set<string>();
  const resolve = (id: string): void => {
    seen.add(id);
    const bi = bm.get(id); const vi = vm.get(id); const si = sm.get(id);
    if (bi && vi && si && mergeItem && !eq(bi, vi) && !eq(bi, si)) {
      const r = mergeItem(bi, vi, si);
      out.push(r.val);
      conflict = conflict || r.conflict;
      return;
    }
    const r = pick3<T>(bi, vi, si);
    conflict = conflict || r.conflict;
    if (r.val !== undefined) out.push(r.val);
  };
  for (const x of s ?? []) resolve(x.id);
  for (const x of v ?? []) if (!seen.has(x.id)) resolve(x.id);
  return { val: out, conflict };
}

/** Categoria mexida dos dois lados: campos em 3 vias e itens da vistoria por `id`. */
function mergeCategory(b: InspectionCategory, v: InspectionCategory, s: InspectionCategory): { val: InspectionCategory; conflict: boolean } {
  const label = pick3(b.label, v.label, s.label);
  const custom = pick3(b.custom, v.custom, s.custom);
  const items = mergeById<InspectionItem>(b.items, v.items, s.items);
  const val: InspectionCategory = { ...s, label: label.val ?? s.label, items: items.val };
  if (custom.val === undefined) delete val.custom; else val.custom = custom.val;
  return { val, conflict: label.conflict || custom.conflict || items.conflict };
}

/** Vistoria: campos simples em 3 vias; categorias e itens por `id`. Item mexido só de um lado vale o de quem mexeu. */
function mergeChecklist(
  b: ChecklistSchema | undefined, v: ChecklistSchema | undefined, s: ChecklistSchema | undefined,
): { val: ChecklistSchema | undefined; conflict: boolean } {
  if (!b || !v || !s) return pick3(b, v, s);
  const mileageIn = pick3(b.mileageIn, v.mileageIn, s.mileageIn);
  const notes = pick3(b.notes, v.notes, s.notes);
  const inspectedAt = pick3(b.inspectedAt, v.inspectedAt, s.inspectedAt);
  const cats = mergeById<InspectionCategory>(b.categories, v.categories, s.categories, mergeCategory);
  const val: ChecklistSchema = { ...s, categories: cats.val, notes: notes.val ?? '' };
  if (mileageIn.val === undefined) delete val.mileageIn; else val.mileageIn = mileageIn.val;
  if (inspectedAt.val === undefined) delete val.inspectedAt; else val.inspectedAt = inspectedAt.val;
  return { val, conflict: mileageIn.conflict || notes.conflict || inspectedAt.conflict || cats.conflict };
}

/**
 * OS: `mergeOSEdit` (campos, itens, fotos; o que o local não mexeu vem do servidor) mais 3 vias em `status`
 * e na vistoria por `id` de item, que o `mergeOSEdit` não trata. Conflito vence o local.
 * Adiantamentos e dinheiro não entram aqui: só mudam pela função `money`, então vêm sempre do servidor.
 */
export function mergeOSRecord(base: WorkOrder | null, value: WorkOrder, server: WorkOrder): { value: WorkOrder; conflicts: string[] } | null {
  const opened = base ?? server; // sem base, vale o que o usuário mudou em relação ao servidor
  const r = mergeOSEdit({ opened, edited: value, current: server, drafts: undefined });
  if (!r.ok) return null;
  const merged: WorkOrder = { ...r.base };
  const conflicts = [...r.conflicts];

  const st = pick3(opened.status, value.status, server.status);
  if (st.val !== undefined) merged.status = st.val;
  if (st.conflict) conflicts.push('status');
  // O local só vence se a transição servidor -> local não exigir dinheiro (FINALIZADO etc.): senão fica a do servidor.
  if (merged.status !== server.status && statusNeedsMoney(server, merged.status)) {
    merged.status = server.status;
    if (!conflicts.includes('status')) conflicts.push('status');
  }

  const ck = mergeChecklist(opened.checklist, value.checklist, server.checklist);
  if (ck.val === undefined) delete merged.checklist; else merged.checklist = ck.val;
  if (ck.conflict) conflicts.push('vistoria');

  return { value: merged, conflicts };
}

/** Demais coleções: 3 vias por chave de 1º nível; listas (`vehicles`) comparadas inteiras. */
export function mergeFlatRecord(base: Record<string, unknown> | null, value: Record<string, unknown>, server: Record<string, unknown>): { value: Record<string, unknown>; conflicts: string[] } {
  const b = base ?? server;
  const out: Record<string, unknown> = {};
  const conflicts: string[] = [];
  for (const k of new Set([...Object.keys(b), ...Object.keys(value), ...Object.keys(server)])) {
    const r = pick3(b[k], value[k], server[k]);
    if (r.val !== undefined) out[k] = r.val;
    if (r.conflict) conflicts.push(k);
  }
  return { value: out, conflicts };
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A fusão deu o que o servidor já tem. Se o usuário tinha mudado algo (valor diferente da base e do servidor), avisa que não foi aplicado. */
export function doneOrLost(base: unknown | null, value: unknown, server: unknown): MergeRecordResult {
  if (eq(value, server) || eq(value, base)) return { kind: 'done' };
  return { kind: 'done', message: CHANGE_NOT_APPLIED_MESSAGE };
}

export function mergeRecord(collection: CollectionKey, input: {
  base: unknown | null; value: unknown | null; server: unknown | null | undefined;
}): MergeRecordResult {
  const { base, value } = input;
  const server = input.server ?? null;

  if (eq(server, value) || (absent(server) && absent(value))) return { kind: 'done' };

  // Exclusão local: só segue se o servidor não mudou desde a base.
  if (value === null) {
    if (server !== null && base !== null && !eq(server, base)) {
      return { kind: 'drop', reason: 'server_edited', message: RECORD_EDITED_MESSAGE };
    }
    return { kind: 'merged', value: null, conflicts: [] };
  }

  // Servidor apagou, local editou: a exclusão vence (não recria).
  if (server === null) {
    if (base === null) return { kind: 'merged', value, conflicts: [] }; // registro novo
    return { kind: 'drop', reason: 'server_deleted', message: collection === 'workOrders' ? OS_DELETED_MESSAGE : RECORD_DELETED_MESSAGE };
  }

  if (collection === 'workOrders') {
    const r = mergeOSRecord(base as WorkOrder | null, value as WorkOrder, server as WorkOrder);
    if (!r) return { kind: 'drop', reason: 'server_deleted', message: OS_DELETED_MESSAGE };
    if (eq(r.value, server)) return doneOrLost(base, value, server);
    return { kind: 'merged', value: r.value, conflicts: r.conflicts, message: r.conflicts.length ? conflictsMessage(r.conflicts) : undefined };
  }

  if (isObject(value) && isObject(server) && (base === null || isObject(base))) {
    const r = mergeFlatRecord(base, value, server);
    if (eq(r.value, server)) return doneOrLost(base, value, server);
    return { kind: 'merged', value: r.value, conflicts: r.conflicts, message: r.conflicts.length ? conflictsMessage(r.conflicts) : undefined };
  }
  return { kind: 'merged', value, conflicts: [] };
}
