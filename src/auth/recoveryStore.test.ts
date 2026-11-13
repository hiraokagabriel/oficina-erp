import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openIdbStore, dbNameFor } from '../sync/idb';
import type { OutboxOp } from '../sync/outbox';
import { deleteRecoveryCopy, listRecoveryCopies, purgePersonCache, saveRecoveryCopyLocal } from './recoveryStore';

const op = (id: string, actor: string): OutboxOp => ({
  opId: id, actor, deviceId: 'd', collection: 'clients', recordId: 'C1', kind: 'upsert', base: null,
  baseVersions: { main: 0 }, value: { id: 'C1', name: 'Novo' }, createdAt: '2026-01-01T00:00:00.000Z', attempts: 0, state: 'pending',
});

describe('recoveryStore', () => {
  it('guarda, lista (mais nova primeiro) e apaga', async () => {
    const f = new IDBFactory();
    await saveRecoveryCopyLocal({ name: 'a.json', content: '{}' }, f);
    await new Promise(r => setTimeout(r, 5));
    await saveRecoveryCopyLocal({ name: 'b.json', content: '{}', userId: 'u1' }, f);
    const list = await listRecoveryCopies(f);
    expect(list.map(c => c.name)).toEqual(['b.json', 'a.json']);
    await deleteRecoveryCopy(list[0].id, f);
    expect((await listRecoveryCopies(f)).map(c => c.name)).toEqual(['a.json']);
  });

  it('purgePersonCache guarda o que não foi enviado como cópia e apaga o banco da pessoa', async () => {
    const f = new IDBFactory();
    const s = await openIdbStore({ workshopId: 'w', userId: 'u1', factory: f });
    await s.commit({ putRecords: [], putOps: [op('o1', 'u1'), op('o2', 'u1')], deleteOpIds: [] });
    s.close?.();
    expect(await purgePersonCache('w', 'u1', f)).toBe(2);
    const copies = await listRecoveryCopies(f);
    expect(copies).toHaveLength(2);
    expect(JSON.parse(copies[0].content)).toMatchObject({ tipo: 'copia-de-recuperacao-nuvem', colecao: 'clients' });
    expect((await f.databases()).map(d => d.name)).not.toContain(dbNameFor('w', 'u1'));
  });
});
