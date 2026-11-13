import { deleteIdbStore, openIdbStore } from '../sync/idb';
import { recoveryCopyContent } from '../sync/rejectMessages';

// Cópias de recuperação na WEB (docs/NUVEM-UX.md 6.3). Num PC compartilhado do navegador NÃO se baixa arquivo sozinho:
// a cópia fica neste banco do IndexedDB (`oficinapro-recovery`, store `copies`) e o Dono a baixa por
// `downloadRecoveryCopy`. No Tauri continua indo para a pasta `recuperacao` do app (comando `save_recovery_copy`).
// Banco separado do cache de cada pessoa: apagar o cache de uma pessoa desativada não pode levar as cópias junto.

const DB_NAME = 'oficinapro-recovery';
const STORE = 'copies';

export interface RecoveryCopy {
  id: string;
  name: string;
  savedAt: string;
  /** Pessoa a quem a cópia pertencia (quando conhecida). */
  userId: string | null;
  content: string;
}

const req = <T,>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error ?? new Error('IndexedDB')); });

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = factory.open(DB_NAME, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: 'id' }); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB'));
  });
}

async function withStore<T>(factory: IDBFactory, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDb(factory);
  try {
    const tx = db.transaction(STORE, mode);
    const out = await fn(tx.objectStore(STORE));
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
    return out;
  } finally { db.close(); }
}

const defaultFactory = (): IDBFactory => indexedDB;

export async function saveRecoveryCopyLocal(
  c: { name: string; content: string; userId?: string | null }, factory: IDBFactory = defaultFactory(),
): Promise<void> {
  const copy: RecoveryCopy = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: c.name, savedAt: new Date().toISOString(), userId: c.userId ?? null, content: c.content };
  await withStore(factory, 'readwrite', s => req(s.put(copy)));
}

export async function listRecoveryCopies(factory: IDBFactory = defaultFactory()): Promise<RecoveryCopy[]> {
  const all = await withStore(factory, 'readonly', s => req(s.getAll() as IDBRequest<RecoveryCopy[]>));
  return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function deleteRecoveryCopy(id: string, factory: IDBFactory = defaultFactory()): Promise<void> {
  await withStore(factory, 'readwrite', s => req(s.delete(id)));
}

/** Entrega a cópia como download (ação explícita do Dono). */
export function downloadRecoveryCopy(c: RecoveryCopy): void {
  const url = URL.createObjectURL(new Blob([c.content], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = c.name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Pessoa desativada ou removida deste aparelho: o que ela ainda não tinha enviado vira cópia de recuperação e só então
 * o banco local dela é apagado (`deleteIdbStore`). Devolve quantas alterações foram guardadas.
 */
export async function purgePersonCache(
  workshopId: string, userId: string, factory: IDBFactory = defaultFactory(),
): Promise<number> {
  let saved = 0;
  const store = await openIdbStore({ workshopId, userId, factory });
  try {
    const snap = await store.load();
    const now = new Date().toISOString();
    for (const op of snap.outbox) {
      if (op.actor !== userId) continue;
      await saveRecoveryCopyLocal({
        name: `recuperacao-${op.collection}-${now.replace(/[^0-9]/g, '').slice(0, 14)}-${saved + 1}.json`,
        content: recoveryCopyContent(op, now), userId,
      }, factory);
      saved++;
    }
  } finally {
    store.close?.();
  }
  await deleteIdbStore(workshopId, userId, factory);
  return saved;
}
