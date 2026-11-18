import { LedgerEntry } from '../types';
import { addMonths, formatDateOnly, parseDateOnly, toISOFromDateInput } from '../utils/dates';
import { createEntry, splitCents } from '../utils/helpers';
import { isDebitPaid } from './expenseStatus';

// Monta os lançamentos manuais do Financeiro (único, parcelado ou mensal). Puro: o hook só grava o resultado.
// "Já paguei"/"Já recebi": todo lançamento com data até hoje nasce pago (`paymentDate` = a data dele); os de data
// futura ficam em aberto (DEBIT: `pending`; CREDIT: sem `paymentDate`, nunca `pending`).
// "Vou pagar em"/"Vou receber em" (`pending: true`): nenhum nasce pago.

export interface BuildEntriesArgs {
  desc: string;
  /** Total em centavos (positivo). */
  totalCents: number;
  type: 'CREDIT' | 'DEBIT';
  /** 'YYYY-MM-DD' da 1ª parcela/mês. */
  dateStr: string;
  recurrence: 'SINGLE' | 'INSTALLMENT' | 'RECURRING';
  count: number;
  /** true = "Vou pagar/receber em"; ausente/false = "Já paguei/recebi". */
  pending?: boolean;
  /** Hoje, 'YYYY-MM-DD' local. */
  today: string;
  /** Vínculo das parcelas (use `undefined` quando houver 1 lançamento só). */
  groupId?: string;
}

// Soma meses com limite no fim do mês (31/jan + 1 mês = 28/fev).
const addMonthsToDate = (dateStr: string, monthsToAdd: number): string =>
  formatDateOnly(addMonths(parseDateOnly(dateStr), monthsToAdd));

export const buildEntries = (a: BuildEntriesArgs): LedgerEntry[] => {
  const isDebit = a.type === 'DEBIT';
  // Estado do lançamento: pago só se o usuário disse "já" e a data não é futura.
  const stateFor = (dateStr: string): { pending: boolean; paidOn?: string } => {
    const paid = a.pending !== true && dateStr <= a.today;
    if (paid) return { pending: false, paidOn: dateStr };
    return { pending: isDebit };
  };

  if (a.recurrence === 'SINGLE') {
    const s = stateFor(a.dateStr);
    return [createEntry(a.desc, a.totalCents, a.type, a.dateStr, undefined, s.paidOn, s.pending)];
  }

  const installmentCents = a.recurrence === 'INSTALLMENT' ? splitCents(a.totalCents, a.count) : [];
  const entries: LedgerEntry[] = [];
  for (let i = 0; i < a.count; i++) {
    const date = addMonthsToDate(a.dateStr, i);
    const desc = a.recurrence === 'INSTALLMENT' ? `${a.desc} (${i + 1}/${a.count})` : a.desc;
    const cents = a.recurrence === 'INSTALLMENT' ? installmentCents[i] : a.totalCents;
    const s = stateFor(date);
    entries.push(createEntry(desc, cents, a.type, date, a.groupId, s.paidOn, s.pending));
  }
  return entries;
};

export interface EntryEditArgs {
  desc: string;
  amountCents: number;
  type: 'CREDIT' | 'DEBIT';
  /** 'YYYY-MM-DD'. */
  dateStr: string;
  /** Hoje, 'YYYY-MM-DD' local. */
  today: string;
}

// Remove chaves opcionais sem deixar `undefined`.
const without = <K extends 'pending' | 'paymentDate'>(e: LedgerEntry, key: K): LedgerEntry => {
  const { [key]: _drop, ...rest } = e;
  void _drop;
  return rest as LedgerEntry;
};

/**
 * Edição de um lançamento manual. Despesa paga: a data editada é a data do PAGAMENTO (`paymentDate` e
 * `effectiveDate`); como "paga" não pode ser futura, data futura vira despesa prevista. Despesa prevista: a data é o
 * vencimento (`pending` mantido; `dueDate`, se existe, acompanha). Despesa legada sem `paymentDate` e sem `pending`
 * conta como paga (`isDebitPaid`). Receita: troca só a data efetiva e preserva `paymentDate`; nunca tem `pending`.
 */
export const applyEntryEdit = (entry: LedgerEntry, a: EntryEditArgs): LedgerEntry => {
  const iso = toISOFromDateInput(a.dateStr);
  const common = { ...entry, description: a.desc, amount: a.amountCents, type: a.type, effectiveDate: iso };
  if (a.type === 'CREDIT') return without(common, 'pending');
  const wasPending = entry.type === 'DEBIT' && entry.pending === true;
  const wasPaid = entry.type === 'DEBIT'
    ? isDebitPaid(entry, a.today)
    : !!entry.paymentDate; // receita trocada para despesa: paga só se tinha paymentDate
  if (wasPending || !wasPaid) {
    const base = without(common, 'paymentDate');
    const next: LedgerEntry = { ...base, ...(wasPending || entry.type === 'CREDIT' ? { pending: true as const } : {}) };
    return next.dueDate ? { ...next, dueDate: iso } : next;
  }
  if (a.dateStr > a.today) {
    const { dueDate: _d, ...rest } = without(common, 'paymentDate');
    void _d;
    return { ...rest, pending: true };
  }
  return without({ ...common, paymentDate: iso }, 'pending');
};

export interface EntryDraft {
  desc: string;
  /** Centavos digitados; ausente = vazio. */
  cents: number | undefined;
  /** 'YYYY-MM-DD' ou vazio. */
  date: string;
  payLater: boolean;
  type: 'CREDIT' | 'DEBIT';
  isNew: boolean;
}

export interface EntryDraftErrors { desc?: string; amount?: string; date?: string }

/** Validação do formulário de lançamento manual: mensagens por campo (vazio = válido). */
export const validateEntryDraft = (d: EntryDraft): EntryDraftErrors => {
  const errors: EntryDraftErrors = {};
  if (!d.desc.trim()) errors.desc = 'Informe a descrição.';
  if (d.cents === undefined || d.cents <= 0) errors.amount = 'Informe um valor maior que zero.';
  if (!d.date) {
    errors.date = d.isNew && d.payLater
      ? (d.type === 'DEBIT' ? 'Escolha a data de pagamento.' : 'Escolha a data de recebimento.')
      : 'Escolha a data.';
  }
  return errors;
};

/** Texto do aviso depois de marcar/desfazer pagamento: diz qual lançamento e quanto. `format` formata centavos. */
export const paymentToast = (entry: LedgerEntry, paid: boolean, format: (cents: number) => string): string => {
  const what = `${entry.description} - ${format(entry.amount)}`;
  if (entry.type === 'DEBIT') return paid ? `Pago: ${what}` : `Pagamento desfeito: ${what}`;
  return paid ? `Recebido: ${what}` : `Recebimento desfeito: ${what}`;
};
