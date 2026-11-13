# OficinaPro na nuvem: login, papéis e acesso de qualquer aparelho

Iniciativa E (`feat/nuvem-login`). Plano aprovado pelo dono. Criado em 2026-11-11. O quadro de acompanhamento está em `docs/PRODUCAO.md`.

## Contexto

Hoje o banco é um `database.json` único em pasta sincronizada, salvo inteiro (`DatabaseContext.tsx`, `save_database_atomic`). Já houve perda por gravação concorrente. Não existe identidade de usuário (só o nome do PC em `meta.savedBy` e `AuditEvent.machine`). O app só roda no Tauri: carga, gravação, fotos, PDF e exportação usam `invoke`.

Objetivo: login por pessoa com papéis, dados no Supabase, uso em PC (Tauri), navegador e celular, funcionando offline. Uma oficina agora, estrutura pronta para SaaS.

## Decisões fechadas

| # | Decisão |
|---|---|
| Q1 | Mesmo front React no Tauri e como site/PWA (navegador e celular) |
| Q2/Q16 | Usuário por pessoa. Papéis: **Dono** (tudo), **Recepção** (OS com preços, recebe e parcela, vê A receber; não vê margem/custo, não exclui lançamento, sem Config/usuários), **Mecânico** (Kanban e OS sem valores, status, vistoria, fotos) |
| Q3/Q17 | Offline com fila. Offline: OS, status, vistoria, fotos, agenda, clientes. Dinheiro (receber, parcelar, finalizar com pagamento, reabrir, excluir) só online, validado no servidor |
| Q4 | Uma oficina; `workshop_id` em toda linha e RLS por oficina desde o início |
| Q5/Q6 | Supabase, plano grátis no piloto, região `sa-east-1`. Passar ao Pro quando crescer |
| Q7 | Fotos no Supabase Storage (bucket privado por oficina) |
| Q8 | Modo arquivo local some após a virada; exportação JSON fica como backup |
| Q9 | Tabela por coleção, 1 linha por registro: `{id, workshop_id, data jsonb, version, updated_at, updated_by, deleted_at}`. Cache local em IndexedDB e fila própria |
| Q10 | Sem cadastro aberto. Dono convida por e-mail com papel; e-mail + senha; "esqueci a senha" por e-mail; Dono desativa na hora |
| Q11/Q13 | Sigilo real: OS dividida em `work_orders` (sem preço) e `work_order_finance` (preços, custos, adiantamentos, parcelas). RLS só entrega finance a Dono/Recepção; `ledger` também. Custo/margem só Dono |
| Q12/Q21/Q22 | PC compartilhado: tela "Quem está usando agora?" com cartões grandes e PIN no teclado numérico. Bloqueio após 15 min parado (Dono ajusta: 5/15/30/nunca por aparelho). "Trocar de pessoa" sempre no topo. Celular pessoal fica logado |
| Q14 | Supabase Realtime: mudança aparece em cerca de 1 s |
| Q15 | Celular na 1ª versão: Kanban, abrir OS, status, vistoria, fotos pela câmera, agenda, busca de cliente. Financeiro, Margem, Config e impressão só em tela ≥ 800 px |
| Q18 | Tauri continua (PDF, pastas, offline robusto); web é o mesmo código |
| Q19 | Piloto com banco sintético, depois virada num dia com todos os PCs |
| Q20 | App do Dono exporta tudo 1x/dia em JSON (formato atual) para `%LOCALAPPDATA%\com.oficinapro.app\backups` e opcionalmente Drive |
| Q23 | Selo fixo no topo: salvo / enviando N / sem internet, N guardadas / erro. Botões de dinheiro cinza offline com o motivo |
| Q24 | Cloudflare Pages grátis (`*.pages.dev`); domínio próprio na fase SaaS |

### Padrões assumidos (o dono muda na aprovação se discordar)

- PIN de 6 dígitos. 5 erros: pede a senha completa. PIN só funciona em aparelho autorizado pelo Dono.
- Dono com verificação em 2 etapas (TOTP do Supabase) opcional, recomendada.
- `auditLog` passa a registrar todas as ações com usuário e aparelho, não só adiantamentos.
- Conflito no mesmo campo, offline: regra atual do `mergeOSEdit` (vence quem salvou por último, toast lista os campos).
- Senha mínima de 8 caracteres; mensagens de erro em pt-BR simples.
- Visual: tokens e componentes atuais (`styles-tokens.css`, `Icon.tsx`, temas Escuro e Pastel). Sem marca nova.

## Arquitetura

- **Camada de dados:** `DatabaseContext` mantém a API `useDatabase()` (coleções + `setX`), então `App.tsx` e as telas quase não mudam na 1ª etapa. Por baixo, troca `invoke('load/save')` por um repositório:
  - lê do cache IndexedDB na abertura (funciona offline);
  - cada `setX` vira diff por registro (reaproveita a ideia do `buildSnapshot`) e entra na fila `outbox`;
  - envio da fila com `version` esperada (concorrência otimista por linha, no lugar da `revision` do arquivo); conflito resolvido com `mergeOSEdit` (`src/services/osEditMerge.ts`);
  - recebe mudanças por Realtime e por "pull desde `updated_at`" ao reconectar.
- **Dinheiro no servidor:** Edge Functions (Deno/TypeScript) importam os módulos puros que já existem: `osFinanceService.ts`, `osFinanceGuards.ts` (`planDeleteOS`, `planReopenOS`, `planReceiveOS`), `advances.ts`, `osRemaining.ts`, `utils/helpers.ts` (`Money`), `utils/dates.ts`. Gravam OS + finance + ledger numa transação. Pré-requisito: esses módulos sem imports de Vite/React/Tauri.
- **Migrações:** `src/utils/migrations.ts` continua para importar o JSON antigo (`migrate` até v5) antes de subir. O formato da nuvem tem versão própria (SQL em `supabase/migrations/`).
- **Adaptadores de plataforma:** `documentOutput.ts`, `ExportModal.tsx`, `photoStore.ts` e `photoCleanup.ts` já checam `__TAURI_INTERNALS__`; no web usam download do navegador e Storage. Fotos: `imageCompress.ts` (1600 px) e miniatura reaproveitados, só muda o destino.
- **Segredos:** chave `anon` do Supabase no build (pública por natureza, protegida pela RLS). Nunca usar `service_role` no front. Sessão: Supabase Auth; no PC compartilhado, o token de cada pessoa fica guardado cifrado com chave derivada do PIN (o detalhe fecha o arquiteto).

## Etapas

| Etapa | Escopo | Agente (modelo) | Estado |
|---|---|---|---|
| 0 | Branch `feat/nuvem-login` a partir de `printing-overhaul`; registro de decisões neste arquivo | sessão principal; `gerente` (Sonnet) | feita (branch criada em 2026-11-11) |
| 1 | Especificação técnica: tabelas, políticas RLS por papel, Edge Functions de dinheiro, protocolo de sync (fila, versão, pull, Realtime), desenho do PIN e do aparelho autorizado, mapeamento JSON v5 para tabelas. **Aprovação do dono antes do código** | `arquiteto` (Opus) | feita (aprovada pelo dono em 2026-11-11) |
| 2 | Telas e textos: login, convite, esqueci a senha, "Quem está usando", PIN, Usuários e papéis em Config, selo de nuvem, estados offline e botões travados, telas de campo no celular. Dono aprova a direção | `ux-designer` (Opus) | feita: `docs/NUVEM-UX.md` (2026-11-12; pontos em aberto fechados no fim do arquivo) |
| 3 | Supabase: dono cria a conta e o projeto em `sa-east-1`; SQL em `supabase/migrations/`, RLS, testes de política (Mecânico não lê `work_order_finance` nem `ledger`; oficina A não lê B) | `dev` (Sonnet) | SQL e RLS feitos e testados no projeto de teste (`npm run test:db`); não aplicado no projeto real |
| 4 | Camada de dados offline: repositório IndexedDB + fila + sync dentro do `DatabaseContext`, mantendo `useDatabase()`. Testes Vitest puros da fila, diff por registro e conflito | `dev` (Sonnet) | feita (PRs 1 a 4: `src/sync/`, `CloudDatabaseProvider`) |
| 5 | Login e sessão: Auth, convite, PIN, bloqueio por inatividade, permissões por papel nas telas | `dev` + `ui-dev` (Sonnet) | feita (PR 5; funções no projeto de teste; tema no menu, PIN esquecido e bloqueio revisados) |
| 6 | Dinheiro no servidor: Edge Functions com os serviços puros; botões offline travados | `dev` (Sonnet) | pendente |
| 7 | Fotos no Storage | `dev` (Sonnet) | pendente |
| 8 | Web/PWA e celular: adaptadores, manifest, telas de campo responsivas, deploy Cloudflare Pages | `ui-dev` + `dev` (Sonnet) | pendente |
| 9 | Importação e backup: "Enviar banco para a nuvem" (lê JSON, `migrate`, sobe, confere totais: nº de OS, clientes, soma do ledger em centavos) e exportação diária | `dev` (Sonnet) | pendente |
| 10 | Revisão e piloto: banco sintético, 2 aparelhos, offline e reconexão, papéis | `revisor` (Opus); `verificador` e `ux-revisor` (Sonnet) | pendente |
| 11 | Virada: versão, notas, todos os PCs no mesmo dia, backup `pre-nuvem`; reversão = versão antiga do app + último `database.json` | `entregador` (Sonnet) | pendente |

## Riscos

- Plano grátis pausa após 7 dias sem uso e não tem backup diário: a exportação diária (Q20) cobre; passar ao Pro antes de crescer.
- PIN de 6 dígitos guardado localmente é atacável por quem tiver o disco do PC; mitigado por aparelho autorizado e limite de tentativas.
- Dados pessoais de clientes saem do PC: a LGPD pede aviso de privacidade antes do SaaS.
- As Edge Functions dependem de os serviços puros não importarem nada de navegador; pode exigir pequena separação de módulos.

## Verificação

- Cada etapa: `npm run build`, `npm test` (também `$env:TZ='UTC'; npm test`), `cargo test` se tocar o Rust.
- RLS: testes SQL por papel e por oficina.
- Sync: testes Vitest da fila e do conflito; no navegador (Playwright + Edge, banco sintético), 2 abas como 2 aparelhos, derrubar a rede, editar nas duas, reconectar.
- Papéis: logar como Mecânico e conferir na aba Rede do DevTools que nenhum preço chega.
- Importação: totais conferidos antes e depois com banco sintético; nunca o banco real até a virada.
- Não verificável por testes: usabilidade real na oficina e no celular (piloto).
