import type { OSPhoto, WorkOrder } from '../types';
import { resolveSavedPhotos } from './photoDraft';
import { MAX_PHOTOS_PER_OS } from './photos';

// Salvar da "visão de campo" (Mecânico, docs/NUVEM-UX.md 7.3): quem não tem `os.editFields` grava SÓ km e fotos
// por cima da OS ATUAL do banco. Puro. Nada de cliente, veículo, itens, preços, adiantamentos, status, vistoria
// ou lançamentos: o resto da OS sai idêntico (mesmas referências).

export interface FieldSaveInput {
  mileage: number;
  /** Lista do rascunho do modal (a verdade para as fotos). Sem lista, mantém as da OS. */
  photos?: readonly OSPhoto[];
}

export function applyFieldSave(current: WorkOrder, input: FieldSaveInput): WorkOrder {
  const mileage = Number.isFinite(input.mileage) && input.mileage >= 0 ? Math.floor(input.mileage) : current.mileage;
  const { photos: currentPhotos, ...rest } = current;
  const photos = resolveSavedPhotos(currentPhotos, input.photos)?.slice(0, MAX_PHOTOS_PER_OS);
  return { ...rest, mileage, ...(photos && photos.length > 0 ? { photos } : {}) };
}
