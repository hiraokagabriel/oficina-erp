import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Money, calculateFinancials, createEntry, createWorkOrder, generateId,
  learnCatalogItems, learnClientData, learnTechnician, updateWorkOrderData,
} from './helpers';
import type { CatalogItem, Client, OrderItem, Technician, WorkOrder } from '../types';

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
  // COMPORTAMENTO ATUAL (suspeito): 1.005 * 100 = 100.49999... em ponto flutuante, então arredonda para 100 (não 101).
  it('fromFloat sofre de erro de ponto flutuante', () => {
    expect(Money.fromFloat(1.005)).toBe(100);
  });
  it('toFloat e format', () => {
    expect(Money.toFloat(1050)).toBe(10.5);
    expect(Money.format(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
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
    expect(e.effectiveDate).toBe('2026-01-10T00:00:00.000Z');
    expect(e.paymentDate).toBe('2026-02-01T00:00:00.000Z');
    expect(e.groupId).toBe('g1');
  });
  // COMPORTAMENTO ATUAL (suspeito): 'YYYY-MM-DD' vira meia-noite UTC; em fusos negativos (Brasil) o dia local é o anterior.
  it('dateString sem hora é meia-noite UTC', () => {
    expect(createEntry('x', 1, 'CREDIT', '2026-01-10').effectiveDate.endsWith('T00:00:00.000Z')).toBe(true);
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
  // COMPORTAMENTO ATUAL (suspeito): editar uma OS já finalizada recalcula total/lucro, mas NÃO atualiza o lançamento do Ledger ligado por financialId.
  it('editar OS finalizada muda total sem tocar no financeiro (financialId mantido)', () => {
    const o = updateWorkOrderData(original, 1, 'Gol', 'Fulano', '1', '10', [cat('a', 'X', 9999)], []);
    expect(o.total).toBe(9999);
    expect(o.financialId).toBe('fin1');
  });
});

describe('learnClientData', () => {
  const base: Client[] = [{ id: 'c1', name: 'Fulano Teste', phone: '1', notes: 'n', vehicles: [{ model: 'Gol', plate: 'A' }] }];
  it('nome vazio não altera', () => {
    expect(learnClientData(base, '   ', 'Gol', 'A', '1')).toBe(base);
  });
  it('cliente novo é adicionado com trim', () => {
    const r = learnClientData(base, '  Novo  ', 'Uno', 'B', '2');
    expect(r).toHaveLength(2);
    expect(r[1]).toMatchObject({ name: 'Novo', phone: '2', notes: '', vehicles: [{ model: 'Uno', plate: 'B' }] });
  });
  it('existente (sem caixa) adiciona veículo novo e atualiza telefone/notas', () => {
    const r = learnClientData(base, 'fulano teste', 'Uno', 'B', '9', 'nota nova');
    expect(r).toHaveLength(1);
    expect(r[0].phone).toBe('9');
    expect(r[0].notes).toBe('nota nova');
    expect(r[0].vehicles).toHaveLength(2);
  });
  it('veículo repetido não duplica; telefone vazio mantém o antigo', () => {
    const r = learnClientData(base, 'Fulano Teste', 'Gol', 'A', '');
    expect(r[0].vehicles).toHaveLength(1);
    expect(r[0].phone).toBe('1');
    expect(r[0].notes).toBe('n');
  });
  // COMPORTAMENTO ATUAL (suspeito): o cliente é identificado pelo NOME; dois clientes homônimos viram um só.
  it('homônimos são fundidos', () => {
    const r = learnClientData(base, 'FULANO TESTE', 'Palio', 'C', '5');
    expect(r).toHaveLength(1);
    expect(r[0].vehicles.map(v => v.plate)).toEqual(['A', 'C']);
  });
});

describe('learnCatalogItems', () => {
  it('adiciona itens novos e ignora existentes (sem caixa)', () => {
    const r = learnCatalogItems([cat('1', 'Filtro')], [cat('2', 'FILTRO'), cat('3', 'Vela')]);
    expect(r.map(c => c.description)).toEqual(['Filtro', 'Vela']);
  });
  it('preenche categoria só se a existente não tiver', () => {
    const r = learnCatalogItems(
      [cat('1', 'Filtro'), cat('2', 'Vela', 1, { category: 'MOTOR' })],
      [cat('9', 'filtro', 1, { category: 'FREIO' }), cat('8', 'vela', 1, { category: 'FREIO' })]
    );
    expect(r[0].category).toBe('FREIO');
    expect(r[1].category).toBe('MOTOR');
  });
  // COMPORTAMENTO ATUAL (suspeito): item existente nunca tem preço/custo atualizado pelo aprendizado.
  it('preço novo de item existente é ignorado', () => {
    const r = learnCatalogItems([cat('1', 'Filtro', 1000)], [cat('2', 'Filtro', 5000)]);
    expect(r[0].price).toBe(1000);
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
