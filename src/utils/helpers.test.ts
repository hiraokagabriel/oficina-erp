import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Money, calculateFinancials, createEntry, createWorkOrder, generateId, splitCents,
  learnTechnician, updateWorkOrderData,
} from './helpers';
import type { CatalogItem, OrderItem, Technician, WorkOrder } from '../types';

const NOW = '2026-03-15T15:00:00.000Z';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(NOW)); });
afterEach(() => { vi.useRealTimers(); });

const cat = (id: string, description: string, price = 1000, extra: Partial<CatalogItem> = {}): CatalogItem =>
  ({ id, description, price, ...extra });

describe('Money', () => {
  it('fromFloat arredonda para centavos', () => {
    expect(Money.fromFloat(10.5)).toBe(1050);
    expect(Money.fromFloat(0)).toBe(0);
    expect(Money.fromFloat(19.99)).toBe(1999);
  });
  // CORRIGIDO (4.5): 1.005 * 100 = 100.49999... em ponto flutuante arredondava para 100; agora dá 101.
  it('fromFloat é robusto a erro de ponto flutuante', () => {
    expect(Money.fromFloat(1.005)).toBe(101);
    expect(Money.fromFloat(0.1 + 0.2)).toBe(30);
    expect(Money.fromFloat(1.15)).toBe(115);
    expect(Money.fromFloat(19.99)).toBe(1999);
    expect(Money.fromFloat(4.35)).toBe(435);
  });
  it('fromFloat com zero, negativos e valores já em centavos inteiros', () => {
    expect(Money.fromFloat(0)).toBe(0);
    expect(Money.fromFloat(-0.001)).toBe(0);
    expect(Money.fromFloat(-19.99)).toBe(-1999);
    expect(Money.fromFloat(-1.005)).toBe(-101);
    expect(Money.fromFloat(-0.1 - 0.2)).toBe(-30);
    expect(Money.fromFloat(12345)).toBe(1234500); // 12345 reais
    expect(Money.fromFloat(Money.toFloat(1999))).toBe(1999); // ida e volta
  });
  it('toFloat e format', () => {
    expect(Money.toFloat(1050)).toBe(10.5);
    expect(Money.format(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
  });
});

describe('splitCents', () => {
  it('divide em centavos inteiros com o resto na última parcela', () => {
    expect(splitCents(10000, 3)).toEqual([3333, 3333, 3334]);
    expect(splitCents(10000, 4)).toEqual([2500, 2500, 2500, 2500]);
    expect(splitCents(1, 3)).toEqual([0, 0, 1]);
  });
  it('a soma é sempre exata', () => {
    for (const [total, n] of [[9999, 7], [100, 6], [123457, 12], [5, 2]]) {
      expect(splitCents(total, n).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
  it('contagem inválida vira 1 parcela', () => {
    expect(splitCents(500, NaN)).toEqual([500]);
    expect(splitCents(500, 0)).toEqual([500]);
  });
});

describe('generateId', () => {
  it('gera ids distintos e não vazios', () => {
    const a = generateId(); const b = generateId();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });
});

describe('createEntry', () => {
  it('sem datas usa agora', () => {
    const e = createEntry('Teste', 500, 'DEBIT');
    expect(e).toMatchObject({ description: 'Teste', amount: 500, type: 'DEBIT', effectiveDate: NOW, createdAt: NOW });
    expect(e.groupId).toBeUndefined();
    expect(e.paymentDate).toBeUndefined();
    expect(e.id).toBeTruthy();
  });
  it('com dateString/paymentDate normaliza para ISO', () => {
    const e = createEntry('Teste', 500, 'CREDIT', '2026-01-10', 'g1', '2026-02-01');
    expect(new Date(e.effectiveDate).getTime()).toBe(new Date(2026, 0, 10, 12).getTime());
    expect(new Date(e.paymentDate!).getTime()).toBe(new Date(2026, 1, 1, 12).getTime());
    expect(e.groupId).toBe('g1');
  });
  // CORRIGIDO (4.5): 'YYYY-MM-DD' virava meia-noite UTC (dia anterior no Brasil); agora é meio-dia LOCAL.
  it('dateString só-dia é meio-dia local (mesmo dia em qualquer fuso)', () => {
    const d = new Date(createEntry('x', 1, 'CREDIT', '2026-01-10').effectiveDate);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 0, 10, 12]);
  });
  it('dateString ISO completo é mantido como está', () => {
    expect(createEntry('x', 1, 'CREDIT', '2026-01-10T15:30:00.000Z').effectiveDate).toBe('2026-01-10T15:30:00.000Z');
  });
});

describe('calculateFinancials', () => {
  const it1 = (price: number, cost?: number): OrderItem => ({ id: 'i', description: 'd', price, cost });
  it('soma receita, custo, lucro, margem e ROI', () => {
    const r = calculateFinancials([it1(10000, 6000)], [it1(5000, 1000)]);
    expect(r).toEqual({ totalRevenue: 15000, totalCost: 7000, profit: 8000, profitMargin: (8000 / 15000) * 100, roi: (8000 / 7000) * 100 });
  });
  it('custo ausente conta como zero; roi 0 sem custo', () => {
    const r = calculateFinancials([it1(10000)], []);
    expect(r).toMatchObject({ totalRevenue: 10000, totalCost: 0, profit: 10000, profitMargin: 100, roi: 0 });
  });
  it('listas vazias: tudo zero (sem divisão por zero)', () => {
    expect(calculateFinancials([], [])).toEqual({ totalRevenue: 0, totalCost: 0, profit: 0, profitMargin: 0, roi: 0 });
  });
  it('prejuízo gera margem negativa', () => {
    const r = calculateFinancials([it1(1000, 2000)], []);
    expect(r.profit).toBe(-1000);
    expect(r.profitMargin).toBe(-100);
  });
});

describe('createWorkOrder', () => {
  it('cria ORCAMENTO com totais e ids novos nos itens', () => {
    const o = createWorkOrder(7, 'Gol - AAA', 'Fulano', '1', '123', [cat('a', 'Filtro', 2000, { cost: 500 })], [cat('b', 'Troca', 3000)]);
    expect(o).toMatchObject({ osNumber: 7, status: 'ORCAMENTO', total: 5000, totalCost: 500, profit: 4500, mileage: 123, createdAt: NOW });
    expect(o.parts[0].id).not.toBe('a');
  });
  it('mileage inválida vira 0 e dateString fixa meio-dia UTC', () => {
    const o = createWorkOrder(1, 'v', 'c', 'p', 'abc', [], [], '2026-02-10');
    expect(o.mileage).toBe(0);
    expect(o.createdAt).toBe('2026-02-10T12:00:00.000Z');
  });
});

describe('updateWorkOrderData', () => {
  const original: WorkOrder = {
    id: 'os1', osNumber: 1, vehicle: 'Gol', clientName: 'Fulano', clientPhone: '1', mileage: 10,
    status: 'FINALIZADO', parts: [], services: [], total: 0, createdAt: '2026-01-10T12:00:00.000Z',
    financialId: 'fin1', publicNotes: 'nota', advanceAmount: 100,
  };
  it('recalcula totais e preserva status, id e financialId', () => {
    const o = updateWorkOrderData(original, 2, 'Uno', 'Beltrano', '2', '99', [cat('a', 'Filtro', 2000, { cost: 500 })], [cat('b', 'Troca', 3000)]);
    expect(o).toMatchObject({ id: 'os1', status: 'FINALIZADO', financialId: 'fin1', osNumber: 2, vehicle: 'Uno', clientName: 'Beltrano', mileage: 99, total: 5000, totalCost: 500, profit: 4500 });
    expect(o.createdAt).toBe(original.createdAt);
    expect(o.publicNotes).toBe('nota');
    expect(o.advanceAmount).toBe(100);
  });
  it('dateString muda createdAt (meio-dia UTC); notas e adiantamento podem ser trocados', () => {
    const o = updateWorkOrderData(original, 1, 'Gol', 'Fulano', '1', '10', [], [], '2026-02-20', 'outra', 0);
    expect(o.createdAt).toBe('2026-02-20T12:00:00.000Z');
    expect(o.publicNotes).toBe('outra');
    expect(o.advanceAmount).toBe(0);
  });
  it('não herda profitMargin gravado (obsoleto)', () => {
    const o = updateWorkOrderData({ ...original, profitMargin: 42 }, 1, 'Gol', 'Fulano', '1', '10', [], []);
    expect('profitMargin' in o).toBe(false);
  });
  // COMPORTAMENTO ATUAL (suspeito): editar uma OS já finalizada recalcula total/lucro, mas NÃO atualiza o lançamento do Ledger ligado por financialId.
  it('editar OS finalizada muda total sem tocar no financeiro (financialId mantido)', () => {
    const o = updateWorkOrderData(original, 1, 'Gol', 'Fulano', '1', '10', [cat('a', 'X', 9999)], []);
    expect(o.total).toBe(9999);
    expect(o.financialId).toBe('fin1');
  });
});

describe('learnTechnician', () => {
  const techs: Technician[] = [{ id: 't1', name: 'Zé' }];
  it('vazio ou existente (sem caixa) não altera', () => {
    expect(learnTechnician(techs, '  ')).toBe(techs);
    expect(learnTechnician(techs, 'zé')).toBe(techs);
  });
  it('novo é adicionado com trim', () => {
    const r = learnTechnician(techs, ' João ');
    expect(r).toHaveLength(2);
    expect(r[1].name).toBe('João');
  });
});
