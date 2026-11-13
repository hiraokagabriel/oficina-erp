import { describe, expect, it } from 'vitest'
import { handleUsers } from './usersHandler'
import { MECH, OWNER, OWNER2, RECEP, auth, makeDeps, makeState } from './testKit'

const call = (s: ReturnType<typeof makeState>, who: string | null, body: unknown, site: string | null = 'https://oficina.pages.dev') =>
  handleUsers(makeDeps(s, site), { authorization: who ? auth(who) : null, body })

describe('users: autenticação', () => {
  it('sem JWT: 401', async () => {
    expect((await call(makeState(), null, { action: 'invite' })).status).toBe(401)
  })
  it('JWT desconhecido: 401', async () => {
    const r = await handleUsers(makeDeps(makeState()), { authorization: 'Bearer lixo', body: { action: 'deactivate' } })
    expect(r.status).toBe(401)
  })
  it('membership desativada: 403 sem_acesso', async () => {
    const s = makeState()
    s.members.get(OWNER)!.active = false
    const r = await call(s, OWNER, { action: 'deactivate', userId: MECH })
    expect(r.status).toBe(403)
    expect(r.body.error).toBe('sem_acesso')
  })
  it.each(['invite', 'deactivate', 'reactivate', 'set_role'])('mecânico não pode %s', async (action) => {
    const s = makeState()
    const r = await call(s, MECH, { action, email: 'x@y.com', role: 'mecanico', displayName: 'X', userId: RECEP })
    expect(r.status).toBe(403)
    expect(r.body.error).toBe('somente_dono')
    expect(s.invites).toHaveLength(0)
  })
  it('recepção também não', async () => {
    expect((await call(makeState(), RECEP, { action: 'invite', email: 'x@y.com', role: 'mecanico', displayName: 'X' })).status).toBe(403)
  })
  it('ação desconhecida: 400', async () => {
    expect((await call(makeState(), OWNER, { action: 'x' })).body.error).toBe('acao_invalida')
  })
})

describe('users.invite', () => {
  const ok = { action: 'invite', email: ' Novo@Oficina.com ', role: 'mecanico', displayName: 'Novo' }
  it('convida com redirectTo de SITE_URL e cria a membership na oficina do chamador', async () => {
    const s = makeState()
    const r = await call(s, OWNER, { ...ok, workshopId: 'bbbbbbbb-0000-0000-0000-000000000002' }, 'https://oficina.pages.dev/')
    expect(r.status).toBe(200)
    expect(s.invites).toEqual([{ email: 'novo@oficina.com', redirectTo: 'https://oficina.pages.dev/convite', displayName: 'Novo' }])
    const m = s.members.get(String(r.body.userId))!
    expect(m.workshopId).toBe('aaaaaaaa-0000-0000-0000-000000000001')
    expect(m.role).toBe('mecanico')
    expect(m.active).toBe(true)
  })
  it('e-mail já membro: 409 ja_membro, sem enviar', async () => {
    const s = makeState()
    const r = await call(s, OWNER, { ...ok, email: 'mec@a.test' })
    expect(r.status).toBe(409)
    expect(r.body.error).toBe('ja_membro')
    expect(s.invites).toHaveLength(0)
  })
  it('e-mail cadastrado sem membership: 409 email_ja_cadastrado', async () => {
    const s = makeState()
    s.users.set('30000000-0000-0000-0000-000000000001', { email: 'solto@x.com', banned: false })
    expect((await call(s, OWNER, { ...ok, email: 'solto@x.com' })).body.error).toBe('email_ja_cadastrado')
  })
  it('valida e-mail, papel e nome', async () => {
    const s = makeState()
    expect((await call(s, OWNER, { ...ok, email: 'sem-arroba' })).status).toBe(400)
    expect((await call(s, OWNER, { ...ok, role: 'admin' })).status).toBe(400)
    expect((await call(s, OWNER, { ...ok, displayName: '  ' })).status).toBe(400)
  })
  it('SITE_URL ausente: 500 config_ausente', async () => {
    const r = await call(makeState(), OWNER, ok, null)
    expect(r.status).toBe(500)
    expect(r.body.error).toBe('config_ausente')
  })
  it('GoTrue 500: 502 e registra o corpo bruto', async () => {
    const s = makeState()
    s.inviteFails = { status: 500, raw: '{"error_code":"unexpected_failure","msg":"Error sending invite email"}' }
    const r = await call(s, OWNER, ok)
    expect(r.status).toBe(502)
    expect(r.body.error).toBe('convite_falhou')
    expect(JSON.stringify(s.logs)).toContain('Error sending invite email')
    expect([...s.members.values()].some((m) => m.displayName === 'Novo')).toBe(false)
  })
  it('GoTrue 422: 409 email_ja_cadastrado', async () => {
    const s = makeState()
    s.inviteFails = { status: 422, raw: '{}' }
    expect((await call(s, OWNER, ok)).body.error).toBe('email_ja_cadastrado')
  })
})

describe('users.deactivate / reactivate / set_role', () => {
  it('desativa: active=false, ban, apaga PIN e faz broadcast', async () => {
    const s = makeState()
    s.pins.set(`aaaaaaaa-0000-0000-0000-000000000001|${MECH}`, { pin: '123456', failed: 0, locked: false })
    const r = await call(s, OWNER, { action: 'deactivate', userId: MECH })
    expect(r.status).toBe(200)
    expect(s.members.get(MECH)!.active).toBe(false)
    expect(s.users.get(MECH)!.banned).toBe(true)
    expect(s.pins.size).toBe(0)
    expect(s.broadcasts).toHaveLength(1)
    expect(s.broadcasts[0].event).toBe('membership')
    expect(s.broadcasts[0].payload.userId).toBe(MECH)
  })
  it('recusa desativar o último Dono ativo', async () => {
    const s = makeState()
    s.members.get(OWNER2)!.active = false
    const r = await call(s, OWNER, { action: 'deactivate', userId: OWNER })
    expect(r.status).toBe(409)
    expect(r.body.error).toBe('ultimo_dono')
    expect(s.members.get(OWNER)!.active).toBe(true)
    expect(s.users.get(OWNER)!.banned).toBe(false)
    expect(s.broadcasts).toHaveLength(0)
  })
  it('com dois Donos, desativar um passa', async () => {
    expect((await call(makeState(), OWNER, { action: 'deactivate', userId: OWNER2 })).status).toBe(200)
  })
  it('pessoa inexistente: 404', async () => {
    const r = await call(makeState(), OWNER, { action: 'deactivate', userId: '30000000-0000-0000-0000-000000000009' })
    expect(r.status).toBe(404)
  })
  it('userId inválido: 400', async () => {
    expect((await call(makeState(), OWNER, { action: 'deactivate', userId: 'x' })).status).toBe(400)
  })
  it('falha ao banir: 502, mas a membership já ficou inativa', async () => {
    const s = makeState()
    s.banFails = true
    const r = await call(s, OWNER, { action: 'deactivate', userId: MECH })
    expect(r.status).toBe(502)
    expect(s.members.get(MECH)!.active).toBe(false)
  })
  it('reativa e remove o ban', async () => {
    const s = makeState()
    await call(s, OWNER, { action: 'deactivate', userId: MECH })
    const r = await call(s, OWNER, { action: 'reactivate', userId: MECH })
    expect(r.status).toBe(200)
    expect(s.members.get(MECH)!.active).toBe(true)
    expect(s.users.get(MECH)!.banned).toBe(false)
  })
  it('set_role troca o papel e faz broadcast', async () => {
    const s = makeState()
    const r = await call(s, OWNER, { action: 'set_role', userId: MECH, role: 'recepcao' })
    expect(r.status).toBe(200)
    expect(s.members.get(MECH)!.role).toBe('recepcao')
    expect(s.broadcasts[0].payload.role).toBe('recepcao')
  })
  it('set_role recusa rebaixar o último Dono', async () => {
    const s = makeState()
    s.members.get(OWNER2)!.active = false
    const r = await call(s, OWNER, { action: 'set_role', userId: OWNER, role: 'mecanico' })
    expect(r.body.error).toBe('ultimo_dono')
    expect(s.members.get(OWNER)!.role).toBe('dono')
  })
  it('set_role com papel inválido: 400', async () => {
    expect((await call(makeState(), OWNER, { action: 'set_role', userId: MECH, role: 'x' })).status).toBe(400)
  })
})
