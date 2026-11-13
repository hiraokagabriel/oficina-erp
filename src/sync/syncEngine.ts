import type {
  Appointment, AuditEvent, CatalogItem, Client, LedgerEntry, Technician, WorkOrder, WorkshopSettings,
} from '../types';
import { stable } from '../services/osEditMerge';
import { can } from '../services/permissions';
import type { Role } from '../services/permissions';
import { classify, diffById } from './diff';
import type { SeenEntry } from './diff';
import { mergeRecord } from './mergeRecord';
import {
  applyPushFailure, applyPushResult, backoffMs, dropOp, enqueue, makeOp, markSending, NETWORK_RETRY_MS, pendingFor,
  rebaseOp, removeOp, resolveOp, toPushGroups, TRANSIENT_LIMIT,
} from './outbox';
import type { OutboxOp, PushGroup, PushGroupResult, PushServerRow } from './outbox';
import { joinCatalogItem, joinWorkOrder } from './split';
import type { CatalogMain, WorkOrderCosts, WorkOrderFinance, WorkOrderMain } from './split';
import { CACHE_VERSION, emptyMeta } from './store';
import type { CommitBatch, LocalStore, StoredRecord, StoreMeta } from './store';
import type { MoneyCall, MoneyKind, MoneyOutcome } from './moneyClient';
import type { CatalogKind, CloudTable, CollectionKey } from './types';

// Motor de sincronização (docs/NUVEM-SPEC.md seção 4). Sem React, sem Supabase, sem IndexedDB: transporte, cache,
// relógio, id e timers entram por `EngineDeps`. Tudo que muda estado em memória é síncrono; só as chamadas de
// rede e de gravação esperam. Push e pull nunca rodam ao mesmo tempo (fila `exclusive`), então o pull nunca vê
// uma op `sending`. Edição local não espera a rede: entra na outbox na hora.

// ---------- contratos injetados ----------

/** Posição na ordem `(updated_at, id)`. Os dois são TEXTO como o servidor devolveu (sem `Date.parse`: cortaria microssegundos). */
export interface PullPosition { updated_at: string; id: string }

export interface PullRequest { since: string | null; after: PullPosition | null; limit: number }

/**
 * Erro do transporte com tipo, para o motor decidir o que fazer:
 * - `auth`: sem acesso (42501, JWT vencido, 401/403): para de enviar e pede novo login (PR 5);
 * - `timeout` (57014): o lote era grande demais, divide;
 * - `server`: o servidor respondeu com erro: conta tentativa com backoff;
 * - `network`: sem resposta: espera fixa e não conta tentativa.
 */
export type TransportErrorKind = 'auth' | 'timeout' | 'server' | 'network';
export class TransportError extends Error {
  constructor(message: string, readonly kind: TransportErrorKind, readonly code?: string) {
    super(message);
    this.name = 'TransportError';
  }
}

/** Linha de uma tabela da nuvem como o pull devolve (e como o `sync_push` devolve em conflito). */
export type PulledRow = PushServerRow;

export interface Transport {
  /** `sync_push`: um resultado por group, casado por `key`. Lança em falha de rede/5xx sem corpo. */
  push(ws: string, groups: PushGroup[]): Promise<PushGroupResult[]>;
  /**
   * Uma página, ordenada por `updated_at, id`, no máximo `limit` (≤ 1000: o `max_rows` do servidor corta acima disso).
   * Com `after`: só linhas ESTRITAMENTE depois dessa posição (keyset `(updated_at, id)`). Sem `after`: linhas com
   * `updated_at >= since` (`since` null = desde o começo).
   */
  pull(ws: string, table: CloudTable, req: PullRequest): Promise<PulledRow[]>;
  /**
   * Linhas por id, em qualquer versão (inclusive tombstone). Acréscimo à spec: o pull e o conflito precisam das
   * outras linhas da mesma OS (ou do mesmo item de catálogo) antes de juntar.
   */
  fetchByIds(ws: string, table: CloudTable, ids: string[]): Promise<PulledRow[]>;
  /** Realtime só como sinal. `'all'` = reconectou: puxar tudo. Devolve a função que cancela. */
  subscribe(ws: string, tables: CloudTable[], onSignal: (table: CloudTable | 'all') => void): () => void;
}

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: h => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Por que uma mudança local foi desfeita. */
export type RejectReason =
  | 'money_op'        // dinheiro só pela função `money` (PR 6)
  | 'denied'          // o servidor recusou (RLS/guarda): há cópia de recuperação
  | 'offline'         // exige internet (lançamento manual)
  | 'failed'          // erro definitivo de dados no servidor
  | 'denied_local'    // a barreira do cliente recusou (nada foi enviado, sem cópia)
  | 'server_deleted'  // outro aparelho excluiu o registro
  | 'server_edited'   // outro aparelho mudou o registro antes da exclusão
  | 'cache_discarded'; // o cache foi descartado (outro perfil ou versão) com edições não enviadas

export interface RemotePatch {
  collection: CollectionKey;
  /** Registros novos ou trocados. Em `settings` vem o objeto sem `id`. */
  upserts: unknown[];
  removes: string[];
}

export interface EngineDeps {
  transport: Transport;
  store: LocalStore;
  workshopId: string;
  /** Usuário atual (`outbox.actor`). */
  actor: string;
  deviceId: string;
  role: Role;
  now: () => string;
  newId: () => string;
  timers: Timers;
  /** Padrão: true. */
  online?: boolean;
  /**
   * Chamado ANTES de aplicar qualquer mudança vinda de fora (pull, ack, conflito). O provider descarrega o debounce
   * dele aqui: a edição ainda não vista entra na outbox e passa pelo `mergeRecord`, em vez de ser sobrescrita.
   */
  beforeRemote?: () => void;
  /** `settings` ainda sem linha no servidor: base da 3 vias da primeira edição (o padrão da tela, sem segredos). */
  settingsDefault?: object;
  /** Mudança vinda de fora da tela (pull, conflito resolvido, reversão): o provider aplica no estado do React. */
  onPatch?: (patches: RemotePatch[]) => void;
  /** A mudança local foi desfeita (toast). `detail` = texto do servidor, se houver. */
  onRejected?: (collection: CollectionKey, id: string, reason: RejectReason, detail?: string) => void;
  /** Aviso sem desfazer (conflito resolvido com campos em disputa). */
  onNotice?: (message: string) => void;
  /** Op `denied`/`failed` descartada: guardar cópia de recuperação (Tauri ou download). */
  onRecoveryCopy?: (op: OutboxOp) => void;
}

export type SyncState = 'salvo' | 'enviando' | 'offline' | 'erro';

/** Selo fixo do topo (Q23). */
export interface SyncStatus {
  online: boolean;
  /** Há envio no ar agora (diferente de `syncState === 'enviando'`, que também vale para fila em espera). */
  flushing: boolean;
  pending: number;
  syncState: SyncState;
  lastError: string | null;
}

/** O que o provider entrega no campo `cloud` do contexto. */
export interface CloudInfo extends SyncStatus {
  role: Role;
  /** "Tentar enviar agora" do selo: busca tudo e envia a fila. Só existe no provider da nuvem. */
  syncNow?: () => Promise<void>;
  /** Operação de dinheiro pela função `money` (PR 6). Só existe no provider da nuvem. Nunca lança. */
  money?: (kind: MoneyKind, call: MoneyCall) => Promise<MoneyOutcome>;
  /** Há operação de dinheiro no ar (os botões mostram "Recebendo..."). */
  moneyBusy?: boolean;
  /** Registros (`osId` ou `entryId`) com operação de dinheiro no ar: só o botão deles mostra "Recebendo...". */
  moneyBusyKeys?: readonly string[];
}

export interface EngineState {
  ledger: LedgerEntry[];
  workOrders: WorkOrder[];
  clients: Client[];
  catalogParts: CatalogItem[];
  catalogServices: CatalogItem[];
  catalogTechnicians: Technician[];
  appointments: Appointment[];
  auditLog: AuditEvent[];
  /** null = a oficina ainda não tem configurações no cache. */
  settings: WorkshopSettings | null;
}

// ---------- constantes ----------

export const PULL_WINDOW_MS = 5000;
/** Fixo e ≤ 1000: o `max_rows` do servidor (config e hospedado) corta acima disso e quebraria o fim da paginação. */
export const PULL_PAGE = 1000;
/** Groups por chamada de `sync_push`. */
export const MAX_GROUPS_PER_CALL = 50;
/** Tentativas de juntar um registro cujas linhas não casam, antes de desistir até o próximo pull completo. */
export const MAX_INCOMPLETE_TRIES = 5;
export const FLUSH_DEBOUNCE_MS = 300;
export const SIGNAL_DEBOUNCE_MS = 300;
export const REPULL_MS = 2000;
const MAX_FLUSH_ROUNDS = 20;

// ---------- esquema das tabelas ----------

type Slot = 'main' | 'fin' | 'cost';
const SLOTS: readonly Slot[] = ['main', 'fin', 'cost'];
type Versions = StoredRecord['versions'];
type Item = { id: string };
type Rows = Partial<Record<Slot, PulledRow>>;

interface Layout {
  collection: CollectionKey;
  tables: { main: CloudTable; fin?: CloudTable; cost?: CloudTable };
  /** Catálogo: as linhas de preço e custo têm id `${kind}:${itemId}`. */
  kind?: CatalogKind;
}

const LAYOUTS: readonly Layout[] = [
  { collection: 'workOrders', tables: { main: 'work_orders', fin: 'work_order_finance', cost: 'work_order_costs' } },
  { collection: 'ledger', tables: { main: 'ledger' } },
  { collection: 'clients', tables: { main: 'clients' } },
  { collection: 'catalogParts', tables: { main: 'catalog_parts', fin: 'catalog_prices', cost: 'catalog_costs' }, kind: 'part' },
  { collection: 'catalogServices', tables: { main: 'catalog_services', fin: 'catalog_prices', cost: 'catalog_costs' }, kind: 'service' },
  { collection: 'catalogTechnicians', tables: { main: 'technicians' } },
  { collection: 'appointments', tables: { main: 'appointments' } },
  { collection: 'auditLog', tables: { main: 'audit_log' } },
  { collection: 'settings', tables: { main: 'settings' } },
];
const LAYOUT_OF = new Map(LAYOUTS.map(l => [l.collection, l]));
export const ALL_COLLECTIONS: readonly CollectionKey[] = LAYOUTS.map(l => l.collection);

/** Catálogo: peças e serviços dividem `catalog_prices`/`catalog_costs`; o id da linha diz de qual. */
const layoutForRow = (table: CloudTable, rowId: string): { layout: Layout; slot: Slot } | null => {
  for (const layout of LAYOUTS) {
    for (const slot of SLOTS) {
      if (layout.tables[slot] !== table) continue;
      if (layout.kind && slot !== 'main' && !rowId.startsWith(`${layout.kind}:`)) continue;
      return { layout, slot };
    }
  }
  return null;
};

const rowIdOf = (layout: Layout, slot: Slot, recordId: string): string =>
  layout.kind && slot !== 'main' ? `${layout.kind}:${recordId}` : recordId;
const recordIdOf = (layout: Layout, slot: Slot, rowId: string): string =>
  layout.kind && slot !== 'main' ? rowId.slice(layout.kind.length + 1) : rowId;

/** O papel enxerga essa linha? Espelha as policies de RLS (`permissions.ts`). */
function slotVisible(role: Role, layout: Layout, slot: Slot): boolean {
  if (!layout.tables[slot]) return false;
  switch (layout.collection) {
    case 'workOrders':
      return slot === 'main' || (slot === 'fin' ? can(role, 'os.seePrices') : can(role, 'os.seeCosts'));
    case 'catalogParts':
    case 'catalogServices':
      return slot === 'main' || (slot === 'fin' ? can(role, 'catalog.seePrices') : can(role, 'catalog.seeCosts'));
    case 'ledger': return can(role, 'finance.view');
    case 'auditLog': return can(role, 'audit.view');
    default: return true;
  }
}

/** Tabelas que o papel pede no pull. O Mecânico nunca pede finance, costs, ledger, preços, custos e auditoria. */
export function visibleTables(role: Role): CloudTable[] {
  const out: CloudTable[] = [];
  for (const layout of LAYOUTS) {
    for (const slot of SLOTS) {
      const t = layout.tables[slot];
      if (t && slotVisible(role, layout, slot) && !out.includes(t)) out.push(t);
    }
  }
  return out;
}

const visibleSlots = (role: Role, layout: Layout): Slot[] => SLOTS.filter(s => slotVisible(role, layout, s));

// ---------- utilidades ----------

const SEP = '\u0000';
const keyOf = (c: CollectionKey, id: string): string => c + SEP + id;
const pure = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const versionOf = (v: Versions | undefined, slot: Slot): number => v?.[slot] ?? 0;
const sameRec = (o: OutboxOp, c: CollectionKey, id: string): boolean => o.collection === c && o.recordId === id;

interface Assembled { value: unknown | null; versions: Versions; osId: string | null | undefined; updatedAt: string }

/** Junta as linhas de um registro para o papel. `null` = linhas incompletas ou de salvamentos diferentes (tentar de novo). */
function assemble(role: Role, layout: Layout, id: string, rows: Rows): Assembled | null {
  const main = rows.main;
  if (!main) return null;
  const versions: Versions = { main: main.version };
  if (rows.fin) versions.fin = rows.fin.version;
  if (rows.cost) versions.cost = rows.cost.version;
  const base = { versions, osId: layout.collection === 'ledger' ? (main.os_id ?? null) : undefined, updatedAt: main.updated_at };
  if (main.deleted_at) return { ...base, value: null };
  // Papel que vê preço mas ficou sem a linha: metade nova com metade velha mostraria R$ 0,00. Espera a outra chegar.
  if (visibleSlots(role, layout).includes('fin') && !rows.fin) return null;
  if (layout.collection === 'workOrders') {
    const os = joinWorkOrder(main.data as WorkOrderMain, rows.fin?.data as WorkOrderFinance | undefined, rows.cost?.data as WorkOrderCosts | undefined);
    return os ? { ...base, value: os } : null;
  }
  if (layout.kind) {
    const price = rows.fin ? (rows.fin.data as { price?: number | null }).price : undefined;
    const cost = rows.cost ? (rows.cost.data as { cost?: number | null }).cost : undefined;
    return { ...base, value: joinCatalogItem(main.data as CatalogMain, id, price, cost) };
  }
  return { ...base, value: main.data };
}

// ---------- motor ----------

export class SyncEngine {
  private readonly d: EngineDeps;
  private readonly records = new Map<CollectionKey, Map<string, StoredRecord>>();
  private readonly seen = new Map<CollectionKey, Map<string, SeenEntry<Item>>>();
  private outbox: OutboxOp[] = [];
  private readonly persistedOps = new Map<string, OutboxOp>();
  private meta: StoreMeta = emptyMeta();
  private readonly dirtyRecords = new Set<string>();
  private dirtyMeta = false;
  private readonly retryAt = new Map<string, number>();
  private readonly patches = new Map<CollectionKey, Map<string, unknown | null>>();

  private online: boolean;
  private opened = false;
  private started = false;
  private stopped = false;
  private flushing = false;
  /** Sem acesso (401/403/42501): não envia nem puxa até `resumeAfterLogin()`. */
  private authBlocked = false;
  private batchLimit = MAX_GROUPS_PER_CALL;
  private pushError: string | null = null;
  private pullError: string | null = null;
  private persistError: string | null = null;

  /** Registros cujas linhas não juntaram (metades de salvamentos diferentes): tentativas por registro. */
  private readonly incompleteTries = new Map<string, number>();
  /** Desistiu depois de `MAX_INCOMPLETE_TRIES`: volta a tentar no próximo pull completo. */
  private readonly abandoned = new Set<string>();
  private readonly repullTables = new Set<CloudTable>();

  private chain: Promise<void> = Promise.resolve();
  private persistChain: Promise<void> = Promise.resolve();
  private flushQueued: Promise<void> | null = null;
  private pullQueued: { tables: Set<CloudTable>; full: boolean; p: Promise<void> } | null = null;
  private flushTimer: unknown = null;
  private signalTimer: unknown = null;
  private retryTimer: unknown = null;
  private repullTimer: unknown = null;
  private signalTables = new Set<CloudTable>();
  private unsubscribe: (() => void) | null = null;

  private readonly listeners = new Set<(s: SyncStatus) => void>();
  private lastStatusJson = '';

  constructor(deps: EngineDeps) {
    this.d = deps;
    this.online = deps.online ?? true;
  }

  // ---------- avisos (mudos depois de `stop`) ----------

  private reject(collection: CollectionKey, id: string, reason: RejectReason, detail?: string): void {
    if (!this.stopped) this.d.onRejected?.(collection, id, reason, detail);
  }
  private notice(message: string): void {
    if (!this.stopped) this.d.onNotice?.(message);
  }

  // ---------- abertura ----------

  /**
   * Carrega o cache (funciona offline) e devolve o estado inicial: registros confirmados com as edições
   * pendentes da outbox por cima. Cache de outro papel ou de outra versão é descartado, mas as edições não
   * enviadas dele viram cópia de recuperação (`onRecoveryCopy`) e aviso (`cache_discarded`).
   */
  async open(): Promise<EngineState> {
    let snap = await this.d.store.load();
    if (snap.meta.cacheVersion !== CACHE_VERSION || (snap.meta.role !== null && snap.meta.role !== this.d.role)) {
      for (const op of snap.outbox) {
        this.d.onRecoveryCopy?.(op);
        this.d.onRejected?.(op.collection, op.recordId, 'cache_discarded');
      }
      await this.d.store.clear();
      snap = await this.d.store.load();
    }
    this.meta = { ...snap.meta, cacheVersion: CACHE_VERSION, role: this.d.role };
    this.dirtyMeta = true;
    for (const e of snap.records) this.recMap(e.collection).set(e.id, e.rec);
    for (const o of snap.outbox) this.persistedOps.set(o.opId, o);
    // Sessão anterior caiu no meio: `sending` volta a `pending` (se o servidor já gravou, o conflito igual resolve
    // como "ack perdido") e `conflict` é refeito no próximo envio.
    const back = applyPushFailure(snap.outbox, 'reaberto', this.d.now).ops;
    this.outbox = back.map(o => (o.state === 'conflict' ? { ...o, state: 'pending' as const } : o));
    this.sweepRejected();
    this.patches.clear();

    const ids = new Map<CollectionKey, Set<string>>();
    for (const c of ALL_COLLECTIONS) ids.set(c, new Set(this.recMap(c).keys()));
    for (const o of this.outbox) if (o.actor === this.d.actor) ids.get(o.collection)?.add(o.recordId);
    const lists = new Map<CollectionKey, Item[]>();
    for (const c of ALL_COLLECTIONS) {
      const items: Item[] = [];
      const seen = this.seenOf(c);
      for (const id of ids.get(c) ?? []) {
        const v = this.viewOf(c, id);
        if (!v) continue;
        items.push(v);
        seen.set(id, { ref: v, json: stable(v) });
      }
      lists.set(c, items);
    }
    this.opened = true;
    void this.persist();
    this.emitStatus();
    const list = <T,>(c: CollectionKey): T[] => (lists.get(c) ?? []) as unknown as T[];
    const settings = list<Item>('settings')[0];
    return {
      ledger: list('ledger'), workOrders: list('workOrders'), clients: list('clients'),
      catalogParts: list('catalogParts'), catalogServices: list('catalogServices'),
      catalogTechnicians: list('catalogTechnicians'), appointments: list('appointments'), auditLog: list('auditLog'),
      settings: settings ? this.settingsOut(settings) : null,
    };
  }

  /** Liga o Realtime e faz a primeira rodada (pull e envio). Chame depois de `open()`. */
  start(): void {
    if (!this.opened || this.started || this.stopped) return;
    this.started = true;
    this.unsubscribe = this.d.transport.subscribe(this.d.workshopId, visibleTables(this.d.role), t => this.signal(t));
    void this.syncNow();
  }

  /**
   * Para de vez (o motor não é reaproveitável): sem timers novos, sem rede nova, sem `onPatch`/`onRejected`.
   * O que já está no ar termina; espere `settled()` antes de fechar o store.
   */
  stop(): void {
    this.stopped = true;
    this.started = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const h of [this.flushTimer, this.signalTimer, this.retryTimer, this.repullTimer]) if (h !== null) this.d.timers.clear(h);
    this.flushTimer = this.signalTimer = this.retryTimer = this.repullTimer = null;
    this.patches.clear();
  }

  /** O login foi refeito (PR 5): volta a enviar e puxar. */
  resumeAfterLogin(): void {
    if (!this.authBlocked) return;
    this.authBlocked = false;
    this.pushError = null;
    this.pullError = null;
    this.emitStatus();
    if (this.opened && !this.stopped) void this.syncNow();
  }

  // ---------- estado exposto ----------

  getStatus(): SyncStatus {
    const pending = this.outbox.filter(o => o.actor === this.d.actor).length;
    const lastError = this.authBlocked ? 'sem_acesso' : this.pushError ?? this.pullError ?? this.incompleteError() ?? this.persistError;
    let syncState: SyncState;
    if (!this.online) syncState = 'offline';
    else if (lastError !== null) syncState = 'erro';
    else if (pending > 0 || this.flushing) syncState = 'enviando';
    else syncState = 'salvo';
    return { online: this.online, flushing: this.flushing, pending, syncState, lastError };
  }

  private incompleteError(): string | null {
    return this.abandoned.size > 0 ? 'registro_incompleto' : null;
  }

  subscribeStatus(listener: (s: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emitStatus(): void {
    const s = this.getStatus();
    const json = JSON.stringify(s);
    if (json === this.lastStatusJson) return;
    this.lastStatusJson = json;
    for (const l of [...this.listeners]) l(s);
  }

  // ---------- conectividade e gatilhos ----------

  setOnline(online: boolean): void {
    if (online === this.online) return;
    this.online = online;
    this.emitStatus();
    if (online && this.opened && !this.stopped) {
      this.retryAt.clear();
      void this.syncNow();
    }
  }

  /** Janela voltou ao foco: puxa tudo. */
  focus(): void {
    if (this.opened && this.online && !this.stopped) void this.pullNow();
  }

  /** Sinal do Realtime: pull só daquela tabela, com debounce de 300 ms. */
  private signal(table: CloudTable | 'all'): void {
    if (this.stopped) return;
    if (table === 'all') for (const t of visibleTables(this.d.role)) this.signalTables.add(t);
    else this.signalTables.add(table);
    if (this.signalTimer !== null) return;
    this.signalTimer = this.d.timers.set(() => {
      this.signalTimer = null;
      const tables = [...this.signalTables];
      this.signalTables = new Set();
      void this.pullNow(tables);
    }, SIGNAL_DEBOUNCE_MS);
  }

  /** Pull de tudo e depois envio. */
  async syncNow(): Promise<void> {
    await this.pullNow();
    await this.flushNow();
  }

  // ---------- fila de rede ----------

  private exclusive(fn: () => Promise<void>): Promise<void> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(() => undefined, () => undefined);
    return run;
  }

  /** Espera a fila de rede e as gravações esvaziarem (testes e fechamento). */
  async settled(): Promise<void> {
    for (let i = 0; i < 50; i++) {
      const c = this.chain; const p = this.persistChain;
      await c; await p;
      if (c === this.chain && p === this.persistChain) return;
    }
  }

  flushNow(): Promise<void> {
    if (this.flushQueued) return this.flushQueued;
    const p = this.exclusive(async () => {
      this.flushQueued = null;
      let more = false;
      try {
        more = await this.flushRounds();
      } catch (e) {
        // Exceção fora do transporte (ex.: ao aplicar o resultado): as ops `sending` não podem ficar presas.
        this.failSending(errMsg(e), 'backoff');
        this.sweepRejected();
      }
      this.flushing = false;
      this.afterNetwork();
      if (more) this.scheduleFlush();
    });
    this.flushQueued = p;
    return p;
  }

  pullNow(tables?: CloudTable[]): Promise<void> {
    const want = tables ?? visibleTables(this.d.role);
    if (this.pullQueued) {
      for (const t of want) this.pullQueued.tables.add(t);
      if (!tables) this.pullQueued.full = true;
      return this.pullQueued.p;
    }
    const q = { tables: new Set<CloudTable>(want), full: tables === undefined, p: Promise.resolve() };
    q.p = this.exclusive(async () => {
      this.pullQueued = null;
      try {
        await this.pullTables(q.tables, q.full);
      } catch (e) {
        if (e instanceof TransportError && e.kind === 'auth') this.authBlocked = true;
        else this.pullError = errMsg(e);
      }
      this.afterNetwork();
    });
    this.pullQueued = q;
    return q.p;
  }

  // ---------- operação de dinheiro (função `money`, PR 6) ----------

  /**
   * Antes de chamar a função `money` sobre uma OS (ou um lançamento): envia a op pendente do registro e espera o ack,
   * para o servidor ver as edições da pessoa. `ok:false` = ainda sobrou op do registro (rede, backoff): não chame.
   * `known` = versões que este aparelho conhece, que o servidor confere (`conflito_versao` se mudou).
   */
  async prepareMoney(ref: { osId?: string; entryId?: string }): Promise<{ ok: true; known: Record<string, number> } | { ok: false; reason: 'offline' | 'pendente' }> {
    if (!this.opened || this.stopped || !this.online) return { ok: false, reason: 'offline' };
    const ledgerOwned = (): string[] => {
      const out: string[] = [];
      for (const [id, rec] of this.recMap('ledger')) if (!rec.deleted && ref.osId && rec.osId === ref.osId) out.push(id);
      return out;
    };
    const mine = (): boolean => {
      const lid = new Set<string>(ledgerOwned());
      if (ref.entryId) lid.add(ref.entryId);
      return this.outbox.some(o => o.actor === this.d.actor && (
        (ref.osId !== undefined && o.collection === 'workOrders' && o.recordId === ref.osId)
        || (o.collection === 'ledger' && lid.has(o.recordId))));
    };
    if (mine()) {
      await this.flushNow();
      if (mine()) return { ok: false, reason: this.online ? 'pendente' : 'offline' };
    }
    const known: Record<string, number> = {};
    if (ref.osId) {
      const v = this.getRec('workOrders', ref.osId)?.versions;
      if (v) {
        known[`work_orders:${ref.osId}`] = v.main;
        if (v.fin !== undefined) known[`work_order_finance:${ref.osId}`] = v.fin;
        if (v.cost !== undefined) known[`work_order_costs:${ref.osId}`] = v.cost;
      }
      for (const id of ledgerOwned()) known[`ledger:${id}`] = this.recMap('ledger').get(id)?.versions.main ?? 0;
    }
    if (ref.entryId) {
      const rec = this.getRec('ledger', ref.entryId);
      if (rec && !rec.deleted) known[`ledger:${ref.entryId}`] = rec.versions.main;
    }
    return { ok: true, known };
  }

  /** Depois da função `money` (com ou sem sucesso): puxa as tabelas de dinheiro e aplica pelo `onPatch`, sem eco. */
  afterMoney(): Promise<void> {
    const money: CloudTable[] = ['work_orders', 'work_order_finance', 'work_order_costs', 'ledger', 'audit_log'];
    const mine = visibleTables(this.d.role);
    return this.pullNow(money.filter(t => mine.includes(t)));
  }

  private afterNetwork(): void {
    if (this.stopped) { this.emitPatches(); return; }
    this.emitPatches();
    void this.persist();
    this.scheduleRetry();
    // Fila vazia e sem envio no ar: o erro do último envio (ex.: `denied` já revertido) não vale mais.
    if (this.outbox.length === 0 && !this.flushing && !this.authBlocked) this.pushError = null;
    if (this.repullTables.size > 0 && this.repullTimer === null) {
      const tables = [...this.repullTables];
      this.repullTables.clear();
      this.repullTimer = this.d.timers.set(() => { this.repullTimer = null; void this.pullNow(tables); }, REPULL_MS);
    }
    this.emitStatus();
  }

  private nowMs(): number { return Date.parse(this.d.now()); }

  private scheduleFlush(): void {
    if (this.flushTimer !== null || !this.online || this.stopped) return;
    this.flushTimer = this.d.timers.set(() => { this.flushTimer = null; void this.flushNow(); }, FLUSH_DEBOUNCE_MS);
  }

  /** Um timer só, para a op com a menor espera. */
  private scheduleRetry(): void {
    if (this.retryTimer !== null) { this.d.timers.clear(this.retryTimer); this.retryTimer = null; }
    if (this.stopped) return;
    const live = new Set(this.outbox.map(o => o.opId));
    let min = Infinity;
    for (const [id, at] of this.retryAt) { if (!live.has(id)) this.retryAt.delete(id); else min = Math.min(min, at); }
    if (!Number.isFinite(min)) return;
    this.retryTimer = this.d.timers.set(() => { this.retryTimer = null; void this.flushNow(); }, Math.max(0, min - this.nowMs()));
  }

  // ---------- mudança local ----------

  /**
   * O provider passa a coleção como está na tela (depois do debounce de 500 ms). O motor guarda o `lastSeen`:
   * compara, classifica por papel e enfileira. O que não pode ir é desfeito e volta pelo `onPatch`.
   * Em `settings` passe `[{ ...configuracoes, id: 'main' }]`.
   */
  localChange(collection: CollectionKey, current: readonly Item[]): void {
    if (!this.opened || this.stopped) return;
    const seen = this.seenOf(collection);
    const d = diffById<Item>(seen, current);
    const next = new Map(d.next);
    const patch = this.patchOf(collection);

    const undo = (id: string, before: Item | null, reason: RejectReason): void => {
      const old = seen.get(id);
      if (before && old) next.set(id, old); else next.delete(id);
      patch.set(id, before);
      this.reject(collection, id, reason);
    };
    for (const u of d.upserts) {
      const reason = this.accept(collection, u.id, u.before, u.value);
      if (reason) undo(u.id, u.before, reason);
    }
    for (const x of d.deletes) {
      const reason = this.accept(collection, x.id, x.before, null);
      if (reason) undo(x.id, x.before, reason);
    }
    this.seen.set(collection, next);
    this.emitPatches();
    void this.persist();
    this.scheduleFlush();
    this.emitStatus();
  }

  /** Enfileira a mudança. Devolve o motivo se ela não pode ir. */
  private accept(collection: CollectionKey, id: string, before: Item | null, after: Item | null): RejectReason | null {
    const rec = this.getRec(collection, id);
    const cls = classify(this.d.role, collection, before, after, { ledgerOsId: rec?.osId ?? null });
    if (cls === 'money_op') return 'money_op';
    if (cls === 'denied') return 'denied_local';
    if (cls === 'online_only' && !this.online) return 'offline';
    // `settings` sem linha ainda: a base é o padrão da tela (3 vias só com o que o usuário mudou de fato), não null.
    const noRowBase = collection === 'settings' && this.d.settingsDefault ? pure(this.d.settingsDefault) : null;
    const op = makeOp({
      actor: this.d.actor, deviceId: this.d.deviceId, collection, recordId: id,
      kind: after === null ? 'delete' : 'upsert',
      base: rec && !rec.deleted ? rec.data : noRowBase,
      baseVersions: rec ? { ...rec.versions } : { main: 0 },
      value: after === null ? null : this.valueOf(collection, after),
    }, { now: this.d.now, newId: this.d.newId });
    this.outbox = enqueue(this.outbox, op);
    const mine = this.outbox.find(o => o.actor === this.d.actor && sameRec(o, collection, id) && o.state === 'pending');
    if (mine) this.retryAt.delete(mine.opId); // edição nova: tenta já, sem esperar o backoff
    return null;
  }

  // ---------- envio ----------

  /** Devolve true se sobrou op elegível (saiu pelo limite de rodadas): o chamador reagenda. */
  private async flushRounds(): Promise<boolean> {
    for (let round = 0; round < MAX_FLUSH_ROUNDS; round++) {
      if (!this.online || this.stopped || this.authBlocked) return false;
      const nowMs = this.nowMs();
      const eligible = pendingFor(this.outbox, this.d.actor).filter(o => (this.retryAt.get(o.opId) ?? 0) <= nowMs);
      if (eligible.length === 0) return false;
      const all = toPushGroups(eligible, this.d.role);
      const sendKeys = new Set(all.map(g => g.key));
      // Sem group = nada a enviar (excluir o que nunca chegou ao servidor): sai da fila.
      const empty = eligible.filter(o => !sendKeys.has(o.opId));
      if (empty.length > 0) {
        const gone = new Set(empty.map(o => o.opId));
        this.outbox = this.outbox.filter(o => !gone.has(o.opId));
        for (const o of empty) {
          // Excluir o que nunca chegou ao servidor sai calado. Excluir um registro que o servidor TEM e que não gerou nada
          // para enviar (ex.: o papel não enxerga as linhas) é uma alteração perdida: o usuário precisa saber.
          if (o.kind === 'delete' && o.base !== null && o.baseVersions.main > 0) this.reject(o.collection, o.recordId, 'denied_local');
          this.syncView(o.collection, o.recordId);
        }
        this.emitPatches();
      }
      if (all.length === 0) { void this.persist(); continue; }
      const groups = all.slice(0, this.batchLimit);

      this.outbox = markSending(this.outbox, groups.map(g => g.key));
      this.flushing = true;
      void this.persist();
      this.emitStatus();

      let results: PushGroupResult[];
      try {
        results = await this.d.transport.push(this.d.workshopId, groups);
        if (!Array.isArray(results)) throw new TransportError('Resposta inesperada do servidor', 'server');
      } catch (e) {
        const err = e instanceof TransportError ? e : new TransportError(errMsg(e), 'network');
        if (err.kind === 'timeout' && groups.length > 1) {
          // O lote era grande demais: divide e tenta já, sem gastar tentativa.
          this.batchLimit = Math.max(1, Math.ceil(groups.length / 2));
          this.failSending(err.message, 'now');
          continue;
        }
        if (err.kind === 'auth') {
          this.authBlocked = true;
          this.failSending(err.message, 'now');
        } else {
          this.pushError = err.message;
          this.failSending(err.message, err.kind === 'network' ? 'network' : 'backoff');
          this.sweepRejected();
          this.emitPatches();
        }
        return false;
      }
      this.pushError = null;
      this.batchLimit = Math.min(MAX_GROUPS_PER_CALL, this.batchLimit * 2);
      await this.applyResults(results);
    }
    return pendingFor(this.outbox, this.d.actor).length > 0;
  }

  /** As ops `sending` voltam a `pending`. `network`: 5 s fixos sem gastar tentativa; `backoff`: gasta e espera 2 s, 4 s...; `now`: sem espera. */
  private failSending(msg: string, mode: 'network' | 'backoff' | 'now'): void {
    const ids = this.outbox.filter(o => o.state === 'sending').map(o => o.opId);
    const f = applyPushFailure(this.outbox, msg, this.d.now);
    this.outbox = f.ops;
    const at = new Map(f.retries.map(r => [r.opId, Date.parse(r.nextAttemptAt)]));
    for (const id of ids) {
      const op = this.outbox.find(o => o.opId === id);
      if (!op) { this.retryAt.delete(id); continue; }
      if (mode === 'network') { this.retryAt.set(id, at.get(id) ?? this.nowMs() + NETWORK_RETRY_MS); continue; }
      if (mode === 'now') { this.retryAt.delete(id); continue; }
      const attempts = op.attempts + 1;
      if (attempts >= TRANSIENT_LIMIT) {
        this.outbox = this.outbox.map(o => (o.opId === id ? { ...o, attempts, state: 'failed' as const, lastError: msg } : o));
        this.retryAt.delete(id);
      } else {
        this.outbox = this.outbox.map(o => (o.opId === id ? { ...o, attempts } : o));
        this.retryAt.set(id, this.nowMs() + backoffMs(attempts));
      }
    }
  }

  private async applyResults(results: PushGroupResult[]): Promise<void> {
    this.d.beforeRemote?.(); // a edição em debounce entra na outbox antes (ao lado da op no ar) e é absorvida
    const before = this.outbox;
    const out = applyPushResult(before, results, this.d.now);
    this.outbox = out.ops;
    for (const r of out.retries) this.retryAt.set(r.opId, Date.parse(r.nextAttemptAt));

    for (const c of out.confirmed) {
      const op = before.find(o => o.opId === c.opId);
      if (!op) continue;
      const old = this.getRec(c.collection, c.recordId);
      this.setRec(c.collection, c.recordId, {
        data: op.kind === 'delete' ? (op.base ?? old?.data ?? null) : op.value,
        versions: c.versions, updatedAt: this.d.now(), deleted: op.kind === 'delete', osId: old?.osId,
      });
      this.syncView(c.collection, c.recordId);
    }
    this.sweepRejected();
    for (const info of out.conflicts) {
      try {
        await this.resolveConflict(info.opId, info.collection, info.recordId, info.rows);
      } catch (e) {
        // Não deu para buscar as outras linhas: volta a `pending` e tenta depois (o limite de tentativas vale).
        this.reopenConflict(info.opId, errMsg(e));
      }
    }
    this.sweepRejected();
    this.emitPatches();
  }

  /** Op `denied`/`failed`: sai da fila, o registro volta ao confirmado, cópia de recuperação e aviso. */
  private sweepRejected(): void {
    for (const op of this.outbox.filter(o => o.state === 'denied' || o.state === 'failed')) {
      this.outbox = dropOp(this.outbox, op.opId).ops;
      this.retryAt.delete(op.opId);
      this.pushError = op.lastError ?? op.state;
      if (!this.stopped) this.d.onRecoveryCopy?.(op);
      this.reject(op.collection, op.recordId, op.state === 'denied' ? 'denied' : 'failed', op.lastError);
      this.syncView(op.collection, op.recordId);
    }
  }

  private reopenConflict(opId: string, error: string): void {
    this.outbox = this.outbox.map(o => (o.opId === opId && o.state === 'conflict' ? { ...o, state: 'pending' as const, lastError: error } : o));
    this.retryAt.set(opId, this.nowMs() + 5000);
  }

  // ---------- conflito ----------

  private async resolveConflict(opId: string, collection: CollectionKey, recordId: string, known: PushServerRow[]): Promise<void> {
    const layout = LAYOUT_OF.get(collection);
    const first = this.outbox.find(o => o.opId === opId);
    if (!layout || !first || first.state !== 'conflict') return;
    if (first.attempts >= TRANSIENT_LIMIT) {
      this.outbox = this.outbox.map(o => (o.opId === opId ? { ...o, state: 'failed' as const, lastError: 'conflito_repetido' } : o));
      return;
    }
    const rows = await this.completeRows(layout, recordId, known);
    const server = assemble(this.d.role, layout, recordId, rows);
    if (!server) { this.reopenConflict(opId, 'linhas_incompletas'); return; }

    this.d.beforeRemote?.();
    // Edições feitas durante a espera foram fundidas na op `conflict`: lê de novo.
    const op = this.outbox.find(o => o.opId === opId);
    if (!op) return;
    this.setRec(collection, recordId, { data: server.value ?? this.getRec(collection, recordId)?.data ?? null, versions: server.versions, updatedAt: server.updatedAt, deleted: server.value === null, osId: server.osId });
    const m = mergeRecord(collection, { base: op.base, value: op.value, server: server.value });
    if (m.kind === 'done') {
      this.outbox = removeOp(this.outbox, opId);
      if (m.message) this.notice(m.message);
    } else if (m.kind === 'drop') {
      this.outbox = removeOp(this.outbox, opId);
      this.reject(collection, recordId, m.reason, m.message);
    } else {
      this.outbox = resolveOp(this.outbox, opId, { base: server.value, baseVersions: server.versions, value: m.value });
      this.retryAt.delete(opId);
      if (m.message) this.notice(m.message);
    }
    this.syncView(collection, recordId);
  }

  /** Todas as linhas do registro que o papel enxerga: as do conflito mais as buscadas por id. */
  private async completeRows(layout: Layout, recordId: string, known: readonly PulledRow[]): Promise<Rows> {
    const rows: Rows = {};
    for (const r of known) {
      const hit = layoutForRow(r.table, r.id);
      if (hit && hit.layout === layout && recordIdOf(layout, hit.slot, r.id) === recordId) rows[hit.slot] = r;
    }
    for (const slot of visibleSlots(this.d.role, layout)) {
      if (rows[slot]) continue;
      const table = layout.tables[slot];
      if (!table) continue;
      const got = await this.d.transport.fetchByIds(this.d.workshopId, table, [rowIdOf(layout, slot, recordId)]);
      if (got[0]) rows[slot] = got[0];
    }
    return rows;
  }

  // ---------- pull ----------

  private async pullTables(tables: ReadonlySet<CloudTable>, full: boolean): Promise<void> {
    if (!this.online || this.authBlocked || this.stopped) return;
    if (full) await this.retryAbandoned();
    // Na ordem do esquema: a linha principal antes de finance/custos.
    for (const table of visibleTables(this.d.role)) {
      if (!tables.has(table)) continue;
      if (this.stopped) return;
      await this.pullTable(table);
    }
    this.pullError = null;
    this.meta = { ...this.meta, lastPullAt: this.d.now() };
    this.dirtyMeta = true;
  }

  /**
   * Páginas por keyset `(updated_at, id)`. A 1ª página de cada pull recua a janela de 5 s (commits fora de ordem): a
   * subtração passa por `Date.parse` e perde os microssegundos, o que só ALARGA a janela (nunca a encurta). As demais
   * páginas usam a posição da última linha como veio do servidor. O cursor fica na última linha aplicada por completo:
   * linha que não juntou (metades de salvamentos diferentes) segura o cursor até chegar a outra metade.
   */
  private async pullTable(table: CloudTable): Promise<void> {
    const start = this.meta.cursor[table] ?? null;
    let cursor = start;
    let frozen = false;
    let req: PullRequest = {
      since: start === null ? null : new Date(Date.parse(start.updated_at) - PULL_WINDOW_MS).toISOString(),
      after: null, limit: PULL_PAGE,
    };
    for (;;) {
      if (this.stopped) return;
      const rows = await this.d.transport.pull(this.d.workshopId, table, req);
      const hold = await this.applyPage(table, rows, false);
      if (rows.length > 0 && !frozen) {
        const upto = hold >= 0 ? hold : rows.length;
        if (hold >= 0) frozen = true;
        if (upto > 0) cursor = { updated_at: rows[upto - 1].updated_at, id: rows[upto - 1].id };
      }
      if (cursor !== start && cursor !== null) {
        this.meta = { ...this.meta, cursor: { ...this.meta.cursor, [table]: cursor } };
        this.dirtyMeta = true;
      }
      this.emitPatches();
      void this.persist();
      if (rows.length < req.limit) return;
      const last = rows[rows.length - 1];
      req = { since: null, after: { updated_at: last.updated_at, id: last.id }, limit: PULL_PAGE };
    }
  }

  /** Registros que desistiram: no pull completo, busca a linha principal e tenta juntar de novo. */
  private async retryAbandoned(): Promise<void> {
    for (const key of [...this.abandoned]) {
      const [collection, id] = key.split(SEP) as [CollectionKey, string];
      const layout = LAYOUT_OF.get(collection);
      if (!layout) { this.abandoned.delete(key); continue; }
      const got = await this.d.transport.fetchByIds(this.d.workshopId, layout.tables.main, [id]);
      this.incompleteTries.delete(key);
      await this.applyPage(layout.tables.main, got, true);
    }
  }

  /**
   * Aplica uma página de linhas de UMA tabela. Linhas de OS/catálogo chamam as irmãs antes de juntar.
   * Devolve o índice da primeira linha cujo registro não juntou (-1 = todas aplicadas): o cursor para antes dela.
   */
  private async applyPage(table: CloudTable, rows: readonly PulledRow[], retry: boolean): Promise<number> {
    const byRecord = new Map<string, { layout: Layout; id: string; rows: Rows }>();
    const rowKey: (string | null)[] = [];
    for (const r of rows) {
      const hit = layoutForRow(table, r.id);
      if (!hit) { rowKey.push(null); continue; }
      const id = recordIdOf(hit.layout, hit.slot, r.id);
      const rec = this.getRec(hit.layout.collection, id);
      if (rec && r.version <= versionOf(rec.versions, hit.slot)) { rowKey.push(null); continue; } // já conhecida (janela de 5 s)
      const k = keyOf(hit.layout.collection, id);
      const entry = byRecord.get(k) ?? { layout: hit.layout, id, rows: {} };
      entry.rows[hit.slot] = r;
      byRecord.set(k, entry);
      rowKey.push(k);
    }
    if (byRecord.size === 0) return -1;

    // Busca as outras linhas (por tabela, em lote) das OS/itens tocados. Peças e serviços dividem as tabelas de
    // preço e custo, mas têm tabela principal diferente: agrupa por layout.
    const byLayout = new Map<Layout, { layout: Layout; id: string; rows: Rows }[]>();
    for (const e of byRecord.values()) byLayout.set(e.layout, [...(byLayout.get(e.layout) ?? []), e]);
    for (const [layout, entries] of byLayout) {
      for (const slot of visibleSlots(this.d.role, layout)) {
        const t = layout.tables[slot];
        if (!t) continue;
        const wanted = entries.filter(e => !e.rows[slot]);
        if (wanted.length === 0) continue;
        const got = await this.d.transport.fetchByIds(this.d.workshopId, t, wanted.map(e => rowIdOf(layout, slot, e.id)));
        for (const g of got) {
          const e = wanted.find(w => rowIdOf(layout, slot, w.id) === g.id);
          if (e) e.rows[slot] = g;
        }
      }
    }

    this.d.beforeRemote?.(); // edição em debounce entra na outbox antes de qualquer patch remoto
    const incomplete = new Set<string>();
    for (const [k, e] of byRecord) {
      const a = assemble(this.d.role, e.layout, e.id, e.rows);
      if (!a) {
        if (retry) { this.abandoned.add(k); continue; }
        const tries = (this.incompleteTries.get(k) ?? 0) + 1;
        if (tries >= MAX_INCOMPLETE_TRIES) {
          // Desiste: o cursor segue, o selo mostra o erro e o próximo pull completo tenta de novo.
          this.incompleteTries.delete(k);
          this.abandoned.add(k);
        } else {
          this.incompleteTries.set(k, tries);
          incomplete.add(k);
          this.repullTables.add(table);
        }
        continue;
      }
      this.incompleteTries.delete(k);
      this.abandoned.delete(k);
      const rec = this.getRec(e.layout.collection, e.id);
      if (rec && SLOTS.every(s => versionOf(a.versions, s) <= versionOf(rec.versions, s))) continue;
      this.applyServerRecord(e.layout.collection, e.id, a);
    }
    return incomplete.size === 0 ? -1 : rowKey.findIndex(k => k !== null && incomplete.has(k));
  }

  /** Registro novo do servidor: grava o confirmado e reconcilia com a edição pendente (se houver). */
  private applyServerRecord(collection: CollectionKey, id: string, a: Assembled): void {
    const old = this.getRec(collection, id);
    this.setRec(collection, id, {
      data: a.value ?? old?.data ?? null, versions: a.versions, updatedAt: a.updatedAt, deleted: a.value === null, osId: a.osId ?? old?.osId,
    });
    const op = this.outbox.find(o => o.actor === this.d.actor && sameRec(o, collection, id) && o.state !== 'sending');
    if (op) {
      // Regra do outbox: base e versões da op passam a ser as do servidor. Antes, a edição local é fundida com o que
      // chegou (senão ela regravaria por cima o que o outro aparelho mudou).
      const m = mergeRecord(collection, { base: op.base, value: op.value, server: a.value });
      if (m.kind === 'done') {
        this.outbox = removeOp(this.outbox, op.opId);
        if (m.message) this.notice(m.message);
      } else if (m.kind === 'drop') {
        this.outbox = removeOp(this.outbox, op.opId);
        this.reject(collection, id, m.reason, m.message);
      } else {
        const rebased: OutboxOp = { ...rebaseOp(op, a.value, a.versions), value: m.value };
        this.outbox = this.outbox.map(o => (o.opId === op.opId ? rebased : o));
        if (m.message) this.notice(m.message);
        this.scheduleFlush();
      }
    }
    this.syncView(collection, id);
  }

  // ---------- visão (o que a tela mostra) ----------

  private recMap(c: CollectionKey): Map<string, StoredRecord> {
    let m = this.records.get(c);
    if (!m) { m = new Map(); this.records.set(c, m); }
    return m;
  }
  private getRec(c: CollectionKey, id: string): StoredRecord | undefined { return this.recMap(c).get(id); }
  private setRec(c: CollectionKey, id: string, rec: StoredRecord): void {
    this.recMap(c).set(id, rec);
    this.dirtyRecords.add(keyOf(c, id));
  }
  private seenOf(c: CollectionKey): Map<string, SeenEntry<Item>> {
    let m = this.seen.get(c);
    if (!m) { m = new Map(); this.seen.set(c, m); }
    return m;
  }
  private patchOf(c: CollectionKey): Map<string, unknown | null> {
    let m = this.patches.get(c);
    if (!m) { m = new Map(); this.patches.set(c, m); }
    return m;
  }

  /** `settings` não tem `id` na linha: a tela e o `diffById` usam `id: 'main'`. */
  private itemOf(c: CollectionKey, id: string, data: unknown): Item {
    return c === 'settings' ? { ...(data as object), id } : data as Item;
  }
  private valueOf(c: CollectionKey, item: Item): unknown {
    const v = pure(item) as Item & Record<string, unknown>;
    if (c === 'settings') delete (v as Partial<Item>).id;
    return v;
  }
  private settingsOut(item: Item): WorkshopSettings {
    return this.valueOf('settings', item) as WorkshopSettings;
  }

  /** Estado que a tela deve mostrar: a edição pendente (ou a que está no ar) por cima do confirmado. */
  private viewOf(c: CollectionKey, id: string): Item | null {
    const mine = this.outbox.filter(o => o.actor === this.d.actor && sameRec(o, c, id));
    const op = mine.find(o => o.state !== 'sending') ?? mine[0];
    if (op) return op.kind === 'delete' ? null : this.itemOf(c, id, op.value);
    const rec = this.getRec(c, id);
    return rec && !rec.deleted ? this.itemOf(c, id, rec.data) : null;
  }

  /** Recalcula a visão do registro; se mudou, atualiza o `lastSeen` e registra o patch (sem eco). */
  private syncView(c: CollectionKey, id: string): void {
    const seen = this.seenOf(c);
    const view = this.viewOf(c, id);
    const cur = seen.get(id);
    if (view === null) {
      if (cur) { seen.delete(id); this.patchOf(c).set(id, null); }
      return;
    }
    const json = stable(view);
    if (cur && cur.json === json) return;
    seen.set(id, { ref: view, json });
    this.patchOf(c).set(id, view);
  }

  private emitPatches(): void {
    if (this.stopped) { this.patches.clear(); return; }
    const out: RemotePatch[] = [];
    for (const [collection, m] of this.patches) {
      const upserts: unknown[] = [];
      const removes: string[] = [];
      for (const [id, v] of m) {
        if (v === null) removes.push(id);
        else upserts.push(collection === 'settings' ? this.settingsOut(v as Item) : v);
      }
      if (upserts.length > 0 || removes.length > 0) out.push({ collection, upserts, removes });
    }
    this.patches.clear();
    if (out.length > 0) this.d.onPatch?.(out);
  }

  // ---------- persistência ----------

  /** Grava (em ordem) o que mudou desde a última gravação: registros, outbox e meta juntos. */
  private persist(): Promise<void> {
    const run = async (): Promise<void> => {
      const keys = [...this.dirtyRecords];
      const wantMeta = this.dirtyMeta;
      const putOps = this.outbox.filter(o => this.persistedOps.get(o.opId) !== o);
      const live = new Set(this.outbox.map(o => o.opId));
      const deleteOpIds = [...this.persistedOps.keys()].filter(id => !live.has(id));
      if (keys.length === 0 && !wantMeta && putOps.length === 0 && deleteOpIds.length === 0) return;
      const batch: CommitBatch = {
        putRecords: keys.flatMap(k => {
          const [collection, id] = k.split(SEP) as [CollectionKey, string];
          const rec = this.getRec(collection, id);
          return rec ? [{ collection, id, rec }] : [];
        }),
        putOps, deleteOpIds, ...(wantMeta ? { meta: this.meta } : {}),
      };
      this.dirtyRecords.clear();
      this.dirtyMeta = false;
      try {
        await this.d.store.commit(batch);
        for (const o of putOps) this.persistedOps.set(o.opId, o);
        for (const id of deleteOpIds) this.persistedOps.delete(id);
        this.persistError = null;
      } catch (e) {
        for (const k of keys) this.dirtyRecords.add(k);
        if (wantMeta) this.dirtyMeta = true;
        this.persistError = `Cache local: ${errMsg(e)}`;
      }
      this.emitStatus();
    };
    this.persistChain = this.persistChain.then(run, run);
    return this.persistChain;
  }
}
