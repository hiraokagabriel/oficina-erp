# OficinaPro: quadro de produção

Atualizado em 2026-10-21. Branch `printing-overhaul`. Fonte: `git log`, `docs/ROADMAP.md`, `CLAUDE.md` e relatos da sessão principal.

## Estado geral

- Último push: `b44d9aa`.
- Commits locais não enviados (do mais antigo ao mais novo): `3410ecb` (contraste WCAG AA), `9f7c032` (margem em segunda linha), `4ed2365` (lógica do resumo do serviço), `40c137f` (docs e agentes).
- Árvore: `src-tauri/Cargo.toml` modificado e não commitado (origem não registrada; conferir antes de qualquer commit).
- Testes: 594 passando. Build ok.
- Estados usados: planejada, em andamento, em verificação, aprovada, commitada, enviada.

## Iniciativa A: Repaginação visual "Painel de instrumentos"

Direção aprovada pelo dono em 2026-10-21. Sem mudança de schema.

Decisões do dono:
- Ícones em sprite local, sem biblioteca.
- "Em serviço" passa a laranja; dourado só para ações.
- Selo de margem do Kanban desligado por padrão, com opção na Config.
- Finalizar OS mostra SEMPRE o total (não padronizar para restante).
- Rodadas 0, 1, 2 e 3 autorizadas, em ordem.

Ordem obrigatória: 0, 1, 2, 3 em sequência; sistema visual (1 a 3) antes das telas (5 a 12); 13 por último.

| Rodada | Escopo | Agente | Arquivos principais | Depende de | Estado |
|---|---|---|---|---|---|
| 0 | Desempenho, sem mudar o visual | dev | a definir pelo dev | nenhuma | em andamento |
| 1 | Tokens: `styles-tokens.css`; apelidos `--text`, `--bg-card`, `--surface`, `--bg-surface`, `--bg-primary`; cor de abertura no `index.html` | dev | `styles-tokens.css`, `index.html` | 0 | planejada (autorizada) |
| 2 | Componentes base em CSS: botões e perigo, campo, chip, luz de status, janela, aviso, estado vazio, controle segmentado | dev | CSS | 1 | planejada (autorizada) |
| 3 | Ícones: sprite local `components/ui/Icon.tsx` + 6 pictogramas | dev | `components/ui/Icon.tsx` | 2 | planejada (autorizada) |
| 4 | Estrutura do app: menu, indicador "Salvo", tema gravado no `localStorage`, Esc com proteção contra perda, aviso único e acessível | dev | `App.tsx` e afins | 3 | aguarda aprovação do dono |
| 5 | Quadro da Oficina | dev | `KanbanCard.tsx`, `WorkshopPage.tsx` | 4 | aguarda aprovação do dono |
| 6 | Janela da OS | dev | modais da OS | 4 | aguarda aprovação do dono |
| 7 | Painel Hoje | dev | a definir | 4 | aguarda aprovação do dono |
| 8 | Financeiro | dev | a definir | 4 | aguarda aprovação do dono |
| 9 | Agenda | dev | `AgendaPage.tsx`, `AppointmentModal.tsx` | 4 | aguarda aprovação do dono |
| 10 | Clientes e Cadastros | dev | a definir | 4 | aguarda aprovação do dono |
| 11 | Processos | dev | a definir | 4 | aguarda aprovação do dono |
| 12 | Peças, Config, Vistoria, Impressão | dev | a definir | 4 | aguarda aprovação do dono |
| 13 | Limpeza: remover `styles-overhaul.css`, `PremiumComponents.tsx`, `KPIStats.tsx`; remendos `[style*=]` de `styles-contrast.css` | dev | os arquivos citados | 5 a 12 | aguarda aprovação do dono |

Paralelismo: só entre rodadas que não toquem os mesmos arquivos (6 a 12 em tese, confirmar lista de arquivos antes). 5 e etapa 3 da iniciativa B conflitam (ver abaixo).

## Iniciativa B: Resumo do serviço para o cliente

Extra: a OS completa fica intacta.

| Etapa | Escopo | Agente | Arquivos | Depende de | Estado |
|---|---|---|---|---|---|
| 1 | Lógica do resumo | dev | serviço do resumo e testes | nenhuma | commitada (`4ed2365`), não enviada |
| 2 | Impressão A4/PDF do resumo + "Modo cliente" em tela cheia: itens expansíveis com um clique; total e restante; sem técnico nem telefone; garantia de 90 dias só em itens cobrados; opção ao gerar: recomendações do checklist | dev | novos (impressão e tela) | 1; rodada 3 (ícones) se usar pictogramas | planejada |
| 3 | Ligar as ações no card e no menu | dev | `KanbanCard.tsx`, `App.tsx`, `WorkshopPage.tsx` | 2; rodada 0 concluída; coordenar com a rodada 5 | planejada |
| V3 | Fotos (schema v4, pasta de fotos fora do `database.json`) | arquiteto, depois dev | schema, `migrations.ts` | ok explícito do dono | não autorizada |

V3 exige portão extra: `arquiteto`, `CURRENT_SCHEMA_VERSION` 4, migração pura e idempotente com teste de fixture sintética, atualização de todos os PCs no mesmo dia (versão antiga abre o banco novo somente leitura). Reversão pelo backup `pre-v1`.

## Portões por rodada ou etapa

Todos na ordem. Preencher a evidência (contagens, datas) quando passar.

| Portão | Critério | Aplica-se a |
|---|---|---|
| 1. Build e testes | `npm run build`; `npm test` normal; `$env:TZ='UTC'; npm test`; zero `any` em produção; `cargo test` se tocou Rust | todas |
| 2. Navegador | `verificador` (regressões, 800 px, banco sintético em pasta temporária) e/ou `ux-revisor` (contraste, usabilidade) | toda mudança de tela (A: 1 a 13, exceto 0 se sem efeito visual comprovado; B: 2 e 3) |
| 3. Revisor | `revisor` no diff: correção, risco ao banco, compatibilidade entre PCs, `any`, testes faltando | todas |
| 4. Ok do dono | aprovação para commit | todas |
| 5. Push | só com autorização explícita do dono | todas |
| Extra: formato do banco | `arquiteto`, versão do schema, migração com teste, plano de atualização dos PCs no mesmo dia | só V3 |

Registro de evidência:

| Rodada | P1 build/testes | P2 navegador | P3 revisor | P4 ok dono | P5 push |
|---|---|---|---|---|---|
| A0 | pendente | pendente (checar que o visual não mudou) | pendente | pendente | pendente |
| A1 | pendente | pendente | pendente | pendente | pendente |
| A2 | pendente | pendente | pendente | pendente | pendente |
| A3 | pendente | pendente | pendente | pendente | pendente |
| A4 a A13 | pendente | pendente | pendente | pendente | pendente |
| B1 | 594 testes, build ok (2026-10-21) | n/a (lógica) | pendente (não registrado) | commitada | pendente |
| B2 | pendente | pendente | pendente | pendente | pendente |
| B3 | pendente | pendente | pendente | pendente | pendente |
| Commits `3410ecb`, `9f7c032`, `40c137f` | 594 testes, build ok | contraste e margem: não registrado | não registrado | commitados | pendente |

## Pendências e riscos do dono

- Teste no Tauri real e impressão A4 das mudanças (nada disso foi verificado por agentes).
- Conferir os termos de uso da FIPE (catálogo de veículos).
- Confirmar a escolha de push dos 4 commits locais.
- Aprovar as rodadas 4 a 13 quando chegar a vez.
- Ok explícito para V3 (fotos), se quiser.
- Risco: rodada 0 pode mexer em arquivos que a etapa B3 também toca; B3 só depois da 0.
- Risco: 5 e B3 no mesmo trio de arquivos; definir quem vai primeiro.
- Risco: `src-tauri/Cargo.toml` modificado sem dono conhecido.

## Próximo passo

Terminar a rodada 0 (`dev`), passar pelo portão 1 e pedir o `revisor`. Depois rodada 1, 2 e 3 em ordem. Etapa B2 pode começar em paralelo se os arquivos forem disjuntos das rodadas em curso; B3 espera a 0 e a decisão sobre a 5.
