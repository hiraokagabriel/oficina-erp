import { describe, expect, it } from 'vitest';
import { costToInput, getMarginBadge, marginTooltip, normalizeItemCost, parseCostEdit, parseCostInput, partialMarginNote } from './marginView';
import { computeMargin } from './margin';
import { OrderItem } from '../types';

const item = (price: number, cost?: number): OrderItem => ({ id: 'i', description: 'x', price, cost });
const fmt = (c: number) => `R$ ${c / 100}`;

describe('parseCostInput', () => {
  it('vazio, inválido, zero e negativo viram undefined', () => {
    expect(parseCostInput('')).toBeUndefined();
    expect(parseCostInput('  ')).toBeUndefined();
    expect(parseCostInput('abc')).toBeUndefined();
    expect(parseCostInput('0')).toBeUndefined();
    expect(parseCostInput('-3')).toBeUndefined();
  });
  it('converte reais em centavos, com vírgula ou ponto', () => {
    expect(parseCostInput('12,5')).toBe(1250);
    expect(parseCostInput('1.005')).toBe(101);
    expect(parseCostInput('0.004')).toBeUndefined();
  });
});

describe('parseCostEdit / normalizeItemCost', () => {
  it('vazio é undefined; zero é mantido durante a edição', () => {
    expect(parseCostEdit('')).toBeUndefined();
    expect(parseCostEdit('0')).toBe(0);
    expect(parseCostEdit('0,5')).toBe(50);
    expect(parseCostEdit('x')).toBe(0);
  });
  it('ao salvar, 0 e ausente saem da chave cost', () => {
    expect('cost' in normalizeItemCost(item(100, 0))).toBe(false);
    expect('cost' in normalizeItemCost(item(100))).toBe(false);
    expect(normalizeItemCost(item(100, 40)).cost).toBe(40);
  });
});

describe('costToInput', () => {
  it('ida e volta', () => {
    expect(costToInput(undefined)).toBe('');
    expect(costToInput(0)).toBe('');
    expect(costToInput(1250)).toBe('12.5');
  });
});

describe('partialMarginNote', () => {
  it('singular, plural e nenhum', () => {
    expect(partialMarginNote(computeMargin([item(100, 50)]))).toBeNull();
    expect(partialMarginNote(computeMargin([item(100, 50), item(100)]))).toBe('1 item sem custo: margem parcial');
    expect(partialMarginNote(computeMargin([item(100), item(100, 0)]))).toBe('2 itens sem custo: margem parcial');
  });
});

describe('marginTooltip', () => {
  it('sem custo', () => {
    expect(marginTooltip(computeMargin([item(100)]), fmt)).toContain('não pode ser calculada');
  });
  it('lucro, cobertura e nota parcial', () => {
    const t = marginTooltip(computeMargin([item(10000, 2000), item(10000)]), fmt);
    expect(t).toContain('R$ 80');
    expect(t).toContain('Cobertura: 50%');
    expect(t).toContain('1 item sem custo');
  });
});

describe('getMarginBadge', () => {
  const os = (parts: OrderItem[], services: OrderItem[] = []) => ({ parts, services });
  it('null sem itens', () => {
    expect(getMarginBadge(os([]), 70, fmt)).toBeNull();
  });
  it('os 4 estados', () => {
    expect(getMarginBadge(os([item(100)]), 70, fmt)?.label).toBe('Sem custo');
    expect(getMarginBadge(os([item(1000, 300)]), 70, fmt)?.label).toBe('Margem 70%');
    expect(getMarginBadge(os([item(1000, 500)]), 70, fmt)?.label).toBe('Atenção (50%)');
    expect(getMarginBadge(os([item(1000, 900)]), 70, fmt)?.label).toBe('Abaixo da meta (10%)');
  });
  it('ignora profitMargin gravado e usa os itens', () => {
    const b = getMarginBadge({ ...os([item(1000, 900)]), profitMargin: 99 } as never, 70, fmt);
    expect(b?.level).toBe('ABAIXO');
  });
});
