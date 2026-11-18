# OficinaPro: quadro de produção

Atualizado em 2026-11-05. Branch `printing-overhaul`. Fonte: `git log`, `git status`, `docs/ROADMAP.md`, `CLAUDE.md` e relatos da sessão principal.

**Para retomar em outro computador:** veja a seção "Iniciativa D" e "Como retomar" mais abaixo. O estado vigente do trabalho (prioridades P1 a P4, decisões do dono, o que falta) está na Iniciativa D. As seções de estado geral e de portões das iniciativas A a C são histórico e podem estar defasadas (por exemplo, a linha "Último push" e "Árvore: limpa").

**Mapa do código:** para achar onde cada iniciativa mora no código, use o grafo local (`graphify-out/GRAPH_REPORT.md`, `/graphify query "..."`; ver a seção "Mapa do código (grafo)" do `CLAUDE.md`). Correspondência entre iniciativa e comunidade do grafo:
- A (repaginação): "Menu lateral e ícones" (`Sidebar`, `Icon`), "Menu de contexto do card", "Kanban (dnd-kit)", "App e modais".
- B (resumo do cliente, impressão e PDF): "Config e saída de documentos" (`documentOutput`, `documents`), "Rust: PDF e WebView2", "Rust: comandos e pastas".
- C (adiantamentos, schema v4): "Adiantamentos" (`advances.ts`), "DatabaseContext", "Cascata de renomeação".
- V3 (fotos, schema v5): "Fotos: telas", "Fotos: lógica", "Fotos: miniatura e limpeza".
- Prazo e agenda: "Prazo e agenda". Veículos: "Veículos e FIPE".

## Estado geral

- Último push registrado: `b44d9aa`. Nenhum push desde então (P5 não feito). Todos os commits abaixo estão só locais. O último é `d699f1d`.
- Commits locais relevantes: `7252371` (rodada 10, merge `042c662`), `b7b11fc` (rodada 12, merge `1c510d1`), `679d7e8` (merge da rodada 13; correção `7cdf49c`), `bc1877c` (resumo do cliente B2/B3, vias de impressão da OS, checklist novo completo/resumido, logo AM configurável, ContextMenu com submenu, foco preso) e `d699f1d` (fotos dos carros por OS, galeria em Clientes, schema v5, comandos Rust, `assetProtocol` desligado, `dragDropEnabled` false).
- Schema: v4 (`e4c893f`, `6494fea`, `56f13d2`) e v5 (`d699f1d`) saem juntos numa única atualização. Versão antiga do app abre banco v4/v5 somente leitura.
- Árvore: limpa, exceto este arquivo.
- Iniciativas: A (repaginação) rodadas 0 a 13 concluídas e mescladas. B (resumo do serviço) B1, B2, B3 e V3 (fotos) implementadas e commitadas. C (adiantamentos, schema v4) commitada.
- Testes (relato da sessão principal): build ok; 6234 testes em fuso normal, UTC e Tóquio; `cargo test` 33 verdes. A contagem inclui duplicados de `.claude/worktrees` (ver riscos).
- Falta tudo que exige Tauri real e hardware (ver pendências do dono).
- Atualização de 2026-11-18: branch `feat/nuvem-login` (a partir da D, versão 0.2.0 em `f1f71f4`) publicada em `origin`, árvore limpa, HEAD `88fd9f2`. Testes: 1930 em 134 arquivos (a contagem antiga de 6234 incluía duplicados de worktrees, já excluídos do Vitest). Iniciativa E (nuvem) com PRs 0 a 10 feitos: ver a seção própria. A versão 0.2.0 (tag `v0.2.0`, `f1f71f4`) está em `origin/printing-overhaul` e na branch da nuvem; nada disso entrou no `main`. O registro de push acima é histórico.
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
| 6 | Janela da OS | dev | modais da OS | 4 | feita (revisão pendente, ver `docs/NUVEM-ESTADO.md`) |
| 7 | Painel Hoje | dev | Hoje | 4 | feita (revisão pendente, ver `docs/NUVEM-ESTADO.md`) |
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

## Iniciativa D: Prioridades de correção e fluxo (P1 a P4), 2026-11

Origem: revisão do fluxo de OS, financeiro e telas feita com o dono. Os itens foram agrupados em quatro prioridades. Sem mudança de schema até aqui (continua v5).

### Lista de prioridades vigente

P1 (dados e dinheiro). Todos feitos (Lote A e Lote B item 1):

| # | Item | Estado |
|---|---|---|
| 1 | Com 2 PCs, salvar OS desfazia o que o outro PC fez | feito (`osEditMerge.ts`, commit `a61477a`) |
| 2 | Excluir OS parcelada deixava parcelas no caixa | feito (`planDeleteOS`, `b7dc3c3`) |
| 3 | Receber em OS parcelada finalizava sem receber as parcelas | feito (`planReceiveOS`, `b7dc3c3`) |
| 4 | Voltar de Aguardando Pagamento não desfazia o parcelamento e reabrir apagava parcelas pagas | feito (`planReopenOS`, `b7dc3c3`) |
| 5 | Financeiro deixava apagar receita ou parcelas de OS | feito (`findReceiptOwner`, `b7dc3c3`) |
| 6 | OS em Aguardando Pagamento sem lançamento não aparecia em A receber nem no Hoje | feito (`getPendingOSReceivables`, `pendingOS`) |

P2 (fluxo do dia a dia):

| # | Item | Estado |
|---|---|---|
| 7 | Campo Data de pagamento era ignorado | feito (campo removido) |
| 8 | Receita manual nasce "a receber" e vira atrasada | pendente (decisão tomada: nasce "já recebida") |
| 9 | Dívida e última visita ao escolher o cliente | feito (`osClientContext.ts`) |
| 10 | Botões Nova OS e Agendar na ficha do cliente | pendente |
| 11 | Orçamento parado: selo e bloco no Hoje | pendente |
| 12 | WhatsApp único, com texto por situação | pendente |
| 13 | Vistoria: km de entrada 0; itens trocar/urgente viram linhas do orçamento; botão Abrir vistoria na OS | pendente |
| 14 | Peças a comprar: agrupamento diferente da impressão, sem carro, seleção some ao trocar de aba, falta filtro Em serviço | pendente |
| 15 | A receber sem busca, sem Abrir OS e sem WhatsApp de cobrança | pendente |

P3 (todo pendente, exceto onde indicado):
- Obs. interna com rótulo errado (é nota do cliente). Decisão: só troca o rótulo.
- Aviso ao editar OS finalizada: FEITO (`editWarning`).
- Número de OS repetido entre PCs.
- Cliente duplicado por acento.
- OS antiga muda de dia (UTC, após 21h).
- Filtros de Processos por horas; busca sem telefone, técnico e acento.
- Quatro buscas diferentes no app.
- OS arquivada sai das estatísticas. Decisão: passa a contar.
- CSV sem Data Pagamento.
- Clientes: retornos sugeridos, garantia, km por OS, filtro por veículo.
- Confirmação ao avançar OS sem itens.
- Duplicar OS.
- Cliente com um veículo preenche sozinho.
- Rascunho da OS recuperável.
- Conflito entre 2 PCs só oferece Recarregar.
- Lixeira das fotos nunca esvazia e fotos ficam fora do backup.
- Restante a pagar calculado em 4 lugares: parcialmente resolvido (`getRemainingAmount` agora em `src/services/osRemaining.ts`; faltam os outros pontos).

P4 (todo pendente): títulos que não batem com o menu; contadores no menu; estados vazios; `alert`/`confirm` nativos; "Entregas de amanhã" no Hoje; código morto; meta no backup do Drive; duplicação de `STATUS_ICON`.

### Decisões do dono

- Receber em OS parcelada com parcela aberta: bloqueia.
- Reabrir OS parcelada com parcela paga: proibido. Se todas as parcelas estão pagas, a OS só reabre depois de desmarcar o pagamento da parcela no Financeiro.
- Data de pagamento: campo removido.
- Receita manual: nasce já recebida por padrão. AINDA NÃO implementado (P2 item 8).
- OS arquivada: conta nas estatísticas. AINDA NÃO implementado (P3).
- Obs. interna: só troca o rótulo. AINDA NÃO implementado (P3).
- Arrastar OS à vista de Finalizado para Aguardando Pagamento: mantém a confirmação. Depois de confirmar, apaga a receita recebida e a data real do recebimento se perde.
- Restaurar do arquivo uma OS finalizada à vista: mantém a confirmação.

### O que foi entregue

Commits `b7dc3c3` (travas financeiras) e `a61477a` (salvar OS com merge e resumo do cliente), ambos na branch `printing-overhaul`. Um commit de correções ainda será feito pelo dono (há alteração local em `src/services/osEditMerge.ts`).

Módulos novos em `src/services/`:
- `osFinanceGuards.ts`: `planDeleteOS`, `planReopenOS`, `planReceiveOS`, `editWarning`, `findReceiptOwner`, `settleOpenReceipt`, `getPendingOSReceivables`.
- `osEditMerge.ts`: `mergeOSEdit`, merge de 3 vias (OS aberta, OS editada, OS atual do banco) ao salvar a OS.
- `osClientContext.ts`: `clientDebtLine`, `lastVisitLine`, `buildClientDebts`.
- `osRemaining.ts`: módulo-folha com `sumAdvances` e `getRemainingAmount`, reexportados por `osFinanceService`.

Mudanças em serviços existentes: `statusChangeEffects` ganhou o efeito `blocked` e um 4º parâmetro `ledger`; A receber e Hoje incluem OS pendente (`summarizeReceivables` recebe `workOrders`, resultado traz `pendingOS`); reabrir respeita o status de destino.

### Pendências técnicas conhecidas

- Avisos "deprecated" de `advanceEntryId` e `advanceAmount` (sem substituto limpo).
- A trava refeita na confirmação (`executePendingAction`) não tem teste automatizado.
- A linha "Deve ..." inclui a própria OS quando ela está em Aguardando Pagamento.
- O commit `b7dc3c3` sozinho não compila: o `App.tsx` que o acompanha está no `a61477a`. Não use `b7dc3c3` isolado em bisect ou deploy.
- Nada do Lote A e B foi verificado automaticamente na interface. O dono fez verificação visual manual e relatou que funciona. Falta `verificador` no navegador e teste com 2 PCs reais.
- Atualizar todos os PCs no mesmo dia (schema não mudou, segue v5, mas o código novo de salvar OS muda o comportamento entre PCs).

### Plano de execução restante

1. Lote em paralelo, em arquivos que não se cruzam: km do checklist (P2 13, parte), receita manual "Já recebido" (P2 8), blocos do Hoje incluindo orçamento parado (P2 11), WhatsApp único (P2 12). Conferir antes quem toca `App.tsx` para não haver conflito.
2. P2 restante: 10, 13 (itens trocar/urgente viram linhas; Abrir vistoria), 14, 15.
3. P3, na ordem da lista, agrupando por tela. Itens que mexem em OS, número de OS ou fotos: `arquiteto` primeiro.
4. P4.
5. Fluxo por rodada: `dev` ou `ui-dev` implementa; sessão principal roda `npm run build`, `npm test` e `$env:TZ='UTC'; npm test`; `verificador`/`ux-revisor` no navegador para tela; `revisor` no diff; ok do dono; commit por assunto. Mudança de formato do banco entra com `arquiteto`, `CURRENT_SCHEMA_VERSION`, migração com teste e plano de atualização dos PCs.

### Como retomar em outro computador

1. Clonar o repositório e mudar para a branch `printing-overhaul` (se o push ainda não foi feito, o trabalho local do PC de origem precisa ser enviado ou copiado antes: ver estado da entrega).
2. `npm install`, depois `npm run build` e `npm test` para confirmar a base verde.
3. Ler `CLAUDE.md` e este arquivo (Iniciativa D). Os documentos de domínio estão no `docs/ROADMAP.md`.
4. `graphify-out/` é gerado por PC e fica fora do git: criar com `/graphify` se quiser o mapa do código.
5. Testar sempre com banco sintético em pasta temporária (campo `dbPath` em Config), nunca com o banco real.

### Estado da entrega

- (Atualizado em 2026-11-18) A versão 0.2.0 foi preparada (`f1f71f4`, tag `v0.2.0`, notas em `docs/VERSOES.md`). A próxima versão (correções da branch da nuvem) está descrita em "Próxima versão (não lançada)" e depende do teste do exe com a CSP nova.
- Push NÃO feito. Só o dono autoriza.
- Portões da Iniciativa D: P1 (build e testes) rodado pela sessão principal nos commits; P2 (navegador) não registrado, só verificação visual manual do dono; P3 (`revisor`) não registrado; P4 (ok do dono) dado para os commits; P5 (push) não feito.

## Iniciativa E: Nuvem e login (Supabase, papéis, offline), 2026-11

Branch `feat/nuvem-login` (criada em 2026-11-11, publicada em `origin`). Decisões, padrões assumidos, arquitetura e riscos: `docs/NUVEM.md`. Estado detalhado, pendências e ordem da virada: `docs/NUVEM-ESTADO.md`. Plano aprovado pelo dono. Muda o formato de dados (nuvem com versão própria): portão extra do `arquiteto` e plano de virada dos PCs no mesmo dia. O modo nuvem só liga com `VITE_CLOUD=1`; o modo arquivo segue o padrão e nada foi aplicado no projeto Supabase real (só no de teste).

Estado em 2026-11-18: PRs 0 a 10 feitos (PR 8 sem o deploy). Faltam o deploy do PR 8, os testes manuais do dono, o PR 11 (virada) e o PR 12.

| PR | Escopo | Agente | Depende de | Estado |
|---|---|---|---|---|
| 0 | Branch, decisões, spike no projeto real (`NUVEM-SPIKE.md`) | sessão principal, `gerente`, `arquiteto` | nenhuma | feito |
| especificação e UX | `docs/NUVEM-SPEC.md` (ok do dono em 2026-11-11) e `docs/NUVEM-UX.md` | `arquiteto`, `ux-designer` | 0 | feito |
| 1 | `src/sync/split.ts`: split/join do banco para as tabelas, totais, `exportV5` | `dev` | spec | feito |
| 2 | Migração inicial: tabelas, RLS por papel, guardas, `sync_push`, `apply_money_op`, `import_*`, Storage | `dev` | 1; projeto de teste | feito (pgTAP no teste; não aplicado no real) |
| 3 | `permissions`, `diff`, `outbox`, `mergeRecord` | `dev` | 1, 2 | feito |
| 4 | `syncEngine`, IndexedDB, `supabaseRepo`, `CloudDatabaseProvider` | `dev` | 3 | feito |
| 5 | Funções `users`/`pin`/`device`; login, convite, PIN, bloqueio, papéis nas telas | `dev`, `ui-dev` | 2, 4 | feito |
| 6 | Dinheiro no servidor (função `money`, hash do pedido, `OnlineOnlyButton`) | `dev` | 2, 4 | feito e revisado |
| 7 | Fotos no Storage (fila, cache, "Espaço das fotos") | `dev` | 2 | feito e revisado |
| 8 | R1 a R7: adaptadores do navegador, PWA, CSP do Tauri, `_headers`, celular. R8: deploy no Cloudflare Pages | `ui-dev`, `dev` | 5 | código feito; **R8 pendente, depende do dono** (nome do site no Pages e conta Cloudflare) |
| 9 | Importação com conferência de totais, lacre, cópia diária (Rust `backup_pre_cloud`, `save_daily_export`, `photo_inventory`), `scripts/make-synthetic-db.mjs` | `dev` | 2, 4 | feito; falta exercitar no app Tauri real com banco sintético (dono) |
| 10 | Revisão e piloto com banco sintético (2 aparelhos, Realtime, merge, dinheiro concorrente, offline, papéis, PIN) e correção dos achados | `revisor`, `verificador`, `ux-revisor` | 4 a 9 | feito (2026-11-18) |
| 11 | Virada: migrações e funções no projeto REAL, backup `pre-nuvem`, importação, todos os PCs no mesmo dia | `entregador` | 10; ok do dono | **pendente, depende do dono** |
| 12 | Remover o modo arquivo do `DatabaseContext` e os comandos Rust sem uso | `dev` | 11 | pendente (só depois da virada) |

Portões cumpridos até aqui (último estado verificado, relato da sessão principal e commits; datas de execução por PR não registradas):

| Portão | Evidência |
|---|---|
| 1. Build e testes | `npm run build` (inclui `tsc` do `vite.config.ts`) ok; Vitest 1930 testes em 134 arquivos, fuso normal e `TZ=UTC`; `tsc` do app e das funções limpos; zero `any` em produção; `cargo test` 57; pgTAP 396 asserções no projeto de teste; `scripts/test-functions.mjs` 91 ok |
| 2. Navegador | `verificador` e `ux-revisor` no projeto de teste, 360/390/800 px nos dois temas (PR 8), piloto de 2 aparelhos (PR 10). Tauri nos testes foi simulado em JS |
| 3. Revisor | `revisor` nos PRs 3 a 5, 6 e 7 (achados corrigidos no commit `8a18ad3`), 8 (celular) e 9; PR 10 com achados corrigidos em `6f1618d` e `0af9d04`. Revisão do SQL antes de aplicar no real: ainda a fazer |
| 4. Ok do dono | especificação aprovada em 2026-11-11; commits da branch feitos a pedido; ok para a virada (PR 11): não dado |
| 5. Push | branch já está em `origin/feat/nuvem-login`; push de qualquer versão aos PCs não feito |
| Extra: formato do banco | `arquiteto` na especificação; SQL por migração em `supabase/migrations/` (ordem em `docs/NUVEM-ESTADO.md`); o `CURRENT_SCHEMA_VERSION` do modo arquivo segue 5 (a nuvem tem versão própria e a importação usa `migrate` até v5); plano de atualização dos PCs: só no PR 11 |

Correções feitas na branch que também valem para o modo arquivo (chegam aos PCs na próxima versão, ver `docs/VERSOES.md`): contraste da janela de parcelamento (`1e3485a`); acentos do título da Oficina e teste de guarda `src/utils/encoding.test.ts` (`cb2a965`); banco somente leitura sem falso sucesso (`88a8899`); "Voltar/Avançar situação" no menu do card, telefone com máscara em Clientes, excluir OS diz o cliente e que não dá para desfazer, contraste de "Em Serviço" no Pastel (`56a9572`); CSP do Tauri (`c88f4f8`); checagem de tipos do `vite.config.ts` no build (`f2e7679`, `8c6bb69`).

Pendências do dono:

- Testar o exe com a CSP nova com banco sintético em pasta temporária (nunca o real em `C:\OficinaData`): abrir, salvar OS, foto, imprimir, PDF, CSV, WhatsApp, tema Pastel, backup no Drive, F12 sem "Refused to...". Não liberar versão aos PCs sem isso.
- Definir o nome do site no Cloudflare Pages e abrir a conta (PR 8 R8); depois Site URL e Redirect URLs do Auth.
- Testar em celular real (câmera, PWA, offline).
- ~~Testar a importação no app Tauri real com banco sintético~~ e ~~o exe com a CSP nova~~: feitos pelo dono em 2026-11-18.
- Responder: "Receitas" e Peças/Serviços do painel do Financeiro devem somar OS ainda em aberto? (visto no teste com 5 OS)
- SMTP do projeto real: tirar os e-mails do spam (hoje Brevo com remetente Gmail).
- Combinar o dia da virada: todos os PCs no mesmo dia, dono presente; ok para aplicar no projeto real.

Riscos aceitos do piloto: objetos de foto já enviados ficam no Storage ao remover a foto ou excluir a OS; Storage sem cota por oficina; "fotos presas" depende de `indexedDB.databases()`. Não verificado ao vivo: e-mail de convite (teste sem SMTP), TOTP do Dono, queda do Auth, câmera real, leitor de tela nas 6 caixas do PIN.

## Portões por rodada ou etapa

Todos na ordem.

| Portão | Critério | Aplica-se a |
|---|---|---|
| 1. Build e testes | `npm run build`; `npm test` normal; `$env:TZ='UTC'; npm test`; zero `any` em produção; `cargo test` se tocou Rust | todas |
| 2. Navegador | `verificador` (regressões, 800 px, banco sintético em pasta temporária) e/ou `ux-revisor` | toda mudança de tela |
| 3. Revisor | `revisor` no diff: correção, risco ao banco, compatibilidade entre PCs, `any`, testes faltando | todas |
| 4. Ok do dono | aprovação para commit | todas |
| 5. Push | só com autorização explícita do dono | todas |
| Extra: formato do banco | `arquiteto`, versão do schema, migração com teste, plano de atualização dos PCs no mesmo dia | C (v4), V3 (v5) e E (nuvem) |

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

0. (2026-11-18, Iniciativa E) Dono: (exe com a CSP nova e importação no Tauri real: feitos em 2026-11-18) celular real, nome do site no Pages, SMTP do real, resposta sobre "Receitas"; depois combinar a virada. Sessão principal e `entregador`: PR 11 só com o ok do dono (ordem das migrações em `docs/NUVEM-ESTADO.md`). Os itens 1 a 5 abaixo são anteriores à nuvem.
1. Dono: aprovar ou ajustar os PDFs de impressão e decidir o homônimo na galeria.
2. Sessão principal: atualizar `CLAUDE.md` (v5), excluir `.claude/worktrees` do Vitest, remover worktrees mescladas.
3. `entregador`: gerar o instalador, preparar notas em `docs/VERSOES.md` e o checklist de atualização dos PCs (v4 + v5 no mesmo dia).
4. Dono: testar no Tauri real (fotos, drop, impressão A4) com banco sintético; só depois autorizar o push (P5).
5. Rodada futura candidata: encurtar a OS impressa (4 páginas) e backup das fotos. `arquiteto` para o backup (toca formato e armazenamento).
