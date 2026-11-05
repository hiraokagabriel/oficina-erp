import { describe, expect, it } from 'vitest';
import { clientDebtLine, lastVisitLine } from './osClientContext';
import { Money } from '../utils/helpers';
import type { Client, LedgerEntry, WorkOrder } from '../types';

// Fixtures sintéticas.
const TODAY = '2026-03-15';
const cli = (id: string, name: string): Client => ({ id, name, phone: '', notes: '', vehicles: [] } as Client);
const os = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'o1', osNumber: 1, vehicle: 'Gol - AAA-0001', clientName: 'Fulano', clientId: 'c1', clientPhone: '', mileage: 45000,
  status: 'FINALIZADO', parts: [], services: [], total: 10000, createdAt: '2026-01-10T12:00:00.000Z', ...over,
});
const entry = (id: string, over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id, description: 'x', amount: 10000, type: 'CREDIT',
  effectiveDate: '2026-01-10T12:00:00.000Z', createdAt: '2026-01-10T12:00:00.000Z', ...over,
});
const clients = [cli('c1', 'Fulano'), cli('c2', 'Beltrano')];

describe('clientDebtLine', () => {
  const base = { clients, today: TODAY, clientName: 'Fulano', client: clients[0] };
  it('sem dívida: null', () => {
    expect(clientDebtLine({ ...base, workOrders: [os({ financialId: 'e1' })], ledger: [entry('e1', { paymentDate: '2026-01-10T12:00:00.000Z' })] })).toBeNull();
  });
  it('em aberto com parte atrasada', () => {
    const wos = [os({ financialId: 'e1' }), os({ id: 'o2', osNumber: 2, financialId: 'e2' })];
    const ledger = [
      entry('e1', { amount: 30000, dueDate: '2026-03-01T12:00:00.000Z' }),
      entry('e2', { amount: 20000, dueDate: '2026-04-01T12:00:00.000Z' }),
    ];
    expect(clientDebtLine({ ...base, workOrders: wos, ledger }))
      .toBe(`Deve ${Money.format(50000)} (${Money.format(30000)} atrasado)`);
  });
  it('em aberto sem atraso: sem parênteses', () => {
    const ledger = [entry('e1', { amount: 20000, dueDate: '2026-04-01T12:00:00.000Z' })];
    expect(clientDebtLine({ ...base, workOrders: [os({ financialId: 'e1' })], ledger })).toBe(`Deve ${Money.format(20000)}`);
  });
  it('não mistura a dívida de outro cliente', () => {
    const ledger = [entry('e1', { dueDate: '2026-03-01T12:00:00.000Z' })];
    expect(clientDebtLine({ ...base, client: clients[1], clientName: 'Beltrano', workOrders: [os({ financialId: 'e1' })], ledger })).toBeNull();
  });
  it('cliente fora do cadastro: liga pelo nome', () => {
    const wos = [os({ clientId: undefined, clientName: 'Avulso', financialId: 'e1' })];
    const ledger = [entry('e1', { dueDate: '2026-03-01T12:00:00.000Z' })];
    expect(clientDebtLine({ workOrders: wos, ledger, clients, client: undefined, clientName: ' avulso ', today: TODAY }))
      .toBe(`Deve ${Money.format(10000)} (${Money.format(10000)} atrasado)`);
  });
  it('nome vazio: null', () => {
    expect(clientDebtLine({ ...base, client: undefined, clientName: '  ', workOrders: [], ledger: [] })).toBeNull();
  });
});

describe('lastVisitLine', () => {
  const wos = [
    os({ id: 'a', osNumber: 3, createdAt: '2026-01-01T12:00:00.000Z', mileage: 40000 }),
    os({ id: 'b', osNumber: 5, createdAt: '2026-02-01T12:00:00.000Z', mileage: 45000 }),
    os({ id: 'c', osNumber: 6, createdAt: '2026-02-20T12:00:00.000Z', vehicle: 'Uno - BBB-0002', mileage: 90000 }),
    os({ id: 'd', osNumber: 7, createdAt: '2026-03-01T12:00:00.000Z', status: 'ORCAMENTO', mileage: 1 }),
    os({ id: 'e', osNumber: 8, createdAt: '2026-03-02T12:00:00.000Z', clientId: 'c2', clientName: 'Beltrano' }),
  ];
  const base = { workOrders: wos, clients, client: clients[0], clientName: 'Fulano' };
  it('mesmo carro (pela placa): última OS dele com km', () => {
    expect(lastVisitLine({ ...base, vehicle: 'Gol - aaa-0001' })).toBe('Última visita: OS #5, 45.000 km');
  });
  it('sem veículo digitado: última OS do cliente com o modelo (orçamento não conta)', () => {
    expect(lastVisitLine({ ...base, vehicle: '' })).toBe('Última visita: OS #6 (Uno), 90.000 km');
  });
  it('carro que nunca veio: null', () => {
    expect(lastVisitLine({ ...base, vehicle: 'Palio - ZZZ-9999' })).toBeNull();
  });
  it('só modelo digitado: compara pelo modelo', () => {
    expect(lastVisitLine({ ...base, vehicle: 'uno' })).toBe('Última visita: OS #6, 90.000 km');
  });
  it('ignora a OS em edição e outros clientes', () => {
    expect(lastVisitLine({ ...base, vehicle: 'Gol - AAA-0001', excludeId: 'b' })).toBe('Última visita: OS #3, 40.000 km');
    expect(lastVisitLine({ ...base, client: clients[1], clientName: 'Beltrano', vehicle: 'Uno - BBB-0002' })).toBeNull();
  });
  it('km não informado: sem km', () => {
    expect(lastVisitLine({ ...base, workOrders: [os({ mileage: 0 })], vehicle: '' })).toBe('Última visita: OS #1 (Gol)');
  });
  it('sem histórico: null', () => {
    expect(lastVisitLine({ ...base, workOrders: [], vehicle: '' })).toBeNull();
  });
});
