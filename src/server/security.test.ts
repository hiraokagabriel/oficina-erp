import { describe, expect, it } from 'vitest'
import { handlePin } from './pinHandler'
import { handleUsers } from './usersHandler'
import { handleDevice } from './deviceHandler'
import { serveHandler } from './http'
import { MECH, NOW_SEC, OWNER, WS, addDevice, auth, makeDeps, makeState, type FakeState, type JwtOpts } from './testKit'

const pin = (s: FakeState, who: string | null, body: unknown, o?: JwtOpts) =>
  handlePin(makeDeps(s), { authorization: who ? auth(who, o) : null, body })

describe('MFA do Dono', () => {
  it('unlock recusa Dono com TOTP verificado (403 exige_senha), mesmo com PIN certo, e não entrega token', async () => {
    const s = makeState()
    await pin(s, OWNER, { action: 'set', pin: '111111' })
    s.totp.add(OWNER)
    const d = await addDevice(s)
    const r = await pin(s, null, { action: 'unlock', deviceId: d.id, secret: d.secret, userId: OWNER, pin: '111111' })
    expect(r.status).toBe(403)
    expect(r.body.error).toBe('exige_senha')
    expect(r.body.tokenHash).toBeUndefined()
  })
  it('Dono sem TOTP entra por PIN; mecânico com TOTP também (a regra é só do Dono)', async () => {
    const s = makeState()
    await pin(s, OWNER, { action: 'set', pin: '111111' })
    await pin(s, MECH, { action: 'set', pin: '222222' })
    s.totp.add(MECH)
    const d = await addDevice(s)
    expect((await pin(s, null, { action: 'unlock', deviceId: d.id, secret: d.secret, userId: OWNER, pin: '111111' })).status).toBe(200)
    expect((await pin(s, null, { action: 'unlock', deviceId: d.id, secret: d.secret, userId: MECH, pin: '222222' })).status).toBe(200)
  })
  it('PIN errado de Dono com TOTP segue sendo pin_incorreto (não revela o MFA)', async () => {
    const s = makeState()
    await pin(s, OWNER, { action: 'set', pin: '111111' })
    s.totp.add(OWNER)
    const d = await addDevice(s)
    const r = await pin(s, null, { action: 'unlock', deviceId: d.id, secret: d.secret, userId: OWNER, pin: '000000' })
    expect(r.body.error).toBe('pin_incorreto')
  })
  it('requireOwner: Dono com TOTP e JWT aal1 é recusado em users e device; com aal2 passa', async () => {
    const s = makeState()
    s.totp.add(OWNER)
    const body = { action: 'set_role', userId: MECH, role: 'recepcao' }
    const r1 = await handleUsers(makeDeps(s), { authorization: auth(OWNER), body })
    expect(r1.status).toBe(403)
    expect(r1.body.error).toBe('exige_mfa')
    const r2 = await handleDevice(makeDeps(s), { authorization: auth(OWNER), body: { action: 'register', name: 'PC', kind: 'pessoal' } })
    expect(r2.body.error).toBe('exige_mfa')
    expect(s.members.get(MECH)!.role).toBe('mecanico')
    const r3 = await handleUsers(makeDeps(s), { authorization: auth(OWNER, { aal: 'aal2' }), body })
    expect(r3.status).toBe(200)
  })
  it('Dono sem TOTP continua com aal1', async () => {
    const r = await handleUsers(makeDeps(makeState()), { authorization: auth(OWNER), body: { action: 'set_role', userId: MECH, role: 'recepcao' } })
    expect(r.status).toBe(200)
  })
})

describe('pin.set exige senha recente', () => {
  const set = { action: 'set', pin: '123456' }
  it.each(['password', 'invite', 'recovery'])('%s agora: ok', async (method) => {
    const s = makeState()
    expect((await pin(s, MECH, set, { amr: [{ method, timestamp: NOW_SEC - 60 }] })).status).toBe(200)
  })
  it('sessão aberta por magic link (PIN): 403 exige_senha_recente e nada gravado', async () => {
    const s = makeState()
    const r = await pin(s, MECH, set, { amr: [{ method: 'magiclink', timestamp: NOW_SEC }] })
    expect(r.status).toBe(403)
    expect(r.body.error).toBe('exige_senha_recente')
    expect(s.pins.size).toBe(0)
  })
  it('senha de mais de 10 min: 403', async () => {
    const s = makeState()
    const r = await pin(s, MECH, set, { amr: [{ method: 'password', timestamp: NOW_SEC - 601 }] })
    expect(r.body.error).toBe('exige_senha_recente')
  })
  it('exatamente 10 min ainda vale', async () => {
    expect((await pin(makeState(), MECH, set, { amr: [{ method: 'password', timestamp: NOW_SEC - 600 }] })).status).toBe(200)
  })
  it('sem amr ou só totp: 403', async () => {
    const s = makeState()
    expect((await pin(s, MECH, set, { amr: [] })).status).toBe(403)
    expect((await pin(s, MECH, set, { amr: [{ method: 'totp', timestamp: NOW_SEC }] })).status).toBe(403)
  })
  // O link de convite e o magic link do login por PIN dão o MESMO amr (`otp`): só a ausência de PIN os distingue.
  it('otp recente de quem ainda NÃO tem PIN (convite aceito): ok', async () => {
    const s = makeState()
    expect((await pin(s, MECH, set, { amr: [{ method: 'otp', timestamp: NOW_SEC - 60 }] })).status).toBe(200)
    expect(s.pins.get(`${WS}|${MECH}`)!.pin).toBe('123456')
  })
  it('otp antigo (mais de 10 min) de quem não tem PIN: 403', async () => {
    const s = makeState()
    const r = await pin(s, MECH, set, { amr: [{ method: 'otp', timestamp: NOW_SEC - 601 }] })
    expect(r.body.error).toBe('exige_senha_recente')
    expect(s.pins.size).toBe(0)
  })
  it('otp recente de quem JÁ tem PIN (sessão aberta por PIN): 403 e PIN antigo intacto', async () => {
    const s = makeState()
    await pin(s, MECH, set)
    const r = await pin(s, MECH, { action: 'set', pin: '999999' }, { amr: [{ method: 'otp', timestamp: NOW_SEC }] })
    expect(r.status).toBe(403)
    expect(r.body.error).toBe('exige_senha_recente')
    expect(s.pins.get(`${WS}|${MECH}`)!.pin).toBe('123456')
  })
  it('otp com data no futuro (> 60 s): 403', async () => {
    const s = makeState()
    expect((await pin(s, MECH, set, { amr: [{ method: 'otp', timestamp: NOW_SEC + 120 }] })).status).toBe(403)
  })
  it('verify não exige senha recente (desbloqueio de inatividade)', async () => {
    const s = makeState()
    await pin(s, MECH, set)
    const r = await pin(s, MECH, { action: 'verify', pin: '123456' }, { amr: [{ method: 'magiclink', timestamp: NOW_SEC }] })
    expect(r.status).toBe(200)
  })
})

describe('Auth fora do ar', () => {
  it('getUser lançando erro: 503 auth_indisponivel (não 401)', async () => {
    const s = makeState()
    s.authDown = true
    const r = await pin(s, MECH, { action: 'verify', pin: '123456' })
    expect(r.status).toBe(503)
    expect(r.body.error).toBe('auth_indisponivel')
    expect(s.logs.some((l) => l.level === 'error')).toBe(true)
  })
})

describe('device.set_idle', () => {
  it('recusa aparelho revogado (409) e mantém o valor', async () => {
    const s = makeState()
    const d = await addDevice(s)
    s.devices.get(d.id)!.revokedAt = 'x'
    const r = await handleDevice(makeDeps(s), { authorization: auth(OWNER), body: { action: 'set_idle', deviceId: d.id, minutes: 5 } })
    expect(r.status).toBe(409)
    expect(r.body.error).toBe('aparelho_revogado')
    expect(s.devices.get(d.id)!.idleLockMinutes).toBeNull()
  })
  it('aparelho de outra oficina: 404', async () => {
    const s = makeState()
    const d = await addDevice(s)
    s.devices.get(d.id)!.workshopId = 'bbbbbbbb-0000-0000-0000-000000000002'
    const r = await handleDevice(makeDeps(s), { authorization: auth(OWNER), body: { action: 'set_idle', deviceId: d.id, minutes: 5 } })
    expect(r.status).toBe(404)
    expect(WS).not.toBe('bbbbbbbb-0000-0000-0000-000000000002')
  })
})

describe('serveHandler', () => {
  const run = async () => ({ status: 200, body: { ok: true } })
  const req = (ct: string | null, body = '{"a":1}', method = 'POST') =>
    new Request('https://x.test/f', { method, headers: ct ? { 'content-type': ct } : {}, body: method === 'POST' ? body : undefined })
  it('application/json passa (com charset também)', async () => {
    expect((await serveHandler(req('application/json'), [], run)).status).toBe(200)
    expect((await serveHandler(req('application/json; charset=utf-8'), [], run)).status).toBe(200)
  })
  it('Content-Type diferente: 415', async () => {
    for (const ct of ['text/plain', 'application/x-www-form-urlencoded', 'application/jsonx']) {
      const r = await serveHandler(req(ct), [], run)
      expect(r.status).toBe(415)
    }
    expect((await serveHandler(new Request('https://x.test/f', { method: 'POST', body: '{}' }), [], run)).status).toBe(415)
  })
  it('JSON inválido: 400; GET: 405; OPTIONS: 204', async () => {
    expect((await serveHandler(req('application/json', '{x'), [], run)).status).toBe(400)
    expect((await serveHandler(req(null, '', 'GET'), [], run)).status).toBe(405)
    expect((await serveHandler(req(null, '', 'OPTIONS'), [], run)).status).toBe(204)
  })
})

describe('pin.roster e bloqueio por inatividade', () => {
  it('devolve idleLockMinutes do aparelho (null = nunca)', async () => {
    const s = makeState()
    await pin(s, MECH, { action: 'set', pin: '123456' })
    const d = await addDevice(s)
    let r = await pin(s, null, { action: 'roster', deviceId: d.id, secret: d.secret })
    expect(r.body.idleLockMinutes).toBeNull()
    s.devices.get(d.id)!.idleLockMinutes = 15
    r = await pin(s, null, { action: 'roster', deviceId: d.id, secret: d.secret })
    expect(r.body.idleLockMinutes).toBe(15)
  })
})
