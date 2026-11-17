import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openIdbStore, openIdbDatabase, dbNameFor } from '../sync/idb';
import type { OutboxOp } from '../sync/outbox';
import { countQueuedPhotos, deleteRecoveryCopy, downloadStuckPhotos, listRecoveryCopies, listStuckPhotoStores, readQueuedPhotos, purgePersonCache, saveRecoveryCopyLocal } from './recoveryStore';

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


  it('purgePersonCache com foto na fila E outbox com ops: outbox vira cópia, banco não é apagado, fotos listadas', async () => {
    const f = new IDBFactory();
    const s = await openIdbStore({ workshopId: 'w', userId: 'u1', factory: f });
    await s.commit({ putRecords: [], putOps: [op('o1', 'u1'), op('o2', 'u1')], deleteOpIds: [] });
    s.close?.();
    const db = await openIdbDatabase(f, dbNameFor('w', 'u1'));
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('photoQueue', 'readwrite');
      tx.objectStore('photoQueue').put({ id: 'os1/f1', osId: 'os1', photoId: 'f1', full: new Uint8Array([1, 2, 3]).buffer });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    expect(await countQueuedPhotos('w', 'u1', f)).toBe(1);
    expect(await purgePersonCache('w', 'u1', f)).toBe(2);
    expect(await listRecoveryCopies(f)).toHaveLength(2);
    expect((await f.databases()).map(d => d.name)).toContain(dbNameFor('w', 'u1'));
    expect(await countQueuedPhotos('w', 'u1', f)).toBe(1);
    // rodar de novo não duplica a cópia (outbox já esvaziado)
    expect(await purgePersonCache('w', 'u1', f)).toBe(0);
    expect(await listRecoveryCopies(f)).toHaveLength(2);
    expect(await listStuckPhotoStores('w', 'outra', f)).toEqual([{ userId: 'u1', count: 1 }]);
    expect(await listStuckPhotoStores('w', 'u1', f)).toEqual([]);
    expect(await listStuckPhotoStores('w2', null, f)).toEqual([]);
    const files = await readQueuedPhotos('w', 'u1', f);
    expect(files.map(x => x.name)).toEqual(['foto-os1-f1.jpg']);
    expect(new Uint8Array(files[0].bytes)).toEqual(new Uint8Array([1, 2, 3]));
  });
});


describe('downloadStuckPhotos', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('um clique por foto (espaçados) e cada URL só é revogada depois de 60 s, não na hora', async () => {
    const f = new IDBFactory();
    const db = await openIdbDatabase(f, dbNameFor('w', 'u1'));
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('photoQueue', 'readwrite');
      tx.objectStore('photoQueue').put({ id: 'os1/f1', osId: 'os1', photoId: 'f1', full: new Uint8Array([1]).buffer });
      tx.objectStore('photoQueue').put({ id: 'os1/f2', osId: 'os1', photoId: 'f2', full: new Uint8Array([2]).buffer });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    const clicks: string[] = [];
    const revoked: string[] = [];
    let n = 0;
    vi.stubGlobal('document', { createElement: () => ({ href: '', download: '', click() { clicks.push(this.download); } }) });
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${++n}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(u => { revoked.push(u); });
    const delays: number[] = [];
    const realSet = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      delays.push(ms ?? 0);
      return ms === 60_000 ? (0 as unknown as ReturnType<typeof setTimeout>) : realSet(fn, 0);
    }) as typeof setTimeout);
    expect(await downloadStuckPhotos('w', 'u1', f)).toBe(2);
    expect(clicks).toEqual(['foto-os1-f1.jpg', 'foto-os1-f2.jpg']);
    expect(revoked).toEqual([]);
    expect(delays.filter(d => d === 60_000)).toHaveLength(2);
    expect(delays.some(d => d === 400)).toBe(true);
  });
});
