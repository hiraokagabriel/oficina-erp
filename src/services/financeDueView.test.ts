import { describe, it, expect } from 'vitest';
import { LedgerEntry } from '../types';
import { buildPayGroups, buildReceiveGroups, payStateText, shortDay } from './financeDueView';
import { buildPayables } from './financeFlow';
import { summarizeReceivables } from './receivables';
import { computeFinanceKpis } from './financeKpis';

const fmt = (c: number): string => `R$ ${(c / 100).toFixed(2)}`;
const entry = (id: string, type: 'CREDIT' | 'DEBIT', due: string, extra: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id, description: `Conta ${id}`, amount: 10000, type, effectiveDate: `${due}T12:00:00`, dueDate: `${due}T12:00:00`,
  createdAt: '2026-01-01T12:00:00', ...extra,
});

describe('financeDueView', () => {
  it('shortDay mostra o ano só quando não é o ano de hoje', () => {
    expect(shortDay('2026-11-05', '2026-11-18')).toBe('05/11');
    expect(shortDay('2025-12-30', '2026-11-18')).toBe('30/12/2025');
  });

  it('payStateText: vencida, hoje e a vencer', () => {
    expect(payStateText('2026-11-17', '2026-11-18')).toBe('Venceu há 1 dia');
    expect(payStateText('2026-11-10', '2026-11-18')).toBe('Venceu há 8 dias');
    expect(payStateText('2026-11-18', '2026-11-18')).toBe('Vence hoje');
    expect(payStateText('2026-11-20', '2026-11-18')).toBe('Vence em 2 dias');
  });

  it('buildPayGroups separa vencidas das do período e omite grupo vazio', () => {
    const ledger = [
      entry('a', 'DEBIT', '2026-11-05', { pending: true }),
      entry('b', 'DEBIT', '2026-11-20', { pending: true }),
    ];
    const kpis = computeFinanceKpis({ ledger, workOrders: [], period: { mode: 'MONTH', month: '2026-11' }, today: '2026-11-18' });
    const groups = buildPayGroups(buildPayables(kpis.expectedExpenses), '2026-11-18', fmt, 'novembro');
    expect(groups.map(g => g.label)).toEqual(['Vencidas (1)', 'Vencem em novembro (1)']);
    expect(groups[0].rows[0]).toMatchObject({ id: 'a', tone: 'late', date: '05/11', stateText: 'Venceu há 13 dias' });
    expect(groups[1].rows[0]).toMatchObject({ id: 'b', tone: 'due', stateText: 'Vence em 2 dias' });
    const onlyLate = buildPayGroups(buildPayables({ ...kpis.expectedExpenses, items: kpis.expectedExpenses.items.slice(0, 1) }), '2026-11-18', fmt, 'novembro');
    expect(onlyLate.map(g => g.label)).toEqual(['Vencidas (1)']);
  });

  it('buildReceiveGroups: atrasadas, a vencer e OS esperando pagamento', () => {
    const ledger = [entry('c', 'CREDIT', '2026-11-02'), entry('d', 'CREDIT', '2026-11-25')];
    const summary = summarizeReceivables(ledger, '2026-11-18', []);
    const groups = buildReceiveGroups(summary, '2026-11-18', fmt);
    expect(groups.map(g => g.label)).toEqual(['Atrasadas', 'A vencer']);
    expect(groups[0].rows[0].stateText).toBe('Atrasada há 16 dias');
    expect(groups[1].rows[0]).toMatchObject({ tone: 'open', stateText: 'A receber' });
  });
});
