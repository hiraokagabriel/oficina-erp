import type { WorkOrder } from '../types';

// "Espaço das fotos" da Config (decisão 5 do dono, docs/NUVEM-SPEC.md seção 8): aviso ao chegar a 80% de 1 GB.
// ESTIMATIVA, não medida: o app só lê as OS (cada `OSPhoto` é um objeto de original + miniatura no Storage). A RLS do
// Storage só deixa listar pelo API, pasta por pasta (uma chamada por OS), e o PostgREST não expõe `storage.objects`;
// então contamos as fotos que as OS referenciam e multiplicamos pelo tamanho médio (1 GB ≈ 3.000 fotos).
// Não entram: fotos de OS excluída e fotos removidas de uma OS (os objetos ficam no Storage, "lixeira = nada").
// Por isso é um piso: o painel do Supabase (Storage) mostra o uso exato.

export const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;
/** 1 GB / 3.000 fotos (decisão 5): original comprimido a 1600 px mais a miniatura. */
export const ESTIMATED_BYTES_PER_PHOTO = Math.round(STORAGE_LIMIT_BYTES / 3000);
export const PHOTO_SPACE_WARN_RATIO = 0.8;

export interface PhotoSpaceUsage {
  photos: number;
  usedBytes: number;
  limitBytes: number;
  /** 0 a 100 (pode passar de 100). Inteiro. */
  percent: number;
  warn: boolean;
}

export function photoSpaceUsage(workOrders: readonly Pick<WorkOrder, 'photos'>[]): PhotoSpaceUsage {
  let photos = 0;
  for (const os of workOrders) photos += os.photos?.length ?? 0;
  const usedBytes = photos * ESTIMATED_BYTES_PER_PHOTO;
  const ratio = usedBytes / STORAGE_LIMIT_BYTES;
  return {
    photos, usedBytes, limitBytes: STORAGE_LIMIT_BYTES, percent: Math.round(ratio * 100), warn: ratio >= PHOTO_SPACE_WARN_RATIO,
  };
}

/** "820 MB" ou "1,2 GB". */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1).replace('.', ',')} GB`;
  return `${Math.round(mb)} MB`;
}

export const PHOTO_SPACE_WARNING =
  'O espaço grátis das fotos está quase cheio. Para continuar guardando fotos, será preciso passar para o plano pago. Fale com quem configurou o sistema.';
