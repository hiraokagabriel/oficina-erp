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

### Risco de perda de dados (prioridade máxima; mitigado na Fase 0, ver seção 3)

Os itens abaixo descrevem o estado **antes** da Fase 0 (referências `arquivo:linha` do commit `0a4be3e`).

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
Implementado e publicado (commits `4c9651a`, `5e9419c`, `9c345b1`, `c724c29`, `01c816d`). Compilação e testes unitários passam; **falta validar na interface** com banco sintético e com dois PCs.

- [x] `load_database` falhar com erro explícito e aviso na tela, em vez de devolver `{}`.
- [x] Tratar `success: false` no salvamento e avisar o usuário (retentativas, banner "Não salvo", gravar ao fechar).
- [x] Backups rotativos (vários, com data) em `%LOCALAPPDATA%`, no lugar de um único `.bak`.
- [x] `schemaVersion` no banco e migrações em um só lugar, fora do `App.tsx` (`src/utils/migrations.ts`).
- [x] Detecção de conflito (`revision` + `history` no `meta`), diálogo com cópia de recuperação e verificação a cada 30 s e ao focar a janela.
- [x] Tirar token e API key do Google do `database.json` e do backup (ficam no `localStorage` de cada PC).

**Dívida técnica**
- [x] Remover o código morto listado na seção 2 (feito: `src/domain/*`, `src/types/index.ts`, Rust solto em `src/`, `PrintableInvoice`, `InputModal`, `EditEntryModal`, `sound.ts`, fallback `window.electron`). Segue o código comentado do `App.tsx` e as props `onPrintClient`/`onPrintShop`, fora deste item.
- [x] Migrações fora do `App.tsx` (`src/utils/migrations.ts`) e regra de finalização, parcelamento, pagamento e reabertura de OS extraída, sem mudar comportamento, para `src/services/osFinanceService.ts`. Segue no `App.tsx`: roteamento, ~20 estados de modal e os demais handlers.
- [x] Eliminar os `any` do código de produção e unificar os tipos em `src/types.ts` (restam 8 `any` em `migrations.test.ts`).
- [x] Trocar vínculo por nome por ids (cliente, veículo, item de catálogo, técnico). Plano 4.6 completo, **ativo desde o schema v2** (hoje `CURRENT_SCHEMA_VERSION = 3`, `STEPS = [v0ToV1, v1ToV2, v2ToV3]`):
  - OS novas e editadas gravam `clientId`, `vehicleId`, `technicianId` e `catalogItemId`; veículos novos ganham id; nome repetido de cliente abre o seletor "Qual cliente?" no cadastro da OS.
  - O cascade (renomear cliente, item ou técnico) casa por id e mantém os textos atualizados, com reserva pelo nome só quando ele é único.
  - Dívida e CRM agrupam por cliente resolvido por id (reserva `nome:<normalizado>`).
  - Ao abrir um banco v0/v1, `v1ToV2` liga ids nas OS antigas e nos veículos (só acrescenta; textos e ledger intactos), guarda antes o backup `pre-v<N>` e o toast informa quantas OS ficaram sem cliente vinculado (homônimos empatados ou cliente fora do cadastro; seguem funcionando pelo nome).
  - **Implantação:** versão antiga do app abre o banco v2 somente leitura, então atualizar todos os PCs no mesmo dia. Ordem: atualizar e abrir um PC, esperar a sincronização da pasta, depois atualizar os outros.
  - **Reversão:** restaurar o backup `pre-v1` (ou o da versão de origem) de `%LOCALAPPDATA%\com.oficinapro.app\backups` e usar a versão antiga do app.
- [x] Dinheiro em centavos exatos (`Money.fromFloat`, `splitCents`) e datas sem deslocamento de fuso (`src/utils/dates.ts`). Ficou de fora: os filtros por mês do Financeiro ainda leem o trecho UTC da data ISO (seguro de UTC-12 a UTC+11) e lançamentos antigos gravados à meia-noite UTC continuam aparecendo um dia antes.
- [x] Testes de parcelamento, finalização/reabertura, pagamento, cascade, helpers, datas e contas a receber (`npm test`, 166 testes, fixtures sintéticas, também em vários fusos). Os que sobraram da seção 3.1 **fixam o comportamento atual, inclusive os defeitos**. Falta validar o fluxo na interface.
- [ ] Atualizar o README.

Critério de pronto: abrir o app nos dois PCs, forçar um salvamento concorrente e ver o aviso de conflito sem perder dado; `npm run build` limpo.

### Fase 1: Contas a receber
Implementada e testada (166 testes); **falta validar na interface** com banco sintético.

- [x] Adiantamento gera lançamento no caixa ("Adiantamento OS #N - cliente", já recebido, ligado por `WorkOrder.advanceEntryId`). Editar o valor atualiza o lançamento, zerar o remove, excluir a OS o remove, reabrir a OS o mantém. A receita à vista e as parcelas passam a ser calculadas sobre `total - adiantamento`. Só vale para OS ainda não finalizadas: **não há correção retroativa** de OS finalizadas com adiantamento (evita contar duas vezes).
- [x] Conceito único de "pago": `paymentDate` (`src/services/receivables.ts`: recebido, a receber ou atrasado, por dia local; vencimento = `dueDate`, ou `effectiveDate` se não houver). `isPaid` deixou de ser gravado e está marcado como `@deprecated`.
- [x] Financeiro: cards "A receber" (ainda não vencido) e "Atrasado" (totais gerais, fora do filtro de mês) e seção "A receber" com vencimento, situação em texto e botão "Marcar como pago". Os KPIs de saldo, receitas, despesas e ticket médio **não mudaram**.
- [x] CRM: "Em aberto" e "Atrasado" por cliente (lista e detalhe) e card "Maiores devedores" no dashboard. A dívida é ligada pelo **nome** do cliente na OS (homônimos se somam); lançamentos manuais sem OS ficam de fora.
- [x] Consistência da OS: ao pagar a última parcela a OS vai a `FINALIZADO` sozinha; se uma parcela voltar a pendente, volta a `AGUARDANDO_PAGAMENTO`. Arquivar uma OS finalizada não apaga mais as receitas.

Critério de pronto: em qualquer dia, ver o total a receber e a lista de atrasados.

### Fase 2: Prazo e agenda
Implementada e testada (357 testes e verificação no navegador com banco sintético). **Muda o formato do banco: schema v3** (coleção nova `appointments`), então todos os PCs devem atualizar **uma vez só, direto para a v3**, no mesmo dia.

- [x] Previsão de entrega na OS (`WorkOrder.expectedDate`, só a data), visível no Kanban (selo em texto), em Processos (coluna ordenável e filtro "Só atrasadas"), no cabeçalho da Oficina ("N atrasadas · M com entrega hoje") e na impressão da OS (linha "PREVISÃO DE ENTREGA" só quando houver).
- [x] Destaque de OS atrasadas: atrasada = previsão já passou (por dia local) e status Aprovado ou Em Serviço (`src/services/schedule.ts`). Orçamento, Aguardando Pagamento, Finalizada e Arquivada nunca atrasam.
- [x] Agenda de entrada de veículos: aba **Agenda** (lista por dia, semana de segunda a domingo com navegação, "Hoje" e "Amanhã" em destaque). Agendamento com cliente, telefone, veículo, data, hora opcional e motivo; ações Criar OS, Compareceu, Faltou, Cancelar, Reagendar, Editar e Excluir. "Criar OS" abre a OS pré-preenchida e, ao salvar, marca o agendamento como Compareceu e liga a OS (`workOrderId`). O motivo vai para a **Obs. Interna** da OS, na linha de baixo das notas que o cliente já tem (nunca para as Observações da OS, que saem impressas). Cliente homônimo exige escolha; cliente não cadastrado fica só como texto, sem criar cadastro. Renomear o cliente atualiza os agendamentos dele por id.

Critério de pronto: saber o que está atrasado e o que entra amanhã, sem planilha externa.

Segue aberto da Fase 2: `.btn` primário no tema pastel tem contraste 3,46:1 na ponta rosa do gradiente (estilo global antigo, decisão de design); F2 só abre "Nova OS" na aba Oficina; o modal de agendamento não prende o foco do Tab; impressão real em A4 e janela Tauri real não foram testadas.

### Fase 3: Margem e preço
Implementada e testada (561 testes e verificação no navegador com banco sintético). **Sem mudança de formato do banco** (só `WorkshopSettings.targetMargin?`, opcional).

- [x] Meta de margem global em Config (padrão 70%, inteiro de 1 a 99; vazio restaura o padrão). Substitui a "margem mínima" local do modal da OS.
- [x] Custo opcional por item (OS e catálogo). **Custo vazio ou 0 = "não informado"**: o item fica fora da conta de margem e é sinalizado ("N itens sem custo: margem parcial"). Nunca grava `cost: 0`.
- [x] Níveis de margem (`src/services/margin.ts`): Sem custo, Na meta (≥ meta), Atenção (≥ metade da meta), Abaixo da meta. Selo no cartão do Kanban e indicador no modal da OS.
- [x] Sugestão de preço: "Preço para atingir a meta" (arredonda para cima, nunca fica abaixo da meta) e preço do histórico (`src/services/pricing.ts`: mediana das vendas dos últimos 12 meses, mínimo 3 vendas, só sugere; botão "Usar").
- [x] Relatório de margem: aba **Margem** no Financeiro (`MarginReport`), por serviço, peça e categoria, com OS abaixo da meta e itens sem custo. Escopo: OS Finalizadas e Aguardando pagamento, por data de criação, no mesmo mês/ano do filtro do Financeiro.

Segue aberto da Fase 3: `os.profitMargin` ainda é gravado por `helpers.ts` mas o Kanban já não o usa; digitar "7,5" na meta grava "7" no disco enquanto mostra erro; item de catálogo antigo com `cost: 0` mostra "0" no campo Custo; a 1366 px as tabelas da aba Margem rolam na horizontal dentro do cartão; botão Mensal/Anual do Financeiro com contraste baixo no tema escuro.

### Autopreenchimento de veículos
Implementado (sem mudança de formato do banco). Base brasileira gerada da API pública da FIPE (`npm run vehicles:build`, cache em `scripts/.cache/`, que retoma de onde parou) e embutida em `src/data/veiculos-br.json`, carregada sob demanda. Campo `VehicleCombobox` no modal da OS, cadastro de cliente, gerenciador de cadastros e agendamento: sugestões em grupos (veículos do cliente, já cadastrados na oficina, base brasileira), busca em qualquer ordem ("civic 2.0 2015"), tolerância a 1 erro de digitação, seletor de ano em segundo passo quando o ano não foi digitado, texto livre sempre permitido. Formato: "Marca Modelo Cilindrada Válvulas Ano".

- [ ] Completar a base: a FIPE limita chamadas anônimas por dia (429) e a primeira geração parou em 74 marcas e 4.738 versões. Faltavam Volkswagen, Toyota, Renault, Nissan, Peugeot, Mitsubishi, Volvo, Porsche, Suzuki, MINI e Subaru. Rodar `npm run vehicles:build` de novo (ou usar token gratuito do fipe.api.br).
- [ ] Conferir os termos de uso da FIPE e da API parallelum (a atribuição aparece na Config).

---

## 3.1 Comportamentos suspeitos registrados nos testes

Os testes marcam os que seguem abertos com `// COMPORTAMENTO ATUAL (suspeito)` e os já corrigidos com `// CORRIGIDO (4.5)` ou `// CORRIGIDO (5.4)`. Quem corrigir um defeito deve atualizar o teste junto.

**Já corrigidos**
- (4.5) O vencimento no dia 31 pulava de mês; agora cai no último dia do mês (31/jan, 28/fev, 31/mar).
- (4.5) `Money.fromFloat(1.005)` dava 100; agora 101. `'YYYY-MM-DD'` em `createEntry` virava meia-noite UTC; agora é meio-dia local. A divisão de lançamentos parcelados perdia o resto; agora soma exato.
- (5.4) Marcar uma parcela como paga só sincronizava a OS pela 1ª parcela e pagar todas as parcelas não finalizava a OS; agora a OS é finalizada ao pagar a última e volta a `AGUARDANDO_PAGAMENTO` se uma parcela for desmarcada.
- (5.4) Arquivar uma OS finalizada pedia a restauração financeira e apagaria as receitas; agora só muda o status.

**Dinheiro e parcelas (abertos)**
- O pagamento à vista usa o `createdAt` da OS como data de competência da receita, e não deixa `paymentMethod` como `SINGLE`.
- Editar uma OS já finalizada recalcula o total sem atualizar o lançamento no Ledger.
- `config` do parcelamento não é validado: 0 parcelas gera lista vazia e quebra o `App` (lê `newEntries[0]`); data inválida lança erro; valores negativos são aceitos.
- Adiantamento igual ao total da OS: o restante é 0 e o app cria um lançamento (ou parcelas) de R$ 0,00.

**Reabrir e desarquivar OS**
- `restoreFinancial` apaga qualquer lançamento com o mesmo `groupId`, inclusive de outra origem, e reabre a OS em silêncio se o `financialId` estiver órfão.
- Desarquivar leva a OS para `ORCAMENTO`, mesmo que ela já tenha financeiro lançado (as receitas continuam intactas, mas a OS não aparece como `AGUARDANDO_PAGAMENTO`). Decisão do usuário: **manter assim por enquanto**. Melhoria possível: guardar o status anterior à arquivação (campo opcional novo na OS) e voltar a ele.

**Vínculo por nome (item "trocar nome por ids")**

Corrigidos no código (4.6, testes `CORRIGIDO (4.6)`; valem para OS com ids, isto é, as salvas depois da 4.6 ou migradas para o schema v2):
- O cascade casava cliente e item por texto, sensível a caixa, e trocava só a 1ª ocorrência na descrição do Ledger ("Mari" corrompia "Mariana"); agora casa por id e troca o trecho exato `OS #N - <nome>` de todas as parcelas, só nos lançamentos das OS do cliente.
- Veículos eram casados por índice (remover o 1º reescrevia a OS do Gol como Uno); agora por `vehicleId`, e veículo removido deixa o texto da OS intacto. Placa vazia deixou de gerar "modelo - ".
- `learnClientData` fundia clientes homônimos e `learnCatalogItems` reusava o id do item da OS; foram substituídos por `linkClient` e `linkCatalogItems`. Renomear técnico agora propaga para as OS.

Segue como está (decisões do dono):
- O cascade atualiza também OS já finalizadas e arquivadas (a impressão mostra o nome atual). Mudança só de preço no catálogo não propaga; o preço da OS nunca muda. O aprendizado de cadastro não atualiza preço do catálogo.
- Descrições antigas do Ledger não são migradas.

Limitações com o schema v2 ativo:
- A migração liga pelo nome quando é único ou desempata por placa; OS de homônimo sem desempate ficam sem `clientId`, seguem pelo nome, o cascade não as toca e elas ficam fora dos totais por cliente do CRM (o histórico do cliente ainda as mostra pela reserva do texto, então a mesma OS pode aparecer no histórico dos dois homônimos).
- `resolveClientId` percorre o cadastro por OS (O(OS × clientes)); aceitável hoje, indexar se o banco crescer.

## 3.2 Teste de interface (2026-10-16)

Feito no navegador (Playwright com Edge) contra o front real, com o Rust do Tauri **simulado em JS** e um banco **sintético**. Cobriu a Fase 0 (migração, tela de erro, somente leitura, conflito, recarga silenciosa, divergência, segredos), a Fase 1 (cards e lista "A receber", pagar parcelas finalizando a OS, adiantamento) e a 4.6 (seletor de homônimos, ids gravados, cascade, CRM). **Passou em tudo, com 3 correções feitas a partir dele:**
- Bug grave: a verificação periódica de mudança externa nunca agia, porque `saveTimeoutRef` não voltava a `null` ao disparar o debounce e `hasPendingEdits()` ficava sempre verdadeiro. Corrigido em `DatabaseContext.tsx` e reprovado no mesmo cenário (toast "Dados atualizados" e diálogo de divergência).
- No tema pastel o texto "Atrasado" tinha contraste de 2,7:1; agora 5,9:1 (Financeiro) e 5,0:1 (lista do CRM).
- No CRM com o dashboard visível a lista de clientes encolhia a altura 0; agora tem altura própria e a página rola.

Segue aberto: `installmentConfig.description` da OS parcelada guarda o nome antigo do cliente depois de uma renomeação (as parcelas do caixa e `clientName` são atualizados); em janela estreita (800 px) a tabela "A receber" e a barra do Financeiro cortam à direita; o verde dos KPIs no tema pastel tem contraste 2,4:1 (cor do tema, anterior à Fase 1).

**Não coberto:** o Rust/Tauri real (backups, cópias de recuperação, fechar a janela com `onCloseRequested`), a migração v1 → v2 (não ativada), impressão, Drive, checklist, Processos, Peças e exportação. Esses precisam de teste manual no `npm run tauri dev` com um banco sintético.

## 4. Fora de escopo (por enquanto)

Nuvem, servidor e banco online; distribuir ou vender para outras oficinas; estoque e fornecedores; WhatsApp automático (o botão manual continua); login e permissões; assinatura digital (a assinatura segue física nos impressos).

## 5. Decisões em aberto

- ~~Mecanismo de conflito~~: decidido, `revision` (uuid) com `history` dentro do `meta` do JSON, conferida no Rust ao salvar. Arquivo de trava, mtime e hash foram descartados.
- ~~Framework de testes~~: decidido, Vitest.
- ~~Adiantamento~~: decidido, conta como receita recebida na data do adiantamento; a receita final da OS é `total - adiantamento`.
- **Regime dos KPIs do Financeiro:** hoje `saldo` e `receitas` somam todo crédito do mês pelo vencimento, **inclusive parcelas ainda não pagas**. Foi mantido de propósito e os cards "A receber" e "Atrasado" foram acrescentados. Decidir depois se `saldo` e `receitas` devem passar a contar só o que foi recebido (caixa).
