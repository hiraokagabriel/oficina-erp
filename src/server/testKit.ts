// Fakes em memória das portas do servidor, só para os testes Vitest.
import {
  decodeJwtClaims, sha256Hex,
  type AuthAdmin, type Db, type Deps, type DeviceRow, type InviteResult, type Membership, type MembershipApplyResult,
  type PinAttempt, type Role, type RosterEntry,
} from './core'

export const WS = 'aaaaaaaa-0000-0000-0000-000000000001'
export const OWNER = '00000000-0000-0000-0000-0000000000d1'
export const OWNER2 = '00000000-0000-0000-0000-0000000000d2'
export const MECH = '00000000-0000-0000-0000-0000000000f1'
export const RECEP = '00000000-0000-0000-0000-0000000000e1'

export interface FakeState {
  users: Map<string, { email: string; banned: boolean; /** Falso = convite ainda não aceito. */ accepted?: boolean }>
  /** Usuários com TOTP verificado. */
  totp: Set<string>
  /** Se verdadeiro, getUser levanta erro (Auth fora do ar). */
  authDown: boolean
  members: Map<string, Membership & { active: boolean; invitedAt?: string; reactivatedAt?: number }>
  pins: Map<string, { pin: string; failed: number; locked: boolean }>
  devices: Map<string, DeviceRow & { failedHour: number }>
  invites: { email: string; redirectTo: string; displayName: string }[]
  broadcasts: { event: string; payload: Record<string, unknown> }[]
  logs: { level: string; message: string; extra?: Record<string, unknown> }[]
  inviteFails: { status: number; raw: string } | null
  banFails: boolean
  nextId: number
}

export function makeState(): FakeState {
  const s: FakeState = {
    users: new Map(), totp: new Set(), authDown: false, members: new Map(), pins: new Map(), devices: new Map(),
    invites: [], broadcasts: [], logs: [], inviteFails: null, banFails: false, nextId: 1,
  }
  const add = (id: string, email: string, role: Role, name: string) => {
    s.users.set(id, { email, banned: false })
    s.members.set(id, { workshopId: WS, userId: id, role, displayName: name, active: true })
  }
  add(OWNER, 'dono@a.test', 'dono', 'Dono')
  add(OWNER2, 'dono2@a.test', 'dono', 'Dono 2')
  add(MECH, 'mec@a.test', 'mecanico', 'Mecânico')
  add(RECEP, 'rec@a.test', 'recepcao', 'Recepção')
  return s
}

const b64 = (o: unknown): string => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const NOW_SEC = Math.floor(new Date('2026-11-12T12:00:00Z').getTime() / 1000)

export interface JwtOpts { aal?: string; amr?: { method: string; timestamp: number }[] }
/** JWT de mentira com sub, aal e amr (o fake de getUser só lê o sub). Padrão: senha agora, aal1. */
export function jwtFor(id: string, o: JwtOpts = {}): string {
  const payload = { sub: id, aal: o.aal ?? 'aal1', amr: o.amr ?? [{ method: 'password', timestamp: NOW_SEC }] }
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
}
export const auth = (id: string, o: JwtOpts = {}): string => `Bearer ${jwtFor(id, o)}`
const key = (ws: string, u: string) => `${ws}|${u}`

export function makeDeps(s: FakeState, siteUrl: string | null = 'https://oficina.pages.dev'): Deps {
  let counter = 0
  const authAdmin: AuthAdmin = {
    async getUser(jwt) {
      if (s.authDown) throw new Error('GoTrue 503')
      const sub = decodeJwtClaims(jwt).sub
      const id = typeof sub === 'string' && s.users.has(sub) ? sub : null
      return id ? { id, email: s.users.get(id)?.email ?? null, verifiedTotp: s.totp.has(id) } : null
    },
    async invite(email, redirectTo, displayName): Promise<InviteResult> {
      if (s.inviteFails) return { ok: false, ...s.inviteFails }
      s.invites.push({ email, redirectTo, displayName })
      // convite de quem já existe e não aceitou: o GoTrue reenvia e devolve o mesmo usuário
      for (const [uid, u] of s.users) if (u.email === email && u.accepted === false) return { ok: true, userId: uid }
      const id = `10000000-0000-0000-0000-${String(s.nextId++).padStart(12, '0')}`
      s.users.set(id, { email, banned: false, accepted: false })
      return { ok: true, userId: id }
    },
    async getUserInfo(id) {
      const u = s.users.get(id)
      return u ? {
        email: u.email, verifiedTotp: s.totp.has(id),
        lastSignInAt: u.accepted === false ? null : '2026-11-10T12:00:00Z',
        emailConfirmedAt: u.accepted === false ? null : '2026-11-01T12:00:00Z',
      } : null
    },
    async setBanned(id, banned) {
      if (s.banFails) throw new Error('boom')
      const u = s.users.get(id)
      if (u) u.banned = banned
    },
    async deleteUser(id) { s.users.delete(id) },
    async magicLinkToken(email) { return `hashed-${email}` },
  }
  const db: Db = {
    async activeMembership(userId) {
      const m = s.members.get(userId)
      return m && m.active ? { workshopId: m.workshopId, userId: m.userId, role: m.role, displayName: m.displayName } : null
    },
    async userIdByEmail(email) {
      for (const [id, u] of s.users) if (u.email === email.toLowerCase()) return id
      return null
    },
    async hasMembership(ws, id) { const m = s.members.get(id); return !!m && m.workshopId === ws },
    async insertMembership(m) { s.members.set(m.userId, { ...m, active: true }) },
    async membershipApply(ws, userId, action, role): Promise<MembershipApplyResult> {
      const t = s.members.get(userId)
      if (!t || t.workshopId !== ws) return { status: 'not_found', role: null, active: null }
      const others = [...s.members.values()].filter((m) => m.workshopId === ws && m.role === 'dono' && m.active && m.userId !== userId).length
      if (t.role === 'dono' && t.active && others === 0 && (action === 'deactivate' || (action === 'set_role' && role !== 'dono'))) {
        return { status: 'last_owner', role: t.role, active: t.active }
      }
      if (action === 'deactivate') { t.active = false; s.pins.delete(key(ws, userId)) }
      else if (action === 'reactivate') { t.active = true; t.reactivatedAt = new Date('2026-11-12T12:00:00Z').getTime() }
      else if (role) t.role = role
      return { status: 'ok', role: t.role, active: t.active }
    },
    async listMembers(ws) {
      return [...s.members.values()].filter((m) => m.workshopId === ws)
        .map((m) => ({ userId: m.userId, displayName: m.displayName, role: m.role, active: m.active, invitedAt: m.invitedAt ?? '2026-11-01T12:00:00Z' }))
    },
    async pinLockedUsers(ws) {
      return [...s.pins].filter(([k, p]) => k.startsWith(ws + '|') && p.locked).map(([k]) => k.split('|')[1])
    },
    async pinUnlock(ws, userId) {
      const p = s.pins.get(key(ws, userId))
      if (!p) return false
      p.failed = 0
      p.locked = false
      return true
    },
    async hasAnyPin(userId) { return [...s.pins.keys()].some((k) => k.endsWith(`|${userId}`)) },
    async reactivatedAt(_ws, userId) { return s.members.get(userId)?.reactivatedAt ?? null },
    async pinSet(ws, userId, pin) { s.pins.set(key(ws, userId), { pin, failed: 0, locked: false }) },
    async pinAttempt(ws, userId, pin, deviceId): Promise<PinAttempt> {
      let dev: (DeviceRow & { failedHour: number }) | undefined
      if (deviceId) {
        dev = s.devices.get(deviceId)
        if (!dev || dev.workshopId !== ws || dev.revokedAt || dev.kind !== 'pc_compartilhado') return { status: 'suspended', failed: 0 }
      }
      const m = s.members.get(userId)
      const p = s.pins.get(key(ws, userId))
      const found = !!p && !!m && m.active && m.workshopId === ws
      if (found && p!.locked) return { status: 'locked', failed: p!.failed }
      if (found && p!.pin === pin) return { status: 'ok', failed: p!.failed }
      let status: PinAttempt['status'] = 'wrong'
      let failed = 0
      if (found) {
        failed = ++p!.failed
        if (failed >= 5) { p!.locked = true; status = 'locked' }
      }
      if (dev) {
        dev.failedHour++
        if (dev.failedHour > 20) { dev.revokedAt = 'now'; status = 'suspended' }
      }
      return { status, failed }
    },
    async roster(ws): Promise<RosterEntry[]> {
      return [...s.members.values()]
        .filter((m) => m.workshopId === ws && m.active && s.pins.has(key(ws, m.userId)))
        .map((m) => ({ userId: m.userId, displayName: m.displayName, role: m.role, locked: s.pins.get(key(ws, m.userId))!.locked }))
    },
    async device(id) { return s.devices.get(id) ?? null },
    async insertDevice(d) {
      const id = `20000000-0000-0000-0000-${String(s.nextId++).padStart(12, '0')}`
      s.devices.set(id, {
        id, workshopId: d.workshopId, name: d.name, kind: d.kind, secretHash: d.secretHash,
        revokedAt: null, idleLockMinutes: null, failedHour: 0,
      })
      return id
    },
    async revokeDevice(ws, id) {
      const d = s.devices.get(id)
      if (!d || d.workshopId !== ws) return false
      d.revokedAt = 'now'
      return true
    },
    async setDeviceIdle(ws, id, minutes) {
      const d = s.devices.get(id)
      if (!d || d.workshopId !== ws) return false
      d.idleLockMinutes = minutes
      return true
    },
    async broadcast(_ws, event, payload) { s.broadcasts.push({ event, payload }) },
  }
  return {
    auth: authAdmin, db,
    random: (n) => { counter++; return new Uint8Array(n).map((_, i) => (i + counter) & 255) },
    now: () => new Date('2026-11-12T12:00:00Z'),
    log: (level, message, extra) => { s.logs.push({ level, message, extra }) },
    siteUrl,
  }
}

/** Cria um aparelho compartilhado já registrado e devolve id e segredo. */
export async function addDevice(s: FakeState, kind: 'pc_compartilhado' | 'pessoal' = 'pc_compartilhado'): Promise<{ id: string; secret: string }> {
  const id = `20000000-0000-0000-0000-${String(s.nextId++).padStart(12, '0')}`
  const secret = 'seg-' + id
  s.devices.set(id, { id, workshopId: WS, name: 'PC', kind, secretHash: await sha256Hex(secret), revokedAt: null, idleLockMinutes: null, failedHour: 0 })
  return { id, secret }
}
