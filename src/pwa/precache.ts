// Lista do pré-cache do service worker e geração do `sw.js` a partir do modelo (`scripts/pwa/sw.template.js`).
// Puro: o plugin `cloudPwa()` do vite.config.ts só lê o modelo e grava o resultado.

/** Ícones e arquivos soltos na raiz do site que o app precisa para abrir sem sinal. */
const ROOT_FILES = new Set(['index.html', 'theme-init.js', 'vite.svg', 'manifest.webmanifest']);
const ROOT_ICON = /^(icon-\d+|apple-touch-icon)\.png$/;
const ASSET = /^assets\/.+\.(js|css|svg|woff2|png)$/;

const normalize = (name: string): string => name.replace(/\\/g, '/').replace(/^\/+/, '');

/** Quais arquivos do build entram no pré-cache (sem `.map`, `_headers` e o próprio `sw.js`). Ordem estável, sem repetidos. */
export function precacheList(fileNames: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of fileNames) {
    const name = normalize(raw);
    if (name.endsWith('.map')) continue;
    if (ROOT_FILES.has(name) || ROOT_ICON.test(name) || ASSET.test(name)) out.add(name);
  }
  return [...out].sort();
}

/**
 * Troca os marcadores do modelo: `/*VERSION*\/'dev'` e `/*FILES*\/[]`. O modelo continua sendo JavaScript válido
 * (os testes o avaliam sem trocar nada). Os arquivos viram caminhos absolutos (`/assets/...`).
 */
export function renderServiceWorker(template: string, opts: { version: string; files: readonly string[] }): string {
  const files = opts.files.map(f => `/${normalize(f)}`);
  const withVersion = template.replace("/*VERSION*/'dev'", () => JSON.stringify(opts.version));
  if (withVersion === template) throw new Error('Marcador VERSION não encontrado no modelo do service worker.');
  const withFiles = withVersion.replace('/*FILES*/[]', () => JSON.stringify(files));
  if (withFiles === withVersion) throw new Error('Marcador FILES não encontrado no modelo do service worker.');
  return withFiles;
}
