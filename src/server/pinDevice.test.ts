import { describe, expect, it } from 'vitest'
import { handlePin } from './pinHandler'
import { handleDevice } from './deviceHandler'
import { sha256Hex, timingSafeEqual, bearer } from './core'
import { corsHeaders, allowedOrigins } from './http'
import { MECH, OWNER, RECEP, WS, addDevice, auth, makeDeps, makeState, type FakeState } from './testKit'

const pin = (s: FakeState, who: string | null, body: unknown) =>
  handlePin(makeDeps(s), { authorization: who ? auth(who) : null, body })
const dev = (s: FakeState, who: string | null, body: unknown) =>
  handleDevice(makeDeps(s), { authorization: who ? auth(who) : null, body })

describe('pin.set / verify', () => {
  it('set exige JWT e 6 dígitos', async () => {
    const s = makeState()
    expect((await pin(s, null, { action: 'set', pin: '123456' })).status).toBe(401)
    expect((await pin(s, MECH, { action: 'set', pin: '12345' })).body.error).toBe('pin_invalido')
    expect((await pin(s, MECH, { action: 'set', pin: 'abcdef' })).status).toBe(400)
    expect((await pin(s, MECH, { action: 'set', pin: 123456 })).status).toBe(400)
    expect((await pin(s, MECH, { action: 'set', pin: '123456' })).status).toBe(200)
    expect(s.pins.get(`${WS}|${MECH}`)!.pin).toBe('123456')
  })
  it('verify: certo ok, errado 401 com restantes, 5 erros bloqueia (423)', async () => {
    const s = makeState()
    await pin(s, MECH, { action: 'set', pin: '123456' })
    expect((await pin(s, MECH, { action: 'verify', pin: '123456' })).status).toBe(200)
    const r1 = await pin(s, MECH, { action: 'verify', pin: '000000' })
    expect(r1.status).toBe(401)
    expect(r1.body.restantes).toBe(4)
    for (let i = 0; i < 3; i++) await pin(s, MECH, { action: 'verify', pin: '000000' })
    const r5 = await pin(s, MECH, { action: 'verify', pin: '000000' })
    expect(r5.status).toBe(423)
    expect((await pin(s, MECH, { action: 'verify', pin: '123456' })).status).toBe(423)
  })
  it('set de novo desbloqueia', async () => {
    const s = makeState()
    await pin(s, MECH, { action: 'set', pin: '123456' })
    for (let i = 0; i < 5; i++) await pin(s, MECH, { action: 'verify', pin: '000000' })
    await pin(s, MECH, { action: 'set', pin: '654321' })
    expect((await pin(s, MECH, { action: 'verify', pin: '654321' })).status).toBe(200)
  })
})

describe('pin.roster / unlock', () => {
  async function setup() {
    const s = makeState()
    await pin(s, MECH, { action: 'set', pin: '123456' })
    await pin(s, OWNER, { action: 'set', pin: '111111' })
    const d = await addDevice(s)
    return { s, d }
  }
  it('roster: só quem tem PIN, sem e-mail', async () => {
    const { s, d } = await setup()
    const r = await pin(s, null, { action: 'roster', deviceId: d.id, secret: d.secret })
    expect(r.status).toBe(200)
    const people = r.body.people as { userId: string }[]
    expect(people.map((p) => p.userId).sort()).toEqual([MECH, OWNER].sort())
    expect(JSON.stringify(r.body)).not.toContain('@')
  })
  it('roster/unlock com segredo errado, aparelho revogado, pessoal ou inexistente: mesma resposta 401', async () => {
    const { s, d } = await setup()
    const pessoal = await addDevice(s, 'pessoal')
    const revoked = await addDevice(s)
    s.devices.get(revoked.id)!.revokedAt = 'x'
    const bodies = [
      { deviceId: d.id, secret: 'errado' },
      { deviceId: revoked.id, secret: revoked.secret },
      { deviceId: pessoal.id, secret: pessoal.secret },
      { deviceId: '20000000-0000-0000-0000-999999999999', secret: 'x' },
      { deviceId: 'nao-uuid', secret: 'x' },
    ]
    for (const b of bodies) {
      for (const a of [{ action: 'roster' }, { action: 'unlock', userId: MECH, pin: '123456' }]) {
        const r = await pin(s, null, { ...a, ...b })
        expect(r.status).toBe(401)
        expect(r.body.error).toBe('aparelho_invalido')
      }
    }
  })
  it('unlock certo devolve só o token (e não zera o contador de erros)', async () => {
    const { s, d } = await setup()
    await pin(s, null, { action: 'unlock', deviceId: d.id, secret: d.secret, userId: MECH, pin: '000000' })
    expect(s.pins.get(`${WS}|${MECH}`)!.failed).toBe(1)
    const r = await pin(s, null, { action: 'unlock', deviceId: d.id, secret: d.secret, userId: MECH, pin: '123456' })
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ ok: true, tokenHash: 'hashed-mec@a.test', type: 'magiclink' })
    expect(s.pins.get(`${WS}|${MECH}`)!.failed).toBe(1)
  })
  it('5 erros bloqueiam (423) e o PIN certo não passa mais', async () => {
    const { s, d } = await setup()
    const u = { action: 'unlock', deviceId: d.id, secret: d.secret, userId: MECH }
    for (let i = 0; i < 4; i++) expect((await pin(s, null, { ...u, pin: '000000' })).status).toBe(401)
    expect((await pin(s, null, { ...u, pin: '000000' })).status).toBe(423)
    expect((await pin(s, null, { ...u, pin: '123456' })).status).toBe(423)
  })
  it('pessoa inexistente, sem PIN ou desativada: mesma resposta de PIN errado (sem restantes)', async () => {
    const { s, d } = await setup()
    await pin(s, OWNER, { action: 'set', pin: '111111' })
    s.members.get(MECH)!.active = false
    const u = { action: 'unlock', deviceId: d.id, secret: d.secret, pin: '123456' }
    const inativa = await pin(s, null, { ...u, userId: MECH })
    const inexistente = await pin(s, null, { ...u, userId: '30000000-0000-0000-0000-000000000009' })
    const semPin = await pin(s, null, { ...u, userId: RECEP })
    expect(inativa).toEqual(inexistente)
    expect(semPin).toEqual(inexistente)
    expect(inativa.status).toBe(401)
    expect(inativa.body.restantes).toBeUndefined()
  })
  it('mais de 20 erros na hora suspendem o aparelho', async () => {
    const { s, d } = await setup()
    let last = 0
    for (let i = 0; i < 21; i++) {
      last = (await pin(s, null, { action: 'unlock', deviceId: d.id, secret: d.secret, userId: '30000000-0000-0000-0000-000000000009', pin: '000000' })).status
    }
    expect(last).toBe(403)
    expect(s.devices.get(d.id)!.revokedAt).not.toBeNull()
    expect((await pin(s, null, { action: 'roster', deviceId: d.id, secret: d.secret })).status).toBe(401)
  })
  it('PIN em formato inválido: 400', async () => {
    const { s, d } = await setup()
    expect((await pin(s, null, { action: 'unlock', deviceId: d.id, secret: d.secret, userId: MECH, pin: '12' })).status).toBe(400)
  })
})

describe('device', () => {
  it('register: só Dono; devolve segredo uma vez e guarda só o sha256', async () => {
    const s = makeState()
    expect((await dev(s, MECH, { action: 'register', name: 'PC', kind: 'pc_compartilhado' })).status).toBe(403)
    const r = await dev(s, OWNER, { action: 'register', name: 'PC balcão', kind: 'pc_compartilhado' })
    expect(r.status).toBe(200)
    const secret = String(r.body.deviceSecret)
    expect(secret).toMatch(/^[0-9a-f]{64}$/)
    const row = s.devices.get(String(r.body.deviceId))!
    expect(row.secretHash).toBe(await sha256Hex(secret))
    expect(JSON.stringify(row)).not.toContain(secret)
    expect(row.workshopId).toBe(WS)
  })
  it('register valida kind e nome', async () => {
    const s = makeState()
    expect((await dev(s, OWNER, { action: 'register', name: 'PC', kind: 'x' })).status).toBe(400)
    expect((await dev(s, OWNER, { action: 'register', name: '', kind: 'pessoal' })).status).toBe(400)
  })
  it('revoke: só Dono; depois o unlock recusa', async () => {
    const s = makeState()
    await pin(s, MECH, { action: 'set', pin: '123456' })
    const d = await addDevice(s)
    expect((await dev(s, RECEP, { action: 'revoke', deviceId: d.id })).status).toBe(403)
    expect((await dev(s, OWNER, { action: 'revoke', deviceId: d.id })).status).toBe(200)
    const r = await pin(s, null, { action: 'unlock', deviceId: d.id, secret: d.secret, userId: MECH, pin: '123456' })
    expect(r.status).toBe(401)
    expect((await dev(s, OWNER, { action: 'revoke', deviceId: '20000000-0000-0000-0000-999999999999' })).status).toBe(404)
  })
  it('set_idle aceita 5, 15, 30 e null; recusa o resto', async () => {
    const s = makeState()
    const d = await addDevice(s)
    for (const m of [5, 15, 30, null]) {
      expect((await dev(s, OWNER, { action: 'set_idle', deviceId: d.id, minutes: m })).status).toBe(200)
      expect(s.devices.get(d.id)!.idleLockMinutes).toBe(m)
    }
    for (const m of [10, 0, '5', undefined]) {
      expect((await dev(s, OWNER, { action: 'set_idle', deviceId: d.id, minutes: m })).status).toBe(400)
    }
    expect((await dev(s, MECH, { action: 'set_idle', deviceId: d.id, minutes: 5 })).status).toBe(403)
  })
})

describe('utilidades', () => {
  it('timingSafeEqual', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
  })
  it('bearer', () => {
    expect(bearer('Bearer x.y')).toBe('x.y')
    expect(bearer('Basic x')).toBeNull()
    expect(bearer(null)).toBeNull()
  })
  it('CORS: tauri e Pages liberados, outros não', () => {
    const allowed = allowedOrigins('https://oficina.pages.dev/convite', null)
    expect(corsHeaders('http://tauri.localhost', allowed)['Access-Control-Allow-Origin']).toBe('http://tauri.localhost')
    expect(corsHeaders('https://oficina.pages.dev', allowed)['Access-Control-Allow-Origin']).toBe('https://oficina.pages.dev')
    expect(corsHeaders('https://evil.example', allowed)['Access-Control-Allow-Origin']).toBeUndefined()
    expect(corsHeaders(null, allowed)['Access-Control-Allow-Origin']).toBeUndefined()
  })
})
