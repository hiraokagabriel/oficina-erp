import { LedgerEntry } from '../types';
import { getDueDate, toLocalDay } from './expenseStatus';
import { diffDays, getReceivableStatus, type ReceivablesSummary } from './receivables';
import type { Payables } from './financeFlow';

// Textos e grupos das caixas "Contas para pagar" e "Para receber" (Financeiro > Visão geral). Funções puras;
// `todayDay` ('YYYY-MM-DD', dia local) é injetado. Nada aqui decide regra de negócio: só monta o que a tela mostra.

export interface FinDueRow {
  id: string;
  /** Texto curto da data ("05/11") ou "Sem data". */
  date: string;
  description: string;
  /** Valor já formatado. */
  amount: string;
  /** Situação em texto ("Venceu há 3 dias"). */
  stateText: string;
  tone: 'late' | 'due' | 'open';
}

export interface FinDueGroup {
  label: string;
  rows: FinDueRow[];
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** 'AAAA-MM-DD' -> 'DD/MM'; com o ano ('DD/MM/AAAA') quando não é o ano de hoje. */
export const shortDay = (day: string, todayDay: string): string => {
  const [y, m, d] = day.split('-');
  return y === todayDay.slice(0, 4) ? `${d}/${m}` : `${d}/${m}/${y}`;
};

/** Situação de uma conta a pagar não paga: "Venceu há N dias", "Vence hoje" ou "Vence em N dias". */
export const payStateText = (dueDay: string, todayDay: string): string => {
  const late = diffDays(dueDay, todayDay);
  if (late > 0) return `Venceu há ${plural(late, 'dia', 'dias')}`;
  if (late === 0) return 'Vence hoje';
  return `Vence em ${plural(-late, 'dia', 'dias')}`;
};

export const buildPayGroups = (
  payables: Payables, todayDay: string, format: (cents: number) => string, periodLabel: string
): FinDueGroup[] => {
  const row = (e: LedgerEntry, tone: 'late' | 'due'): FinDueRow => {
    const dueDay = toLocalDay(getDueDate(e));
    return {
      id: e.id, date: shortDay(dueDay, todayDay), description: e.description,
      amount: format(e.amount), stateText: payStateText(dueDay, todayDay), tone,
    };
  };
  const groups: FinDueGroup[] = [
    { label: `Vencidas (${payables.countOverdue})`, rows: payables.overdue.map(e => row(e, 'late')) },
    { label: `Vencem em ${periodLabel} (${payables.countDue})`, rows: payables.dueInPeriod.map(e => row(e, 'due')) },
  ];
  return groups.filter(g => g.rows.length > 0);
};

export const buildReceiveGroups = (
  receivables: ReceivablesSummary, todayDay: string, format: (cents: number) => string
): FinDueGroup[] => {
  const late: FinDueRow[] = [];
  const open: FinDueRow[] = [];
  for (const e of receivables.items) {
    const dueDay = toLocalDay(getDueDate(e));
    if (getReceivableStatus(e, todayDay) === 'ATRASADO') {
      late.push({
        id: e.id, date: shortDay(dueDay, todayDay), description: e.description, amount: format(e.amount),
        stateText: `Atrasada há ${plural(diffDays(dueDay, todayDay), 'dia', 'dias')}`, tone: 'late',
      });
    } else {
      open.push({
        id: e.id, date: shortDay(dueDay, todayDay), description: e.description, amount: format(e.amount),
        stateText: 'A receber', tone: 'open',
      });
    }
  }
  const waiting: FinDueRow[] = receivables.pendingOS.map(({ os, amount }) => ({
    id: `os-${os.id}`, date: 'Sem data', description: `OS #${os.osNumber} - ${os.clientName}`,
    amount: format(amount), stateText: 'Esperando pagamento', tone: 'open' as const,
  }));
  const groups: FinDueGroup[] = [
    { label: 'Atrasadas', rows: late },
    { label: 'A vencer', rows: open },
    { label: 'Esperando pagamento', rows: waiting },
  ];
  return groups.filter(g => g.rows.length > 0);
};
