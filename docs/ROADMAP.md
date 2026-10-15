# OficinaPro: Roadmap

Atualizado em 2026-10-15. Base: histórico de 334 commits (2025-12-09 a 2026-08-11), mapeamento do código e entrevista de produto.

## Contexto de uso

- 2 ou mais pessoas usam o app em PCs diferentes, compartilhando o banco por uma **pasta sincronizada** (campo `dbPath` na tela Config).
- O app grava o `database.json` inteiro. Se dois PCs salvam perto um do outro, **quem salva por último vence**. **Já houve perda real de dados** por isso.
- Restrição: tudo **local**, sem servidor nem mensalidade. A solução é proteger o JSON atual, não trocar a base.
- Dores a resolver, nesta ordem: dados e dívida técnica, contas a receber, prazo de entrega e agenda, margem e preço.

---

## 1. O que já foi feito

Os hashes são commits representativos de cada marco (`git show <hash>`).

### Versões
- 2025-12: versão inicial (`e0c081c`), 2.0 refatorada (`9e0b238`), 2.1 com PDFs melhores (`7f8ad66`), 2.2 que destrava a geração do `.exe` (`cd5210d`).
- 2026-01: 3.0.1 (`5edddb9`) e 3.1 com parcelamento e dashboard de CRM (`976d902`).

### Kanban e fluxo de OS
- Paginação de 50 itens e feedback de arraste (`71a776e`); migração do drag and drop para `@dnd-kit` (`f198971`).
- Ver OS arquivadas (`2d332e0`); menu de contexto nos cards (`4a8f511`); botão de WhatsApp nos cards (`bc7f62b`).
- Status `AGUARDANDO_PAGAMENTO` entre `EM_SERVICO` e `FINALIZADO`, com cor por coluna; OS parceladas vão para ele (`01bf8c7`, 2026-08).
- Scroll horizontal do Kanban com setas e menu lateral recolhível (`95e5d66`).

### Processos
- Aba criada (`52b112c`), redesenhada (`678cabc`) e corrigida para não quebrar com OS aguardando pagamento (`74e1979`).

### Financeiro e parcelamento
- Ticket médio corrigido (`2dae98b`); correção crítica do parcelamento em que R$ 25 virava R$ 2.500 (`399dd50`).
- Arredondamento de parcelas em centavos, com a última parcela absorvendo a diferença (`c46c217`, `4fe73bb`).
- Data de pagamento (`paymentDate`) com migração de OS antigas (`57d21c3`).
- Adiantamento (`advanceAmount`) na OS e no resumo impresso (`14e8162`, `8071090`).

### Custo, margem e ROI
- Custo, lucro e ROI por OS (`41a6ab4`, `f065e9c`); indicador de margem nos cards (`4a7781d`) e `MarginIndicator` (`76c2608`).
- Preço sugerido corrigido (`460ba6a`) e valor mínimo sugerido pela margem desejada (`7dd3ef6`).

### CRM e clientes
- CRM com histórico (`d4ff000`), dashboard (`42edc7e`), painel de cliente com timeline (`95050c7`).
- WhatsApp com fallback para o `.exe` (`532074a`, `67f449c`).

### Catálogo, peças e categorias (#41, #42)
- Aba de peças redesenhada, com impressão (`5009e78`).
- Categorias de peça: tipos e metadados (`4fc2e2a`), seleção no OSModal com borda colorida (`017ba1f`), campo no catálogo (`2085355`) e preenchimento automático (`aaaef58`).

### Técnicos (#38)
- Técnico por OS e catálogo de técnicos (`7ee6318`, `5014425`); aba de técnicos no DatabaseModal (`3aa938c`).

### Checklist de inspeção (#43)
- Modelo de inspeção por categoria (`c140143`), modal reescrito com impressão (`d833fb4`, `bee5c76`).

### Impressão
- Peças e OS via iframe (`b0cc6ee`, `85cf54a`), depois de várias correções de race condition e CSP (`8964fa1`, `080e4c4`).
- Rodapé de assinatura em todas as páginas (`1b67103`); vias cliente e oficina (#39, #40, `9d29bc9`).
- Página 1 de Termos e Condições (`a00d341`, compactada em `cc11f18`); correção de página em branco (`217a119`).
- Página de mão de obra (`e3bbfa7`) e página de resumo com subtotais, assinatura e garantia (`b7178a7`, `e9f052f`, `31b7312`).

### Temas e interface
- Design System Premium (`d72d885`, `c2a12ad`), overhaul das telas (`1776e5c`), scrollbar própria (`26dcecc`).
- `InputModal` e `ChoiceModal` no lugar de `prompt`/`confirm` (`d5c12df`, `8b9c952`).
- Tema Ultraviolet Dawn (`04bcd2d`) e paleta Dark Empire como padrão (`b4a33e5`).

### Performance (sprint 1)
- `React.memo`/`useMemo` no Kanban (`3f5463a`), auto-save com debounce de 3 s (`2c4ca6b`), minificação (`3abf893`), lazy loading de páginas (`4a2c5b1`), scroll infinito e paginação (`3783d32`, `14cfb83`).

### Backup e banco
- Backup no Google Drive (`bcb2c91`, `b84c8c6`); chave de API configurável, sem chave fixa no código (`f1bb424`).
- Caminho do banco editável (`dbPath`, `b80b39f`).

### Atividade por mês
| Mês | Commits | Foco |
|---|---|---|
| 2025-12 | 33 | Versões 2.0 a 2.2, Google Drive, CRM, temas |
| 2026-01 | 207 | Overhaul visual, `@dnd-kit`, parcelamento, custo/ROI, performance |
| 2026-02 | 67 | Impressão, técnicos, categorias, checklist, vias |
| 2026-03 a 05 | 0 | |
| 2026-06 | 9 | Termos e Condições na OS |
| 2026-07 | 0 | |
| 2026-08 | 18 | Aguardando pagamento, adiantamento, `dbPath`, resumo impresso |

---

## 2. Estado atual e riscos

Achados do mapeamento do código. Caminhos relativos à raiz.

### Risco de perda de dados (prioridade máxima)
- `load_database` devolve `"{}"` (banco vazio) em qualquer erro de leitura (`src-tauri/src/lib.rs:44`). O app abre "limpo" sem avisar.
- O front só captura exceção e ignora `success: false` do salvamento (`src/context/DatabaseContext.tsx:109`).
- Existe um único `.bak`, sobrescrito a cada gravação (`src-tauri/src/lib.rs:13-78`).
- Não há versão de schema nem detecção de conflito. Migrações são ad hoc, em `src/App.tsx:99-159`.
- Token do Google Drive e API key ficam no `database.json`, e o backup envia o banco inteiro com esses segredos.
- O salvamento é bloqueado quando OS, clientes e lançamentos estão todos vazios (`DatabaseContext.tsx:91`), o que impede salvar um banco totalmente zerado de propósito.

### Dívida técnica
- **Código morto:** `src/domain/*` (nenhum import), `src/types/index.ts` (conflita com `src/types.ts`), `src/domain/workshop/WorkOrder.ts.rs`, `src/hooks/useWorkshopData.ts` e `src/utils/formatters.ts` (vazios), `src/io.rs|lib.rs|main.rs`, `src-tauri/src/main.tsx|styles.css`, `PrintableInvoice.tsx`, `InputModal.tsx`, `EditEntryModal.tsx`, `src/utils/sound.ts` (duplica `audio.ts`) e o fallback `window.electron` em `CRMPage.tsx` e `KanbanCard.tsx`.
- **`src/App.tsx` com 951 linhas:** concentra 20 estados de modal, a regra de finalização e parcelamento, as migrações e o roteamento.
- **Cerca de 25 usos de `any`** em 12 arquivos (por exemplo `handleSaveOSModal` e `handleInstallmentConfirm` em `App.tsx`).
- **Sem testes e sem lint.** Parcelamento, cascade e migrações não têm cobertura.
- **Dinheiro e datas:** `useFinance` usa `toFixed(2)`/`parseFloat` num sistema em centavos; `new Date(dateString)` pode deslocar o dia por fuso.
- **Vínculos frágeis por nome:** OS ligada ao cliente por `clientName`, item por `description`, veículo por texto (`src/services/cascadeService.ts`). Risco com homônimos e com `replace` em lançamentos do caixa.
- **Dois motores de impressão:** HTML em `printOS.ts` (801 linhas) e `PrintableInvoice.tsx` (sem uso).
- **Financeiro incompleto:** o adiantamento aparece na impressão, mas não gera lançamento no caixa; `isPaid`, `dueDate` e `paymentDate` coexistem.
- README desatualizado (cita `@hello-pangea/dnd`; o projeto usa `@dnd-kit`).

---

## 3. Roadmap

### Fase 0: Fundação (dados e dívida)
Objetivo: parar de perder dados no uso multi-PC e deixar o código seguro para evoluir.

**Proteção de dados**
- [ ] `load_database` falhar com erro explícito e aviso na tela, em vez de devolver `{}`.
- [ ] Tratar `success: false` no salvamento e avisar o usuário.
- [ ] Backups rotativos (vários, com data), no lugar de um único `.bak`.
- [ ] `schemaVersion` no banco e migrações em um só lugar, fora do `App.tsx`.
- [ ] Detecção de conflito: antes de salvar, conferir se o arquivo mudou no disco desde o carregamento; se mudou, avisar e oferecer recarregar.
- [ ] Tirar token e API key do Google do `database.json` e do backup.

**Dívida técnica**
- [ ] Remover o código morto listado na seção 2.
- [ ] Extrair do `App.tsx` a regra de finalização, parcelamento e migrações para módulos testáveis.
- [ ] Eliminar os `any` e unificar os tipos em `src/types.ts`.
- [ ] Trocar vínculo por nome por ids (cliente, item de catálogo) com migração.
- [ ] Dinheiro sempre em centavos inteiros e datas sem deslocamento de fuso.
- [ ] Testes para parcelamento, cascade e migrações (ainda sem framework de testes: escolher um leve, como Vitest).
- [ ] Atualizar o README.

Critério de pronto: abrir o app nos dois PCs, forçar um salvamento concorrente e ver o aviso de conflito sem perder dado; `npm run build` limpo.

### Fase 1: Contas a receber
- [ ] Adiantamento gera lançamento no caixa.
- [ ] Unificar `isPaid`, `dueDate` e `paymentDate` em um só conceito.
- [ ] Visão de parcelas pendentes e atrasadas (Financeiro).
- [ ] Indicador de quem deve e quanto (Financeiro e CRM).

Critério de pronto: em qualquer dia, ver o total a receber e a lista de atrasados.

### Fase 2: Prazo e agenda
- [ ] Previsão de entrega na OS, visível no Kanban, em Processos e na impressão.
- [ ] Destaque de OS atrasadas.
- [ ] Agenda de entrada de veículos (tela nova), ligada à criação da OS.

Critério de pronto: saber o que está atrasado e o que entra amanhã, sem planilha externa.

### Fase 3: Margem e preço
- [ ] Relatório de margem por serviço, peça e categoria.
- [ ] Sugestão de preço a partir do histórico.
- [ ] Alerta de OS abaixo da margem alvo (reaproveita `MarginIndicator`).

---

## 4. Fora de escopo (por enquanto)

Nuvem, servidor e banco online; distribuir ou vender para outras oficinas; estoque e fornecedores; WhatsApp automático (o botão manual continua); login e permissões; assinatura digital (a assinatura segue física nos impressos).

## 5. Decisões em aberto

- Mecanismo de conflito: arquivo de trava na pasta sincronizada ou comparação de versão (data e hash) ao salvar. Decidir no início da Fase 0.
- Framework de testes: Vitest é a escolha provável (já usa Vite).
- Se o adiantamento deve contar como receita no dia do recebimento ou no fechamento da OS.
