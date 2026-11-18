import { describe, expect, it } from 'vitest';
import { canUndoDebitPayment, debitPaidDay, getDueDate, isDebitPaid, toLocalDay } from './expenseStatus';
import type { LedgerEntry } from '../types';

// Datas em meio-dia local: o dia local não depende do fuso do teste (rode também com TZ=UTC).
const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
const TODAY = '2026-06-15';

const d = (id: string, due: string, over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id, description: id, amount: 500, type: 'DEBIT', effectiveDate: due, createdAt: day(2026, 1, 1), ...over,
});

describe('isDebitPaid', () => {
  it('legado sem marcador e vencido no passado: paga', () => {
    expect(isDebitPaid(d('a', day(2026, 6, 10)), TODAY)).toBe(true);
  });
  it('legado vencendo hoje: paga (só o futuro é previsto)', () => {
    expect(isDebitPaid(d('a', day(2026, 6, 15)), TODAY)).toBe(true);
  });
  it('legado no futuro: prevista', () => {
    expect(isDebitPaid(d('a', day(2026, 6, 16)), TODAY)).toBe(false);
  });
  it('pending: prevista mesmo com vencimento no passado', () => {
    expect(isDebitPaid(d('a', day(2026, 6, 1), { pending: true }), TODAY)).toBe(false);
  });
  it('pending vence paymentDate (marcador explícito)', () => {
    expect(isDebitPaid(d('a', day(2026, 6, 1), { pending: true, paymentDate: day(2026, 6, 2) }), TODAY)).toBe(false);
  });
  it('com paymentDate: paga, mesmo com vencimento no futuro', () => {
    expect(isDebitPaid(d('a', day(2026, 6, 30), { paymentDate: day(2026, 6, 1) }), TODAY)).toBe(true);
  });
  it('usa dueDate quando existe', () => {
    expect(isDebitPaid(d('a', day(2026, 6, 1), { dueDate: day(2026, 6, 20) }), TODAY)).toBe(false);
  });
});

describe('debitPaidDay', () => {
  it('paymentDate primeiro, senão o vencimento', () => {
    expect(debitPaidDay(d('a', day(2026, 6, 10), { paymentDate: day(2026, 6, 3) }))).toBe('2026-06-03');
    expect(debitPaidDay(d('b', day(2026, 6, 10)))).toBe('2026-06-10');
    expect(debitPaidDay(d('c', day(2026, 6, 10), { dueDate: day(2026, 6, 12) }))).toBe('2026-06-12');
  });
});

describe('helpers de data', () => {
  it('getDueDate e toLocalDay', () => {
    expect(getDueDate(d('a', day(2026, 6, 10), { dueDate: day(2026, 7, 1) }))).toBe(day(2026, 7, 1));
    expect(toLocalDay(new Date(2026, 5, 15, 23, 30))).toBe('2026-06-15');
    expect(toLocalDay('2026-06-15')).toBe('2026-06-15');
  });
});

describe('canUndoDebitPayment (M2)', () => {
  it('só despesa paga com paymentDate explícito', () => {
    expect(canUndoDebitPayment(d('a', day(2026, 6, 10), { paymentDate: day(2026, 6, 10) }), TODAY)).toBe(true);
  });
  it('legada paga pela regra (sem paymentDate): não', () => {
    expect(canUndoDebitPayment(d('a', day(2026, 6, 10)), TODAY)).toBe(false);
  });
  it('prevista: não (nada a desfazer)', () => {
    expect(canUndoDebitPayment(d('a', day(2026, 6, 10), { pending: true }), TODAY)).toBe(false);
  });
});
