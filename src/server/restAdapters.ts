// Adaptadores das portas `AuthAdmin` e `Db` sobre HTTP puro (GoTrue e PostgREST) com a chave de serviço.
// Sem supabase-js: o corpo bruto dos erros do GoTrue fica visível e o bundle fica pequeno.
import type {
  AuthAdmin, Db, DeviceKind, DeviceRow, InviteResult, MembershipApplyResult, PinAttempt, Role, RosterEntry,
} from './core'

export interface RestConfig {
  /** `https://<ref>.supabase.co` */
  url: string
  serviceKey: string
  fetchFn?: typeof fetch
  /** Relógio injetável (padrão: Date real). */
  now?: () => Date
}

function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}
/** Tem fator TOTP com status "verified" no objeto de usuário do GoTrue. */
export function hasVerifiedTotp(user: Record<string, unknown>): boolean {
  const f = user.factors
  return Array.isArray(f) && f.some((x) => { const r = rec(x); return r.factor_type === 'totp' && r.status === 'verified' })
}
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

export function makeHttp(cfg: RestConfig) {
  const f = cfg.fetchFn ?? fetch
  const base = cfg.url.replace(/\/+$/, '')
  const headers = (extra: Record<string, string> = {}): Record<string, string> => ({
    apikey: cfg.serviceKey,
    // chaves novas (sb_secret_...) não são JWT: só o apikey
    ...(cfg.serviceKey.startsWith('eyJ') ? { Authorization: `Bearer ${cfg.serviceKey}` } : {}),
    'Content-Type': 'application/json',
    ...extra,
  })
  async function call(method: string, path: string, body?: unknown, extra?: Record<string, string>) {
    const res = await f(`${base}${path}`, { method, headers: headers(extra), body: body === undefined ? undefined : JSON.stringify(body) })
    const raw = await res.text()
    let json: unknown = null
    try { json = raw ? JSON.parse(raw) : null } catch { /* corpo não JSON */ }
    return { ok: res.ok, status: res.status, raw, json }
  }
  return { call, headers, base, f }
}

export function createAuthAdmin(cfg: RestConfig): AuthAdmin {
  const h = makeHttp(cfg)
  return {
    async getUser(jwt) {
      // 401/403 = JWT inválido ou sessão inexistente. Qualquer outra falha (5xx, rede) levanta: o chamador responde 503.
      const res = await h.f(`${h.base}/auth/v1/user`, { headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${jwt}` } })
      if (res.status === 401 || res.status === 403) return null
      if (!res.ok) throw new Error(`GoTrue /user ${res.status}: ${await res.text()}`)
      const j = rec(await res.json().catch(() => null))
      const id = str(j.id)
      return id ? { id, email: str(j.email), verifiedTotp: hasVerifiedTotp(j) } : null
    },
    async invite(email, redirectTo, displayName): Promise<InviteResult> {
      const r = await h.call('POST', `/auth/v1/invite?redirect_to=${encodeURIComponent(redirectTo)}`, {
        email, data: { display_name: displayName },
      })
      if (!r.ok) return { ok: false, status: r.status, raw: r.raw }
      const id = str(rec(r.json).id)
      return id ? { ok: true, userId: id } : { ok: false, status: r.status, raw: r.raw }
    },
    async getUserInfo(userId) {
      const r = await h.call('GET', `/auth/v1/admin/users/${encodeURIComponent(userId)}`)
      if (!r.ok) return null
      const j = rec(r.json)
      return { email: str(j.email), verifiedTotp: hasVerifiedTotp(j), lastSignInAt: str(j.last_sign_in_at), emailConfirmedAt: str(j.email_confirmed_at) }
    },
    async setBanned(userId, banned) {
      const r = await h.call('PUT', `/auth/v1/admin/users/${encodeURIComponent(userId)}`, { ban_duration: banned ? '87600h' : 'none' })
      if (!r.ok) throw new Error(`GoTrue ${r.status}: ${r.raw}`)
    },
    async deleteUser(userId) {
      const r = await h.call('DELETE', `/auth/v1/admin/users/${encodeURIComponent(userId)}`)
      if (!r.ok) throw new Error(`GoTrue ${r.status}: ${r.raw}`)
    },
    async magicLinkToken(email) {
      const r = await h.call('POST', '/auth/v1/admin/generate_link', { type: 'magiclink', email })
      if (!r.ok) throw new Error(`GoTrue ${r.status}: ${r.raw}`)
      const j = rec(r.json)
      const token = str(j.hashed_token) ?? str(rec(j.properties).hashed_token)
      if (!token) throw new Error('GoTrue não devolveu hashed_token')
      return token
    },
  }
}

const q = (v: string) => encodeURIComponent(v)

export function createDb(cfg: RestConfig): Db {
  const h = makeHttp(cfg)
  const now = cfg.now ?? (() => new Date())
  async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const r = await h.call('POST', `/rest/v1/rpc/${fn}`, args)
    if (!r.ok) throw new Error(`rpc ${fn} ${r.status}: ${r.raw}`)
    return r.json
  }
  async function select(path: string): Promise<Record<string, unknown>[]> {
    const r = await h.call('GET', `/rest/v1/${path}`)
    if (!r.ok) throw new Error(`select ${r.status}: ${r.raw}`)
    return Array.isArray(r.json) ? r.json.map(rec) : []
  }
  const toDevice = (j: Record<string, unknown>): DeviceRow => ({
    id: String(j.id), workshopId: String(j.workshop_id), name: String(j.name), kind: j.kind as DeviceKind,
    secretHash: str(j.secret_hash), revokedAt: str(j.revoked_at),
    idleLockMinutes: typeof j.idle_lock_minutes === 'number' ? j.idle_lock_minutes : null,
  })
  return {
    async activeMembership(userId) {
      const rows = await select(`memberships?user_id=eq.${q(userId)}&active=eq.true&order=invited_at.asc&limit=1&select=workshop_id,user_id,role,display_name`)
      const j = rows[0]
      return j ? { workshopId: String(j.workshop_id), userId: String(j.user_id), role: j.role as Role, displayName: str(j.display_name) } : null
    },
    async userIdByEmail(email) {
      return str(await rpc('user_id_by_email', { p_email: email }))
    },
    async hasMembership(ws, userId) {
      return (await select(`memberships?workshop_id=eq.${q(ws)}&user_id=eq.${q(userId)}&select=user_id&limit=1`)).length > 0
    },
    async insertMembership(m) {
      const r = await h.call('POST', '/rest/v1/memberships', {
        workshop_id: m.workshopId, user_id: m.userId, role: m.role, display_name: m.displayName, active: true,
      })
      if (!r.ok) throw new Error(`insert membership ${r.status}: ${r.raw}`)
    },
    async membershipApply(ws, userId, action, role): Promise<MembershipApplyResult> {
      const j = rec(await rpc('membership_apply', { p_ws: ws, p_user: userId, p_action: action, p_role: role ?? null }))
      return {
        status: j.status as MembershipApplyResult['status'],
        role: (str(j.role) as Role | null),
        active: typeof j.active === 'boolean' ? j.active : null,
      }
    },
    async listMembers(ws) {
      const rows = await select(`memberships?workshop_id=eq.${q(ws)}&order=invited_at.asc&select=user_id,role,display_name,active,invited_at`)
      return rows.map((j) => ({
        userId: String(j.user_id), displayName: str(j.display_name), role: j.role as Role, active: j.active !== false, invitedAt: str(j.invited_at) ?? '',
      }))
    },
    async pinLockedUsers(ws) {
      return (await select(`member_pins?workshop_id=eq.${q(ws)}&locked=eq.true&select=user_id`)).map((j) => String(j.user_id))
    },
    async pinUnlock(ws, userId) {
      return (await rpc('pin_unlock', { p_ws: ws, p_user: userId })) === true
    },
    async pinSet(ws, userId, pin) {
      await rpc('pin_set', { p_ws: ws, p_user: userId, p_pin: pin })
    },
    async pinAttempt(ws, userId, pin, deviceId): Promise<PinAttempt> {
      const j = rec(await rpc('pin_attempt', { p_ws: ws, p_user: userId, p_pin: pin, p_device: deviceId }))
      return { status: j.status as PinAttempt['status'], failed: typeof j.failed === 'number' ? j.failed : 0 }
    },
    async roster(ws): Promise<RosterEntry[]> {
      const j = await rpc('pin_roster', { p_ws: ws })
      return (Array.isArray(j) ? j : []).map((x) => {
        const r = rec(x)
        return { userId: String(r.userId), displayName: str(r.displayName), role: r.role as Role, locked: r.locked === true }
      })
    },
    async device(id) {
      const rows = await select(`devices?id=eq.${q(id)}&select=*&limit=1`)
      return rows[0] ? toDevice(rows[0]) : null
    },
    async insertDevice(d) {
      const r = await h.call('POST', '/rest/v1/devices?select=id', {
        workshop_id: d.workshopId, name: d.name, kind: d.kind, secret_hash: d.secretHash, authorized_by: d.authorizedBy,
      }, { Prefer: 'return=representation' })
      if (!r.ok) throw new Error(`insert device ${r.status}: ${r.raw}`)
      const id = Array.isArray(r.json) ? str(rec(r.json[0]).id) : null
      if (!id) throw new Error('insert device sem id')
      return id
    },
    async revokeDevice(ws, id) {
      const r = await h.call('PATCH', `/rest/v1/devices?id=eq.${q(id)}&workshop_id=eq.${q(ws)}&select=id`,
        { revoked_at: now().toISOString() }, { Prefer: 'return=representation' })
      if (!r.ok) throw new Error(`revoke device ${r.status}: ${r.raw}`)
      if (Array.isArray(r.json) && r.json.length > 0) return true
      return false
    },
    async setDeviceIdle(ws, id, minutes) {
      const r = await h.call('PATCH', `/rest/v1/devices?id=eq.${q(id)}&workshop_id=eq.${q(ws)}&revoked_at=is.null&select=id`,
        { idle_lock_minutes: minutes }, { Prefer: 'return=representation' })
      if (!r.ok) throw new Error(`set idle ${r.status}: ${r.raw}`)
      return Array.isArray(r.json) && r.json.length > 0
    },
    async broadcast(ws, event, payload) {
      const r = await h.call('POST', '/realtime/v1/api/broadcast', {
        messages: [{ topic: `ws:${ws}`, event, payload, private: true }],
      })
      if (!r.ok) throw new Error(`broadcast ${r.status}: ${r.raw}`)
    },
  }
}
