import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addMonths, formatDateOnly, getDateTimeZone, isDateOnly, parseDateFlexible, parseDateOnly, setDateTimeZone, toISOFromDateInput } from './dates';
import { getLocalDateString } from './helpers';

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

// Fuso fixado por setDateTimeZone (servidor Edge, sempre em UTC). Resultados absolutos: independem do fuso da máquina.
describe('setDateTimeZone (servidor)', () => {
  afterEach(() => setDateTimeZone(null));

  describe('America/Sao_Paulo', () => {
    beforeEach(() => setDateTimeZone('America/Sao_Paulo'));
    it('autoteste da spec: meio-dia de 01/01/2026 = 15:00Z', () =>
      expect(parseDateOnly('2026-01-01').toISOString()).toBe('2026-01-01T15:00:00.000Z'));
    it('toISOFromDateInput igual ao PC da oficina', () =>
      expect(toISOFromDateInput('2026-03-15')).toBe('2026-03-15T15:00:00.000Z'));
    it('addMonths com clamp e hora preservada', () =>
      expect(addMonths(parseDateOnly('2026-01-31'), 1).toISOString()).toBe('2026-02-28T15:00:00.000Z'));
    it('addMonths atravessa o ano', () =>
      expect(addMonths(parseDateOnly('2026-12-31'), 2).toISOString()).toBe('2027-02-28T15:00:00.000Z'));
    it('formatDateOnly usa o dia da oficina (23h de 01/01 é 02:00Z de 02/01)', () =>
      expect(formatDateOnly(new Date('2026-01-02T02:00:00.000Z'))).toBe('2026-01-01'));
    it('getLocalDateString segue o fuso fixado (02:00Z de 02/01 ainda é 01/01 na oficina)', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-01-02T02:00:00.000Z'));
        expect(getLocalDateString()).toBe('2026-01-01');
      } finally {
        vi.useRealTimers();
      }
    });
    it('hora inexistente no início do horário de verão (04/11/2018 00:30) avança, como o Date local', () => {
      const r = addMonths(new Date('2018-10-04T03:30:00.000Z'), 1);
      expect(r.toISOString()).toBe('2018-11-04T03:30:00.000Z');
      expect(formatDateOnly(r)).toBe('2018-11-04');
    });
    it('data inválida dá NaN, como no modo local (sem RangeError)', () => {
      expect(formatDateOnly(new Date('lixo'))).toBe('NaN-NaN-NaN');
      expect(Number.isNaN(parseDateOnly('lixo').getTime())).toBe(true);
    });
    it('horário de verão antigo (dez/2018, -02:00) vem do Intl', () =>
      expect(parseDateOnly('2018-12-01').toISOString()).toBe('2018-12-01T14:00:00.000Z'));
    it('getDateTimeZone devolve o fuso fixado', () => expect(getDateTimeZone()).toBe('America/Sao_Paulo'));
  });

  it('fuso com horário de verão (America/New_York): antes, no dia e depois da troca', () => {
    setDateTimeZone('America/New_York');
    expect(parseDateOnly('2026-03-07').toISOString()).toBe('2026-03-07T17:00:00.000Z');
    expect(parseDateOnly('2026-03-08').toISOString()).toBe('2026-03-08T16:00:00.000Z');
    expect(addMonths(parseDateOnly('2026-02-15'), 1).toISOString()).toBe('2026-03-15T16:00:00.000Z');
    expect(formatDateOnly(new Date('2026-03-08T04:30:00.000Z'))).toBe('2026-03-07');
    // 02:30 de 08/03 não existe: vira 03:30 EDT. 01:30 de 01/11 se repete: fica o 1º (EDT).
    expect(addMonths(new Date('2026-02-08T07:30:00.000Z'), 1).toISOString()).toBe('2026-03-08T07:30:00.000Z');
    expect(addMonths(new Date('2026-10-01T05:30:00.000Z'), 1).toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });

  it('fuso a leste do UTC (Asia/Tokyo)', () => {
    setDateTimeZone('Asia/Tokyo');
    expect(parseDateOnly('2026-01-01').toISOString()).toBe('2026-01-01T03:00:00.000Z');
    expect(formatDateOnly(new Date('2025-12-31T16:00:00.000Z'))).toBe('2026-01-01');
  });

  it('fuso inválido lança RangeError e não muda o fuso em uso', () => {
    const before = getDateTimeZone();
    expect(() => setDateTimeZone('Fuso/Inexistente')).toThrow(RangeError);
    expect(getDateTimeZone()).toBe(before);
  });

  it('fixar o próprio fuso da máquina dá os mesmos resultados do modo local', () => {
    const days = ['2024-02-29', '2025-01-31', '2026-03-08', '2026-06-30', '2026-10-04', '2026-11-01', '2026-12-31'];
    const run = () => days.map((v) => {
      const d = parseDateOnly(v);
      return [d.toISOString(), addMonths(d, 1).toISOString(), addMonths(d, -13).toISOString(), formatDateOnly(d)];
    });
    const local = run();
    setDateTimeZone(getDateTimeZone());
    expect(run()).toEqual(local);
  });

  it('fixar o próprio fuso da máquina = modo local também nas trocas de horário', () => {
    const instants = ['2018-10-04T03:30:00.000Z', '2018-01-17T02:30:00.000Z', '2026-02-08T07:30:00.000Z',
      '2026-10-01T05:30:00.000Z', '2026-03-29T00:30:00.000Z', '2026-09-27T01:30:00.000Z'];
    const run = () => instants.map((v) => [1, -1, 12].map((m) => addMonths(new Date(v), m).toISOString()));
    const local = run();
    setDateTimeZone(getDateTimeZone());
    expect(run()).toEqual(local);
  });
});
