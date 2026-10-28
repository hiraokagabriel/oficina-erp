import { describe, it, expect } from 'vitest';
import type { Client, Technician, WorkOrder } from '../types';
import {
  clientCountLabel, clientSummaryLine, countClientOrders, countTechnicianOrders, deleteClientMessage,
  deleteTechnicianMessage, filterClients, ordersPhrase,
} from './clientListView';

const cl = (id: string, name: string, phone: string, vehicles: Client['vehicles'] = []): Client => ({ id, name, phone, vehicles });
const os = (p: Partial<WorkOrder>): WorkOrder => ({ id: 'o', clientName: '', ...p } as WorkOrder);

describe('filterClients', () => {
  const list = [
    cl('1', 'Ana Souza', '(11) 90000-1111', [{ id: 'v1', model: 'Honda Civic', plate: 'ABC1D23' }]),
    cl('2', 'Bruno', '(21) 98888-2222'),
  ];
  it('vazio devolve a mesma lista', () => { expect(filterClients(list, '  ')).toBe(list); });
  it('acha por nome, telefone, modelo e placa', () => {
    expect(filterClients(list, 'ana').map(c => c.id)).toEqual(['1']);
    expect(filterClients(list, '98888').map(c => c.id)).toEqual(['2']);
    expect(filterClients(list, 'civic').map(c => c.id)).toEqual(['1']);
    expect(filterClients(list, 'abc1d').map(c => c.id)).toEqual(['1']);
  });
});

describe('clientSummaryLine', () => {
  it('sem telefone nem veículo', () => {
    expect(clientSummaryLine(cl('1', 'A', ''))).toEqual({ phone: 'Sem telefone', vehicle: 'Sem veículo' });
  });
  it('mostra o primeiro veículo e quantos mais', () => {
    const c = cl('1', 'A', '123', [{ id: 'a', model: 'Gol', plate: 'AAA1A11' }, { id: 'b', model: 'Uno', plate: '' }]);
    expect(clientSummaryLine(c)).toEqual({ phone: '123', vehicle: 'Gol AAA1A11 (+1)' });
  });
});

describe('textos', () => {
  it('plural das ordens', () => {
    expect(ordersPhrase(0)).toBe('nenhuma ordem de serviço');
    expect(ordersPhrase(1)).toBe('1 ordem de serviço');
    expect(ordersPhrase(4)).toBe('4 ordens de serviço');
  });
  it('contagem da lista', () => {
    expect(clientCountLabel(1, 1, false)).toBe('1 cliente');
    expect(clientCountLabel(3, 100, true)).toBe('3 de 100 clientes');
  });
  it('mensagens citam o nome e a quantidade', () => {
    expect(deleteClientMessage('Ana', 3)).toContain('"Ana"');
    expect(deleteClientMessage('Ana', 3)).toContain('3 ordens de serviço');
    expect(deleteClientMessage('Ana', 0)).toContain('não tem ordem de serviço');
    expect(deleteTechnicianMessage('Zé', 1)).toContain('1 ordem de serviço');
  });
});

describe('contagem de OS', () => {
  it('cliente: por id; homônimos não se misturam', () => {
    const a = cl('a', 'João', ''); const b = cl('b', 'João', '');
    const orders = [os({ clientId: 'a', clientName: 'João' }), os({ clientId: 'b', clientName: 'João' }), os({ clientId: 'b', clientName: 'João' })];
    expect(countClientOrders(orders, a, [a, b])).toBe(1);
    expect(countClientOrders(orders, b, [a, b])).toBe(2);
  });
  it('técnico: por id, ou pelo nome quando a OS não tem id', () => {
    const t: Technician = { id: 't1', name: 'Carlos' };
    const orders = [os({ technicianId: 't1' }), os({ technician: ' carlos ' }), os({ technicianId: 'outro', technician: 'Carlos' })];
    expect(countTechnicianOrders(orders, t)).toBe(2);
  });
});
