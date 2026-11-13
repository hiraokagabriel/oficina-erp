import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { generateId } from '../utils/helpers';
import { isValidPhotoId } from './photos';

// Ponte fina entre a tela e o lugar onde as fotos ficam. Sem regra de negócio.
// O lugar é um TRANSPORTE (`PhotoTransport`): no modo arquivo, os comandos Rust (save_photo, read_photo,
// trash_photos) via `invoke`; na nuvem, o Supabase Storage (`src/sync/photoTransport.ts`), registrado pelo
// `CloudDatabaseProvider` com `setPhotoTransport`. As funções aceitam `invoke` ou um transporte como último
// parâmetro (testes usam falsos); sem ele valem o transporte registrado e, por último, o do Tauri.

export type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

const defaultInvoke: InvokeFn = (cmd, args) => tauriInvoke(cmd, args);

/** Onde as fotos ficam. `read` devolve `null` quando a foto ainda não chegou (não existe); outro erro propaga. */
export interface PhotoTransport {
  kind: 'tauri' | 'cloud';
  save(dbPath: string, osId: string, photoId: string, full: Blob, thumb: Blob): Promise<void>;
  read(dbPath: string, osId: string, photoId: string, thumb: boolean): Promise<Blob | null>;
  /** `photoId` nulo = todas as fotos da OS. */
  trash(dbPath: string, osId: string, photoId: string | null): Promise<void>;
  /** A foto está guardada só neste aparelho, esperando para subir (nuvem). */
  isPending?(osId: string, photoId: string): boolean;
  /** O envio falhou de vez (erro definitivo); a foto segue só neste aparelho. */
  isFailed?(osId: string, photoId: string): boolean;
  /** Põe a foto com erro de volta na fila de envio. */
  retry?(osId: string, photoId: string): void;
}

/** Mesmo formato de retorno dos comandos que devolvem IoResult no Rust. */
interface IoResult {
  success: boolean;
  message: string;
}

/** Erro exato do Rust quando a foto não existe (nem na lixeira). */
export const PHOTO_NOT_FOUND = 'not_found';

/** Limite de object URLs guardadas; passando disso, as mais antigas sem uso são revogadas. */
export const MAX_CACHED_PHOTO_URLS = 200;

let activeTransport: PhotoTransport | null = null;

/** Registra (ou, com `null`, remove) o transporte da nuvem. Troca de oficina/pessoa: o provider remove e registra outro. */
export const setPhotoTransport = (t: PhotoTransport | null): void => { activeTransport = t; };

/** Qual lugar está valendo: `nuvem`, `arquivo` (Tauri) ou `nenhum` (navegador puro sem login). */
export const photoStoreKind = (): 'cloud' | 'tauri' | 'none' => {
  if (activeTransport) return activeTransport.kind;
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window) ? 'tauri' : 'none';
};

/** Há onde guardar fotos: nuvem logada ou programa instalado (Tauri). No navegador puro a UI avisa. */
export const isPhotoStoreAvailable = (): boolean => photoStoreKind() !== 'none';

/** Envio da foto falhou de vez (nuvem): mostra "Não foi enviada". */
export const isPhotoFailed = (osId: string, photoId: string): boolean => activeTransport?.isFailed?.(osId, photoId) ?? false;

/** "Tentar de novo" na foto com erro. */
export const retryPhoto = (osId: string, photoId: string): void => { activeTransport?.retry?.(osId, photoId); };

/** Foto guardada só neste aparelho, ainda subindo (nuvem). */
export const isPhotoPending = (osId: string, photoId: string): boolean => activeTransport?.isPending?.(osId, photoId) ?? false;

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

const errorText = (e: unknown): string => (typeof e === 'string' ? e : e instanceof Error ? e.message : String(e));

const toBytes = (data: unknown): Uint8Array => {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Uint8Array) return data;
  if (Array.isArray(data)) return Uint8Array.from(data as number[]);
  throw new Error('Resposta de foto em formato inesperado');
};

/** Transporte do modo arquivo: comandos Rust por `invoke`. */
export const createTauriTransport = (invoke: InvokeFn = defaultInvoke): PhotoTransport => ({
  kind: 'tauri',
  async save(dbPath, osId, photoId, full, thumb) {
    const [fullBytes, thumbBytes] = await Promise.all([blobToByteArray(full), blobToByteArray(thumb)]);
    assertOk(await invoke<IoResult>('save_photo', { dbPath, osId, photoId, full: fullBytes, thumb: thumbBytes }));
  },
  async read(dbPath, osId, photoId, thumb) {
    let data: unknown;
    try {
      data = await invoke<unknown>('read_photo', { dbPath, osId, photoId, thumb });
    } catch (e) {
      if (errorText(e) === PHOTO_NOT_FOUND) return null;
      throw e;
    }
    return new Blob([toBytes(data) as BlobPart], { type: 'image/jpeg' });
  },
  async trash(dbPath, osId, photoId) {
    assertOk(await invoke<IoResult>('trash_photos', { dbPath, osId, photoId }));
  },
});

const resolveTransport = (via?: InvokeFn | PhotoTransport): PhotoTransport => {
  if (typeof via === 'function') return createTauriTransport(via);
  return via ?? activeTransport ?? createTauriTransport();
};

export const savePhoto = async (
  dbPath: string,
  osId: string,
  photoId: string,
  full: Blob,
  thumb: Blob,
  via?: InvokeFn | PhotoTransport
): Promise<void> => {
  await resolveTransport(via).save(dbPath, osId, photoId, full, thumb);
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
  via?: InvokeFn | PhotoTransport
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
  const blob = await resolveTransport(via).read(dbPath, osId, photoId, thumb);
  if (blob === null) return null;
  // Outra leitura da mesma foto pode ter terminado durante o await: reaproveita.
  const raced = urlCache.get(key);
  if (raced) {
    raced.refs += 1;
    return raced.url;
  }
  const url = URL.createObjectURL(blob);
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

/** Tira a foto da OS: no arquivo vai para a lixeira da pasta de fotos; na nuvem só cancela o envio pendente (objetos ficam). */
export const trashPhoto = async (
  dbPath: string,
  osId: string,
  photoId: string,
  via?: InvokeFn | PhotoTransport
): Promise<void> => {
  await resolveTransport(via).trash(dbPath, osId, photoId);
};

/** Todas as fotos da OS (mesma regra de `trashPhoto`). */
export const trashOSPhotos = async (
  dbPath: string,
  osId: string,
  via?: InvokeFn | PhotoTransport
): Promise<void> => {
  await resolveTransport(via).trash(dbPath, osId, null);
};
