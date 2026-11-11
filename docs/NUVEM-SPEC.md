# NUVEM-SPEC: especificação técnica (etapa 1)

Base: plano aprovado (`docs/NUVEM.md`), branch `feat/nuvem-login`. Conferido no código em 2026-11-11. O formato JSON v5 **não muda** (`CURRENT_SCHEMA_VERSION` continua 5, `src/utils/migrations.ts:10`). O formato da nuvem é novo e versionado em `supabase/migrations/`.

Status: **decisões do dono fechadas** (seção 8). PR 0 feito em 2026-11-11 (`docs/NUVEM-SPIKE.md`): bundle, PIN, Realtime com RLS e SMTP funcionam; **`TZ` na Edge não funciona**: resolvido pela opção A (`setDateTimeZone` em `dates.ts`, 2026-11-11). PRs 1 (`src/sync/`) e 2 (`supabase/migrations/`, `supabase/tests/`) feitos em 2026-11-11, sem commit. Revisados pelo `revisor` e corrigidos (237 asserções pgTAP, `npm run test:db`). **Decidir antes do PR 3:** custos órfãos quando a Recepção salva a OS (os ids de item são regerados a cada salvamento, `osEditMerge.ts:54`, e a Recepção não vê `work_order_costs`: o Dono perde custo e margem). Opções: parar de regerar ids; remapear `costs` no servidor; ou travar edição de itens pela Recepção quando houver custo. Contrato final de `sync_push`/`apply_money_op`/`import_*`: comentários no topo de cada função na migração. `work_order_finance.data.extra` guarda chaves desconhecidas da OS (lista branca em `work_orders`).

## 1. Esquema Postgres

**Colunas comuns** de toda tabela de coleção:
- `workshop_id uuid not null references workshops`
- `id text not null` (ids legados nem sempre são UUID)
- `data jsonb not null`
- `version bigint not null default 1`
- `updated_at timestamptz not null default clock_timestamp()`
- `updated_by uuid`
- `deleted_at timestamptz`
- `primary key (workshop_id, id)` e `index (workshop_id, updated_at, id)`

Trigger `app.touch()`: incrementa `version`, grava `updated_at = clock_timestamp()` e `updated_by = auth.uid()`.

**Tabelas de controle:**
- `workshops(id uuid pk, name, tz text default 'America/Sao_Paulo', last_export_at timestamptz, import_state text default 'vazio')`.
- `memberships(workshop_id, user_id uuid references auth.users, role text check (role in ('dono','recepcao','mecanico')), display_name, active bool default true, invited_at, pk(workshop_id,user_id))`.
- `member_pins(workshop_id, user_id, pin_hash text, failed int default 0, locked bool default false, updated_at)`. **Sem nenhuma policy**: só o service role lê. O hash nunca chega ao front.
- `devices(id uuid pk, workshop_id, name, kind text check (kind in ('pc_compartilhado','pessoal')), secret_hash text, idle_lock_minutes int null` (5/15/30; null = nunca)`, authorized_by, authorized_at, revoked_at, failed_pin_hour int, failed_pin_window timestamptz)`.
- `money_ops(op_id uuid pk, workshop_id, user_id, kind, result jsonb, created_at)`: idempotência das operações de dinheiro.
- `audit_events(id bigserial, workshop_id, at, user_id, device_id, tbl, row_id, op, changed_keys text[], before jsonb, after jsonb)`. `before`/`after` só para `ledger` e `work_order_finance`; nas outras, só as chaves alteradas.

**Uma tabela por coleção de `DatabaseSchema`** (`src/types.ts:283`):

| Coleção | Tabela(s) |
|---|---|
| `workOrders` | `work_orders` + `work_order_finance` + `work_order_costs` (mesmo `id`) |
| `ledger` | `ledger`, com coluna extra `os_id text null`, gravada só pelo servidor |
| `clients` | `clients`. Derivados `totalSpent`, `serviceCount`, `lastServiceDate`, `averageTicket`, `vipStatus` retirados na importação (`CRMDashboard.tsx:28` recalcula; não podem vazar ao Mecânico) |
| `catalogParts` / `catalogServices` | `catalog_parts` / `catalog_services` com `{description, category}`; `catalog_prices(kind,id){price}`; `catalog_costs(kind,id){cost}` |
| `catalogTechnicians` | `technicians` |
| `appointments` | `appointments` |
| `auditLog` | `audit_log`: só eventos v5 (`AuditEvent`, `types.ts:86`), gravados pela função de dinheiro |
| `settings` | `settings` (id `'main'`). Segredos do Google continuam fora (`secrets.ts`) |

**Divisão da `WorkOrder`** (`types.ts:18-55`):

| Campo | Tabela | Motivo |
|---|---|---|
| `id, osNumber, vehicle, clientName, clientPhone, clientId, vehicleId, technicianId, mileage, status, createdAt, checklist, publicNotes, technician, expectedDate, photos` | `work_orders` | Kanban, vistoria, fotos, agenda |
| `parts[]`, `services[]` como `{id, catalogItemId, description, category}` | `work_orders` | Mecânico vê o que fazer, sem valor |
| `OrderItem.price` | `work_order_finance.data.prices: {[itemId]: number}` | Dono e Recepção |
| `total, financialId, paymentDate, paymentMethod, installmentConfig, advances, advanceAmount, advanceEntryId` | `work_order_finance` | Dinheiro |
| `OrderItem.cost`, `totalCost`, `profit` | `work_order_costs.data: {costs:{[itemId]:number}, totalCost, profit}` | Só o Dono |
| `profitMargin` (obsoleto) | descartado na importação | Não é lido (`osEditMerge.ts:98`) |

**Junção** (`joinWorkOrder(main, fin?, cost?)`):
- Sem finance: `price: 0` e `total: 0`; a tela esconde por papel (seção 4).
- Sem cost: `cost` indefinido = "não informado" (`margin.ts`).
- Ids dos itens são regerados a cada salvamento (`osEditMerge.ts:54`). A junção só ocorre quando o conjunto de ids de itens de `work_orders` é igual às chaves de `prices`; senão mantém a OS anterior até a outra metade chegar. Evita a Recepção salvar preços zerados.
- A importação garante id único por item dentro da OS; faltando, usa `${osId}-p${i}` / `-s${i}` (determinístico, idempotente).

## 2. RLS

```sql
create function app.role_in(ws uuid) returns text language sql stable security definer set search_path='' as $$
  select m.role from public.memberships m
  where m.workshop_id = ws and m.user_id = auth.uid() and m.active $$;
create function app.is_service() returns bool language sql stable as $$ select auth.role() = 'service_role' $$;
```

| Tabela | select | insert | update | soft-delete (`deleted_at`) |
|---|---|---|---|---|
| `work_orders` | todos | dono, recepcao | todos + trigger | só service (excluir OS é dinheiro) |
| `work_order_finance` | dono, recepcao | dono, recepcao + trigger | dono, recepcao + trigger | service |
| `work_order_costs`, `catalog_costs` | dono | dono | dono | dono |
| `ledger` | dono, recepcao | dono, recepcao com `os_id is null` | dono, recepcao + trigger | só dono, só lançamento manual |
| `clients` | todos | todos | dono, recepcao | dono, recepcao |
| `appointments` | todos | todos | todos | dono, recepcao |
| `catalog_*`, `catalog_prices`, `technicians` | todos (preços: dono, recepcao) | dono, recepcao (aprendizado ao salvar OS, `App.tsx:251-254`) | idem | dono |
| `settings` | todos | dono | dono | — |
| `audit_log`, `audit_events` | dono | só trigger ou service | — | — |
| `memberships` | a própria linha; dono vê todas | só service (Edge) | service | — |
| `devices` | dono | service | service | — |

```sql
create policy wo_sel on work_orders for select to authenticated using (app.role_in(workshop_id) is not null);
create policy fin_all on work_order_finance for all to authenticated
  using (app.role_in(workshop_id) in ('dono','recepcao')) with check (app.role_in(workshop_id) in ('dono','recepcao'));
```

**Triggers de guarda** (`before update`; service role passa direto):
- `guard_work_orders`:
  - Mecânico: `(old.data - '{status,checklist,photos,mileage}') = (new.data - …)`, senão `42501 mecanico_campo_proibido`.
  - Todos: mudar `deleted_at` dá `money_op_required`.
  - Status: não entra nem sai de `FINALIZADO` (exceção `FINALIZADO` para `ARQUIVADO`, D7, `osFinanceService.ts:200`); não sai de `ARQUIVADO`; não volta de `AGUARDANDO_PAGAMENTO` com receita (`financialId` ou `installmentConfig` na finance). Espelho SQL de `statusChangeEffects` (`osFinanceService.ts:178-244`).
- `guard_finance` (ajustado na revisão do PR 2): em OS com receita (`financialId` ou `installmentConfig`) ou FINALIZADO/ARQUIVADO, `total` e `prices` também só mudam por service; salvar essa OS exige `os.save` pela função `money`. Compara `financialId, paymentDate, paymentMethod, advances, advanceAmount, advanceEntryId` e `installmentConfig - 'description'` entre OLD e NEW. `description` liberada pela cascata (`cascadeService.ts:57-62`).
- `guard_ledger`: com `os_id is not null`, só aceita mudança em `description` (cascata, `cascadeService.ts:84-100`). Recepção não grava `deleted_at`.

**Storage**: bucket privado `fotos`, `file_size_limit` 3 MB, `allowed_mime_types` `image/jpeg`.

```sql
create policy f_sel on storage.objects for select to authenticated
  using (bucket_id='fotos' and app.role_in(((storage.foldername(name))[1])::uuid) is not null);
create policy f_ins on storage.objects for insert to authenticated
  with check (bucket_id='fotos' and app.role_in(((storage.foldername(name))[1])::uuid) is not null
   and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9-]{1,64}/[A-Za-z0-9-]{1,64}(\.t)?\.jpg$');
```

Sem policy de update nem delete: nunca sobrescreve, nunca apaga (como o Rust hoje).

**Testes**: pgTAP em `supabase/tests/*.sql`, `supabase test db` no Docker local, com `set local role authenticated; set local request.jwt.claims='{"sub":"…"}'`. Cobrem:
- Mecânico lê 0 linhas de `work_order_finance`, `work_order_costs`, `ledger`, `catalog_prices`.
- Recepção lê 0 linhas de `*_costs`.
- Oficina A lê 0 linhas da B; membro desativado lê 0 linhas.
- Mecânico que altera `clientName` ou `parts` recebe 42501.
- Status para `FINALIZADO` sem service dá `money_op_required`.
- Recepção com `deleted_at` no ledger recebe erro; insert de ledger com `os_id` negado.

## 3. Edge Functions e transação

**Funções:** `money` (uma, com `kind`, menos cold start); `users` (`invite`, `deactivate`, `reactivate`, `set_role`); `pin` (`set`, `unlock`, `verify`, `roster`); `device` (`register`, `revoke`, `set_idle`); `import` (`import_rows`, `import_finish`). O resto é upsert por `sync_push` (seção 4).

**`money.kind`**, um por handler atual:
- `os.finalizeSingle`: `App.tsx:806`, `finalizeOSSingle`.
- `os.installment`: `App.tsx:551`, `buildInstallmentEntries` + `applyInstallmentToOS`.
- `os.status`: `App.tsx:211`, quando `statusChangeEffects` devolve `update` com `settleEntry` ou `updates` com chaves além de `status`.
- `os.restore`: `App.tsx:771`, `planReopenOS` + `restoreFinancial`.
- `os.delete`: `App.tsx:743`, `planDeleteOS` + `removeOSReceipt` + `removeAllAdvances`.
- `os.save`: `App.tsx:314/355`, `prepareOSSave`, só quando muda o ledger ou gera eventos (adiantamentos, `refreshFinishedReceipt` em OS finalizada).
- `ledger.toggle`: `App.tsx:459`, `togglePayment`.

Lançamento manual (`useFinance.ts:47,59`) é upsert simples, só online.

**Fluxo:**
1. Valida JWT, lê `memberships`, exige dono/recepcao `active`, deriva `workshop_id` da membership (nunca do corpo).
2. Carrega as 3 linhas da OS + `ledger where os_id = osId`.
3. Reconstrói a `WorkOrder` (`joinWorkOrder`), roda a função pura, calcula as linhas novas.
4. `rpc('apply_money_op', payload)` com service role.

**`apply_money_op(op_id, ws, user, device, kind, expected[{tbl,id,version}], writes[{tbl,id,data,deleted,os_id}], audit[])`**, plpgsql, uma transação:
1. `op_id` existente: devolve o resultado gravado.
2. `select … for update` das linhas esperadas.
3. Versão diferente: `conflict` (Edge devolve 409 com as linhas atuais).
4. Aplica gravações, insere `audit_log`, grava `money_ops`.

Transação no Postgres, regra no TS.

**Deno**: `osFinanceService`, `osFinanceGuards`, `advances`, `advancesDraft`, `osRemaining`, `osSave`, `osEditMerge`, `photos`, `utils/helpers`, `utils/dates`, `utils/migrations`, `utils/links` só importam `../types` e entre si; `types.ts` não importa nada. Nenhum importa React/Vite/Tauri (`@tauri-apps` só em `App.tsx:3`, `DatabaseContext.tsx:2-3`, `ExportModal.tsx:2`, `photoStore.ts:1`, `documentOutput.ts:1`).

Bloqueios:
1. Imports sem extensão (`'../types'`): Deno não resolve sem `sloppy-imports`.
2. Fuso: `dates.ts` usa meio-dia local (`parseDateOnly`) e o servidor roda em UTC. Afeta `buildInstallmentEntries` (`osFinanceService.ts:37`), `effectiveDate` em `syncAdvances`, `today` de `validateAdvance`.

Solução:
- `src/services/serverEntry.ts` reexporta só o necessário.
- `supabase/functions/<nome>/index.ts` importa `../../../src/services/serverEntry` e `@supabase/supabase-js`; type-check por `tsconfig.functions.json` com shim `deno.d.ts`.
- `scripts/build-functions.mjs` (esbuild) gera `bundle.js`; `config.toml` aponta `entrypoint` para ele.
- Vitest `serverEntry.imports.test.ts`: percorre o grafo e falha se entrar arquivo fora da lista, `@tauri-apps`, `react` ou `window`/`document`.
- Fuso: a função chama `setDateTimeZone(workshops.tz)` (`src/utils/dates.ts`) antes de usar os serviços; com isso `parseDateOnly`, `addMonths`, `formatDateOnly` e `getLocalDateString` usam o relógio da oficina por `Intl`. Autoteste na entrada: `parseDateOnly('2026-01-01').toISOString()==='2026-01-01T15:00:00.000Z'`; falhou, 500 "fuso do servidor" sem gravar.
- **Refutado no PR 0** (`docs/NUVEM-SPIKE.md` seção 2: a Edge fica em UTC mesmo com `TZ`; `Intl` com `timeZone` funciona). Texto original: `TZ=America/Sao_Paulo` na função, com autoteste `new Date(2026,0,1,12).toISOString()==='2026-01-01T15:00:00.000Z'`; falhou, 500 "fuso do servidor" sem gravar.
- Cliente manda `today` e datas em ISO meio-dia local (`toISOFromDateInput`); servidor aceita `today` a ±1 dia do relógio. Brasil sem horário de verão desde 2019.

## 4. Protocolo de sync

**Escopo**: `src/sync/` (lógica pura + 2 módulos finos) e `src/context/CloudDatabaseProvider.tsx`, que entrega o **mesmo** `DatabaseContext` (`DatabaseContext.tsx:57-92`). `main.tsx` escolhe o provider (arquivo ou nuvem). O `DatabaseContext` atual fica intacto até a virada e sai depois.

**IndexedDB**: um banco por pessoa e oficina, `oficinapro-<ws>-<user>` (cache do Mecânico nunca contém preços). Stores:
- `records`: chave `[collection,id]`, `{data (junta), versions:{main,fin?,cost?}, updatedAt, deleted}`.
- `outbox`: chave `opId`, índice `[collection,recordId]`.
- `meta`: `cacheVersion=1`, `cursor[tabela]`, `role`, `lastPullAt`.
- `photoQueue`: blobs da foto e da miniatura.
- `photoCache`: LRU de miniaturas.

Desativar alguém apaga o banco local dessa pessoa.

**Outbox**:

```ts
interface OutboxOp { opId: string; actor: string; deviceId: string;
  collection: CollectionKey; recordId: string; kind: 'upsert'|'delete';
  base: unknown|null; baseVersions: {main:number; fin?:number; cost?:number}; // 0 = novo
  value: unknown|null; createdAt: string; attempts: number;
  state: 'pending'|'sending'|'conflict'|'denied'|'failed'; lastError?: string }
```

- Coalescência: 1 op por `(collection, recordId)`; a nova troca `value` e mantém o `base` original.
- Só vão as ops com `actor = usuário atual`.
- `denied`/`failed`: selo ✕ e cópia de recuperação (Tauri `save_recovery_copy`, `DatabaseContext.tsx:401`; web, download).

**Diff dos `setX`**:
- Provider guarda `lastSeen: Map<id,{ref, json}>` e `confirmed: Map<id,{data,versions}>` por coleção.
- Efeito com debounce de 500 ms (no lugar dos 3 s, `DatabaseContext.tsx:515-529`) chama `diffById(lastSeen, atual)`: referência igual é pulada; diferente passa pelo JSON estável (`stable`, `osEditMerge.ts:58`). Vira upserts e deletes.
- Mudança remota grava estado e `lastSeen` juntos: sem eco.
- `classify` puro barra no cliente mudança plana em chave de dinheiro (lista do `guard_finance`) ou coleção sem permissão do papel (erro de programação: reverte + toast).
- `getMachineName` (`DatabaseContext.tsx:793`) passa a devolver `"<Nome> (<aparelho>)"` para `AuditEvent.machine`.

**Push**: `rpc('sync_push', {ws, groups})`, `security invoker`, SQL dinâmico sobre lista fixa de tabelas. Um `group` = 1 registro (OS manda as 2-3 linhas juntas) em `begin … exception`. `version` diferente: `conflict` com a linha atual. RLS/trigger recusou: `denied` com o código.

**Pull**: `select … where workshop_id=? and updated_at >= cursor - interval '5 s' order by updated_at, id limit 1000`, em laço. A janela de 5 s cobre commits fora de ordem; repetidas descartadas pela `version`. Mecânico não pede `work_order_finance`, `work_order_costs`, `ledger`, `catalog_prices`.

**Realtime**: `postgres_changes` por tabela com filtro `workshop_id=eq.<ws>`, só como sinal: pull daquela tabela com debounce de 300 ms. Pull também ao reconectar e ao focar a janela (`DatabaseContext.tsx:632`).

**Conflito** (`mergeRecord`, puro):
- `workOrders`: `mergeOSEdit({opened: base, edited: value, current: server, drafts: undefined})` (`osEditMerge.ts:86`). Ele não trata status nem checklist (`SCALARS`, `osEditMerge.ts:71-81`): `mergeOSRecord` acrescenta 3 vias em `status` (local vence) e em `checklist` por item `id`. Conflito vence o local e vai para `conflictsMessage`.
- Outras coleções: 3 vias por chave de 1º nível; listas (`vehicles`) comparadas inteiras.
- Servidor apagou e local editou: exclusão vence, com toast (`OS_DELETED_MESSAGE`).
- Servidor igual ao local (ack perdido): op concluída.

**Tombstones**: `deleted_at`, nunca apagado no piloto. Pull remove o registro do estado.

**Dinheiro offline**: `useDatabase().cloud = {role, online, pending, syncState, …}` e `moneyClient.ts` (`supabase.functions.invoke('money')`). Offline: recusa na hora, botões cinza com motivo. Online: 1) envia a op pendente do registro; 2) chama a função com as versões conhecidas; 3) 409: pull e pede para repetir.

**Visão por papel**: `joinWorkOrder` + `access = {canSeePrices, canSeeCosts, canEditItems}` de `src/services/permissions.ts` (`can(role, action)`, puro, testado). O "R$ 0,00" da junção nunca aparece nem é gravado: o splitter não emite finance para quem não tem permissão.

## 5. Auth, PIN e aparelho

**Convite**:
1. Dono, em Config > Usuários, chama `users.invite`.
2. `auth.admin.inviteUserByEmail(email, {redirectTo: <pages>/convite})` + `membership`.
3. A pessoa abre o link, define senha (mín. 8) com `updateUser` e PIN (6 dígitos) com `pin.set` (bcrypt em `member_pins`, `crypt(pin, gen_salt('bf',10))`).
4. No Tauri entra com e-mail e senha (sem deep link).

**Esqueci a senha**: `resetPasswordForEmail(email, {redirectTo: <pages>/nova-senha})`.

**SMTP**: o padrão do Supabase só entrega para membros da organização. **SMTP próprio obrigatório** (seção 8).

**PIN no PC compartilhado: verificado no servidor, sem guardar tokens de outras pessoas.**
- Aparelho autorizado guarda `deviceId` e `deviceSecret` (32 bytes); servidor guarda só o sha256.
- `pin.roster(deviceId, secret)` devolve os cartões (nome, papel), em cache para exibir.
- `pin.unlock(deviceId, secret, userId, pin)` confere: aparelho não revogado e `pc_compartilhado`; membership ativa; PIN sem bloqueio.
  - Erro: `failed++`; 5 erros = `locked`, exige senha. Mais de 20 erros/hora no aparelho suspendem o aparelho até o Dono reautorizar.
  - Acerto: `auth.admin.generateLink({type:'magiclink', email})` (não envia e-mail) devolve `hashed_token`; cliente chama `verifyOtp({type:'magiclink', token_hash})`. Sessão anterior sai com `signOut({scope:'local'})` depois de enviar o outbox dela.
- Dono com TOTP: desafio MFA depois do PIN.

**Superfície de ataque**:
- Com o disco do PC, obtém-se o refresh token de quem está logado (supabase-js grava no localStorage do WebView2), como em qualquer app web. PINs dos outros não ficam no disco.
- Força bruta do PIN só online, só em aparelho autorizado (exige o segredo), com limite no servidor.
- Quem sabe um PIN e tem o PC autorizado entra como aquela pessoa: revogar o aparelho e desativar a pessoa.

**Bloqueio por inatividade**:
- Timer de ponteiro/teclado com `devices.idle_lock_minutes` em cache. Ao bloquear, a sessão continua e aparece "Quem está usando" com a pessoa atual selecionada.
- Online: desbloqueio por `pin.verify`.
- Offline: só a pessoa atual, contra verificador local PBKDF2-SHA256 (600k iterações) gravado no último desbloqueio online; 5 erros, espera a internet. Quebrar esse verificador não dá mais que o token já no disco.
- Celular pessoal: aparelho `pessoal`, sem bloqueio nem PIN.

**Desativação imediata** (`users.deactivate`): `active=false` (RLS nega na hora, `app.role_in` lê a tabela e não um claim); `auth.admin.updateUserById(uid,{ban_duration:'87600h'})`; apaga `member_pins`; broadcast `membership` em `ws:<id>` (tela trava, cache apagado). Recusa desativar o último Dono.

## 6. Adaptadores de plataforma

| invoke (arquivo:linha) | Tauri depois da virada | Web |
|---|---|---|
| `load_database`, `save_database_atomic`, `read_db_meta` (`DatabaseContext.tsx:350,424,470,554,576`) | some com o modo arquivo | — |
| `save_recovery_copy` (`DatabaseContext.tsx:401`) | ops negadas do outbox | download `.json` |
| `backup_pre_migration` (`App.tsx:717`, `DatabaseContext.tsx:276`) | importação (`pre-nuvem`) | importação só no Tauri |
| `export_report` (`ExportModal.tsx:105`) | mantém | `Blob` + `<a download>` |
| `save_pdf`, `default_pdf_folder`, `reveal_in_folder`, `open_folder` (`documentOutput.ts:97,110,151`) | mantém | só imprimir (`PDF_ONLY_INSTALLED`, `documentOutput.ts:15`) |
| `save_photo`, `read_photo`, `trash_photos` (`photoStore.ts:57,129,164,173`) | Storage nos dois | `upload(path, blob, {upsert:false})` via `photoQueue`; `download` para object URL (contagem de uso continua); "lixeira" = nada (objetos ficam) |

`photoStore` recebe o transporte por parâmetro (como `InvokeFn`, `photoStore.ts:8-10`). `dbPath` vira `workshopId`. `imageCompress.ts` e miniatura não mudam.

Rust novo: `save_daily_export(content)` em `backups\nuvem-AAAAMMDD.json`, reaproveitando `write_stamped_file` (`lib.rs:444`) e `backups_to_delete` (`lib.rs:166`), com `cargo test`.

Tauri:
- `csp: null` (`tauri.conf.json`) vira `default-src 'self'; connect-src 'self' https://<ref>.supabase.co wss://<ref>.supabase.co https://www.googleapis.com; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'`. Mesmo CSP em `public/_headers` do Pages.
- `fetch` do WebView2 basta (sem plugin HTTP nem capability nova); Supabase aceita CORS de `tauri.localhost`.
- Conferir se `shell:default` ainda é usado.

## 7. Importação e exportação

**Importação** (só Dono, no Tauri):
1. `parseDatabase` (`DatabaseContext.tsx:142`), `migrate` (`migrations.ts:200`), `backup_pre_migration` (`pre-nuvem`).
2. `prepareForCloud(db)`, puro e idempotente: ids de item únicos; retira derivados de cliente e `profitMargin`; `stripDbSecrets`; `ledgerOwnerIndex` preenche `os_id` a partir de `financialId`, `advances[].entryId`, `advanceEntryId` e `installmentGroupId === installmentConfig.groupId`.
3. `splitDatabase` envia lotes de 500 por `import_rows` (exige Dono e `import_state='vazio'|'importando'`, upsert por id).
4. `import_finish` devolve totais calculados em SQL.

**Conferência**:
- `computeTotals` puro: contagem por coleção, soma do ledger com sinal em centavos, soma de `total` das OS, nº de lançamentos pagos, soma dos adiantamentos. Totais do `prepareForCloud(db)` e do SQL têm de bater.
- Volta completa: pull de tudo, `joinWorkOrder`, `exportV5`, comparação profunda com `prepareForCloud(db)` ignorando `meta`.
- Divergiu: mostra o quê e oferece "apagar e reenviar".

**PCs antigos na virada**:
- Após o envio, o app do Dono regrava o `database.json` sincronizado com os mesmos dados e `meta.schemaVersion = 1000`; a 0.2.0 abre somente leitura (`DatabaseContext.tsx:273`).
- 0.2.0 já aberta em outro PC recebe conflito de `revision` ao salvar e não sobrescreve.
- Reversão: restaurar o backup `pre-nuvem` (v5) e a versão antiga do app.

**Exportação diária**:
- App do Dono, ao abrir, exporta se `workshops.last_export_at` > 20 h.
- `exportV5(estado)`: v5 exato com `meta {schemaVersion:5, revision: uuid, history: [], savedAt, savedBy:'nuvem:<aparelho>'}`.
- Destino: `save_daily_export` + Drive opcional (`googleDrive.ts`, `fetch`, funciona na web).
- Última exportação > 3 dias: aviso em Config.
- `audit_events` vai para `auditoria-AAAAMMDD.json` à parte; `auditLog` v5 segue só com adiantamentos.
- Teste: `exportV5` → `parseDatabase` → `migrate` dá `changed=false`.

## 8. Ordem de implementação

| PR | Conteúdo | Testes | Paralelo |
|---|---|---|---|
| 0 | Spike no projeto do dono: `TZ` na Edge, bundle + `entrypoint`, RLS no `postgres_changes`, `generateLink`+`verifyOtp`, SMTP | relatório | feito: `docs/NUVEM-SPIKE.md` |
| 1 | `src/sync/split.ts` (split/join OS e catálogo, `prepareForCloud`, `ledgerOwnerIndex`, `computeTotals`, `exportV5`) | volta completa com fixture sintética v0 a v5, idempotência, ids repetidos | com o 2 |
| 2 | `supabase/migrations/0001_*.sql`: tabelas, triggers, RLS, `sync_push`, `apply_money_op`, `import_*`, Storage | pgTAP da seção 2 | com o 1 |
| 3 | `diff.ts`, `outbox.ts`, `mergeRecord.ts` (usa `mergeOSEdit`), `permissions.ts` | Vitest puro, inclusive TZ=UTC | depois do 1 |
| 4 | `syncEngine.ts` (transporte injetado), `idb.ts`, `supabaseRepo.ts`, `CloudDatabaseProvider` atrás de flag | motor com 2 aparelhos falsos: offline, conflito, tombstone, ack perdido | depois do 3; com o 5 |
| 5 | Auth: login, convite, nova senha, funções `pin`/`device`/`users`, inatividade, "Quem está usando", controle por papel nas telas | Vitest do bloqueio/PIN local; pgTAP de `member_pins` | `src/auth/*`; `App.tsx` só no fim |
| 6 | `money` (Edge) + `serverEntry.ts` + teste de grafo + `moneyClient` + ramos nos handlers do `App.tsx` + botões offline | `handleMoneyOp(store, req)` com loja em memória; pgTAP de idempotência e versão | depois do 5 |
| 7 | Fotos no Storage + `photoQueue` | `photoStore` com transporte falso | com o 6 |
| 8 | Web/PWA: adaptadores, manifest, CSP, `_headers`, telas de campo | build | com o 7 |
| 9 | Importação, conferência, exportação diária, `save_daily_export` | Vitest + `cargo test` | depois do 4 |
| 10-11 | Piloto e virada | `verificador`, `revisor` | — |
| 12 | Remover o modo arquivo do `DatabaseContext` e comandos Rust sem uso | build e testes | depois da virada |

**Decisões do dono (fechadas em 2026-11-11):**
1. Aceito: trocar de pessoa sem internet não funciona; offline só a pessoa atual continua e desbloqueia.
2. SMTP: Brevo grátis (300/dia, sem domínio). Dono cria a conta e passa os dados SMTP no PR 0.
3. Mecânico: não cria OS, não edita itens, cliente nem veículo da OS. Muda status (sem dinheiro), vistoria, fotos, km. Agenda completa. Clientes: ler e criar (editar dispara cascata em OS e caixa).
4. Lançamento manual no Financeiro só online.
5. Fotos: Config avisa ao chegar a 80% do 1 GB grátis (≈ 3.000 fotos); aí passar ao Pro.

**Riscos técnicos**:
- `TZ` na Edge: se o autoteste falhar no spike, `dates.ts` precisa receber o deslocamento (mudança maior).
- Nº de OS repetido quando dois aparelhos criam OS offline: segue só com a confirmação atual (`App.tsx:234`).
