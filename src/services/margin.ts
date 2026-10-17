// Margem de lucro: itens sem custo ficam FORA da conta e são contados à parte. Puro, sem telas.
// Dinheiro em centavos inteiros; só as porcentagens são float (arredonde só na exibição).
import { CatalogItem, OrderItem, PART_CATEGORY_META, PartCategory, WorkOrder, WorkshopSettings } from '../types';
import { normalizeName } from '../utils/links';
import { suggestHistoricalPrice } from './pricing';

export const DEFAULT_TARGET_MARGIN = 70;

/** Meta global em % inteiro (1..99); fora disso (ou ausente) cai no padrão. */
export function getTargetMargin(settings?: { targetMargin?: number } | WorkshopSettings | null): number {
  const v = settings?.targetMargin;
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 99 ? v : DEFAULT_TARGET_MARGIN;
}

export const hasCost = (item: Pick<OrderItem, 'cost'>): boolean =>
  typeof item.cost === 'number' && item.cost > 0;

export interface MarginResult {
  /** Soma dos preços de TODOS os itens. */
  revenue: number;
  /** Receita só dos itens com custo. */
  costedRevenue: number;
  cost: number;
  profit: number;
  /** profit / costedRevenue * 100; null se não há item com custo. */
  marginPct: number | null;
  /** costedRevenue / revenue * 100 (0 se revenue 0). */
  coveragePct: number;
  itemsWithoutCost: number;
  revenueWithoutCost: number;
}

export function computeMargin(items: OrderItem[]): MarginResult {
  let revenue = 0, costedRevenue = 0, cost = 0, itemsWithoutCost = 0, revenueWithoutCost = 0;
  for (const it of items) {
    revenue += it.price;
    if (hasCost(it)) {
      costedRevenue += it.price;
      cost += it.cost as number;
    } else {
      itemsWithoutCost += 1;
      revenueWithoutCost += it.price;
    }
  }
  const profit = costedRevenue - cost;
  return {
    revenue, costedRevenue, cost, profit,
    marginPct: costedRevenue > 0 ? (profit * 100) / costedRevenue : null,
    coveragePct: revenue > 0 ? (costedRevenue * 100) / revenue : 0,
    itemsWithoutCost, revenueWithoutCost,
  };
}

export const computeOSMargin = (os: Pick<WorkOrder, 'parts' | 'services'>): MarginResult =>
  computeMargin([...(os.parts ?? []), ...(os.services ?? [])]);

export type MarginLevel = 'SEM_CUSTO' | 'NA_META' | 'ATENCAO' | 'ABAIXO';

/** >= meta: NA_META; >= metade da meta: ATENCAO; abaixo disso: ABAIXO; null: SEM_CUSTO. */
export function marginLevel(marginPct: number | null, target: number): MarginLevel {
  if (marginPct === null) return 'SEM_CUSTO';
  if (marginPct >= target) return 'NA_META';
  if (marginPct >= target / 2) return 'ATENCAO';
  return 'ABAIXO';
}

/** Porcentagem para exibição: 1 casa no máximo, vírgula, sem ",0" ("72", "72,5"). */
export function formatPct(pct: number): string {
  const r = Math.round(pct * 10) / 10;
  return String(r).replace('.', ',');
}

export function marginLabel(level: MarginLevel, marginPct: number | null): string {
  if (level === 'SEM_CUSTO' || marginPct === null) return 'Sem custo';
  const p = formatPct(marginPct);
  if (level === 'NA_META') return `Margem ${p}%`;
  if (level === 'ATENCAO') return `Atenção (${p}%)`;
  return `Abaixo da meta (${p}%)`;
}

/** Preço que atinge a meta sobre o custo: custo / (1 - meta). null se custo <= 0 ou meta fora de 0..99. */
export function suggestPriceForTarget(costCents: number, targetPct: number): number | null {
  if (!(costCents > 0) || !(targetPct >= 0) || targetPct >= 100) return null;
  // Arredonda para cima: arredondar para baixo deixaria a margem real um pouco abaixo da meta.
  // A tolerância evita que ruído de ponto flutuante (ex.: 10000.000000000002) some 1 centavo.
  return Math.ceil((costCents * 100) / (100 - targetPct) - 1e-9);
}

export type PeriodMode = 'MONTH' | 'YEAR';

/** Mesmo filtro do Financeiro (useFinance.filteredWorkOrders): prefixo de createdAt. */
export function inPeriod(os: Pick<WorkOrder, 'createdAt'>, mode: PeriodMode, selectedMonth: string): boolean {
  const prefix = mode === 'YEAR' ? selectedMonth.slice(0, 4) : selectedMonth;
  return os.createdAt.startsWith(prefix);
}

export interface MarginRow {
  key: string;
  description: string;
  count: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number | null;
  coveragePct: number;
  medianPrice: number | null;
  catalogPrice: number | null;
}

export interface UncostedItem {
  key: string;
  description: string;
  kind: 'PART' | 'SERVICE';
  occurrences: number;
  revenue: number;
}

export interface MarginReport {
  target: number;
  scopeCount: number;
  totals: MarginResult;
  osBelowTarget: { os: WorkOrder; margin: MarginResult }[];
  byService: MarginRow[];
  byPart: MarginRow[];
  byCategory: MarginRow[];
  itemsWithoutCost: UncostedItem[];
}

export interface MarginReportInput {
  workOrders: WorkOrder[];
  settings?: { targetMargin?: number } | WorkshopSettings | null;
  mode: PeriodMode;
  selectedMonth: string;
  catalogParts: CatalogItem[];
  catalogServices: CatalogItem[];
  /** 'AAAA-MM-DD' local; âncora da janela de 12 meses da mediana. */
  today: string;
}

const SCOPE_STATUS: WorkOrder['status'][] = ['FINALIZADO', 'AGUARDANDO_PAGAMENTO'];
const LABOR_KEY = 'MAO_DE_OBRA';
const LABOR_LABEL = 'Mão de obra';

const itemKey = (it: OrderItem): string => it.catalogItemId || normalizeName(it.description);

/** Da PIOR margem para a melhor; sem margem (null) por último; empate: maior receita primeiro. */
function sortRows(rows: MarginRow[]): MarginRow[] {
  return rows.sort((a, b) => {
    if (a.marginPct === null && b.marginPct === null) return b.revenue - a.revenue;
    if (a.marginPct === null) return 1;
    if (b.marginPct === null) return -1;
    return a.marginPct - b.marginPct || b.revenue - a.revenue;
  });
}

interface Group {
  key: string;
  description: string;
  catalogItemId?: string;
  items: OrderItem[];
}

function addToGroup(map: Map<string, Group>, key: string, description: string, it: OrderItem, catalogItemId?: string): void {
  const g = map.get(key);
  if (g) g.items.push(it);
  else map.set(key, { key, description, catalogItemId, items: [it] });
}

function toRow(g: Group, medianPrice: number | null, catalogPrice: number | null): MarginRow {
  const m = computeMargin(g.items);
  return {
    key: g.key, description: g.description, count: g.items.length,
    revenue: m.revenue, cost: m.cost, profit: m.profit,
    marginPct: m.marginPct, coveragePct: m.coveragePct, medianPrice, catalogPrice,
  };
}

export function buildMarginReport(input: MarginReportInput): MarginReport {
  const { workOrders, mode, selectedMonth, catalogParts, catalogServices, today } = input;
  const target = getTargetMargin(input.settings);
  const scope = workOrders.filter(o => SCOPE_STATUS.includes(o.status) && inPeriod(o, mode, selectedMonth));

  const osBelowTarget: { os: WorkOrder; margin: MarginResult }[] = [];
  const allItems: OrderItem[] = [];
  const partGroups = new Map<string, Group>();
  const serviceGroups = new Map<string, Group>();
  const categoryGroups = new Map<string, Group>();
  const uncosted = new Map<string, UncostedItem>();

  const trackUncosted = (it: OrderItem, kind: 'PART' | 'SERVICE') => {
    if (hasCost(it)) return;
    const key = itemKey(it);
    const k = `${kind}:${key}`;
    const cur = uncosted.get(k);
    if (cur) { cur.occurrences += 1; cur.revenue += it.price; }
    else uncosted.set(k, { key, description: it.description, kind, occurrences: 1, revenue: it.price });
  };

  for (const os of scope) {
    const margin = computeOSMargin(os);
    if (margin.marginPct !== null && margin.marginPct < target) osBelowTarget.push({ os, margin });
    for (const it of os.parts ?? []) {
      allItems.push(it);
      addToGroup(partGroups, itemKey(it), it.description, it, it.catalogItemId);
      const cat: PartCategory = it.category ?? 'OUTROS';
      addToGroup(categoryGroups, cat, (PART_CATEGORY_META[cat] ?? PART_CATEGORY_META.OUTROS).label, it);
      trackUncosted(it, 'PART');
    }
    for (const it of os.services ?? []) {
      allItems.push(it);
      addToGroup(serviceGroups, itemKey(it), it.description, it, it.catalogItemId);
      addToGroup(categoryGroups, LABOR_KEY, LABOR_LABEL, it);
      trackUncosted(it, 'SERVICE');
    }
  }

  osBelowTarget.sort((a, b) => (a.margin.marginPct as number) - (b.margin.marginPct as number));

  const priceOf = (list: CatalogItem[], id?: string): number | null =>
    id ? (list.find(c => c.id === id)?.price ?? null) : null;

  const rowsFor = (groups: Map<string, Group>, kind: 'PART' | 'SERVICE', catalog: CatalogItem[]): MarginRow[] =>
    sortRows([...groups.values()].map(g => toRow(
      g,
      suggestHistoricalPrice({ kind, catalogItemId: g.catalogItemId, description: g.description }, workOrders, today)?.price ?? null,
      priceOf(catalog, g.catalogItemId),
    )));

  return {
    target,
    scopeCount: scope.length,
    totals: computeMargin(allItems),
    osBelowTarget,
    byService: rowsFor(serviceGroups, 'SERVICE', catalogServices),
    byPart: rowsFor(partGroups, 'PART', catalogParts),
    byCategory: sortRows([...categoryGroups.values()].map(g => toRow(g, null, null))),
    itemsWithoutCost: [...uncosted.values()].sort((a, b) => b.revenue - a.revenue),
  };
}
