// Gera supabase/functions/<nome>/bundle.js com esbuild (padrão do spike, docs/NUVEM-SPIKE.md seção 1).
import { build } from 'esbuild'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['users', 'pin', 'device', 'money']
for (const name of names) {
  const out = resolve(root, 'supabase/functions', name, 'bundle.js')
  const r = await build({
    entryPoints: [resolve(root, 'supabase/functions', name, 'index.ts')],
    outfile: out,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    external: ['npm:*', 'jsr:*'],
    logLevel: 'warning',
    metafile: true,
  })
  const bytes = Object.values(r.metafile.outputs)[0].bytes
  console.log(`bundle ok: ${name} (${(bytes / 1024).toFixed(1)} KB)`)
}
