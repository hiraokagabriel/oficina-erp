# Relatório técnico — printing-overhaul

> Documento de referência da branch `printing-overhaul` do repositório `hiraokagabriel/oficina-erp`.

## 1. Identificação e escopo

A branch concentra a evolução do sistema de gestão para oficina, com foco especial no fluxo de impressão de Ordens de Serviço (OS), impressão de peças, checklist, categorização de peças, técnicos por OS, margem de lucro e correções de interface.

Estado identificado no levantamento:

- Branch: `printing-overhaul`
- Commit mais recente analisado: `cc11f18721b1f9378caa7bc4de8fe8180af76d68`
- Último commit: `fix(print): compact terms page to fit in one A4 page`
- Data do último commit: 2026-06-19
- Branch principal de referência: `main`

Este documento descreve a arquitetura observada, o funcionamento dos módulos, o estado das funcionalidades e os principais bugfixes registrados no histórico da branch.

## 2. Como o programa funciona

O sistema é uma aplicação TypeScript/React, executada no navegador e preparada para ambientes nativos por meio de Tauri/Rust. O ponto de entrada da interface é `src/main.tsx`, que inicializa a aplicação e monta `App.tsx`.

`App.tsx` coordena a aplicação, o estado global, a navegação entre páginas e a abertura dos principais modais. As páginas representam os domínios de negócio; componentes reutilizáveis concentram a interface; hooks encapsulam estado e regras; serviços cuidam de integrações; utilitários concentram formatação, impressão e funções auxiliares.

O fluxo central é:

1. O usuário acessa o ambiente da oficina.
2. O sistema carrega clientes, veículos, peças, técnicos e ordens.
3. As OS são exibidas e movimentadas pelo Kanban.
4. `OSModal` cria ou edita uma ordem.
5. Peças, serviços, técnico, checklist, observações e dados financeiros são vinculados à OS.
6. A OS pode ser impressa por `printOS.ts` e renderizada por `PrintableInvoice.tsx`.
7. O checklist pode ser impresso separadamente por `printChecklist.ts`.

## 3. Estrutura do projeto

```text
src/
├── App.tsx
├── components/
├── context/
├── domain/
├── hooks/
├── modals/
├── pages/
├── services/
├── utils/
├── types.ts
├── types/
├── main.tsx
├── io.rs
├── lib.rs
└── main.rs
```

### Componentes

- `ActionMenu.tsx`: menu de ações contextuais.
- `ContextMenu.tsx`: menu de contexto para ações rápidas.
- `KanbanBoard.tsx`: quadro de ordens por status.
- `KanbanCard.tsx`: cartão individual da OS.
- `DroppableColumn.tsx`: coluna de destino do drag-and-drop.
- `InfiniteScroll.tsx`: carregamento incremental.
- `CRMDashboard.tsx`: painel do CRM.
- `PartCategorySelect.tsx`: seletor customizado de categoria de peça.
- `MarginIndicator.tsx`: indicador visual de margem.
- `PriceMarginBar.tsx`: barra de preço e margem.
- `PrintableInvoice.tsx`: renderização do conteúdo imprimível.
- `Sidebar.tsx`: navegação lateral.

### Páginas

- `CRMPage.tsx`: relacionamento e histórico de clientes.
- `ConfigPage.tsx`: configurações da oficina e da aplicação.
- `FinancialPage.tsx`: lançamentos, parcelas e acompanhamento financeiro.
- `PartsPage.tsx`: catálogo e resumo de peças.
- `ProcessPage.tsx`: acompanhamento das OS no fluxo de processos.
- `WorkshopPage.tsx`: contêiner do ambiente da oficina.

### Modais

- `OSModal.tsx`: criação e edição completa da Ordem de Serviço.
- `ChecklistModal.tsx`: checklist por categorias e impressão.
- `DatabaseModal.tsx`: gerenciamento de catálogos e técnicos.
- `ClientEditModal.tsx`: edição de clientes.
- `EntryModal.tsx` e `EditEntryModal.tsx`: lançamentos financeiros.
- `InstallmentModal.tsx`: parcelas.
- `ExportModal.tsx`: exportação de dados.
- `InputModal.tsx`, `ChoiceModal.tsx` e `ConfirmationModal.tsx`: interações genéricas.
- `DeleteConfirmationModal.tsx`: confirmação de exclusão.

### Hooks, serviços e utilitários

- Hooks: `useFinance.ts`, `useKeyboard.ts`, `usePagination.ts` e `useWorkshopData.ts`.
- Serviços: `cascadeService.ts` e `googleDrive.ts`.
- Utilitários: `helpers.ts`, `formatters.ts`, `audio.ts`, `sound.ts`, `printOS.ts` e `printChecklist.ts`.
- Integração nativa: `src-tauri/`, `src/io.rs`, `src/lib.rs` e `src/main.rs`.

## 4. Fluxo de Ordem de Serviço

`OSModal` é o núcleo operacional. Ele reúne cliente, veículo, serviços, peças, categoria, técnico, observações, valores e pagamentos. Ao selecionar uma peça do catálogo, a categoria pode ser preenchida automaticamente; os itens podem ser agrupados e os valores podem alimentar os indicadores de margem.

A OS é apresentada no Kanban por `KanbanBoard` e `KanbanCard`. O usuário pode abrir ações contextuais, editar a OS, mover o cartão entre colunas, filtrar por técnico e iniciar comunicação relacionada ao cliente.

A impressão usa os dados da própria OS. Isso inclui o técnico individual da ordem, em vez de depender somente de uma configuração global da oficina.

## 5. Impressão da OS

O módulo principal é `src/utils/printOS.ts`, apoiado por `PrintableInvoice.tsx` e pelos estilos de impressão.

### Comportamento atual

- Gera uma página inicial fixa de Termos e Condições.
- Insere a OS a partir da página seguinte.
- Formata dados do cliente, veículo, serviços, peças, técnico, valores e assinaturas.
- Agrupa peças por categoria.
- Permite quebra de categorias entre páginas.
- Repete o cabeçalho colorido da categoria quando necessário.
- Mantém o rodapé em fluxo normal para evitar páginas vazias.
- Ajusta o documento para papel A4.
- Permite impressão em navegador e ambientes nativos.

### Termos e Condições

A primeira página contém dez cláusulas. Entre as regras documentadas estão a taxa de diagnóstico de R$150, abatida quando o serviço é aprovado, e a cobrança de R$15 por dia quando a oficina aguarda peças fornecidas pelo cliente.

O último commit compactou a página para melhorar o encaixe em uma folha A4, reduzindo margens, espaçamento, altura de linha, tamanho da logo e distância dos divisores. Também foi adicionado o override `.terms-divider`.

### Estratégias de impressão

O histórico registra tentativas e correções utilizando `window.print()`, iframe, `window.open()` e Blob URL. Essas estratégias foram usadas para resolver bloqueios de popup, problemas de título do PDF, race conditions, preview do Chromium e impressão em ambiente nativo.

## 6. Impressão do checklist

`printChecklist.ts` gera a versão imprimível do checklist. O modelo foi alterado para inspeção por categoria, e `ChecklistModal.tsx` permite adicionar e remover itens, editar categorias e iniciar a impressão.

O histórico também registra a passagem explícita das configurações necessárias ao modal e a substituição de marcadores duplicados por círculos controlados via CSS.

## 7. Peças e categorias

O catálogo de peças passou a suportar categoria persistida. O sistema pode aprender a categoria no primeiro uso, preencher a categoria automaticamente na OS e exibir um seletor customizado por `PartCategorySelect`.

Na impressão, as peças são agrupadas por categoria, com cabeçalho colorido, bordas e tabela preparada para repetir o cabeçalho durante quebras de página. A página de peças possui CSS próprio em `styles-parts-print.css`.

A branch também registra geração de nomes dinâmicos para documentos, correção de valores em centavos e suporte à impressão em ambientes nativos.

## 8. Técnicos

O técnico deixou de ser apenas uma configuração global e passou a ser associado à OS. O catálogo é administrado no `DatabaseModal`, com cadastro, edição e exclusão.

O fluxo inclui autocomplete no `OSModal`, aprendizado automático de novos técnicos, migração de `settings.technician` para `catalogTechnicians`, badge no Kanban, filtro por técnico e impressão do técnico específico da ordem.

## 9. Margem e precificação

`MarginIndicator` e `PriceMarginBar` fornecem visualização da margem por item e da relação entre custo, preço e margem. O `OSModal` recebe esses indicadores e pode apresentar um resumo geral com valor mínimo sugerido baseado na margem desejada.

O histórico registra correção de multiplicação duplicada por 100 e tratamento de valores monetários armazenados em centavos.

## 10. Estado das features

| Feature | Estado observado | Observação |
|---|---|---|
| Impressão básica de OS | Implementada | Possui fluxo específico de impressão. |
| Termos na página 1 | Implementada | Página fixa com dez cláusulas. |
| Compactação para A4 | Implementada | Último commit da branch. |
| Quebra de categorias | Implementada | Cabeçalho repetido em novas páginas. |
| Impressão de peças | Implementada | Possui estilos e nomes próprios. |
| Categorias de peças | Implementada | Persistência, seleção e agrupamento. |
| Checklist por categoria | Implementada | Com impressão dedicada. |
| Técnicos por OS | Implementada | Catálogo, seleção, filtro e impressão. |
| Indicador de margem | Implementada | Integrado ao fluxo da OS. |
| CRM | Implementada | Página e dashboard próprios. |
| Financeiro e parcelas | Implementada | Páginas e modais específicos. |
| Drag-and-drop do Kanban | Implementada | Colunas e cartões dedicados. |
| Google Drive | Parcial/condicional | Depende de credenciais e integração configurada. |
| Sincronização externa | Deve ser validada | Conferir configuração do ambiente antes de produção. |

## 11. Bugfixes relevantes

- Correção de página em branco na impressão.
- Remoção de `position: fixed` problemático.
- Reconstrução do rodapé como fluxo normal.
- Correções de `page-break-inside` em blocos de categoria.
- Repetição de cabeçalho nas quebras de página.
- Correções de race conditions e timeouts.
- Remoção de impressão automática que causava loading infinito.
- Correções de popup e Blob URL.
- Correção de título e nome dinâmico dos PDFs.
- Correção de valores divididos por 100.
- Resolução de conflitos em `styles.css`.
- Correção de estilos de categorias e temas.
- Correção de marcadores duplicados no checklist.
- Migração do técnico global para o técnico da OS.
- Correção de salvamento de observações públicas.

## 12. Pontos de atenção

1. Validar a impressão em Chromium, navegador comum e ambiente Tauri.
2. Testar OS com muitas peças e categorias suficientes para gerar várias páginas.
3. Testar uma categoria iniciando no final da página e continuando na seguinte.
4. Confirmar que os Termos e Condições permanecem em uma única folha A4.
5. Verificar nomes de arquivo com caracteres especiais em cliente, veículo e placa.
6. Validar valores zero, descontos, parcelas e valores armazenados em centavos.
7. Testar OS sem técnico, sem peças, sem serviços e sem observações.
8. Confirmar migração de técnicos antigos para `catalogTechnicians`.
9. Testar checklist vazio, checklist longo e categorias sem itens.
10. Confirmar credenciais antes de testar Google Drive ou sincronização.

## 13. Comandos sugeridos

```bash
npm install
npm run dev
npm run build
npm run lint
```

Para a versão nativa, utilizar o fluxo de desenvolvimento e build configurado pelo projeto Tauri, verificando previamente as dependências Rust instaladas.

## 14. Conclusão

`printing-overhaul` é uma evolução ampla da aplicação, não apenas uma alteração visual. A branch melhora a geração de documentos, trata paginação, organiza peças por categoria, vincula técnicos à OS, amplia o checklist e adiciona informações de margem e precificação.

Antes de promover as alterações para `main`, recomenda-se executar testes manuais de impressão e uma revisão de regressão nos fluxos de OS, peças, checklist, técnicos, financeiro e sincronização.

> Este relatório foi elaborado a partir da estrutura de arquivos, histórico de commits e metadados disponíveis no repositório. A confirmação de cada função interna exige análise integral do código-fonte e não apenas da árvore de arquivos.