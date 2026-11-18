// Projeto Supabase de TESTE: enche a oficina do Dono com um banco SINTÉTICO pelo mesmo caminho da importação real
// (migrate → prepareForCloud → checkImportable → import_rows em lotes → import_finish com os totais esperados).
// Uso: node scripts/make-synthetic-db.mjs <pasta> && npx vite-node scripts/test-seed-data.ts <email> <pasta>\database.json
// Exige a oficina sem dados (logo depois de test-seed-owner.cjs). Gera senha temporária nova para o Dono e a imprime.
// Sem fotos (as fotos sobem pelo Storage na importação do app instalado). Recusa o projeto real.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { migrate } from '../src/utils/migrations';
import { prepareForCloud, splitDatabase } from '../src/sync/split';
import { buildBatches, checkImportable, describeProblem, expectedTotals, groupByTable } from '../src/sync/importCheck';
import type { DatabaseSchema } from '../src/types';

const REAL = 'stblagzkkffbjuzltfrt';
const TEST = 'xtnnayaxufhmyrqcwwnr';

const env: Record<string, string> = {};
for (const l of readFileSync('.env.test.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const DB = env.TEST_DB_URL ?? '';
const URL_ = (env.TEST_SUPABASE_URL ?? '').replace(/\/+$/, '');
const ANON = env.TEST_SUPABASE_ANON_KEY ?? '';
if (!DB.includes(TEST) || DB.includes(REAL) || !URL_.includes(TEST)) throw new Error('nao e o projeto de teste');

const [email, file] = process.argv.slice(2);
if (!email || !file) throw new Error('uso: vite-node scripts/test-seed-data.ts <email> <database.json sintético>');
if (/OficinaData/i.test(file)) throw new Error('recusado: caminho do banco real');

type Sql = { (s: TemplateStringsArray, ...v: unknown[]): Promise<Record<string, unknown>[]>; end(): Promise<void> };
const postgres = createRequire(process.cwd() + '/package.json')('postgres') as (url: string, o: object) => Sql;

const keys = JSON.parse(execFileSync('npx', ['supabase', 'projects', 'api-keys', '--project-ref', TEST, '-o', 'json'],
  { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'ignore'] })) as { name: string; api_key: string }[];
const SERVICE = keys.find(k => k.name === 'service_role')?.api_key ?? '';

const main = async (): Promise<void> => {
  const sql = postgres(DB, { max: 1, onnotice: () => {} });
  try {
    const [user] = await sql`select id from auth.users where lower(email) = lower(${email})`;
    if (!user) throw new Error('conta não existe: rode test-seed-owner.cjs antes');
    const [m] = await sql`select workshop_id from public.memberships where user_id = ${user.id} and role = 'dono' limit 1`;
    if (!m) throw new Error('a conta não é Dono de nenhuma oficina');
    const ws = String(m.workshop_id);
    const [used] = await sql`select count(*)::int n from public.work_orders where workshop_id = ${ws}`;
    if (Number(used.n) > 0) throw new Error('a oficina já tem dados: rode reset + migrate + test-seed-owner antes');
    await sql`update public.workshops set import_state = 'vazio' where id = ${ws}`;

    const password = 'Teste-' + randomBytes(5).toString('hex');
    const r = await fetch(`${URL_}/auth/v1/admin/users/${user.id}`, {
      method: 'PUT', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!r.ok) throw new Error(`auth ${r.status}`);

    // HTTP direto (o supabase-js exige WebSocket nativo, que o Node 20 não tem).
    const login = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    const token = ((await login.json()) as { access_token?: string }).access_token;
    if (!login.ok || !token) throw new Error(`login ${login.status}`);
    const rpc = async (fn: string, body: unknown): Promise<void> => {
      const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
        method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${fn} ${res.status}: ${await res.text()}`);
    };

    const prepared = prepareForCloud(migrate(JSON.parse(readFileSync(file, 'utf8')) as DatabaseSchema).db);
    const problems = checkImportable(prepared);
    if (problems.length) throw new Error('banco com problemas:\n' + problems.map(describeProblem).join('\n'));

    const batches = buildBatches(groupByTable(splitDatabase(prepared)));
    for (const rows of batches) await rpc('import_rows', { ws, rows });
    await rpc('import_finish', { ws, p_commit: true, p_expected: expectedTotals(prepared) });

    console.log(`ok: ${batches.length} lotes, ${prepared.workOrders.length} OS, ${prepared.clients.length} clientes, ${prepared.ledger.length} lançamentos`);
    console.log('SENHA_TEMP', password);
  } finally {
    await sql.end();
  }
};

main().catch(e => { console.error(String(e instanceof Error ? e.message : e).replace(DB, '<db>')); process.exit(1); });
