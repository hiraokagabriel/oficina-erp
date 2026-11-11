import { describe, it, expect } from 'vitest';
import type { WorkOrder } from '../types';
import {
  applyPushResult, enqueue, makeOp, markSending, pendingFor, resolveOp, toPushGroups,
} from './outbox';
import type { OutboxOp, PushGroupResult } from './outbox';

let n = 0;
const now = (): string => '2026-01-01T00:00:00.000Z';
const deps = { now: () => '2026-01-01T00:00:00.000Z', newId: () => `op${++n}` };

const PRICE = 98765;
const COST = 43210;
const TOTAL = 123456;

const os = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'W1', osNumber: 1, vehicle: 'Uno - AAA1111', clientName: 'Ana', clientPhone: '1', mileage: 10,
  status: 'EM_SERVICO', createdAt: '2026-01-01T15:00:00.000Z', total: TOTAL,
  parts: [{ id: 'p1', description: 'Filtro', price: PRICE, cost: COST }], services: [{ id: 's1', description: 'Troca', price: 5 }],
  ...over,
});

const mk = (over: Partial<Parameters<typeof makeOp>[0]> = {}): OutboxOp => makeOp({
  actor: 'u1', deviceId: 'd1', collection: 'clients', recordId: 'C1', kind: 'upsert',
  base: { id: 'C1', name: 'A' }, baseVersions: { main: 3 }, value: { id: 'C1', name: 'B' }, ...over,
}, deps);

describe('enqueue', () => {
  it('coalesce: 1 op por registro, valor novo, base e versões originais', () => {
    const a = mk();
    const b = mk({ value: { id: 'C1', name: 'C' }, base: { id: 'C1', name: 'X' }, baseVersions: { main: 9 } });
    const out = enqueue(enqueue([], a), b);
    expect(out).toHaveLength(1);
    expect(out[0].opId).toBe(a.opId);
    expect(out[0].value).toEqual({ id: 'C1', name: 'C' });
    expect(out[0].base).toEqual({ id: 'C1', name: 'A' });
    expect(out[0].baseVersions).toEqual({ main: 3 });
  });

  it('registros diferentes ficam separados', () => {
    expect(enqueue(enqueue([], mk()), mk({ recordId: 'C2' }))).toHaveLength(2);
  });

  it('registro novo + delete: a op some', () => {
    const novo = mk({ base: null, baseVersions: { main: 0 } });
    expect(enqueue(enqueue([], novo), mk({ kind: 'delete', value: null }))).toEqual([]);
  });

  it('registro existente: upsert + delete vira delete com a base original', () => {
    const out = enqueue(enqueue([], mk()), mk({ kind: 'delete', value: null }));
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('delete');
    expect(out[0].base).toEqual({ id: 'C1', name: 'A' });
  });

  it('delete + upsert (recria) vira upsert', () => {
    const out = enqueue(enqueue([], mk({ kind: 'delete', value: null })), mk());
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('upsert');
  });

  it('op sending não é trocada: a nova entra depois e herda a base no ack', () => {
    const a = mk();
    const sending = markSending([a], [a.opId]);
    const b = mk({ value: { id: 'C1', name: 'D' } });
    const q = enqueue(sending, b);
    expect(q).toHaveLength(2);
    expect(pendingFor(q, 'u1')).toEqual([]); // espera o ack
    const r = applyPushResult(q, [{ key: a.opId, status: 'ok', rows: [{ table: 'clients', id: 'C1', version: 4 }] }], now);
    expect(r.ops).toHaveLength(1);
    expect(r.ops[0].baseVersions.main).toBe(4);
    expect(r.ops[0].base).toEqual({ id: 'C1', name: 'B' });
    expect(pendingFor(r.ops, 'u1')).toHaveLength(1);
  });

  it('novo + delete com a primeira op no ar: vira delete (não some)', () => {
    const novo = mk({ base: null, baseVersions: { main: 0 } });
    const q = enqueue(markSending([novo], [novo.opId]), mk({ base: null, baseVersions: { main: 0 }, value: { id: 'C1' } }));
    const q2 = enqueue(q, mk({ kind: 'delete', value: null }));
    expect(q2).toHaveLength(2);
    expect(q2[1].kind).toBe('delete');
  });
});

describe('pendingFor', () => {
  it('só as do usuário atual e em pending', () => {
    const mine = mk();
    const other = mk({ actor: 'u2', recordId: 'C2' });
    const den = { ...mk({ recordId: 'C3' }), state: 'denied' as const };
    expect(pendingFor([mine, other, den], 'u1').map(o => o.opId)).toEqual([mine.opId]);
  });
});

describe('toPushGroups', () => {
  const fullOp = (value: WorkOrder, base: WorkOrder | null, v: OutboxOp['baseVersions'] = { main: 2, fin: 5, cost: 7 }): OutboxOp =>
    mk({ collection: 'workOrders', recordId: 'W1', base, value, baseVersions: base ? v : { main: 0 } });

  it('Dono: OS manda main, finance e costs juntas, com a versão de cada uma', () => {
    const g = toPushGroups([fullOp(os({ mileage: 11 }), os())], 'dono')[0];
    // main mudou; fin e costs iguais à base foram puladas
    expect(g.rows.map(r => r.table)).toEqual(['work_orders']);
    expect(g.rows[0].version).toBe(2);
    const g2 = toPushGroups([fullOp(os({ parts: [{ id: 'p1', description: 'Filtro', price: 1, cost: 2 }] }), os())], 'dono')[0];
    expect(g2.rows.map(r => [r.table, r.version])).toEqual([['work_order_finance', 5], ['work_order_costs', 7]]);
  });

  it('Dono: OS nova manda as 3 linhas com versão 0', () => {
    const g = toPushGroups([fullOp(os(), null)], 'dono')[0];
    expect(g.rows.map(r => [r.table, r.version])).toEqual([['work_orders', 0], ['work_order_finance', 0], ['work_order_costs', 0]]);
  });

  it('Recepção não emite custos', () => {
    const g = toPushGroups([fullOp(os(), null)], 'recepcao')[0];
    expect(g.rows.map(r => r.table)).toEqual(['work_orders', 'work_order_finance']);
    expect(JSON.stringify(g)).not.toContain(String(COST));
  });

  it('Mecânico nunca emite finance/costs e nenhum preço ou custo aparece no payload', () => {
    // visão do mecânico: sem valores (preço 0), mas o valor em memória pode estar contaminado: o splitter corta
    const dirty = os({ status: 'APROVADO' });
    const g = toPushGroups([fullOp(dirty, os(), { main: 2 })], 'mecanico');
    const json = JSON.stringify(g);
    expect(g[0].rows.every(r => r.table === 'work_orders')).toBe(true);
    for (const secret of [PRICE, COST, TOTAL]) expect(json).not.toContain(String(secret));
    expect(json).not.toContain('prices');
    expect(json).not.toContain('totalCost');
    // OS nova (version 0) também
    const g2 = JSON.stringify(toPushGroups([fullOp(dirty, null)], 'mecanico'));
    for (const secret of [PRICE, COST, TOTAL]) expect(g2).not.toContain(String(secret));
  });

  it('delete: linhas da base com deleted true', () => {
    const op = mk({ collection: 'workOrders', recordId: 'W1', kind: 'delete', value: null, base: os(), baseVersions: { main: 2, fin: 5 } });
    const rows = toPushGroups([op], 'recepcao')[0].rows;
    expect(rows.map(r => [r.table, r.version, r.deleted])).toEqual([['work_orders', 2, true], ['work_order_finance', 5, true]]);
  });

  it('ledger novo vai com os_id null; catálogo manda main, preço e custo por papel', () => {
    const led = mk({ collection: 'ledger', recordId: 'L1', base: null, baseVersions: { main: 0 }, value: { id: 'L1', amount: 1 } });
    expect(toPushGroups([led], 'recepcao')[0].rows[0]).toMatchObject({ table: 'ledger', version: 0, os_id: null });
    const cat = mk({ collection: 'catalogParts', recordId: 'c1', base: null, baseVersions: { main: 0 }, value: { id: 'c1', description: 'x', price: PRICE, cost: COST } });
    expect(toPushGroups([cat], 'dono')[0].rows.map(r => [r.table, r.id])).toEqual([
      ['catalog_parts', 'c1'], ['catalog_prices', 'part:c1'], ['catalog_costs', 'part:c1'],
    ]);
    expect(toPushGroups([cat], 'recepcao')[0].rows.map(r => r.table)).toEqual(['catalog_parts', 'catalog_prices']);
    expect(toPushGroups([cat], 'mecanico')[0].rows.map(r => r.table)).toEqual(['catalog_parts']);
  });
});

describe('applyPushResult', () => {
  const sending = (...ops: OutboxOp[]): OutboxOp[] => markSending(ops, ops.map(o => o.opId));

  it('ok: sai da fila e devolve as versões confirmadas', () => {
    const a = mk({ collection: 'workOrders', recordId: 'W1', baseVersions: { main: 2, fin: 5 } });
    const r = applyPushResult(sending(a), [{ key: a.opId, status: 'ok', rows: [
      { table: 'work_orders', id: 'W1', version: 3 }, { table: 'work_order_finance', id: 'W1', version: 6 },
    ] }], now);
    expect(r.ops).toEqual([]);
    expect(r.confirmed).toEqual([{ opId: a.opId, collection: 'workOrders', recordId: 'W1', versions: { main: 3, fin: 6 } }]);
  });

  it('ok com linha pulada mantém a versão conhecida dela', () => {
    const a = mk({ collection: 'workOrders', recordId: 'W1', baseVersions: { main: 2, fin: 5, cost: 7 } });
    const r = applyPushResult(sending(a), [{ key: a.opId, status: 'ok', rows: [{ table: 'work_orders', id: 'W1', version: 3 }] }], now);
    expect(r.confirmed[0].versions).toEqual({ main: 3, fin: 5, cost: 7 });
  });

  it('conflict: op fica em conflict e as linhas do servidor vão no retorno', () => {
    const a = mk();
    const rows = [{ table: 'clients' as const, id: 'C1', version: 8, data: { id: 'C1' }, deleted_at: null, updated_at: 't' }];
    const r = applyPushResult(sending(a), [{ key: a.opId, status: 'conflict', rows }], now);
    expect(r.ops[0].state).toBe('conflict');
    expect(r.conflicts).toEqual([{ opId: a.opId, collection: 'clients', recordId: 'C1', rows }]);
  });

  it('denied: nao_encontrado e 42501 viram denied com lastError', () => {
    const a = mk(); const b = mk({ recordId: 'C2' });
    const res: PushGroupResult[] = [
      { key: a.opId, status: 'denied', code: 'nao_encontrado', message: 'nao_encontrado' },
      { key: b.opId, status: 'denied', code: '42501', message: 'mecanico_campo_proibido' },
    ];
    const r = applyPushResult(sending(a, b), res, now);
    expect(r.ops.map(o => [o.state, o.lastError])).toEqual([['denied', 'nao_encontrado'], ['denied', 'mecanico_campo_proibido']]);
  });

  it('importacao_pendente volta a pending; erro de dados vira failed', () => {
    const a = mk(); const b = mk({ recordId: 'C2' });
    const r = applyPushResult(sending(a, b), [
      { key: a.opId, status: 'denied', code: 'importacao_pendente', message: 'importacao_pendente' },
      { key: b.opId, status: 'denied', code: '22023', message: 'linha_invalida' },
    ], now);
    expect(r.ops.map(o => o.state)).toEqual(['pending', 'failed']);
  });

  it('group sem resposta volta a pending; ops que não estavam sending ficam como estão', () => {
    const a = mk(); const idle = mk({ recordId: 'C9' });
    const r = applyPushResult([...sending(a), idle], [], now);
    expect(r.ops.map(o => o.state)).toEqual(['pending', 'pending']);
    expect(r.ops[0].lastError).toBe('sem_resposta');
  });

  it('resolveOp: depois do conflito a op volta a pending sobre as versões do servidor', () => {
    const a = mk();
    const c = applyPushResult(sending(a), [{ key: a.opId, status: 'conflict', rows: [{ table: 'clients', id: 'C1', version: 8, data: {}, deleted_at: null, updated_at: 't' }] }], now);
    const rb = resolveOp(c.ops, a.opId, { base: { id: 'C1' }, baseVersions: { main: 8 }, value: { id: 'C1', name: 'M' } });
    expect(rb[0]).toMatchObject({ state: 'pending', baseVersions: { main: 8 } });
    expect(rb[0].lastError).toBeUndefined();
  });
});
