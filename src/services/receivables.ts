import { LedgerEntry } from '../types';
import { formatDateOnly, parseDateFlexible } from '../utils/dates';

// Conceito único de "a receber": `paymentDate` é a única verdade de "pago" (isPaid não é mais lido).
// Funções puras; `today` é injetado (Date ou 'YYYY-MM-DD') e a comparação é por DIA LOCAL.

export type ReceivableStatus = 'RECEBIDO' | 'A_RECEBER' | 'ATRASADO';

export interface ReceivablesSummary {
  totalAReceber: number;
  totalAtrasado: number;
  countAReceber: number;
  countAtrasado: number;
  /** A_RECEBER + ATRASADO, ordenados por vencimento (mais antigo primeiro). */
  items: LedgerEntry[];
}

export const getDueDate = (entry: LedgerEntry): string => entry.dueDate ?? entry.effectiveDate;

// 'YYYY-MM-DD' local de um Date, de um 'YYYY-MM-DD' ou de um ISO completo.
const toLocalDay = (value: string | Date): string =>
  value instanceof Date ? formatDateOnly(value) : formatDateOnly(parseDateFlexible(value));

export const getReceivableStatus = (
  entry: LedgerEntry,
  today: string | Date
): ReceivableStatus | null => {
  if (entry.type !== 'CREDIT') return null;
  if (entry.paymentDate) return 'RECEBIDO';
  return toLocalDay(getDueDate(entry)) < toLocalDay(today) ? 'ATRASADO' : 'A_RECEBER';
};

export const summarizeReceivables = (
  ledger: LedgerEntry[],
  today: string | Date
): ReceivablesSummary => {
  const summary: ReceivablesSummary = {
    totalAReceber: 0, totalAtrasado: 0, countAReceber: 0, countAtrasado: 0, items: [],
  };
  for (const e of ledger) {
    const status = getReceivableStatus(e, today);
    if (status === 'ATRASADO') {
      summary.totalAtrasado += e.amount;
      summary.countAtrasado++;
      summary.items.push(e);
    } else if (status === 'A_RECEBER') {
      summary.totalAReceber += e.amount;
      summary.countAReceber++;
      summary.items.push(e);
    }
  }
  summary.items.sort((a, b) =>
    parseDateFlexible(getDueDate(a)).getTime() - parseDateFlexible(getDueDate(b)).getTime());
  return summary;
};

