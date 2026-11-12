import type { Role } from '../services/permissions';
import { SyncEngine, visibleTables } from './syncEngine';
import type { EngineState, PullRequest, PulledRow, RejectReason, RemotePatch, Timers, Transport, TransportError } from './syncEngine';
import type { OutboxOp, PushGroup, PushGroupResult, PushRow } from './outbox';
import type { LocalStore } from './store';
import { createMemoryStore } from './memoryStore';
import type { CloudRow, CloudTable, CollectionKey } from './types';

// Apoio dos testes do motor (NÃO é código de produção): relógio falso, servidor falso que imita `sync_push`
// e aparelho falso (motor + "tela" que aplica os patches como o provider faz). Só tipos e lógica; sem Vitest.

// ---------- relógio ----------

export class FakeClock {
  ms = Date.parse('2026-11-12T12:00:00.000Z');
  private timers: { id: number; at: number; fn: () => void }[] = [];
  private seq = 0;
  now = (): string => new Date(this.ms).toISOString();
  timersApi: Timers = {
    set: (fn, ms) => { const id = ++this.seq; this.timers.push({ id, at: this.ms + ms, fn }); return id; },
    clear: h => { this.timers = this.timers.filter(t => t.id !== h); },
  };
  /** Avança o relógio e dispara os timers vencidos, em ordem. O trabalho assíncrono que eles iniciam não é esperado. */
  advance(ms: number): void {
    const target = this.ms + ms;
    for (;;) {
      const due = this.timers.filter(t => t.at <= target).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.timers = this.timers.filter(t => t !== due);
      this.ms = Math.max(this.ms, due.at);
      due.fn();
    }
    this.ms = target;
  }
  get pendingTimers(): number { return this.timers.length; }
}

// ---------- servidor falso ----------

interface ServerRow { data: unknown; version: number; deleted_at: string | null; updated_at: string; os_id: string | null }

const MECANICO_KEYS = new Set(['status', 'checklist', 'photos', 'mileage']);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Quem pode LER cada tabela (espelha as policies de select). */
const READ: Record<CloudTable, Role[]> = {
  work_orders: ['dono', 'recepcao', 'mecanico'], work_order_finance: ['dono', 'recepcao'], work_order_costs: ['dono'],
  ledger: ['dono', 'recepcao'], clients: ['dono', 'recepcao', 'mecanico'], catalog_parts: ['dono', 'recepcao', 'mecanico'],
  catalog_services: ['dono', 'recepcao', 'mecanico'], catalog_prices: ['dono', 'recepcao'], catalog_costs: ['dono'],
  technicians: ['dono', 'recepcao', 'mecanico'], appointments: ['dono', 'recepcao', 'mecanico'], audit_log: ['dono'],
  settings: ['dono', 'recepcao', 'mecanico'],
};

export class FakeServer {
  private tables = new Map<CloudTable, Map<string, ServerRow>>();
  private subscribers: { role: Role; fn: (t: CloudTable | 'all') => void }[] = [];
  /** Tudo que passou pelo transporte de cada papel (JSON), para procurar valores que não podiam passar. */
  wire: Record<Role, string[]> = { dono: [], recepcao: [], mecanico: [] };
  pushCalls = 0;
  pullCalls = 0;
  /** Push falha ANTES de gravar (rede caiu na ida). */
  failPush = 0;
  /** Push falha ANTES de gravar com este erro tipado (N vezes). */
  failPushWith: { error: TransportError; times: number } | null = null;
  /** Corte de linhas por página (o `max_rows` do servidor real). */
  maxRows = 1000;
  /** Maior nº de groups visto numa chamada de push. */
  maxGroupsSeen = 0;
  /** Push com mais groups que isso falha com este erro (simula o timeout de lote grande). */
  rejectBatchOver: { n: number; error: TransportError } | null = null;
  /** Push grava e a resposta se perde (ack perdido). */
  dropResponses = 0;
  /** Pull e fetch falham. */
  failPull = false;
  /** Força `denied` com esse código/mensagem em grupos que tocam a tabela. */
  forceDeny: { table: CloudTable; code: string; message: string; times: number } | null = null;

  constructor(private clock: FakeClock) {}

  private t(table: CloudTable): Map<string, ServerRow> {
    let m = this.tables.get(table);
    if (!m) { m = new Map(); this.tables.set(table, m); }
    return m;
  }

  seed(rows: readonly CloudRow[]): void {
    for (const r of rows) {
      this.t(r.table).set(r.id, { data: JSON.parse(JSON.stringify(r.data)), version: 1, deleted_at: null, updated_at: this.clock.now(), os_id: r.os_id ?? null });
    }
  }

  row(table: CloudTable, id: string): ServerRow | undefined { return this.t(table).get(id); }
  data<T>(table: CloudTable, id: string): T { return this.t(table).get(id)?.data as T; }

  /** Alteração feita direto no servidor (outro cliente fora do teste). */
  poke(table: CloudTable, id: string, data: unknown, deleted = false): void {
    const cur = this.t(table).get(id);
    this.t(table).set(id, { data, version: (cur?.version ?? 0) + 1, deleted_at: deleted ? this.clock.now() : null, updated_at: this.clock.now(), os_id: cur?.os_id ?? null });
    this.notify(table);
  }

  notify(table: CloudTable): void {
    for (const s of this.subscribers) if (READ[table].includes(s.role)) s.fn(table);
  }

  private view(table: CloudTable, id: string, r: ServerRow): PulledRow {
    const out: PulledRow = { table, id, version: r.version, data: JSON.parse(JSON.stringify(r.data)), deleted_at: r.deleted_at, updated_at: r.updated_at };
    if (table === 'ledger') out.os_id = r.os_id;
    return out;
  }

  /** Guardas que o servidor real aplica por papel (subconjunto: `guard_work_orders` e RLS de escrita). */
  private guard(role: Role, table: CloudTable, row: PushRow, cur: ServerRow | undefined): { code: string; message: string } | null {
    if (!READ[table].includes(role)) return { code: '42501', message: 'update_negado' };
    if (row.deleted && table === 'work_orders') return { code: '42501', message: 'money_op_required' };
    if (table === 'work_orders' && isObj(row.data)) {
      const next = row.data;
      if (next.status === 'FINALIZADO' && (!isObj(cur?.data) || cur.data.status !== 'FINALIZADO')) return { code: '42501', message: 'money_op_required' };
      if (role === 'mecanico' && isObj(cur?.data)) {
        const old = cur.data;
        for (const k of new Set([...Object.keys(old), ...Object.keys(next)])) {
          if (!MECANICO_KEYS.has(k) && JSON.stringify(old[k]) !== JSON.stringify(next[k])) return { code: '42501', message: 'mecanico_campo_proibido' };
        }
      }
    }
    return null;
  }

  transport(role: Role): Transport {
    const log = (v: unknown): void => { this.wire[role].push(JSON.stringify(v)); };
    return {
      push: async (_ws: string, groups: PushGroup[]): Promise<PushGroupResult[]> => {
        this.pushCalls++;
        log({ push: groups });
        this.maxGroupsSeen = Math.max(this.maxGroupsSeen, groups.length);
        if (this.failPush > 0) { this.failPush--; throw new Error('sem rede'); }
        if (this.failPushWith && this.failPushWith.times > 0) { this.failPushWith.times--; throw this.failPushWith.error; }
        if (this.rejectBatchOver && groups.length > this.rejectBatchOver.n) throw this.rejectBatchOver.error;
        const out: PushGroupResult[] = groups.map(g => this.applyGroup(role, g));
        if (this.dropResponses > 0) { this.dropResponses--; throw new Error('resposta perdida'); }
        log({ pushResult: out });
        return out;
      },
      pull: async (_ws: string, table: CloudTable, req: PullRequest): Promise<PulledRow[]> => {
        this.pullCalls++;
        if (this.failPull) throw new Error('sem rede');
        if (!READ[table].includes(role)) { log({ pullDenied: table }); return []; }
        const cmp = (a: [string, ServerRow], b: [string, ServerRow]): number =>
          Date.parse(a[1].updated_at) - Date.parse(b[1].updated_at) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
        const rows = [...this.t(table)]
          .filter(([id, r]) => {
            if (req.after) {
              const dt = Date.parse(r.updated_at) - Date.parse(req.after.updated_at);
              return dt > 0 || (dt === 0 && id > req.after.id);
            }
            return req.since === null || Date.parse(r.updated_at) >= Date.parse(req.since);
          })
          .sort(cmp)
          .slice(0, Math.min(req.limit, this.maxRows)).map(([id, r]) => this.view(table, id, r));
        if (table !== 'clients' || rows.length < 100) log({ pull: rows });
        return rows;
      },
      fetchByIds: async (_ws: string, table: CloudTable, ids: string[]): Promise<PulledRow[]> => {
        if (this.failPull) throw new Error('sem rede');
        if (!READ[table].includes(role)) { log({ fetchDenied: table }); return []; }
        const rows = ids.flatMap(id => { const r = this.t(table).get(id); return r ? [this.view(table, id, r)] : []; });
        log({ fetch: rows });
        return rows;
      },
      subscribe: (_ws: string, tables: CloudTable[], onSignal: (t: CloudTable | 'all') => void): (() => void) => {
        const sub = { role, fn: (t: CloudTable | 'all') => { if (t === 'all' || tables.includes(t)) onSignal(t); } };
        this.subscribers.push(sub);
        return () => { this.subscribers = this.subscribers.filter(s => s !== sub); };
      },
    };
  }

  /** Imita um group de `sync_push`: tudo ou nada; versão esperada; conflito devolve as linhas atuais. */
  private applyGroup(role: Role, g: PushGroup): PushGroupResult {
    const fd = this.forceDeny;
    if (fd && fd.times > 0 && g.rows.some(r => r.table === fd.table)) {
      fd.times--;
      return { key: g.key, status: 'denied', code: fd.code, message: fd.message };
    }
    const writes: { table: CloudTable; id: string; row: ServerRow }[] = [];
    let conflict = false;
    for (const r of g.rows) {
      const cur = this.t(r.table).get(r.id);
      if (r.version === 0) { if (cur) { conflict = true; break; } }
      else {
        if (!cur) return { key: g.key, status: 'denied', code: 'nao_encontrado', message: 'nao_encontrado' };
        if (cur.version !== r.version) { conflict = true; break; }
      }
      const denied = this.guard(role, r.table, r, cur);
      if (denied) return { key: g.key, status: 'denied', ...denied };
      writes.push({
        table: r.table, id: r.id,
        row: {
          data: JSON.parse(JSON.stringify(r.data)), version: (cur?.version ?? 0) + 1,
          deleted_at: r.deleted ? (cur?.deleted_at ?? this.clock.now()) : null, updated_at: this.clock.now(), os_id: r.os_id ?? cur?.os_id ?? null,
        },
      });
    }
    if (conflict) {
      const rows: PulledRow[] = g.rows.flatMap(r => { const c = this.t(r.table).get(r.id); return c ? [this.view(r.table, r.id, c)] : []; });
      return { key: g.key, status: 'conflict', rows };
    }
    for (const w of writes) this.t(w.table).set(w.id, w.row);
    for (const w of writes) this.notify(w.table);
    return { key: g.key, status: 'ok', rows: writes.map(w => ({ table: w.table, id: w.id, version: w.row.version })) };
  }
}

// ---------- aparelho falso ----------

type Item = { id: string };

export interface Rejection { collection: CollectionKey; id: string; reason: RejectReason; detail?: string }

/** Motor + a "tela" (o que o React teria no estado), que recebe os patches como o provider faz. */
export class Device {
  screen = new Map<CollectionKey, Map<string, Item>>();
  rejections: Rejection[] = [];
  notices: string[] = [];
  recovery: OutboxOp[] = [];
  engine!: SyncEngine;
  initial!: EngineState;
  private seq = 0;
  /** Coleções com edição "em debounce" (já na tela, ainda não vista pelo motor). */
  private debounced = new Set<CollectionKey>();
  beforeRemoteCalls = 0;

  constructor(
    readonly name: string, readonly role: Role, readonly server: FakeServer, readonly clock: FakeClock,
    readonly store: LocalStore = createMemoryStore(),
  ) {}

  static async create(
    name: string, role: Role, server: FakeServer, clock: FakeClock,
    opts: { store?: LocalStore; online?: boolean; actor?: string; settingsDefault?: object; beforeRemoteHook?: () => void } = {},
  ): Promise<Device> {
    const d = new Device(name, role, server, clock, opts.store ?? createMemoryStore());
    d.engine = new SyncEngine({
      transport: server.transport(role), store: d.store, workshopId: 'ws', actor: opts.actor ?? name, deviceId: `dev-${name}`, role,
      now: clock.now, newId: () => `${name}-op${++d.seq}`, timers: clock.timersApi, online: opts.online ?? true,
      onPatch: p => d.applyPatches(p),
      beforeRemote: () => { d.beforeRemoteCalls++; opts.beforeRemoteHook?.(); d.flushDebounced(); },
      settingsDefault: opts.settingsDefault,
      onRejected: (collection, id, reason, detail) => { d.rejections.push({ collection, id, reason, detail }); },
      onNotice: m => { d.notices.push(m); },
      onRecoveryCopy: op => { d.recovery.push(op); },
    });
    d.initial = await d.engine.open();
    d.load(d.initial);
    return d;
  }

  private col(c: CollectionKey): Map<string, Item> {
    let m = this.screen.get(c);
    if (!m) { m = new Map(); this.screen.set(c, m); }
    return m;
  }

  private load(s: EngineState): void {
    const put = (c: CollectionKey, items: Item[]): void => { for (const it of items) this.col(c).set(it.id, it); };
    put('ledger', s.ledger); put('workOrders', s.workOrders); put('clients', s.clients);
    put('catalogParts', s.catalogParts); put('catalogServices', s.catalogServices);
    put('catalogTechnicians', s.catalogTechnicians); put('appointments', s.appointments); put('auditLog', s.auditLog);
    if (s.settings) this.col('settings').set('main', { ...s.settings, id: 'main' });
  }

  private applyPatches(patches: RemotePatch[]): void {
    for (const p of patches) {
      for (const id of p.removes) this.col(p.collection).delete(id);
      for (const u of p.upserts) {
        const item = p.collection === 'settings' ? { ...(u as object), id: 'main' } : u as Item;
        this.col(p.collection).set(item.id, item);
      }
    }
  }

  get<T>(c: CollectionKey, id: string): T | undefined { return this.col(c).get(id) as T | undefined; }
  list<T>(c: CollectionKey): T[] { return [...this.col(c).values()] as T[]; }

  private send(c: CollectionKey): void { this.engine.localChange(c, [...this.col(c).values()]); }

  /** Edita como a tela: troca o objeto no estado e o provider passa a coleção ao motor. */
  edit<T extends Item>(c: CollectionKey, id: string, fn: (v: T) => T): void {
    const cur = this.get<T>(c, id);
    if (!cur) throw new Error(`${c}/${id} não está na tela`);
    this.col(c).set(id, fn(structuredClone(cur)));
    this.send(c);
  }
  /** Edita só a tela (como o React antes do debounce de 500 ms): o motor só vê no `beforeRemote` ou em `flushDebounced`. */
  editDebounced<T extends Item>(c: CollectionKey, id: string, fn: (v: T) => T): void {
    const cur = this.get<T>(c, id);
    if (!cur) throw new Error(`${c}/${id} não está na tela`);
    this.col(c).set(id, fn(structuredClone(cur)));
    this.debounced.add(c);
  }
  flushDebounced(): void {
    const names = [...this.debounced];
    this.debounced.clear();
    for (const c of names) this.send(c);
  }
  add<T extends Item>(c: CollectionKey, item: T): void { this.col(c).set(item.id, item); this.send(c); }
  remove(c: CollectionKey, id: string): void { this.col(c).delete(id); this.send(c); }

  /** Pull + envio e espera tudo terminar. */
  async sync(): Promise<void> { await this.engine.syncNow(); await this.engine.settled(); }
  async push(): Promise<void> { await this.engine.flushNow(); await this.engine.settled(); }
  async pull(): Promise<void> { await this.engine.pullNow(); await this.engine.settled(); }
  goOffline(): void { this.engine.setOnline(false); }
  async goOnline(): Promise<void> { this.engine.setOnline(true); await this.engine.settled(); }

  get tables(): CloudTable[] { return visibleTables(this.role); }
}
