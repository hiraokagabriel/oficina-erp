import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// A CSP do app (Tauri) e a do site (Cloudflare Pages) precisam coincidir, exceto ipc e frame-ancestors.
const root = resolve(__dirname, '..', '..');

function parse(csp: string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const part of csp.split(';')) {
    const [name, ...vals] = part.trim().split(/\s+/);
    if (name) m.set(name, vals);
  }
  return m;
}

const tauriConf = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8')) as {
  app: { security: { csp: string; devCsp: unknown; dangerousDisableAssetCspModification: unknown } };
};
const headers = readFileSync(resolve(root, 'public/_headers'), 'utf8');
const webLine = headers.split('\n').find(l => l.trim().startsWith('Content-Security-Policy:'));
const tauri = parse(tauriConf.app.security.csp);
const web = parse((webLine ?? '').replace(/^\s*Content-Security-Policy:/, ''));

describe('CSP', () => {
  it('Tauri e _headers coincidem, exceto ipc e frame-ancestors', () => {
    const t = new Map(tauri);
    t.set('connect-src', (t.get('connect-src') ?? []).filter(v => v !== 'ipc:' && v !== 'http://ipc.localhost'));
    const w = new Map(web);
    expect(w.get('frame-ancestors')).toEqual(["'none'"]);
    w.delete('frame-ancestors');
    expect([...w.entries()].sort()).toEqual([...t.entries()].sort());
  });
  it('sem script inline nem eval', () => {
    expect(tauri.get('script-src')).toEqual(["'self'"]);
    expect(tauri.get('default-src')).toEqual(["'self'"]);
  });
  it('Tauri mantém ipc e não põe nonce em style-src', () => {
    expect(tauri.get('connect-src')).toEqual(expect.arrayContaining(['ipc:', 'http://ipc.localhost']));
    expect(tauriConf.app.security.dangerousDisableAssetCspModification).toEqual(['style-src']);
    expect(tauriConf.app.security.devCsp).toBeNull();
  });
  it('index.html sem script inline', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    expect(html).toContain('<script src="/theme-init.js"></script>');
    expect(/<script(?![^>]*\bsrc=)[^>]*>/.test(html)).toBe(false);
  });
});
