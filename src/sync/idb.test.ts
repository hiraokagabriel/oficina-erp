import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { dbNameFor, deleteIdbStore, openIdbStore } from './idb';
import { emptyMeta } from './store';
import type { StoredRecord } from './store';
import type { OutboxOp } from './outbox';

const rec = (n: number): StoredRecord => ({ data: { id: `C${n}`, name: 'x' }, versions: { main: n }, updatedAt: '2026-01-01T00:00:00.000Z', deleted: false });
const op = (id: string): OutboxOp => ({
  opId: id, actor: 'u', deviceId: 'd', collection: 'clients', recordId: 'C1', kind: 'upsert', base: null,
  baseVersions: { main: 0 }, value: { id: 'C1' }, createdAt: '2026-01-01T00:00:00.000Z', attempts: 0, state: 'pending',
});

describe('idb', () => {
  it('nome do banco por oficina e pessoa', () => {
    expect(dbNameFor('w1', 'u1')).toBe('oficinapro-w1-u1');
  });

  it('cria os stores e o índice da outbox', async () => {
    const factory = new IDBFactory();
    const store = await openIdbStore({ workshopId: 'w', userId: 'u', factory });
    store.close?.();
    const dbs = await factory.databases();
    expect(dbs.map(d => d.name)).toContain('oficinapro-w-u');
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = factory.open('oficinapro-w-u');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    expect([...db.objectStoreNames].sort()).toEqual(['meta', 'outbox', 'photoCache', 'photoQueue', 'records']);
    const tx = db.transaction('outbox');
    expect([...tx.objectStore('outbox').indexNames]).toEqual(['byRecord']);
    expect(tx.objectStore('outbox').index('byRecord').keyPath).toEqual(['collection', 'recordId']);
    db.close();
  });

  it('grava e relê registros, outbox e meta (sobrevive a reabrir)', async () => {
    const factory = new IDBFactory();
    const a = await openIdbStore({ workshopId: 'w', userId: 'u', factory });
    const meta = { ...emptyMeta(), role: 'dono' as const, cursor: { clients: { updated_at: '2026-01-01T00:00:00.123456+00:00', id: 'C1' } }, lastPullAt: '2026-01-02T00:00:00.000Z' };
    await a.commit({
      putRecords: [{ collection: 'clients', id: 'C1', rec: rec(1) }, { collection: 'workOrders', id: 'W1', rec: rec(2) }],
      putOps: [op('o1'), op('o2')], deleteOpIds: [], meta,
    });
    await a.commit({ putRecords: [{ collection: 'clients', id: 'C1', rec: rec(3) }], putOps: [], deleteOpIds: ['o1'] });
    a.close?.();

    const b = await openIdbStore({ workshopId: 'w', userId: 'u', factory });
    const snap = await b.load();
    expect(snap.records).toHaveLength(2);
    expect(snap.records.find(r => r.collection === 'clients' && r.id === 'C1')!.rec.versions.main).toBe(3);
    expect(snap.outbox.map(o => o.opId)).toEqual(['o2']);
    expect(snap.meta).toEqual(meta);
    b.close?.();
  });

  it('banco novo carrega vazio, com meta padrão; clear limpa tudo', async () => {
    const factory = new IDBFactory();
    const s = await openIdbStore({ workshopId: 'w', userId: 'u2', factory });
    expect(await s.load()).toEqual({ records: [], outbox: [], meta: emptyMeta() });
    await s.commit({ putRecords: [{ collection: 'clients', id: 'C1', rec: rec(1) }], putOps: [op('o1')], deleteOpIds: [], meta: { ...emptyMeta(), role: 'mecanico' } });
    await s.clear();
    expect(await s.load()).toEqual({ records: [], outbox: [], meta: emptyMeta() });
    s.close?.();
  });

  it('bancos de pessoas diferentes são separados; deleteIdbStore apaga', async () => {
    const factory = new IDBFactory();
    const a = await openIdbStore({ workshopId: 'w', userId: 'a', factory });
    const b = await openIdbStore({ workshopId: 'w', userId: 'b', factory });
    await a.commit({ putRecords: [{ collection: 'clients', id: 'C1', rec: rec(1) }], putOps: [], deleteOpIds: [] });
    expect((await b.load()).records).toHaveLength(0);
    a.close?.(); b.close?.();
    await deleteIdbStore('w', 'a', factory);
    const a2 = await openIdbStore({ workshopId: 'w', userId: 'a', factory });
    expect((await a2.load()).records).toHaveLength(0);
    a2.close?.();
  });

  it('outra janela que quer apagar ou atualizar o banco não fica travada (versionchange fecha a conexão)', async () => {
    const factory = new IDBFactory();
    const s = await openIdbStore({ workshopId: 'w', userId: 'v', factory });
    await deleteIdbStore('w', 'v', factory); // sem onversionchange isto ficaria bloqueado
    s.close?.();
    const again = await openIdbStore({ workshopId: 'w', userId: 'v', factory });
    expect((await again.load()).records).toHaveLength(0);
    again.close?.();
  });

  it('deleteIdbStore com conexão alheia aberta rejeita com erro claro em vez de esperar para sempre', async () => {
    const factory = new IDBFactory();
    await new Promise<void>((res, rej) => {
      const r = factory.open('oficinapro-w-b', 1);
      r.onsuccess = () => res(); // conexão alheia, sem tratar versionchange
      r.onerror = () => rej(r.error);
    });
    await expect(deleteIdbStore('w', 'b', factory)).rejects.toThrow(/aberto em outra janela/);
  });
});
