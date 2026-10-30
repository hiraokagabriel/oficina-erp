import type { OSPhoto, WorkOrder } from '../types';
import { photoCount } from './photos';
import { InvokeFn, isPhotoStoreAvailable, trashOSPhotos, trashPhoto } from './photoStore';
import { photosToTrashOnSave } from './photosView';

// Limpeza das fotos depois que o App salva ou exclui uma OS. Nunca bloqueia nem derruba a operação:
// falha de disco vira só um aviso no console (a foto fica na pasta, sem prejuízo).

type Warn = (message: string, error: unknown) => void;
const defaultWarn: Warn = (message, error) => console.warn(message, error);

/** Salvou a OS: manda para a lixeira as fotos que estavam salvas e saíram da lista. */
export const trashRemovedPhotos = async (
  dbPath: string,
  osId: string,
  before: readonly OSPhoto[] | undefined,
  after: readonly OSPhoto[] | undefined,
  available: boolean = isPhotoStoreAvailable(),
  invoke?: InvokeFn,
  warn: Warn = defaultWarn
): Promise<void> => {
  if (!available) return;
  for (const id of photosToTrashOnSave(before, after)) {
    try { await trashPhoto(dbPath, osId, id, invoke); } catch (e) { warn('Não foi possível mover a foto para a lixeira:', e); }
  }
};

/** Excluiu a OS: manda todas as fotos dela para a lixeira. */
export const trashDeletedOSPhotos = async (
  dbPath: string,
  os: Pick<WorkOrder, 'id' | 'photos'>,
  available: boolean = isPhotoStoreAvailable(),
  invoke?: InvokeFn,
  warn: Warn = defaultWarn
): Promise<void> => {
  if (!available || photoCount(os) === 0) return;
  try { await trashOSPhotos(dbPath, os.id, invoke); } catch (e) { warn('Não foi possível mover as fotos da OS para a lixeira:', e); }
};
