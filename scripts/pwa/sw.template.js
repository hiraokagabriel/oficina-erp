// Service worker do OficinaPro (só modo nuvem). Gerado por `cloudPwa()` no vite.config.ts: o build troca os dois
// marcadores abaixo pela versão e pela lista do pré-cache. Sem dependência nova.
//
// - install: guarda tudo em `oficina-<versão>`. SEM skipWaiting: a versão nova espera as abas da antiga fecharem.
// - activate: apaga os caches de outras versões.
// - fetch: só GET da mesma origem. Navegação: rede primeiro; sem rede, o `index.html` do cache.
//   `/assets/` e arquivos do pré-cache: cache primeiro. Supabase, outras origens e não-GET passam direto.

const VERSION = /*VERSION*/'dev';
const FILES = /*FILES*/[];
const CACHE_PREFIX = 'oficina-';
const CACHE_NAME = CACHE_PREFIX + VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.open(CACHE_NAME).then((c) => c.match('/index.html')).then((r) => r || Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || FILES.includes(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        // ignoreVary: o pré-cache foi pedido sem `Origin`; o <script type=module> pede com ele e o servidor pode responder `Vary: Origin`.
        cache.match(req, { ignoreVary: true }).then((hit) => {
          if (hit) return hit;
          return fetch(req).then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          });
        }),
      ),
    );
  }
});
