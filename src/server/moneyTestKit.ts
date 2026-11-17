// Loja em memória da porta `MoneyStore` para os testes: imita `apply_money_op` (idempotência, versão esperada,
// insert/update/soft-delete, conflito sem gravar) sem Postgres. Só testes.
import {
  MoneyStoreError,
  type ApplyArgs, type ApplyResult, type MoneyDeps, type MoneyRow, type MoneyStore, type MoneyTable, type StoredOp,
} from './moneyHandler'
import { WS, makeDeps, makeState, type FakeState } from './testKit'
import { splitWorkOrder } from '../services/serverEntry'
import type { LedgerEntry, WorkOrder } from '../types'

interface Cell { version: number; data: Record<string, unknown>; deletedAt: string | null; osId: string | null }

export class MemoryMoneyStore implements MoneyStore {
  cells = new Map<string, Cell>()
  ops = new Map<string, StoredOp>()
  audit: { id: string; data: unknown }[] = []
  tz: string | null = 'America/Sao_Paulo'
  applyCalls = 0
  /** Roda logo antes da conferência de versões em `apply` (simula outra pessoa gravando no meio). */
  beforeApply: (() => void) | null = null
  /** Se definido, `apply` levanta este erro (simula `op_id_reutilizado` etc.). */
  applyError: MoneyStoreError | null = null

  private key = (t: string, id: string) => `${t}:${id}`
  put(table: MoneyTable, id: string, data: unknown, osId: string | null = null, version = 1, deletedAt: string | null = null): void {
    this.cells.set(this.key(table, id), { version, data: JSON.parse(JSON.stringify(data)) as Record<string, unknown>, deletedAt, osId })
  }
  get(table: MoneyTable, id: string): Cell | undefined { return this.cells.get(this.key(table, id)) }
  bump(table: MoneyTable, id: string): void { const c = this.get(table, id); if (c) c.version++ }

  /** Grava a OS (3 linhas) e os lançamentos, como o `sync_push` e o `import_rows` deixam. */
  seedOS(os: WorkOrder, ledger: LedgerEntry[] = [], ledgerOwner: string | null = os.id): void {
    const s = splitWorkOrder(os)
    this.put('work_orders', os.id, s.main)
    if (s.fin) this.put('work_order_finance', os.id, s.fin)
    if (s.cost) this.put('work_order_costs', os.id, s.cost)
    for (const e of ledger) this.put('ledger', e.id, e, ledgerOwner)
  }
  ledgerAlive(): LedgerEntry[] {
    return [...this.cells].filter(([k, c]) => k.startsWith('ledger:') && !c.deletedAt).map(([, c]) => c.data as unknown as LedgerEntry)
  }

  private row(table: MoneyTable, id: string): MoneyRow | null {
    const c = this.get(table, id)
    return c ? { table, id, version: c.version, data: c.data, deletedAt: c.deletedAt, ...(table === 'ledger' ? { osId: c.osId } : {}) } : null
  }

  async getOp(opId: string) { return this.ops.get(opId) ?? null }
  async workshopTz() { return this.tz }
  async loadOS(_ws: string, osId: string) {
    return (['work_orders', 'work_order_finance', 'work_order_costs'] as const)
      .map(t => this.row(t, osId)).filter((r): r is MoneyRow => !!r)
  }
  async loadLedgerByOS(_ws: string, osId: string) {
    return [...this.cells].filter(([k, c]) => k.startsWith('ledger:') && c.osId === osId && !c.deletedAt)
      .map(([k]) => this.row('ledger', k.slice('ledger:'.length)) as MoneyRow)
  }
  async loadLedgerEntry(_ws: string, id: string) { return this.row('ledger', id) }

  async apply(a: ApplyArgs): Promise<ApplyResult> {
    this.applyCalls++
    if (this.applyError) throw this.applyError
    this.beforeApply?.()
    const prev = this.ops.get(a.opId)
    if (prev) return prev.result as ApplyResult
    const conflict = a.expected.some(e => (this.get(e.table, e.id)?.version ?? 0) !== e.version)
    if (conflict) {
      return {
        status: 'conflict',
        rows: a.expected.map(e => this.row(e.table, e.id)).filter(Boolean),
      }
    }
    const rows: { table: string; id: string; version: number }[] = []
    for (const w of a.writes) {
      const cur = this.get(w.table, w.id)
      const exp = a.expected.find(e => e.table === w.table && e.id === w.id)
      if (!exp) throw new Error('write_sem_expected')
      if (exp.version === 0) {
        this.put(w.table, w.id, w.data, w.os_id ?? null, 1, w.deleted ? 'now' : null)
      } else if (cur) {
        cur.data = JSON.parse(JSON.stringify(w.data)) as Record<string, unknown>
        cur.version++
        if (w.deleted) cur.deletedAt = cur.deletedAt ?? 'now'
        if (w.os_id) cur.osId = w.os_id
      }
      rows.push({ table: w.table, id: w.id, version: this.get(w.table, w.id)?.version ?? 0 })
    }
    for (const x of a.audit) if (!this.audit.some(y => y.id === x.id)) this.audit.push(x)
    const result: ApplyResult = { status: 'ok', rows, info: a.info }
    this.ops.set(a.opId, { workshopId: a.workshopId, userId: a.userId, kind: a.kind, result, reqHash: a.reqHash })
    return result
  }
}

export function makeMoney(): { s: FakeState; store: MemoryMoneyStore; deps: MoneyDeps; WS: string } {
  const s = makeState()
  const store = new MemoryMoneyStore()
  return { s, store, deps: { ...makeDeps(s), store }, WS }
}

export const OP = (n: number): string => `30000000-0000-0000-0000-${String(n).padStart(12, '0')}`

export function baseOS(over: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: 'os1', osNumber: 7, vehicle: 'Gol 2012', clientName: 'Ana', clientPhone: '11999990000', mileage: 1000,
    status: 'EM_SERVICO', createdAt: '2026-11-01T15:00:00.000Z', publicNotes: '',
    parts: [{ id: 'os1-p0', description: 'Filtro', price: 4000, cost: 1000 }],
    services: [{ id: 'os1-s0', description: 'Troca', price: 6000 }],
    total: 10000,
    ...over,
  }
}
