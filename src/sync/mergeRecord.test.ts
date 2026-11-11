import { describe, it, expect } from 'vitest';
import type { ChecklistSchema, WorkOrder } from '../types';
import { mergeRecord, OS_DELETED_MESSAGE } from './mergeRecord';
import type { MergeRecordResult } from './mergeRecord';

const checklist = (statuses: Record<string, 'pending' | 'ok' | 'attention' | 'urgent'>, notes = ''): ChecklistSchema => ({
  mileageIn: 0, notes,
  categories: [{ id: 'c1', label: 'Motor', items: Object.entries(statuses).map(([id, status]) => ({ id, label: id, status })) }],
});

const os = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'W1', osNumber: 1, vehicle: 'Uno - AAA1111', clientName: 'Ana', clientPhone: '1', mileage: 10,
  status: 'APROVADO', createdAt: '2026-01-01T15:00:00.000Z', total: 0,
  parts: [], services: [], checklist: checklist({ i1: 'pending', i2: 'pending', i3: 'pending' }), ...over,
});

const merged = (r: MergeRecordResult): Extract<MergeRecordResult, { kind: 'merged' }> => {
  if (r.kind !== 'merged') throw new Error(`esperava merged, veio ${r.kind}`);
  return r;
};
const items = (o: WorkOrder): Record<string, string> =>
  Object.fromEntries((o.checklist?.categories[0].items ?? []).map(i => [i.id, i.status]));

describe('mergeRecord: OS', () => {
  it('campos mexidos em lados diferentes: junta os dois', () => {
    const base = os();
    const r = merged(mergeRecord('workOrders', { base, value: os({ mileage: 55 }), server: os({ publicNotes: 'nota' }) }));
    const v = r.value as WorkOrder;
    expect(v.mileage).toBe(55);
    expect(v.publicNotes).toBe('nota');
    expect(r.conflicts).toEqual([]);
    expect(r.message).toBeUndefined();
  });

  it('mesmo campo: o local vence e o conflito vai para a mensagem', () => {
    const r = merged(mergeRecord('workOrders', { base: os(), value: os({ mileage: 55 }), server: os({ mileage: 70 }) }));
    expect((r.value as WorkOrder).mileage).toBe(55);
    expect(r.conflicts).toEqual(['km']);
    expect(r.message).toContain('km');
  });

  it('status em 3 vias: só o servidor mudou, fica o do servidor', () => {
    const r = merged(mergeRecord('workOrders', { base: os(), value: os({ mileage: 5 }), server: os({ status: 'EM_SERVICO' }) }));
    expect((r.value as WorkOrder).status).toBe('EM_SERVICO');
    expect((r.value as WorkOrder).mileage).toBe(5);
  });

  it('status: só o local mudou vale o local; os dois mudaram, local vence com conflito', () => {
    const a = merged(mergeRecord('workOrders', { base: os(), value: os({ status: 'EM_SERVICO' }), server: os({ mileage: 3 }) }));
    expect((a.value as WorkOrder).status).toBe('EM_SERVICO');
    expect(a.conflicts).toEqual([]);
    const b = merged(mergeRecord('workOrders', { base: os(), value: os({ status: 'EM_SERVICO' }), server: os({ status: 'AGUARDANDO_PAGAMENTO' }) }));
    expect((b.value as WorkOrder).status).toBe('EM_SERVICO');
    expect(b.conflicts).toContain('status');
  });

  it('vistoria por id de item: cada lado mexe num item', () => {
    const base = os();
    const value = os({ checklist: checklist({ i1: 'ok', i2: 'pending', i3: 'pending' }) });
    const server = os({ checklist: checklist({ i1: 'pending', i2: 'urgent', i3: 'pending' }) });
    const r = merged(mergeRecord('workOrders', { base, value, server }));
    expect(items(r.value as WorkOrder)).toEqual({ i1: 'ok', i2: 'urgent', i3: 'pending' });
    expect(r.conflicts).toEqual([]);
  });

  it('vistoria: mesmo item mexido nos dois lados, local vence com conflito', () => {
    const value = os({ checklist: checklist({ i1: 'ok', i2: 'pending', i3: 'pending' }) });
    const server = os({ checklist: checklist({ i1: 'urgent', i2: 'pending', i3: 'pending' }) });
    const r = merged(mergeRecord('workOrders', { base: os(), value, server }));
    expect(items(r.value as WorkOrder).i1).toBe('ok');
    expect(r.conflicts).toContain('vistoria');
  });

  it('vistoria: item acrescentado e item removido', () => {
    const value = os({ checklist: checklist({ i1: 'pending', i2: 'pending', i3: 'pending', i4: 'ok' }) });
    const server = os({ checklist: checklist({ i1: 'pending', i3: 'attention' }) }); // servidor removeu i2
    const r = merged(mergeRecord('workOrders', { base: os(), value, server }));
    expect(items(r.value as WorkOrder)).toEqual({ i1: 'pending', i3: 'attention', i4: 'ok' });
  });

  it('servidor apagou e o local editou: exclusão vence com OS_DELETED_MESSAGE', () => {
    const r = mergeRecord('workOrders', { base: os(), value: os({ mileage: 9 }), server: null });
    expect(r).toEqual({ kind: 'drop', reason: 'server_deleted', message: OS_DELETED_MESSAGE });
  });

  it('servidor igual ao local (ack perdido): concluída', () => {
    const v = os({ mileage: 9 });
    expect(mergeRecord('workOrders', { base: os(), value: v, server: { ...v } }).kind).toBe('done');
  });

  it('servidor igual ao local com ordem de chaves diferente: concluída', () => {
    const v = os({ mileage: 9 });
    const reordered = Object.fromEntries(Object.entries(v).reverse());
    expect(mergeRecord('workOrders', { base: os(), value: v, server: reordered }).kind).toBe('done');
  });

  it('o que o local não mexeu (dinheiro) vem do servidor', () => {
    const server = os({ financialId: 'L1', paymentDate: '2026-02-01', status: 'FINALIZADO' });
    const r = merged(mergeRecord('workOrders', { base: os(), value: os({ mileage: 5 }), server }));
    const v = r.value as WorkOrder;
    expect(v.financialId).toBe('L1');
    expect(v.status).toBe('FINALIZADO');
    expect(v.mileage).toBe(5);
  });
});

describe('mergeRecord: status e dinheiro (item 6)', () => {
  it('local EM_SERVICO -> AGUARDANDO_PAGAMENTO com servidor FINALIZADO: fica FINALIZADO e lista o conflito', () => {
    const base = os({ status: 'EM_SERVICO' });
    const server = os({ status: 'FINALIZADO', financialId: 'L1' });
    const r = merged(mergeRecord('workOrders', { base, value: os({ status: 'AGUARDANDO_PAGAMENTO', mileage: 3 }), server }));
    expect((r.value as WorkOrder).status).toBe('FINALIZADO');
    expect((r.value as WorkOrder).mileage).toBe(3);
    expect(r.conflicts).toContain('status');
  });
  it('transição sem dinheiro continua valendo o local', () => {
    const r = merged(mergeRecord('workOrders', { base: os({ status: 'APROVADO' }), value: os({ status: 'EM_SERVICO' }), server: os({ status: 'ORCAMENTO' }) }));
    expect((r.value as WorkOrder).status).toBe('EM_SERVICO');
  });
});

describe('mergeRecord: exclusão local com base nula', () => {
  it('base nula e servidor existente: exclusão segue (merged null)', () => {
    expect(mergeRecord('clients', { base: null, value: null, server: { id: 'C1' } })).toMatchObject({ kind: 'merged', value: null });
  });
});

describe('mergeRecord: outras coleções', () => {
  const c = (over: Record<string, unknown> = {}) => ({ id: 'C1', name: 'Ana', phone: '1', vehicles: [{ id: 'v1', plate: 'A' }], ...over });

  it('3 vias por chave de 1º nível', () => {
    const r = merged(mergeRecord('clients', { base: c(), value: c({ phone: '2' }), server: c({ notes: 'vip' }) }));
    expect(r.value).toEqual(c({ phone: '2', notes: 'vip' }));
    expect(r.conflicts).toEqual([]);
  });

  it('mesma chave: local vence com conflito; lista comparada inteira', () => {
    const r = merged(mergeRecord('clients', {
      base: c(), value: c({ name: 'Bia', vehicles: [{ id: 'v1', plate: 'A' }, { id: 'v2', plate: 'B' }] }),
      server: c({ name: 'Cris', vehicles: [{ id: 'v1', plate: 'Z' }] }),
    }));
    expect((r.value as { name: string }).name).toBe('Bia');
    expect((r.value as { vehicles: unknown[] }).vehicles).toHaveLength(2);
    expect(r.conflicts.sort()).toEqual(['name', 'vehicles']);
  });

  it('servidor apagou: descarta; servidor igual: done; registro novo: merged', () => {
    expect(mergeRecord('clients', { base: c(), value: c({ phone: '2' }), server: null }).kind).toBe('drop');
    expect(mergeRecord('clients', { base: c(), value: c({ phone: '2' }), server: c({ phone: '2' }) }).kind).toBe('done');
    expect(mergeRecord('clients', { base: null, value: c(), server: null }).kind).toBe('merged');
  });

  it('exclusão local: segue se o servidor não mudou; cancela se mudou; some se já foi', () => {
    expect(mergeRecord('clients', { base: c(), value: null, server: c() })).toMatchObject({ kind: 'merged', value: null });
    expect(mergeRecord('clients', { base: c(), value: null, server: c({ phone: '9' }) }).kind).toBe('drop');
    expect(mergeRecord('clients', { base: c(), value: null, server: null }).kind).toBe('done');
  });
});
