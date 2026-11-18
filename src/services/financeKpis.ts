import { LedgerEntry, WorkOrder } from '../types';
import { debitPaidDay, getDueDate, isDebitPaid, toLocalDay } from './expenseStatus';
import { getOSReceipt } from './osFinanceGuards';

// Números do Financeiro > Visão geral (regra "só o que entrou", decisão do dono em 2026-11-18).
// Funções puras; `today` é injetado e tudo é comparado por DIA LOCAL (toLocalDay). Valores em centavos.
//  - Receitas/Despesas: lançamentos PAGOS (`paymentDate`) no dia do pagamento; Saldo = receitas - despesas.
//  - Peças x Serviços e Ticket médio: só OS finalizadas (ver isFinishedOS e osRevenueDay).
//  - Despesas previstas: DEBIT sem `paymentDate` (a pagar).

export interface FinancePeriod {
  mode: 'MONTH' | 'YEAR';
  /** 'YYYY-MM'. No modo ano só os 4 primeiros dígitos valem. */
  month: string;
}

export interface ExpectedExpense {
  entry: LedgerEntry;
  /** Dia local do vencimento ('YYYY-MM-DD'). */
  dueDay: string;
  /** Vencimento antes de hoje. */
  overdue: boolean;
}

export interface ExpectedExpenses {
  /** Não pagas com vencimento no período (inclui as já vencidas dentro dele). */
  periodTotal: number;
  periodCount: number;
  /** Não pagas com vencimento antes de hoje, de qualquer período. */
  overdueTotal: number;
  overdueCount: number;
  /** Vencimento no período OU vencida; ordenada por vencimento (mais antigo primeiro). */
  items: ExpectedExpense[];
}

export interface FinanceKpis {
  receitas: number;
  despesas: number;
  saldo: number;
  ticketMedio: number;
  pie: { parts: number; services: number };
  osCount: number;
  /** OS finalizadas no período (mesmo número de `osCount`, nome do contrato da tela). */
  finalizedCount: number;
  expectedExpenses: ExpectedExpenses;
}

// ---------- PONTO ÚNICO DE DECISÃO: despesa paga ou prevista ----------
// A regra mora em expenseStatus.ts (`isDebitPaid`, `debitPaidDay`): `pending` ou vencimento futuro sem paymentDate
// = prevista; o resto = paga, no dia do pagamento (ou do vencimento, no legado).
export type ExpensePaidFn = (entry: LedgerEntry, todayDay: string) => boolean;
// -----------------------------------------------------------------------

const inPeriod = (day: string, p: FinancePeriod): boolean =>
  p.mode === 'YEAR' ? day.slice(0, 4) === p.month.slice(0, 4) : day.slice(0, 7) === p.month;

/**
 * OS que conta como receita realizada: FINALIZADO, ou ARQUIVADO COM receita ligada (financialId/installmentConfig).
 * ARQUIVADO nem sempre vem de finalizada (dá para arquivar orçamento): sem receita ligada fica de fora.
 */
export const isFinishedOS = (os: WorkOrder): boolean =>
  os.status === 'FINALIZADO' ||
  (os.status === 'ARQUIVADO' && (!!os.financialId || !!os.installmentConfig));

/**
 * Dia local em que a OS virou receita. Fonte, da mais para a menos correta:
 * 1) `os.paymentDate` (data do recebimento; em parcelada, a da última parcela);
 * 2) o recebimento mais recente dos lançamentos ligados à OS;
 * 3) o vencimento mais recente dos lançamentos ligados (receita lançada mas sem data de pagamento: OS antiga);
 * 4) `createdAt` (sem nenhum dado financeiro).
 */
export const osRevenueDay = (os: WorkOrder, ledger: LedgerEntry[]): string => {
  if (os.paymentDate) return toLocalDay(os.paymentDate);
  const credits = getOSReceipt(os, ledger).entries.filter(e => e.type === 'CREDIT');
  const paid = credits.filter(e => e.paymentDate).map(e => toLocalDay(e.paymentDate as string)).sort();
  if (paid.length > 0) return paid[paid.length - 1];
  const due = credits.map(e => toLocalDay(getDueDate(e))).sort();
  if (due.length > 0) return due[due.length - 1];
  return toLocalDay(os.createdAt);
};

export const computeFinanceKpis = (args: {
  ledger: LedgerEntry[];
  workOrders: WorkOrder[];
  period: FinancePeriod;
  today: string | Date;
  /** Troca da regra de despesa paga (só testes; o padrão é `isDebitPaid`). */
  isExpensePaid?: ExpensePaidFn;
}): FinanceKpis => {
  const { ledger, workOrders, period, today } = args;
  const expensePaid = args.isExpensePaid ?? isDebitPaid;
  const todayDay = toLocalDay(today);

  let receitas = 0;
  let despesas = 0;
  const items: ExpectedExpense[] = [];
  let periodTotal = 0, periodCount = 0, overdueTotal = 0, overdueCount = 0;

  for (const e of ledger) {
    if (e.type === 'CREDIT') {
      if (e.paymentDate && inPeriod(toLocalDay(e.paymentDate), period)) receitas += e.amount;
      continue;
    }
    if (expensePaid(e, todayDay)) {
      if (inPeriod(debitPaidDay(e), period)) despesas += e.amount;
      continue;
    }
    const dueDay = toLocalDay(getDueDate(e));
    const overdue = dueDay < todayDay;
    const inside = inPeriod(dueDay, period);
    if (inside) { periodTotal += e.amount; periodCount++; }
    if (overdue) { overdueTotal += e.amount; overdueCount++; }
    if (inside || overdue) items.push({ entry: e, dueDay, overdue });
  }
  items.sort((a, b) => a.dueDay.localeCompare(b.dueDay));

  let parts = 0, services = 0, total = 0, osCount = 0;
  for (const o of workOrders) {
    if (!isFinishedOS(o) || !inPeriod(osRevenueDay(o, ledger), period)) continue;
    parts += o.parts.reduce((a, i) => a + i.price, 0);
    services += o.services.reduce((a, i) => a + i.price, 0);
    total += o.total;
    osCount++;
  }

  return {
    receitas, despesas, saldo: receitas - despesas,
    ticketMedio: Math.round(total / (osCount || 1)),
    pie: { parts, services },
    osCount,
    finalizedCount: osCount,
    expectedExpenses: { periodTotal, periodCount, overdueTotal, overdueCount, items },
  };
};
