// Edge Function `money` (docs/NUVEM-SPEC.md seção 3): toda operação de dinheiro da OS, com a regra em TypeScript
// puro (src/services) e a transação no Postgres (`apply_money_op`). Sem Deno, React nem Tauri: o banco entra pela
// porta `MoneyStore` (REST em `moneyStore.ts`, memória nos testes).
//
// Contrato (POST, `Authorization: Bearer <jwt>`):
//   { opId: uuid, kind, osId?, entryId?, today: 'AAAA-MM-DD', payload?: {...}, known?: {'tabela:id': versão},
//     machine?: string, deviceId?: uuid }
//   kind: os.finalizeSingle | os.installment {config} | os.status {newStatus} | os.restore {target} | os.delete
//         | os.save {isNew?, opened?, base, drafts?} | ledger.toggle (entryId)
// Respostas: 200 { ok, kind, replay?, rows:[{table,id,version}], info }; 409 `conflito_versao` com `rows` atuais;
// 409 `estado_mudou` e 422 `bloqueado` com a mensagem pronta para a tela; 403 `sem_permissao` (Mecânico) ou
// `exige_mfa`; 400 dados inválidos; 500 `fuso_do_servidor`.
// `op_id` repetido devolve o resultado gravado SEM refazer as guardas (o estado já mudou).
import {
  HttpError, asRecord, authenticate, guarded, okResult, requireOwner, reqString, reqUuid,
  type Caller, type Deps, type HandlerRequest, type HandlerResult,
} from './core'
import {
  applyInstallmentToOS, buildInstallmentEntries, ensureUniqueItemIds, finalizeOSSingle,
  findAdvanceOwner, formatDateOnly, getDateTimeZone, getRemainingAmount, joinWorkOrder, mergeOSEdit, parseDateOnly,
  planDeleteOS, prepareOSSave, removeAllAdvances, removeOSReceipt, restoreFinancial, setDateTimeZone, settleOpenReceipt,
  splitWorkOrder, stable, statusChangeEffects, togglePayment, validateAdvance,
} from '../services/serverEntry'
import type { WorkOrderCosts, WorkOrderFinance, WorkOrderMain } from '../services/serverEntry'
import type { AuditEvent, InstallmentConfig, LedgerEntry, OSAdvanceDraft, OSStatus, WorkOrder } from '../types'

export const MONEY_KINDS = [
  'os.finalizeSingle', 'os.installment', 'os.status', 'os.restore', 'os.delete', 'os.save', 'ledger.toggle',
] as const
export type MoneyKind = typeof MONEY_KINDS[number]

export type MoneyTable = 'work_orders' | 'work_order_finance' | 'work_order_costs' | 'ledger'

/** Linha como o PostgREST devolve (`data` + colunas de controle). */
export interface MoneyRow {
  table: MoneyTable
  id: string
  version: number
  data: Record<string, unknown>
  deletedAt: string | null
  /** Só `ledger`. */
  osId?: string | null
}

export interface MoneyWrite { table: MoneyTable; id: string; data: unknown; deleted?: boolean; os_id?: string | null }
export interface MoneyExpected { table: MoneyTable; id: string; version: number }

export interface ApplyArgs {
  opId: string
  workshopId: string
  userId: string
  deviceId: string | null
  kind: MoneyKind
  expected: MoneyExpected[]
  writes: MoneyWrite[]
  audit: { id: string; data: unknown }[]
}
export type ApplyResult =
  | { status: 'ok'; rows: { table: string; id: string; version: number }[] }
  | { status: 'conflict'; rows: unknown[] }

export interface StoredOp { workshopId: string; userId: string; kind: string; result: unknown }

/** Erro conhecido da função SQL `apply_money_op` (a mensagem é o código: `op_id_reutilizado`, `sem_permissao`...). */
export class MoneyStoreError extends Error {
  constructor(readonly code: string, message?: string) { super(message ?? code) }
}

/** Porta do banco (chave de serviço). */
export interface MoneyStore {
  getOp(opId: string): Promise<StoredOp | null>
  workshopTz(workshopId: string): Promise<string | null>
  /** `work_orders`, `work_order_finance` e `work_order_costs` do id (sem filtrar `deleted_at`). */
  loadOS(workshopId: string, osId: string): Promise<MoneyRow[]>
  /** `ledger where os_id = osId and deleted_at is null`. */
  loadLedgerByOS(workshopId: string, osId: string): Promise<MoneyRow[]>
  loadLedgerEntry(workshopId: string, id: string): Promise<MoneyRow | null>
  apply(a: ApplyArgs): Promise<ApplyResult>
}

export interface MoneyDeps extends Deps { store: MoneyStore }

const STATUSES: readonly OSStatus[] = ['ORCAMENTO', 'APROVADO', 'EM_SERVICO', 'AGUARDANDO_PAGAMENTO', 'FINALIZADO', 'ARQUIVADO']
const ID_RE = /^[A-Za-z0-9-]{1,64}$/
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

const pure = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

export const WRONG_STATE_MESSAGE = 'Esta OS mudou em outro aparelho. Os dados foram atualizados: confira e tente de novo.'
export const VERSION_CONFLICT_MESSAGE = 'Outra pessoa mexeu nesta OS ou no caixa agora há pouco. Os dados foram atualizados: confira e tente de novo.'
export const ZONE_MESSAGE = 'O servidor não conseguiu acertar o fuso da oficina. Nada foi gravado. Avise quem cuida do sistema.'
const INCOMPLETE_MESSAGE = 'Os dados desta OS ainda estão chegando. Tente de novo em instantes.'

// ---------- fuso ----------

/** Autoteste do fuso (spec seção 3): falhou, 500 sem gravar. `America/Sao_Paulo` confere o instante exato. */
function zoneSelfTest(tz: string): boolean {
  try {
    if (getDateTimeZone() !== tz) return false
    const noon = parseDateOnly('2026-01-01')
    if (formatDateOnly(noon) !== '2026-01-01') return false
    if (tz === 'America/Sao_Paulo' && noon.toISOString() !== '2026-01-01T15:00:00.000Z') return false
    return true
  } catch { return false }
}

/** Roda `fn` (SÍNCRONA) com o fuso da oficina. O fuso é estado do módulo: nada de `await` dentro. */
function withZone<T>(tz: string, fn: () => T): T {
  try {
    setDateTimeZone(tz)
  } catch {
    setDateTimeZone(null)
    throw new HttpError(500, 'fuso_do_servidor', ZONE_MESSAGE)
  }
  try {
    if (!zoneSelfTest(tz)) throw new HttpError(500, 'fuso_do_servidor', ZONE_MESSAGE)
    return fn()
  } finally {
    setDateTimeZone(null)
  }
}

const dayNumber = (d: string): number =>
  Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000

// ---------- corpo ----------

interface MoneyRequest {
  opId: string
  kind: MoneyKind
  osId: string | null
  entryId: string | null
  today: string
  payload: Record<string, unknown>
  known: Record<string, number>
  machine: string
  deviceId: string | null
}

function parseRequest(body: unknown, caller: Caller): MoneyRequest {
  const b = asRecord(body)
  const kind = b.kind
  if (typeof kind !== 'string' || !(MONEY_KINDS as readonly string[]).includes(kind)) {
    throw new HttpError(400, 'acao_invalida', 'Ação desconhecida.')
  }
  const opId = reqUuid(b, 'opId')
  const today = b.today
  if (typeof today !== 'string' || !DATE_ONLY.test(today)) throw new HttpError(400, 'dados_invalidos', 'Campo "today" inválido.')
  let osId: string | null = null
  let entryId: string | null = null
  if (kind === 'ledger.toggle') {
    entryId = reqString(b, 'entryId', 1, 64)
    if (!ID_RE.test(entryId)) throw new HttpError(400, 'dados_invalidos', 'Campo "entryId" inválido.')
  } else {
    osId = reqString(b, 'osId', 1, 64)
    if (!ID_RE.test(osId)) throw new HttpError(400, 'dados_invalidos', 'Campo "osId" inválido.')
  }
  const payload = b.payload === undefined ? {} : asRecord(b.payload)
  const known: Record<string, number> = {}
  if (b.known !== undefined) {
    for (const [k, v] of Object.entries(asRecord(b.known))) {
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new HttpError(400, 'dados_invalidos', 'Campo "known" inválido.')
      known[k] = v
    }
  }
  const machineRaw = typeof b.machine === 'string' ? b.machine.trim().slice(0, 80) : ''
  const deviceId = typeof b.deviceId === 'string' && /^[0-9a-f-]{36}$/i.test(b.deviceId) ? b.deviceId.toLowerCase() : null
  return {
    opId, kind: kind as MoneyKind, osId, entryId, today, payload, known,
    machine: machineRaw || caller.displayName || 'Servidor', deviceId,
  }
}

// ---------- plano ----------

export interface Plan {
  /** OS depois da operação; `null` = OS excluída. */
  os: WorkOrder | null
  ledger: LedgerEntry[]
  audit: AuditEvent[]
  info: Record<string, unknown>
}

export interface Loaded {
  osId: string | null
  rows: { main?: MoneyRow; fin?: MoneyRow; cost?: MoneyRow }
  os: WorkOrder | null
  ledgerRows: MoneyRow[]
  ledger: LedgerEntry[]
}

const reject = (status: number, code: string, message: string): never => { throw new HttpError(status, code, message) }

function toOS(r: Loaded['rows']): WorkOrder | null {
  if (!r.main || r.main.deletedAt) return null
  if (!r.fin || r.fin.deletedAt) return reject(409, 'registro_incompleto', INCOMPLETE_MESSAGE)
  const cost = r.cost && !r.cost.deletedAt ? (r.cost.data as unknown as WorkOrderCosts) : undefined
  const os = joinWorkOrder(r.main.data as unknown as WorkOrderMain, r.fin.data as unknown as WorkOrderFinance, cost)
  return os ?? reject(409, 'registro_incompleto', INCOMPLETE_MESSAGE)
}

async function load(deps: MoneyDeps, ws: string, req: MoneyRequest): Promise<Loaded> {
  let osId = req.osId
  let entryRow: MoneyRow | null = null
  if (req.kind === 'ledger.toggle') {
    entryRow = await deps.store.loadLedgerEntry(ws, req.entryId as string)
    if (!entryRow || entryRow.deletedAt) throw new HttpError(404, 'lancamento_nao_encontrado', 'Este lançamento não existe mais. Os dados foram atualizados.')
    osId = entryRow.osId ?? null
  }
  const rows: Loaded['rows'] = {}
  let ledgerRows: MoneyRow[] = []
  if (osId) {
    for (const r of await deps.store.loadOS(ws, osId)) {
      if (r.table === 'work_orders') rows.main = r
      else if (r.table === 'work_order_finance') rows.fin = r
      else if (r.table === 'work_order_costs') rows.cost = r
    }
    ledgerRows = await deps.store.loadLedgerByOS(ws, osId)
  } else if (entryRow) {
    ledgerRows = [entryRow]
  }
  return { osId, rows, os: osId ? toOS(rows) : null, ledgerRows, ledger: ledgerRows.map(r => r.data as unknown as LedgerEntry) }
}

/** Versões que o cliente diz conhecer contra as do servidor (só as linhas carregadas). Devolve as linhas atuais se divergir. */
function checkKnown(known: Record<string, number>, loaded: Loaded): MoneyRow[] | null {
  const all: MoneyRow[] = [...Object.values(loaded.rows).filter((r): r is MoneyRow => !!r), ...loaded.ledgerRows]
  const bad = all.some(r => {
    const k = known[`${r.table}:${r.id}`]
    return k !== undefined && k !== r.version
  })
  return bad ? all : null
}

/** UUID v4 a partir de `deps.random` (testes determinísticos; no Deno, `crypto.getRandomValues`). */
const newIdFactory = (deps: Deps): (() => string) => () => {
  const b = deps.random(16)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

interface Ctx {
  req: MoneyRequest
  caller: Caller
  loaded: Loaded
  now: string
  newId: () => string
}

function needOS(c: Ctx): WorkOrder {
  return c.loaded.os ?? reject(404, 'os_nao_encontrada', 'Esta OS não existe mais. Os dados foram atualizados.')
}

function checkItemPrices(os: Pick<WorkOrder, 'parts' | 'services'>): void {
  for (const it of [...os.parts, ...os.services]) {
    if (it.price !== undefined && (typeof it.price !== 'number' || !Number.isSafeInteger(it.price))) {
      reject(400, 'dados_invalidos', 'Valor de item inválido.')
    }
  }
}

const sumPrices = (os: Pick<WorkOrder, 'parts' | 'services'>): number =>
  [...os.parts, ...os.services].reduce((a, b) => a + (b.price ?? 0), 0)

function planFinalizeSingle(c: Ctx): Plan {
  const os = needOS(c)
  if (statusChangeEffects(os, 'FINALIZADO', c.now, c.loaded.ledger).kind !== 'ask-finish') return reject(409, 'estado_mudou', WRONG_STATE_MESSAGE)
  const r = finalizeOSSingle(os, { now: c.now, newId: c.newId })
  return {
    os: r.os,
    ledger: r.entry ? [r.entry, ...c.loaded.ledger] : c.loaded.ledger,
    audit: [],
    info: { osNumber: os.osNumber, amount: r.entry?.amount ?? 0 },
  }
}

function planInstallment(c: Ctx): Plan {
  const os = needOS(c)
  if (statusChangeEffects(os, 'FINALIZADO', c.now, c.loaded.ledger).kind !== 'ask-finish') return reject(409, 'estado_mudou', WRONG_STATE_MESSAGE)
  const raw = asRecord(c.req.payload.config)
  const total = getRemainingAmount(os)
  if (total <= 0) return reject(422, 'nada_a_parcelar', 'Não há valor restante a parcelar nesta OS.')
  if (raw.totalAmount !== undefined && raw.totalAmount !== total) {
    return reject(409, 'valor_mudou', 'O valor a parcelar mudou (adiantamento ou itens). Os dados foram atualizados: confira e tente de novo.')
  }
  const n = raw.installments
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 60) return reject(400, 'dados_invalidos', 'Número de parcelas inválido (1 a 60).')
  const first = raw.firstPaymentDate
  if (typeof first !== 'string' || (!DATE_ONLY.test(first) && Number.isNaN(Date.parse(first)))) {
    return reject(400, 'dados_invalidos', 'Data da primeira parcela inválida.')
  }
  if (DATE_ONLY.test(first) && formatDateOnly(parseDateOnly(first)) !== first) return reject(400, 'dados_invalidos', 'Data da primeira parcela inválida.')
  const desc = typeof raw.description === 'string' && raw.description.trim()
    ? raw.description.trim().slice(0, 200)
    : `Parcelamento OS #${os.osNumber} - ${os.clientName}`
  const base = Math.floor(total / n)
  const config: InstallmentConfig = {
    totalAmount: total, installments: n, installmentAmount: base, lastInstallmentAmount: base + (total - base * n),
    firstPaymentDate: first, groupId: c.newId(), description: desc,
  }
  const entries = buildInstallmentEntries(config, { now: c.now, newId: c.newId })
  if (entries.length === 0) return reject(422, 'nada_a_parcelar', 'Não há valor restante a parcelar nesta OS.')
  return {
    os: applyInstallmentToOS(os, config, entries[0].id),
    ledger: [...entries, ...c.loaded.ledger],
    audit: [],
    info: { osNumber: os.osNumber, installments: n },
  }
}

function planStatus(c: Ctx): Plan {
  const os = needOS(c)
  const ns = c.req.payload.newStatus
  if (typeof ns !== 'string' || !(STATUSES as readonly string[]).includes(ns)) return reject(400, 'dados_invalidos', 'Status inválido.')
  const effect = statusChangeEffects(os, ns as OSStatus, c.now, c.loaded.ledger)
  if (effect.kind === 'blocked') return reject(422, 'bloqueado', effect.message)
  if (effect.kind !== 'update') return reject(409, 'estado_mudou', WRONG_STATE_MESSAGE)
  return {
    os: { ...os, ...effect.updates },
    ledger: effect.settleEntry ? settleOpenReceipt(c.loaded.ledger, effect.settleEntry.entryId, effect.settleEntry.paymentDate) : c.loaded.ledger,
    audit: [],
    info: { osNumber: os.osNumber, status: ns },
  }
}

function planRestore(c: Ctx): Plan {
  const os = needOS(c)
  const target = c.req.payload.target
  if (typeof target !== 'string' || !(STATUSES as readonly string[]).includes(target)) return reject(400, 'dados_invalidos', 'Status inválido.')
  const effect = statusChangeEffects(os, target as OSStatus, c.now, c.loaded.ledger)
  if (effect.kind === 'blocked') return reject(422, 'bloqueado', effect.message)
  if (effect.kind !== 'ask-restore') return reject(409, 'estado_mudou', WRONG_STATE_MESSAGE)
  const restored = restoreFinancial(c.loaded.ledger, os, effect.target)
  return {
    os: restored.os, ledger: restored.ledger, audit: [],
    info: { osNumber: os.osNumber, removedCount: restored.removedCount, removedGroup: restored.removedGroup },
  }
}

function planDelete(c: Ctx): Plan {
  const os = needOS(c)
  const guard = planDeleteOS(os, c.loaded.ledger)
  if (!guard.ok) return reject(422, 'bloqueado', guard.message)
  const removed = removeAllAdvances({ os, ledger: removeOSReceipt(os, c.loaded.ledger), now: c.now, newId: c.newId, machine: c.req.machine })
  return { os: null, ledger: removed.ledger, audit: removed.events, info: { osNumber: os.osNumber } }
}

/** Quem não vê custos não os grava: o custo do Dono sobrevive à edição da Recepção. */
function keepCosts(next: WorkOrder, current: WorkOrder, caller: Caller): WorkOrder {
  if (caller.role === 'dono') return next
  const byId = new Map([...current.parts, ...current.services].map(i => [i.id, i]))
  const fix = (items: WorkOrder['parts']): WorkOrder['parts'] => items.map(i => {
    const old = byId.get(i.id)
    return old?.cost !== undefined && i.cost === undefined ? { ...i, cost: old.cost } : i
  })
  const out: WorkOrder = { ...next, parts: fix(next.parts), services: fix(next.services) }
  if (current.totalCost !== undefined) out.totalCost = current.totalCost
  if (current.profit !== undefined) out.profit = current.profit
  return out
}

function parseDrafts(v: unknown): OSAdvanceDraft[] | undefined {
  if (v === undefined || v === null) return undefined
  if (!Array.isArray(v) || v.length > 50) return reject(400, 'dados_invalidos', 'Adiantamentos inválidos.')
  return v.map((x): OSAdvanceDraft => {
    const r = asRecord(x)
    if (typeof r.date !== 'string' || typeof r.amount !== 'number' || (r.id !== undefined && typeof r.id !== 'string')) {
      return reject(400, 'dados_invalidos', 'Adiantamentos inválidos.')
    }
    return { ...(typeof r.id === 'string' ? { id: r.id } : {}), date: r.date, amount: r.amount }
  })
}

/** Chaves da OS que só os kinds próprios mudam: o salvar mantém as do servidor. */
const KEEP_FROM_CURRENT = ['status', 'financialId', 'paymentDate', 'paymentMethod', 'installmentConfig'] as const

function planSave(c: Ctx): Plan {
  const p = c.req.payload
  const edited = pure(asRecord(p.base)) as unknown as WorkOrder
  if (!Array.isArray(edited.parts) || !Array.isArray(edited.services)) return reject(400, 'dados_invalidos', 'OS inválida.')
  checkItemPrices(edited)
  const drafts = parseDrafts(p.drafts)
  if (drafts) {
    for (const d of drafts) {
      const v = validateAdvance(d, c.req.today)
      if (!v.valid) return reject(422, 'adiantamento_invalido', v.error ?? 'Adiantamento inválido.')
    }
  }
  const osId = c.req.osId as string
  if (edited.id !== osId) return reject(400, 'dados_invalidos', 'Id da OS não confere.')

  if (p.isNew === true) {
    if (c.loaded.rows.main) return reject(409, 'estado_mudou', WRONG_STATE_MESSAGE)
    const clean: WorkOrder = { ...edited, ...ensureUniqueItemIds(osId, edited.parts, edited.services), status: 'ORCAMENTO' }
    for (const k of ['financialId', 'paymentDate', 'paymentMethod', 'installmentConfig', 'advanceAmount', 'advanceEntryId', 'advances', 'profitMargin'] as const) delete clean[k]
    clean.total = sumPrices(clean)
    const saved = prepareOSSave({ base: clean, drafts, ledger: [], today: c.req.today, now: c.now, newId: c.newId, machine: c.req.machine })
    if (!saved.ok) return reject(422, 'adiantamento_invalido', saved.error)
    return { os: saved.os, ledger: saved.ledger, audit: saved.events, info: { osNumber: clean.osNumber, exceedsTotal: saved.exceedsTotal } }
  }

  const current = needOS(c)
  const opened = p.opened === undefined ? current : (pure(asRecord(p.opened)) as unknown as WorkOrder)
  const merged = mergeOSEdit({ opened, edited, current, drafts, today: c.req.today })
  if (!merged.ok) return reject(409, 'os_excluida', 'Esta OS foi excluída em outro aparelho.')
  const saved = prepareOSSave({
    base: merged.base, previous: current, drafts: merged.drafts, ledger: c.loaded.ledger,
    today: c.req.today, now: c.now, newId: c.newId, machine: c.req.machine,
  })
  if (!saved.ok) return reject(422, 'adiantamento_invalido', saved.error)
  let next: WorkOrder = { ...saved.os }
  // Status e receita ligada nunca mudam pelo salvar: só pelos kinds próprios.
  const nx = next as unknown as Record<string, unknown>
  for (const k of KEEP_FROM_CURRENT) {
    const cur = (current as unknown as Record<string, unknown>)[k]
    if (cur === undefined) delete nx[k]
    else nx[k] = cur
  }
  checkItemPrices(next)
  next.total = sumPrices(next)
  next = keepCosts(next, current, c.caller)
  return {
    os: next, ledger: saved.ledger, audit: saved.events,
    info: { osNumber: next.osNumber, exceedsTotal: saved.exceedsTotal, changedElsewhere: merged.changedElsewhere, conflicts: merged.conflicts },
  }
}

function planToggle(c: Ctx): Plan {
  const entryId = c.req.entryId as string
  const os = c.loaded.os
  if (os && findAdvanceOwner([os], entryId)) {
    return reject(422, 'bloqueado', `Este lançamento é um adiantamento. Edite pela OS #${os.osNumber}.`)
  }
  const r = togglePayment(c.loaded.ledger, os ? [os] : [], entryId, c.now)
  if (!r) return reject(422, 'bloqueado', 'Só receitas podem ser marcadas como pagas.')
  return {
    os: os ? (r.workOrders[0] ?? os) : null,
    ledger: r.ledger, audit: [],
    info: { paid: r.paid, ...(r.osEffect ? { osEffect: r.osEffect } : {}) },
  }
}

// ---------- escrita ----------

export function buildWrites(loaded: Loaded, plan: Plan): { expected: MoneyExpected[]; writes: MoneyWrite[] } {
  const expected = new Map<string, MoneyExpected>()
  const writes: MoneyWrite[] = []
  const want = (table: MoneyTable, id: string, version: number): void => { expected.set(`${table}:${id}`, { table, id, version }) }
  // Tudo que foi lido entra no `expected`: se mudou entre a leitura e a gravação, é conflito.
  for (const r of Object.values(loaded.rows)) if (r) want(r.table, r.id, r.version)
  for (const r of loaded.ledgerRows) want('ledger', r.id, r.version)

  const osId = loaded.osId
  if (osId) {
    const { main, fin, cost } = loaded.rows
    if (plan.os === null) {
      for (const r of [main, fin, cost]) if (r && !r.deletedAt) writes.push({ table: r.table, id: r.id, data: r.data, deleted: true })
    } else {
      const s = splitWorkOrder(plan.os)
      const put = (table: MoneyTable, row: MoneyRow | undefined, data: unknown): void => {
        if (data === undefined) return
        if (row && !row.deletedAt) {
          if (stable(row.data) !== stable(data)) writes.push({ table, id: osId, data })
        } else {
          want(table, osId, row?.version ?? 0)
          writes.push({ table, id: osId, data })
        }
      }
      put('work_orders', main, s.main)
      put('work_order_finance', fin, s.fin)
      put('work_order_costs', cost, s.cost)
    }
  }

  const before = new Map(loaded.ledgerRows.map(r => [r.id, r]))
  const after = new Map(plan.ledger.map(e => [e.id, e]))
  for (const [id, e] of after) {
    const old = before.get(id)
    if (!old) {
      want('ledger', id, 0)
      writes.push({ table: 'ledger', id, data: pure(e), os_id: osId })
    } else if (stable(old.data) !== stable(e)) {
      writes.push({ table: 'ledger', id, data: pure(e), ...(osId ? { os_id: osId } : {}) })
    }
  }
  for (const [id, old] of before) if (!after.has(id)) writes.push({ table: 'ledger', id, data: old.data, deleted: true })
  return { expected: [...expected.values()], writes }
}

// ---------- handler ----------

export async function handleMoneyOp(deps: MoneyDeps, req: HandlerRequest): Promise<HandlerResult> {
  return guarded(deps, async () => {
    const caller = await authenticate(deps, req.authorization)
    if (caller.role === 'mecanico') throw new HttpError(403, 'sem_permissao', 'Só a Recepção ou o Dono mexem com dinheiro.')
    if (caller.role === 'dono') requireOwner(caller)
    const r = parseRequest(req.body, caller)
    const ws = caller.workshopId

    // Idempotência primeiro: o estado já mudou e as guardas recusariam a repetição.
    const prev = await deps.store.getOp(r.opId)
    if (prev) {
      if (prev.workshopId !== ws || prev.userId !== caller.userId || prev.kind !== r.kind) {
        throw new HttpError(409, 'op_id_reutilizado', 'Este identificador de operação já foi usado em outra operação.')
      }
      const res = prev.result as { rows?: unknown } | null
      return okResult({ kind: r.kind, replay: true, rows: Array.isArray(res?.rows) ? res.rows : [], info: {} })
    }

    const tz = await deps.store.workshopTz(ws)
    if (!tz) throw new HttpError(500, 'fuso_do_servidor', ZONE_MESSAGE)
    const loaded = await load(deps, ws, r)
    const stale = checkKnown(r.known, loaded)
    if (stale) {
      throw new HttpError(409, 'conflito_versao', VERSION_CONFLICT_MESSAGE, {
        rows: stale.map(x => ({ table: x.table, id: x.id, version: x.version, data: x.data, deleted_at: x.deletedAt, os_id: x.osId ?? null })),
      })
    }

    const now = deps.now()
    const c: Ctx = { req: r, caller, loaded, now: now.toISOString(), newId: newIdFactory(deps) }
    const plan = withZone(tz, (): Plan => {
      // `today` do cliente vale a ±1 dia do relógio da oficina (cobre virada de dia e relógio torto).
      if (Math.abs(dayNumber(r.today) - dayNumber(formatDateOnly(now))) > 1) {
        throw new HttpError(400, 'data_invalida', 'O relógio deste aparelho está errado. Acerte a data e tente de novo.')
      }
      switch (r.kind) {
        case 'os.finalizeSingle': return planFinalizeSingle(c)
        case 'os.installment': return planInstallment(c)
        case 'os.status': return planStatus(c)
        case 'os.restore': return planRestore(c)
        case 'os.delete': return planDelete(c)
        case 'os.save': return planSave(c)
        case 'ledger.toggle': return planToggle(c)
      }
    })

    const { expected, writes } = buildWrites(loaded, plan)
    const device = r.deviceId ? await deps.db.device(r.deviceId) : null
    const deviceId = device && device.workshopId === ws && !device.revokedAt ? device.id : null

    let res: ApplyResult
    try {
      res = await deps.store.apply({
        opId: r.opId, workshopId: ws, userId: caller.userId, deviceId, kind: r.kind,
        expected, writes, audit: plan.audit.map(e => ({ id: e.id, data: pure(e) })),
      })
    } catch (e) {
      if (e instanceof MoneyStoreError) {
        if (e.code === 'op_id_reutilizado') throw new HttpError(409, 'op_id_reutilizado', 'Este identificador de operação já foi usado em outra operação.')
        if (e.code === 'sem_permissao') throw new HttpError(403, 'sem_permissao', 'Só a Recepção ou o Dono mexem com dinheiro.')
      }
      throw e
    }
    if (res.status === 'conflict') {
      throw new HttpError(409, 'conflito_versao', VERSION_CONFLICT_MESSAGE, { rows: res.rows })
    }
    return okResult({ kind: r.kind, rows: res.rows, info: plan.info })
  })
}
