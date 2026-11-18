import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guarda contra arquivo regravado com a codificação errada (UTF-8 lido como Latin-1 corrompe os acentos) e contra BOM.
const SRC = join(process.cwd(), 'src');
const EXT = /\.(ts|tsx|css)$/;
// "Ã" seguido do 2º byte de á, ã, ç, é, ê, í, ó, ô, õ, ú, É, Ç, Ó; "Â" seguido de ·, º, °, ª. Aqui no fonte cada um
// vem seguido de "[" ou de aspas, então o próprio teste não casa.
const MOJIBAKE =
  /Ã[¡£§©ª­³´µº‰‡“]|Â[·º°ª]/;

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : EXT.test(name) ? [p] : [];
  });

describe('codificação dos fontes', () => {
  const all = files(SRC);

  it('acha os fontes', () => {
    expect(all.length).toBeGreaterThan(100);
  });

  it('nenhum fonte tem texto corrompido nem BOM', () => {
    const bad = all.filter(p => {
      const buf = readFileSync(p);
      const bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
      return bom || MOJIBAKE.test(buf.toString('utf8'));
    });
    expect(bad.map(p => p.slice(SRC.length + 1))).toEqual([]);
  });
});
