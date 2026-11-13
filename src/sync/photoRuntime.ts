import type { SupabaseClient } from '@supabase/supabase-js';
import type { PhotoTransport } from '../services/photoStore';
import { dbNameFor, openIdbDatabase } from './idb';
import { idbKv } from './kvStore';
import { PhotoThumbCache } from './photoCache';
import type { CachedThumb } from './photoCache';
import { PhotoQueue } from './photoQueue';
import type { QueuedPhoto } from './photoQueue';
import { createCloudPhotoTransport, createPhotoUploader, failedPhotoMessage, PHOTO_BUCKET } from './photoTransport';
import type { PhotoStorageApi } from './photoTransport';
import { realTimers } from './syncEngine';

// Liga as fotos da nuvem: abre a fila (`photoQueue`) e o cache (`photoCache`) do banco local da pessoa, monta o
// transporte e retoma os envios pendentes de sessões anteriores. O `CloudDatabaseProvider` chama isto ao montar.

export interface CloudPhotos {
  transport: PhotoTransport;
  queue: PhotoQueue;
  /** Para o envio e fecha o banco (depois de esperar o que estava no ar). */
  stop(): Promise<void>;
}

/** Adapta `supabase.storage.from('fotos')` ao que o transporte usa (`upsert:false`, só JPEG). */
export function supabaseStorageApi(supabase: SupabaseClient): PhotoStorageApi {
  const bucket = supabase.storage.from(PHOTO_BUCKET);
  return {
    upload: async (path, body) => {
      const { error } = await bucket.upload(path, body, { upsert: false, contentType: 'image/jpeg' });
      return { error };
    },
    download: async path => {
      const { data, error } = await bucket.download(path);
      return { data, error };
    },
  };
}

export interface StartCloudPhotosOptions {
  supabase: SupabaseClient;
  workshopId: string;
  userId: string;
  online: boolean;
  /** Erro definitivo de uma foto: o provider mostra o aviso. */
  onFailed: (item: QueuedPhoto, message: string) => void;
  factory?: IDBFactory;
}

export async function startCloudPhotos(o: StartCloudPhotosOptions): Promise<CloudPhotos> {
  const db = await openIdbDatabase(o.factory ?? indexedDB, dbNameFor(o.workshopId, o.userId));
  db.onversionchange = () => db.close();
  const storage = supabaseStorageApi(o.supabase);
  const queue = new PhotoQueue({
    store: idbKv<QueuedPhoto>(db, 'photoQueue'),
    uploader: createPhotoUploader(storage, o.workshopId),
    now: () => Date.now(),
    timers: realTimers,
    online: o.online,
    onFailed: (item, message) => o.onFailed(item, failedPhotoMessage(message)),
  });
  const cache = new PhotoThumbCache(idbKv<CachedThumb>(db, 'photoCache'), () => Date.now());
  await queue.load();
  return {
    transport: createCloudPhotoTransport({ storage, workshopId: o.workshopId, queue, cache }),
    queue,
    async stop() {
      queue.stop();
      await queue.settled();
      db.close();
    },
  };
}
