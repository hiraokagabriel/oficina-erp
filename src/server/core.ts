// Núcleo das Edge Functions `users`, `pin` e `device` (docs/NUVEM-SPEC.md seções 3 e 5).
// Só tipos, portas (dependências injetadas) e utilidades puras: nada de Deno, React ou Tauri.
//
// Riscos aceitos no piloto (revisão do PR 5). Procedimento comum: revogar o aparelho (`device.revoke`) e
// desativar a pessoa (`users.deactivate`).
// - Multi-oficina: `activeMembership` pega a membership ativa mais antiga. Uma pessoa em 2 oficinas sempre cai na
//   primeira. O piloto tem UMA oficina; antes de uma 2ª, o cliente precisa enviar a oficina escolhida e o servidor
//   conferi-la contra as memberships da pessoa (nunca confiar no corpo).
// - Enumeração no convite: `users.invite` distingue `ja_membro` de `email_ja_cadastrado`. Só o Dono chama, então só
//   ele descobre se um e-mail tem cadastro. Aceito; se um Dono for suspeito, desative-o.
// - Revogar aparelho não encerra sessões: `device.revoke` impede novos `pin.unlock`/`roster`, mas o refresh token
//   de quem já entrou segue válido até a pessoa ser desativada (ban de 87600h no Auth). Para cortar o acesso agora,
//   revogue o aparelho E desative a pessoa.
// - Magic link x "esqueci a senha": `generateLink({type:'magiclink'})` troca o token de confirmação/recuperação
//   guardado no GoTrue para o mesmo usuário. Um e-mail de "esqueci a senha" enviado antes do desbloqueio por PIN
//   pode parar de funcionar; a pessoa pede o link de novo.
// - MFA e RLS: o Dono com TOTP é barrado nas funções (`requireOwner` exige `aal2`) e no `unlock`, mas as policies de
//   RLS não olham `aal`: com um JWT `aal1` roubado, o Dono ainda lê e grava pelo PostgREST. Risco residual até a RLS
//   exigir `aal2`.

export type Role = 'dono' | 'recepcao' | 'mecanico'
export const ROLES: readonly Role[] = ['dono', 'recepcao', 'mecanico']
export type DeviceKind = 'pc_compartilhado' | 'pessoal'
export const DEVICE_KINDS: readonly DeviceKind[] = ['pc_compartilhado', 'pessoal']

export interface Membership {
  workshopId: string
  userId: string
  role: Role
  displayName: string | null
}

export interface DeviceRow {
  id: string
  workshopId: string
  name: string
  kind: DeviceKind
  secretHash: string | null
  revokedAt: string | null
  idleLockMinutes: number | null
}

export interface RosterEntry {
  userId: string
  displayName: string | null
  role: Role
  locked: boolean
}

export type InviteResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; raw: string }

export type PinAttemptStatus = 'ok' | 'wrong' | 'locked' | 'suspended'
export interface PinAttempt {
  status: PinAttemptStatus
  failed: number
}

export type MembershipAction = 'deactivate' | 'reactivate' | 'set_role'
export type MembershipApplyStatus = 'ok' | 'not_found' | 'last_owner' | 'invalid'
export interface MembershipApplyResult {
  status: MembershipApplyStatus
  role: Role | null
  active: boolean | null
}

/** Administração do Auth (GoTrue) com a chave de serviço. */
export interface AuthUser {
  id: string
  email: string | null
  /** Tem fator TOTP verificado (MFA ligado). */
  verifiedTotp: boolean
}

/** Dados do Auth de uma pessoa (admin). */
export interface UserInfo {
  email: string | null
  verifiedTotp: boolean
  /** Último login (nulo = nunca entrou). */
  lastSignInAt: string | null
  /** E-mail confirmado (o convite aceito confirma). Nulo = convite ainda não aceito. */
  emailConfirmedAt: string | null
}

/** Linha de `memberships` para a lista da Config (sem e-mail: o e-mail vem do Auth). */
export interface MemberListRow {
  userId: string
  displayName: string | null
  role: Role
  active: boolean
  invitedAt: string
}

export interface AuthAdmin {
  /** Valida o JWT no servidor. Nulo = inválido ou expirado (401/403 do GoTrue). Levanta erro se o Auth estiver fora do ar (5xx, rede). */
  getUser(jwt: string): Promise<AuthUser | null>
  /** Convida por e-mail (envia o e-mail). Devolve o corpo bruto do GoTrue quando falha. */
  invite(email: string, redirectTo: string, displayName: string): Promise<InviteResult>
  /** E-mail e MFA de uma pessoa (admin). Nulo = não existe. */
  getUserInfo(userId: string): Promise<UserInfo | null>
  /** `banned=false` remove o banimento. Levanta erro se o GoTrue recusar. */
  setBanned(userId: string, banned: boolean): Promise<void>
  deleteUser(userId: string): Promise<void>
  /** `generateLink({type:'magiclink'})` sem enviar e-mail: devolve só o `hashed_token`. */
  magicLinkToken(email: string): Promise<string>
}

/** Acesso ao banco com a chave de serviço (tabelas de controle e funções SQL de `20261112120000`). */
export interface Db {
  /** Membership ATIVA da pessoa (a mais antiga, se houver mais de uma). */
  activeMembership(userId: string): Promise<Membership | null>
  userIdByEmail(email: string): Promise<string | null>
  hasMembership(workshopId: string, userId: string): Promise<boolean>
  insertMembership(m: Membership): Promise<void>
  membershipApply(workshopId: string, userId: string, action: MembershipAction, role?: Role): Promise<MembershipApplyResult>
  /** Todas as memberships da oficina (ativas e não), da mais antiga à mais nova. */
  listMembers(workshopId: string): Promise<MemberListRow[]>
  /** Pessoas da oficina com o PIN bloqueado por tentativas. */
  pinLockedUsers(workshopId: string): Promise<string[]>
  /** Zera erros e bloqueio do PIN (função SQL `pin_unlock`). Falso = a pessoa não tem PIN. */
  pinUnlock(workshopId: string, userId: string): Promise<boolean>
  /** A pessoa tem PIN gravado em QUALQUER oficina (bloqueado ou não)? */
  hasAnyPin(userId: string): Promise<boolean>
  /** Instante (ms) da última reativação da pessoa nesta oficina; nulo = nunca foi reativada. */
  reactivatedAt(workshopId: string, userId: string): Promise<number | null>
  pinSet(workshopId: string, userId: string, pin: string): Promise<void>
  pinAttempt(workshopId: string, userId: string, pin: string, deviceId: string | null): Promise<PinAttempt>
  roster(workshopId: string): Promise<RosterEntry[]>
  device(id: string): Promise<DeviceRow | null>
  insertDevice(d: { workshopId: string; name: string; kind: DeviceKind; secretHash: string; authorizedBy: string }): Promise<string>
  revokeDevice(workshopId: string, id: string): Promise<boolean>
  setDeviceIdle(workshopId: string, id: string, minutes: number | null): Promise<boolean>
  /** Broadcast no canal `ws:<id>` (falha não é fatal: o chamador registra). */
  broadcast(workshopId: string, event: string, payload: Record<string, unknown>): Promise<void>
}

export interface Deps {
  auth: AuthAdmin
  db: Db
  /** Bytes aleatórios criptográficos. */
  random(bytes: number): Uint8Array
  now(): Date
  log(level: 'info' | 'warn' | 'error', message: string, extra?: Record<string, unknown>): void
  /** Origem do site (Cloudflare Pages), vinda de `SITE_URL`. */
  siteUrl: string | null
}

export interface HandlerRequest {
  /** Valor do cabeçalho Authorization (`Bearer <jwt>`), se houver. */
  authorization: string | null
  /** Corpo JSON já lido (qualquer coisa; as funções validam). */
  body: unknown
}

export type HandlerResult =
  | { status: number; body: Record<string, unknown> }

/** Erro de negócio com código HTTP e código estável para o cliente. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message)
  }
}

export function okResult(data: Record<string, unknown> = {}): HandlerResult {
  return { status: 200, body: { ok: true, ...data } }
}

export function errorResult(e: HttpError): HandlerResult {
  return { status: e.status, body: { ok: false, error: e.code, message: e.message, ...(e.extra ?? {}) } }
}

// ---------- validação de corpo ----------

export function asRecord(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new HttpError(400, 'dados_invalidos', 'Corpo da requisição inválido.')
  }
  return v as Record<string, unknown>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function reqUuid(b: Record<string, unknown>, key: string): string {
  const v = b[key]
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw new HttpError(400, 'dados_invalidos', `Campo "${key}" inválido.`)
  return v.toLowerCase()
}

export function reqString(b: Record<string, unknown>, key: string, min: number, max: number): string {
  const v = b[key]
  if (typeof v !== 'string') throw new HttpError(400, 'dados_invalidos', `Campo "${key}" inválido.`)
  const t = v.trim()
  if (t.length < min || t.length > max) throw new HttpError(400, 'dados_invalidos', `Campo "${key}" inválido.`)
  return t
}

export function reqPin(b: Record<string, unknown>, key = 'pin'): string {
  const v = b[key]
  if (typeof v !== 'string' || !/^[0-9]{6}$/.test(v)) {
    throw new HttpError(400, 'pin_invalido', 'O PIN deve ter exatamente 6 números.')
  }
  return v
}

export function reqRole(b: Record<string, unknown>, key = 'role'): Role {
  const v = b[key]
  if (typeof v !== 'string' || !(ROLES as readonly string[]).includes(v)) {
    throw new HttpError(400, 'dados_invalidos', `Campo "${key}" inválido.`)
  }
  return v as Role
}

// ---------- criptografia ----------

const HEX = '0123456789abcdef'

export function toHex(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += HEX[b >> 4] + HEX[b & 15]
  return s
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return toHex(new Uint8Array(digest))
}

/** Comparação em tempo constante (strings de qualquer tamanho; o tamanho em si não é segredo aqui). */
export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  let diff = ea.length ^ eb.length
  const n = Math.max(ea.length, eb.length)
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0)
  return diff === 0
}

// ---------- autenticação do chamador ----------

export function bearer(authorization: string | null): string | null {
  if (!authorization) return null
  const m = /^Bearer\s+(\S+)$/i.exec(authorization.trim())
  return m ? m[1] : null
}

export interface AmrEntry { method: string; timestamp: number }

export interface Caller extends Membership {
  email: string | null
  /** Nível de garantia do JWT (`aal1` ou `aal2`). */
  aal: string | null
  /** Métodos de login do JWT (`amr`), com o instante em segundos. */
  amr: AmrEntry[]
  /** Tem TOTP verificado: o Dono com MFA só age com `aal2`. */
  verifiedTotp: boolean
}

/** Lê o payload de um JWT JÁ validado pelo GoTrue (`getUser`). Não verifica assinatura. */
export function decodeJwtClaims(jwt: string): Record<string, unknown> {
  try {
    const part = jwt.split('.')[1]
    if (!part) return {}
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    const v: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))))
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function parseAmr(v: unknown): AmrEntry[] {
  if (!Array.isArray(v)) return []
  const out: AmrEntry[] = []
  for (const e of v) {
    if (typeof e === 'object' && e !== null) {
      const r = e as Record<string, unknown>
      if (typeof r.method === 'string' && typeof r.timestamp === 'number') out.push({ method: r.method, timestamp: r.timestamp })
    }
  }
  return out
}

/** Valida o JWT e lê a membership ativa. `workshop_id` vem SEMPRE daqui, nunca do corpo. */
export async function authenticate(deps: Deps, authorization: string | null): Promise<Caller> {
  const jwt = bearer(authorization)
  if (!jwt) throw new HttpError(401, 'nao_autenticado', 'Entre novamente.')
  let user: AuthUser | null
  try {
    user = await deps.auth.getUser(jwt)
  } catch (e) {
    deps.log('error', 'Auth indisponível ao validar o JWT', { error: e instanceof Error ? e.message : String(e) })
    throw new HttpError(503, 'auth_indisponivel', 'O serviço de login está indisponível. Tente de novo em instantes.')
  }
  if (!user) throw new HttpError(401, 'nao_autenticado', 'Entre novamente.')
  const m = await deps.db.activeMembership(user.id)
  if (!m) throw new HttpError(403, 'sem_acesso', 'Este usuário não tem acesso a uma oficina.')
  const claims = decodeJwtClaims(jwt)
  return {
    ...m, email: user.email, verifiedTotp: user.verifiedTotp,
    aal: typeof claims.aal === 'string' ? claims.aal : null, amr: parseAmr(claims.amr),
  }
}

export function requireOwner(c: Caller): void {
  if (c.role !== 'dono') throw new HttpError(403, 'somente_dono', 'Somente o Dono pode fazer isso.')
  if (c.verifiedTotp && c.aal !== 'aal2') {
    throw new HttpError(403, 'exige_mfa', 'Confirme o código do autenticador para continuar.')
  }
}

const FRESH_LOGIN_METHODS = ['password', 'invite', 'recovery']
const FRESH_LOGIN_MS = 10 * 60 * 1000

const freshAmr = (c: Caller, now: Date, methods: string[]): boolean =>
  c.amr.some((e) => methods.includes(e.method) && now.getTime() - e.timestamp * 1000 <= FRESH_LOGIN_MS && e.timestamp * 1000 - now.getTime() <= 60_000)

/**
 * Definir PIN exige login recente (10 min) por senha, convite ou recuperação: sessão aberta por PIN (magic link) não serve.
 *
 * Caso `otp`: o GoTrue devolve `amr:[{method:"otp"}]` tanto para o link de CONVITE aceito (`/verify` type invite) quanto
 * para o magic link que o `unlock` entrega no login por PIN (medido no projeto de teste: os dois vêm como `otp`).
 * Aceitar `otp` sempre anularia esta trava. Por isso `otp` recente só vale para quem NÃO tem PIN em NENHUMA oficina
 * (o magic link do `unlock` vem do PIN de qualquer oficina do aparelho, não só da ativa) e cujo `otp` seja POSTERIOR
 * à última reativação (sessão de desbloqueio aberta antes de a pessoa ser desativada e reativada não vale: a
 * desativação apagou o PIN, mas a sessão antiga continua com `otp` recente). Quem tem PIN e está só com `otp`
 * precisa entrar de novo com a senha.
 */
export async function requireRecentPassword(deps: Deps, c: Caller, now: Date): Promise<void> {
  if (freshAmr(c, now, FRESH_LOGIN_METHODS)) return
  if (freshAmr(c, now, ['otp']) && !(await deps.db.hasAnyPin(c.userId))) {
    const since = await deps.db.reactivatedAt(c.workshopId, c.userId)
    if (since === null || c.amr.some((e) => e.method === 'otp' && e.timestamp * 1000 > since)) return
  }
  throw new HttpError(403, 'exige_senha_recente', 'Por segurança, entre de novo com a senha para definir o PIN.')
}

/** Executa um handler convertendo `HttpError` em resposta e erros inesperados em 500 genérico. */
export async function guarded(deps: Deps, fn: () => Promise<HandlerResult>): Promise<HandlerResult> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof HttpError) return errorResult(e)
    deps.log('error', 'erro inesperado', { error: e instanceof Error ? e.message : String(e) })
    return errorResult(new HttpError(500, 'erro_interno', 'Erro interno. Tente de novo.'))
  }
}
