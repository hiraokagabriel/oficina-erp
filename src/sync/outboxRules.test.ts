import { describe, it, expect } from 'vitest';
import type { WorkOrder } from '../types';
import {
  applyPushFailure, applyPushResult, dropOp, enqueue, makeOp, markSending, pendingFor, rebaseOp, toPushGroups,
} from './outbox';
import type { OutboxOp } from './outbox';
import { joinCatalogItem } from './split';

// Regras da revisão do PR 3: 1 op por registro, backoff, erros definitivos x transitórios, rebase, dropOp.

const now = (): string => '2026-01-01T00:00:00.000Z';
let n = 0;
const deps = { now, newId: () => `r${++n}` };
const COST = 43210;

const mk = (over: Partial<Parameters<typeof makeOp>[0]> = {}): OutboxOp => makeOp({
  actor: 'u1', deviceId: 'd1', collection: 'clients', recordId: 'C1', kind: 'upsert',
  base: { id: 'C1', name: 'A' }, baseVersions: { main: 3 }, value: { id: 'C1', name: 'B' }, ...over,
}, deps);
const sending = (...ops: OutboxOp[]): OutboxOp[] => markSending(ops, ops.map(o => o.opId));
const ver = (k: number) => ({ id: 'C1', name: `v${k}` });
const conflictRow = { table: 'clients' as const, id: 'C1', version: 8, data: {}, deleted_at: null, updated_at: 't' };

const os = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'W1', osNumber: 1, vehicle: 'Uno', clientName: 'Ana', clientPhone: '1', mileage: 10,
  status: 'EM_SERVICO', createdAt: '2026-01-01T15:00:00.000Z', total: 100,
  parts: [{ id: 'p1', description: 'Filtro', price: 100, cost: COST }], services: [], ...over,
});

describe('1 op por registro fora de sending (item 1)', () => {
  it('A sending, B na fila, rede falha, edição v3: uma op só com valor v3 e base original', () => {
    const a = mk({ base: ver(0), value: ver(1) });
    let q = enqueue(sending(a), mk({ base: ver(1), value: ver(2) }));
    expect(q).toHaveLength(2);
    q = applyPushFailure(q, 'rede', now).ops;
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ opId: a.opId, base: ver(0), value: ver(2), state: 'pending' });
    q = enqueue(q, mk({ base: ver(2), value: ver(3), baseVersions: { main: 9 } }));
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ value: ver(3), base: ver(0), baseVersions: { main: 3 } });
    expect(pendingFor(q, 'u1')).toHaveLength(1);
  });

  it('conflito e erro transitório também fundem', () => {
    const a = mk({ value: ver(1) });
    const q = enqueue(sending(a), mk({ value: ver(2) }));
    const c = applyPushResult(q, [{ key: a.opId, status: 'conflict', rows: [conflictRow] }], now);
    expect(c.ops).toHaveLength(1);
    expect(c.ops[0]).toMatchObject({ state: 'conflict', value: ver(2), opId: a.opId });
    const t = applyPushResult(q, [{ key: a.opId, status: 'denied', code: '40001', message: 'x' }], now);
    expect(t.ops).toHaveLength(1);
    expect(t.ops[0]).toMatchObject({ state: 'pending', value: ver(2) });
  });

  it('pendingFor manda no máximo 1 op por registro', () => {
    const a = mk(); const b = mk({ value: ver(5) });
    expect(pendingFor([a, b], 'u1')).toEqual([a]);
  });

  it('item 11: coalescência respeita o actor', () => {
    expect(enqueue([mk({ actor: 'u1' })], mk({ actor: 'u2' }))).toHaveLength(2);
  });
});

describe('erros e backoff (item 7)', () => {
  it('transitório (40001, 40P01, 57014, 55P03, 53xxx): pending com backoff', () => {
    for (const code of ['40001', '40P01', '57014', '55P03', '53200']) {
      const a = mk();
      const r = applyPushResult(sending(a), [{ key: a.opId, status: 'denied', code, message: 'x' }], now);
      expect(r.ops[0].state, code).toBe('pending');
      expect(r.retries).toEqual([{ opId: a.opId, nextAttemptAt: '2026-01-01T00:00:02.000Z' }]);
    }
  });

  it('backoff cresce com as tentativas e o limite vira failed', () => {
    const a = { ...mk(), attempts: 3, state: 'sending' as const };
    const r = applyPushResult([a], [{ key: a.opId, status: 'denied', code: '40001', message: 'x' }], now);
    expect(r.retries[0].nextAttemptAt).toBe('2026-01-01T00:00:08.000Z');
    const z = { ...mk(), attempts: 10, state: 'sending' as const };
    expect(applyPushResult([z], [{ key: z.opId, status: 'denied', code: '40001', message: 'x' }], now).ops[0].state).toBe('failed');
  });

  it('definitivo: classes 22/23/42 e códigos de negócio', () => {
    const run = (code: string, message: string): string => {
      const a = mk();
      return applyPushResult(sending(a), [{ key: a.opId, status: 'denied', code, message }], now).ops[0].state;
    };
    expect(run('23505', 'x')).toBe('failed');
    expect(run('42703', 'x')).toBe('failed');
    expect(run('22023', 'status_invalido')).toBe('failed');
    expect(run('P0001', 'id_divergente')).toBe('failed');
    expect(run('P0001', 'mecanico_campo_proibido')).toBe('denied');
    expect(run('P0001', 'money_op_required')).toBe('denied');
    expect(run('P0001', 'ledger_travado_por_os')).toBe('denied');
    expect(run('42501', 'x')).toBe('denied');
    expect(run('nao_encontrado', 'nao_encontrado')).toBe('denied');
  });

  it('sem_resposta tem backoff e limite alto; falha de rede não conta tentativa', () => {
    const a = mk();
    const r = applyPushResult(sending(a), [], now);
    expect(r.ops[0]).toMatchObject({ state: 'pending', attempts: 1, lastError: 'sem_resposta' });
    expect(r.retries).toHaveLength(1);
    const f = applyPushFailure(sending(a), 'rede', now);
    expect(f.ops[0]).toMatchObject({ state: 'pending', lastError: 'rede', attempts: 0 });
    expect(f.retries).toEqual([{ opId: a.opId, nextAttemptAt: '2026-01-01T00:00:05.000Z' }]);
    const many = { ...a, state: 'sending' as const, attempts: 20 };
    expect(applyPushFailure([many], 'rede', now).ops[0].state).toBe('pending');
    expect(applyPushResult([many], [], now).ops[0].state).toBe('pending');
  });
});

describe('dropOp, rebaseOp e denied (itens 5 e 8)', () => {
  it('dropOp remove e devolve a base para o provider reverter', () => {
    const a = { ...mk(), state: 'denied' as const };
    const r = dropOp([a], a.opId);
    expect(r.ops).toEqual([]);
    expect(r.reverted).toMatchObject({ collection: 'clients', recordId: 'C1', base: { id: 'C1', name: 'A' } });
    expect(dropOp([], 'x').reverted).toBeNull();
  });

  it('enqueue sobre op denied/failed não funde', () => {
    for (const state of ['denied', 'failed'] as const) {
      const a = { ...mk(), state };
      const q = enqueue([a], mk({ value: { id: 'C1', name: 'Z' } }));
      expect(q).toHaveLength(2);
      expect(q[0].state).toBe(state);
      expect(pendingFor(q, 'u1').map(o => o.value)).toEqual([{ id: 'C1', name: 'Z' }]);
    }
  });

  it('pull + rebaseOp: voltar ao valor antigo ainda é enviado', () => {
    const c = (phone: string) => ({ id: 'C1', name: 'A', phone });
    const op = mk({ base: c('1'), value: c('3'), baseVersions: { main: 3 } });
    // sem rebase a base fica velha e a linha seria pulada
    expect(toPushGroups(enqueue([op], mk({ value: c('1') })), 'recepcao')[0].rows).toEqual([]);
    // com rebase (o pull trouxe phone 2, versão 4)
    const q = enqueue([rebaseOp(op, c('2'), { main: 4 })], mk({ value: c('1') }));
    const rows = toPushGroups(q, 'recepcao')[0].rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ table: 'clients', version: 4, data: c('1') });
  });
});

describe('toPushGroups: casos extras (itens 4 e 9)', () => {
  it('OS existente com versão da finance desconhecida: a linha vai com version 0', () => {
    const value = os({ parts: [{ id: 'p1', description: 'Filtro', price: 1, cost: COST }] });
    const op = mk({ collection: 'workOrders', recordId: 'W1', base: os(), value, baseVersions: { main: 2 } });
    expect(toPushGroups([op], 'recepcao')[0].rows.map(r => [r.table, r.version])).toEqual([['work_order_finance', 0]]);
  });

  it('Dono apaga o custo de item do catálogo: manda catalog_costs com cost null; a junção vê sem custo', () => {
    const base = { id: 'c1', description: 'x', price: 10, cost: COST };
    const value = { id: 'c1', description: 'x', price: 10 };
    const op = mk({ collection: 'catalogParts', recordId: 'c1', base, value, baseVersions: { main: 1, fin: 2, cost: 3 } });
    const rows = toPushGroups([op], 'dono')[0].rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ table: 'catalog_costs', id: 'part:c1', version: 3, data: { kind: 'part', item_id: 'c1', cost: null } });
    expect(joinCatalogItem({ description: 'x' }, 'c1', 10, null).cost).toBeUndefined();
    expect(toPushGroups([op], 'recepcao')[0].rows).toEqual([]);
  });

  it('delete sem base não gera group; delete só com linhas de versão conhecida', () => {
    const semBase = mk({ kind: 'delete', value: null, base: null, baseVersions: { main: 0 } });
    expect(toPushGroups([semBase], 'dono')).toEqual([]);
    const semVersao = mk({ collection: 'workOrders', recordId: 'W1', kind: 'delete', value: null, base: os(), baseVersions: { main: 2 } });
    expect(toPushGroups([semVersao], 'dono')[0].rows.map(r => r.table)).toEqual(['work_orders']);
  });
});
