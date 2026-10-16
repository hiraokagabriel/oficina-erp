# OficinaPro (oficina-erp)

App desktop de gestão para oficina mecânica: Kanban de Ordens de Serviço, financeiro, CRM e impressão A4.
Tauri 2 (Rust) + React 19 + TypeScript + Vite + Recharts + @dnd-kit. Interface e textos em pt-BR.

## Comandos

- `npm run dev`: só o front (Vite, porta 1420)
- `npm run tauri dev`: app completo (Tauri + front)
- `npm run build`: `tsc && vite build`. É a verificação mínima antes de dar uma tarefa por concluída.
- `npm test`: Vitest, 262 testes de lógica pura (banco: `migrations`, `conflictDiff`, `externalChange`, `secrets`; negócio: `osFinanceService`, `receivables`, `cascadeService`, `helpers`, `dates`, `links`). Não há testes de telas nem lint. Testes de datas rodam sob qualquer fuso: confira também com `$env:TZ='UTC'; npm test` (PowerShell). Os testes de negócio fixam o comportamento atual, inclusive defeitos marcados com `COMPORTAMENTO ATUAL (suspeito)` (lista em `docs/ROADMAP.md` seção 3.1): corrigir um defeito exige atualizar o teste.
- Zero `any` no código de produção: não reintroduza.
- `cargo test` e `cargo check` em `src-tauri`. Se `tauri dev` falhar com "failed to read plugin permissions", a pasta `src-tauri/target` guarda caminhos antigos: rode `cargo clean` ali.

## Arquitetura

- **Tipos reais: `src/types.ts`** (WorkOrder, OSStatus, LedgerEntry, Client, CatalogItem, WorkshopSettings, DatabaseSchema). Os imports `'../types'` resolvem para esse arquivo.
- Não existe camada `src/domain`, `src/hooks/useWorkshopData` nem `src/utils/formatters`: foram removidos como código morto. Dinheiro e helpers de negócio ficam em `src/utils/helpers.ts` (`Money`, `createEntry`, `updateWorkOrderData`...).
- `src/App.tsx` (~870 linhas) concentra roteamento por `activeTab`, estados de modal e os handlers. As regras de finalização, parcelamento, pagamento e reabertura de OS ficam em `src/services/osFinanceService.ts` (funções puras com relógio e gerador de id injetáveis); os handlers só chamam essas funções e cuidam de estado, toasts e modais. As migrações ficam em `src/utils/migrations.ts`.
- `src/services/receivables.ts`: contas a receber (recebido, a receber ou atrasado por dia local; resumo geral; dívida por cliente ligada pelo nome da OS). `paymentDate` é a única verdade de "pago"; `LedgerEntry.isPaid` está obsoleto e não é gravado. O adiantamento da OS vira um lançamento já recebido ligado por `WorkOrder.advanceEntryId` (só para OS não finalizadas); a receita à vista e as parcelas usam `getRemainingAmount` (`total - adiantamento`).
- Dinheiro sempre em centavos inteiros (`Money.fromFloat`, `splitCents`) e datas só-dia como meio-dia local (`src/utils/dates.ts`: `parseDateOnly`, `addMonths` com limite no fim do mês). Não use `toFixed`/`parseFloat` em cálculo, nem `new Date('AAAA-MM-DD')`.
- `src/context/DatabaseContext.tsx`: carrega e salva o banco (JSON local). Estado de carga (`loadStatus`), salvamento com debounce de 3 s e retentativas, `readOnly` para banco de versão futura, diálogo de conflito/divergência e verificação do arquivo a cada 30 s e ao focar a janela. Expõe `dbPath`/`setDbPath`.
- `src/utils/migrations.ts` (`CURRENT_SCHEMA_VERSION`, `migrate`), `conflictDiff.ts`, `externalChange.ts` e `secrets.ts`: lógica pura do banco, com testes.
- `src/hooks/useFinance.ts`: KPIs e lançamentos do financeiro.
- `src/services/`: `cascadeService` (propaga renomeações de cliente, item de catálogo e técnico **por id**, mantendo os textos atualizados) e `googleDrive` (backup).
- Vínculos por id (plano 4.6): `WorkOrder.clientId/vehicleId/technicianId`, `OrderItem.catalogItemId`, `Vehicle.id`. `src/utils/links.ts` tem a normalização de nomes e placas e as funções puras `linkClient`, `linkCatalogItems`, `linkTechnician`, `resolveClientId`, `clientGroupKey`. Os textos (`clientName`, `vehicle`, `technician`, `description`) continuam gravados como cópia de exibição e é deles que impressão, Kanban e Processos leem; na dúvida (id ausente ou apontando para algo apagado) a leitura cai no nome. Nome de cliente repetido exige escolha no cadastro da OS: nunca funda homônimos. `src/utils/migrations.ts` já tem `v1ToV2`, que só acrescenta ids, **mas ela NÃO está ativada** (`CURRENT_SCHEMA_VERSION` continua 1 e fora de `STEPS`). Ativá-la muda o formato e exige atualizar todos os PCs no mesmo dia: só com autorização do dono.
- `src/pages/` telas, `src/modals/` janelas de ação, `src/components/` reutilizáveis, `src/utils/` helpers e impressão (`printOS.ts`, `printChecklist.ts`).
- `src-tauri/src/lib.rs`: comandos Tauri `save_database_atomic` (confere a `revision` do disco e recusa gravar em conflito), `load_database`, `read_db_meta`, `save_recovery_copy`, `backup_pre_migration` e `export_report`. O Rust só faz I/O e a checagem de conflito; a lógica de negócio fica no front.
- Banco: arquivo JSON local (padrão `C:\OficinaData\database.json`), gravado de forma atômica (`.tmp` + `rename`). Tem `meta` (`schemaVersion`, `revision`, `history`, `savedAt`, `savedBy`). Valores em centavos.
- Backups rotativos e cópias de recuperação ficam em `%LOCALAPPDATA%\com.oficinapro.app\` (`backups\`, `recuperacao\`), fora da pasta sincronizada. Não há mais `.bak` ao lado do banco.
- Token e API key do Google ficam no `localStorage` de cada PC (`src/utils/secrets.ts`), nunca no `database.json` nem no backup do Drive.
- Uso real: 2+ PCs compartilhando o banco por pasta sincronizada (`dbPath`). Já houve perda de dados por salvamento concorrente; a Fase 0 do `docs/ROADMAP.md` implementou a proteção (falta validar na interface).
- Versão antiga do app descarta o `meta` ao salvar: atualizar todos os PCs no mesmo dia.
- O README está parcialmente desatualizado (cita `@hello-pangea/dnd`; o projeto usa `@dnd-kit`). Em caso de divergência, vale o `package.json` e o código.

## Regras do projeto

- Dados de cliente e financeiros são reais. Nunca ler, copiar ou commitar `database.json` nem `*.csv` (o `.gitignore` já os exclui; o `.claude/settings.json` bloqueia a leitura).
- Não ler nem editar o que o `.gitignore` exclui: `node_modules`, `dist`, `src-tauri/target`, `src-tauri/Cargo.lock`, logs.
- Antes de mexer em `WorkOrder`, `Ledger` ou no formato do banco, verificar a compatibilidade com dados já salvos. Mudança de formato exige: subir `CURRENT_SCHEMA_VERSION`, acrescentar o passo em `src/utils/migrations.ts` (puro e idempotente) e um teste com fixture sintética.
- Testar sempre com banco sintético em pasta temporária (campo `dbPath` em Config), nunca com o banco real.
- Reaproveitar o que existe (helpers, `Money`, formatters) antes de criar código novo.

## Processo de trabalho

1. **Plano:** para pedidos com mais de uma etapa, apresentar o plano em etapas, com o modelo indicado em cada uma.
2. **Aprovação:** esperar o "ok" do usuário antes de editar, apagar ou instalar.
3. **Execução:** delegar conforme a hierarquia abaixo.
4. **Verificação:** rodar `npm run build` e `npm test` (e `cargo test` se tocou o Rust) e só então declarar concluído (skill `superpowers:verification-before-completion`). Diga explicitamente o que não foi verificado (tudo que depende da interface).
5. **Fim de cada mensagem:** indicar o modelo recomendado para o próximo passo.
6. Commits e PRs só quando o usuário pedir.

Skills de apoio: `superpowers:brainstorming` (features novas), `superpowers:systematic-debugging` (bugs), `grill-me` (estressar um plano), `/code-review` (antes de mesclar), `claude-md-management` (manter este arquivo).

## Hierarquia de agentes

A sessão principal roda no **Sonnet** e orquestra. Os agentes em `.claude/agents/` têm o modelo fixado e são acionados automaticamente quando a tarefa se encaixa:

| Agente | Modelo | Quando |
|---|---|---|
| `arquiteto` | Opus | Arquitetura complexa, bugs que atravessam vários arquivos, análise de código legado. Só lê e devolve diagnóstico ou plano. |
| `dev` | Sonnet | Refatoração, arquivos novos, testes e revisão de código do dia a dia. É quem edita. |
| `scout` | Haiku | Buscas e varreduras de arquivos, perguntas conceituais rápidas, comandos de terminal e scripts curtos. Só lê. |

Regras: usar o menor modelo que dá conta; o `scout` junta fatos, o `dev` implementa e o `arquiteto` entra só quando o problema for realmente amplo ou obscuro. Se o `scout` não resolver, escalar para o `dev`; se o `dev` empacar em algo que cruza vários arquivos, escalar para o `arquiteto`.
