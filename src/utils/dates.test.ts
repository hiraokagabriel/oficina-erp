import { describe, expect, it } from 'vitest';
import { addMonths, formatDateOnly, isDateOnly, parseDateFlexible, parseDateOnly, toISOFromDateInput } from './dates';

// Sempre comparado com getters LOCAIS: independente do fuso da máquina.
const ymd = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];

describe('parseDateOnly', () => {
  it('YYYY-MM-DD vira meio-dia local', () => {
    const d = parseDateOnly('2026-01-10');
    expect([...ymd(d), d.getHours()]).toEqual([2026, 1, 10, 12]);
  });
  it('isDateOnly distingue só-dia de ISO completo', () => {
    expect(isDateOnly('2026-01-10')).toBe(true);
    expect(isDateOnly('2026-01-10T12:00:00.000Z')).toBe(false);
  });
  it('parseDateFlexible mantém o instante de um ISO completo', () => {
    const iso = '2026-01-10T15:30:00.000Z';
    expect(parseDateFlexible(iso).toISOString()).toBe(iso);
    expect(toISOFromDateInput(iso)).toBe(iso);
  });
});

describe('addMonths', () => {
  const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);
  it('31/jan + 1 mês = 28/fev (2026)', () => expect(ymd(addMonths(at(2026, 1, 31), 1))).toEqual([2026, 2, 28]));
  it('31/jan + 1 mês = 29/fev em ano bissexto (2028)', () => expect(ymd(addMonths(at(2028, 1, 31), 1))).toEqual([2028, 2, 29]));
  it('31/mar + 1 mês = 30/abr', () => expect(ymd(addMonths(at(2026, 3, 31), 1))).toEqual([2026, 4, 30]));
  it('31/dez + 1 mês = 31/jan do ano seguinte', () => expect(ymd(addMonths(at(2026, 12, 31), 1))).toEqual([2027, 1, 31]));
  it('dezembro -> janeiro do ano seguinte', () => expect(ymd(addMonths(at(2026, 12, 15), 1))).toEqual([2027, 1, 15]));
  it('o clamp é sempre a partir da data base (31/jan + 2 meses = 31/mar)', () => expect(ymd(addMonths(at(2026, 1, 31), 2))).toEqual([2026, 3, 31]));
  it('não altera a data original e preserva a hora', () => {
    const base = at(2026, 1, 31);
    const r = addMonths(base, 1);
    expect(ymd(base)).toEqual([2026, 1, 31]);
    expect(r.getHours()).toBe(12);
  });
});

describe('formatDateOnly', () => {
  it('formata com getters locais', () => expect(formatDateOnly(new Date(2026, 0, 5, 12))).toBe('2026-01-05'));
});
