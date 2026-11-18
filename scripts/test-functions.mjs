// Integração das Edge Functions `users`, `pin`, `device` e `money` no projeto Supabase DE TESTE (nunca no real).
// Uso: node scripts/test-functions.mjs  (depois de `npm run test:db migrate` e do deploy das funções)
// Lê TEST_DB_URL, TEST_SUPABASE_URL e TEST_SUPABASE_ANON_KEY de .env.test.local. A chave de serviço vem do CLI
// (`supabase projects api-keys`), fica só em memória e nunca é impressa nem gravada.
import postgres from 'postgres'
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { randomBytes, randomUUID } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REAL_REF = 'stblagzkkffbjuzltfrt'
const TEST_REF = 'xtnnayaxufhmyrqcwwnr'

function readEnv() {
  const env = { ...process.env }
  const f = resolve(root, '.env.test.local')
  if (existsSync(f)) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/)
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return env
}
const env = readEnv()
const DB = env.TEST_DB_URL
const URL_ = (env.TEST_SUPABASE_URL || '').replace(/\/+$/, '')
const ANON = env.TEST_SUPABASE_ANON_KEY
if (!DB || !URL_ || !ANON) { console.error('Faltam TEST_DB_URL, TEST_SUPABASE_URL ou TEST_SUPABASE_ANON_KEY em .env.test.local.'); process.exit(1) }
for (const v of [DB, URL_]) {
  if (v.toLowerCase().includes(REAL_REF)) { console.error('RECUSADO: aponta para o projeto real.'); process.exit(1) }
  if (!v.toLowerCase().includes(TEST_REF)) { console.error('RECUSADO: não é o projeto de teste.'); process.exit(1) }
}

// chave de serviço só em memória
function serviceKey() {
  const out = execFileSync('npx', ['supabase', 'projects', 'api-keys', '--project-ref', TEST_REF, '-o', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' })
  const arr = JSON.parse(out)
  const k = arr.find((x) => x.name === 'service_role') || arr.find((x) => x.type === 'secret')
  if (!k) throw new Error('chave de serviço não encontrada')
  return k.api_key
}
// Tudo que é segredo (URL do banco, chave de serviço, senha de teste, tokens, segredo de aparelho) entra aqui e é
// mascarado em QUALQUER mensagem impressa.
let SERVICE = ''
const secrets = [DB]
const track = (v) => { if (typeof v === 'string' && v.length >= 8 && !secrets.includes(v)) secrets.push(v) }
const mask = (s) => secrets.reduce((a, x) => a.split(x).join('<oculto>'), String(s))
const show = (r) => mask(JSON.stringify(r))

const sql = postgres(DB, { max: 1, onnotice: () => {}, connect_timeout: 30 })
const admin = (method, path, body) => fetch(`${URL_}/auth/v1${path}`, {
  method, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
})

let moneyWs = null
let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`ok - ${name}`) } else { fail++; console.log(`not ok - ${name} ${mask(detail)}`) }
}

async function fn(name, body, jwt) {
  const headers = { apikey: ANON, 'Content-Type': 'application/json' }
  if (jwt) headers.Authorization = `Bearer ${jwt}`
  const res = await fetch(`${URL_}/functions/v1/${name}`, { method: 'POST', headers, body: JSON.stringify(body) })
  let json = null
  try { json = await res.json() } catch { /* sem corpo */ }
  track(json?.deviceSecret)
  track(json?.tokenHash)
  return { status: res.status, body: json ?? {} }
}

async function signIn(email, password) {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  })
  const j = await res.json()
  if (!res.ok) throw new Error(`login falhou (${res.status})`)
  track(j.access_token)
  return j.access_token
}

const tag = randomBytes(4).toString('hex')
const password = randomBytes(12).toString('hex')
track(password)
const ws = randomUUID()
const users = {}
async function createUser(key, role, name, confirmed = true) {
  const email = `t-${tag}-${key}@teste-oficinapro.example`
  const res = await admin('POST', '/admin/users', { email, password, email_confirm: confirmed })
  const j = await res.json()
  if (!res.ok) throw new Error(`criar usuário falhou: ${res.status} ${show(j)}`)
  users[key] = { id: j.id, email, role, name }
  await sql`insert into public.memberships (workshop_id, user_id, role, display_name) values (${ws}, ${j.id}, ${role}, ${name})`
}

async function cleanup() {
  if (moneyWs) {
    try {
      for (const t of ['money_ops', 'audit_events', 'audit_log', 'ledger', 'work_order_costs', 'work_order_finance', 'work_orders']) {
        await sql.unsafe(`delete from public.${t} where workshop_id = $1`, [moneyWs])
      }
      await sql`delete from public.memberships where workshop_id = ${moneyWs}`
      await sql`delete from public.workshops where id = ${moneyWs}`
    } catch (e) { console.error('limpeza do money:', mask(e.message)) }
  }
  try {
    await sql`delete from public.member_pins where workshop_id = ${ws}`
    await sql`delete from public.devices where workshop_id = ${ws}`
    await sql`delete from public.memberships where workshop_id = ${ws}`
    await sql`delete from public.workshops where id = ${ws}`
  } catch (e) { console.error('limpeza do banco:', mask(e.message)) }
  for (const u of Object.values(users)) {
    try { await admin('DELETE', `/admin/users/${u.id}`) } catch (e) { console.error('limpeza do usuário:', mask(e.message)) }
  }
  // convites criados pelo teste (se algum) ficam sem membership: remove por e-mail do prefixo
  console.log('limpeza feita')
}

try {
  // chave de serviço só em memória, dentro do try: qualquer falha sai mascarada e passa pela limpeza
  SERVICE = serviceKey()
  track(SERVICE)
  await sql`insert into public.workshops (id, name, import_state) values (${ws}, ${'Teste funções ' + tag}, 'concluido')`
  await createUser('dono', 'dono', 'Dono Teste')
  await createUser('mec', 'mecanico', 'Mecânico Teste')
  await createUser('novo', 'recepcao', 'Convidado Teste', false)
  const donoJwt = await signIn(users.dono.email, password)
  const mecJwt = await signIn(users.mec.email, password)

  // --- papéis ---
  let r = await fn('users', { action: 'invite', email: `x-${tag}@teste-oficinapro.example`, role: 'mecanico', displayName: 'X' }, mecJwt)
  check('mecânico chamando users.invite: 403 somente_dono', r.status === 403 && r.body.error === 'somente_dono', show(r))
  r = await fn('users', { action: 'invite', email: 'a@b.com', role: 'mecanico', displayName: 'X' })
  check('users sem JWT: 401', r.status === 401, show(r))
  r = await fn('users', { action: 'invite', email: users.mec.email, role: 'mecanico', displayName: 'X' }, donoJwt)
  check('invite de e-mail que já é membro: 409 ja_membro', r.status === 409 && r.body.error === 'ja_membro', show(r))
  r = await fn('device', { action: 'register', name: 'PC', kind: 'pc_compartilhado' }, mecJwt)
  check('mecânico chamando device.register: 403', r.status === 403, show(r))

  // --- último Dono ---
  r = await fn('users', { action: 'deactivate', userId: users.dono.id }, donoJwt)
  check('deactivate do último Dono: 409 ultimo_dono', r.status === 409 && r.body.error === 'ultimo_dono', show(r))
  r = await fn('users', { action: 'set_role', userId: users.dono.id, role: 'mecanico' }, donoJwt)
  check('set_role rebaixando o último Dono: 409 ultimo_dono', r.status === 409 && r.body.error === 'ultimo_dono', show(r))

  // --- aparelho ---
  r = await fn('device', { action: 'register', name: 'PC balcão', kind: 'pc_compartilhado' }, donoJwt)
  check('device.register devolve deviceId e deviceSecret', r.status === 200 && r.body.deviceId && /^[0-9a-f]{64}$/.test(r.body.deviceSecret ?? ''), show(r))
  const dev = { id: r.body.deviceId, secret: r.body.deviceSecret }
  const [row] = await sql`select secret_hash from public.devices where id = ${dev.id}`
  check('servidor guarda só o hash do segredo', row && row.secret_hash !== dev.secret && /^[0-9a-f]{64}$/.test(row.secret_hash))
  r = await fn('device', { action: 'set_idle', deviceId: dev.id, minutes: 15 }, donoJwt)
  check('device.set_idle 15', r.status === 200, show(r))
  r = await fn('device', { action: 'set_idle', deviceId: dev.id, minutes: 7 }, donoJwt)
  check('device.set_idle 7: 400', r.status === 400, show(r))
  const [idle] = await sql`select idle_lock_minutes from public.devices where id = ${dev.id}`
  check('idle_lock_minutes gravado', idle.idle_lock_minutes === 15)

  // --- PIN ---
  r = await fn('pin', { action: 'set', pin: '12345' }, mecJwt)
  check('pin.set com 5 dígitos: 400', r.status === 400, show(r))
  r = await fn('pin', { action: 'set', pin: '123456' }, mecJwt)
  check('pin.set mecânico', r.status === 200, show(r))
  r = await fn('pin', { action: 'set', pin: '654321' }, donoJwt)
  check('pin.set dono', r.status === 200, show(r))
  const [ph] = await sql`select pin_hash from public.member_pins where user_id = ${users.mec.id}`
  check('PIN guardado como bcrypt', /^\$2[aby]\$10\$/.test(ph.pin_hash))
  r = await fn('pin', { action: 'verify', pin: '123456' }, mecJwt)
  check('pin.verify certo', r.status === 200, show(r))

  r = await fn('pin', { action: 'roster', deviceId: dev.id, secret: dev.secret })
  check('pin.roster lista as 2 pessoas, sem e-mail', r.status === 200 && r.body.people?.length === 2 && !JSON.stringify(r.body).includes('@'), show(r))
  check('pin.roster devolve idleLockMinutes do aparelho (15)', r.body.idleLockMinutes === 15, show(r))
  r = await fn('pin', { action: 'roster', deviceId: dev.id, secret: 'errado' })
  check('pin.roster com segredo errado: 401 aparelho_invalido', r.status === 401 && r.body.error === 'aparelho_invalido', show(r))

  r = await fn('pin', { action: 'unlock', deviceId: dev.id, secret: dev.secret, userId: users.mec.id, pin: '123456' })
  check('pin.unlock certo devolve tokenHash', r.status === 200 && typeof r.body.tokenHash === 'string' && r.body.type === 'magiclink', show(r))
  const vres = await fetch(`${URL_}/auth/v1/verify`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: r.body.tokenHash }),
  })
  const vj = await vres.json().catch(() => ({}))
  check('verifyOtp aceita o token e abre sessão do mecânico', vres.ok && vj.user?.id === users.mec.id && !!vj.access_token, `status ${vres.status}`)
  track(vj.access_token)
  if (vj.access_token) {
    const rr = await fn('pin', { action: 'verify', pin: '123456' }, vj.access_token)
    check('a sessão obtida pelo PIN vale nas funções', rr.status === 200, show(rr))
    const rs = await fn('pin', { action: 'set', pin: '999999' }, vj.access_token)
    check('sessão aberta por PIN não define PIN (403 exige_senha_recente)', rs.status === 403 && rs.body.error === 'exige_senha_recente', show(rs))
  }

  // 5 erros bloqueiam
  const u = { action: 'unlock', deviceId: dev.id, secret: dev.secret, userId: users.mec.id }
  const codes = []
  for (let i = 0; i < 5; i++) codes.push((await fn('pin', { ...u, pin: '000000' })).status)
  check('4 erros: 401; 5º: 423 pin_bloqueado', codes.slice(0, 4).every((c) => c === 401) && codes[4] === 423, codes.join(','))
  r = await fn('pin', { ...u, pin: '123456' })
  check('bloqueado: PIN certo recusado (423)', r.status === 423 && r.body.error === 'pin_bloqueado', show(r))
  // users.list e users.unlock_pin
  r = await fn('users', { action: 'list' }, donoJwt)
  const byId = (id) => (r.body.people ?? []).find((x) => x.userId === id)
  check('users.list: 3 pessoas da oficina, com e-mail', r.status === 200 && r.body.people?.length === 3 && byId(users.mec.id)?.email === users.mec.email, show(r))
  check('users.list: quem confirmou o e-mail tem acceptedAt; o convite pendente não', !!byId(users.dono.id)?.acceptedAt && byId(users.novo.id)?.acceptedAt === null, show(r))
  check('users.list: PIN bloqueado do mecânico aparece como pinLocked', byId(users.mec.id)?.pinLocked === true && byId(users.dono.id)?.pinLocked === false, show(r))
  r = await fn('users', { action: 'list' }, mecJwt)
  check('users.list pelo mecânico: 403 somente_dono', r.status === 403 && r.body.error === 'somente_dono', show(r))
  r = await fn('users', { action: 'unlock_pin', userId: users.mec.id }, mecJwt)
  check('users.unlock_pin pelo mecânico: 403', r.status === 403, show(r))
  r = await fn('users', { action: 'unlock_pin', userId: users.mec.id }, donoJwt)
  check('users.unlock_pin pelo Dono: 200', r.status === 200, show(r))
  const [lk] = await sql`select failed, locked from public.member_pins where user_id = ${users.mec.id}`
  check('unlock_pin zerou failed e locked no banco', lk.failed === 0 && lk.locked === false, JSON.stringify(lk))
  r = await fn('pin', { ...u, pin: '123456' })
  check('depois de unlock_pin o PIN certo entra (200)', r.status === 200, show(r))
  r = await fn('users', { action: 'unlock_pin', userId: users.novo.id }, donoJwt)
  check('unlock_pin de quem não tem PIN: 404 pin_nao_encontrado', r.status === 404 && r.body.error === 'pin_nao_encontrado', show(r))
  r = await fn('users', { action: 'resend_invite', userId: users.mec.id }, donoJwt)
  check('resend_invite de quem já entrou: 409 convite_ja_aceito (sem enviar e-mail)', r.status === 409 && r.body.error === 'convite_ja_aceito', show(r))
  r = await fn('users', { action: 'list' }, donoJwt)
  check('users.list não vaza hash nem segredo', !/pin_hash|secret|\$2[aby]\$/.test(JSON.stringify(r.body)), '')
  r = await fn('pin', { ...u, userId: randomUUID(), pin: '123456' })
  check('pessoa inexistente: 401 pin_incorreto', r.status === 401 && r.body.error === 'pin_incorreto', show(r))
  // nova senha/PIN desbloqueia
  await fn('pin', { action: 'set', pin: '123456' }, mecJwt)
  r = await fn('pin', { ...u, pin: '123456' })
  check('pin.set depois do bloqueio desbloqueia', r.status === 200, show(r))

  // CORS
  const pre = await fetch(`${URL_}/functions/v1/pin`, { method: 'OPTIONS', headers: { Origin: 'http://tauri.localhost', 'Access-Control-Request-Method': 'POST' } })
  check('CORS: preflight de tauri.localhost liberado', pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'http://tauri.localhost', `status ${pre.status}`)
  const pre2 = await fetch(`${URL_}/functions/v1/pin`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })
  check('CORS: origem estranha sem allow-origin', !pre2.headers.get('access-control-allow-origin'))
  const pre3 = await fetch(`${URL_}/functions/v1/pin`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:1420' } })
  check('CORS: localhost:1420 (dev) liberado por CORS_ORIGINS', pre3.headers.get('access-control-allow-origin') === 'http://localhost:1420')
  const pre4 = await fetch(`${URL_}/functions/v1/pin`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5199' } })
  check('CORS: localhost em porta qualquer liberado (CORS_ALLOW_LOCALHOST só no teste)', pre4.headers.get('access-control-allow-origin') === 'http://localhost:5199')
  const pre5 = await fetch(`${URL_}/functions/v1/pin`, { method: 'OPTIONS', headers: { Origin: 'http://localhost.evil.com' } })
  check('CORS: localhost.evil.com recusado', !pre5.headers.get('access-control-allow-origin'))
  const t415 = await fetch(`${URL_}/functions/v1/pin`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'text/plain' }, body: '{}' })
  check('Content-Type diferente de JSON: 415', t415.status === 415, `status ${t415.status}`)

  // revogar
  r = await fn('device', { action: 'revoke', deviceId: dev.id }, donoJwt)
  check('device.revoke', r.status === 200, show(r))
  r = await fn('pin', { ...u, pin: '123456' })
  check('aparelho revogado recusa o unlock: 401 aparelho_invalido', r.status === 401 && r.body.error === 'aparelho_invalido', show(r))
  r = await fn('pin', { action: 'roster', deviceId: dev.id, secret: dev.secret })
  check('aparelho revogado recusa o roster', r.status === 401, show(r))
  r = await fn('device', { action: 'set_idle', deviceId: dev.id, minutes: 5 }, donoJwt)
  check('set_idle em aparelho revogado: 409', r.status === 409 && r.body.error === 'aparelho_revogado', show(r))

  // desativar mecânico
  r = await fn('device', { action: 'register', name: 'PC 2', kind: 'pc_compartilhado' }, donoJwt)
  const dev2 = { id: r.body.deviceId, secret: r.body.deviceSecret }
  r = await fn('users', { action: 'deactivate', userId: users.mec.id }, donoJwt)
  check('users.deactivate do mecânico', r.status === 200 && r.body.active === false, show(r))
  const [pc] = await sql`select count(*)::int as n from public.member_pins where user_id = ${users.mec.id}`
  check('desativar apagou o PIN', pc.n === 0)
  r = await fn('pin', { action: 'set', pin: '123456' }, mecJwt)
  check('mecânico desativado: JWT antigo não vale (401 ou 403)', r.status === 401 || r.status === 403, show(r))
  r = await fn('pin', { action: 'unlock', deviceId: dev2.id, secret: dev2.secret, userId: users.mec.id, pin: '123456' })
  check('mecânico desativado: unlock recusado', r.status === 401, show(r))
  let banned = false
  const ur = await admin('GET', `/admin/users/${users.mec.id}`)
  const uj = await ur.json()
  banned = !!uj.banned_until
  check('mecânico banido no Auth (banned_until)', banned)
  r = await fn('users', { action: 'reactivate', userId: users.mec.id }, donoJwt)
  check('users.reactivate', r.status === 200 && r.body.active === true, show(r))

  // ===================== money (PR 6): operações de dinheiro, numa 2ª oficina =====================
  {
    const ws2 = randomUUID()
    moneyWs = ws2
    await sql`insert into public.workshops (id, name, import_state) values (${ws2}, ${'Teste money ' + tag}, 'concluido')`
    const mk = async (key, role, name) => {
      const email = `t-${tag}-${key}@teste-oficinapro.example`
      const res = await admin('POST', '/admin/users', { email, password, email_confirm: true })
      const j = await res.json()
      if (!res.ok) throw new Error(`criar usuário falhou: ${res.status} ${show(j)}`)
      users[key] = { id: j.id, email, role, name }
      await sql`insert into public.memberships (workshop_id, user_id, role, display_name) values (${ws2}, ${j.id}, ${role}, ${name})`
    }
    await mk('rec2', 'recepcao', 'Recepção Teste')
    await mk('mec2', 'mecanico', 'Mecânico Teste 2')
    const recJwt = await signIn(users.rec2.email, password)
    const mec2Jwt = await signIn(users.mec2.email, password)
    const today = new Date().toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' })
    // `known` é obrigatório no servidor (work_orders:<osId> ou ledger:<entryId>): por padrão manda a versão atual do banco;
    // passe `known` no corpo para forçar outro valor (ex.: versão velha).
    const money = async (jwt, kind, body = {}, opId = randomUUID()) => {
      let known = body.known
      if (!('known' in body)) {
        const [row] = kind === 'ledger.toggle'
          ? await sql`select version from public.ledger where workshop_id = ${ws2} and id = ${body.entryId}`
          : await sql`select version from public.work_orders where workshop_id = ${ws2} and id = ${body.osId ?? ''}`
        known = row ? { [kind === 'ledger.toggle' ? `ledger:${body.entryId}` : `work_orders:${body.osId}`]: Number(row.version) } : {}
      }
      const x = await fn('money', { opId, kind, today, ...body, known }, jwt)
      return { ...x, opId }
    }
    const seedOS = async (id, status = 'EM_SERVICO') => {
      const main = { id, osNumber: 1, vehicle: 'Gol 2012', clientName: 'Ana', clientPhone: '11999990000', mileage: 1, status, createdAt: '2026-11-01T15:00:00.000Z', publicNotes: '', parts: [{ id: `${id}-p0`, description: 'Filtro' }], services: [{ id: `${id}-s0`, description: 'Troca' }] }
      const fin = { prices: { [`${id}-p0`]: 4000, [`${id}-s0`]: 6000 }, total: 10000 }
      await sql`insert into public.work_orders (workshop_id, id, data) values (${ws2}, ${id}, ${sql.json(main)})`
      await sql`insert into public.work_order_finance (workshop_id, id, data) values (${ws2}, ${id}, ${sql.json(fin)})`
    }
    const osStatus = async (id) => (await sql`select data->>'status' as s, deleted_at from public.work_orders where workshop_id = ${ws2} and id = ${id}`)[0]
    const ledgerOf = async (id) => sql`select id, data, deleted_at, os_id from public.ledger where workshop_id = ${ws2} and os_id = ${id} and deleted_at is null order by (data->>'installmentNumber')::int nulls first`

    // --- papéis ---
    await seedOS('m-os0')
    r = await money(mec2Jwt, 'os.finalizeSingle', { osId: 'm-os0' })
    check('money: Mecânico 403 sem_permissao', r.status === 403 && r.body.error === 'sem_permissao', show(r))
    r = await money(null, 'os.finalizeSingle', { osId: 'm-os0' })
    check('money: sem JWT 401', r.status === 401, show(r))
    r = await money(recJwt, 'ledger.delete', { osId: 'm-os0' })
    check('money: kind de excluir lançamento não existe (400)', r.status === 400 && r.body.error === 'acao_invalida', show(r))
    r = await money(recJwt, 'os.finalizeSingle', { osId: 'm-os0', today: '2020-01-01' })
    check('money: today fora de ±1 dia: 400 data_invalida', r.status === 400 && r.body.error === 'data_invalida', show(r))
    check('money: nada gravado pelas recusas', (await ledgerOf('m-os0')).length === 0 && (await osStatus('m-os0')).s === 'EM_SERVICO')

    // --- finalizar à vista, repetir op_id, reabrir ---
    r = await money(recJwt, 'os.finalizeSingle', { osId: 'm-os0' })
    const op1 = r.opId
    check('money: Recepção finaliza à vista (200)', r.status === 200 && r.body.ok === true, show(r))
    let led = await ledgerOf('m-os0')
    check('money: receita de 10000 ligada à OS (os_id) e já recebida', led.length === 1 && led[0].data.amount === 10000 && !!led[0].data.paymentDate && led[0].os_id === 'm-os0', JSON.stringify(led))
    check('money: OS FINALIZADO', (await osStatus('m-os0')).s === 'FINALIZADO')
    const rep = await money(recJwt, 'os.finalizeSingle', { osId: 'm-os0' }, op1)
    check('money: repetir o mesmo op_id devolve replay sem duplicar', rep.status === 200 && rep.body.replay === true && (await ledgerOf('m-os0')).length === 1, show(rep))
    r = await money(recJwt, 'os.finalizeSingle', { osId: 'm-os0' })
    check('money: op_id novo na OS já finalizada: 409 estado_mudou', r.status === 409 && r.body.error === 'estado_mudou', show(r))
    check('money: replay devolve o info gravado', rep.body.info?.osNumber === 1 && rep.body.info?.amount === 10000, show(rep))
    const reuseBody = await money(recJwt, 'os.finalizeSingle', { osId: 'm-os0', payload: { outro: 1 } }, op1)
    check('money: mesmo op_id e kind com corpo diferente: 409 op_id_reutilizado (hash)', reuseBody.status === 409 && reuseBody.body.error === 'op_id_reutilizado', show(reuseBody))
    r = await money(recJwt, 'os.finalizeSingle', { osId: 'm-os0', known: undefined })
    check('money: sem known: 400', r.status === 400 && r.body.error === 'dados_invalidos', show(r))
    const reuse = await money(recJwt, 'os.delete', { osId: 'm-os0' }, op1)
    check('money: op_id usado em outro kind: 409 op_id_reutilizado', reuse.status === 409 && reuse.body.error === 'op_id_reutilizado', show(reuse))
    r = await money(recJwt, 'os.restore', { osId: 'm-os0', payload: { target: 'EM_SERVICO' } })
    check('money: reabrir apaga a receita e volta a EM_SERVICO', r.status === 200 && (await ledgerOf('m-os0')).length === 0 && (await osStatus('m-os0')).s === 'EM_SERVICO', show(r))

    // --- conflito de versão ---
    const [v0] = await sql`select version from public.work_orders where workshop_id = ${ws2} and id = 'm-os0'`
    r = await money(recJwt, 'os.finalizeSingle', { osId: 'm-os0', known: { 'work_orders:m-os0': Number(v0.version) - 1 } })
    check('money: versão velha: 409 conflito_versao com as linhas atuais', r.status === 409 && r.body.error === 'conflito_versao' && Array.isArray(r.body.rows) && r.body.rows.length > 0, show(r))
    check('money: conflito não gravou nada', (await ledgerOf('m-os0')).length === 0)

    // --- parcelar, receber parcela, reabrir bloqueado ---
    await seedOS('m-os1')
    r = await money(recJwt, 'os.installment', { osId: 'm-os1', payload: { config: { installments: 3, firstPaymentDate: '2026-12-05', totalAmount: 10000, description: 'Parcelamento teste' } } })
    check('money: parcelar em 3x (200)', r.status === 200, show(r))
    led = await ledgerOf('m-os1')
    check('money: 3 parcelas 3333/3333/3334', led.map((x) => x.data.amount).join() === '3333,3333,3334', JSON.stringify(led.map((x) => x.data.amount)))
    check('money: vencimentos no relógio da oficina (15:00Z, fuso real da Edge)', led.map((x) => x.data.dueDate).join() === '2026-12-05T15:00:00.000Z,2027-01-05T15:00:00.000Z,2027-02-05T15:00:00.000Z', JSON.stringify(led.map((x) => x.data.dueDate)))
    check('money: OS AGUARDANDO_PAGAMENTO', (await osStatus('m-os1')).s === 'AGUARDANDO_PAGAMENTO')
    r = await money(recJwt, 'ledger.toggle', { entryId: led[0].id })
    check('money: receber a 1ª parcela', r.status === 200 && r.body.info?.paid === true, show(r))
    r = await money(recJwt, 'os.restore', { osId: 'm-os1', payload: { target: 'EM_SERVICO' } })
    check('money: reabrir com parcela paga: 422 bloqueado', r.status === 422 && r.body.error === 'bloqueado', show(r))
    r = await money(recJwt, 'os.delete', { osId: 'm-os1' })
    check('money: excluir com parcela paga: 422 bloqueado', r.status === 422 && r.body.error === 'bloqueado', show(r))
    r = await money(recJwt, 'os.status', { osId: 'm-os1', payload: { newStatus: 'FINALIZADO' } })
    check('money: "Receber" parcelada com parcela aberta: 422', r.status === 422, show(r))
    await money(recJwt, 'ledger.toggle', { entryId: led[1].id })
    r = await money(recJwt, 'ledger.toggle', { entryId: led[2].id })
    check('money: pagar a última parcela finaliza a OS', r.status === 200 && r.body.info?.osEffect?.kind === 'finalized' && (await osStatus('m-os1')).s === 'FINALIZADO', show(r))
    r = await money(recJwt, 'ledger.toggle', { entryId: led[2].id })
    check('money: desmarcar volta a Aguardando Pagamento', r.body.info?.osEffect?.kind === 'reopened' && (await osStatus('m-os1')).s === 'AGUARDANDO_PAGAMENTO', show(r))

    // --- excluir ---
    await seedOS('m-os2')
    await money(recJwt, 'os.finalizeSingle', { osId: 'm-os2' })
    r = await money(recJwt, 'os.delete', { osId: 'm-os2', machine: 'Teste (script)' })
    const gone = await osStatus('m-os2')
    check('money: excluir OS à vista apaga OS e receita', r.status === 200 && !!gone.deleted_at && (await ledgerOf('m-os2')).length === 0, show(r))
    // --- direto pelo PostgREST a Recepção continua barrada: só a função mexe no dinheiro ---
    await seedOS('m-os3')
    const direct = await fetch(`${URL_}/rest/v1/work_orders?workshop_id=eq.${ws2}&id=eq.m-os3`, {
      method: 'PATCH', headers: { apikey: ANON, Authorization: `Bearer ${recJwt}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ data: { id: 'm-os3', status: 'FINALIZADO', osNumber: 1, vehicle: 'Gol 2012', clientName: 'Ana', clientPhone: '1', mileage: 1, createdAt: '2026-11-01T15:00:00.000Z', publicNotes: '', parts: [{ id: 'm-os3-p0', description: 'Filtro' }], services: [{ id: 'm-os3-s0', description: 'Troca' }] } }),
    })
    check('money: Recepção finalizar direto pelo PostgREST é barrado', !direct.ok && (await osStatus('m-os3')).s === 'EM_SERVICO', `status ${direct.status}`)
    const [aud] = await sql`select count(*)::int as n from public.money_ops where workshop_id = ${ws2}`
    check('money: money_ops guarda as operações feitas', aud.n >= 8, String(aud.n))
  }
} catch (e) {
  fail++
  console.log('ERRO:', mask(e && e.stack ? e.stack : e))
} finally {
  await cleanup()
  await sql.end()
}
console.log(`${pass} ok, ${fail} falhas`)
process.exitCode = fail ? 1 : 0
