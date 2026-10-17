// Sugestão de preço pelo histórico: mediana dos preços praticados em OS finalizadas. Só sugere;
// nunca altera o catálogo. Puro: o "hoje" entra por parâmetro ('AAAA-MM-DD' local).
import { OrderItem, WorkOrder } from '../types';
import { addMonths, formatDateOnly, parseDateOnly } from '../utils/dates';
import { normalizeName } from '../utils/links';

export type ItemKind = 'PART' | 'SERVICE';

export interface PriceSuggestion {
  price: number;
  samples: number;
  min: number;
  max: number;
}

export interface PriceTarget {
  kind: ItemKind;
  catalogItemId?: string;
  description: string;
}

export interface PriceOptions {
  minSamples?: number;
  months?: number;
}

/** Mediana em centavos inteiros; par = média dos dois centrais arredondada. Vazio = null. */
export function median(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Item da OS é o mesmo do alvo: por catalogItemId; sem id em algum dos lados, pela descrição normalizada. */
export function isSameItem(item: OrderItem, target: { catalogItemId?: string; description: string }): boolean {
  if (item.catalogItemId && target.catalogItemId) return item.catalogItemId === target.catalogItemId;
  return normalizeName(item.description) !== '' && normalizeName(item.description) === normalizeName(target.description);
}

export function suggestHistoricalPrice(
  target: PriceTarget,
  workOrders: WorkOrder[],
  today: string,
  options: PriceOptions = {},
): PriceSuggestion | null {
  const minSamples = options.minSamples ?? 3;
  const months = options.months ?? 12;
  const cutoff = formatDateOnly(addMonths(parseDateOnly(today), -months));
  const prices: number[] = [];
  for (const os of workOrders) {
    if (os.status !== 'FINALIZADO') continue;
    const created = new Date(os.createdAt);
    if (isNaN(created.getTime())) continue;
    const day = formatDateOnly(created);
    if (day < cutoff || day > today) continue;
    const items = target.kind === 'PART' ? os.parts : os.services;
    for (const item of items ?? []) {
      if (isSameItem(item, target)) prices.push(item.price);
    }
  }
  if (prices.length < minSamples || prices.length === 0) return null;
  const price = median(prices);
  if (price === null) return null;
  return { price, samples: prices.length, min: Math.min(...prices), max: Math.max(...prices) };
}
