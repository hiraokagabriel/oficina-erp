// Testes de banco (pgTAP) contra o projeto Supabase DE TESTES. Uso: node scripts/test-db.mjs [reset|migrate|test|all]
import postgres from 'postgres'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REAL_REF = 'stblagzkkffbjuzltfrt'
const TEST_REF = 'xtnnayaxufhmyrqcwwnr'

function readUrl() {
  let url = process.env.TEST_DB_URL
  const f = resolve(root, '.env.test.local')
  if (!url && existsSync(f)) {
    const m = readFileSync(f, 'utf8').match(/^\s*TEST_DB_URL\s*=\s*(.+?)\s*$/m)
    if (m) url = m[1].replace(/^["']|["']$/g, '')
  }
  return url
}
const url = readUrl()
if (!url) { console.error('TEST_DB_URL ausente (.env.test.local).'); process.exit(1) }
if (url.toLowerCase().includes(REAL_REF)) { console.error('RECUSADO: TEST_DB_URL aponta para o projeto real.'); process.exit(1) }
if (!url.toLowerCase().includes(TEST_REF)) { console.error('RECUSADO: TEST_DB_URL não é do projeto de teste.'); process.exit(1) }

// Nunca imprime a URL nem a senha.
const secrets = [url]
const pw = url.match(/^[a-z]+:\/\/[^:]*:(.*)@[^@]*$/is)
if (pw && pw[1]) secrets.push(pw[1], encodeURIComponent(pw[1]))
const mask = (s) => secrets.reduce((acc, x) => acc.split(x).join('<oculto>'), String(s))
const fail = (e) => `${e && e.code ? e.code + ': ' : ''}${mask(e && e.message ? e.message : e)}`

let sql

async function reset() {
  await sql.unsafe('drop extension if exists pgtap cascade')
  await sql.unsafe(`
    do $$
    declare r record;
    begin
      for r in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname in ('f_sel', 'f_ins') loop
        execute format('drop policy %I on storage.objects', r.policyname);
      end loop;
      -- policy do broadcast privado (depende de app.ws_topic_allowed, que sai com o drop do schema app)
      if to_regclass('realtime.messages') is not null then
        drop policy if exists ws_broadcast_sel on realtime.messages;
      end if;
      -- tabelas saem da publicação junto com o drop
      for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relkind in ('r', 'p')
                 and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') loop
        execute format('drop table public.%I cascade', r.relname);
      end loop;
      for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.prokind = 'f'
                 and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop
        execute format('drop function %s cascade', r.sig);
      end loop;
      drop schema if exists app cascade;
    end $$;
    grant execute on all functions in schema public to public;
    -- default privileges de volta ao padrão do Supabase
    alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;
  `)
  try {
    await sql.unsafe(`delete from storage.buckets where id = 'fotos'`)
  } catch (e) {
    // storage bloqueia delete direto quando há objetos; os testes dão rollback, então só avisa
    console.warn('aviso: bucket fotos não removido:', fail(e))
  }
  console.log('reset ok')
}

async function migrate() {
  const dir = resolve(root, 'supabase/migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    const text = readFileSync(resolve(dir, f), 'utf8')
    try {
      await sql.begin(async (tx) => { await tx.unsafe(text) })
      console.log('migração ok:', f)
    } catch (e) {
      console.error('migração FALHOU:', f, '\n ', fail(e), e.position ? `(posição ${e.position})` : '')
      process.exit(1)
    }
  }
}

async function tests() {
  await sql.unsafe('create extension if not exists pgtap')
  const dir = resolve(root, 'supabase/tests')
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.sql')).sort() : []
  const setupFile = resolve(dir, 'setup.inc')
  const setup = existsSync(setupFile) ? readFileSync(setupFile, 'utf8') : ''
  let bad = 0, total = 0
  for (const f of files) {
    const text = readFileSync(resolve(dir, f), 'utf8')
    const lines = []
    try {
      const res = await sql.unsafe(`begin;\n${setup}\n${text}\nrollback;`).simple()
      const sets = Array.isArray(res) && res.length && Array.isArray(res[0]) ? res : [res]
      for (const rs of sets) for (const row of rs) {
        const v = Object.values(row)[0]
        if (typeof v === 'string') lines.push(...v.split('\n'))
      }
    } catch (e) {
      try { await sql.unsafe('rollback') } catch {}
      lines.push(`not ok - ERRO DE EXECUÇÃO: ${fail(e)}`)
    }
    const oks = lines.filter((l) => /^ok \d+/.test(l)).length
    const fails = lines.filter((l) => /^not ok/.test(l))
    const plan = lines.find((l) => /^1\.\.\d+/.test(l))
    const planned = plan ? Number(plan.slice(3)) : null
    total += oks + fails.length
    const planBad = planned !== null && planned !== oks + fails.length
    const status = fails.length || planBad || planned === null ? 'not ok' : 'ok'
    if (status === 'not ok') bad++
    console.log(`${status} - ${f} (${oks} ok, ${fails.length} falhas${planBad ? `, plano ${planned} != ${oks + fails.length}` : ''})`)
    for (const l of fails) console.log('    ' + l)
    if (fails.length) for (const l of lines.filter((l) => /^# /.test(l))) console.log('    ' + l)
  }
  console.log(`${total} asserções, ${bad} arquivo(s) com falha`)
  if (bad) process.exitCode = 1
}

const cmd = process.argv[2] || 'all'
try {
  sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 30 })
  if (cmd === 'reset') await reset()
  else if (cmd === 'migrate') await migrate()
  else if (cmd === 'test') await tests()
  else { await reset(); await migrate(); await tests() }
} catch (e) {
  console.error('erro:', fail(e)); process.exitCode = 1
} finally {
  if (sql) await sql.end()
}
