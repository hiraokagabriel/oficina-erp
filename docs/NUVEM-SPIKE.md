# NUVEM-SPIKE: relatório do PR 0

Spike no projeto do dono (`stblagzkkffbjuzltfrt`, `sa-east-1`, Postgres 17) em 2026-11-11, branch `feat/nuvem-login`. Base: `docs/NUVEM-SPEC.md` seção 8, PR 0. Runtime medido: Deno 2.1.4, Supabase Edge Runtime 1.77.9, supabase-js 2.109.0, CLI 3.1.0.

Tudo o que foi criado era temporário e foi removido no mesmo dia: função `spike`, segredos `SPIKE_TOKEN` e `TZ`, 3 usuários de teste, tabelas `spike_secreto` e `spike_members`, função `spike_role()`. Nenhum código do spike ficou no repositório.

## Resultado

| # | Pergunta | Resultado |
|---|---|---|
| 1 | Bundle + `entrypoint` com módulos de `src/` | **Funciona** |
| 2 | `TZ=America/Sao_Paulo` na Edge | **Não funciona**: decisão necessária antes do PR 6 |
| 3 | `generateLink` + `verifyOtp` (PIN sem e-mail) | **Funciona** |
| 4 | RLS no `postgres_changes` | **Funciona**, com função `security definer` |
| 5 | SMTP Brevo | **Funciona** depois de 2 ajustes no Brevo; e-mail cai no spam |

## 1. Bundle + entrypoint

- `src.ts` importou `../../../src/utils/dates`, `../../../src/services/osRemaining` e `import type` de `../../../src/types`, **sem extensão**, como no app. O esbuild (`bundle: true`, `format: 'esm'`, `platform: 'neutral'`, `external: ['npm:*','jsr:*']`) gerou um `bundle.js` de 7 KB em 15 ms.
- `config.toml` com `[functions.<nome>] entrypoint = "./functions/<nome>/bundle.js"` e `verify_jwt = false`: `supabase functions deploy --use-api` enviou só o `bundle.js` (sem Docker) e respeitou o entrypoint.
- `npm:@supabase/supabase-js@2.109.0` e `npm:postgres@3.4.5` resolvidos pelo runtime.
- `getRemainingAmount` rodou no servidor e deu o valor esperado (7000).
- Confirma o caminho da seção 3 da spec (`scripts/build-functions.mjs` + `entrypoint`). O `sloppy-imports` do Deno não é necessário.
- A Edge recebe `SUPABASE_DB_URL`: dá para abrir conexão Postgres direta com `npm:postgres` (`max: 1, prepare: false`). Útil para `import_*`, se o RPC ficar grande.

## 2. Fuso (bloqueio confirmado)

Medido dentro da função:

| Caso | `Intl` timeZone | `getTimezoneOffset` | `new Date(2026,0,1,12).toISOString()` | Autoteste |
|---|---|---|---|---|
| Sem `TZ` | `UTC` | 0 | `2026-01-01T12:00:00.000Z` | falha |
| Segredo `TZ=America/Sao_Paulo` (com redeploy) | `UTC` | 0 | `2026-01-01T12:00:00.000Z` | falha |
| `Deno.env.set('TZ', …)` em execução | — | — | erro `The operation is not supported` | — |

- A variável `TZ` chega em `Deno.env`, mas o V8 continua em UTC. Não há como mudar o fuso local da Edge.
- No servidor, `parseDateOnly('2026-01-31')` dá `2026-01-31T12:00:00.000Z`. No cliente (Brasília) dá `T15:00:00.000Z`. O dia é o mesmo (12:00Z = 09:00 em Brasília), mas o instante gravado diverge.
- **Funciona**: `Intl.DateTimeFormat` com `timeZone: 'America/Sao_Paulo'` tem os dados de fuso. Deu `GMT-03:00` e `01/01/2026, 12:00` para `2026-01-01T15:00:00Z`.

**Decisão (2026-11-11): opção A, implementada.** `src/utils/dates.ts` ganhou `setDateTimeZone(tz | null)` e `getDateTimeZone()`; sem fuso fixado o comportamento é o de antes (fuso local do runtime). `getLocalDateString` (`helpers.ts`) passou a usar `formatDateOnly`. Testes em `dates.test.ts` (São Paulo, horário de verão de 2018, Nova York, Tóquio, equivalência com o modo local), passando com a máquina em São Paulo, UTC, Nova York e Tóquio.

Opções consideradas:
- **A.** `dates.ts` recebe o deslocamento (ou um "relógio de fuso") injetado: no cliente o fuso local, na Edge o calculado por `Intl` a partir de `workshops.tz`. Toca `parseDateOnly`, `addMonths`, `formatDateOnly` e quem chama `getDate/setMonth/getFullYear`. É a "mudança maior" prevista nos riscos.
- **B.** O servidor não gera datas: o cliente manda todas as datas já em ISO meio-dia local (já previsto para `today`), inclusive as das parcelas, e a Edge só valida (dia, intervalo, ±1 dia). É mais simples, mas move regra para o cliente, e o servidor precisa confiar nas datas que recebe.
- Os PRs 1 a 5 não dependem disso.

## 3. PIN: generateLink + verifyOtp

- `auth.admin.generateLink({type: 'magiclink', email})` na Edge devolveu `properties.hashed_token` (`verification_type: 'magiclink'`) **sem enviar e-mail**.
- O cliente com a chave publicável chamou `auth.verifyOtp({type: 'magiclink', token_hash})` e recebeu sessão do usuário certo, com `access_token`.
- Confirma o desenho da seção 5.

## 4. Realtime com RLS

Teste: tabela com RLS em que só o papel `dono` lê, 2 usuários logados por senha (dono e mecânico), assinatura `postgres_changes` INSERT de cada um, insert feito pelo servidor.

| Rodada | Dono: linhas REST / eventos | Mecânico: linhas REST / eventos |
|---|---|---|
| 1 | 1 / 1 | 0 / 0 |
| 2 | 2 / 1 | 0 / 0 |

- O Realtime aplica a RLS de quem assina. O Mecânico não recebe o evento nem o conteúdo.
- **Armadilha encontrada:** a 1ª versão da policy consultava a tabela de membros direto (`exists (select … from spike_members …)`), e essa tabela estava fechada para `authenticated`. Resultado: `permission denied for table spike_members` no REST para **todos**, e no Realtime o Dono **não recebeu nada, sem erro nenhum**. Com a função `security definer set search_path = ''` (mesmo padrão de `app.role_in` da spec) funcionou. Os testes pgTAP do PR 2 devem cobrir que o Dono **recebe**, não só que o Mecânico não recebe.
- Latência: não medida com precisão. O evento chegou dentro da janela de 6 s do teste. Medir no PR 4.

## 5. SMTP Brevo

Três tentativas de `auth.admin.inviteUserByEmail` falharam com HTTP 500 antes dos ajustes:
- supabase-js devolve só `message: "{}"`. A chamada direta ao GoTrue devolve `{"error_code":"unexpected_failure","msg":"Error sending invite email"}`. O motivo real só aparece em `auth_logs` (Logs Explorer): `525 "5.7.1 Unauthorized IP address"`.

Ajustes no Brevo (feitos pelo dono):
1. **Remetente verificado**: Senders > Add sender com um e-mail comum (Gmail), confirmado pelo código. Não exige domínio.
2. **Security > Authorised IPs: bloqueio desligado.** A Auth do Supabase envia de IPs variáveis da AWS (`18.228.116.136` nesta vez), então não dá para cadastrar um IP fixo.

Depois disso: HTTP 200 às 14:53:46 (Brasília), entregue às 14:54 **na pasta Spam** do Gmail.

Consequências:
- O plano grátis do Brevo com remetente `@gmail.com` funciona no piloto, mas convite e "esqueci a senha" vão para o spam. Avisar cada pessoa convidada para olhar o spam. Domínio próprio (SPF/DKIM no Brevo) resolve, previsto para a fase SaaS.
- `resetPasswordForEmail` para e-mail sem conta não envia nada e não dá erro (anti-enumeração). Para testar SMTP, use convite.
- **Site URL ainda é `http://localhost:3000`** (visto no `referer` do log): os links de convite e de nova senha apontam para lá. Configurar Site URL e Redirect URLs (Authentication > URL Configuration) quando existir o endereço do Cloudflare Pages (etapa 8), antes do primeiro convite real.
- A Edge do `users.invite` deve registrar o corpo bruto do GoTrue quando der 500, porque o supabase-js esconde o motivo.

## Notas de operação

- Em sessão de agente, o CLI recusa mudar o projeto (`HostedMutationConsentRequiredError`) sem `--yes`. Usar `--yes` só com ok do dono.
- `supabase migration list` sem `--remote` tenta o Docker local. Com `--remote` confirmou o link (0 migrações).
- Testes de cliente Realtime em Node 20 precisam de `realtime: { transport: WebSocket }` com o pacote `ws` (Node 20 não tem `WebSocket` global).
