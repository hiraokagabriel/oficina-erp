import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderServiceWorker } from './precache';

// Avalia o service worker gerado com self/caches/fetch falsos.

type Handler = (event: Record<string, unknown>) => void;
interface FakeCache {
  items: Map<string, unknown>;
  addAll: ReturnType<typeof vi.fn>;
}

const ORIGIN = 'https://app.pages.dev';
const FILES = ['index.html', 'assets/app-1.js', 'theme-init.js'];

let handlers: Record<string, Handler>;
let store: Map<string, FakeCache>;
let fetchMock: ReturnType<typeof vi.fn>;

function makeCache(): FakeCache {
  const items = new Map<string, unknown>();
  return { items, addAll: vi.fn(async (urls: string[]) => { urls.forEach(u => items.set(u, `cached:${u}`)); }) };
}

const keyOf = (req: string | { url: string }): string => (typeof req === 'string' ? req : new URL(req.url).pathname);

function load(version = 'v1'): void {
  handlers = {};
  const caches = {
    open: async (n: string) => {
      if (!store.has(n)) store.set(n, makeCache());
      const c = store.get(n) as FakeCache;
      return {
        addAll: c.addAll,
        match: async (req: string | { url: string }) => c.items.get(keyOf(req)),
        put: async (req: { url: string }, res?: unknown) => { c.items.set(keyOf(req), res ?? 'put'); },
      };
    },
    keys: async () => [...store.keys()],
    delete: async (n: string) => store.delete(n),
  };
  const self = { addEventListener: (t: string, h: Handler) => { handlers[t] = h; }, location: { origin: ORIGIN } };
  const code = renderServiceWorker(readFileSync('scripts/pwa/sw.template.js', 'utf8'), { version, files: FILES });
  new Function('self', 'caches', 'fetch', code)(self, caches, fetchMock);
}

async function run(type: string, event: Record<string, unknown>): Promise<{ responded: boolean; value: unknown }> {
  let p: Promise<unknown> | undefined;
  const ev = {
    ...event,
    waitUntil: (x: Promise<unknown>) => { p = x; },
    respondWith: (x: Promise<unknown>) => { p = x; },
  };
  handlers[type](ev);
  return { responded: p !== undefined, value: await p };
}
const req = (url: string, method = 'GET', mode = 'cors') => ({ request: { url, method, mode } });

const netRes = (over: Record<string, unknown> = {}) => ({
  ok: true, type: 'basic', headers: new Headers({ 'content-type': 'text/javascript' }), clone() { return this; }, tag: 'net', ...over,
});

beforeEach(() => {
  store = new Map();
  fetchMock = vi.fn(async () => netRes());
});

describe('service worker', () => {
  it('install: pré-cache em oficina-<versão>, sem skipWaiting', async () => {
    load('v1');
    await run('install', {});
    const c = store.get('oficina-v1') as FakeCache;
    expect(c.addAll).toHaveBeenCalledWith(['/', '/assets/app-1.js', '/theme-init.js']);
    const code = readFileSync('scripts/pwa/sw.template.js', 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toContain('skipWaiting');
  });

  it('activate: apaga só oficina-* de outras versões; mantém o atual e os de outro dono', async () => {
    store.set('oficina-v0', makeCache());
    store.set('outro', makeCache());
    load('v1');
    await run('install', {});
    await run('activate', {});
    expect([...store.keys()].sort()).toEqual(['oficina-v1', 'outro']);
  });

  it('navegação: rede primeiro', async () => {
    load();
    await run('install', {});
    const r = await run('fetch', req(`${ORIGIN}/os/1`, 'GET', 'navigate'));
    expect((r.value as { tag: string }).tag).toBe('net');
  });

  it('navegação sem rede: devolve o `/` do cache', async () => {
    load();
    await run('install', {});
    fetchMock.mockRejectedValue(new Error('offline'));
    const r = await run('fetch', req(`${ORIGIN}/os/1`, 'GET', 'navigate'));
    expect(r.value).toBe('cached:/');
  });

  it('navegação sem rede: resposta redirecionada do cache é reembrulhada', async () => {
    load();
    await run('install', {});
    const red = new Response('<html>', { status: 200 });
    Object.defineProperty(red, 'redirected', { value: true });
    (store.get('oficina-v1') as FakeCache).items.set('/', red);
    fetchMock.mockRejectedValue(new Error('offline'));
    const r = await run('fetch', req(`${ORIGIN}/`, 'GET', 'navigate'));
    const out = r.value as Response;
    expect(out).not.toBe(red);
    expect(out.redirected).toBe(false);
    expect(await out.text()).toBe('<html>');
  });

  describe('rede lenta', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('passados 4 s usa o cache', async () => {
      load();
      await run('install', {});
      fetchMock.mockImplementation(() => new Promise(() => {}));
      const p = run('fetch', req(`${ORIGIN}/`, 'GET', 'navigate'));
      await vi.advanceTimersByTimeAsync(4000);
      expect((await p).value).toBe('cached:/');
    });

    it('sem cache espera a rede', async () => {
      load();
      let done: (v: unknown) => void = () => {};
      fetchMock.mockImplementation(() => new Promise(res => { done = res; }));
      const p = run('fetch', req(`${ORIGIN}/`, 'GET', 'navigate'));
      await vi.advanceTimersByTimeAsync(5000);
      done(netRes());
      expect(((await p).value as { tag: string }).tag).toBe('net');
    });
  });

  it('/assets/: cache primeiro, sem ir à rede', async () => {
    load();
    await run('install', {});
    const r = await run('fetch', req(`${ORIGIN}/assets/app-1.js`));
    expect(r.value).toBe('cached:/assets/app-1.js');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('/assets/ fora do cache: busca na rede e guarda', async () => {
    load();
    await run('install', {});
    const r = await run('fetch', req(`${ORIGIN}/assets/novo.js`));
    expect((r.value as { tag: string }).tag).toBe('net');
    expect((store.get('oficina-v1') as FakeCache).items.has('/assets/novo.js')).toBe(true);
  });

  it('/assets/ não guarda HTML (fallback do Pages), resposta opaca nem erro', async () => {
    load();
    await run('install', {});
    const cases: Record<string, unknown> = {
      '/assets/html.js': netRes({ headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }) }),
      '/assets/opaca.js': netRes({ type: 'opaque' }),
      '/assets/erro.js': netRes({ ok: false }),
    };
    for (const [path, res] of Object.entries(cases)) {
      fetchMock.mockResolvedValueOnce(res);
      await run('fetch', req(`${ORIGIN}${path}`));
      expect((store.get('oficina-v1') as FakeCache).items.has(path)).toBe(false);
    }
  });

  it('outra origem (Supabase) não é interceptada', async () => {
    load();
    const r = await run('fetch', req('https://abc.supabase.co/rest/v1/x'));
    expect(r.responded).toBe(false);
  });

  it('não-GET na mesma origem não é interceptado', async () => {
    load();
    const r = await run('fetch', req(`${ORIGIN}/assets/app-1.js`, 'POST'));
    expect(r.responded).toBe(false);
  });

  it('GET da mesma origem fora de /assets/ e do pré-cache passa direto', async () => {
    load();
    const r = await run('fetch', req(`${ORIGIN}/api/x`));
    expect(r.responded).toBe(false);
  });
});
