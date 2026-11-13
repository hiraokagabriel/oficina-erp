// Armazenamento chave-valor mínimo para a fila e o cache de fotos (docs/NUVEM-SPEC.md seção 4).
// `idbKv` usa um store do IndexedDB (a chave vem do `keyPath` do store); `memoryKv` serve aos testes.

export interface KvStore<T> {
  get(key: string): Promise<T | undefined>;
  getAll(): Promise<T[]>;
  put(value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

const req = <R,>(r: IDBRequest<R>): Promise<R> =>
  new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error ?? new Error('IndexedDB')); });

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB abortado'));
  });

export function idbKv<T>(db: IDBDatabase, storeName: 'photoQueue' | 'photoCache'): KvStore<T> {
  return {
    async get(key) {
      return await req(db.transaction(storeName, 'readonly').objectStore(storeName).get(key)) as T | undefined;
    },
    async getAll() {
      return await req(db.transaction(storeName, 'readonly').objectStore(storeName).getAll()) as T[];
    },
    async put(value) {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value);
      await done(tx);
    },
    async delete(key) {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      await done(tx);
    },
  };
}

export function memoryKv<T>(keyOf: (v: T) => string): KvStore<T> & { size(): number } {
  const m = new Map<string, T>();
  return {
    async get(k) { const v = m.get(k); return v === undefined ? undefined : structuredClone(v); },
    async getAll() { return [...m.values()].map(v => structuredClone(v)); },
    async put(v) { m.set(keyOf(v), structuredClone(v)); },
    async delete(k) { m.delete(k); },
    size: () => m.size,
  };
}
