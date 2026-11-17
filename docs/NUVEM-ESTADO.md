# NUVEM-ESTADO: o que foi feito e o que falta (Iniciativa E)

Atualizado em 2026-11-17. Branch `feat/nuvem-login` (sem push). Plano: `docs/NUVEM.md`; especificação: `docs/NUVEM-SPEC.md`; telas e textos: `docs/NUVEM-UX.md`; spike: `docs/NUVEM-SPIKE.md`; PR 8: `docs/NUVEM-PR8.md`.

## Ponto de partida da próxima sessão

**Retomar pelo PR 8, rodada R1** (adaptadores) e depois R3 (PWA), conforme `docs/NUVEM-PR8.md`. A R2 (CSP e cabeçalhos) está feita, mas falta o teste manual do exe (pendência 8). A revisão dos PRs 6 e 7 está concluída: três rodadas do `revisor`, com as correções feitas e verificadas no navegador contra o projeto de teste. Decisões D1 a D3 do PR 8 tomadas; D4 (nome do projeto no Pages) é do dono.

## Projetos Supabase

- **Real**: `stblagzkkffbjuzltfrt` (sa-east-1). Ligado por `supabase link`; chave pública em `.env.local`. **Nenhuma migração aplicada, nenhuma função implantada, nenhum dado.** SMTP Brevo configurado (remetente Gmail verificado, bloqueio de IP desligado; e-mails caem no spam). Site URL ainda `localhost:3000`.
- **Teste**: `oficinapro-teste` `xtnnayaxufhmyrqcwwnr`. `TEST_DB_URL`, `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY` em `.env.test.local` (fora do git). Funções `users`, `pin`, `device`, `money` implantadas; segredos `SITE_URL`, `CORS_ORIGINS`. Banco deixado vazio (`reset`).
- Docker local não cabe no disco deste PC: os testes de banco rodam no projeto de teste (`npm run test:db`, recusa o ref real).

## Feito (commits nesta branch)

| PR | Conteúdo | Verificação |
|---|---|---|
| 0 | Spike no projeto real (bundle, fuso, PIN, Realtime com RLS, SMTP) | relatório `NUVEM-SPIKE.md`; itens temporários apagados |
| fuso | `setDateTimeZone` em `src/utils/dates.ts` (Edge roda em UTC) | testes em 5 fusos |
| 1 | `src/sync/split.ts`: split/join da OS e catálogo, `prepareForCloud`, `computeTotals`, `exportV5` | volta completa v0–v5 |
| 2 | Migração inicial: tabelas por coleção, RLS por papel, guardas, `sync_push`, `apply_money_op`, `import_*`, Storage | pgTAP no projeto de teste |
| ids | Ids de item estáveis ao salvar (`src/utils/itemIds.ts`) | Vitest |
| 3 | `permissions.ts`, `diff.ts` (`classify`), `outbox.ts`, `mergeRecord.ts` | Vitest, revisado |
| 4 | `syncEngine.ts`, `idb.ts`, `supabaseRepo.ts`, `CloudDatabaseProvider` | servidor falso + 2 aparelhos, revisado |
| 5 servidor | Funções `users`/`pin`/`device` (`src/server/*`), migrações `auth_pin_device` e `pin_unlock` | pgTAP 358 asserções; `scripts/test-functions.mjs`; revisão de segurança |
| 5 app | `src/auth/*` (entrar, convite, PIN, "Quem está usando", bloqueio, desativação, duas abas), barra do topo e selo, Config > Usuários/Aparelhos/Cópias, papéis nas telas (`useAccess`), Mecânico grava só km/fotos | navegador 800 px no teste; revisado |
| 6 | Função `money` (`src/server/moneyHandler.ts`, `serverEntry.ts` + teste de grafo), `moneyClient.ts`, handlers do `App.tsx` no ramo nuvem, `OnlineOnlyButton`, rodada 7 da UX | 79 checks reais no teste; navegador (Recepção finaliza, parcela, recebe; offline cinza) |
| 7 | Fotos no Storage: `photoQueue`, `photoTransport`, `photoCache`, "Espaço das fotos", Tentar de novo/Descartar | navegador no teste (sobe, offline→online, outra oficina barrada) |

| revisão 6/7 | Achados do `revisor` corrigidos: hash do pedido em `money_ops` (migração `20261117120000_money_op_hash.sql`, `op_id` reusado com outro corpo = 409), `info` no replay, `known` obrigatório, custos fora das respostas para quem não é Dono, `checkOSShape`, data e fuso da oficina no servidor, "Tentar de novo" repete o mesmo `op_id` e clique novo gera outro; fotos: fila só cancelada ao salvar a OS, expurgo de pessoa sem perder fotos nem alterações, aviso ao Sair/Trocar com fotos pendentes, "fotos presas" em Config > Cópias; contraste do parcelamento; botão de próximo passo do Kanban cinza sem internet | pgTAP 364 asserções; `test-functions` 82 ok; navegador no teste (resposta perdida sem lançamento em dobro, fotos, 800 px, temas) |
| 8 R2 | CSP do Tauri (`devCsp: null`, `dangerousDisableAssetCspModification: ["style-src"]`), `public/_headers`, tema em `public/theme-init.js`, `csp.test.ts` | `cargo test` 52 ok; `tauri build --debug` ok; exe **não aberto** (pendência 8) |

Contagem atual: 115 arquivos, 1706 testes Vitest (local e `TZ=UTC`); `tsc` do app e das funções limpos; `dist/` do modo arquivo sem supabase-js/IndexedDB. O modo nuvem só liga com `VITE_CLOUD=1`; o modo arquivo continua o padrão.

## Pendências conhecidas (antes do piloto)

1. ~~Revisão dos PRs 6 e 7~~: concluída em 2026-11-17. Riscos aceitos: objetos de foto já enviados ficam no Storage ao remover a foto ou excluir a OS; Storage sem cota por oficina e sem limite de tamanho por tipo (miniatura aceita até 3 MB); "fotos presas" depende de `indexedDB.databases()`. Pergunta ao dono: no painel do Financeiro, "Receitas" e Peças/Serviços somaram OS ainda em aberto (visto no teste com 5 OS); confirmar se é a regra de competência esperada.
2. **CORS em dev**: as funções só aceitam portas fixas (`CORS_ORIGINS`); aceitar `http://localhost:<qualquer porta>` só com variável de teste ligada.
3. Não verificado ao vivo: e-mail de convite/reenvio (teste sem SMTP), TOTP do Dono, queda do Auth (503), câmera real no celular, conflito 409 e queda de rede no meio de operação de dinheiro pela tela, app Tauri instalado (tudo foi visto no navegador), `cargo test`.
4. UX incompleta: "Finalizando..."/"Excluindo..." (só "Recebendo..."), "Preparando este aparelho" sem progresso, 6 caixas do PIN no convite, tema não persiste por pessoa.
5. Sugestões registradas: `app.storage_usage(ws)` para o espaço exato das fotos; limite de espaço da fila de fotos no aparelho; desempenho do `pendingFor` com mais de mil ops.
6. Atualizar `NUVEM-SPEC.md` seção 3 com o contrato do `money` (lista de arquivos do Deno inclui `sync/split.ts`, `sync/types.ts`, `utils/secrets.ts`, `utils/itemIds.ts`; autoteste de fuso 15:00Z só para `America/Sao_Paulo`; `afterMoney` aplica o resultado pelo pull).
7. **Ordem da virada para o projeto real (PR 6, correções da revisão)**: (a) aplicar a migração `supabase/migrations/20261117120000_money_op_hash.sql` (idempotente) ANTES de implantar a função `money` nova: sem ela o PostgREST não acha `p_req_hash`/`p_info` em `apply_money_op` e a função responde 500; (b) implantar função e cliente (app) JUNTOS: o cliente novo sempre manda `known` e `retryOpId` e a função nova exige `known` (400 sem ele); cliente antigo com função nova falha em toda operação de dinheiro. Cada clique novo gera `op_id` novo; só "Tentar de novo" repete o `op_id` da falha (`rede`/`erro`).
8. **Teste manual do exe com a CSP nova (R2 do PR 8)**: o exe de debug abre o banco do caminho salvo no PC, e neste PC há banco real em `C:\OficinaData`, por isso não foi aberto. Com banco sintético em pasta temporária (Config > `dbPath`): abrir, salvar OS, foto (salvar e ver), imprimir OS e vistoria, salvar PDF, exportar CSV, WhatsApp, tema Pastel (fechar e reabrir sem piscar), backup no Drive; F12 sem "Refused to...". Não liberar versão aos PCs sem isso. Reversão: reinstalar 0.2.0.

## A implementar (ordem do plano)

| PR | Escopo | Observação |
|---|---|---|
| 8 | Web/PWA e celular: adaptadores, manifest, CSP (`tauri.conf.json` e `public/_headers`), rodada 8 da UX (barra de baixo, "Disponível no computador", Kanban por chips, OS em tela cheia, câmera), deploy no Cloudflare Pages | depois configurar Site URL e Redirect URLs no Auth |
| 9 | Importação e backup: "Enviar banco para a nuvem" (`parseDatabase` → `migrate` → `prepareForCloud` → `import_rows` → `import_finish` com conferência de totais), `save_daily_export` (Rust, `cargo test`), exportação diária e aviso em Config | só com banco sintético até a virada |
| 10 | Revisão e piloto: banco sintético, 2 aparelhos, offline e reconexão, papéis | `revisor`, `verificador`, `ux-revisor` |
| 11 | Virada: aplicar migrações e funções no projeto REAL, backup `pre-nuvem`, todos os PCs no mesmo dia | **exige ok do dono** (dados reais) |
| 12 | Remover o modo arquivo do `DatabaseContext` e comandos Rust sem uso | depois da virada |

## Como retomar

`npm install`, `npm run build`, `npm test`. Banco: `npm run test:db` (projeto de teste). Funções: `npm run build:functions`, deploy com `npx supabase functions deploy <nome> --project-ref xtnnayaxufhmyrqcwwnr --use-api --yes`, `node scripts/test-functions.mjs`. App na nuvem: `.env.cloud.local` com `VITE_CLOUD=1` e as chaves do teste, `npx vite --mode cloud`.
