import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseTransport, toTransportError } from './supabaseRepo';
import { TransportError } from './syncEngine';
import type { CloudTable } from './types';

// Cliente supabase falso: grava as chamadas encadeadas e devolve o resultado combinado.

interface Result { data: unknown; error: unknown; status?: number }
type Call = [string, unknown[]];

class FakeQuery implements PromiseLike<Result> {
  calls: Call[] = [];
  constructor(private result: Result) {}
  private rec(name: string, args: unknown[]): this { this.calls.push([name, args]); return this; }
  select(...a: unknown[]) { return this.rec('select', a); }
  eq(...a: unknown[]) { return this.rec('eq', a); }
  gte(...a: unknown[]) { return this.rec('gte', a); }
  or(...a: unknown[]) { return this.rec('or', a); }
  in(...a: unknown[]) { return this.rec('in', a); }
  order(...a: unknown[]) { return this.rec('order', a); }
  limit(...a: unknown[]) { return this.rec('limit', a); }
  then<A, B>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve(this.result).then(ok, bad);
  }
}

interface FakeChannel {
  name: string;
  ons: { filter: Record<string, unknown>; cb: () => void }[];
  statusCb: ((s: string) => void) | null;
}

function fake(result: Result = { data: [], error: null }) {
  const queries: { table: string; q: FakeQuery }[] = [];
  const channels: FakeChannel[] = [];
  const removed: FakeChannel[] = [];
  const rpcCalls: { name: string; args: unknown }[] = [];
  let rpcResult: Result = result;
  const client = {
    from: (table: string) => { const q = new FakeQuery(result); queries.push({ table, q }); return q; },
    rpc: async (name: string, args: unknown) => { rpcCalls.push({ name, args }); return rpcResult; },
    channel: (name: string) => {
      const ch: FakeChannel = { name, ons: [], statusCb: null };
      channels.push(ch);
      const api = {
        on: (_t: string, filter: Record<string, unknown>, cb: () => void) => { ch.ons.push({ filter, cb }); return api; },
        subscribe: (cb: (s: string) => void) => { ch.statusCb = cb; return api; },
      };
      return api;
    },
    removeChannel: async (api: unknown) => { void api; removed.push(channels[channels.length - 1]); },
  };
  return { client: client as unknown as SupabaseClient, queries, channels, removed, rpcCalls, setRpc: (r: Result) => { rpcResult = r; } };
}

const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, version: 2, data: { id }, deleted_at: null, updated_at: '2026-11-11T12:00:00.123456+00:00', ...extra });

describe('toTransportError', () => {
  it('classifica por código e status', () => {
    expect(toTransportError({ code: '42501', message: 'x' }).kind).toBe('auth');
    expect(toTransportError({ code: 'PGRST301', message: 'x' }).kind).toBe('auth');
    expect(toTransportError({ code: '', message: 'JWT expired' }).kind).toBe('auth');
    expect(toTransportError({ code: 'XX', message: 'x' }, 401).kind).toBe('auth');
    expect(toTransportError({ code: '57014', message: 'x' }).kind).toBe('timeout');
    expect(toTransportError({ code: '40001', message: 'x' })).toMatchObject({ kind: 'server', code: '40001' });
    expect(toTransportError({ message: 'Failed to fetch' }).kind).toBe('network');
    expect(toTransportError(new TypeError('Failed to fetch')).kind).toBe('network');
  });
});

describe('createSupabaseTransport', () => {
  it('push: chama sync_push e devolve o array; resposta fora do formato vira erro tipado', async () => {
    const f = fake();
    f.setRpc({ data: [{ key: 'k', status: 'ok', rows: [] }], error: null });
    const t = createSupabaseTransport(f.client);
    expect(await t.push('ws', [{ key: 'k', rows: [] }])).toEqual([{ key: 'k', status: 'ok', rows: [] }]);
    expect(f.rpcCalls[0]).toEqual({ name: 'sync_push', args: { ws: 'ws', groups: [{ key: 'k', rows: [] }] } });
    f.setRpc({ data: { oops: 1 }, error: null });
    await expect(t.push('ws', [])).rejects.toMatchObject({ name: 'TransportError', kind: 'server' });
    f.setRpc({ data: null, error: { code: '57014', message: 'canceling' }, status: 500 });
    await expect(t.push('ws', [])).rejects.toMatchObject({ kind: 'timeout', code: '57014' });
    f.setRpc({ data: null, error: { code: '', message: 'Failed to fetch' } });
    await expect(t.push('ws', [])).rejects.toBeInstanceOf(TransportError);
  });

  it('pull com since: gte em updated_at, ordem (updated_at, id) e limite', async () => {
    const f = fake({ data: [row('C1')], error: null });
    const out = await createSupabaseTransport(f.client).pull('ws', 'clients', { since: '2026-11-11T11:59:55.000Z', after: null, limit: 1000 });
    const { table, q } = f.queries[0];
    expect(table).toBe('clients');
    expect(q.calls).toEqual([
      ['select', ['id, version, data, deleted_at, updated_at']],
      ['eq', ['workshop_id', 'ws']],
      ['gte', ['updated_at', '2026-11-11T11:59:55.000Z']],
      ['order', ['updated_at', { ascending: true }]],
      ['order', ['id', { ascending: true }]],
      ['limit', [1000]],
    ]);
    expect(out[0]).toMatchObject({ table: 'clients', id: 'C1', version: 2, deleted_at: null, updated_at: '2026-11-11T12:00:00.123456+00:00' });
  });

  it('pull com keyset: filtro or com a posição como texto (microssegundos intactos), sem gte', async () => {
    const f = fake();
    await createSupabaseTransport(f.client).pull('ws', 'clients', { since: null, after: { updated_at: '2026-11-11T12:00:00.123456+00:00', id: 'a"b' }, limit: 1000 });
    const calls = f.queries[0].q.calls;
    expect(calls.find(c => c[0] === 'gte')).toBeUndefined();
    expect(calls.find(c => c[0] === 'or')![1]).toEqual([
      'updated_at.gt.2026-11-11T12:00:00.123456+00:00,and(updated_at.eq.2026-11-11T12:00:00.123456+00:00,id.gt."a\\"b")',
    ]);
  });

  it('ledger traz os_id; outras tabelas não pedem a coluna', async () => {
    const f = fake({ data: [row('L1', { os_id: 'W1' }), row('L2', { os_id: null })], error: null });
    const t = createSupabaseTransport(f.client);
    const out = await t.pull('ws', 'ledger', { since: null, after: null, limit: 10 });
    expect(f.queries[0].q.calls[0]).toEqual(['select', ['id, version, data, deleted_at, updated_at, os_id']]);
    expect(out.map(r => r.os_id)).toEqual(['W1', null]);
    await t.pull('ws', 'clients', { since: null, after: null, limit: 10 });
    expect(f.queries[1].q.calls[0]).toEqual(['select', ['id, version, data, deleted_at, updated_at']]);
  });

  it('fetchByIds: .in("id", ...) em lotes de 200', async () => {
    const f = fake({ data: [row('x')], error: null });
    const ids = Array.from({ length: 250 }, (_, i) => `id${i}`);
    const out = await createSupabaseTransport(f.client).fetchByIds('ws', 'work_orders', ids);
    expect(f.queries).toHaveLength(2);
    const ins = f.queries.map(q => q.q.calls.find(c => c[0] === 'in')![1] as [string, string[]]);
    expect(ins[0][0]).toBe('id');
    expect(ins[0][1]).toHaveLength(200);
    expect(ins[1][1]).toHaveLength(50);
    expect(out).toHaveLength(2);
  });

  it('erro de select vira TransportError tipado', async () => {
    const f = fake({ data: null, error: { code: '42501', message: 'rls' }, status: 403 });
    await expect(createSupabaseTransport(f.client).pull('ws', 'clients', { since: null, after: null, limit: 1 })).rejects.toMatchObject({ kind: 'auth' });
  });

  it('realtime: um filtro por tabela, tópico único por montagem e sinal "all" em todo SUBSCRIBED (inclusive o 1º)', () => {
    const f = fake();
    const t = createSupabaseTransport(f.client);
    const signals: (CloudTable | 'all')[] = [];
    const off = t.subscribe('ws', ['clients', 'work_orders'], s => signals.push(s));
    t.subscribe('ws', ['clients'], () => undefined);
    expect(f.channels[0].name).not.toBe(f.channels[1].name);
    expect(f.channels[0].name.startsWith('sync:ws:')).toBe(true);
    expect(f.channels[0].ons.map(o => o.filter)).toEqual([
      { event: '*', schema: 'public', table: 'clients', filter: 'workshop_id=eq.ws' },
      { event: '*', schema: 'public', table: 'work_orders', filter: 'workshop_id=eq.ws' },
    ]);
    f.channels[0].ons[1].cb();
    expect(signals).toEqual(['work_orders']);
    f.channels[0].statusCb!('SUBSCRIBED');
    f.channels[0].statusCb!('CHANNEL_ERROR');
    f.channels[0].statusCb!('SUBSCRIBED');
    expect(signals).toEqual(['work_orders', 'all', 'all']);
    off();
    expect(f.removed).toHaveLength(1);
  });
});
