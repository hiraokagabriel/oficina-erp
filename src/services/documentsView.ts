import { WorkOrder } from '../types';
import { normalizePlate, splitVehicle } from '../utils/links';
import type { DocKind } from './documents';

// Lógica pura da janela "Documentos": lista de OS do seletor e texto das opções.

const createdTime = (os: Pick<WorkOrder, 'createdAt'>): number => {
  const t = Date.parse(os.createdAt);
  return Number.isNaN(t) ? 0 : t;
};

type PickerOs = Pick<WorkOrder, 'osNumber' | 'clientName' | 'vehicle' | 'status' | 'createdAt'>;

/** Texto para busca: sem acentos, sem caixa, espaços únicos. Só a busca do seletor usa (não muda normalizeName). */
export const foldSearch = (s: string | undefined | null): string =>
  (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

/** PDF recém-salvo: caminho completo e só o nome do arquivo. */
export interface SavedPdf {
  path: string;
  fileName: string;
}

/** Quantos resultados o seletor mostra de uma vez. */
export const PICKER_LIMIT = 50;

/**
 * OS do seletor: só as não arquivadas, da mais recente para a mais antiga.
 * A busca vale para número ("#12" ou "12"), nome do cliente, placa e modelo do veículo.
 */
export function listPickerOrders<T extends PickerOs>(orders: T[], query: string): T[] {
  const live = orders
    .filter(o => o.status !== 'ARQUIVADO')
    .sort((a, b) => createdTime(b) - createdTime(a) || b.osNumber - a.osNumber);

  const text = foldSearch(query.replace(/^\s*#/, ''));
  if (!text) return live;
  const plateQuery = normalizePlate(query);

  return live.filter(o => {
    if (String(o.osNumber).includes(text)) return true;
    if (foldSearch(o.clientName).includes(text)) return true;
    const { model, plate } = splitVehicle(o.vehicle);
    // Placa só com 3+ caracteres: "2" é número da OS, não pedaço de placa.
    if (plateQuery.length >= 3 && normalizePlate(plate || o.vehicle).includes(plateQuery)) return true;
    return foldSearch(model).includes(text);
  });
}

/** Documentos que contam como "OS impressa" (marcam o aviso de primeira impressão). */
export const isOsDocument = (kind: DocKind): boolean => kind === 'OS' || kind === 'OS_CLIENTE' || kind === 'OS_OFICINA';

/** Aviso ao abrir a impressão: "Imprimindo via do cliente - OS #12...". */
export function printingMessage(kind: DocKind, osNumber: number): string {
  switch (kind) {
    case 'OS': return `Imprimindo OS #${osNumber}...`;
    case 'OS_CLIENTE': return `Imprimindo via do cliente - OS #${osNumber}...`;
    case 'OS_OFICINA': return `Imprimindo via da oficina - OS #${osNumber}...`;
    case 'RESUMO': return `Imprimindo resumo da OS #${osNumber}...`;
    case 'CHECKLIST':
    case 'CHECKLIST_RESUMIDO': return `Imprimindo vistoria da OS #${osNumber}...`;
  }
}

/** Nome do arquivo no fim de um caminho do Windows ou de outro sistema. */
export const fileNameFromPath = (path: string): string => {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
};

/** Texto curto de uma OS na lista: "OS #12 - Cliente - Veículo". */
export const pickerOrderLabel = (o: Pick<WorkOrder, 'osNumber' | 'clientName' | 'vehicle'>): string =>
  [`OS #${o.osNumber}`, o.clientName, o.vehicle].filter(s => (s ?? '').toString().trim()).join(' - ');
