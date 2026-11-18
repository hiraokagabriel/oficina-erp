# NUVEM-ESTADO: o que foi feito e o que falta (Iniciativa E)

Atualizado em 2026-11-17. Branch `feat/nuvem-login` (publicada em `origin`). Plano: `docs/NUVEM.md`; especificação: `docs/NUVEM-SPEC.md`; telas e textos: `docs/NUVEM-UX.md`; spike: `docs/NUVEM-SPIKE.md`; PR 8: `docs/NUVEM-PR8.md`.

## Ponto de partida da próxima sessão

**PR 8 implementado (R1 a R7)**, revisado pelo `revisor` e pelo `ux-revisor`, com as correções feitas. Falta só o deploy (R8), que depende do dono: nome do projeto no Pages (D4), conta Cloudflare e os passos manuais de `docs/NUVEM-PR8.md`. Depois: teste em celular real e teste manual do exe com a CSP nova (pendência 8). **Próximo PR a implementar: 9** (importação e backup). A revisão dos PRs 6 e 7 está concluída.

## Projetos Supabase

- **Real**: `stblagzkkffbjuzltfrt` (sa-east-1). Ligado por `supabase link`; chave pública em `.env.local`. **Nenhuma migração aplicada, nenhuma função implantada, nenhum dado.** SMTP Brevo configurado (remetente Gmail verificado, bloqueio de IP desligado; e-mails caem no spam). Site URL ainda `localhost:3000`.
- **Teste**: `oficinapro-teste` `xtnnayaxufhmyrqcwwnr`. `TEST_DB_URL`, `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY` em `.env.test.local` (fora do git). Funções `users`, `pin`, `device`, `money` implantadas; segredos `SITE_URL`, `CORS_ORIGINS`. **Sem SMTP próprio**: convite e recuperação de senha não chegam (para e-mail sem conta o Supabase responde "enviado" e não manda nada). Desde 2026-11-17 há a "Oficina Teste" com a conta de Dono do dono do projeto, para ele testar `npx vite --mode cloud`. Quem rodar `reset` (verificação, pgTAP) deve refazer no fim: `node scripts/test-db.mjs migrate` e `node scripts/test-seed-owner.cjs <e-mail do dono>` (gera senha temporária nova; avisar o dono).
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

| 8 R1, R3 | `utils/platform.ts` (`isTauri`), `utils/download.ts`, CSV no navegador; PWA só com `VITE_CLOUD=1` (`cloudPwa()` no `vite.config.ts`, `scripts/pwa/sw.template.js`, `src/pwa/precache.ts`), `npm run build:web` | SW testado com fetch/caches falsos; `vite preview` abre offline; modo arquivo sem `sw.js` nem manifest |
| 8 R4 a R7 | Celular (nuvem, < 800 px, `data-layout="phone"`): barra de baixo e "Mais", "Disponível no computador", Kanban por chips com busca por placa, ficha da OS em tela cheia com Pagamento só leitura, Agenda por dia, Clientes lista/detalhe com Ligar; `styles-mobile.css` só no boot da nuvem | navegador 360/390/800 px nos dois temas; `revisor` e `ux-revisor` |

Contagem atual: 124 arquivos, 1777 testes Vitest (local e `TZ=UTC`); `tsc` do app e das funções limpos; `dist/` do modo arquivo sem supabase-js/IndexedDB. O modo nuvem só liga com `VITE_CLOUD=1`; o modo arquivo continua o padrão.

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
| 8 R8 | Deploy no Cloudflare Pages (passos manuais em `docs/NUVEM-PR8.md`); depois Site URL e Redirect URLs no Auth do teste; conferir `curl -I https://<nome>.pages.dev/index.html` (308) e o `_headers` aplicado | **dono**: D4 e conta Cloudflare |
| 9 | Importação e backup: "Enviar banco para a nuvem" (`parseDatabase` → `migrate` → `prepareForCloud` → `import_rows` → `import_finish` com conferência de totais), `save_daily_export` (Rust, `cargo test`), exportação diária e aviso em Config | só com banco sintético até a virada |
| 10 | Revisão e piloto: banco sintético, 2 aparelhos, offline e reconexão, papéis | `revisor`, `verificador`, `ux-revisor` |
| 11 | Virada: aplicar migrações e funções no projeto REAL, backup `pre-nuvem`, todos os PCs no mesmo dia | **exige ok do dono** (dados reais) |
| 12 | Remover o modo arquivo do `DatabaseContext` e comandos Rust sem uso | depois da virada |

## Como retomar

`npm install`, `npm run build`, `npm test`. Banco: `npm run test:db` (projeto de teste). Funções: `npm run build:functions`, deploy com `npx supabase functions deploy <nome> --project-ref xtnnayaxufhmyrqcwwnr --use-api --yes`, `node scripts/test-functions.mjs`. App na nuvem: `.env.cloud.local` com `VITE_CLOUD=1` e as chaves do teste, `npx vite --mode cloud`.
