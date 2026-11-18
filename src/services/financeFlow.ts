import { LedgerEntry } from '../types';
import { Money } from '../utils/helpers';
import { debitPaidDay, isDebitPaid, toLocalDay } from './expenseStatus';
import type { ExpectedExpenses, FinancePeriod } from './financeKpis';

// Dados das telas do Financeiro (Visão geral): fluxo diário/mensal e contas a pagar. Funções puras; `today` injetado.

export interface FlowPoint {
  name: string;
  /** Reais (float, formato dos gráficos). */
  entrou: number;
  saiu: number;
}

export interface Payables {
  /** Não pagas com vencimento antes de hoje (qualquer mês), por vencimento. */
  overdue: LedgerEntry[];
  /** Não pagas que vencem no período a partir de hoje, por vencimento. */
  dueInPeriod: LedgerEntry[];
  /** Centavos. */
  totalOverdue: number;
  totalDue: number;
  countOverdue: number;
  countDue: number;
}

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/**
 * Entrou e saiu por dia (mês) ou por mês (ano), só o que foi PAGO, pelo dia do pagamento. Todos os dias/meses do
 * período aparecem, inclusive os zerados. Soma em centavos e converte no fim.
 */
export const buildFlowSeries = (
  ledger: LedgerEntry[],
  period: FinancePeriod,
  today: string | Date
): FlowPoint[] => {
  const todayDay = toLocalDay(today);
  const year = period.month.slice(0, 4);
  const isYear = period.mode === 'YEAR';
  const size = isYear ? 12 : new Date(Number(year), Number(period.month.slice(5, 7)), 0).getDate();
  const entrou = new Array<number>(size).fill(0);
  const saiu = new Array<number>(size).fill(0);

  // Posição (0-based) do dia pago dentro do período, ou -1 se cai fora.
  const slot = (paidDay: string): number => {
    if (isYear) return paidDay.slice(0, 4) === year ? Number(paidDay.slice(5, 7)) - 1 : -1;
    return paidDay.slice(0, 7) === period.month ? Number(paidDay.slice(8, 10)) - 1 : -1;
  };

  for (const e of ledger) {
    if (e.type === 'CREDIT') {
      if (!e.paymentDate) continue;
      const i = slot(toLocalDay(e.paymentDate));
      if (i >= 0) entrou[i] += e.amount;
    } else if (isDebitPaid(e, todayDay)) {
      const i = slot(debitPaidDay(e));
      if (i >= 0) saiu[i] += e.amount;
    }
  }

  return entrou.map((v, i) => ({
    name: isYear ? MONTH_LABELS[i] : String(i + 1).padStart(2, '0'),
    entrou: Money.toFloat(v),
    saiu: Money.toFloat(saiu[i]),
  }));
};

/** Contas a pagar a partir das despesas previstas já calculadas (`computeFinanceKpis().expectedExpenses`). */
export const buildPayables = (expected: ExpectedExpenses): Payables => {
  const overdue = expected.items.filter(x => x.overdue).map(x => x.entry);
  const dueInPeriod = expected.items.filter(x => !x.overdue).map(x => x.entry);
  const sum = (list: LedgerEntry[]): number => list.reduce((s, e) => s + e.amount, 0);
  return {
    overdue, dueInPeriod,
    totalOverdue: sum(overdue), totalDue: sum(dueInPeriod),
    countOverdue: overdue.length, countDue: dueInPeriod.length,
  };
};
