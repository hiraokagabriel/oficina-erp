import { describe, it, expect } from 'vitest';
import type { Client, OSStatus, WorkOrder } from '../types';
import { buildPlateOf, chipCounts, emptyChipText, filterWorkOrders, initialChip } from './mobileKanban';

const os = (p: Partial<WorkOrder>): WorkOrder =>
  ({ id: 'x', osNumber: 1, clientName: 'Ana', vehicle: 'Gol', status: 'ORCAMENTO', ...p }) as WorkOrder;

describe('chipCounts', () => {
  it('conta por status e ignora arquivadas', () => {
    const list = [os({ status: 'ORCAMENTO' }), os({ status: 'ORCAMENTO' }), os({ status: 'EM_SERVICO' }), os({ status: 'ARQUIVADO' })];
    const c = chipCounts(list);
    expect(c.ORCAMENTO).toBe(2);
    expect(c.EM_SERVICO).toBe(1);
    expect(c.FINALIZADO).toBe(0);
    expect(c.ARQUIVADO).toBe(0);
  });
});

describe('initialChip', () => {
  it('padrão por papel', () => {
    expect(initialChip(null, 'mecanico')).toBe('EM_SERVICO');
    expect(initialChip(null, 'dono')).toBe('ORCAMENTO');
    expect(initialChip(undefined, 'recepcao')).toBe('ORCAMENTO');
    expect(initialChip(null, undefined)).toBe('ORCAMENTO');
  });
  it('salvo válido vence; inválido ou arquivado cai no padrão', () => {
    expect(initialChip('FINALIZADO', 'mecanico')).toBe('FINALIZADO');
    expect(initialChip('ARQUIVADO', 'mecanico')).toBe('EM_SERVICO');
    expect(initialChip('lixo', 'dono')).toBe('ORCAMENTO');
  });
});

describe('filterWorkOrders sem plateOf (idêntico ao filtro antigo)', () => {
  const list = [
    os({ id: 'a', osNumber: 12, clientName: 'Maria', vehicle: 'Gol - ABC-1D23', clientPhone: '1199', technician: 'Zé' }),
    os({ id: 'b', osNumber: 345, clientName: 'João', vehicle: 'Uno' }),
  ];
  const antigo = (term: string) => {
    const t = term.toLowerCase();
    return list.filter((o) =>
      o.clientName.toLowerCase().includes(t) || o.vehicle.toLowerCase().includes(t) || o.osNumber.toString().includes(t) ||
      (o.clientPhone && o.clientPhone.includes(t)) || (o.technician || '').toLowerCase().includes(t));
  };
  it.each(['maria', 'GOL', '345', '1199', 'zé', 'abc-1d23', 'abc1d23', 'zzz'])('termo %s', (t) => {
    expect(filterWorkOrders(list, t)).toEqual(antigo(t));
  });
  it('vazio devolve a lista', () => { expect(filterWorkOrders(list, '')).toBe(list); });
});

describe('filterWorkOrders com plateOf', () => {
  const clients = [{ id: 'c1', name: 'Ana', phone: '', vehicles: [{ id: 'v1', model: 'Gol', plate: 'abc-1d23' }, { id: 'v2', model: 'Uno', plate: 'XYZ9999' }] }] as Client[];
  const list = [os({ id: 'a', clientId: 'c1', vehicleId: 'v1', vehicle: 'Gol' }), os({ id: 'b', clientId: 'c1', vehicleId: 'v2', vehicle: 'Uno' }), os({ id: 'c', clientName: 'Bia', vehicle: 'Palio - QWE1R23' })];
  const f = (t: string) => filterWorkOrders(list, t, buildPlateOf(clients)).map((o) => o.id);
  it('acha pela placa do cadastro, com ou sem hífen e caixa', () => {
    expect(f('ABC1D23')).toEqual(['a']);
    expect(f('abc-1')).toEqual(['a']);
    expect(f('xyz')).toEqual(['b']);
  });
  it('acha pela placa escrita no veículo da OS', () => { expect(f('qwe1r')).toEqual(['c']); });
  it('sem vínculo não acha nada', () => { expect(f('nada')).toEqual([]); });
  it('só pontuação não casa tudo', () => { expect(f('::')).toEqual([]); });
});

describe('emptyChipText', () => {
  it('usa o nome do status', () => {
    expect(emptyChipText('EM_SERVICO' as OSStatus)).toBe('Nenhuma OS em Em Serviço.');
  });
});
