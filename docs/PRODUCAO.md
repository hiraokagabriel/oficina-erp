# OficinaPro: quadro de produção

Atualizado em 2026-10-30. Branch `printing-overhaul`. Fonte: `git log`, `git status`, `docs/ROADMAP.md`, `CLAUDE.md` e relatos da sessão principal.

## Estado geral

- Último push registrado: `b44d9aa`. Nenhum push desde então (P5 não feito). Todos os commits abaixo estão só locais. O último é `d699f1d`.
- Commits locais relevantes: `7252371` (rodada 10, merge `042c662`), `b7b11fc` (rodada 12, merge `1c510d1`), `679d7e8` (merge da rodada 13; correção `7cdf49c`), `bc1877c` (resumo do cliente B2/B3, vias de impressão da OS, checklist novo completo/resumido, logo AM configurável, ContextMenu com submenu, foco preso) e `d699f1d` (fotos dos carros por OS, galeria em Clientes, schema v5, comandos Rust, `assetProtocol` desligado, `dragDropEnabled` false).
- Schema: v4 (`e4c893f`, `6494fea`, `56f13d2`) e v5 (`d699f1d`) saem juntos numa única atualização. Versão antiga do app abre banco v4/v5 somente leitura.
- Árvore: limpa, exceto este arquivo.
- Iniciativas: A (repaginação) rodadas 0 a 13 concluídas e mescladas. B (resumo do serviço) B1, B2, B3 e V3 (fotos) implementadas e commitadas. C (adiantamentos, schema v4) commitada.
- Testes (relato da sessão principal): build ok; 6234 testes em fuso normal, UTC e Tóquio; `cargo test` 33 verdes. A contagem inclui duplicados de `.claude/worktrees` (ver riscos).
- Falta tudo que exige Tauri real e hardware (ver pendências do dono).
- Estados usados: planejada, em andamento, em verificação, aprovada, commitada, enviada.

## Iniciativa A: Repaginação visual "Painel de instrumentos"

Direção aprovada pelo dono em 2026-10-21. Sem mudança de schema.

Decisões do dono:
- Ícones em sprite local, sem biblioteca.
- "Em serviço" passa a laranja; dourado só para ações.
- Selo de margem do Kanban desligado por padrão, com opção na Config.
- Finalizar OS mostra SEMPRE o total (não padronizar para restante).

| Rodada | Escopo | Agente | Arquivos principais | Depende de | Estado |
|---|---|---|---|---|---|
| 0 | Desempenho, sem mudar o visual | dev | não registrado | nenhuma | commitada e mesclada |
| 1 | Tokens | dev | `styles-tokens.css`, `index.html` | 0 | commitada e mesclada |
| 2 | Componentes base em CSS | dev | CSS | 1 | commitada e mesclada |
| 3 | Ícones: sprite local | dev | `components/ui/Icon.tsx` | 2 | commitada e mesclada |
| 4 | Estrutura do app: menu, "Salvo", tema, Esc com proteção | dev | `App.tsx` e afins | 3 | commitada e mesclada |
| 5 | Quadro da Oficina | dev | `KanbanCard.tsx`, `WorkshopPage.tsx` | 4 | commitada e mesclada (`d9089ef`, `2cc4699`) |
| 6 | Janela da OS | dev | modais da OS | 4 | commitada e mesclada (`0a1d4e2`, `b2fceec`) |
| 7 | Painel Hoje | dev | Hoje | 4 | commitada e mesclada (`e537261`, `9582a91`, `b4d69cd`) |
| 8 | Financeiro | dev | Financeiro | 4 | commitada e mesclada (`4d0951c`, `ce442d7`) |
| 9 | Agenda | dev | `AgendaPage.tsx`, `AppointmentModal.tsx` | 4 | commitada e mesclada (`1e9dc38`, `9eef6fe`) |
| 10 | Clientes e Cadastros | dev | Clientes e Cadastros | 4 | commitada e mesclada (`7252371`, merge `042c662`) |
| 11 | Processos | dev | Processos | 4 | commitada e mesclada (`6744fb0`, `912aba0`, merge `81452d4`) |
| 12 | Peças, Config, Vistoria, Impressão | dev | lista de compras, Config, Vistoria, impressão | 4 | commitada e mesclada (`b7b11fc`, merge `1c510d1`) |
| 13 | Limpeza: remove `styles-overhaul.css`, `PremiumComponents.tsx`, `KPIStats.tsx` e remendos `[style*=]` | dev | os arquivos citados | 5 a 12 | commitada e mesclada (`dae8aac`, correção de contraste `7cdf49c`, merge `679d7e8`) |

Nota: o mapeamento das rodadas 0 a 4 aos commits não foi conferido um a um.

## Iniciativa B: Resumo do serviço para o cliente

Extra: a OS completa fica intacta.

| Etapa | Escopo | Agente | Arquivos | Depende de | Estado |
|---|---|---|---|---|---|
| 1 | Lógica do resumo | dev | serviço do resumo e testes | nenhuma | commitada (`4ed2365`) |
| 2 | Impressão A4/PDF do resumo + "Modo cliente" | dev | `printServiceSummary`, `serviceSummaryView`, `ClientSummaryModal.tsx`, `styles-client-summary.css` | 1; rodada 3 | commitada (`bc1877c`) |
| 3 | Ações no card e no menu do Kanban (ContextMenu com submenu, foco preso), vias da OS, checklist impresso completo/resumido, logo AM configurável | dev | `KanbanCard.tsx`, `App.tsx`, `WorkshopPage.tsx`, impressão, Config | 2; rodada 5 | commitada (`bc1877c`) |
| V3 | Fotos dos carros por OS, galeria em Clientes, pasta fora do `database.json`, schema v5, comandos Rust | arquiteto, depois dev | schema, `migrations.ts`, `photos.ts`, `lib.rs`, `tauri.conf.json` | ok do dono | commitada (`d699f1d`) |

Portão extra de formato do banco para V3 (v5): migração com teste e plano de atualização dos PCs (ver pendências). Registro de `arquiteto` e do teste de fixture da v5: não registrado.

## Iniciativa C: Lista de adiantamentos na OS (schema v4)

| Etapa | Escopo | Commit | Estado |
|---|---|---|---|
| C1 | Schema v4: lista de adiantamentos e trilha de auditoria (camada pura, migração) | `e4c893f` | commitada |
| C2 | Extrai `migrateLegacyAdvance` da `v3ToV4` para reuso ao salvar | `6494fea` | commitada |
| C3 | Lista de adiantamentos na OS, salvamento com auditoria, lançamento travado no financeiro | `56f13d2` | commitada |

Portão extra de formato do banco para C: `arquiteto`, ok do dono, migração com teste de fixture, plano de atualização dos PCs: não registrados. Verificação no navegador e `revisor` específicos de C: não registrados.

## Portões por rodada ou etapa

Todos na ordem.

| Portão | Critério | Aplica-se a |
|---|---|---|
| 1. Build e testes | `npm run build`; `npm test` normal; `$env:TZ='UTC'; npm test`; zero `any` em produção; `cargo test` se tocou Rust | todas |
| 2. Navegador | `verificador` (regressões, 800 px, banco sintético em pasta temporária) e/ou `ux-revisor` | toda mudança de tela |
| 3. Revisor | `revisor` no diff: correção, risco ao banco, compatibilidade entre PCs, `any`, testes faltando | todas |
| 4. Ok do dono | aprovação para commit | todas |
| 5. Push | só com autorização explícita do dono | todas |
| Extra: formato do banco | `arquiteto`, versão do schema, migração com teste, plano de atualização dos PCs no mesmo dia | C (v4) e V3 (v5) |

Registro de evidência (onde não há registro, "não registrado"):

| Rodada | P1 build/testes | P2 navegador | P3 revisor | P4 ok dono | P5 push |
|---|---|---|---|---|---|
| A0 a A9, A11 | build e testes ok no estado mesclado (contagem por rodada: não registrada) | não registrado | não registrado | commitadas e mescladas (ok por rodada: não registrado) | não feito |
| A10 | build e ~5300 testes ok (2026-10-28) | não registrado; `ux-revisor` não passou | não registrado | dado, em palavras | não feito |
| A12 | build e ~5300 testes ok (2026-10-28) | não registrado; `ux-revisor` não passou | não registrado | dado, em palavras | não feito |
| A13 | build e testes: não registrados por rodada (coberto pelo P1 do conjunto) | não registrado por rodada; contraste de "(Opcional)" e do gatilho de categoria restaurado em `7cdf49c` | não registrado | mesclada; ok: não registrado | não feito |
| B1 | 594 testes, build ok (2026-10-21) | n/a (lógica) | não registrado | commitada | não feito |
| B2, B3, V3 (conjunto `bc1877c` + `d699f1d`) | build + 6234 testes em fuso normal, UTC e Tóquio; `cargo test` 33 verdes (2026-10-30, relato) | `verificador` final no navegador (dist, Tauri simulado, banco sintético): sem defeito grave; decisão pendente do dono sobre homônimo na galeria; itens não verificados listados abaixo | `revisor`: sem crítico; 2 altos e 5 médios corrigidos (guarda de drop, Salvar bloqueado durante envio, cache de URLs com contagem de uso, reset do formulário na recarga, Esc na confirmação, `assetProtocol`) | dado em palavras para as rodadas 10 e 12 e para executar os próximos passos; commit dos itens B/V3: ok implícito, confirmar | não feito |
| C1 a C3 | coberto pelo P1 do conjunto acima | não registrado | não registrado | commitada; ok explícito: não registrado | não feito |
| Commits `3410ecb`, `9f7c032`, `40c137f` | 594 testes, build ok (2026-10-21) | não registrado | não registrado | commitados | não feito |

Não verificado em nenhum portão: Tauri real, drop de arquivo no WebView2, impressora e A4 físico, sincronização entre PCs, Esc na confirmação de remover foto, mesma foto aberta na galeria e na OS ao mesmo tempo.

## Pendências e riscos do dono

Pendências (dependem de decisão ou teste manual):

- Gerar o instalador e testar no Tauri real: fotos (envio, drop, remoção), impressão A4 do resumo, das 3 vias da OS e do checklist (completo e resumido).
- Aprovar os PDFs em `Documents\oficina-impressao-proposta` (antes, depois, checklist-completo, checklist-resumido).
- Decidir o homônimo na galeria de fotos: OS legada de homônimo sem `clientId` aparece na galeria dos dois clientes (`photos.ts`, `sameClient`).
- Backup das fotos: fora do escopo. Drive e `backups` só guardam o JSON; a lixeira de fotos nunca é esvaziada. Decidir se vira rodada futura.
- Atualização dos PCs: v4 e v5 saem juntos, todos os PCs no mesmo dia (abrir um PC, esperar a sincronização, depois os outros). Backup `pre-v<origem>` fica em `%LOCALAPPDATA%\com.oficinapro.app\backups`. Push só com autorização.
- `ux-revisor` nunca passou nas rodadas recentes (10, 12 e outras); decidir se roda antes do push.
- Conferir os termos de uso da FIPE (catálogo de veículos).

Pendências da sessão principal:

- `CLAUDE.md` ainda diz `CURRENT_SCHEMA_VERSION = 3` e cita só `pre-v1`; atualizar para v5 e `pre-v<origem>`.
- Vitest varre `.claude/worktrees` e infla a contagem: excluir da varredura.
- Worktrees `r6` a `r12` e `agent-*` já mesclados podem ser removidos.
- Servidor Vite na 1420 com cache obsoleto: reiniciar com `--force`.

Riscos:

- Desenho: OS impressa ocupa 4 páginas A4 mesmo curta (`summary-page` com `page-break-before`, anterior). Candidata a rodada futura.
- Atualização parcial de PCs: versão antiga abre o banco somente leitura, e versão muito antiga descarta o `meta` ao salvar.
- Fotos fora do JSON: sincronização entre PCs depende da pasta sincronizada; não verificada.

## Próximo passo

1. Dono: aprovar ou ajustar os PDFs de impressão e decidir o homônimo na galeria.
2. Sessão principal: atualizar `CLAUDE.md` (v5), excluir `.claude/worktrees` do Vitest, remover worktrees mescladas.
3. `entregador`: gerar o instalador, preparar notas em `docs/VERSOES.md` e o checklist de atualização dos PCs (v4 + v5 no mesmo dia).
4. Dono: testar no Tauri real (fotos, drop, impressão A4) com banco sintético; só depois autorizar o push (P5).
5. Rodada futura candidata: encurtar a OS impressa (4 páginas) e backup das fotos. `arquiteto` para o backup (toca formato e armazenamento).
