import { describe, it, expect } from 'vitest';
import { PAGE_STEP, clampVisible, nextVisible, nextBatchSize, pageSlice, pageCounterLabel, resetVisible } from './pagination';

describe('pagination', () => {
  it('passo padrão é 50', () => expect(PAGE_STEP).toBe(50));
  it('clampVisible respeita total e zero', () => {
    expect(clampVisible(80, 30)).toBe(30);
    expect(clampVisible(-5, 30)).toBe(0);
    expect(clampVisible(12.7, 30)).toBe(12);
  });
  it('nextVisible soma o passo sem passar do total', () => {
    expect(nextVisible(50, 300)).toBe(100);
    expect(nextVisible(250, 270)).toBe(270);
    expect(nextVisible(50, 20)).toBe(20);
  });
  it('nextBatchSize diz quantos aparecem no próximo clique', () => {
    expect(nextBatchSize(50, 300)).toBe(50);
    expect(nextBatchSize(250, 270)).toBe(20);
    expect(nextBatchSize(270, 270)).toBe(0);
  });
  it('pageSlice corta a lista', () => {
    const l = Array.from({ length: 120 }, (_, i) => i);
    expect(pageSlice(l, 50)).toHaveLength(50);
    expect(pageSlice(l, 500)).toHaveLength(120);
    expect(pageSlice([], 50)).toEqual([]);
  });
  it('pageCounterLabel', () => {
    expect(pageCounterLabel(50, 300)).toBe('Mostrando 50 de 300');
    expect(pageCounterLabel(50, 12)).toBe('Mostrando 12 de 12');
  });

  it('resetVisible sem status zera tudo e mantém o objeto se já vazio', () => {
    const vazio = {};
    expect(resetVisible(vazio)).toBe(vazio);
    expect(resetVisible({ A: 100, B: 150 })).toEqual({});
  });
  it('resetVisible com status zera só o grupo', () => {
    const m: Partial<Record<string, number>> = { A: 100, B: 150 };
    expect(resetVisible(m, 'A')).toEqual({ B: 150 });
    expect(m).toEqual({ A: 100, B: 150 });
    expect(resetVisible(m, 'C')).toBe(m);
  });
});
