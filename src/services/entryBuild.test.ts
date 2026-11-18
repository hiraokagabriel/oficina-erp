import { describe, expect, it } from 'vitest';
import { buildEntries } from './entryBuild';
import { createEntry } from '../utils/helpers';
import { toLocalDay } from './expenseStatus';

const TODAY = '2026-11-18';
const base = { desc: 'Aluguel', totalCents: 90000, today: TODAY, groupId: 'g1' } as const;

describe('createEntry: pending', () => {
  it('sem pending não grava a chave; com pending grava true', () => {
    expect('pending' in createEntry('a', 100, 'DEBIT', '2026-11-20')).toBe(false);
    expect(createEntry('a', 100, 'DEBIT', '2026-11-20', undefined, undefined, true).pending).toBe(true);
    expect('pending' in createEntry('a', 100, 'DEBIT', '2026-11-20', undefined, undefined, false)).toBe(false);
  });
});

describe('buildEntries: despesa', () => {
  it('"Vou pagar em": único fica pending, sem paymentDate', () => {
    const [e] = buildEntries({ ...base, type: 'DEBIT', dateStr: '2026-11-25', recurrence: 'SINGLE', count: 1, pending: true });
    expect(e.pending).toBe(true);
    expect(e.paymentDate).toBeUndefined();
    expect(toLocalDay(e.effectiveDate)).toBe('2026-11-25');
  });
  it('"Já paguei": único com paymentDate = a data e sem pending', () => {
    const [e] = buildEntries({ ...base, type: 'DEBIT', dateStr: '2026-11-10', recurrence: 'SINGLE', count: 1 });
    expect('pending' in e).toBe(false);
    expect(toLocalDay(e.paymentDate as string)).toBe('2026-11-10');
  });
  it('"Já paguei" com data de hoje conta como paga', () => {
    const [e] = buildEntries({ ...base, type: 'DEBIT', dateStr: TODAY, recurrence: 'SINGLE', count: 1 });
    expect(toLocalDay(e.paymentDate as string)).toBe(TODAY);
  });
  it('"Já paguei" com data futura não vira paga: fica pending', () => {
    const [e] = buildEntries({ ...base, type: 'DEBIT', dateStr: '2026-11-19', recurrence: 'SINGLE', count: 1 });
    expect(e.pending).toBe(true);
    expect(e.paymentDate).toBeUndefined();
  });
  it('"Já paguei" mensal: 1ª paga, as futuras pending', () => {
    const r = buildEntries({ ...base, type: 'DEBIT', dateStr: '2026-11-10', recurrence: 'RECURRING', count: 3 });
    expect(r).toHaveLength(3);
    expect(toLocalDay(r[0].paymentDate as string)).toBe('2026-11-10');
    expect('pending' in r[0]).toBe(false);
    expect(r[1].pending).toBe(true);
    expect(r[2].pending).toBe(true);
    expect(r[1].paymentDate).toBeUndefined();
    expect(r.every(e => e.groupId === 'g1' && e.amount === 90000)).toBe(true);
  });
  it('"Já paguei" parcelado: soma exata, 1ª paga, resto pending', () => {
    const r = buildEntries({ ...base, totalCents: 10000, type: 'DEBIT', dateStr: '2026-11-10', recurrence: 'INSTALLMENT', count: 3 });
    expect(r.map(e => e.amount)).toEqual([3333, 3333, 3334]);
    expect(r[0].paymentDate).toBeDefined();
    expect(r[1].pending && r[2].pending).toBe(true);
    expect(r[1].description).toBe('Aluguel (2/3)');
  });
  it('"Vou pagar em" mensal: todas pending', () => {
    const r = buildEntries({ ...base, type: 'DEBIT', dateStr: '2026-11-25', recurrence: 'RECURRING', count: 3, pending: true });
    expect(r.every(e => e.pending === true && e.paymentDate === undefined)).toBe(true);
  });
});

describe('buildEntries: receita não muda', () => {
  it('sem pending nem paymentDate', () => {
    const r = buildEntries({ ...base, type: 'CREDIT', dateStr: '2026-11-10', recurrence: 'RECURRING', count: 2, pending: true });
    expect(r.every(e => !('pending' in e) && e.paymentDate === undefined)).toBe(true);
  });
  it('único sem grupo quando count é 1', () => {
    const [e] = buildEntries({ ...base, type: 'CREDIT', dateStr: '2026-11-10', recurrence: 'SINGLE', count: 1 });
    expect(e.groupId).toBeUndefined();
  });
});
