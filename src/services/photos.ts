import type { Client, OSPhoto, WorkOrder } from '../types';
import { normalizeName, normalizePlate, splitVehicle } from '../utils/links';

// Regras PURAS das fotos da OS (schema v5). Sem I/O: arquivos JPEG ficam em `<pasta do banco>\fotos\<osId>\<photoId>.jpg`
// (miniatura `<photoId>.t.jpg`); no JSON só os metadados (`WorkOrder.photos`).

export const MAX_PHOTOS_PER_OS = 20;
/** Tamanho máximo do arquivo escolhido, antes de reduzir. */
export const MAX_PHOTO_FILE_BYTES = 25 * 1024 * 1024;

const PHOTO_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

/** Id seguro para virar nome de arquivo (sem separador de pasta, ponto ou espaço). */
export const isValidPhotoId = (id: unknown): id is string => typeof id === 'string' && PHOTO_ID_RE.test(id);

/** Reduz mantendo a proporção para caber em `max` no maior lado; nunca amplia. Lados inválidos devolvem 0x0. */
export const fitWithin = (w: number, h: number, max: number): { width: number; height: number } => {
  if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(max) || w <= 0 || h <= 0 || max <= 0) {
    return { width: 0, height: 0 };
  }
  const maior = Math.max(w, h);
  if (maior <= max) return { width: Math.round(w), height: Math.round(h) };
  const k = max / maior;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
};

export const photoCount = (os: Pick<WorkOrder, 'photos'>): number => os.photos?.length ?? 0;

/**
 * Acrescenta fotos respeitando o limite. Recusa (devolve em `recusadas`) o que passa do limite,
 * id inválido e id repetido (já na OS ou no próprio lote). Não muta a entrada.
 */
export const addPhotos = (
  os: WorkOrder,
  metas: OSPhoto[],
  limit: number = MAX_PHOTOS_PER_OS
): { os: WorkOrder; recusadas: OSPhoto[] } => {
  const atuais = os.photos ?? [];
  const ids = new Set(atuais.map(p => p.id));
  const aceitas: OSPhoto[] = [];
  const recusadas: OSPhoto[] = [];
  for (const m of metas) {
    if (!isValidPhotoId(m.id) || ids.has(m.id) || atuais.length + aceitas.length >= limit) {
      recusadas.push(m);
      continue;
    }
    ids.add(m.id);
    aceitas.push(m);
  }
  if (aceitas.length === 0) return { os, recusadas };
  return { os: { ...os, photos: [...atuais, ...aceitas] }, recusadas };
};

/** Tira a foto da lista (os arquivos são apagados por quem chama). Sem fotos sobrando, remove o campo. */
export const removePhoto = (os: WorkOrder, photoId: string): WorkOrder => {
  if (!os.photos?.some(p => p.id === photoId)) return os;
  const resto = os.photos.filter(p => p.id !== photoId);
  if (resto.length > 0) return { ...os, photos: resto };
  const { photos: _p, ...semFotos } = os;
  return semFotos;
};

/** Troca a legenda; texto vazio (ou só espaços) apaga a legenda. */
export const updateCaption = (os: WorkOrder, photoId: string, caption: string): WorkOrder => {
  if (!os.photos?.some(p => p.id === photoId)) return os;
  const texto = caption.trim();
  return {
    ...os,
    photos: os.photos.map(p => {
      if (p.id !== photoId) return p;
      const { caption: _c, ...resto } = p;
      return texto ? { ...resto, caption: texto } : resto;
    }),
  };
};

export type AcceptImageResult = { ok: true } | { ok: false; message: string };

const HEIC_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

/** Confere tipo e tamanho do arquivo escolhido (JPEG, PNG ou WebP, até 25 MB). */
export const acceptImageFile = (type: string, size: number): AcceptImageResult => {
  const t = (type || '').toLowerCase();
  if (HEIC_TYPES.has(t)) return { ok: false, message: 'Formato do iPhone: envie como JPG.' };
  if (!ACCEPTED_TYPES.has(t)) return { ok: false, message: 'Formato não aceito. Use JPG, PNG ou WebP.' };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, message: 'Arquivo vazio.' };
  if (size > MAX_PHOTO_FILE_BYTES) return { ok: false, message: 'Foto muito grande (máximo 25 MB).' };
  return { ok: true };
};

// ---------------------------------------------------------------------------
// Galeria do cliente e do carro, derivada das OS (nada novo no schema).
// ---------------------------------------------------------------------------

export interface PhotoRef {
  clientId?: string;
  clientName?: string;
  vehicleId?: string;
  /** "modelo - PLACA", como gravado na OS. */
  vehicle?: string;
}

export interface OSPhotoItem {
  os: WorkOrder;
  photo: OSPhoto;
}

/**
 * Mesmo cliente? Os dois com id: vale o id (homônimos com ids diferentes nunca se misturam).
 * Faltando id de um dos lados: cai no nome normalizado (como osBelongsToClient).
 */
const sameClient = (os: WorkOrder, ref: PhotoRef): boolean => {
  if (os.clientId && ref.clientId) return os.clientId === ref.clientId;
  const nome = normalizeName(ref.clientName);
  return nome !== '' && normalizeName(os.clientName) === nome;
};

/** Chave do carro: id; senão placa normalizada; senão modelo normalizado; vazio = sem carro. */
const vehicleKeyOf = (vehicleId: string | undefined, vehicle: string | undefined): string => {
  if (vehicleId) return `id:${vehicleId}`;
  const { model, plate } = splitVehicle(vehicle);
  const p = normalizePlate(plate);
  if (p) return `placa:${p}`;
  const m = normalizeName(model);
  return m ? `modelo:${m}` : '';
};

/** Mesmo carro? Dois ids: vale o id. Senão placa (se os dois têm) ou modelo, normalizados. */
const sameVehicle = (os: WorkOrder, ref: PhotoRef): boolean => {
  if (os.vehicleId && ref.vehicleId) return os.vehicleId === ref.vehicleId;
  const a = splitVehicle(os.vehicle);
  const b = splitVehicle(ref.vehicle);
  const pa = normalizePlate(a.plate);
  const pb = normalizePlate(b.plate);
  if (pa && pb) return pa === pb;
  const ma = normalizeName(a.model);
  const mb = normalizeName(b.model);
  return ma !== '' && ma === mb;
};

const byRecent = (a: OSPhotoItem, b: OSPhotoItem): number => {
  const ta = Date.parse(a.photo.createdAt);
  const tb = Date.parse(b.photo.createdAt);
  const da = Number.isNaN(ta) ? 0 : ta;
  const db = Number.isNaN(tb) ? 0 : tb;
  if (db !== da) return db - da;
  return b.os.osNumber - a.os.osNumber;
};

const hasVehicleRef = (ref: PhotoRef): boolean => vehicleKeyOf(ref.vehicleId, ref.vehicle) !== '';

/**
 * Fotos das OS do cliente (e do carro, se a referência tiver carro), da mais recente para a mais antiga.
 * Sem cliente na referência (nem id nem nome), devolve vazio: nunca mistura OS de pessoas diferentes.
 */
export const photosOfClientVehicle = (workOrders: WorkOrder[], ref: PhotoRef): OSPhotoItem[] => {
  if (!ref.clientId && normalizeName(ref.clientName) === '') return [];
  const filtrarCarro = hasVehicleRef(ref);
  const out: OSPhotoItem[] = [];
  for (const os of workOrders) {
    if (!os.photos?.length) continue;
    if (!sameClient(os, ref)) continue;
    if (filtrarCarro && !sameVehicle(os, ref)) continue;
    for (const photo of os.photos) out.push({ os, photo });
  }
  return out.sort(byRecent);
};

export interface VehiclePhotoGroup {
  key: string;
  /** Texto do carro ("modelo - PLACA") da OS mais recente do grupo; vazio = OS sem carro. */
  label: string;
  photos: OSPhotoItem[];
}

/** Fotos do cliente agrupadas por carro (para a tela Clientes). Grupos e fotos da mais recente para a mais antiga. */
export const groupPhotosByVehicle = (workOrders: WorkOrder[], ref: Pick<PhotoRef, 'clientId' | 'clientName'>): VehiclePhotoGroup[] => {
  const todas = photosOfClientVehicle(workOrders, ref);
  const grupos = new Map<string, VehiclePhotoGroup>();
  for (const item of todas) {
    // Placa primeiro: o mesmo carro com OS antigas (sem id) e novas (com id) fica num grupo só.
    const textual = vehicleKeyOf(undefined, item.os.vehicle);
    const key = (textual.startsWith('placa:') ? textual : vehicleKeyOf(item.os.vehicleId, item.os.vehicle)) || 'sem-carro';
    const g = grupos.get(key);
    if (g) g.photos.push(item);
    else grupos.set(key, { key, label: item.os.vehicle ?? '', photos: [item] });
  }
  return [...grupos.values()];
};

/**
 * OS com foto que aparecem na galeria do cliente só porque o NOME bate: a OS não tem `clientId` e existe
 * mais de um cliente com esse nome normalizado (homônimo). Serve ao aviso "complete o cadastro".
 * Não muda quem aparece na galeria (isso é `sameClient`). Da menor para a maior OS.
 */
export const nameOnlyMatches = (
  workOrders: WorkOrder[],
  clients: Pick<Client, 'id' | 'name'>[],
  client: Pick<Client, 'id' | 'name'>
): WorkOrder[] => {
  const nome = normalizeName(client.name);
  if (nome === '') return [];
  const homonimos = clients.filter(c => normalizeName(c.name) === nome).length;
  if (homonimos < 2) return [];
  return workOrders
    .filter(os => !os.clientId && !!os.photos?.length && normalizeName(os.clientName) === nome)
    .sort((a, b) => a.osNumber - b.osNumber);
};
