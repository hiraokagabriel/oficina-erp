import type { OutboxOp } from './outbox';
import { CACHE_VERSION, emptyMeta } from './store';
import type { CommitBatch, LocalSnapshot, LocalStore, StoreMeta, StoredEntry, StoredRecord } from './store';
import type { CollectionKey } from './types';

// LocalStore em IndexedDB (docs/NUVEM-SPEC.md seção 4). Um banco por pessoa e oficina: o cache do Mecânico
// nunca contém preços porque nunca os recebeu. `photoQueue` e `photoCache` são criados aqui e usados por `photoIdb.ts` (PR 7).

export const IDB_VERSION = 1;
export const dbNameFor = (workshopId: string, userId: string): string => `oficinapro-${workshopId}-${userId}`;

const req = <T,>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error ?? new Error('IndexedDB')); });

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB abortado'));
  });

/** Abre (ou cria) o banco da pessoa com todos os stores. As fotos (`photoQueue`/`photoCache`) abrem a mesma base. */
export function openIdbDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = factory.open(name, IDB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('records'); // chave [collection, id]
      const outbox = db.createObjectStore('outbox', { keyPath: 'opId' });
      outbox.createIndex('byRecord', ['collection', 'recordId']);
      db.createObjectStore('meta');
      db.createObjectStore('photoQueue', { keyPath: 'id' });
      db.createObjectStore('photoCache', { keyPath: 'key' });
    };
    // Outra aba/janela com versão antiga aberta segura a abertura: avisa em vez de esperar para sempre.
    r.onblocked = () => reject(new Error('O banco local está aberto em outra janela do app. Feche as outras janelas e tente de novo.'));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB'));
  });
}

/** `factory` só para teste (fake-indexeddb); no app vale o `indexedDB` do navegador. */
export async function openIdbStore(opts: { workshopId: string; userId: string; factory?: IDBFactory }): Promise<LocalStore> {
  const factory = opts.factory ?? indexedDB;
  const db = await openIdbDatabase(factory, dbNameFor(opts.workshopId, opts.userId));
  // Outra janela quer atualizar ou apagar este banco: fecha a conexão para não travá-la.
  db.onversionchange = () => db.close();

  return {
    async load(): Promise<LocalSnapshot> {
      const tx = db.transaction(['records', 'outbox', 'meta'], 'readonly');
      const recStore = tx.objectStore('records');
      const keys = await req(recStore.getAllKeys());
      const vals = await req(recStore.getAll()) as StoredRecord[];
      const outbox = await req(tx.objectStore('outbox').getAll()) as OutboxOp[];
      const metaStore = tx.objectStore('meta');
      const mk = await req(metaStore.getAllKeys());
      const mv = await req(metaStore.getAll()) as unknown[];
      const meta: StoreMeta = emptyMeta();
      if (mk.length === 0) meta.cacheVersion = CACHE_VERSION;
      mk.forEach((k, i) => {
        if (k === 'cacheVersion') meta.cacheVersion = mv[i] as number;
        else if (k === 'cursor') meta.cursor = mv[i] as StoreMeta['cursor'];
        else if (k === 'role') meta.role = mv[i] as StoreMeta['role'];
        else if (k === 'lastPullAt') meta.lastPullAt = mv[i] as string | null;
      });
      const records: StoredEntry[] = keys.map((k, i) => {
        const [collection, id] = k as [CollectionKey, string];
        return { collection, id, rec: vals[i] };
      });
      return { records, outbox, meta };
    },

    async commit(batch: CommitBatch): Promise<void> {
      const tx = db.transaction(['records', 'outbox', 'meta'], 'readwrite');
      const records = tx.objectStore('records');
      const outbox = tx.objectStore('outbox');
      for (const e of batch.putRecords) records.put(e.rec, [e.collection, e.id]);
      for (const o of batch.putOps) outbox.put(o);
      for (const id of batch.deleteOpIds) outbox.delete(id);
      if (batch.meta) {
        const meta = tx.objectStore('meta');
        meta.put(batch.meta.cacheVersion, 'cacheVersion');
        meta.put(batch.meta.cursor, 'cursor');
        meta.put(batch.meta.role, 'role');
        meta.put(batch.meta.lastPullAt, 'lastPullAt');
      }
      await done(tx);
    },

    async clear(): Promise<void> {
      const tx = db.transaction(['records', 'outbox', 'meta'], 'readwrite');
      tx.objectStore('records').clear();
      tx.objectStore('outbox').clear();
      tx.objectStore('meta').clear();
      await done(tx);
    },

    close(): void { db.close(); },
  };
}

/** Apaga o banco local inteiro (pessoa desativada). */
export function deleteIdbStore(workshopId: string, userId: string, factory: IDBFactory = indexedDB): Promise<void> {
  return new Promise((resolve, reject) => {
    const r = factory.deleteDatabase(dbNameFor(workshopId, userId));
    r.onblocked = () => reject(new Error('O banco local ainda está aberto em outra janela do app. Feche-a e tente de novo.'));
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error ?? new Error('IndexedDB'));
  });
}
