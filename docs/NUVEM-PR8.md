# PR 8: Web/PWA e celular (plano)

Plano do `arquiteto` (2026-11-17). Sem mudança de formato do banco. Modo arquivo (sem `VITE_CLOUD`) não muda nem ganha peso: só a CSP do Tauri chega aos PCs, na próxima versão.

## Decisões

| # | Decisão | Escolha |
|---|---|---|
| D1 | Service worker ou só manifest | SW próprio, sem dependência nova (abre sem sinal; navegação rede primeiro, `/assets/` cache primeiro, Supabase não interceptado, sem `skipWaiting`) |
| D2 | `connect-src` | `https://*.supabase.co wss://*.supabase.co` (serve teste e real) |
| D3 | Publicação | Direct Upload deste PC: `npx wrangler pages deploy dist` (sem ligar o Git) |
| D4 | Nome do projeto no Pages (`<nome>.pages.dev`, aparece nos convites) | `andersonmecanica` (2026-11-18): `https://andersonmecanica.pages.dev`, publicado apontando para o projeto de teste |

Premissa: no iPhone, o menu do cartão abre só pelo "⋯"; no Android, o toque longo já dispara `contextmenu`.

## Como o modo arquivo fica intacto

- `usePhoneLayout()` = `!!cloud && matchMedia('(max-width: 799px)')`; `data-layout="phone"` só no modo nuvem.
- `src/styles-mobile.css` importado só em `auth/boot.tsx`; `MobileNav`, `MobileKanban`, `DesktopOnly` com `lazy()`.
- Manifest, `sw.js`, ícones e `<link rel="manifest">` só com `VITE_CLOUD=1` (plugin `cloudPwa()` no `vite.config.ts`).
- Critério: `npm run build` sem `sw.js`/manifest; JS+CSS da abertura cresce no máximo 1 KB gzip.

## Rodadas

| Rodada | Escopo | Ordem |
|---|---|---|
| R1 Adaptadores | `utils/platform.ts` (`isTauri`, nos 4 lugares: `documentOutput`, `photoStore`, `RecoverySection`, `CloudDatabaseProvider`), `utils/download.ts` (`downloadTextFile`, usado por `recoveryStore`), `ExportModal` baixa CSV fora do Tauri | paralela à R2 |
| R2 CSP e cabeçalhos | script do tema em `public/theme-init.js`; `tauri.conf.json`: `csp`, `devCsp: null`, `dangerousDisableAssetCspModification: ["style-src"]`; `public/_headers`; `csp.test.ts`. Exige teste completo do exe | paralela à R1 |
| R3 PWA | `pwa/precache.ts`, `scripts/pwa/sw.template.js`, plugin `cloudPwa()`, registro do SW e `storage.persist()` em `boot.tsx`, `build:web` | depois da R2 |
| R4 Moldura do celular | `services/mobileNav.ts`, `usePhoneLayout`, `MobileNav` (barra de baixo + "Mais"), `DesktopOnly` ("Disponível no computador"), `styles-mobile.css` | sozinha |
| R5 Kanban por chips | `services/mobileKanban.ts` (contagens, chip inicial por papel, filtro com placa), `MobileKanban` sem arrastar | paralela R6/R7 |
| R6 OS em tela cheia | `fieldView` também no celular; pagamento só leitura para quem vê preços; rodapé fixo | paralela R5/R7 |
| R7 Agenda por dia e Clientes | chips dos dias, lista/detalhe no CRM | paralela R5/R6 |
| R8 Deploy | documentar build e passos manuais; `revisor`, `ux-revisor`, `verificador` (tarefas 12, 13, 14 da UX) | por último |

## Passos manuais do dono

1. Conta Cloudflare; `npx wrangler login`; criar o projeto Pages com o nome da D4.
2. Publicar contra o projeto de TESTE: `VITE_SITE_URL=https://<nome>.pages.dev` no `.env.cloud.local`, `npm run build:web`, `npx wrangler pages deploy dist --project-name <nome> --branch main`.
3. Supabase de teste, Auth > URL Configuration: Site URL `https://<nome>.pages.dev`; Redirect URLs `/convite`, `/nova-senha` e `http://localhost:1420/*`.
4. Segredo das funções do teste: `SITE_URL=https://<nome>.pages.dev`. Prévias (`<hash>.<nome>.pages.dev`) não passam no CORS: publicar só na `main`.
5. Celular real: instalar na tela inicial (Android e iPhone), câmera, abrir sem internet, foto HEIC.
6. Na virada (PR 11): repetir 3 e 4 no projeto REAL e refazer o build com as chaves reais.

## Riscos

- CSP do Tauri vale no modo arquivo: não liberar versão aos PCs sem testar o exe (abrir, salvar, foto, imprimir, PDF, CSV, WhatsApp, tema Pastel, backup Drive). Reversão: reinstalar 0.2.0.
- App guardado velho contra servidor novo: contrato das funções compatível com o app anterior.
- iPhone apaga IndexedDB de site não instalado após 7 dias: `storage.persist()` e instalar na tela inicial.
- Navegador em PC compartilhado expõe o cache de outra pessoa: usar só o app instalado.

## Fora do PR 8

Importação e cópia diária (PR 9), Config na nuvem (rodada 9 da UX), criar OS e "Hoje" no celular, toque longo no iPhone, domínio próprio, push, remover `@tauri-apps/plugin-opener` e `tauri-plugin-shell` (PR 12), Tauri mobile.
