// Projeto Supabase de TESTE: cria a oficina "Oficina Teste" e uma conta de Dono (e-mail confirmado, senha temporária impressa).
// Uso: node scripts/test-db.mjs migrate && node scripts/test-seed-owner.cjs <email>. Recusa o projeto real.
// Sem e-mail: o projeto de teste não tem SMTP próprio, então convite e recuperação de senha não servem para entrar.
const { createRequire } = require('module')
const repo = process.cwd()
const postgres = createRequire(repo + '/package.json')('postgres')
const fs = require('fs'); const { execFileSync } = require('child_process'); const { randomBytes, randomUUID } = require('crypto')
const env = {}
for (const l of fs.readFileSync(repo + '/.env.test.local', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const DB = env.TEST_DB_URL, URL_ = env.TEST_SUPABASE_URL.replace(/\/+$/, '')
if (!DB.includes('xtnnayaxufhmyrqcwwnr') || DB.includes('stblagzkkffbjuzltfrt') || !URL_.includes('xtnnayaxufhmyrqcwwnr')) throw new Error('nao e teste')
const SERVICE = JSON.parse(execFileSync('npx', ['supabase', 'projects', 'api-keys', '--project-ref', 'xtnnayaxufhmyrqcwwnr', '-o', 'json'], { encoding: 'utf8', shell: true, cwd: repo })).find(x => x.name === 'service_role').api_key
const email = process.argv[2]
;(async () => {
  const sql = postgres(DB, { max: 1, onnotice: () => {} })
  const admin = (m, p, b) => fetch(URL_ + '/auth/v1' + p, { method: m, headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
  const password = 'Teste-' + randomBytes(5).toString('hex')
  const ws = randomUUID()
  await sql`insert into public.workshops (id,name,import_state) values (${ws}, ${'Oficina Teste'}, 'concluido')`
  // O reset do banco não apaga contas do Auth: conta existente ganha senha temporária nova.
  const [old] = await sql`select id from auth.users where lower(email) = lower(${email})`
  const r = old
    ? await admin('PUT', '/admin/users/' + old.id, { password, email_confirm: true })
    : await admin('POST', '/admin/users', { email, password, email_confirm: true })
  const j = await r.json()
  if (!r.ok) throw new Error('auth ' + r.status + ' ' + JSON.stringify(j))
  await sql`insert into public.memberships (workshop_id,user_id,role,display_name) values (${ws}, ${j.id}, 'dono', 'Dono')`
  console.log('ok workshop', ws, 'user', j.id)
  console.log('SENHA_TEMP', password)
  await sql.end()
})().catch(e => { console.error(String(e.message).replace(DB, '<db>')); process.exit(1) })
