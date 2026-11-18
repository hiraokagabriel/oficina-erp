import { LedgerEntry } from '../types';
import { addMonths, formatDateOnly, parseDateOnly } from '../utils/dates';
import { createEntry, splitCents } from '../utils/helpers';

// Monta os lançamentos manuais do Financeiro (único, parcelado ou mensal). Puro: o hook só grava o resultado.
// Despesa (DEBIT): "Vou pagar em [data]" (`pending: true`) marca todas como previstas; "Já paguei" grava
// `paymentDate` = data na 1ª (só se a data não é futura) e deixa as demais, que são futuras, como `pending`.

export interface BuildEntriesArgs {
  desc: string;
  /** Total em centavos (positivo). */
  totalCents: number;
  type: 'CREDIT' | 'DEBIT';
  /** 'YYYY-MM-DD' da 1ª parcela/mês. */
  dateStr: string;
  recurrence: 'SINGLE' | 'INSTALLMENT' | 'RECURRING';
  count: number;
  /** DEBIT: true = "Vou pagar em"; ausente/false = "Já paguei". Ignorado em CREDIT. */
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
  // Estado do lançamento i: só o 1º pode nascer pago, e só se a data não é futura.
  const stateFor = (i: number, dateStr: string): { pending: boolean; paidOn?: string } => {
    if (!isDebit) return { pending: false };
    if (a.pending === true || i > 0 || dateStr > a.today) return { pending: true };
    return { pending: false, paidOn: dateStr };
  };

  if (a.recurrence === 'SINGLE') {
    const s = stateFor(0, a.dateStr);
    return [createEntry(a.desc, a.totalCents, a.type, a.dateStr, undefined, s.paidOn, s.pending)];
  }

  const installmentCents = a.recurrence === 'INSTALLMENT' ? splitCents(a.totalCents, a.count) : [];
  const entries: LedgerEntry[] = [];
  for (let i = 0; i < a.count; i++) {
    const date = addMonthsToDate(a.dateStr, i);
    const desc = a.recurrence === 'INSTALLMENT' ? `${a.desc} (${i + 1}/${a.count})` : a.desc;
    const cents = a.recurrence === 'INSTALLMENT' ? installmentCents[i] : a.totalCents;
    const s = stateFor(i, date);
    entries.push(createEntry(desc, cents, a.type, date, a.groupId, s.paidOn, s.pending));
  }
  return entries;
};
