import type {
  Appointment, AuditEvent, CatalogItem, Client, DatabaseSchema, InstallmentConfig, LedgerEntry,
  OrderItem, OSAdvance, Technician, WorkOrder, WorkshopSettings,
} from '../types';
import { stripDbSecrets } from '../utils/secrets';
import { sumAdvances } from '../services/osRemaining';
import { ensureUniqueItemIds } from '../utils/itemIds';
import type { CatalogKind, CloudRole, CloudRow } from './types';

// Lógica pura da divisão do banco v5 em linhas da nuvem (docs/NUVEM-SPEC.md seções 1, 4 e 7).
// Sem relógio, sem aleatoriedade, sem I/O.

// ---------- permissões por papel (spec seção 4, "Visão por papel") ----------

/** Papel indefinido = visão completa (importação e exportação, que rodam como dono). */
const canSeeFinance = (role?: CloudRole): boolean => role !== 'mecanico';
const canSeeCosts = (role?: CloudRole): boolean => role === undefined || role === 'dono';
const canSeeAudit = (role?: CloudRole): boolean => role === undefined || role === 'dono';

/** Cópia JSON pura: some com `undefined` e garante dados serializáveis. */
const pure = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

// ---------- prepareForCloud ----------

function cleanClient(c: Client): Client {
  const { totalSpent, serviceCount, lastServiceDate, averageTicket, vipStatus, ...rest } = c;
  void totalSpent; void serviceCount; void lastServiceDate; void averageTicket; void vipStatus;
  return rest;
}

function cleanOS(os: WorkOrder): WorkOrder {
  const { profitMargin, ...rest } = os;
  void profitMargin;
  return { ...rest, ...ensureUniqueItemIds(os.id, os.parts, os.services) };
}

/**
 * Banco pronto para a nuvem. Puro (não muta a entrada) e idempotente:
 * ids de item únicos por OS, sem derivados de cliente, sem `profitMargin`, sem segredos do Google.
 */
export function prepareForCloud(db: DatabaseSchema): DatabaseSchema {
  const stripped = stripDbSecrets(db);
  // Peças e serviços dividem o mesmo espaço de ids na nuvem (catalog_prices/catalog_costs são por id do item).
  const taken = new Set<string>();
  const catalogParts = fixCatalogIds(stripped.catalogParts ?? [], 'peca', taken);
  const catalogServices = fixCatalogIds(stripped.catalogServices ?? [], 'servico', taken);
  return {
    ...stripped,
    catalogParts,
    catalogServices,
    workOrders: db.workOrders.map(cleanOS),
    clients: db.clients.map(cleanClient),
  };
}

/**
 * Catálogo de bancos antigos pode ter item sem id ou com id repetido (o modo arquivo nunca exigiu). Na nuvem o id é a
 * chave: o primeiro com cada id fica como está (as OS que apontam para ele continuam ligadas) e os demais ganham um id
 * novo e estável (mesmo arquivo = mesmo id, então reenviar a importação continua idempotente). Nenhum item é apagado.
 */
export function fixCatalogIds<T extends { id?: string }>(items: T[], prefix: string, taken: Set<string>): T[] {
  return items.map((item, i) => {
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (id && !taken.has(id)) { taken.add(id); return item; }
    let n = 0;
    let fresh = `${prefix}-ajuste-${i + 1}`;
    while (taken.has(fresh)) fresh = `${prefix}-ajuste-${i + 1}-${++n}`;
    taken.add(fresh);
    return { ...item, id: fresh };
  });
}

// ---------- ledgerOwnerIndex ----------

/**
 * `ledgerId -> osId`. Vínculos: `financialId`, `advances[].entryId`, `advanceEntryId` (legado) e
 * lançamentos com `installmentGroupId === installmentConfig.groupId`. Em conflito vale a primeira OS.
 */
export function ledgerOwnerIndex(db: Pick<DatabaseSchema, 'workOrders' | 'ledger'>): Map<string, string> {
  const owner = new Map<string, string>();
  const claim = (ledgerId: string | undefined, osId: string) => {
    if (ledgerId && !owner.has(ledgerId)) owner.set(ledgerId, osId);
  };
  const groupOwner = new Map<string, string>();
  for (const os of db.workOrders) {
    claim(os.financialId, os.id);
    claim(os.advanceEntryId, os.id);
    for (const a of os.advances ?? []) claim(a.entryId, os.id);
    const g = os.installmentConfig?.groupId;
    if (g && !groupOwner.has(g)) groupOwner.set(g, os.id);
  }
  for (const e of db.ledger) {
    const osId = e.installmentGroupId ? groupOwner.get(e.installmentGroupId) : undefined;
    if (osId) claim(e.id, osId);
  }
  return owner;
}

// ---------- WorkOrder: split / join ----------

/** Item sem valores (o que o Mecânico vê). */
export type ItemMain = Omit<OrderItem, 'price' | 'cost'>;

type FinanceKeys =
  | 'total' | 'financialId' | 'paymentDate' | 'paymentMethod' | 'installmentConfig'
  | 'advances' | 'advanceAmount' | 'advanceEntryId';
type CostKeys = 'totalCost' | 'profit';

/** `work_orders.data`. */
export type WorkOrderMain = Omit<WorkOrder, 'parts' | 'services' | 'profitMargin' | FinanceKeys | CostKeys> & {
  parts: ItemMain[];
  services: ItemMain[];
};

/** `work_order_finance.data`. */
export interface WorkOrderFinance {
  prices: Record<string, number>;
  total: number;
  financialId?: string;
  paymentDate?: string;
  paymentMethod?: 'SINGLE' | 'INSTALLMENT';
  installmentConfig?: InstallmentConfig;
  advances?: OSAdvance[];
  advanceAmount?: number;
  advanceEntryId?: string;
  /** Chaves desconhecidas da OS (fora da lista branca de `work_orders`): ficam do lado protegido. */
  extra?: Record<string, unknown>;
}

/** `work_order_costs.data`. */
export interface WorkOrderCosts {
  costs: Record<string, number>;
  totalCost?: number;
  profit?: number;
}

/**
 * Lista branca de `work_orders.data` (spec seção 1). `OrderItem`s vão sem valores. `src/types.ts` não tem
 * outro campo não financeiro em `WorkOrder`; qualquer chave fora desta lista (ex.: `notes`, legado)
 * vai para `work_order_finance.data.extra` e não chega ao Mecânico.
 */
const MAIN_KEYS = [
  'id', 'osNumber', 'vehicle', 'clientName', 'clientPhone', 'clientId', 'vehicleId', 'technicianId',
  'mileage', 'status', 'createdAt', 'checklist', 'publicNotes', 'technician', 'expectedDate', 'photos',
] as const;

export interface SplitOS {
  main: WorkOrderMain;
  fin?: WorkOrderFinance;
  cost?: WorkOrderCosts;
}

/**
 * Divide a OS (já passada por `prepareForCloud`: ids de item únicos). `profitMargin` é descartado.
 * Sem papel = tudo. Mecânico: só `main`. Recepção: `main` + `fin`. Dono: as três.
 * `cost` só existe se algum custo (ou `totalCost`/`profit`) estiver informado.
 */
export function splitWorkOrder(os: WorkOrder, role?: CloudRole): SplitOS {
  const {
    parts, services, total, totalCost, profit, profitMargin,
    financialId, paymentDate, paymentMethod, installmentConfig, advances, advanceAmount, advanceEntryId,
    ...rest
  } = os;
  void profitMargin;
  const strip = (items: OrderItem[] | undefined): ItemMain[] =>
    (items ?? []).map(it => { const { price, cost, ...m } = it; void price; void cost; return m; });

  const mainObj: Record<string, unknown> = {};
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if ((MAIN_KEYS as readonly string[]).includes(k)) mainObj[k] = v;
    else if (v !== undefined) extra[k] = v;
  }
  const out: SplitOS = {
    main: pure({ ...mainObj, parts: strip(parts), services: strip(services) }) as WorkOrderMain,
  };
  const all = [...(parts ?? []), ...(services ?? [])];

  if (canSeeFinance(role)) {
    const prices: Record<string, number> = {};
    // Item sem preço grava null (JSON mantém a chave); a junção devolve o item sem `price`.
    for (const it of all) prices[it.id] = typeof it.price === 'number' ? it.price : (null as unknown as number);
    out.fin = pure({
      prices, total, financialId, paymentDate, paymentMethod, installmentConfig, advances, advanceAmount, advanceEntryId,
      extra: Object.keys(extra).length > 0 ? extra : undefined,
    }) as WorkOrderFinance;
  }

  if (canSeeCosts(role)) {
    const costs: Record<string, number> = {};
    for (const it of all) if (it.cost !== undefined) costs[it.id] = it.cost;
    if (Object.keys(costs).length > 0 || totalCost !== undefined || profit !== undefined) {
      out.cost = pure({ costs, totalCost, profit }) as WorkOrderCosts;
    }
  }
  return out;
}

const itemIds = (main: WorkOrderMain): Set<string> =>
  new Set([...main.parts, ...main.services].map(it => it.id));

/**
 * Junta as metades da OS. Devolve `null` (= "mantenha a OS anterior até a outra metade chegar") quando
 * `fin` existe mas o conjunto de ids dos itens de `main` difere das chaves de `fin.prices`: as metades
 * são de salvamentos diferentes e juntar zeraria preços. Sem `fin`: `price: 0` e `total: 0`.
 * Sem `cost`: `cost` indefinido ("não informado"). Custos de ids que não existem mais são ignorados.
 */
export function joinWorkOrder(main: WorkOrderMain, fin?: WorkOrderFinance, cost?: WorkOrderCosts): WorkOrder | null {
  if (fin) {
    const ids = itemIds(main);
    const keys = Object.keys(fin.prices ?? {});
    if (keys.length !== ids.size || !keys.every(k => ids.has(k))) return null;
  }
  const build = (items: ItemMain[]): OrderItem[] =>
    items.map(it => {
      const item: OrderItem = { ...it, price: 0 };
      if (fin) {
        const pr = fin.prices[it.id];
        if (typeof pr === 'number') item.price = pr;
        else delete (item as Partial<OrderItem>).price; // era ausente na origem
      }
      const c = cost?.costs?.[it.id];
      if (c !== undefined) item.cost = c;
      return item;
    });
  const { prices, total, extra, ...finRest } = fin ?? { prices: {}, total: 0 };
  void prices;
  const os: WorkOrder = {
    ...(extra as Partial<WorkOrder> | undefined),
    ...main,
    parts: build(main.parts),
    services: build(main.services),
    ...finRest,
    total,
  };
  if (cost?.totalCost !== undefined) os.totalCost = cost.totalCost;
  if (cost?.profit !== undefined) os.profit = cost.profit;
  return os;
}

// ---------- Catálogo ----------

export interface CatalogMain { description: string; category?: CatalogItem['category'] }

export function splitCatalogItem(
  kind: CatalogKind, item: CatalogItem, role?: CloudRole,
): { main: CloudRow; price?: CloudRow; cost?: CloudRow } {
  const table = kind === 'part' ? 'catalog_parts' : 'catalog_services';
  const out: { main: CloudRow; price?: CloudRow; cost?: CloudRow } = {
    main: { table, id: item.id, data: pure({ description: item.description, category: item.category }) },
  };
  if (canSeeFinance(role)) {
    out.price = { table: 'catalog_prices', id: `${kind}:${item.id}`, data: { kind, item_id: item.id, price: typeof item.price === 'number' ? item.price : null } };
  }
  if (canSeeCosts(role) && item.cost !== undefined) {
    out.cost = { table: 'catalog_costs', id: `${kind}:${item.id}`, data: { kind, item_id: item.id, cost: item.cost } };
  }
  return out;
}

/** Sem linha de preço (Mecânico): `price: 0`. Sem linha de custo: `cost` indefinido. */
export function joinCatalogItem(main: CatalogMain, id: string, price?: number | null, cost?: number | null): CatalogItem {
  const item: CatalogItem = { id, description: main.description, price: price ?? 0 };
  if (price === null) delete (item as Partial<CatalogItem>).price; // era ausente na origem
  if (main.category !== undefined) item.category = main.category;
  if (cost !== undefined && cost !== null) item.cost = cost; // null = custo removido pelo Dono: "não informado"
  return item;
}

// ---------- Banco inteiro ----------

const DEFAULT_SETTINGS: WorkshopSettings = { name: '', cnpj: '', address: '', exportPath: '' };

type Collections = Omit<DatabaseSchema, 'meta'>;

/** Linhas por tabela. Chame com o resultado de `prepareForCloud`. Sem papel = tudo (importação, como dono). */
export function splitDatabase(db: Collections, role?: CloudRole): CloudRow[] {
  const rows: CloudRow[] = [];

  for (const os of db.workOrders) {
    const s = splitWorkOrder(os, role);
    rows.push({ table: 'work_orders', id: os.id, data: s.main });
    if (s.fin) rows.push({ table: 'work_order_finance', id: os.id, data: s.fin });
    if (s.cost) rows.push({ table: 'work_order_costs', id: os.id, data: s.cost });
  }

  if (canSeeFinance(role)) {
    const owner = ledgerOwnerIndex(db);
    for (const e of db.ledger) {
      rows.push({ table: 'ledger', id: e.id, data: pure(e), os_id: owner.get(e.id) ?? null });
    }
  }

  for (const c of db.clients) rows.push({ table: 'clients', id: c.id, data: pure(c) });

  const catalogs: [CatalogKind, CatalogItem[]][] = [['part', db.catalogParts], ['service', db.catalogServices]];
  for (const [kind, items] of catalogs) {
    for (const it of items) {
      const s = splitCatalogItem(kind, it, role);
      rows.push(s.main);
      if (s.price) rows.push(s.price);
      if (s.cost) rows.push(s.cost);
    }
  }

  for (const t of db.catalogTechnicians) rows.push({ table: 'technicians', id: t.id, data: pure(t) });
  for (const a of db.appointments) rows.push({ table: 'appointments', id: a.id, data: pure(a) });
  if (canSeeAudit(role)) for (const ev of db.auditLog) rows.push({ table: 'audit_log', id: ev.id, data: pure(ev) });
  rows.push({ table: 'settings', id: 'main', data: pure(stripDbSecrets({ settings: db.settings }).settings) });
  return rows;
}

export interface JoinReport {
  db: Collections;
  /** OS cujas metades não casam (ver `joinWorkOrder`): ficaram de fora; mantenha a versão anterior. */
  skippedOrders: string[];
}

/** Inverso de `splitDatabase`. Mantém a ordem das linhas dentro de cada tabela. */
export function joinDatabaseReport(rows: CloudRow[]): JoinReport {
  const by = <T,>(table: CloudRow['table']): { id: string; data: T }[] =>
    rows.filter(r => r.table === table).map(r => ({ id: r.id, data: r.data as T }));

  const finById = new Map(by<WorkOrderFinance>('work_order_finance').map(r => [r.id, r.data]));
  const costById = new Map(by<WorkOrderCosts>('work_order_costs').map(r => [r.id, r.data]));
  const priceOf = new Map<string, number | null>();
  for (const r of by<{ price: number | null }>('catalog_prices')) priceOf.set(r.id, r.data.price);
  const costOf = new Map<string, number | null>();
  for (const r of by<{ cost: number | null }>('catalog_costs')) costOf.set(r.id, r.data.cost);

  const workOrders: WorkOrder[] = [];
  const skippedOrders: string[] = [];
  for (const r of by<WorkOrderMain>('work_orders')) {
    const os = joinWorkOrder(r.data, finById.get(r.id), costById.get(r.id));
    if (os) workOrders.push(os); else skippedOrders.push(r.id);
  }

  const catalog = (kind: CatalogKind): CatalogItem[] =>
    by<CatalogMain>(kind === 'part' ? 'catalog_parts' : 'catalog_services')
      .map(r => joinCatalogItem(r.data, r.id, priceOf.get(`${kind}:${r.id}`), costOf.get(`${kind}:${r.id}`)));

  const settings = by<WorkshopSettings>('settings')[0]?.data ?? DEFAULT_SETTINGS;

  return {
    db: {
      ledger: by<LedgerEntry>('ledger').map(r => r.data),
      workOrders,
      clients: by<Client>('clients').map(r => r.data),
      catalogParts: catalog('part'),
      catalogServices: catalog('service'),
      catalogTechnicians: by<Technician>('technicians').map(r => r.data),
      appointments: by<Appointment>('appointments').map(r => r.data),
      auditLog: by<AuditEvent>('audit_log').map(r => r.data),
      settings,
    },
    skippedOrders,
  };
}

export const joinDatabase = (rows: CloudRow[]): Collections => joinDatabaseReport(rows).db;

// ---------- computeTotals ----------

export interface Totals {
  counts: {
    ledger: number; workOrders: number; clients: number; catalogParts: number; catalogServices: number;
    catalogTechnicians: number; appointments: number; auditLog: number;
  };
  /** CREDIT soma, DEBIT subtrai, em centavos. */
  ledgerSignedCents: number;
  /** Soma de `total` das OS, em centavos. */
  workOrdersTotalCents: number;
  /** Lançamentos com `paymentDate` (a única verdade de "pago"). */
  paidEntries: number;
  /** Soma dos adiantamentos (`advances[].amount`), em centavos. */
  advancesCents: number;
}

export function computeTotals(db: Collections): Totals {
  return {
    counts: {
      ledger: db.ledger.length,
      workOrders: db.workOrders.length,
      clients: db.clients.length,
      catalogParts: db.catalogParts.length,
      catalogServices: db.catalogServices.length,
      catalogTechnicians: db.catalogTechnicians.length,
      appointments: db.appointments.length,
      auditLog: db.auditLog.length,
    },
    ledgerSignedCents: db.ledger.reduce((s, e) => s + (e.type === 'CREDIT' ? e.amount : -e.amount), 0),
    workOrdersTotalCents: db.workOrders.reduce((s, os) => s + (os.total || 0), 0),
    paidEntries: db.ledger.filter(e => !!e.paymentDate).length,
    advancesCents: db.workOrders.reduce((s, os) => s + sumAdvances(os), 0),
  };
}

// ---------- exportV5 ----------

export interface ExportOptions { savedAt: string; savedBy: string; revision: string }

/** Banco v5 exato (sem segredos). Relógio e id vêm de fora: nada de `new Date()` nem `crypto` aqui. */
export function exportV5(state: Collections, opts: ExportOptions): DatabaseSchema {
  const s = stripDbSecrets(state);
  return {
    ledger: s.ledger,
    workOrders: s.workOrders,
    clients: s.clients,
    catalogParts: s.catalogParts,
    catalogServices: s.catalogServices,
    catalogTechnicians: s.catalogTechnicians,
    appointments: s.appointments,
    auditLog: s.auditLog,
    settings: s.settings,
    meta: { schemaVersion: 5, revision: opts.revision, history: [], savedAt: opts.savedAt, savedBy: opts.savedBy },
  };
}
