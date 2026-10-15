import { describe, expect, it } from 'vitest';
import { getDueDate, getReceivableStatus, summarizeReceivables } from './receivables';
import type { LedgerEntry } from '../types';

// Fixtures sintéticas. Datas em meio-dia local: o dia local não depende do fuso do teste.
const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
const TODAY = new Date(2026, 5, 15, 9); // 15/06/2026 09:00 local

const e = (id: string, over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id, description: id, amount: 1000, type: 'CREDIT',
  effectiveDate: day(2026, 6, 15), createdAt: day(2026, 1, 1), ...over,
});

describe('getDueDate', () => {
  it('usa dueDate quando existe, senão effectiveDate', () => {
    expect(getDueDate(e('a', { dueDate: day(2026, 7, 1), effectiveDate: day(2026, 6, 1) }))).toBe(day(2026, 7, 1));
    expect(getDueDate(e('b', { effectiveDate: day(2026, 6, 1) }))).toBe(day(2026, 6, 1));
  });
});

describe('getReceivableStatus', () => {
  it('DEBIT: null', () => {
    expect(getReceivableStatus(e('d', { type: 'DEBIT' }), TODAY)).toBeNull();
  });
  it('com paymentDate: RECEBIDO (mesmo vencido); isPaid é ignorado', () => {
    expect(getReceivableStatus(e('a', { dueDate: day(2026, 1, 1), paymentDate: day(2026, 6, 1) }), TODAY)).toBe('RECEBIDO');
    expect(getReceivableStatus(e('b', { dueDate: day(2026, 1, 1), isPaid: true }), TODAY)).toBe('ATRASADO');
  });
  it('vence hoje (qualquer hora do dia): A_RECEBER; ontem: ATRASADO; amanhã: A_RECEBER', () => {
    expect(getReceivableStatus(e('a', { dueDate: day(2026, 6, 15, 0) }), TODAY)).toBe('A_RECEBER');
    expect(getReceivableStatus(e('b', { dueDate: day(2026, 6, 15, 23) }), new Date(2026, 5, 15, 0, 1))).toBe('A_RECEBER');
    expect(getReceivableStatus(e('c', { dueDate: day(2026, 6, 14, 23) }), TODAY)).toBe('ATRASADO');
    expect(getReceivableStatus(e('d', { dueDate: day(2026, 6, 16, 0) }), TODAY)).toBe('A_RECEBER');
  });
  it('sem dueDate usa effectiveDate; today aceita YYYY-MM-DD', () => {
    expect(getReceivableStatus(e('a', { effectiveDate: day(2026, 6, 14) }), '2026-06-15')).toBe('ATRASADO');
    expect(getReceivableStatus(e('b', { effectiveDate: '2026-06-15' }), '2026-06-15')).toBe('A_RECEBER');
  });
});

describe('summarizeReceivables', () => {
  it('soma em centavos, conta, ordena por vencimento e ignora recebidos e DEBIT', () => {
    const ledger = [
      e('futuro', { amount: 300, dueDate: day(2026, 8, 1) }),
      e('atrasado2', { amount: 200, dueDate: day(2026, 6, 10) }),
      e('pago', { amount: 9999, dueDate: day(2026, 6, 1), paymentDate: day(2026, 6, 2) }),
      e('saida', { amount: 7777, type: 'DEBIT', dueDate: day(2026, 6, 1) }),
      e('atrasado1', { amount: 100, dueDate: day(2026, 5, 1) }),
      e('hoje', { amount: 50, dueDate: day(2026, 6, 15) }),
    ];
    const r = summarizeReceivables(ledger, TODAY);
    expect(r.totalAtrasado).toBe(300);
    expect(r.countAtrasado).toBe(2);
    expect(r.totalAReceber).toBe(350);
    expect(r.countAReceber).toBe(2);
    expect(r.items.map(i => i.id)).toEqual(['atrasado1', 'atrasado2', 'hoje', 'futuro']);
  });
  it('ledger vazio ou só recebido: zeros', () => {
    expect(summarizeReceivables([], TODAY)).toEqual({ totalAReceber: 0, totalAtrasado: 0, countAReceber: 0, countAtrasado: 0, items: [] });
    expect(summarizeReceivables([e('p', { paymentDate: day(2026, 1, 1) })], TODAY).items).toEqual([]);
  });
  it('não muta o ledger', () => {
    const led = [e('b', { dueDate: day(2026, 8, 1) }), e('a', { dueDate: day(2026, 7, 1) })];
    summarizeReceivables(led, TODAY);
    expect(led.map(x => x.id)).toEqual(['b', 'a']);
  });
});
