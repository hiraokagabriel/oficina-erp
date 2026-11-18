# Financeiro > Visão geral: repaginação "Três caixas" (direção B)

Aprovada pelo dono em 2026-11-18. Especificação do `ux-designer`. Só a tela de computador (≥ 800 px); no celular o Financeiro continua "Disponível no computador".

## Regra dos números (decisão do dono, 2026-11-18)

- Entrou / Saiu / Sobrou: só o que foi **pago**, pelo dia do pagamento (`src/services/financeKpis.ts`).
- Peças e serviços e Valor médio por OS: só OS finalizadas.
- Despesas: campo novo opcional `LedgerEntry.pending?: true` (só DEBIT), sem migração. Prevista = `pending` ou (sem `paymentDate`, sem `pending` e vence depois de hoje). Paga = o resto; dia = `paymentDate` ou vencimento. "Paguei" grava `paymentDate` e tira `pending`; "Desfazer" grava `pending` e tira `paymentDate`. Dono e Recepção podem marcar. Ao lançar saída: "Já paguei" ou "Vou pagar em [data]".

## Layout (≥ 960 px; até 960 px vira uma coluna na mesma ordem)

```
+--------------------------------------------------------------------------+
| Financeiro          [Mensal|Anual] [nov/2026]  [Exportar] [Novo lançamento]|
| [Visão geral] [Margem]                                                    |
+--------------------------------------------------------------------------+
| (!) Atenção: 2 contas vencidas somam R$ 850,00.           [Ver contas]   |
+--------------------------------------------------------------------------+
| DINHEIRO DE NOVEMBRO                                  SOBROU R$ 5.300,00 |
| Entrou  R$ 12.400  [######################--------]                      |
| Saiu  − R$  7.100  [#############-----------------]                      |
| Conta só o que já foi pago, pelo dia do pagamento.                        |
+------------------------------------+-------------------------------------+
| CONTAS PARA PAGAR      R$ 2.300,00 | PARA RECEBER            R$ 4.000,00 |
| (o) R$ 850 vencido                 | (o) R$ 1.200 atrasado               |
| -- Vencidas (2) ------------------ | (o) 02/11 OS #212 Silva   R$ 600   |
| (o) 05/11 Aluguel   R$ 600 [Paguei]|     Atrasada há 16 dias [Receber]  |
| -- Vencem em novembro (3) -------- | ( ) 25/11 Parc. 2/3 Lima  R$ 400   |
| ( ) 20/11 Fornec.   R$ 900 [Paguei]| ( ) OS #230 Souza         R$ 800   |
|           [Ver todas (5)]          |           [Ver todas (7)]           |
+------------------------------------+-------------------------------------+
| Entrou e saiu por dia (barras)     | Peças e serviços (OS finalizadas)   |
|                                    | [=====Peças 58%=====|=Serv 42%=]    |
|                                    | Valor médio por OS: R$ 640 (18 OS)  |
+------------------------------------+-------------------------------------+
| Lançamentos (entradas e saídas) [Todos|Entradas|Saídas]                   |
+--------------------------------------------------------------------------+
```

## Tokens novos (`src/styles-tokens.css`; contraste de texto ≥ 4,5:1 sobre `--surface-1`, medir no `verificador`)

| token | Escuro | Pastel | uso |
|---|---|---|---|
| `--fin-in` / `--fin-in-text` | `var(--success)` / `var(--text-success)` | idem (#047857) | entrou, recebido |
| `--fin-out` / `--fin-out-text` | `#94A3B8` / `#CBD5E1` | `#64748B` / `#475569` | saiu (não é alarme; vermelho só no vencido) |
| `--fin-due` / `--fin-due-text` | `var(--warning)` / `var(--text-warning)` | idem (#7A5200) | a vencer |
| `--fin-late` / `--fin-late-text` | `var(--status-atrasado)` / `var(--status-atrasado-text)` | idem (#B91C1C) | vencido, atrasado |
| `--fin-parts` / `--fin-services` | `#38BDF8` / `#A78BFA` | `#0284C7` / `#7C3AED` | categorias |
| `-bg` de cada um | `color-mix(... 14%, transparent)` | 12% | fundos de selo e faixa |

CSS novo em `src/styles-finance.css` (importado em `src/main.tsx` depois de `styles-receivables.css`). Componentes visuais em `src/components/finance/`. `FinancialPage.tsx` só compõe e mantém: `payClick` (duplo clique), `OnlineOnlyButton` (`busyLabel`/`busyKey`), `canMargin` (só o Dono vê "Lucro"), `canDeleteEntry`, `FIN_TABLE_OFFLINE_BANNER`, abas WAI-ARIA. Sem estilos inline (exceto a custom property `--w` das barras).

## Componentes

1. **`FinAlertStrip`**: só se houver conta vencida ou valor atrasado. Borda esquerda 5 px `--fin-late`, fundo `--fin-late-bg`, ícone `alerta`. Até 2 frases ("Atenção: 2 contas vencidas somam R$ 850,00." / "3 clientes estão atrasados: R$ 1.200,00."). Botões "Ver contas" / "Ver quem deve" (altura `--control-h`) rolam e focam o `h2` da caixa (`tabIndex={-1}`). Sem `aria-live`.
2. **`FinResultPanel`**: "Dinheiro de novembro" (ano: "Dinheiro de 2026"); à direita, `--fs-2xl` negrito, "Sobrou R$ X" (`--fin-in-text`) ou "Faltou R$ X" (`--fin-late-text`); para o Dono, linha "Lucro do período". Linhas "Entrou" e "Saiu − R$" com barra de 12 px (maior = 100%), barras `aria-hidden`, valor sempre em texto. Nota `--fs-sm`/`--text-2`: "Conta só o que já foi pago, pelo dia do pagamento." Carregando: skeleton por classe.
3. **`FinDueList`** (usado 2 vezes): props `title`, `kind: 'pay'|'receive'`, `total`, `lateTotal`, `groups: {label, rows}[]`, `actionLabel`, `onAction(row)`, `emptyText`, `limit = 6`. `<section aria-labelledby>` + `<h2>`, total `--fs-xl`, selo "R$ 850 vencido" (ícone + texto). `<ul>`; cada `<li>`: luz `.status-light` (`--late`/`--due`/`--open`), data, descrição truncada (com `title`), valor, situação em texto, botão. Grupos `h3`: Pagar "Vencidas (N)" e "Vencem em novembro (N)"; Receber "Atrasadas", "A vencer", "Esperando pagamento" (`pendingOS`, "Sem data"). 6 linhas e "Ver todas (N)" (`aria-expanded`). Botões ≥ 44 px: "Paguei" (ícone `pagar`) e "Receber" (ícone `receber`, `btn-success`), `aria-label` com a descrição. Depois de pagar, foco na linha seguinte (ou no título). Desfazer fica em Lançamentos.
4. **`FinFlowChart`**: Recharts `BarChart`, `isAnimationActive={false}`, duas `Bar` (`var(--fin-in)`, `var(--fin-out)`), grade só horizontal, eixo Y `formatAxisBRL`, tooltip por classe (`wrapperClassName`). Título fixo "Entrou e saiu por dia" (ano: "por mês"), todos os dias/meses do período (inclusive zerados). Legenda em texto; resumo `<p>` para leitor de tela.
5. **`FinMixBar`**: barra empilhada CSS de 20 px com "Peças 58% R$ X" e "Serviços 42% R$ Y" (legenda repete o texto). Abaixo: "Valor médio por OS: R$ 640" e "18 OS finalizadas em novembro". Título "Peças e serviços (OS finalizadas)". Sai o PieChart, `COLORS`, `PIE_COLORS`.
6. **Lançamentos**: título "Lançamentos (entradas e saídas)", filtro "Todos | Entradas | Saídas", coluna Data com "Pago em 12/11" ou "Vence em 20/11", despesa com selos Pago/Pendente e "Paguei"/"Desfazer pagamento", paginação e vazio por classe (`.fin-pager`, `.fin-empty`), botão "Novo lançamento", título da página "Financeiro".

Abrangência escrita nas caixas: Pagar "Vencidas (qualquer data) e as que vencem em novembro."; Receber "Todas as datas."

Vazios: Pagar "Nenhuma conta para pagar. Tudo em dia." (ícone `check`); Receber "Ninguém deve nada agora."; Fluxo "Nenhum dinheiro entrou ou saiu em novembro."; Peças "Nenhuma OS finalizada em novembro."; Resultado zero "Sobrou R$ 0,00" + "Ainda não há pagamentos neste mês."

Acessibilidade: Tab = período, Exportar, Novo lançamento, abas, aviso, listas, filtro, tabela; foco `--focus-ring`; cor sempre com ícone e texto; fonte mínima 15 px nas linhas (`--fs-sm`); sem animação ao abrir "Ver todas".

## Rodadas (em série: 2 a 5 mexem em `FinancialPage.tsx`)

| R | Quem | O quê |
|---|---|---|
| 0 | dev | Despesa paga/prevista (`pending`), `togglePayment` para DEBIT (cliente e função `money`), EntryModal "Já paguei / Vou pagar em", contrato de dados (`kpiData`, `chartDataFluxo {name, entrou, saiu}` com todos os dias, `chartDataPie` só finalizadas, `payables {overdue, dueInPeriod, totais}`) |
| 1 | ui-dev | Tokens `--fin-*`, `styles-finance.css`, variantes `.status-light--late/--due/--open` (sem mudança visível) |
| 2 | ui-dev | `FinAlertStrip` e `FinResultPanel` no lugar da `.fin-stats` |
| 3 | ui-dev | `FinDueList` para Pagar e Receber (troca a tabela "A receber") |
| 4 | ui-dev | `FinFlowChart` e `FinMixBar`; sai o PieChart |
| 5 | ui-dev | Lançamentos; apagar CSS órfão (`.fin-stats`, `.receivables-table`, `.fin-receber`, `#a8453a`) sem afetar a aba Margem |
| 6 | ux-revisor / verificador | 1280 e 800 px, Escuro e Pastel, contraste, Tab, "Paguei" com duplo clique, Recepção (sem "Lucro", sem Excluir), offline |

Nota (B5): a lista de Lançamentos filtra pela data do lançamento (`effectiveDate`) e os totais (KPIs e gráficos) pelo dia do pagamento; a coluna "Pago em" mostra a diferença quando as duas datas caem em meses diferentes.
