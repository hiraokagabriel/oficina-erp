// Porta `MoneyStore` sobre PostgREST (chave de serviço). Mesmo padrão de `restAdapters.ts`: HTTP puro, sem supabase-js.
import { makeHttp, type RestConfig } from './restAdapters'
import {
  MoneyStoreError,
  type ApplyArgs, type ApplyResult, type MoneyRow, type MoneyStore, type MoneyTable, type StoredOp,
} from './moneyHandler'

const q = (v: string) => encodeURIComponent(v)

function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function toRow(table: MoneyTable, j: Record<string, unknown>): MoneyRow {
  return {
    table, id: String(j.id), version: Number(j.version), data: rec(j.data),
    deletedAt: typeof j.deleted_at === 'string' ? j.deleted_at : null,
    ...(table === 'ledger' ? { osId: typeof j.os_id === 'string' ? j.os_id : null } : {}),
  }
}

const OS_TABLES: MoneyTable[] = ['work_orders', 'work_order_finance', 'work_order_costs']
const COLS = 'id,version,data,deleted_at'

export function createMoneyStore(cfg: RestConfig): MoneyStore {
  const h = makeHttp(cfg)
  async function select(path: string): Promise<Record<string, unknown>[]> {
    const r = await h.call('GET', `/rest/v1/${path}`)
    if (!r.ok) throw new Error(`select ${r.status}: ${r.raw}`)
    return Array.isArray(r.json) ? r.json.map(rec) : []
  }
  return {
    async getOp(opId): Promise<StoredOp | null> {
      const [j] = await select(`money_ops?op_id=eq.${q(opId)}&select=workshop_id,user_id,kind,result,req_hash&limit=1`)
      return j ? { workshopId: String(j.workshop_id), userId: String(j.user_id), kind: String(j.kind), result: j.result, reqHash: typeof j.req_hash === 'string' ? j.req_hash : null } : null
    },
    async workshopTz(ws) {
      const [j] = await select(`workshops?id=eq.${q(ws)}&select=tz&limit=1`)
      return j && typeof j.tz === 'string' ? j.tz : null
    },
    async workshopImportState(ws) {
      const [j] = await select(`workshops?id=eq.${q(ws)}&select=import_state&limit=1`)
      return j && typeof j.import_state === 'string' ? j.import_state : null
    },
    async loadOS(ws, osId) {
      const out: MoneyRow[] = []
      for (const t of OS_TABLES) {
        const [j] = await select(`${t}?workshop_id=eq.${q(ws)}&id=eq.${q(osId)}&select=${COLS}&limit=1`)
        if (j) out.push(toRow(t, j))
      }
      return out
    },
    async loadLedgerByOS(ws, osId) {
      const rows = await select(`ledger?workshop_id=eq.${q(ws)}&os_id=eq.${q(osId)}&deleted_at=is.null&select=${COLS},os_id&order=id.asc&limit=1000`)
      return rows.map(j => toRow('ledger', j))
    },
    async loadLedgerEntry(ws, id) {
      const [j] = await select(`ledger?workshop_id=eq.${q(ws)}&id=eq.${q(id)}&select=${COLS},os_id&limit=1`)
      return j ? toRow('ledger', j) : null
    },
    async apply(a: ApplyArgs): Promise<ApplyResult> {
      const r = await h.call('POST', '/rest/v1/rpc/apply_money_op', {
        p_op_id: a.opId, p_ws: a.workshopId, p_user: a.userId, p_device: a.deviceId, p_kind: a.kind,
        p_expected: a.expected, p_writes: a.writes, p_audit: a.audit, p_req_hash: a.reqHash, p_info: a.info,
      })
      if (!r.ok) {
        const msg = typeof rec(r.json).message === 'string' ? String(rec(r.json).message) : ''
        if (msg === 'op_id_reutilizado' || msg === 'sem_permissao') throw new MoneyStoreError(msg)
        throw new Error(`rpc apply_money_op ${r.status}: ${r.raw}`)
      }
      const j = rec(r.json)
      if (j.status === 'ok') return { status: 'ok', rows: Array.isArray(j.rows) ? (j.rows as { table: string; id: string; version: number }[]) : [] }
      if (j.status === 'conflict') return { status: 'conflict', rows: Array.isArray(j.rows) ? j.rows : [] }
      throw new Error(`rpc apply_money_op resposta inesperada: ${r.raw}`)
    },
  }
}
