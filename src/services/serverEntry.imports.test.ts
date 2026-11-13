import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Grafo de imports da porta de entrada do servidor (Edge Function `money`): só pode entrar arquivo da lista,
// nada de `@tauri-apps`, `react` nem uso de `window`/`document`.

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '..');
const entry = resolve(here, 'serverEntry.ts');

// Lista da spec (seção 3, "Deno") mais o que a divisão da OS exige (`sync/split.ts` e o que ele importa).
const ALLOWED = new Set([
  'services/serverEntry.ts',
  'services/osFinanceService.ts', 'services/osFinanceGuards.ts', 'services/advances.ts', 'services/advancesDraft.ts',
  'services/osRemaining.ts', 'services/osSave.ts', 'services/osEditMerge.ts', 'services/photos.ts',
  'utils/helpers.ts', 'utils/dates.ts', 'utils/migrations.ts', 'utils/links.ts', 'utils/itemIds.ts', 'utils/secrets.ts',
  'sync/split.ts', 'sync/types.ts',
  'types.ts',
]);

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveRel(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts')]) {
    if (existsSync(cand) && /\.tsx?$/.test(cand)) return cand;
  }
  return null;
}

function walk(): { files: string[]; externals: { file: string; spec: string }[] } {
  const seen = new Set<string>();
  const externals: { file: string; spec: string }[] = [];
  const queue = [entry];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (!spec) continue;
      if (spec.startsWith('.')) {
        const target = resolveRel(f, spec);
        if (!target) externals.push({ file: f, spec });
        else queue.push(target);
      } else externals.push({ file: f, spec });
    }
  }
  return { files: [...seen], externals };
}

const rel = (f: string): string => relative(src, f).split(sep).join('/');

describe('serverEntry: grafo de imports', () => {
  const { files, externals } = walk();

  it('só entram arquivos da lista da spec', () => {
    const fora = files.map(rel).filter(f => !ALLOWED.has(f));
    expect(fora).toEqual([]);
  });

  it('o grafo percorreu os arquivos esperados (o teste não está cego)', () => {
    const got = new Set(files.map(rel));
    for (const f of ['services/osFinanceService.ts', 'services/osFinanceGuards.ts', 'utils/dates.ts', 'sync/split.ts', 'types.ts']) {
      expect(got.has(f)).toBe(true);
    }
  });

  it('nenhum import de pacote (@tauri-apps, react, vite...)', () => {
    expect(externals).toEqual([]);
  });

  it('nenhum arquivo usa window nem document', () => {
    const uses = files.filter(f => /\b(window|document)\s*[.[]/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(uses).toEqual([]);
  });

  it('nenhum arquivo importa @tauri-apps ou react (nem em comentário de import dinâmico)', () => {
    const bad = files.filter(f => /['"]@tauri-apps|from\s*['"]react['"]|from\s*['"]react-dom/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(bad).toEqual([]);
  });
});
