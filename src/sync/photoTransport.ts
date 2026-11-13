import type { PhotoTransport } from '../services/photoStore';
import { isValidPhotoId } from '../services/photos';
import { PhotoQueue } from './photoQueue';
import type { PhotoUploadResult, PhotoUploader } from './photoQueue';
import { PhotoThumbCache } from './photoCache';

// Transporte das fotos na nuvem (docs/NUVEM-SPEC.md seção 6): bucket privado `fotos`, caminho
// `<oficina>/<osId>/<fotoId>.jpg` e miniatura `<fotoId>.t.jpg`. O bucket não tem update nem delete (nunca sobrescreve,
// nunca apaga): "lixeira" aqui só cancela o envio pendente e os objetos ficam.

export const PHOTO_BUCKET = 'fotos';

export const photoPath = (workshopId: string, osId: string, photoId: string, thumb: boolean): string =>
  `${workshopId}/${osId}/${photoId}${thumb ? '.t' : ''}.jpg`;

/** Parte do `StorageError` do supabase-js que interessa (nome, mensagem e códigos HTTP). */
export interface StorageErrorLike {
  message?: string;
  name?: string;
  status?: number | string;
  statusCode?: number | string;
}

/** O que usamos de `supabase.storage.from('fotos')`; os testes entram com um falso. */
export interface PhotoStorageApi {
  upload(path: string, body: Blob): Promise<{ error: StorageErrorLike | null }>;
  download(path: string): Promise<{ data: Blob | null; error: StorageErrorLike | null }>;
}

const codeOf = (e: StorageErrorLike): number | null => {
  const v = e.statusCode ?? e.status;
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

const errorMessage = (e: StorageErrorLike): string => e.message || e.name || 'Erro desconhecido';

const isDuplicate = (e: StorageErrorLike): boolean => {
  if (codeOf(e) === 409) return true;
  const m = `${e.name ?? ''} ${e.message ?? ''}`;
  return /already exists|duplicate/i.test(m);
};

/** 404 do Storage (o supabase-js às vezes devolve status 400 com statusCode "404"). */
export const isNotFound = (e: StorageErrorLike): boolean => codeOf(e) === 404 || /not.?found/i.test(e.message ?? '');

/**
 * Resultado do envio: duplicado = ok (idempotente); rede, 5xx, 408, 425, 429 e 401 = temporário; o resto = definitivo
 * (403 sem acesso, 400/415 formato, 413 grande demais...).
 */
export function classifyUploadError(e: StorageErrorLike | null): PhotoUploadResult {
  if (e === null) return { ok: true };
  if (isDuplicate(e)) return { ok: true };
  const code = codeOf(e);
  const message = errorMessage(e);
  // Sem código HTTP (falha de rede, StorageUnknownError): temporário.
  const transient = code === null || code >= 500 || code === 408 || code === 425 || code === 429 || code === 401;
  if (transient) return { ok: false, kind: 'transient', message };
  return { ok: false, kind: 'definitive', message };
}

/** Texto para o usuário quando a foto não sobe de vez. */
export function failedPhotoMessage(message: string): string {
  const m = message.toLowerCase();
  if (/exceeded|too large|payload|413/.test(m)) return 'Uma foto não foi enviada: ficou grande demais.';
  if (/mime|type|415/.test(m)) return 'Uma foto não foi enviada: formato não aceito.';
  if (/row-level|policy|permission|403|unauthorized/.test(m)) return 'Uma foto não foi enviada: sem permissão. Avise quem configurou o sistema.';
  return 'Uma foto não foi enviada e ficou só neste aparelho. Tire a foto de novo.';
}

export function createPhotoUploader(storage: PhotoStorageApi, workshopId: string): PhotoUploader {
  return async (osId, photoId, thumb, bytes) => {
    try {
      const { error } = await storage.upload(photoPath(workshopId, osId, photoId, thumb), bytes);
      return classifyUploadError(error);
    } catch (e) {
      // `fetch` sem internet lança TypeError: temporário.
      return { ok: false, kind: 'transient', message: e instanceof Error ? e.message : String(e) };
    }
  };
}

export interface CloudPhotoTransportOptions {
  storage: PhotoStorageApi;
  workshopId: string;
  queue: PhotoQueue;
  cache: PhotoThumbCache;
}

export function createCloudPhotoTransport(o: CloudPhotoTransportOptions): PhotoTransport {
  const thumbKey = (osId: string, photoId: string): string => `${osId}/${photoId}`;
  return {
    kind: 'cloud',

    async save(_dbPath, osId, photoId, full, thumb) {
      // Mesma regra do caminho aceito pelo bucket (RLS) e do Rust: ids só com letras, números e hífen.
      if (!isValidPhotoId(osId) || !isValidPhotoId(photoId)) throw new Error('Identificador de foto inválido.');
      await o.queue.enqueue(osId, photoId, full, thumb); // grava no aparelho; sobe em segundo plano
      await o.cache.put(thumbKey(osId, photoId), thumb).catch(() => undefined);
    },

    async read(_dbPath, osId, photoId, thumb) {
      const local = o.queue.readLocal(osId, photoId, thumb);
      if (local) return local;
      if (thumb) {
        const cached = await o.cache.get(thumbKey(osId, photoId)).catch(() => null);
        if (cached) return cached;
      }
      const { data, error } = await o.storage.download(photoPath(o.workshopId, osId, photoId, thumb));
      if (error) {
        if (isNotFound(error)) return null;
        throw new Error(errorMessage(error));
      }
      if (!data) return null;
      if (thumb) await o.cache.put(thumbKey(osId, photoId), data).catch(() => undefined);
      return data;
    },

    async trash(_dbPath, osId, photoId) {
      await o.queue.cancel(osId, photoId);
    },

    isPending: (osId, photoId) => o.queue.has(osId, photoId),
    isFailed: (osId, photoId) => o.queue.isFailed(osId, photoId),
    retry: (osId, photoId) => o.queue.retryOne(osId, photoId),
  };
}
