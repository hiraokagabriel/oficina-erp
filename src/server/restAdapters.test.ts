import { describe, expect, it } from 'vitest'
import { createAuthAdmin, createDb, hasVerifiedTotp } from './restAdapters'

interface Call { url: string; method: string; headers: Record<string, string>; body: unknown }

function fakeFetch(responder: (c: Call) => { status: number; body?: unknown; text?: string } | Error) {
  const calls: Call[] = []
  const fetchFn: typeof fetch = async (input, init) => {
    const c: Call = {
      url: String(input), method: init?.method ?? 'GET', headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    calls.push(c)
    const r = responder(c)
    if (r instanceof Error) throw r
    const text = r.text ?? (r.body === undefined ? '' : JSON.stringify(r.body))
    return new Response(text, { status: r.status })
  }
  return { calls, fetchFn }
}

const URL_ = 'https://abc.supabase.co/'
const JWT_KEY = 'eyJ.service.key'

describe('createAuthAdmin', () => {
  it('getUser: GET /auth/v1/user com o JWT do usuário; devolve id, e-mail e TOTP', async () => {
    const f = fakeFetch(() => ({ status: 200, body: { id: 'u1', email: 'a@b.com', factors: [{ factor_type: 'totp', status: 'verified' }] } }))
    const a = createAuthAdmin({ url: URL_, serviceKey: JWT_KEY, fetchFn: f.fetchFn })
    expect(await a.getUser('user.jwt')).toEqual({ id: 'u1', email: 'a@b.com', verifiedTotp: true })
    expect(f.calls[0].url).toBe('https://abc.supabase.co/auth/v1/user')
    expect(f.calls[0].headers.Authorization).toBe('Bearer user.jwt')
    expect(f.calls[0].headers.apikey).toBe(JWT_KEY)
  })
  it('getUser: 401 e 403 viram null', async () => {
    for (const status of [401, 403]) {
      const f = fakeFetch(() => ({ status, body: { msg: 'x' } }))
      expect(await createAuthAdmin({ url: URL_, serviceKey: JWT_KEY, fetchFn: f.fetchFn }).getUser('j')).toBeNull()
    }
  })
  it('getUser: 500, 502, 503 e falha de rede levantam erro (nunca null)', async () => {
    for (const status of [500, 502, 503]) {
      const f = fakeFetch(() => ({ status, text: 'down' }))
      await expect(createAuthAdmin({ url: URL_, serviceKey: JWT_KEY, fetchFn: f.fetchFn }).getUser('j')).rejects.toThrow(String(status))
    }
    const net = fakeFetch(() => new Error('ECONNRESET'))
    await expect(createAuthAdmin({ url: URL_, serviceKey: JWT_KEY, fetchFn: net.fetchFn }).getUser('j')).rejects.toThrow('ECONNRESET')
  })
  it('hasVerifiedTotp ignora fator não verificado e outros tipos', () => {
    expect(hasVerifiedTotp({ factors: [{ factor_type: 'totp', status: 'unverified' }] })).toBe(false)
    expect(hasVerifiedTotp({ factors: [{ factor_type: 'phone', status: 'verified' }] })).toBe(false)
    expect(hasVerifiedTotp({})).toBe(false)
  })
  it('chave nova (não JWT): só apikey, sem Authorization de serviço', async () => {
    const f = fakeFetch(() => ({ status: 200, body: { email: 'a@b.com' } }))
    await createAuthAdmin({ url: URL_, serviceKey: 'sb_secret_x', fetchFn: f.fetchFn }).getUserInfo('u1')
    expect(f.calls[0].headers.apikey).toBe('sb_secret_x')
    expect(f.calls[0].headers.Authorization).toBeUndefined()
  })
  it('setBanned: PUT admin/users/<id> com ban_duration 87600h e none', async () => {
    const f = fakeFetch(() => ({ status: 200, body: {} }))
    const a = createAuthAdmin({ url: URL_, serviceKey: JWT_KEY, fetchFn: f.fetchFn })
    await a.setBanned('u 1', true)
    await a.setBanned('u 1', false)
    expect(f.calls[0].method).toBe('PUT')
    expect(f.calls[0].url).toBe('https://abc.supabase.co/auth/v1/admin/users/u%201')
    expect(f.calls[0].body).toEqual({ ban_duration: '87600h' })
    expect(f.calls[1].body).toEqual({ ban_duration: 'none' })
    const bad = createAuthAdmin({ url: URL_, serviceKey: JWT_KEY, fetchFn: fakeFetch(() => ({ status: 500, text: 'x' })).fetchFn })
    await expect(bad.setBanned('u', true)).rejects.toThrow('500')
  })
  it('magicLinkToken: POST generate_link magiclink e lê hashed_token (topo ou properties)', async () => {
    const f = fakeFetch(() => ({ status: 200, body: { hashed_token: 'tok1', action_link: 'x' } }))
    const a = createAuthAdmin({ url: URL_, serviceKey: JWT_KEY, fetchFn: f.fetchFn })
    expect(await a.magicLinkToken('a@b.com')).toBe('tok1')
    expect(f.calls[0].url).toBe('https://abc.supabase.co/auth/v1/admin/generate_link')
    expect(f.calls[0].body).toEqual({ type: 'magiclink', email: 'a@b.com' })
    const g = fakeFetch(() => ({ status: 200, body: { properties: { hashed_token: 'tok2' } } }))
    expect(await createAuthAdmin({ url: URL_, serviceKey: JWT_KEY, fetchFn: g.fetchFn }).magicLinkToken('a@b.com')).toBe('tok2')
    const none = fakeFetch(() => ({ status: 200, body: {} }))
    await expect(createAuthAdmin({ url: URL_, serviceKey: JWT_KEY, fetchFn: none.fetchFn }).magicLinkToken('a@b.com')).rejects.toThrow('hashed_token')
  })
  it('invite: redirect_to na query, display_name nos dados; erro devolve o corpo bruto', async () => {
    const f = fakeFetch(() => ({ status: 200, body: { id: 'new1' } }))
    const a = createAuthAdmin({ url: URL_, serviceKey: JWT_KEY, fetchFn: f.fetchFn })
    expect(await a.invite('a@b.com', 'https://s.dev/convite', 'Ana')).toEqual({ ok: true, userId: 'new1' })
    expect(f.calls[0].url).toBe('https://abc.supabase.co/auth/v1/invite?redirect_to=https%3A%2F%2Fs.dev%2Fconvite')
    expect(f.calls[0].body).toEqual({ email: 'a@b.com', data: { display_name: 'Ana' } })
    const raw = '{"error_code":"unexpected_failure","msg":"Error sending invite email"}'
    const bad = fakeFetch(() => ({ status: 500, text: raw }))
    expect(await createAuthAdmin({ url: URL_, serviceKey: JWT_KEY, fetchFn: bad.fetchFn }).invite('a@b.com', 'https://s.dev/convite', 'Ana'))
      .toEqual({ ok: false, status: 500, raw })
  })
})

describe('createDb', () => {
  it('broadcast: POST realtime/api/broadcast em canal PRIVADO ws:<id>', async () => {
    const f = fakeFetch(() => ({ status: 202, text: '' }))
    await createDb({ url: URL_, serviceKey: JWT_KEY, fetchFn: f.fetchFn }).broadcast('w1', 'membership', { userId: 'u1', active: false })
    expect(f.calls[0].url).toBe('https://abc.supabase.co/realtime/v1/api/broadcast')
    expect(f.calls[0].body).toEqual({ messages: [{ topic: 'ws:w1', event: 'membership', payload: { userId: 'u1', active: false }, private: true }] })
  })
  it('broadcast com erro HTTP levanta', async () => {
    const f = fakeFetch(() => ({ status: 403, text: 'no' }))
    await expect(createDb({ url: URL_, serviceKey: JWT_KEY, fetchFn: f.fetchFn }).broadcast('w', 'e', {})).rejects.toThrow('403')
  })
  it('pinAttempt: rpc pin_attempt com p_device nulo e mapeia status', async () => {
    const f = fakeFetch(() => ({ status: 200, body: { status: 'locked', failed: 5 } }))
    const r = await createDb({ url: URL_, serviceKey: JWT_KEY, fetchFn: f.fetchFn }).pinAttempt('w', 'u', '123456', null)
    expect(r).toEqual({ status: 'locked', failed: 5 })
    expect(f.calls[0].url).toBe('https://abc.supabase.co/rest/v1/rpc/pin_attempt')
    expect(f.calls[0].body).toEqual({ p_ws: 'w', p_user: 'u', p_pin: '123456', p_device: null })
  })
  it('membershipApply: rpc membership_apply com a ação e o papel', async () => {
    const f = fakeFetch(() => ({ status: 200, body: { status: 'ok', role: 'recepcao', active: true } }))
    const r = await createDb({ url: URL_, serviceKey: JWT_KEY, fetchFn: f.fetchFn }).membershipApply('w', 'u', 'set_role', 'recepcao')
    expect(r).toEqual({ status: 'ok', role: 'recepcao', active: true })
    expect(f.calls[0].body).toEqual({ p_ws: 'w', p_user: 'u', p_action: 'set_role', p_role: 'recepcao' })
  })
  it('revokeDevice usa o relógio injetado e filtra por oficina', async () => {
    const f = fakeFetch(() => ({ status: 200, body: [{ id: 'd1' }] }))
    const db = createDb({ url: URL_, serviceKey: JWT_KEY, fetchFn: f.fetchFn, now: () => new Date('2026-11-12T12:00:00Z') })
    expect(await db.revokeDevice('w1', 'd1')).toBe(true)
    expect(f.calls[0].method).toBe('PATCH')
    expect(f.calls[0].url).toContain('workshop_id=eq.w1')
    expect(f.calls[0].body).toEqual({ revoked_at: '2026-11-12T12:00:00.000Z' })
  })
  it('revokeDevice sem linha afetada: false', async () => {
    const f = fakeFetch(() => ({ status: 200, body: [] }))
    expect(await createDb({ url: URL_, serviceKey: JWT_KEY, fetchFn: f.fetchFn }).revokeDevice('w', 'd')).toBe(false)
  })
  it('setDeviceIdle só atualiza aparelho não revogado', async () => {
    const f = fakeFetch(() => ({ status: 200, body: [{ id: 'd1' }] }))
    expect(await createDb({ url: URL_, serviceKey: JWT_KEY, fetchFn: f.fetchFn }).setDeviceIdle('w', 'd1', 15)).toBe(true)
    expect(f.calls[0].url).toContain('revoked_at=is.null')
    expect(f.calls[0].body).toEqual({ idle_lock_minutes: 15 })
  })
  it('activeMembership: filtra ativas e mapeia colunas', async () => {
    const f = fakeFetch(() => ({ status: 200, body: [{ workshop_id: 'w', user_id: 'u', role: 'dono', display_name: 'Ana' }] }))
    const m = await createDb({ url: URL_, serviceKey: JWT_KEY, fetchFn: f.fetchFn }).activeMembership('u')
    expect(m).toEqual({ workshopId: 'w', userId: 'u', role: 'dono', displayName: 'Ana' })
    expect(f.calls[0].url).toContain('active=eq.true')
  })
  it('rpc com erro HTTP levanta com o corpo', async () => {
    const f = fakeFetch(() => ({ status: 400, text: '{"message":"pin_invalido"}' }))
    await expect(createDb({ url: URL_, serviceKey: JWT_KEY, fetchFn: f.fetchFn }).pinSet('w', 'u', '1')).rejects.toThrow('pin_invalido')
  })
})
