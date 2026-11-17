// Service worker do OficinaPro (só modo nuvem). Gerado por `cloudPwa()` no vite.config.ts: o build troca os dois
// marcadores abaixo pela versão e pela lista do pré-cache. Sem dependência nova.
//
// - install: guarda tudo em `oficina-<versão>`. SEM skipWaiting: a versão nova espera as abas da antiga fecharem.
// - activate: apaga os caches `oficina-*` de outras versões (cache de outro dono não é tocado).
// - fetch: só GET da mesma origem. Navegação: rede primeiro (até 4 s); sem rede ou lenta, o `/` do cache (o
//   `/index.html` responde 308 no Cloudflare Pages, por isso o pré-cache usa `/`).
//   `/assets/` e arquivos do pré-cache: cache primeiro. Supabase, outras origens e não-GET passam direto.

const VERSION = /*VERSION*/'dev';
const FILES = /*FILES*/[];
const CACHE_PREFIX = 'oficina-';
const CACHE_NAME = CACHE_PREFIX + VERSION;
const NAV_TIMEOUT_MS = 4000;

// Resposta `redirected` não pode responder uma navegação: reembrulha sem a marca.
async function clean(r) {
  if (!r || !r.redirected) return r;
  return new Response(await r.blob(), { status: r.status, statusText: r.statusText, headers: r.headers });
}

async function cachedShell() {
  const cache = await caches.open(CACHE_NAME);
  return clean(await cache.match('/'));
}

async function navigate(req) {
  const network = fetch(req);
  let timer;
  const first = await Promise.race([
    network.then((r) => r, () => null),
    new Promise((resolve) => { timer = setTimeout(() => resolve(null), NAV_TIMEOUT_MS); }),
  ]);
  clearTimeout(timer);
  if (first) return first;
  const shell = await cachedShell();
  if (shell) return shell;
  // Sem cache: espera a rede (lenta) em vez de falhar.
  return network.catch(() => Response.error());
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME).map((n) => caches.delete(n))),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(navigate(req));
    return;
  }

  if (url.pathname.startsWith('/assets/') || FILES.includes(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        // ignoreVary: o pré-cache foi pedido sem `Origin`; o <script type=module> pede com ele e o servidor pode responder `Vary: Origin`.
        cache.match(req, { ignoreVary: true }).then((hit) => {
          if (hit) return hit;
          return fetch(req).then((res) => {
            // O Pages devolve index.html 200 para asset inexistente: só guarda resposta direta e que não seja HTML.
            const type = (res && res.headers && res.headers.get('content-type')) || '';
            if (res && res.ok && res.type === 'basic' && !type.includes('text/html')) cache.put(req, res.clone());
            return res;
          });
        }),
      ),
    );
  }
});
