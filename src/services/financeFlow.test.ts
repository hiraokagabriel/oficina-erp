import { describe, expect, it } from 'vitest';
import { buildFlowSeries, buildPayables } from './financeFlow';
import { computeFinanceKpis } from './financeKpis';
import type { LedgerEntry } from '../types';

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
const TODAY = new Date(2026, 10, 18, 9); // 18/11/2026 local
const NOV = { mode: 'MONTH', month: '2026-11' } as const;

const e = (id: string, over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id, description: id, amount: 10000, type: 'CREDIT',
  effectiveDate: day(2026, 11, 1), createdAt: day(2026, 1, 1), ...over,
});

describe('buildFlowSeries', () => {
  it('mês: todos os dias, inclusive zerados, em reais', () => {
    const r = buildFlowSeries([], NOV, TODAY);
    expect(r).toHaveLength(30);
    expect(r[0]).toEqual({ name: '01', entrou: 0, saiu: 0 });
    expect(r[29].name).toBe('30');
  });
  it('entrou pelo dia do pagamento; não paga fica fora', () => {
    const r = buildFlowSeries([
      e('a', { effectiveDate: day(2026, 10, 1), paymentDate: day(2026, 11, 5), amount: 12345 }),
      e('b', { paymentDate: undefined }),
    ], NOV, TODAY);
    expect(r[4].entrou).toBe(123.45);
    expect(r.reduce((s, p) => s + p.entrou, 0)).toBe(123.45);
  });
  it('saiu: paga pelo paymentDate, legado pelo vencimento; pending e futura ficam fora', () => {
    const r = buildFlowSeries([
      e('p', { type: 'DEBIT', paymentDate: day(2026, 11, 3), effectiveDate: day(2026, 11, 20), amount: 5000 }),
      e('l', { type: 'DEBIT', effectiveDate: day(2026, 11, 10), amount: 2000 }),
      e('pend', { type: 'DEBIT', effectiveDate: day(2026, 11, 8), pending: true }),
      e('fut', { type: 'DEBIT', effectiveDate: day(2026, 11, 25) }),
    ], NOV, TODAY);
    expect(r[2].saiu).toBe(50);
    expect(r[9].saiu).toBe(20);
    expect(r.reduce((s, p) => s + p.saiu, 0)).toBe(70);
  });
  it('ano: 12 meses', () => {
    const r = buildFlowSeries([e('a', { paymentDate: day(2026, 2, 5), amount: 1000 })], { mode: 'YEAR', month: '2026-11' }, TODAY);
    expect(r.map(p => p.name)).toEqual(['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']);
    expect(r[1].entrou).toBe(10);
  });
  it('fevereiro bissexto tem 29 dias', () => {
    expect(buildFlowSeries([], { mode: 'MONTH', month: '2028-02' }, TODAY)).toHaveLength(29);
  });
});

describe('buildPayables', () => {
  it('separa vencidas (qualquer mês) das que vencem no período, por vencimento, com totais', () => {
    const ledger = [
      e('late2', { type: 'DEBIT', effectiveDate: day(2026, 11, 5), pending: true, amount: 60000 }),
      e('late1', { type: 'DEBIT', effectiveDate: day(2026, 9, 1), pending: true, amount: 25000 }),
      e('due2', { type: 'DEBIT', effectiveDate: day(2026, 11, 28), amount: 3000 }),
      e('due1', { type: 'DEBIT', effectiveDate: day(2026, 11, 20), amount: 9000 }),
      e('hoje', { type: 'DEBIT', effectiveDate: day(2026, 11, 18), pending: true, amount: 1000 }),
      e('paga', { type: 'DEBIT', effectiveDate: day(2026, 11, 25), paymentDate: day(2026, 11, 1) }),
      e('cred', { effectiveDate: day(2026, 11, 25) }),
      e('dez', { type: 'DEBIT', effectiveDate: day(2026, 12, 20) }),
    ];
    const k = computeFinanceKpis({ ledger, workOrders: [], period: NOV, today: TODAY });
    const p = buildPayables(k.expectedExpenses);
    expect(p.overdue.map(x => x.id)).toEqual(['late1', 'late2']);
    expect(p.dueInPeriod.map(x => x.id)).toEqual(['hoje', 'due1', 'due2']);
    expect(p.totalOverdue).toBe(85000);
    expect(p.countOverdue).toBe(2);
    expect(p.totalDue).toBe(13000);
    expect(p.countDue).toBe(3);
  });
  it('vazio', () => {
    const p = buildPayables(computeFinanceKpis({ ledger: [], workOrders: [], period: NOV, today: TODAY }).expectedExpenses);
    expect(p).toEqual({ overdue: [], dueInPeriod: [], totalOverdue: 0, totalDue: 0, countOverdue: 0, countDue: 0 });
  });
});
