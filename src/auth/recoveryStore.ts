import { downloadBlob, downloadTextFile } from '../utils/download';
import { dbNameFor, deleteIdbStore, openIdbDatabase, openIdbStore } from '../sync/idb';
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
  downloadTextFile(c.name, c.content, 'application/json');
}

/** Quantas fotos esperam para subir no banco local da pessoa (a fila `photoQueue`, com os bytes). */
export async function countQueuedPhotos(
  workshopId: string, userId: string, factory: IDBFactory = defaultFactory(),
): Promise<number> {
  const db = await openIdbDatabase(factory, dbNameFor(workshopId, userId));
  try {
    return await new Promise<number>((resolve, reject) => {
      const r = db.transaction('photoQueue', 'readonly').objectStore('photoQueue').count();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error ?? new Error('IndexedDB'));
    });
  } finally { db.close(); }
}

/** Banco local de outra pessoa com fotos ainda na fila de envio (os bytes só existem nele). */
export interface StuckPhotoStore { userId: string; count: number }

/**
 * Bancos locais de OUTRAS pessoas desta oficina com fotos na fila (ex.: pessoa desativada com foto pendente: o banco
 * não é apagado). Sem `indexedDB.databases()` (navegador antigo) devolve lista vazia.
 */
export async function listStuckPhotoStores(
  workshopId: string, currentUserId: string | null, factory: IDBFactory = defaultFactory(),
): Promise<StuckPhotoStore[]> {
  if (typeof factory.databases !== 'function') return [];
  const prefix = dbNameFor(workshopId, '');
  const out: StuckPhotoStore[] = [];
  for (const d of await factory.databases()) {
    if (!d.name || !d.name.startsWith(prefix)) continue;
    const userId = d.name.slice(prefix.length);
    if (!userId || userId === currentUserId) continue;
    const count = await countQueuedPhotos(workshopId, userId, factory);
    if (count > 0) out.push({ userId, count });
  }
  return out;
}

/** Fotos (original) na fila do banco local de uma pessoa, para o Dono baixar. */
export async function readQueuedPhotos(
  workshopId: string, userId: string, factory: IDBFactory = defaultFactory(),
): Promise<{ name: string; bytes: ArrayBuffer }[]> {
  const db = await openIdbDatabase(factory, dbNameFor(workshopId, userId));
  try {
    const rows = await new Promise<{ osId: string; photoId: string; full: ArrayBuffer }[]>((resolve, reject) => {
      const r = db.transaction('photoQueue', 'readonly').objectStore('photoQueue').getAll();
      r.onsuccess = () => resolve(r.result as { osId: string; photoId: string; full: ArrayBuffer }[]);
      r.onerror = () => reject(r.error ?? new Error('IndexedDB'));
    });
    return rows.map(x => ({ name: `foto-${x.osId}-${x.photoId}.jpg`, bytes: x.full }));
  } finally { db.close(); }
}

const CLICK_GAP_MS = 400;
const wait = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

/** Entrega as fotos presas como downloads (ação explícita do Dono). Um clique por vez, espaçados; cada URL é revogada depois de 60 s. */
export async function downloadStuckPhotos(workshopId: string, userId: string, factory: IDBFactory = defaultFactory()): Promise<number> {
  const photos = await readQueuedPhotos(workshopId, userId, factory);
  for (let i = 0; i < photos.length; i++) {
    const f = photos[i];
    downloadBlob(f.name, new Blob([f.bytes], { type: 'image/jpeg' }));
    if (i < photos.length - 1) await wait(CLICK_GAP_MS);
  }
  return photos.length;
}

/**
 * Pessoa desativada ou removida deste aparelho: o que ela ainda não tinha enviado vira cópia de recuperação e só então
 * o banco local dela é apagado (`deleteIdbStore`). Devolve quantas alterações foram guardadas.
 * Com fotos ainda na fila de envio o texto (outbox) vira cópia do mesmo jeito, mas o BANCO NÃO é apagado: os bytes das
 * fotos só existem nele. O outbox é esvaziado (não duplica a cópia se rodar de novo) e Config > Cópias de recuperação
 * lista as fotos presas (`listStuckPhotoStores`) para o Dono baixar.
 */
export async function purgePersonCache(
  workshopId: string, userId: string, factory: IDBFactory = defaultFactory(),
): Promise<number> {
  const photos = await countQueuedPhotos(workshopId, userId, factory);
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
    if (photos > 0) await store.clear(); // o texto já virou cópia; só as fotos ficam
  } finally {
    store.close?.();
  }
  if (photos === 0) await deleteIdbStore(workshopId, userId, factory);
  return saved;
}
