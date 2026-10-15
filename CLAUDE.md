# OficinaPro (oficina-erp)

App desktop de gestão para oficina mecânica: Kanban de Ordens de Serviço, financeiro, CRM e impressão A4.
Tauri 2 (Rust) + React 19 + TypeScript + Vite + Recharts + @dnd-kit. Interface e textos em pt-BR.

## Comandos

- `npm run dev`: só o front (Vite, porta 1420)
- `npm run tauri dev`: app completo (Tauri + front)
- `npm run build`: `tsc && vite build`. É a verificação mínima antes de dar uma tarefa por concluída.
- Não há testes nem lint configurados. Não invente comandos de teste.

## Arquitetura

- **Tipos reais: `src/types.ts`** (WorkOrder, OSStatus, LedgerEntry, Client, CatalogItem, WorkshopSettings, DatabaseSchema). Os imports `'../types'` resolvem para esse arquivo.
- **Código morto, não usar nem tomar como referência:** `src/domain/*`, `src/types/index.ts`, `src/domain/workshop/WorkOrder.ts.rs`, `src/hooks/useWorkshopData.ts` e `src/utils/formatters.ts` (vazios), `src/io.rs|lib.rs|main.rs` e `src-tauri/src/main.tsx|styles.css`, `PrintableInvoice.tsx`, `InputModal`, `EditEntryModal`. Estão na Fase 0 do `docs/ROADMAP.md` para remoção.
- `src/App.tsx` (~950 linhas) concentra roteamento por `activeTab`, estados de modal, fluxo de finalização/parcelamento e migrações de dados. A regra de negócio vive aqui hoje.
- `src/context/DatabaseContext.tsx`: carrega e salva o banco (JSON local), salvamento com debounce de 3 s, expõe `dbPath`/`setDbPath`.
- `src/hooks/useFinance.ts`: KPIs e lançamentos do financeiro.
- `src/services/`: `cascadeService` (propaga renomeações) e `googleDrive` (backup).
- `src/pages/` telas, `src/modals/` janelas de ação, `src/components/` reutilizáveis, `src/utils/` helpers e impressão (`printOS.ts`, `printChecklist.ts`).
- `src-tauri/src/lib.rs`: comandos Tauri `save_database_atomic`, `load_database`, `export_report`. O Rust só faz I/O; a lógica fica no front.
- Banco: arquivo JSON local (padrão `C:\OficinaData\database.json`), salvo de forma atômica (`.tmp` + `rename`, um único `.bak`). Sem versão de schema; migrações ad hoc em `App.tsx`. Valores em centavos.
- Uso real: 2+ PCs compartilhando o banco por pasta sincronizada (`dbPath`). Já houve perda de dados por salvamento concorrente; veja `docs/ROADMAP.md`.
- O README está parcialmente desatualizado (cita `@hello-pangea/dnd`; o projeto usa `@dnd-kit`). Em caso de divergência, vale o `package.json` e o código.

## Regras do projeto

- Dados de cliente e financeiros são reais. Nunca ler, copiar ou commitar `database.json` nem `*.csv` (o `.gitignore` já os exclui; o `.claude/settings.json` bloqueia a leitura).
- Não ler nem editar o que o `.gitignore` exclui: `node_modules`, `dist`, `src-tauri/target`, `src-tauri/Cargo.lock`, logs.
- Antes de mexer em `WorkOrder`, `Ledger` ou no formato do banco, verificar a compatibilidade com dados já salvos (migração).
- Reaproveitar o que existe (helpers, `Money`, formatters) antes de criar código novo.

## Processo de trabalho

1. **Plano:** para pedidos com mais de uma etapa, apresentar o plano em etapas, com o modelo indicado em cada uma.
2. **Aprovação:** esperar o "ok" do usuário antes de editar, apagar ou instalar.
3. **Execução:** delegar conforme a hierarquia abaixo.
4. **Verificação:** rodar `npm run build` e só então declarar concluído (skill `superpowers:verification-before-completion`).
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
