import { describe, it, expect } from 'vitest';
import { formatAxisBRL, parseEntryAmount, parseYearDraft } from './financeView';
import { shouldIgnoreStep } from './kanbanCardView';

describe('parseEntryAmount', () => {
  it.each([['1.500', 150000], ['1.234,50', 123450], ['150,00', 15000], ['12,5', 1250]])('%s', (t, c) => {
    expect(parseEntryAmount(t)).toEqual({ ok: true, cents: c });
  });
  it('abc é inválido', () => {
    const r = parseEntryAmount('abc');
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.reason).toBe('invalid'); expect(r.message).toContain('1.234,50'); }
  });
  it('vazio', () => {
    const r = parseEntryAmount('  ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty');
  });
});

describe('parseYearDraft', () => {
  it('aceita 4 dígitos razoáveis', () => {
    expect(parseYearDraft('2025')).toBe(2025);
    expect(parseYearDraft(' 2100 ')).toBe(2100);
  });
  it('rejeita o resto', () => {
    for (const t of ['', '202', '20255', '1999', '2101', 'abcd', '20.5']) expect(parseYearDraft(t)).toBeNull();
  });
});

describe('formatAxisBRL', () => {
  it('formata compacto', () => {
    expect(formatAxisBRL(0)).toBe('R$ 0');
    expect(formatAxisBRL(500)).toBe('R$ 500');
    expect(formatAxisBRL(1500)).toBe('R$ 1,5 mil');
    expect(formatAxisBRL(2000)).toBe('R$ 2 mil');
    expect(formatAxisBRL(2500000)).toBe('R$ 2,5 mi');
    expect(formatAxisBRL(-1500)).toBe('-R$ 1,5 mil');
  });
});

describe('trava do duplo clique em Receber (reusa shouldIgnoreStep)', () => {
  it('ignora o 2º clique dentro da janela', () => {
    expect(shouldIgnoreStep(1000, 1200)).toBe(true);
    expect(shouldIgnoreStep(1000, 1700)).toBe(false);
  });
});
