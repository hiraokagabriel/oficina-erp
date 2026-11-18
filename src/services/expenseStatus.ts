import { LedgerEntry } from '../types';
import { formatDateOnly, parseDateFlexible } from '../utils/dates';

// Módulo-folha (só tipos e datas): despesa paga ou prevista. Importado por receivables, financeKpis e
// osFinanceService sem criar ciclo. Tudo por DIA LOCAL ('YYYY-MM-DD').

/** Vencimento do lançamento: `dueDate` quando existe, senão `effectiveDate`. */
export const getDueDate = (entry: LedgerEntry): string => entry.dueDate ?? entry.effectiveDate;

/** 'YYYY-MM-DD' local de um Date, de um 'YYYY-MM-DD' ou de um ISO completo. */
export const toLocalDay = (value: string | Date): string =>
  value instanceof Date ? formatDateOnly(value) : formatDateOnly(parseDateFlexible(value));

/**
 * Despesa (DEBIT) paga? Prevista = `pending === true` OU (sem `paymentDate`, sem `pending` e vencimento depois de
 * hoje). Paga = o resto. O legado (sem `pending` nem `paymentDate`) já vencido conta como paga, como antes.
 */
export const isDebitPaid = (entry: LedgerEntry, todayDay: string): boolean => {
  if (entry.pending === true) return false;
  if (entry.paymentDate) return true;
  return toLocalDay(getDueDate(entry)) <= todayDay;
};

/** Dia local em que a despesa paga saiu do caixa: `paymentDate`, senão o vencimento. */
export const debitPaidDay = (entry: LedgerEntry): string =>
  toLocalDay(entry.paymentDate ?? getDueDate(entry));
