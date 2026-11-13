import { describe, expect, it } from 'vitest'
import { handleUsers } from './usersHandler'
import { MECH, OWNER, RECEP, WS, auth, makeDeps, makeState } from './testKit'

const call = (s: ReturnType<typeof makeState>, who: string, body: unknown, site: string | null = 'https://oficina.pages.dev') =>
  handleUsers(makeDeps(s, site), { authorization: auth(who), body })

const PENDING = '10000000-0000-0000-0000-000000000099'
const pendingState = () => {
  const s = makeState()
  s.users.set(PENDING, { email: 'novo@a.test', banned: false, accepted: false })
  s.members.set(PENDING, { workshopId: WS, userId: PENDING, role: 'recepcao', displayName: 'Novo', active: true, invitedAt: '2026-11-11T10:00:00Z' })
  return s
}

describe('users.list', () => {
  it('devolve e-mail, papel, convite pendente (acceptedAt nulo) e PIN bloqueado', async () => {
    const s = pendingState()
    s.pins.set(`${WS}|${MECH}`, { pin: '123456', failed: 5, locked: true })
    const r = await call(s, OWNER, { action: 'list' })
    expect(r.status).toBe(200)
    const people = r.body.people as Record<string, unknown>[]
    const by = (id: string) => people.find((p) => p.userId === id)!
    expect(by(MECH)).toMatchObject({ email: 'mec@a.test', role: 'mecanico', active: true, pinLocked: true })
    expect(by(MECH).acceptedAt).not.toBeNull()
    expect(by(OWNER).pinLocked).toBe(false)
    expect(by(PENDING)).toMatchObject({ email: 'novo@a.test', acceptedAt: null, invitedAt: '2026-11-11T10:00:00Z', pinLocked: false })
  })
  it('só lista a oficina do chamador', async () => {
    const s = pendingState()
    const other = '30000000-0000-0000-0000-000000000001'
    s.members.set(other, { workshopId: 'bbbbbbbb-0000-0000-0000-000000000002', userId: other, role: 'dono', displayName: 'Outra', active: true })
    const people = (await call(s, OWNER, { action: 'list' })).body.people as unknown[]
    expect(people).toHaveLength(5)
  })
  it.each([MECH, RECEP])('não-Dono não lista: 403', async (who) => {
    expect((await call(pendingState(), who, { action: 'list' })).status).toBe(403)
  })
})

describe('users.resend_invite', () => {
  it('reenvia para quem não aceitou, com o mesmo usuário e redirectTo de SITE_URL', async () => {
    const s = pendingState()
    const r = await call(s, OWNER, { action: 'resend_invite', userId: PENDING })
    expect(r.status).toBe(200)
    expect(r.body.email).toBe('novo@a.test')
    expect(s.invites).toEqual([{ email: 'novo@a.test', redirectTo: 'https://oficina.pages.dev/convite', displayName: 'Novo' }])
    expect([...s.users.keys()].filter((k) => s.users.get(k)!.email === 'novo@a.test')).toEqual([PENDING])
  })
  it('quem já aceitou: 409 convite_ja_aceito, sem enviar', async () => {
    const s = pendingState()
    const r = await call(s, OWNER, { action: 'resend_invite', userId: MECH })
    expect(r.status).toBe(409)
    expect(r.body.error).toBe('convite_ja_aceito')
    expect(s.invites).toHaveLength(0)
  })
  it('pessoa desativada: 409; inexistente: 404; userId ruim: 400', async () => {
    const s = pendingState()
    s.members.get(PENDING)!.active = false
    expect((await call(s, OWNER, { action: 'resend_invite', userId: PENDING })).body.error).toBe('pessoa_desativada')
    expect((await call(s, OWNER, { action: 'resend_invite', userId: '30000000-0000-0000-0000-000000000009' })).status).toBe(404)
    expect((await call(s, OWNER, { action: 'resend_invite', userId: 'x' })).status).toBe(400)
  })
  it('GoTrue falha: 502; 422: 409 convite_ja_aceito; SITE_URL ausente: 500', async () => {
    const s = pendingState()
    s.inviteFails = { status: 500, raw: 'smtp' }
    expect((await call(s, OWNER, { action: 'resend_invite', userId: PENDING })).body.error).toBe('convite_falhou')
    s.inviteFails = { status: 422, raw: '{}' }
    expect((await call(s, OWNER, { action: 'resend_invite', userId: PENDING })).body.error).toBe('convite_ja_aceito')
    s.inviteFails = null
    expect((await call(s, OWNER, { action: 'resend_invite', userId: PENDING }, null)).body.error).toBe('config_ausente')
  })
  it('não-Dono: 403', async () => {
    expect((await call(pendingState(), RECEP, { action: 'resend_invite', userId: PENDING })).status).toBe(403)
  })
})

describe('users.unlock_pin', () => {
  it('zera erros e bloqueio', async () => {
    const s = makeState()
    s.pins.set(`${WS}|${MECH}`, { pin: '123456', failed: 5, locked: true })
    const r = await call(s, OWNER, { action: 'unlock_pin', userId: MECH })
    expect(r.status).toBe(200)
    expect(s.pins.get(`${WS}|${MECH}`)).toEqual({ pin: '123456', failed: 0, locked: false })
  })
  it('sem PIN: 404 pin_nao_encontrado', async () => {
    const r = await call(makeState(), OWNER, { action: 'unlock_pin', userId: MECH })
    expect(r.status).toBe(404)
    expect(r.body.error).toBe('pin_nao_encontrado')
  })
  it.each([MECH, RECEP])('não-Dono: 403', async (who) => {
    expect((await call(makeState(), who, { action: 'unlock_pin', userId: MECH })).status).toBe(403)
  })
  it('userId inválido: 400', async () => {
    expect((await call(makeState(), OWNER, { action: 'unlock_pin', userId: 'x' })).status).toBe(400)
  })
})
