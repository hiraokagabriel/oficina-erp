# NUVEM-ESTADO: o que foi feito e o que falta (Iniciativa E)

Atualizado em 2026-11-13. Branch `feat/nuvem-login` (sem push). Plano: `docs/NUVEM.md`; especificação: `docs/NUVEM-SPEC.md`; telas e textos: `docs/NUVEM-UX.md`; spike: `docs/NUVEM-SPIKE.md`.

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

Contagem atual: 113 arquivos, 1669 testes Vitest (local e `TZ=UTC`); `tsc` do app e das funções limpos; `dist/` do modo arquivo sem supabase-js/IndexedDB. O modo nuvem só liga com `VITE_CLOUD=1`; o modo arquivo continua o padrão.

## Pendências conhecidas (antes do piloto)

1. **Revisão do `revisor` dos PRs 6 e 7 não concluída** (interrompida para poupar tokens). Rodar antes de aplicar qualquer coisa no projeto real. Focos: regra de dinheiro idêntica ao modo arquivo, `op_id` com corpo diferente, `known` opcional, caminho das fotos, cache de miniaturas por pessoa.
2. **CORS em dev**: as funções só aceitam portas fixas (`CORS_ORIGINS`); aceitar `http://localhost:<qualquer porta>` só com variável de teste ligada.
3. Não verificado ao vivo: e-mail de convite/reenvio (teste sem SMTP), TOTP do Dono, queda do Auth (503), câmera real no celular, conflito 409 e queda de rede no meio de operação de dinheiro pela tela, app Tauri instalado (tudo foi visto no navegador), `cargo test`.
4. UX incompleta: "Finalizando..."/"Excluindo..." (só "Recebendo..."), "Preparando este aparelho" sem progresso, 6 caixas do PIN no convite, tema não persiste por pessoa.
5. Sugestões registradas: `app.storage_usage(ws)` para o espaço exato das fotos; limite de espaço da fila de fotos no aparelho; desempenho do `pendingFor` com mais de mil ops.
6. Atualizar `NUVEM-SPEC.md` seção 3 com o contrato do `money` (lista de arquivos do Deno inclui `sync/split.ts`, `sync/types.ts`, `utils/secrets.ts`, `utils/itemIds.ts`; autoteste de fuso 15:00Z só para `America/Sao_Paulo`; `afterMoney` aplica o resultado pelo pull).

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
