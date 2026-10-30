import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { generateId } from '../utils/helpers';
import { isValidPhotoId } from './photos';

// Ponte fina com os comandos Rust das fotos (save_photo, read_photo, trash_photos). Sem regra de negócio.
// `invoke` entra por parâmetro (padrão: o do Tauri) para os testes usarem um falso.

export type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

const defaultInvoke: InvokeFn = (cmd, args) => tauriInvoke(cmd, args);

/** Mesmo formato de retorno dos comandos que devolvem IoResult no Rust. */
interface IoResult {
  success: boolean;
  message: string;
}

/** Erro exato do Rust quando a foto não existe (nem na lixeira). */
export const PHOTO_NOT_FOUND = 'not_found';

/** Limite de object URLs guardadas; passando disso, as mais antigas sem uso são revogadas. */
export const MAX_CACHED_PHOTO_URLS = 200;

/** Só dentro do programa instalado (Tauri) há pasta de fotos; no navegador puro a UI avisa. */
export const isPhotoStoreAvailable = (): boolean =>
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

/** Id novo e seguro para nome de arquivo (UUID, só letras, números e hífen). */
export const newPhotoId = (): string => {
  const limpo = String(generateId()).replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
  return isValidPhotoId(limpo) ? limpo : `foto-${Date.now().toString(36)}`;
};

/**
 * Vec<u8> do Tauri 2 vem de JSON: precisa de number[] (um Uint8Array dentro de um objeto
 * seria serializado como objeto e o Rust recusaria).
 */
export const blobToByteArray = async (blob: Blob): Promise<number[]> => {
  const buf = await blob.arrayBuffer();
  return Array.from(new Uint8Array(buf));
};

const assertOk = (res: IoResult): void => {
  if (!res.success) throw new Error(res.message);
};

export const savePhoto = async (
  dbPath: string,
  osId: string,
  photoId: string,
  full: Blob,
  thumb: Blob,
  invoke: InvokeFn = defaultInvoke
): Promise<void> => {
  const [fullBytes, thumbBytes] = await Promise.all([blobToByteArray(full), blobToByteArray(thumb)]);
  const res = await invoke<IoResult>('save_photo', {
    dbPath,
    osId,
    photoId,
    full: fullBytes,
    thumb: thumbBytes,
  });
  assertOk(res);
};

// ---- cache de object URLs -------------------------------------------------
// Cada URL tem contagem de referências: quem usa chama acquirePhotoUrl e, ao terminar, releasePhotoUrl.
// URL sem uso fica guardada para reaproveitar e só é revogada pelo limite (a mais antiga sem uso) ou ao limpar o cache.

interface CacheEntry {
  url: string;
  refs: number;
}

const urlCache = new Map<string, CacheEntry>();

const cacheKey = (dbPath: string, osId: string, photoId: string, thumb: boolean): string =>
  `${dbPath}|${osId}/${photoId}/${thumb ? 't' : 'f'}`;

/** Esvazia o cache revogando tudo (troca de banco, testes). */
export const clearPhotoUrlCache = (): void => {
  for (const e of urlCache.values()) URL.revokeObjectURL(e.url);
  urlCache.clear();
};

const toBytes = (data: unknown): Uint8Array => {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Uint8Array) return data;
  if (Array.isArray(data)) return Uint8Array.from(data as number[]);
  throw new Error('Resposta de foto em formato inesperado');
};

const errorText = (e: unknown): string => (typeof e === 'string' ? e : e instanceof Error ? e.message : String(e));

/** Passando do limite, revoga as mais antigas SEM uso. Nunca revoga URL com referência. */
const evictIdle = (): void => {
  if (urlCache.size <= MAX_CACHED_PHOTO_URLS) return;
  for (const [k, e] of urlCache) {
    if (urlCache.size <= MAX_CACHED_PHOTO_URLS) break;
    if (e.refs > 0) continue;
    urlCache.delete(k);
    URL.revokeObjectURL(e.url);
  }
};

/**
 * Pega a object URL da foto (ou miniatura) e conta uma referência: chame releasePhotoUrl ao terminar.
 * Devolve `null` se o arquivo ainda não chegou (erro exato "not_found"); qualquer outro erro propaga.
 */
export const acquirePhotoUrl = async (
  dbPath: string,
  osId: string,
  photoId: string,
  thumb: boolean,
  invoke: InvokeFn = defaultInvoke
): Promise<string | null> => {
  const key = cacheKey(dbPath, osId, photoId, thumb);
  const cached = urlCache.get(key);
  if (cached) {
    cached.refs += 1;
    // reinsere no fim: mais recente
    urlCache.delete(key);
    urlCache.set(key, cached);
    return cached.url;
  }
  let data: unknown;
  try {
    data = await invoke<unknown>('read_photo', { dbPath, osId, photoId, thumb });
  } catch (e) {
    if (errorText(e) === PHOTO_NOT_FOUND) return null;
    throw e;
  }
  // Outra leitura da mesma foto pode ter terminado durante o await: reaproveita.
  const raced = urlCache.get(key);
  if (raced) {
    raced.refs += 1;
    return raced.url;
  }
  const url = URL.createObjectURL(new Blob([toBytes(data) as BlobPart], { type: 'image/jpeg' }));
  urlCache.set(key, { url, refs: 1 });
  evictIdle();
  return url;
};

/** Devolve uma referência. URL desconhecida (já limpa) é ignorada. */
export const releasePhotoUrl = (url: string): void => {
  for (const e of urlCache.values()) {
    if (e.url === url) {
      if (e.refs > 0) e.refs -= 1;
      evictIdle();
      return;
    }
  }
};

/** Move uma foto (original e miniatura) para a lixeira da pasta de fotos. */
export const trashPhoto = async (
  dbPath: string,
  osId: string,
  photoId: string,
  invoke: InvokeFn = defaultInvoke
): Promise<void> => {
  assertOk(await invoke<IoResult>('trash_photos', { dbPath, osId, photoId }));
};

/** Move todas as fotos da OS para a lixeira. */
export const trashOSPhotos = async (
  dbPath: string,
  osId: string,
  invoke: InvokeFn = defaultInvoke
): Promise<void> => {
  assertOk(await invoke<IoResult>('trash_photos', { dbPath, osId, photoId: null }));
};
