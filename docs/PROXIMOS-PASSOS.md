# Próximos passos do OficinaPro

## Para que serve este arquivo

Plano vivo das atualizações futuras, discutidas com o dono. Cada item traz o problema, o objetivo, o que o dono já decidiu, como implementar no código atual, os riscos e o estado. Reorganizado em 2026-11-18 (nada das versões anteriores foi descartado: números, tabelas e decisões estão dentro do item correspondente).

**Como usar:**
1. Ao começar uma sessão, leia este arquivo junto com `docs/NUVEM-ESTADO.md` (estado da nuvem e como mudar o programa sem parar a oficina) e o `CLAUDE.md`.
2. Siga a **Ordem recomendada** abaixo. Antes de começar um item, confira as "Pendências / perguntas abertas" dele: o que não foi decidido pelo dono é perguntado antes de editar.
3. Cada item é feito em rodadas pequenas. Cada rodada termina com `npm run build` e `npm test` (e `cargo test` se tocar o Rust, `npm run test:db` se tocar o banco, `node scripts/test-functions.mjs` se tocar as funções).
4. Ao terminar uma rodada, atualize o campo **Estado** do item e a tabela-resumo do fim.
5. Decisão nova do dono: registrar em "Decisões do dono" com a data. Nunca registrar como decidido o que foi só proposto.

## Regra de mudança segura (vale para todos os itens)

Desde 2026-11-18 a oficina usa o modo nuvem (versão 0.3.0) com dados reais: projeto Supabase `stblagzkkffbjuzltfrt`, site `https://andersonmecanica.pages.dev`, PCs com o instalador Tauri. Procedimento completo em `docs/NUVEM-ESTADO.md`, seção "Virada feita em 2026-11-18", parte "Como mudar o programa daqui em diante". Resumo:

1. Mudar e testar sempre contra o projeto de TESTE (`npx vite --mode cloud`, `npm test`, `npm run test:db`, `node scripts/test-functions.mjs`). Nunca rodar nada de teste contra o real.
2. Só tela ou lógica do app: `npm run deploy:web:real` atualiza o site (celulares) na hora; os PCs precisam do instalador novo (`npm run tauri:build:real`, versão nova em `package.json`, `tauri.conf.json` e `Cargo.toml`) instalado em todos.
3. Mudança no banco ou nas funções: migração NOVA em `supabase/migrations/` (nunca editar uma já aplicada), `npx supabase db push --remote` ANTES das funções, funções compatíveis com o app ainda instalado nos PCs, depois o app.
4. Nunca `npx supabase config push` no real; nunca `CORS_ALLOW_LOCALHOST` no real; `scripts/test-db.mjs` recusa o real.

**Cuidados de compatibilidade que se repetem nos itens abaixo** (levantados no código em 2026-11-18):

- **O site atualiza antes dos PCs.** Um celular com a versão nova pode gravar um dado que o PC com a versão antiga não conhece. Regra: primeiro sai uma versão que **tolera** o dado novo (lê, mostra e preserva), instalada em todos os PCs; só depois sai a versão que **grava** o dado novo. Exemplo real: uma categoria nova em `OrderItem.category` quebra a versão atual, porque `DatabaseModal.tsx` (linhas 292 e 460) lê `PART_CATEGORY_META[categoria].color` sem reserva.
- **Campo novo no topo da OS** (`WorkOrder`): `src/sync/split.ts` só manda para `work_orders` (que o Mecânico lê) as chaves da lista `MAIN_KEYS`; o resto vai para `work_order_finance.data.extra` (Dono e Recepção). Campo novo que o Mecânico precisa ver exige entrar em `MAIN_KEYS`, e um PC com a versão antiga, ao salvar, moveria esse campo para `extra`. Por isso, campos novos de OS só são gravados depois que todos os PCs tiverem a versão que os conhece.
- **Campo novo no item** (`OrderItem`): vai junto do item em `work_orders` (só `price` e `cost` são separados). O merge de 2 aparelhos (`src/services/osEditMerge.ts`, `itemsKey`) compara só descrição, preço, custo e categoria: campo novo de item precisa entrar nessa comparação, senão a mudança só nele se perde no merge.
- **Coleções da nuvem** são tabelas `jsonb` (`workshop_id`, `id`, `data`, `version`...). Campo novo dentro de `data` não exige migração SQL, mas pode exigir mudar os guardas (`app.guard_work_orders`, `app.guard_finance`) e as listas de `split.ts`. Coleção nova exige migração (tabela, RLS, gatilhos `b_touch`/`z_audit`, publicação do Realtime) e suporte no motor (`src/sync/types.ts`, `syncEngine.ts`, `split.ts`, `fullPull.ts`, `dailyExport.ts`).
- **Custos** ficam em `work_order_costs` e `catalog_costs`, que só o Dono lê e grava (RLS da migração `20261111120000_nuvem_inicial.sql`). Tudo que calcula a partir do custo (markup, margem, nota do fornecedor) é do Dono, a menos que o dono decida mudar isso.
- **Configurações** (`settings`) são lidas pelos três papéis e gravadas só pelo Dono. Não guardar nelas nada que o Mecânico não deva ver.
- **Banco local:** o modo arquivo ainda existe no código (`CURRENT_SCHEMA_VERSION = 5`, `src/utils/migrations.ts`) e a cópia diária sai no formato v5 (`exportV5`, `dailyExport.ts`). Enquanto o item M1 (remover o modo arquivo) não for feito, mudança de formato também passa pelas migrações locais.

## Ordem recomendada

| Etapa | Item | Por que nesta posição |
|---|---|---|
| 1 | **E. Segurança** (senha do banco, TOTP do Dono, plano Pro) | Decisão do dono: feito primeiro. Os dados reais já estão na nuvem; a senha do banco passou pela conversa; o resto do plano mexe em dinheiro e dados de cliente e precisa da base protegida. Não depende de nada. |
| 2 | **C0. Custo em 100% das peças** + **D1. Claude lê a nota do fornecedor** | O custo é pré-requisito do markup (C) e da calibração. Hoje só 80 peças têm custo em 377 OS do padrão atual. Ler a nota do fornecedor é o jeito de lançar custo sem digitar, por isso D1 vem junto. D1 também monta a função `ia` (chave da Anthropic, limite diário), reaproveitada por D2, D3 e D4. |
| 3 | **C. Markup por faixa, diagnóstico, insumos, garantia, indicadores** | Depende do custo lançado (etapa 2). Antes de mudar preço, a tabela é simulada nas OS reais. É o maior ganho de lucro direto (estimativa do consultor técnico: +4 a 8% sobre o faturamento). |
| 4 | **B Fase 1. Sistemas e base de serviços** + **D2. Claude padroniza o catálogo** | A base de serviços e os ~14 sistemas organizam o orçamento e o catálogo; o catálogo padronizado (523 descrições para ~150) é feito pelo D2 uma vez. F, G e as Fases 2 e 3 de B dependem dos sistemas. Fica depois de C porque C não precisa dela e dá retorno antes. |
| 5 | **A. Fotos abaixo de 100 KB** | Independente; entra aqui porque F manda fotos ao cliente pelo celular (fotos leves abrem rápido no 4G) e porque as fotos do orçamento aumentam o uso do Storage (1 GB no plano grátis). Pode ser antecipada se o espaço apertar. |
| 6 | **F. Orçamento aprovado pelo cliente por link** | Depende dos sistemas (B Fase 1, para agrupar), das fotos leves (A) e da segurança (E). Cria a marca "Cliente não quis" que G e B Fase 3 usam. Primeira página pública do sistema: precisa da base estável. |
| 7 | **G. Lembretes de retorno e aba "Notificações"** | Usa o "Cliente não quis" (F), o histórico por veículo e o consentimento LGPD registrado (que F e G criam). As mensagens prontas podem depois ganhar o D4. |
| 8 | **B Fases 2 e 3** + **D3. Orçamento pelo relato** + **D4. Mensagens ao cliente** | B Fase 2 muda o formato da OS ("serviço" como grupo): passa pelo `arquiteto` e por migração. D3 depende da base de serviços com tempo e coeficiente; D4 aproveita as telas de F e G. |
| 9 | **Menores** (M1 a M5) | Sem dependência forte; entram quando sobrar tempo ou quando o motivo apertar. M4 (atualização automática dos PCs) reduz o trabalho de todas as entregas acima e pode ser antecipado se o dono quiser (ver pendências de M4). |

---

## E. Pendências de segurança

### Concepção

Três pontos ficaram abertos na virada para a nuvem (2026-11-18):
1. A senha do banco real passou pela conversa no dia da virada e está gravada em `.env.real-db.local` (fora do git). Ela só serve para `npx supabase db push --remote`: o app e as funções usam a URL e as chaves de API (`src/server/runtime.ts` lê `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`), então trocar a senha não derruba nada.
2. O sistema já aceita a verificação em 2 etapas (TOTP) do Dono: `verifyMfa` e `mfaPending` em `src/auth/AuthContext.tsx`, `MfaScreen` em `src/auth/LoginScreen.tsx`, `requireOwner` exige `aal2` em `src/server/core.ts`, e `app.require_owner_aal()` (migração `20261118120000_import_aal2.sql`) barra a importação sem `aal2`. Falta a tela para o Dono **cadastrar** o TOTP; sem cadastro, a proteção não liga.
3. Plano do Supabase: no grátis o projeto pausa por inatividade e não há backup diário do banco feito pelo Supabase. Hoje a garantia é só a cópia diária do PC do Dono (`src/sync/dailyExport.ts`, comando Rust `save_daily_export`, 30 cópias em `backups\nuvem\`).

Itens "Já levantados" de origem: 2 (tela do TOTP), 3 (plano Pro) e 6 (senha do banco).

### Objetivo

- Nenhuma senha do banco real em arquivo no PC nem no histórico da conversa válida: senha nova, guardada só em gerenciador de senhas, `.env.real-db.local` apagado.
- Dono com TOTP cadastrado e pedido em todo login dele (100% das entradas do Dono com `aal2`).
- Decisão registrada sobre o plano Pro (sim ou não, com data).

### Decisões do dono

- 2026-11-18: as pendências de segurança são feitas **primeiro**, antes de qualquer outro item.

### Método de implementação

**Rodada E1. Trocar a senha do banco real** (feito pelo dono, guiado pela sessão principal; sem código)
1. Painel do Supabase, projeto `stblagzkkffbjuzltfrt`: Project Settings, Database, "Reset database password". Gerar senha forte.
2. Guardar a senha nova num gerenciador de senhas (nunca colar na conversa).
3. Apagar `.env.real-db.local`. `scout` confere com `git check-ignore` e uma busca que nenhum arquivo do repositório guarda a senha antiga (sem abrir arquivos `.env*`: só nomes e referências).
4. Conferir que o app (site e PC) e as 4 funções seguem funcionando (abrir uma OS, finalizar uma OS de teste não; só abrir e salvar algo neutro).
5. Na próxima migração, `npx supabase db push --remote` pede a senha no terminal; ela não volta para arquivo.

**Rodada E2. Tela para o Dono cadastrar o TOTP** (`dev`; `verificador` no projeto de teste; `revisor`)
1. Lógica pura em `src/auth/mfaView.ts` (estados: sem fator, cadastrando, ativo; textos em pt-BR; validação do código de 6 dígitos) com testes Vitest.
2. Componente `src/components/config/MfaSection.tsx` em Config (só para o Dono, via `useAccess`), ou no menu da conta do `AppTopbar` ao lado de "Trocar PIN" e "Trocar senha" (`src/components/AccountModals.tsx`). Fluxo com supabase-js: `supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName })` mostra o QR (`data.totp.qr_code`, imagem `data:`, já permitida pela CSP em `img-src`) e a chave em texto; o Dono digita o código; `challengeAndVerify` confirma. Mostrar os fatores ativos (`listFactors`) e permitir remover (`unenroll`, exige sessão `aal2`; pedir a senha de novo como `requireRecentPassword`).
3. Texto de recuperação: o TOTP do Supabase não tem códigos de recuperação. Orientar a cadastrar 2 aparelhos (celular do dono e um segundo) ou guardar a chave em texto num lugar seguro. Recuperação extrema: remover o fator no painel (Authentication, Users).
4. Teste completo no projeto de teste com um app autenticador real: cadastrar, sair, entrar (pede o código), PIN e "Quem está usando" num PC compartilhado com o Dono com TOTP, finalizar OS (função `money` com `aal2`), convidar pessoa (função `users`), remover o fator.
5. Entrega: só tela, sem migração. `npm run deploy:web:real` e instalador novo nos PCs.

**Rodada E3. Plano Pro** (decisão do dono; `entregador` registra)
- O que muda (conferir na página de preços do Supabase no dia, os valores mudam): cerca de US$ 25/mês; sem pausa por inatividade; backup diário do banco feito pelo Supabase; mais espaço de banco e de Storage (o grátis tem 1 GB de fotos, ver item A). Recuperação a qualquer instante (PITR) é extra pago.
- Se sim: assinar, conferir o primeiro backup diário no painel e manter a cópia diária do PC do Dono (ela continua sendo a cópia fora do Supabase).
- Se não: manter a cópia diária do PC do Dono e conferir semanalmente que ela foi feita (Config, "Onde ficam os dados").

**Rodada E4 (opcional, `arquiteto`). Exigir `aal2` também na RLS.** Hoje as policies não olham o `aal` (nota em `src/server/core.ts`): com um JWT `aal1` roubado, o Dono ainda lê e grava pelo PostgREST. Fechar exige migração nova nas policies do Dono quando ele tem TOTP. Só se o dono quiser.

### Riscos e cuidados

- Cadastrar o TOTP e perder o celular trava o Dono fora das funções de dinheiro, convite e importação. Por isso o segundo aparelho ou a chave guardada.
- Testar o TOTP só no projeto de teste; no real, o Dono cadastra pela tela já entregue.
- Trocar a senha não afeta o app, mas qualquer script local que use a senha antiga para de funcionar (esperado).
- A senha nunca é colada na conversa nem gravada em arquivo do repositório.

### Resultado esperado

O dono entra com e-mail, senha e o código do celular; ninguém com a senha dele consegue mexer em dinheiro ou convidar pessoas. A senha do banco que vazou na conversa deixa de valer. Fica claro se o Supabase guarda backup diário ou se a garantia é só a cópia do PC.

### Pendências / perguntas abertas

- Plano Pro: sim ou não (decisão do dono).
- Onde a tela do TOTP fica: Config ou menu da conta (decisão de UX, `ux-designer` pode opinar).
- Fazer ou não a rodada E4 (`aal2` na RLS).
- TOTP também para a Recepção? Hoje só o Dono é exigido.

### Estado

**A fazer, primeiro da fila** (2026-11-18). E1 depende só do dono.

---

## C. Markup de peças, diagnóstico, insumos e garantia

Este item inclui o pré-requisito **C0 (custo em 100% das peças)**, feito junto com o **D1** (ver item D).

### Concepção

Pedido do dono (2026-11-18): deixar explícito o markup sobre as peças (logística, garantia, defeitos) e usá-lo também para proteger a mão de obra de pedidos de desconto (o cliente aceita peça cara e reclama de mão de obra cara). Pediu dois consultores (técnico de auto mecânica e marketing/precificação, Opus) e um equilíbrio focado em aumentar o lucro.

**Dados reais (377 OS do padrão atual, sem dados de cliente):** markup de peça medido em só 80 peças com custo informado: mediana 1,86× (metade central 1,15× a 2,80×; ponderado 2,05×). Faturamento: peças 51%, mão de obra 49%.

**Consenso dos dois consultores:** markup escalonado por faixa de custo (maior na peça barata, menor na cara); peça trazida pelo cliente com termo, sem garantia na peça e mão de obra × 1,3 (recusar peça de segurança duvidosa); garantia de 6 meses ou 10.000 km na peça fornecida pela oficina (além dos 90 dias legais); diagnóstico cobrado (1 h × fator do veículo) e abatido se aprovado; desconto nunca sobre o serviço (só 5% no PIX, peça linha econômica ou cortesia); orçamento agrupado por sistema, peça com marca e garantia, serviço dizendo o que inclui; fotos do defeito no orçamento.

**Divergência:** marketing limita peça de prateleira pesquisável (pastilha, disco, filtro, óleo, bateria) a ~1,6× para não ser "pego no flagra"; técnico mantém o ponderado em 1,8 a 1,9× porque peça barata e média pagam retrabalho e busca de peça.

**Equilíbrio proposto:**

| Peça (custo) | Markup |
|---|---|
| até R$ 50 | 2,5× (ganho mínimo R$ 25 por item) |
| R$ 50 a 200 | 2,0× |
| R$ 200 a 600 | 1,8× |
| R$ 600 a 1.500 | 1,6× |
| acima de R$ 1.500 | 1,4× |
| fluidos | 1,9× |
| peça marcada "pesquisável" | teto 1,7× |
| importado/original | teto no preço de balcão da concessionária |

Mais: linha de **insumos** de 3% da mão de obra (mínimo R$ 20, máximo R$ 80); diagnóstico; mão de obra pela fórmula do item B (R$ 210/h; médio 1,3; premium 2,0; vintage 1,8). Ganho estimado pelo consultor técnico: +4 a 8% de lucro sobre o faturamento, sem subir peças caras.

**Para o sistema (proposta dos consultores):** tabela de markup por faixa editável em Configurações e marca "pesquisável" no catálogo; preço sugerido = custo × markup, editável; linhas automáticas de diagnóstico (abatido se aprovado) e insumos; opção "linha econômica / original" por peça; termo de peça do cliente e garantia no orçamento; painel de indicadores (porcentagem de peças com custo, valor-hora efetivo, produtividade, markup ponderado do mês, retrabalho, descontos concedidos, valor recusado com retorno).

**Avisos legais (CDC, levantados pelo marketing):** orçamento discriminado com validade (10 dias); nada executado sem aprovação; peça usada só com autorização escrita; nenhuma âncora falsa de concessionária ou "preço de custo" falso; diagnóstico cobrado só se avisado antes; serviço extra exige nova aprovação; WhatsApp de retorno só com consentimento (LGPD).

**No código hoje:** `OrderItem.cost` opcional (custo vazio ou 0 = não informado; nunca gravar `cost: 0`); custos em `work_order_costs`/`catalog_costs` (só Dono); `src/services/margin.ts` (`computeOSMargin`, `suggestPriceForTarget`, `buildMarginReport` com a lista `UncostedItem` de itens sem custo); `src/services/pricing.ts` (`suggestHistoricalPrice`); garantia fixa de 90 dias em `src/utils/warranty.ts` (`WARRANTY_DAYS`, `WARRANTY_TERM_TEXT`, usada por `printOS.ts` e pelo resumo do cliente).

### Objetivo

- C0: custo informado em 100% das peças das OS novas (medido pela aba Margem do Financeiro).
- C: preço sugerido de toda peça com custo pela tabela de faixas; diagnóstico e insumos lançados automaticamente; garantia de 6 meses ou 10.000 km impressa; painel de indicadores no Financeiro. Meta do consultor: +4 a 8% de lucro sobre o faturamento, conferido comparando 3 meses antes e 3 meses depois.

### Decisões do dono

- 2026-11-18: leu o equilíbrio proposto (tabela, insumos, diagnóstico, peça do cliente × 1,3, garantia 6 meses/10.000 km, indicadores) e disse que **está bom**.
- 2026-11-18: pré-requisito é o custo em 100% das peças; depois, simular a tabela nas OS reais antes de mudar preços.

### Método de implementação

**Rodada C0.1. Medir e mostrar o custo faltando** (`dev`)
- Indicador "Peças com custo: X%" na aba Margem (`src/components/MarginReport.tsx`, `src/services/marginReportView.ts`), a partir de `buildMarginReport` (já lista os itens sem custo). Lista "OS sem custo nas peças" com atalho para abrir a OS. Só Dono.
- Testes: `marginReportView.test.ts`.

**Rodada C0.2. D1 (ler a nota do fornecedor)**: ver item D, rodadas D1.x. É a forma prática de lançar o custo.

**Rodada C1. Simulação nas OS reais** (`dev` escreve um script de leitura; sessão principal roda; sem gravar nada)
- Função pura `src/services/markup.ts`: `markupFor(costCents, opts: { fluid, searchable, original, balcao })`, `suggestPartPrice(costCents, table)`, tabela padrão `DEFAULT_MARKUP_TABLE` com as faixas acima, dinheiro em centavos (`Money`), ganho mínimo de R$ 25 na faixa até R$ 50. Testes Vitest de cada faixa e dos limites.
- Script de simulação (somente leitura, só descrição, custo, preço e categoria do veículo, sem dados de cliente) sobre as OS do padrão atual com custo: quanto cada OS teria custado ao cliente e o lucro. Ignorar OS com "TOTAL PEÇAS". Relatório para o dono antes de ligar a sugestão.

**Rodada C2. Tabela e marcas no catálogo** (`arquiteto` revisa o formato; `dev`)
- `WorkshopSettings.markupTable?` (faixas em centavos e multiplicadores) e `WorkshopSettings.suppliesRule?` (3%, mínimo R$ 20, máximo R$ 80). Campos opcionais dentro de `settings.data`: sem migração SQL. Atenção: `settings` é lida pelo Mecânico; a tabela de markup não revela o custo de nenhuma peça, mas o dono deve concordar (pendência).
- `CatalogItem.searchable?: true` e `CatalogItem.line?: 'ECONOMICA' | 'ORIGINAL'`: entram em `CatalogMain` de `split.ts` (`splitCatalogItem`/`joinCatalogItem` hoje só levam `description` e `category`, então campo novo precisa ser acrescentado ali).
- Tela em Configurações (só Dono) para editar a tabela, com reajuste em lote.

**Rodada C3. Preço sugerido na OS** (`dev`; `verificador`)
- Na janela da OS (`src/modals/OSModal.tsx`), ao informar o custo de uma peça, mostrar "Sugerido: R$ X (markup 2,0×)" ao lado do preço, editável, com o histórico de `suggestHistoricalPrice` ao lado. Só Dono (a Recepção não vê custo: ver pendências).
- Fluidos: identificar pela categoria "Fluidos e filtros" (B Fase 1) ou por marca no catálogo; até lá, marca manual.

**Rodada C4. Diagnóstico, insumos e peça do cliente** (`arquiteto` define os campos; `dev`)
- Linhas automáticas: "Diagnóstico" (1 h × fator do veículo, com a fórmula do item B) com a opção "abater se aprovado"; "Insumos" = 3% da mão de obra (mín. R$ 20, máx. R$ 80). Marcar as linhas automáticas no item (`OrderItem.auto?: 'DIAGNOSTICO' | 'INSUMOS'`) para recalcular sem duplicar.
- Peça trazida pelo cliente: `OrderItem.supplier?: 'CLIENTE'`; mão de obra do mesmo serviço × 1,3; sem garantia na peça; termo impresso.
- Campos novos de item: entrar em `itemsKey` de `osEditMerge.ts` e só serem gravados depois de todos os PCs com a versão que os conhece (regra de compatibilidade do topo).
- Funções de dinheiro: o total da OS continua calculado por `calculateFinancials` (`src/utils/helpers.ts`, reexportado em `serverEntry.ts` para a função `money`); as linhas novas são itens comuns com preço, então o total não muda de regra.

**Rodada C5. Garantia e textos do orçamento** (`dev`; impressão com snapshots)
- `src/utils/warranty.ts`: garantia de 6 meses ou 10.000 km (o que vier primeiro) na peça fornecida pela oficina; 90 dias legais no serviço; sem garantia na peça do cliente. Atualizar `printOS.ts`, `printServiceSummary.ts`, `serviceSummary.ts` e os snapshots.
- Validade do orçamento de 10 dias impressa (aviso legal do CDC).

**Rodada C6. Indicadores** (`dev`; `ui-dev` para o visual; `verificador`)
- Aba Margem: porcentagem de peças com custo, valor-hora efetivo, markup ponderado do mês, descontos concedidos, valor recusado com retorno (depende de F/G), retrabalho e produtividade (pendência: como medir).

Impacto: C2 a C6 são tela e lógica (site na hora, instalador nos PCs); nenhuma migração SQL prevista, só campos opcionais em `jsonb`. Se o formato local mudar, avaliar passo novo em `migrations.ts` (ou fazer M1 antes).

### Riscos e cuidados

- Preço sugerido só aparece com custo informado; nunca gravar `cost: 0`.
- A Recepção não lê custo (RLS de `work_order_costs`/`catalog_costs`): a sugestão por markup, como está, é só do Dono.
- Simular antes de ligar: a tabela muda o preço ao cliente.
- CDC: nada de "preço de custo" falso nem âncora de concessionária inventada; diagnóstico só cobrado se avisado antes.
- Campos novos de item e de catálogo seguem a regra "tolerar antes de gravar".

### Resultado esperado

Ao lançar o custo de uma peça, o programa já sugere o preço certo pela faixa; diagnóstico e insumos entram sozinhos; o orçamento sai com garantia de 6 meses/10.000 km; o dono vê no Financeiro quanto das peças tem custo e qual o markup real do mês.

### Pendências / perguntas abertas

- Quem lança custo e vê o preço sugerido: só o Dono (como hoje) ou liberar a Recepção (exige mudar a RLS de custos, migração)?
- A tabela de markup pode ficar em `settings` (lida pelo Mecânico)? Alternativa: tabela própria só do Dono.
- Peças "pesquisáveis": quais exatamente (sugestão dos consultores: pastilha, disco, filtro, óleo, bateria).
- Desconto de 5% no PIX: o dono confirma essa regra e se o programa deve oferecer o botão?
- Diagnóstico: valor fixo de 1 h × fator, abatido sempre que aprovado ou só acima de um valor?
- Como medir retrabalho e produtividade (não há esse dado hoje).

### Estado

**Aprovado em princípio** (dono, 2026-11-18). C0 a fazer junto com D1. Nada implementado.

---

## D. Claude (IA) integrado ao programa

### Concepção

Pedido do dono (2026-11-18): usar o próprio Claude em alguma função do programa para melhorar algo.

**Arquitetura proposta:** função nova no Supabase (como a `money`), chave `ANTHROPIC_API_KEY` só como segredo do servidor (nunca no app nem no celular), uso só para Dono e Recepção com limite diário, envio do mínimo de dados (sem nome nem telefone de cliente), resposta sempre como sugestão confirmada por uma pessoa. SDK oficial `@anthropic-ai/sdk`; modelo padrão `claude-opus-5-5` (US$ 4 / US$ 20 por milhão de tokens de entrada/saída; Sonnet 5.5 e Haiku 5.5 são mais baratos, decisão do dono); saída estruturada (`output_config.format`) para dados que vão para a OS.

**Usos, em ordem de valor:**
1. **Ler nota ou orçamento do fornecedor** (foto ou PDF) e lançar peças com código, quantidade e custo na OS. Resolve a falta de custo nas peças (80 em 377 OS), pré-requisito do item C.
2. **Padronizar o catálogo** (uma vez): 523 descrições para ~150 nomes padrão com sistema; o dono revisa antes de aplicar. Acelera a Fase 1 do item B.
3. **Montar o orçamento a partir do relato** (texto ou voz + vistoria): sugere serviços da base com tempo e coeficiente; o mecânico confirma.
4. **Mensagem ao cliente** em linguagem simples (resumo, WhatsApp, lembrete do "cliente não quis").
5. **Perguntas sobre o negócio** em português (mais tarde).

Não fazer: diagnóstico automático por foto do carro (risco alto; no máximo apoio).

**Custo estimado:** centavos de real por nota lida; R$ 10 a 50/mês no volume atual. **Cuidados:** LGPD (dados passam pela Anthropic; não enviar dados pessoais de cliente); chave da API em conta própria da Anthropic (console.anthropic.com), cobrada à parte.

### Objetivo

- D1: custo de peça lançado a partir da nota em menos de 1 minuto por nota, com conferência humana; contribui para os 100% de custo do C0.
- D2: catálogo de peças de 523 descrições para ~150 nomes padronizados, cada um com sistema.
- D3: orçamento inicial sugerido a partir do relato, confirmado pelo mecânico.
- D4: mensagem pronta e simples para o cliente nas telas de F e G.
- Custo mensal dentro de R$ 10 a 50 no volume atual, com limite diário que impede surpresa.

### Decisões do dono

- 2026-11-18: usos 1 a 4 **aprovados**; o uso 5 fica para depois.
- Ordem de implementação sugerida (registrada em 2026-11-18): 1 (nota do fornecedor, destrava custo e markup), 2 (catálogo padronizado, junto da Fase 1 do item B), 3 (orçamento pelo relato, depende da base de serviços do item B), 4 (mensagens ao cliente).
- Escolha do modelo (Opus, Sonnet ou Haiku) é decisão do dono: ainda não tomada.

### Método de implementação

**Antes de começar (dono):** criar a conta e a chave da API na Anthropic; a chave vai como segredo do Supabase real (`ANTHROPIC_API_KEY`) e, para testes, uma chave separada no projeto de teste. Nunca no app nem em arquivo do repositório.

**Rodada D0. Função `ia` e limite diário** (`arquiteto` desenha; `dev` implementa; `revisor` com olhar de segurança)
- Lógica em `src/server/aiHandler.ts` (testada com Vitest, padrão de `moneyHandler.ts`), entrada fina `supabase/functions/ia/index.ts` gerada em `bundle.js` por `scripts/build-functions.mjs`, bloco `[functions.ia]` com `verify_jwt = false` em `supabase/config.toml` (a função valida o JWT sozinha com `authenticate` de `src/server/core.ts`, como as outras). Lembrar que no real não se roda `config push`: implantar com `npx supabase functions deploy ia` e conferir a opção de JWT no deploy.
- Papéis: Dono e Recepção (`authenticate` + papel da membership); Mecânico recusado.
- Limite diário por oficina: migração nova com tabela `ai_usage` (oficina, dia, contagem, tokens), só service role, sem policy (padrão de `money_ops`). Resposta 429 com texto em pt-BR quando passar do limite.
- Chamada à API com o SDK oficial; saída estruturada com esquema por uso. O texto do pedido nunca leva nome, telefone nem placa do cliente.
- CORS: as origens de `SITE_URL`/`CORS_ORIGINS` (`src/server/http.ts`); a CSP do app não muda, porque o app fala com a função no Supabase, não com a Anthropic.
- Testes: `aiHandler.test.ts` com cliente da Anthropic falso; `scripts/test-functions.mjs` ganha casos da função no projeto de teste.

**Rodada D1.1. Ler nota do fornecedor (servidor)** (`dev`)
- Entrada: foto (JPEG, reduzida com `imageCompress.ts`) ou PDF da nota/orçamento do fornecedor. Saída: lista `{ codigo?, descricao, quantidade, custoUnitarioCentavos }`. A nota é do fornecedor para a oficina: não contém dado do cliente final.
- Validação no servidor do formato da resposta (centavos inteiros, quantidade positiva).

**Rodada D1.2. Ler nota do fornecedor (tela)** (`dev`; `ui-dev` para o visual; `verificador`)
- Botão "Ler nota do fornecedor" na parte de Peças da janela da OS (`OSModal.tsx`): escolhe o arquivo, mostra uma tabela de conferência (cada linha com caixa de marcar, descrição, quantidade, custo), liga cada linha ao catálogo pela normalização de `src/utils/links.ts` (`normalizeName`, `linkCatalogItems`) e acrescenta as peças marcadas com o custo.
- Custo: só o Dono grava custo hoje (RLS). Se a Recepção também for usar, decidir antes (pendência de C).
- Funciona só com internet (`OnlineOnlyButton`).

**Rodada D2. Padronizar o catálogo** (`dev`; sessão principal aplica com o dono)
- Executado uma vez pelo Dono numa tela de Config: envia só as descrições do catálogo e das OS (sem cliente), recebe a proposta de junção (nome padrão + sistema da B Fase 1 + quais descrições juntar).
- Tela de revisão: o dono aprova ou corrige cada junção antes de aplicar. Aplicar usa `src/services/cascadeService.ts` (propaga renomeação por id) e marca a categoria. Dados reais: cópia diária feita antes, e aplicação em lotes.
- Juntas a considerar (levantamento de 2026-11-18): "FILTRO ÓLEO" / "FILTRO ÓLEO MOTOR" / "ÓLEO MOTOR E FILTRO"; "FLUIDO RADIADOR" / "ADITIVO RADIADOR"; "VELAS" / "VELAS IGNIÇÃO"; três nomes de fluido de freio.

**Rodada D3. Orçamento pelo relato** (depois de B Fase 2; `dev`)
- Entrada: relato (texto; voz pelo teclado do celular) e itens da vistoria marcados "Necessita trocar"/"Urgente!". Saída: serviços da base (id, tempo, coeficiente) sugeridos; o mecânico marca quais entram.

**Rodada D4. Mensagens ao cliente** (com F e G; `dev`)
- Texto curto em linguagem simples para resumo, WhatsApp e lembrete do "cliente não quis". Envia só serviços e situação, sem nome; o nome entra no app, depois da resposta, por substituição local.

Impacto: D0 tem migração (tabela `ai_usage`) e função nova: migração no real antes da função; app novo depois. Os PCs só ganham os botões com o instalador novo; o site, na hora.

### Riscos e cuidados

- LGPD: os dados passam pela Anthropic. Nunca enviar nome, telefone, placa ou endereço de cliente. Registrar isso no aviso de privacidade (ver G).
- Resposta é sempre sugestão: nada entra na OS sem uma pessoa confirmar.
- Custo descontrolado: limite diário no servidor e contagem de tokens.
- A chave da API nunca sai do servidor.
- Erro de leitura de nota (custo errado) afeta o markup: a tela de conferência mostra a foto ao lado.

### Resultado esperado

O dono fotografa a nota do fornecedor e as peças entram na OS com o custo; o catálogo fica limpo, com nomes padronizados por sistema; depois, o orçamento já vem sugerido a partir do relato e as mensagens ao cliente saem prontas.

### Pendências / perguntas abertas

- Conta e chave da API da Anthropic do dono (antes da rodada D0).
- Modelo: Opus 5.5, Sonnet 5.5 ou Haiku 5.5 (decisão do dono; pode ser um por uso).
- Limite diário: quantas leituras por dia.
- Quem usa D1: só Dono (custo) ou também Recepção (exige decisão de C sobre custos).

### Estado

**Planejado** (dono, 2026-11-18): usos 1 a 4 aprovados. Nada implementado. D1 vem na etapa 2 da Ordem recomendada.

---

## B. Serviços organizados por sistema, com base pronta

### Concepção

Pedido do dono (2026-11-18): partir de uma base maior de categorias (mantendo criar sob demanda) e categorizar os serviços (disco de freio, cabeçote, fluido de freio, filtro da cabine...). Hoje peças, serviços e mão de obra parecem "uma grande lista sendo adicionada".

**Hoje no código:** a OS tem duas listas soltas (`parts`, `services`) de `OrderItem` com `category?` opcional entre 8 fixas (`PartCategory` e `PART_CATEGORY_META` em `src/types.ts`: Motor, Freio, Suspensão, Elétrica, Transmissão, Ar-condicionado, Carroceria, Outros). Mão de obra é uma linha de serviço; nada liga a peça à mão de obra do mesmo trabalho. Seletor em `src/components/PartCategorySelect.tsx`; catálogo em `catalog_parts`/`catalog_services` (nuvem) com `description` e `category`.

**Proposta inicial (consultoria, padrão oficina premium):**
1. Orçamento em três níveis: Sistema, Serviço e itens (peças, mão de obra, insumos). O cliente aprova o serviço; impressão e resumo agrupados por sistema com subtotal por serviço.
2. Base pronta editável: ~14 sistemas (Motor, Arrefecimento, Alimentação/injeção, Ignição, Embreagem/câmbio, Suspensão, Direção, Freios, Elétrica/bateria, Ar-condicionado, Escapamento, Pneus/rodas/alinhamento, Fluidos e filtros, Diagnóstico) e ~150 operações padrão com peças típicas e tempo de mão de obra sugerido; a oficina edita, desliga e cria as suas.
3. Mão de obra por tempo: valor da hora configurável × tempo-padrão do serviço, com ajuste livre.
4. Pacotes prontos (ex.: "Revisão 10.000 km").
5. Ponte com a vistoria: item "precisa trocar" vira serviço sugerido.
6. Prioridade por serviço (Urgente / Recomendado / Pode esperar), aprovação ou recusa por serviço, e o recusado vira lembrete na próxima visita.
7. Histórico por sistema do veículo e lembrete de manutenção.

Fases sugeridas na proposta inicial: Fase 1 (sem mudar a estrutura da OS): ampliar as 8 categorias para os ~14 sistemas, categorizar o catálogo, OS e impressão agrupadas por sistema. Fase 2 (muda o formato dos dados; passa pelo `arquiteto` e por migração na nuvem): "serviço" como grupo dentro da OS, mão de obra por tempo, pacotes. Fase 3: prioridade e aprovação por serviço, ponte com a vistoria, lembretes e histórico por sistema.

**Levantamento das peças nas 1096 OS reais (2026-11-18, só descrições e preços, sem dados de cliente):** 2.201 itens de peça, 523 descrições distintas.
- **706 itens são "TOTAL PEÇAS"** (uma linha com o valor somado, mediana R$ 780): nessas OS não se sabe o que foi trocado; o histórico delas não serve para calibrar.
- **Nomes duplicados** para a mesma peça (ex.: "FILTRO ÓLEO" / "FILTRO ÓLEO MOTOR" / "ÓLEO MOTOR E FILTRO"; "FLUIDO RADIADOR" / "ADITIVO RADIADOR"; "VELAS" / "VELAS IGNIÇÃO"; três nomes de fluido de freio): as 523 cairiam para ~150 padronizadas.
- **Mais usados por sistema (somando nomes parecidos):** Freios: pastilhas 64, discos 20, fluido ~34. Suspensão: amortecedores ~40, bieletas ~34, mancal da barra 12, pivô 10, buchas ~14. Fluidos e filtros: óleo ~49, filtro de combustível 32, de óleo ~28, de ar 23, cabine 6, óleo de câmbio 13. Arrefecimento: aditivo/fluido ~50, água desmineralizada ~21, bomba d'água 15, termostática 14, radiador 10. Ignição: velas ~37, cabos 14, bobina 10. Injeção: descarbonizante 21, TBI 14, bomba de combustível 14, injetores ~20, bicos ~11, sonda 6. Motor: correias ~26, coxins ~23, juntas ~23, correia dentada 5. Direção e rodas: alinhamento ~22, terminal 7, rolamento 10. Embreagem e câmbio: embreagem 8, coifas ~13. Elétrica: motor de partida ~13.

**Consequências para a Fase 1:**
1. A base de serviços sai destes números: ~40 serviços cobrem a grande maioria das OS.
2. Padronizar o catálogo antes (juntar nomes duplicados num item só, já com o sistema): o Claude propõe a lista de junções e o dono aprova antes de aplicar (dados reais). É o uso D2.
3. ~~OS nova deve detalhar as peças~~: o dono confirmou (2026-11-18) que "TOTAL PEÇAS" é um padrão antigo, já abandonado; as OS atuais detalham as peças. Na calibração e nas análises, **ignorar as OS com "TOTAL PEÇAS"**; não precisa travar nada na tela.

#### Mão de obra: histórico da discussão e números (2026-11-18)

**Primeira resposta do dono:** mão de obra por valor fixo, conforme modelo e ano do carro. Saiu a hora técnica da proposta 3 e entrou o **preço sugerido por serviço e por veículo**: ao pôr um serviço na OS, sugerir pelo histórico do mesmo serviço em carro do mesmo modelo e ano próximo; sem histórico, mesma marca ou porte; por fim, qualquer carro. Valor sempre editável. Evolui o `suggestHistoricalPrice` (`src/services/pricing.ts`, mediana com mínimo de 3 vendas em 12 meses), que hoje não considera o veículo; o veículo vem de `vehicleCatalog`/`vehicleField` (marca e modelo da FIPE).

**Depois, pela tabela do dono:** em vez de só o histórico, o dono quer automatizar o valor da mão de obra com a **tabela própria** que já usava (tipo de custo de mão de obra por serviço, inspirada em tempários nacionais e internacionais). Desenho provável: cada serviço da base guarda o seu tipo de custo; cada veículo da OS cai numa categoria (marca e modelo da FIPE + faixa de ano); valor sugerido = tabela(tipo de custo, categoria do veículo), sempre editável; tabela editável em Configurações com reajuste em lote (ex.: +8%). O histórico de vendas (`pricing.ts`) fica como conferência ao lado do valor sugerido.

**A tabela antiga se perdeu; a lógica dela (dono):** `valor da mão de obra = valor-hora base × tempo do serviço (h) × coeficiente do tipo de serviço (0,5 a 1,5)`. Proposta para reconstruir:
- **Valor-hora base** único da oficina, em Configurações.
- Cada serviço da base pronta guarda **tempo (h)** e **coeficiente** (0,5 simples/rápido, 1,0 padrão, 1,5 complexo/alto risco).
- **Fator do veículo opcional** (ex.: popular 1,0, médio 1,15, premium/importado 1,3), pela marca e modelo da FIPE, trocável na OS; sem ele a conta fica igual à tabela antiga.
- Base inicial de ~150 serviços com tempo e coeficiente **sugeridos** (estimativas de tempário para o dono calibrar, não valores definitivos).
- **Calibração pelo histórico real:** comparar a fórmula com o que a oficina já cobrou (1096 OS na nuvem) e mostrar o valor-hora praticado por serviço, apontando onde a tabela está acima ou abaixo.
- Na OS, valor sugerido pela fórmula, sempre editável, com o histórico ao lado; arredondamento configurável (depois o dono decidiu: sem arredondamento).

**Primeiras decisões sobre o fator e o arredondamento (dono):**
- Fator do veículo: sim, com 4 categorias: Popular 1,0; Médio 1,15; Premium/importado 1,3; Vintage 1,5 (pedido do dono; trabalho mais lento, peças difíceis, risco maior). Valores iniciais, editáveis. (Depois substituídos pela proposta calibrada, abaixo.)
- **Sem arredondamento.**
- Valor-hora base: calcular para oficina no Brooklin/Chácara Santo Antônio (SP), aluguel R$ 5.000 + outros fixos ~R$ 1.000/mês, margem-alvo 50 a 70% com a mão de obra inclusa.

**Cálculo 1 do valor-hora (premissas genéricas):** 132 h faturáveis por mecânico/mês (22 dias × 8 h × 75%); custo do mecânico com encargos ~R$ 4.500/mês (≈ R$ 34 por hora faturável); preço = custo ÷ (1 − margem).

| | Custo/h | Margem 50% | 60% | 70% |
|---|---|---|---|---|
| 1 mecânico | ~R$ 80 | R$ 160 | R$ 200 | R$ 265 |
| 2 mecânicos | ~R$ 57 | R$ 115 | R$ 140 | R$ 190 |

Recomendação 1: R$ 180/h (dentro da faixa de 50 a 70% nos dois cenários; perfil premium da região). Sem fonte pública atual e confiável de hora técnica em SP (pesquisa de 2026-11-18): o número final sai da calibração pelo histórico das 1096 OS. Substituída pela recomendação 2 (feita depois de saber o pessoal).

**Pessoal (dono):** 2 mecânicos; um contratado a R$ 1.700 + R$ 300 de vale-transporte; o outro fica com o lucro (não entra no custo). Custo mensal: R$ 6.000 fixos + R$ 2.000 = **R$ 8.000/mês**. Margem = sobra ÷ preço.

| Tempo produtivo | Horas cobráveis/mês | Custo/h | Margem 50% | 60% | 70% |
|---|---|---|---|---|---|
| 75% | 264 h | R$ 30 | R$ 61 | R$ 76 | R$ 101 |
| 60% | 211 h | R$ 38 | R$ 76 | R$ 95 | R$ 126 |

Recomendação 2: R$ 120/h (≈ 70% de margem no cenário realista). Com os fatores iniciais: Popular R$ 120, Médio R$ 138, Premium/importado R$ 156, Vintage R$ 180 por hora de coeficiente 1,0. Se o mecânico for CLT (FGTS, 13º, férias, ~R$ 800/mês a mais), o custo/h vai a R$ 34 a 42 e R$ 120 fica perto de 65 a 70%. É o mínimo para a margem, não o preço da região.

**Simulação com 24 OS reais finalizadas (só serviços e veículo, sem dados de cliente):** as OS lançam a mão de obra como uma linha genérica "MÃO DE OBRA", então o tempo de cada trabalho foi **estimado** pelas peças trocadas (padrão de tempário). Fórmula com R$ 120/h: total **R$ 7.851**; cobrado de fato: **R$ 16.185** (≈ 2,06×).
- Valor-hora praticado de fato ≈ **R$ 250/h** (R$ 120 é o mínimo para cobrir custos com 70% de margem, não o preço praticado).
- Por categoria (cobrado ÷ fórmula): Popular ≈ 2,3×; Médio ≈ 1,7×; Premium ≈ 2,7× (troca de óleo de Volvo 4,8×). O fator premium real fica perto de 1,6 a 2,0; popular e médio irregulares (parte é erro da estimativa de tempo).
- Recomendação 3 (substituída pela calibração ampliada): valor-hora base R$ 200 a 250; fatores Popular 1,0, Médio 1,1, Premium/importado 1,7, Vintage 1,8.

**Calibração ampliada, só OS do padrão atual:** de 1.080 finalizadas, ignoradas 703 com "TOTAL PEÇAS", 20 sem mão de obra e 207 com peça sem tempo conhecido; sobraram **150 OS**. Valor-hora praticado (mão de obra ÷ tempo estimado, coeficiente 1,0):

| Categoria | OS | Mediana | Metade central |
|---|---|---|---|
| Todas | 150 | R$ 260 | R$ 150 a 429 |
| Popular | 74 | R$ 208 | R$ 135 a 375 |
| Médio | 57 | R$ 267 | R$ 167 a 400 |
| Premium | 17 | R$ 429 | R$ 330 a 700 |
| Vintage | 2 | R$ 214 | insuficiente |

A ordem ficou coerente (popular < médio < premium) e dá os fatores **Médio ≈ 1,3** e **Premium ≈ 2,0**. A variação dentro de cada categoria segue grande (tempos estimados, coeficiente não aplicado, preço negociado por serviço).

**Proposta calibrada (vigente):** base **R$ 210/h** (Popular 1,0); Médio 1,3 (R$ 273); Premium/importado 2,0 (R$ 420); Vintage 1,8 provisório (R$ 378). Acerta a mediana de cada categoria; a precisão por OS vem depois, com serviços com nome (Fase 1) e coeficiente medido por serviço. A calibração confiável exige **serviços com nome** em vez de "MÃO DE OBRA" (Fase 1), para o app calcular o valor-hora real por serviço e categoria de veículo.

### Objetivo

- Fase 1: todo item de OS nova com sistema; catálogo com ~150 nomes padronizados (de 523); ~40 serviços na base cobrindo a maioria das OS; OS, impressão e resumo ao cliente agrupados por sistema.
- Fase 2: "serviço" como grupo dentro da OS e mão de obra sugerida pela fórmula (base × tempo × coeficiente × fator do veículo) em 100% dos serviços da base.
- Fase 3: "Cliente não quis" aparecendo na próxima visita do mesmo veículo; histórico por sistema do veículo.
- Calibração refeita depois de 3 meses com serviços com nome: valor-hora praticado por serviço e categoria.

### Decisões do dono

- 2026-11-18: aprovou a ideia (base maior de categorias, criar sob demanda, organizar por sistema).
- 2026-11-18: **aprovação quase sempre inteira; às vezes o cliente tira partes.** Sai a prioridade em três níveis (proposta 6). Entra um botão por serviço, **"Cliente não quis"**: sai do total, fica registrado e aparece como pendente na próxima visita do mesmo veículo.
- 2026-11-18: **sistemas:** os ~14 bastam (sem diesel, híbridos nem funilaria). Mapeamento das 8 categorias atuais: Motor, Freios, Suspensão, Ar-condicionado e Outros iguais; Elétrica vira "Elétrica e bateria"; Transmissão vira "Embreagem e câmbio"; Carroceria vira "Carroceria e acessórios" (preserva o que já foi categorizado).
- 2026-11-18: mão de obra pela lógica da tabela antiga do dono: `valor-hora base × tempo (h) × coeficiente (0,5 a 1,5)`, com fator do veículo de 4 categorias (Popular, Médio, Premium/importado, Vintage), **sem arredondamento**, sempre editável, histórico ao lado.
- 2026-11-18: valores da proposta calibrada: base **R$ 210/h**, Popular 1,0, Médio 1,3, Premium 2,0, Vintage 1,8 (provisório), calibrados em 150 OS (registrado como aprovado no resumo da conversa de 2026-11-18; ver Pendências).
- 2026-11-18: "TOTAL PEÇAS" é padrão antigo: ignorar na calibração e nas análises; nada travado na tela.
- **Fases revisadas (2026-11-18):**
  - Fase 1 (sem mudar a estrutura da OS): os ~14 sistemas com o mapeamento acima; base de operações padrão no catálogo (editável e criável sob demanda); OS, impressão e resumo ao cliente agrupados por sistema.
  - Fase 2 (muda o formato; `arquiteto` + migração na nuvem): "serviço" como grupo dentro da OS (peças e mão de obra do mesmo trabalho juntas), pacotes prontos, preço sugerido por serviço e veículo.
  - Fase 3: "Cliente não quis" com pendência na próxima visita, ponte com a vistoria e histórico por sistema do veículo.

### Método de implementação

**Fase 1 (etapa 4 da Ordem recomendada, junto com D2)**

Rodada B1.1. Tolerar categorias novas (`dev`; entrega só aos PCs antes de qualquer gravação)
- `src/types.ts`: função `categoryMeta(cat)` com reserva "Outros" para valor desconhecido; usar em `PartCategorySelect.tsx` e `DatabaseModal.tsx` (linhas 292 e 460 hoje leem `PART_CATEGORY_META[...]` direto) e na impressão.
- Entregar esta versão em todos os PCs antes da B1.2 (regra "tolerar antes de gravar").

Rodada B1.2. Os ~14 sistemas (`dev`; `ui-dev` para cores e ícones)
- Manter os ids atuais (sem migração de dados) e mudar só os rótulos: `FREIO` "Freios", `ELETRICA` "Elétrica e bateria", `TRANSMISSAO` "Embreagem e câmbio", `CARROCERIA` "Carroceria e acessórios". Acrescentar ids novos: `ARREFECIMENTO`, `ALIMENTACAO` (Alimentação/injeção), `IGNICAO`, `DIRECAO`, `ESCAPAMENTO`, `PNEUS` (Pneus/rodas/alinhamento), `FLUIDOS` (Fluidos e filtros), `DIAGNOSTICO`. Ficam 14 sistemas mais "Carroceria e acessórios" e "Outros".
- A nuvem não valida a categoria (é texto dentro do `jsonb`): sem migração SQL.
- Testes: `PartCategorySelect`, impressão com snapshots.

Rodada B1.3. Catálogo padronizado (D2) e base de serviços (`dev`; dono revisa)
- D2 propõe as junções; o dono aprova; aplicar com `cascadeService.ts`.
- Base inicial de ~40 serviços (dos números do levantamento), cada um com sistema; depois ampliar até ~150. Na Fase 1 a base vive no catálogo de serviços (`catalogServices`) com `category`; tempo e coeficiente entram na Fase 2.

Rodada B1.4. OS, impressão e resumo agrupados por sistema (`dev`; `ui-dev`; `verificador`)
- Função pura `groupItemsBySystem(parts, services)` em `src/services/serviceSummary.ts` (ou arquivo novo `systems.ts`), usada por `OSModal.tsx`, `printOS.ts`, `printServiceSummary.ts`, `serviceSummaryView.ts` e `ClientSummaryModal`. Subtotal por sistema. Item sem sistema cai em "Outros".
- Snapshots de impressão atualizados.

Impacto da Fase 1: só tela e lógica; site na hora, instalador nos PCs (B1.1 antes de B1.2).

**Fase 2 (etapa 8; `arquiteto` obrigatório, aprovação do dono antes do `dev`)**
- Formato novo: grupo "serviço" dentro da OS, por exemplo `WorkOrder.jobs?: { id, catalogServiceId?, system, title, hours?, coefficient?, vehicleFactor?, itemIds[] }[]`, com peças e mão de obra ligadas ao grupo. A definir pelo `arquiteto`, considerando: `MAIN_KEYS` e `fin.prices` de `split.ts` (o grupo não pode levar preço para `work_orders`, que o Mecânico lê), `joinWorkOrder` (devolve `null` se os ids dos itens não batem com `fin.prices`), `itemsKey`/`mergeOSEdit` em `osEditMerge.ts`, `checkOSShape` da função `money`, `ensureUniqueItemIds`.
- Configurações: `WorkshopSettings.laborRate?` (centavos/h, padrão R$ 210), `vehicleFactors?` (Popular 1,0, Médio 1,3, Premium 2,0, Vintage 1,8). Catálogo de serviços com `hours?` e `coefficient?` (entram em `CatalogMain` de `split.ts`).
- Categoria do veículo: função pura em `src/services/vehicleTier.ts` a partir da marca/modelo da FIPE (`vehicleCatalog.ts`, `vehicleInfo.ts`) e do ano, trocável na OS.
- Fórmula pura `laborPrice(rate, hours, coef, factor)` em centavos, sem arredondamento além do centavo; `suggestHistoricalPrice` evolui para filtrar por serviço e veículo e fica ao lado como conferência.
- Pacotes prontos (ex.: "Revisão 10.000 km").
- Migração local (`migrations.ts`, v6) se M1 ainda não tiver sido feito; na nuvem, campos novos em `jsonb` e possível ajuste nos guardas.
- Entrega em duas versões: primeiro a que tolera `jobs`, em todos os PCs; depois a que grava.

**Fase 3 (etapa 8)**
- "Cliente não quis": a marca nasce no item F (`OrderItem.declined?`); aqui ela passa a valer por serviço (grupo) e aparece na próxima OS do mesmo veículo (`vehicleId`) com "Pendente da última visita".
- Ponte com a vistoria: item "Necessita trocar"/"Urgente!" (`ChecklistSchema`) sugere o serviço da base.
- Histórico por sistema do veículo na janela da OS e no cliente (`src/services/osClientContext.ts`).

### Riscos e cuidados

- Categoria nova gravada antes de todos os PCs atualizarem quebra a lista do catálogo no PC antigo (B1.1 resolve).
- Padronizar o catálogo mexe em dados reais: cópia diária antes, revisão do dono item a item, aplicação por id.
- A Fase 2 muda a forma da OS em todos os lugares (nuvem, merge, impressão, função `money`): só com o `arquiteto` e testes de compatibilidade com OS antigas.
- A calibração ainda é estimada (tempos pelas peças); os valores são iniciais e editáveis.

### Resultado esperado

O orçamento sai organizado por sistema (Freios, Suspensão...) com subtotal; o catálogo fica limpo; depois, ao escolher um serviço, a mão de obra já vem calculada pelo carro do cliente e o que o cliente recusou aparece na próxima visita.

### Pendências / perguntas abertas

- **Conflito a confirmar:** a primeira decisão do dono fixou o fator em Médio 1,15, Premium 1,3 e Vintage 1,5; a proposta calibrada (base R$ 210, Médio 1,3, Premium 2,0, Vintage 1,8) foi registrada como aprovada no resumo de 2026-11-18, mas o arquivo anterior dizia "valor-hora e fatores a fixar com o dono". Confirmar com o dono os números finais antes da Fase 2 (não bloqueia a Fase 1).
- Como o veículo cai em cada categoria: lista de marcas/modelos Premium e Médio, e a partir de que ano é Vintage.
- Lista dos ~150 serviços com tempo e coeficiente: estimativas para o dono calibrar.
- Pacotes: quais (além de "Revisão 10.000 km").

### Estado

Fórmula, sistemas e mapeamento definidos; números calibrados propostos (confirmar). **Fase 1 planejada** para a etapa 4; Fases 2 e 3 para a etapa 8. Nada implementado.

---

## A. Compressão de fotos abaixo de 100 KB

### Concepção

Pedido do dono (2026-11-18): cada foto da OS com menos de 100 KB, para poupar o espaço da nuvem.

**Hoje:** `src/utils/imageCompress.ts` usa o JPEG do próprio navegador (canvas), 1600 px no lado maior a 80% de qualidade (`FULL_MAX_SIDE`, `FULL_QUALITY`; foto típica de 200 a 500 KB) e miniatura de 320 px a 70% (`THUMB_MAX_SIDE`, `THUMB_QUALITY`). O plano grátis do Supabase tem 1 GB de Storage, o que comporta ~2.000 a 4.000 fotos com a compressão atual (item "Já levantados" 4, estado "Observar": contagem exata por `app.storage_usage` e, se apertar, compressão maior, 1280 px / 70%).

**Opções pesquisadas:**

| Opção | O que é | Prós | Contras |
|---|---|---|---|
| 1. Busca de qualidade com o canvas atual | Reduzir para 1280 px e baixar a qualidade aos poucos até caber em ~95 KB | Zero dependência nova; muda só `imageCompress.ts` | O JPEG do navegador é o menos eficiente: abaixo de 100 KB aparecem blocos e borrões em fotos com muito detalhe |
| 2. **MozJPEG em WebAssembly** (`@jsquash/jpeg`, do projeto jSquash, derivado do Squoosh do Google; licença Apache-2.0) | Mesmo formato JPEG, com um codificador melhor, mais a mesma busca de qualidade até ~95 KB | Mais qualidade no mesmo tamanho; continua JPEG, então **nada muda** no Storage (bucket só JPEG), no Rust (`save_photo` confere bytes JPEG) nem nos nomes `.jpg` | Arquivo WebAssembly carregado só na hora de comprimir; a CSP precisa de `'wasm-unsafe-eval'` em `script-src` (Tauri e `public/_headers`); tem um bug conhecido de build com Vite em workers (issue #19 do repositório) |
| 3. `browser-image-compression` (npm, MIT) | Biblioteca pronta com `maxSizeMB` | Simples de usar | Usa o mesmo JPEG do navegador (mesma qualidade da opção 1); repositório parado desde 2024 |
| 4. WebP ou AVIF | Formatos mais modernos, 25 a 35% menores | Menor tamanho | O Safari do iPhone não gera WebP pelo canvas (devolve PNG); exigiria WebAssembly do mesmo jeito e mudar o bucket, o Rust e os nomes de arquivo; mudança grande |

**Recomendação:** opção 2, com a opção 1 como reserva automática se o WebAssembly falhar. Proposta: foto em 1280 px no lado maior, busca de qualidade até ≤ 95 KB, nunca abaixo de ~55% de qualidade (se não couber, reduz para 1024 px), e miniatura de 320 px com cerca de 15 KB. Vale só para fotos novas; as já enviadas ficam como estão.

### Objetivo

- 100% das fotos novas com o arquivo principal ≤ 100 KB (alvo 95 KB) e miniatura ~15 KB.
- Qualidade aceita pelo dono no teste lado a lado.
- Tempo de compressão por foto aceitável no celular (medir; referência a definir no teste).

### Decisões do dono

- 2026-11-18: **planejada** com a opção 2 (MozJPEG via `@jsquash/jpeg`) e a opção 1 (canvas) como reserva.
- Tamanho final (1280 ou 1600 px): o dono escolhe depois do teste com 10 fotos reais.

### Método de implementação

1. **Teste de qualidade** (`dev` prepara uma página local; dono escolhe): 10 fotos reais de carro, 1280 e 1600 px abaixo de 100 KB, lado a lado. Confirmar o tamanho antes do passo 2.
2. **`src/utils/imageCompress.ts`** (`dev`): codificador MozJPEG carregado sob demanda (import dinâmico, só quando há foto para comprimir), busca de qualidade até ≤ 95 KB com piso de ~55% e queda para 1024 px se não couber; miniatura ~15 KB; reserva com o canvas atual se o WebAssembly falhar. A busca vira função pura com codificador injetado, com testes Vitest (convergência, piso, queda de tamanho, reserva).
3. **CSP** (`dev`; `revisor`): acrescentar `'wasm-unsafe-eval'` em `script-src` no `src-tauri/tauri.conf.json` e no `public/_headers` (o `src/utils/csp.test.ts` confere os dois iguais); contornar o bug de build do Vite com workers (issue #19 do jSquash) carregando o `.wasm` como asset; conferir que o precache do PWA (`src/pwa/precache.ts`) inclui o `.wasm` para funcionar offline.
4. **Conferência** (`verificador`; dono no celular): Android e iPhone e no exe: tempo de compressão por foto e peso final; foto tirada offline sobe ao voltar a internet.
5. **Espaço** (opcional, `arquiteto` + `dev`): `app.storage_usage(ws)` para mostrar o espaço exato em Config, "Espaço das fotos" (`photoSpace.ts`, `PhotoSpaceSection.tsx`). Exige migração nova.
6. **Entrega** (`entregador`): `npm run deploy:web:real` (celulares) e instalador novo em todos os PCs. Sem migração (exceto o passo 5); vale só para fotos novas.

### Riscos e cuidados

- CSP mais aberta (`'wasm-unsafe-eval'`) só para WebAssembly; não abre `unsafe-eval`.
- WebAssembly falhando em algum aparelho: a reserva com canvas garante que a foto sempre sai.
- Foto do defeito muito comprimida perde detalhe que o cliente precisa ver (F): o teste lado a lado decide.
- Exe antigo nos PCs continua comprimindo do jeito atual até receber o instalador novo (sem problema de dados: continua JPEG).

### Resultado esperado

Fotos leves que sobem rápido no 4G e cabem 3 a 5 vezes mais no mesmo espaço da nuvem, sem mudar nada no jeito de tirar e ver as fotos.

### Pendências / perguntas abertas

- Tamanho final (1280 ou 1600 px), depois do teste.
- Fazer ou não a contagem exata de espaço (`app.storage_usage`).
- Se o plano Pro for assinado (E3), a urgência de espaço diminui, mas o ganho de velocidade no celular continua.

### Estado

**Planejada** (dono, 2026-11-18). Ainda não implementada. Etapa 5 da Ordem recomendada (pode ser antecipada se o espaço apertar).

---

## F. Orçamento aprovado pelo cliente por link (WhatsApp)

### Concepção

Hoje o orçamento é aprovado de boca ou por mensagem solta; não fica registro de quem aprovou o quê e quando. Os consultores (item C) recomendaram orçamento agrupado por sistema, com fotos do defeito, e lembraram o CDC (nada executado sem aprovação, serviço extra exige nova aprovação, orçamento discriminado com validade de 10 dias). O dono decidiu que a aprovação é quase sempre inteira, mas às vezes o cliente tira partes ("Cliente não quis", item B).

Ideia: a oficina manda pelo WhatsApp um link do orçamento; o cliente abre no celular, sem login, vê o orçamento agrupado por sistema com as fotos do defeito, aprova ou recusa cada serviço e confirma. O programa registra quem, quando e o quê (prova para o CDC); o recusado vira "Cliente não quis".

**No código hoje:** o WhatsApp já é aberto por `wa.me` em `src/components/KanbanCardMenu.tsx` e `src/pages/CRMPage.tsx`; o resumo ao cliente existe (`serviceSummary.ts`, `serviceSummaryView.ts`, `ClientSummaryModal`); fotos no bucket privado `fotos` (políticas `f_sel`/`f_ins` exigem membro da oficina); as funções Edge (`users`, `pin`, `device`, `money`) validam o JWT sozinhas e a `pin` já tem ações sem JWT (modelo para uma função pública).

### Objetivo

- Orçamento enviado por link em 1 clique a partir da OS.
- Cliente aprova ou recusa cada serviço no celular em menos de 2 minutos, sem criar conta.
- 100% das aprovações por link com registro de data, hora, o que foi aprovado e recusado, valor e versão do orçamento.
- Nenhum dado de outro cliente nem preço de custo exposto (testado).

### Decisões do dono

- 2026-11-18: ideia **aprovada** (página pública do orçamento agrupada por sistema com fotos do defeito, aprovar/recusar cada serviço no celular, registro de quem/quando/o quê como prova CDC, recusado vira "cliente não quis").
- 2026-11-18 (item B): "Cliente não quis" sai do total, fica registrado e aparece na próxima visita do mesmo veículo.

### Método de implementação

**Rodada F0. Desenho** (`arquiteto` obrigatório: tabela nova, função pública, segurança; aprovação do dono antes do `dev`)

Proposta de desenho a validar:
- **Link:** token aleatório de 32 bytes (`crypto.getRandomValues`, base64url) gerado no servidor; no banco só o hash (`sha256Hex` de `src/server/core.ts`, como o segredo do aparelho). Endereço `https://andersonmecanica.pages.dev/o/#<token>`: o token vai depois do `#`, então não aparece em log de servidor nem no `Referer`. Validade de 10 dias (validade do orçamento no CDC). A oficina pode cancelar o link; gerar um link novo cancela o anterior.
- **Instantâneo:** ao gerar o link, o servidor grava uma cópia congelada do orçamento (sistema, descrição, quantidade, preço de venda, total, prazo, garantia, nome da oficina, primeiro nome do cliente, modelo do carro, ids das fotos marcadas como "do defeito"). Nunca custo, margem, telefone, placa completa, observação interna (`notes`) nem dados de outras OS. Se a OS mudar, o link antigo mostra "Este orçamento foi atualizado; peça o novo link".
- **Banco (migração nova):** `quote_links` (`workshop_id`, `id`, `os_id`, `token_hash` único, `snapshot jsonb`, `version`, `expires_at`, `revoked_at`, `created_by`, `created_at`) e `quote_responses` (somente acréscimo: `link_id`, `at`, `decisions jsonb` por item, `total_aprovado`, `nome_digitado`, `aceite_texto`, `user_agent` resumido, IP truncado ou hash). RLS: nenhuma policy para `anon`; Dono e Recepção leem as da oficina; escrita só pela função (service role). Realtime para a oficina ver a resposta chegar.
- **Função pública `orcamento`** (`src/server/quoteHandler.ts` + `supabase/functions/orcamento/index.ts`, `verify_jwt = false`): `GET` com o token devolve o instantâneo (ou "vencido/cancelado", sem dizer qual OS); `POST` grava a resposta uma única vez (segunda tentativa: "Já respondido em..."); `create`/`revoke` com JWT de Dono ou Recepção. Limite de tentativas por IP e por token (evita adivinhação), respostas iguais para token inexistente e vencido.
- **Fotos:** a função devolve URLs assinadas de curta duração (minutos) do bucket `fotos` só das fotos do instantâneo, ou os bytes; a CSP do site (`public/_headers`) hoje tem `img-src 'self' blob: data:`, então ou a página baixa as fotos pela função e mostra como `blob:`, ou a CSP ganha o domínio do Storage em `img-src`. Decidir no desenho.
- **Aplicar a resposta na OS:** a função não mexe na OS (preço e total são guardados por `app.guard_finance` e pela função `money`). Quando a resposta chega, a OS ganha o aviso "Cliente respondeu pelo link" e a Recepção confere e aplica com 1 clique: itens recusados recebem `OrderItem.declined?: { at, via: 'LINK' }` e saem do total. Alternativa: a função `money` ganha uma operação `quote.apply`. Decidir no desenho.

**Rodada F1. Banco e função** (`dev`; pgTAP em `supabase/tests/`; `scripts/test-functions.mjs`; `revisor` com olhar de segurança)
- Migração nova, testes pgTAP (anon não lê nada; Mecânico não lê; outra oficina não lê; resposta só uma vez; vencido recusado).
- `quoteHandler.ts` com testes Vitest (token, validade, instantâneo sem custo, tentativas).

**Rodada F2. Página pública** (`dev`; `ui-dev`; `ux-revisor` como cliente leigo no celular)
- Rota leve no site (`/o/`), separada do app: não carrega login, IndexedDB nem o motor de sincronização. Agrupada por sistema (B Fase 1, `groupItemsBySystem`), fotos do defeito, cada serviço com "Aprovar" e "Não quero agora", total que muda na hora, nome e aceite ("Li e aprovo os serviços marcados"), validade e garantia escritas, aviso de privacidade curto (LGPD).
- Sem cookies de rastreio; textos simples; 360 px.

**Rodada F3. Na OS** (`dev`; `verificador`)
- Botão "Mandar orçamento por WhatsApp" na OS e no menu do card (`KanbanCardMenu.tsx`): gera o link pela função e abre `wa.me` com a mensagem pronta (D4 pode melhorar o texto depois).
- Selo no card do Kanban e na OS: "Link enviado", "Cliente aprovou tudo", "Cliente aprovou parte", "Link vencido". Histórico das respostas na OS (prova CDC), imprimível.
- Marcar foto "do defeito" (`OSPhoto.caption` existe; acrescentar marca `forQuote?`).
- Campos novos (`OrderItem.declined`, marca da foto) entram em `itemsKey` de `osEditMerge.ts` e seguem a regra "tolerar antes de gravar".

Impacto: migração e função nova no real (antes do app); página pública no site; os PCs precisam do instalador novo para gerar o link e ver as respostas.

### Riscos e cuidados

- **Segurança:** página pública é a primeira porta aberta do sistema sem login. Token longo e aleatório, só o hash no banco, validade, cancelamento, limite de tentativas, respostas genéricas, instantâneo mínimo, nada de custo. Revisão de segurança antes de ir ao real.
- **LGPD:** o link mostra dados pessoais mínimos (primeiro nome e modelo do carro); quem recebe o link encaminhado vê o orçamento; registrar a base legal (execução de contrato) e o aviso de privacidade; guardar a resposta pelo tempo do CDC e definir quando apagar o instantâneo.
- **CDC:** a resposta registrada é a prova da aprovação; serviço extra depois exige link novo (nova aprovação).
- WhatsApp por `wa.me`: abre a conversa no aparelho de quem envia, sem robô, sem custo; não envia sozinho.
- Fotos expostas por URL assinada: curta duração e só as fotos marcadas.

### Resultado esperado

A Recepção manda o orçamento por WhatsApp com 1 clique; o cliente aprova no celular vendo as fotos do defeito; a oficina tem a prova de quem aprovou o quê e quando, e o que foi recusado já fica marcado para a próxima visita.

### Pendências / perguntas abertas

- **Unidade de aprovação:** o pedido diz "cada serviço", mas o grupo "serviço" só existe na Fase 2 do item B (etapa 8, depois de F). Até lá, aprovar por item ou por sistema? Decidir com o dono no F0.
- Mostrar o valor de cada peça ou só o total por serviço/sistema?
- Aplicar a resposta automaticamente na OS ou com conferência da Recepção (proposta: conferência)?
- Validade do link: 10 dias (validade do orçamento) ou outra?
- Pedir o nome do cliente na aprovação? Pedir o CPF (prova mais forte, mais dado pessoal)?
- Por quanto tempo guardar o instantâneo e a resposta.

### Estado

**Aprovada a ideia** (dono, 2026-11-18). Desenho (F0) a fazer pelo `arquiteto`. Etapa 6 da Ordem recomendada.

---

## G. Lembretes de retorno e aba "Notificações"

### Concepção

O retorno do cliente depende da memória da Recepção. Três momentos se perdem: o pós-serviço (pedir avaliação no Google), a revisão por km ou tempo (6 meses) e o que o cliente recusou ("Cliente não quis"). Os consultores lembraram que WhatsApp de retorno só com consentimento (LGPD).

Ideia (pedido do dono, 2026-11-18): uma **aba "Notificações" no app** com a lista do dia "Clientes para chamar", cada um com a mensagem pronta e o botão do WhatsApp (`wa.me`, sem robô, sem custo). A Recepção marca "Enviado", "Adiar" ou "Ignorar". Só aparece quem autorizou o contato, com o consentimento registrado.

**No código hoje:** abas em `NavId` (`src/services/accessView.ts`: HOJE, FINANCEIRO, OFICINA, AGENDA, PROCESSOS, CLIENTES, PECAS, CONFIG), roteamento por `activeTab` em `src/App.tsx`, menu em `src/components/Sidebar.tsx` e no celular `src/services/mobileNav.ts`/`MobileNav.tsx`; a tela "Hoje" (`TodayPage.tsx`, `todaySummary.ts`) já junta pendências do dia; `wa.me` já usado no Kanban e no CRM; histórico por veículo derivável das OS (`vehicleId`, `mileage`, `createdAt`, `osClientContext.ts` já gera "Última visita: OS #N, km K"); `Client` não tem campo de consentimento.

### Objetivo

- Lista diária "Clientes para chamar" gerada sozinha, só com clientes que autorizaram.
- Cada lembrete resolvido em até 3 cliques (abrir o WhatsApp com a mensagem pronta, voltar, marcar "Enviado").
- Medir: lembretes enviados por mês, retornos (OS nova do mesmo veículo em até 60 dias depois do lembrete) e avaliações pedidas.

### Decisões do dono

- 2026-11-18: ideia **aprovada**, com a aba "Notificações" (pedido do dono).
- Tipos e prazos propostos na aprovação (configuráveis por tipo): pós-serviço 2 dias com pedido de avaliação no Google; revisão por km ou 6 meses pelo histórico; pendência "Cliente não quis" de 30 a 60 dias.
- WhatsApp por `wa.me`, sem robô e sem custo; marcar enviado/adiar/ignorar; só para quem autorizou (consentimento LGPD registrado).

### Método de implementação

**Rodada G0. Desenho** (`arquiteto`: coleção nova na nuvem; aprovação do dono)
- **Consentimento:** `Client.contactConsent?: { at, by, channel: 'WHATSAPP', text }` e `contactConsentRevokedAt?` dentro de `clients.data` (sem migração SQL; campo novo do cliente). Pergunta feita no cadastro do cliente e na OS ("Podemos mandar lembretes pelo WhatsApp?"); pode vir também da página do F (caixa de marcar).
- **Estado dos lembretes:** coleção nova `reminders` (id determinístico `tipo:clienteOuVeículo:referência`, situação ENVIADO/ADIADO até/IGNORADO, quem, quando). Migração nova: tabela no padrão das coleções (RLS: Dono e Recepção leem e gravam; Mecânico não), gatilhos `b_touch`/`z_audit`, Realtime; motor: `src/sync/types.ts`, `syncEngine.ts`, `split.ts`, `fullPull.ts`, `dailyExport.ts`. Se M1 não tiver sido feito, também `DatabaseSchema.reminders` e passo novo em `migrations.ts` (v6). Alternativa mais leve a avaliar: guardar só o estado dentro de `clients.data` (sem tabela nova, mas com risco de conflito no merge do cliente).
- **Regras:** `WorkshopSettings.reminderRules?` (por tipo: ligado, prazo em dias, texto da mensagem).

**Rodada G1. Lógica pura** (`dev`; testes em vários fusos)
- `src/services/reminders.ts`: `buildDueReminders(workOrders, clients, reminders, rules, today)` devolve a lista do dia. Pós-serviço: OS finalizada há N dias (padrão 2). Revisão: 6 meses depois da última OS do veículo ou km estimado (média de km/dia pelo histórico de `mileage`; o que vier primeiro). "Cliente não quis": itens `declined` (F) há 30 a 60 dias sem OS nova do veículo. Sem consentimento: fora da lista. Datas só-dia por `src/utils/dates.ts`.
- `src/services/reminderMessage.ts`: mensagem pronta por tipo (link de avaliação no Google configurável), com `encodeURIComponent` e o telefone limpo como já é feito no `KanbanCardMenu.tsx`.

**Rodada G2. Aba "Notificações"** (`ux-designer` desenha; `ui-dev` e `dev` implementam; `ux-revisor`)
- `NavId` ganha `NOTIFICACOES`; tela `src/pages/NotificationsPage.tsx`; contador no menu; no celular, entra na barra de baixo ou em "Mais" (`mobileNav.ts`). Visível para Dono e Recepção (`useAccess`).
- Cada linha: cliente, carro, motivo ("Revisão: 6 meses desde a OS #N"), botão "Abrir WhatsApp", "Enviado", "Adiar" (escolher dias), "Ignorar". Resumo também no "Hoje" (`todaySummary.ts`).

**Rodada G3. Consentimento na tela** (`dev`; `verificador`)
- Caixa no cadastro do cliente (`ClientEditModal.tsx`) e na OS; texto curto e claro; registrar quem marcou e quando; botão para retirar.

Impacto: migração (se for tabela nova) no real antes do app; site na hora; PCs com instalador novo. A aba fica vazia até haver clientes com consentimento.

### Riscos e cuidados

- LGPD: sem consentimento, nada de lembrete; retirar o consentimento tem de ser fácil e imediato; mensagem sempre identifica a oficina.
- Não virar spam: um lembrete por cliente por período; "Ignorar" é respeitado.
- Mensagem enviada pelo WhatsApp de quem clica: o programa só registra que a pessoa disse que enviou.
- Coleção nova na nuvem mexe no motor de sincronização: testes de 2 aparelhos e de offline.

### Resultado esperado

Todo dia a Recepção abre "Notificações" e vê quem chamar, com a mensagem pronta; clientes voltam para a revisão e para o que tinham deixado para depois; a oficina ganha avaliações no Google.

### Pendências / perguntas abertas

- Prazos exatos por tipo (pós-serviço 2 dias; revisão 6 meses ou por km: qual km; "Cliente não quis" 30 ou 60 dias).
- Link de avaliação do Google da oficina.
- Quem pode ver a aba: Dono e Recepção (proposta) ou também o Mecânico.
- Como coletar o consentimento dos clientes que já existem (perguntar na próxima visita?).
- Tabela nova `reminders` ou estado dentro do cliente (decisão do `arquiteto`).

### Estado

**Aprovada a ideia** (dono, 2026-11-18). Desenho (G0) a fazer. Etapa 7 da Ordem recomendada.

---

## Itens menores (já levantados em 2026-11-18)

Itens 2, 3 e 6 da lista original foram para o item E; o item 4 (espaço das fotos) foi para o item A. Os demais seguem abaixo.

### M1. Remover o modo arquivo do código (PR 12) e os comandos Rust sem uso

#### Concepção
A oficina já está na nuvem; o modo arquivo (`DatabaseContext.tsx`, `migrations.ts` para o app, comandos Rust `save_database_atomic`, `load_database`, `read_db_meta`... em `src-tauri/src/lib.rs`) vira peso e risco: toda mudança de formato precisa ser feita duas vezes.
#### Objetivo
Um só caminho de dados (nuvem); menos código e menos testes de modo arquivo; mudanças de formato sem passo em `migrations.ts` para o app.
#### Decisões do dono
Previsto desde o plano da nuvem: PR 12 "só depois da virada" (`docs/NUVEM-ESTADO.md`). A virada foi feita em 2026-11-18.
#### Método de implementação
`arquiteto` lista o que sai e o que fica (a importação e a cópia diária ainda leem e escrevem o formato v5: `importCheck.ts`, `importRunner.ts`, `exportV5`, `dailyExport.ts`, `save_daily_export`, `backup_pre_cloud`); `dev` remove em rodadas (front, depois Rust); `cargo test`, `npm test`, `npm run build`; `revisor`. Entrega: instalador novo em todos os PCs; reversão: reinstalar a 0.3.0.
#### Riscos e cuidados
Não remover o que a cópia diária e a leitura de cópias antigas usam. Manter a capacidade de abrir uma cópia v5 só para consulta.
#### Resultado esperado
Programa mais simples; itens B Fase 2 e G ficam mais baratos.
#### Pendências / perguntas abertas
Manter algum jeito de abrir o `database.json` lacrado só para consulta?
#### Estado
Planejado.

### M2. E-mails de convite fora do spam

#### Concepção
Hoje o remetente do SMTP (Brevo) do projeto real é Gmail; convites e "esqueci a senha" caem no spam.
#### Objetivo
Convites chegando na caixa de entrada em Gmail e Outlook.
#### Decisões do dono
Nenhuma ainda.
#### Método de implementação
Domínio próprio (pendência do dono), SPF, DKIM e DMARC configurados no DNS e validados no Brevo; remetente do domínio no SMTP do Auth do real (pelo painel, nunca `config push`). Conferir Site URL e Redirect URLs do Auth real (`https://andersonmecanica.pages.dev`). Sem código; `entregador` registra.
#### Riscos e cuidados
DNS errado bloqueia todos os e-mails; testar com um convite para um e-mail próprio.
#### Resultado esperado
Convite e nova senha chegam sem o dono ter que procurar no spam.
#### Pendências / perguntas abertas
O dono tem ou quer comprar um domínio? Qual?
#### Estado
A fazer (depende do dono).

### M3. Lista de Lançamentos do Financeiro pela data do pagamento

#### Concepção
A lista de Lançamentos filtra pela data do lançamento (`effectiveDate`, `src/hooks/useFinance.ts`, linhas 69 e 71) e os totais pelo dia do pagamento (`financeKpis.ts`; regra do dono de 2026-11-18 em `docs/FINANCEIRO-REPAGINACAO.md`). A coluna "Pago em" mostra a diferença quando as datas caem em meses diferentes (nota B5), mas a lista e os totais podem não bater.
#### Objetivo
A lista do mês e os totais do mês contam os mesmos lançamentos.
#### Decisões do dono
Regra dos números (2026-11-18): Entrou/Saiu/Sobrou só o que foi pago, pelo dia do pagamento. A mudança da lista ainda não foi decidida.
#### Método de implementação
`dev`: filtro opcional "pela data do pagamento" (ou padrão novo) em `useFinance.ts` com função pura e testes; `ui-dev` para o texto do filtro; `verificador`. Só tela.
#### Riscos e cuidados
Lançamento sem pagamento (a receber, previsto) some da lista "pelo pagamento": precisa de lugar claro (as caixas Pagar/Receber já mostram).
#### Resultado esperado
Fim da confusão "a lista não bate com o total".
#### Pendências / perguntas abertas
Trocar o padrão ou só oferecer o filtro?
#### Estado
Avaliar.

### M4. Atualização automática do app nos PCs (updater do Tauri)

#### Concepção
Cada versão nova exige instalar à mão em todos os PCs, e quase todo item deste plano termina com "instalador novo em todos os PCs".
#### Objetivo
Versão nova chega aos PCs sozinha (com confirmação), no mesmo dia.
#### Decisões do dono
Nenhuma ainda.
#### Método de implementação
`arquiteto`/`entregador`: plugin updater do Tauri 2, chave de assinatura (guardada fora do repositório), arquivo de versão publicado (ex.: no Cloudflare Pages junto do site ou em releases do GitHub), CSP e permissões do Tauri; `dev` implementa o aviso "Versão nova disponível"; `entregador` atualiza o roteiro de entrega. Teste com duas versões de teste.
#### Riscos e cuidados
Atualização no meio do trabalho: só ao abrir ou com confirmação. Chave de assinatura perdida impede atualizar (guardar com cuidado). A regra "tolerar antes de gravar" continua valendo.
#### Resultado esperado
O dono para de ir em cada PC instalar versão nova.
#### Pendências / perguntas abertas
Antecipar M4 para antes de C/B (reduz o trabalho de todas as entregas)? Onde hospedar as versões?
#### Estado
Avaliar.

### M5. Criar OS e a tela "Hoje" no celular

#### Concepção
Ficaram fora do PR 8 (decisões 1 e 5 do dono, `docs/NUVEM-PR8.md`): no celular hoje dá para ver e mexer na OS (km, fotos), mas não criar OS nem ver o "Hoje".
#### Objetivo
Recepção ou mecânico criam uma OS no pátio pelo celular; "Hoje" resumido no celular.
#### Decisões do dono
Fora do PR 8 por decisão do dono (decisões 1 e 5). Nada novo decidido.
#### Método de implementação
`ux-designer` desenha para < 800 px (`data-layout="phone"`, `styles-mobile.css`); `ui-dev`/`dev` implementam (`mobileNav.ts`, `isPhoneTab`, `TodayPage.tsx`, `OSModal.tsx` em tela cheia); `ux-revisor` e `verificador` em 360/390 px. Só tela.
#### Riscos e cuidados
Janela da OS é grande; no celular, só o essencial (cliente, veículo, km, relato, fotos). Papel do Mecânico (só km/fotos) continua barrado no servidor.
#### Resultado esperado
OS aberta na hora em que o carro chega, sem ir ao computador.
#### Pendências / perguntas abertas
Prioridade em relação a F e G (que também usam o celular).
#### Estado
Avaliar.

---

## Resumo

| Item | Estado | Depende de | Esforço | Ganho esperado |
|---|---|---|---|---|
| E. Segurança (senha, TOTP, plano Pro) | A fazer, primeiro | nada | P | Dados reais protegidos; backup diário se Pro |
| C0. Custo em 100% das peças | A fazer | D1 | P | Base para markup e calibração |
| D1. Claude lê nota do fornecedor (+ função `ia`) | Planejado | E; chave da Anthropic | M | Custo lançado sem digitar |
| C. Markup, diagnóstico, insumos, garantia, indicadores | Aprovado em princípio | C0, simulação | M | +4 a 8% de lucro sobre o faturamento (estimativa) |
| B Fase 1. Sistemas e base de serviços | Planejado | B1.1 nos PCs | M | Orçamento organizado; calibração possível |
| D2. Claude padroniza o catálogo | Planejado | D0, B Fase 1 | P | 523 descrições para ~150 nomes |
| A. Fotos abaixo de 100 KB | Planejado | teste com 10 fotos | P | 3 a 5 vezes mais fotos no mesmo espaço; envio rápido |
| F. Orçamento aprovado por link | Ideia aprovada | E, A, B Fase 1 | G | Prova CDC; aprovação mais rápida; "Cliente não quis" registrado |
| G. Lembretes e aba "Notificações" | Ideia aprovada | F, consentimento | M | Retorno de clientes; avaliações no Google |
| B Fase 2. Serviço como grupo, mão de obra pela fórmula | Planejado | B Fase 1, `arquiteto`, números confirmados | G | Mão de obra coerente por carro |
| B Fase 3. "Cliente não quis" por serviço, vistoria, histórico | Planejado | B Fase 2, F | M | Venda do recusado na próxima visita |
| D3. Orçamento pelo relato | Planejado | B Fase 2 | M | Orçamento mais rápido |
| D4. Mensagens ao cliente | Planejado | D0, F, G | P | Mensagens claras sem digitar |
| M1. Remover o modo arquivo (PR 12) | Planejado | nada | M | Código menor; mudanças de formato mais baratas |
| M2. E-mail fora do spam | A fazer | domínio do dono | P | Convites chegam |
| M3. Lançamentos pela data do pagamento | Avaliar | nada | P | Lista e totais batem |
| M4. Atualização automática dos PCs | Avaliar | nada | M | Fim da instalação à mão |
| M5. Criar OS e "Hoje" no celular | Avaliar | nada | M | OS aberta no pátio |
