import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isCloudBuild, precacheList, renderServiceWorker } from './precache';

describe('isCloudBuild', () => {
  it('só age com VITE_CLOUD=1', () => {
    expect(isCloudBuild('1')).toBe(true);
    for (const v of [undefined, '', '0', 'true', ' 1']) expect(isCloudBuild(v)).toBe(false);
  });
});

describe('precacheList', () => {
  it('inclui index, assets por extensão, ícones e arquivos da raiz', () => {
    const r = precacheList([
      'index.html', 'assets/a-1.js', 'assets/b-2.css', 'assets/c.svg', 'assets/d.woff2', 'assets/e.png',
      'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'manifest.webmanifest', 'theme-init.js', 'vite.svg',
    ]);
    expect(r).toEqual([
      'apple-touch-icon.png', 'assets/a-1.js', 'assets/b-2.css', 'assets/c.svg', 'assets/d.woff2', 'assets/e.png',
      'icon-192.png', 'icon-512.png', 'index.html', 'manifest.webmanifest', 'theme-init.js', 'vite.svg',
    ]);
  });
  it('exclui .map, _headers, sw.js, tipos desconhecidos e arquivos fora de assets/', () => {
    const r = precacheList(['assets/a.js.map', '_headers', 'sw.js', 'assets/a.txt', 'outro.js', 'assets/a.js']);
    expect(r).toEqual(['assets/a.js']);
  });
  it('normaliza barras e remove repetidos', () => {
    expect(precacheList(['/assets/a.js', 'assets\\a.js', 'assets/a.js'])).toEqual(['assets/a.js']);
  });
});

describe('renderServiceWorker', () => {
  const template = readFileSync('scripts/pwa/sw.template.js', 'utf8');
  it('troca versão e lista, com caminhos absolutos', () => {
    const out = renderServiceWorker(template, { version: '1.2.3-x', files: ['index.html', 'assets/a.js'] });
    expect(out).toContain('const VERSION = "1.2.3-x";');
    expect(out).toContain('const FILES = ["/","/assets/a.js"];');
    expect(out).not.toContain('"/index.html"');
    expect(out).not.toContain('/*VERSION*/');
    expect(out).not.toContain('/*FILES*/');
  });
  it('erra se o modelo perdeu um marcador', () => {
    expect(() => renderServiceWorker('const x = 1;', { version: 'v', files: [] })).toThrow(/VERSION/);
    expect(() => renderServiceWorker("const V = /*VERSION*/'dev';", { version: 'v', files: [] })).toThrow(/FILES/);
  });
  it('o resultado é JavaScript válido', () => {
    const out = renderServiceWorker(template, { version: 'v', files: ['index.html'] });
    expect(() => new Function('self', 'caches', 'fetch', out)).not.toThrow();
  });
});
