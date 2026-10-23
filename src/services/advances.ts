import { AuditEvent, LedgerEntry, OSAdvance, OSAdvanceDraft, WorkOrder } from '../types';
import { generateId } from '../utils/helpers';
import { formatDateOnly, isDateOnly, parseDateOnly } from '../utils/dates';
import { isAdvanceSyncLocked, sumAdvances } from './osFinanceService';

// Adiantamentos com data e trilha de auditoria (schema v4). Funções puras: não mutam as entradas;
// relógio (`now`) e gerador de id (`newId`) injetáveis. A OS travada (isAdvanceSyncLocked) nunca muda aqui.

export { sumAdvances };
export type AdvanceDraft = OSAdvanceDraft;

/** Dia local 'AAAA-MM-DD' de uma data só-dia (validada no calendário) ou de um ISO; undefined se inválido. */
const dayKeyOf = (value: string): string | undefined => {
  if (typeof value !== 'string' || !value) return undefined;
  if (isDateOnly(value)) {
    const back = formatDateOnly(parseDateOnly(value));
    return back === value ? value : undefined; // 2026-02-31 não existe
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : formatDateOnly(d);
};

/** Meio-dia local (ISO) do dia de `value`; undefined se inválido. */
const noonISO = (value: string): string | undefined => {
  const key = dayKeyOf(value);
  return key ? parseDateOnly(key).toISOString() : undefined;
};

const isCents = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;

export interface AdvanceValidation {
  valid: boolean;
  error?: string;
}

/** Valida um adiantamento: valor inteiro em centavos > 0, data válida e NÃO futura. `today` = dia local 'AAAA-MM-DD'. */
export const validateAdvance = (draft: Pick<OSAdvanceDraft, 'date' | 'amount'>, today: string): AdvanceValidation => {
  if (!isCents(draft.amount)) return { valid: false, error: 'Informe um valor de adiantamento maior que zero.' };
  const key = dayKeyOf(draft.date);
  if (!key) return { valid: false, error: 'Informe uma data válida para o adiantamento.' };
  if (key > today) return { valid: false, error: 'A data do adiantamento não pode ser futura.' };
  return { valid: true };
};

/** Aviso (não bloqueia): a soma dos adiantamentos passa do total da OS. */
export const advancesExceedTotal = (os: Pick<WorkOrder, 'advances' | 'total'>): boolean => sumAdvances(os) > os.total;

/** OS dona do lançamento (adiantamento v4 ou legado), para travar a edição no Financeiro. */
export const findAdvanceOwner = (workOrders: WorkOrder[], entryId: string): WorkOrder | undefined =>
  workOrders.find(o => o.advanceEntryId === entryId || !!o.advances?.some(a => a.entryId === entryId));

const descriptionOf = (os: Pick<WorkOrder, 'osNumber' | 'clientName'>): string =>
  `Adiantamento OS #${os.osNumber} - ${os.clientName}`;

export interface SyncAdvancesResult {
  ledger: LedgerEntry[];
  advances: OSAdvance[];
  events: AuditEvent[];
}

/**
 * Leva a lista de adiantamentos do modal (`drafts`, lista COMPLETA) para o caixa, comparando por id:
 * - novo (sem id ou id desconhecido): lançamento CREDIT já pago, mesmo texto de hoje ("Adiantamento OS #N - cliente";
 *   effectiveDate = paymentDate = data do adiantamento, meio-dia local; createdAt = now) + evento CRIADO;
 * - data/valor mudou: atualiza o lançamento (valor, datas, descrição) + evento ALTERADO (before/after);
 * - sumiu da lista: remove o lançamento + evento REMOVIDO (before);
 * - igual: só acerta a descrição se o cliente/número mudou, sem evento;
 * - lançamento sumido do caixa: é recriado com o MESMO entryId e SEM evento de criação (o adiantamento já existia e foi auditado);
 * - draft inválido (valor/data) é ignorado; se tinha id conhecido, o adiantamento existente é mantido como está (nunca apaga por erro).
 * OS travada: devolve ledger e advances intactos e nenhum evento. Idempotente: repetir com a OS já atualizada e as mesmas entradas não cria nada.
 */
export const syncAdvances = ({ os, drafts, ledger, now = new Date().toISOString(), newId = generateId, machine }: {
  os: WorkOrder;
  drafts: OSAdvanceDraft[];
  ledger: LedgerEntry[];
  now?: string;
  newId?: () => string;
  machine: string;
}): SyncAdvancesResult => {
  const current = os.advances ?? [];
  if (isAdvanceSyncLocked(os)) return { ledger, advances: current, events: [] };

  const description = descriptionOf(os);
  const byId = new Map(current.map(a => [a.id, a]));
  const ledgerById = new Map(ledger.map(e => [e.id, e]));
  const events: AuditEvent[] = [];
  const advances: OSAdvance[] = [];
  const keptIds = new Set<string>();
  const updates = new Map<string, LedgerEntry>();
  const created: LedgerEntry[] = [];

  const event = (action: AuditEvent['action'], advanceId: string, extra: Partial<AuditEvent>): AuditEvent => ({
    id: newId(), at: now, machine, action, osId: os.id, osNumber: os.osNumber, advanceId, ...extra,
  });
  const snap = (a: Pick<OSAdvance, 'date' | 'amount'>) => ({ date: a.date, amount: a.amount });
  const receipt = (entryId: string, a: Pick<OSAdvance, 'date' | 'amount'>, base?: LedgerEntry): LedgerEntry => ({
    ...(base ?? { id: entryId, type: 'CREDIT' as const, createdAt: now }),
    id: entryId,
    description,
    amount: a.amount,
    effectiveDate: a.date,
    paymentDate: a.date,
  });

  for (const draft of drafts) {
    const known = draft.id ? byId.get(draft.id) : undefined;
    const date = noonISO(draft.date);
    if (!isCents(draft.amount) || !date) {
      if (known && !keptIds.has(known.id)) { keptIds.add(known.id); advances.push(known); }
      continue;
    }
    if (known) {
      if (keptIds.has(known.id)) continue; // id repetido no rascunho: vale o primeiro
      keptIds.add(known.id);
      const next: OSAdvance = { ...known, date, amount: draft.amount };
      const entry = ledgerById.get(known.entryId);
      const changed = known.date !== date || known.amount !== draft.amount;
      if (changed) events.push(event('ADIANTAMENTO_ALTERADO', known.id, { before: snap(known), after: snap(next) }));
      if (!entry) created.push(receipt(known.entryId, next));
      else if (changed || entry.description !== description) updates.set(entry.id, receipt(entry.id, next, entry));
      advances.push(changed ? next : known);
    } else {
      const adv: OSAdvance = { id: newId(), date, amount: draft.amount, entryId: newId() };
      created.push(receipt(adv.entryId, adv));
      events.push(event('ADIANTAMENTO_CRIADO', adv.id, { after: snap(adv) }));
      advances.push(adv);
    }
  }

  const removedEntryIds = new Set<string>();
  for (const old of current) {
    if (keptIds.has(old.id)) continue;
    removedEntryIds.add(old.entryId);
    events.push(event('ADIANTAMENTO_REMOVIDO', old.id, { before: snap(old) }));
  }

  if (!updates.size && !created.length && !removedEntryIds.size) return { ledger, advances, events };
  const rest = ledger.filter(e => !removedEntryIds.has(e.id)).map(e => updates.get(e.id) ?? e);
  return { ledger: [...created, ...rest], advances, events };
};

/**
 * Exclusão da OS: remove os lançamentos de todos os adiantamentos (e o legado `advanceEntryId`, sem evento)
 * e gera um evento REMOVIDO por adiantamento com `reason: 'OS_EXCLUIDA'`. Não olha o travamento (excluir é sempre permitido).
 */
export const removeAllAdvances = ({ os, ledger, now = new Date().toISOString(), newId = generateId, machine }: {
  os: WorkOrder;
  ledger: LedgerEntry[];
  now?: string;
  newId?: () => string;
  machine: string;
}): { ledger: LedgerEntry[]; events: AuditEvent[] } => {
  const advances = os.advances ?? [];
  const ids = new Set(advances.map(a => a.entryId));
  if (os.advanceEntryId) ids.add(os.advanceEntryId);
  const events: AuditEvent[] = advances.map(a => ({
    id: newId(), at: now, machine, action: 'ADIANTAMENTO_REMOVIDO', osId: os.id, osNumber: os.osNumber,
    advanceId: a.id, before: { date: a.date, amount: a.amount }, reason: 'OS_EXCLUIDA',
  }));
  if (!ids.size) return { ledger, events };
  return { ledger: ledger.filter(e => !ids.has(e.id)), events };
};
