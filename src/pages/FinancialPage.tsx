import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LedgerEntry, ChartFluxoPoint, ChartPiePoint, WorkOrder, WorkshopSettings, CatalogItem } from '../types';
import { MarginReport } from '../components/MarginReport';
import { Icon } from '../components/ui/Icon';
import { FinAlertStrip } from '../components/finance/FinAlertStrip';
import { FinResultPanel } from '../components/finance/FinResultPanel';
import { FinDueList } from '../components/finance/FinDueList';
import { FinFlowChart } from '../components/finance/FinFlowChart';
import { FinMixBar } from '../components/finance/FinMixBar';
import { Money as MoneyUtil } from '../utils/helpers';
import { parseYearDraft, YEAR_INVALID_MESSAGE } from '../services/financeView';
import { shouldIgnoreStep } from '../services/kanbanCardView';
import { useAccess } from '../hooks/useAccess';
import { OnlineOnlyButton } from '../components/OnlineOnlyButton';
import { FIN_TABLE_OFFLINE_BANNER } from '../services/moneyOfflineView';
import { useDatabase } from '../context/DatabaseContext';
import { summarizeReceivables, getClientReceivables } from '../services/receivables';
import type { ExpectedExpenses } from '../services/financeKpis';
import type { Payables } from '../services/financeFlow';
import { isDebitPaid, debitPaidDay, getDueDate, toLocalDay } from '../services/expenseStatus';
import { buildPayGroups, buildReceiveGroups, shortDay } from '../services/financeDueView';
import type { FinDueRow } from '../services/financeDueView';

// Os dados dos gráficos vêm em reais (float); o texto sai no formato brasileiro via Money.
const brl = (v: number | string): string => MoneyUtil.format(MoneyUtil.fromFloat(Number(v)));

const ITEMS_PER_PAGE = 20;

/** "novembro" (mês) ou "2026" (ano): texto do período nos títulos e nos vazios. */
const periodText = (month: string, isYear: boolean): string =>
  isYear ? month.slice(0, 4) : new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });

interface FinancialPageProps {
  isLoading: boolean;
  kpiData: { saldo: number; receitas: number; despesas: number; ticketMedio: number; finalizedCount: number; };
  /** Saídas ainda não pagas (financeKpis.ts). Não é mais usado na tela: as contas vêm de `payables`. */
  expectedExpenses: ExpectedExpenses;
  /** Contas a pagar: vencidas (qualquer data) e as que vencem no período. */
  payables: Payables;
  chartDataFluxo: ChartFluxoPoint[];
  chartDataPie: ChartPiePoint[];
  ledger: LedgerEntry[];
  /** Ledger COMPLETO (sem filtro de mês/tipo): base do "Para receber". */
  allLedger: LedgerEntry[];
  Money: { format: (val: number) => string; toFloat: (val: number) => number; };
  onOpenExport: () => void;
  onOpenEntry: () => void;
  onEditEntry: (id: string) => void;
  onDeleteEntry: (entry: LedgerEntry) => void;
  /** Abre a janela da OS (usado pelo "Editar na OS" dos adiantamentos). */
  onOpenOS: (os: WorkOrder) => void;
  onTogglePayment: (id: string) => void;
  /** Receber uma OS em Aguardando Pagamento que ainda não tem lançamento (abre o fluxo de finalizar). */
  onReceiveOS: (os: WorkOrder) => void;
  selectedMonth: string;
  onMonthChange: (val: string) => void;
  viewMode: 'MONTH' | 'YEAR';
  setViewMode: (mode: 'MONTH' | 'YEAR') => void;
  filterType: 'ALL' | 'CREDIT' | 'DEBIT';
  setFilterType: (type: 'ALL' | 'CREDIT' | 'DEBIT') => void;
  /** Aba "Margem": OS, configurações (meta) e catálogos. */
  workOrders: WorkOrder[];
  settings: WorkshopSettings;
  catalogParts: CatalogItem[];
  catalogServices: CatalogItem[];
}

export const FinancialPage: React.FC<FinancialPageProps> = ({
  isLoading, kpiData, payables, chartDataFluxo, chartDataPie, ledger, allLedger, Money,
  onOpenExport, onOpenEntry, onEditEntry, onDeleteEntry, onOpenOS, onTogglePayment, onReceiveOS,
  selectedMonth, onMonthChange, viewMode, setViewMode,
  filterType, setFilterType,
  workOrders, settings, catalogParts, catalogServices
}) => {
  const access = useAccess();
  const canMargin = access.can('finance.margin');
  const canDeleteEntry = access.can('ledger.delete'); // só o Dono (o botão some para a Recepção, não fica cinza)
  const offlineCloud = useDatabase().cloud?.online === false;
  const [currentPage, setCurrentPage] = useState(1);
  // Lançamento de adiantamento -> OS dona (fica travado aqui; edição só pela OS).
  const advanceOwners = useMemo(() => {
    const map = new Map<string, WorkOrder>();
    for (const os of workOrders) {
      for (const a of os.advances ?? []) map.set(a.entryId, os);
      if (os.advanceEntryId) map.set(os.advanceEntryId, os);
    }
    return map;
  }, [workOrders]);
  // Rascunho do ano (modo Anual): só vale ao sair do campo ou no Enter.
  const [yearDraft, setYearDraft] = useState(selectedMonth.slice(0, 4));
  const [yearError, setYearError] = useState(false);
  useEffect(() => { setYearDraft(selectedMonth.slice(0, 4)); setYearError(false); }, [selectedMonth, viewMode]);
  const commitYear = () => {
    const y = parseYearDraft(yearDraft);
    if (y === null) {
      setYearError(true);
      setYearDraft(selectedMonth.slice(0, 4));
      return;
    }
    setYearError(false);
    onMonthChange(`${y}-${selectedMonth.slice(5, 7) || '01'}`);
  };

  // Trava do duplo clique em Receber/Marcar como pago: a linha some e a de baixo sobe para o mesmo lugar.
  const lastPayAt = useRef<number | null>(null);
  const payClick = (e: React.MouseEvent, id: string) => {
    if (e.detail > 1) return;
    const now = Date.now();
    if (shouldIgnoreStep(lastPayAt.current, now)) return;
    lastPayAt.current = now;
    onTogglePayment(id);
  };

  const [tabState, setTab] = useState<'GERAL' | 'MARGEM'>('GERAL');
  // Sem permissão de margem (Recepção) não há abas: só a Visão geral.
  const tab = canMargin ? tabState : 'GERAL';

  // Setas, Home e End alternam as abas (padrão WAI-ARIA); o foco acompanha a aba ativa.
  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 'GERAL' : e.key === 'End' ? 'MARGEM' : tab === 'GERAL' ? 'MARGEM' : 'GERAL';
    setTab(next);
    document.getElementById(next === 'GERAL' ? 'fin-tab-geral' : 'fin-tab-margem')?.focus();
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [ledger.length, filterType, viewMode, selectedMonth]);

  const isYear = viewMode === 'YEAR';
  const period = periodText(selectedMonth, isYear);
  const todayDay = toLocalDay(new Date());

  // "Para receber" é geral: não depende do mês/ano nem do filtro de tipo.
  const receivables = useMemo(() => summarizeReceivables(allLedger, todayDay, workOrders), [allLedger, workOrders, todayDay]);
  const lateClients = useMemo(
    () => getClientReceivables(workOrders, allLedger, todayDay).ranking.filter(c => c.atrasado > 0).length,
    [workOrders, allLedger, todayDay]
  );
  const payGroups = useMemo(() => buildPayGroups(payables, todayDay, Money.format, period), [payables, todayDay, Money, period]);
  const receiveGroups = useMemo(() => buildReceiveGroups(receivables, todayDay, Money.format), [receivables, todayDay, Money]);
  const osById = useMemo(() => new Map(receivables.pendingOS.map(p => [`os-${p.os.id}`, p.os])), [receivables]);

  const onReceiveRow = (row: FinDueRow, e: React.MouseEvent) => {
    const os = osById.get(row.id);
    if (os) onReceiveOS(os); else payClick(e, row.id);
  };

  // Faixa de atenção: só conta vencida e valor atrasado.
  const alertMessages: string[] = [];
  const alertActions: { label: string; targetId: string }[] = [];
  if (payables.countOverdue > 0) {
    alertMessages.push(`Atenção: ${payables.countOverdue === 1 ? '1 conta vencida soma' : `${payables.countOverdue} contas vencidas somam`} ${Money.format(payables.totalOverdue)}.`);
    alertActions.push({ label: 'Ver contas', targetId: 'fin-pay-title' });
  }
  if (receivables.totalAtrasado > 0) {
    const who = lateClients === 0 ? 'Há recebimentos atrasados' : lateClients === 1 ? '1 cliente está atrasado' : `${lateClients} clientes estão atrasados`;
    alertMessages.push(`${who}: ${Money.format(receivables.totalAtrasado)}.`);
    alertActions.push({ label: 'Ver quem deve', targetId: 'fin-receive-title' });
  }

  const partsCents = MoneyUtil.fromFloat(chartDataPie.find(p => p.name === 'Peças')?.value ?? 0);
  const servicesCents = MoneyUtil.fromFloat(chartDataPie.find(p => p.name === 'Serviços')?.value ?? 0);

  const totalPages = Math.ceil(ledger.length / ITEMS_PER_PAGE);
  const paginatedLedger = ledger.slice(
      (currentPage - 1) * ITEMS_PER_PAGE,
      currentPage * ITEMS_PER_PAGE
  );
  const filterOptions: { value: 'ALL' | 'CREDIT' | 'DEBIT'; label: string }[] = [
    { value: 'ALL', label: 'Todos' }, { value: 'CREDIT', label: 'Entradas' }, { value: 'DEBIT', label: 'Saídas' },
  ];

  return (
    <>
      <div className="fin-page">
      <div className="header-area">
        <h1 className="page-title">Financeiro</h1>
        <div className="financial-actions fin-actions">

          <div className="segmented" role="group" aria-label="Período">
             <button type="button" aria-pressed={viewMode === 'MONTH'} onClick={() => setViewMode('MONTH')}>Mensal</button>
             <button type="button" aria-pressed={viewMode === 'YEAR'} onClick={() => setViewMode('YEAR')}>Anual</button>
          </div>

          {viewMode === 'MONTH' ? (
            <input
              type="month"
              className="form-input fin-period-input"
              aria-label="Mês"
              value={selectedMonth}
              onChange={(e) => onMonthChange(e.target.value)}
            />
          ) : (
            <>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                className="form-input fin-period-input fin-year-input"
                aria-label="Ano"
                aria-invalid={yearError ? true : undefined}
                aria-describedby={yearError ? 'fin-year-error' : undefined}
                value={yearDraft}
                onChange={(e) => setYearDraft(e.target.value.replace(/\D/g, ''))}
                onBlur={commitYear}
                onKeyDown={(e) => { if (e.key === 'Enter') commitYear(); }}
              />
              {yearError && <p id="fin-year-error" className="field-error" role="alert">{YEAR_INVALID_MESSAGE}</p>}
            </>
          )}

          <button className="btn-secondary" onClick={onOpenExport}><Icon name="arquivo" size={18} />Exportar</button>
          <OnlineOnlyButton className="btn" onClick={onOpenEntry}><Icon name="adicionar" size={18} />Novo lançamento</OnlineOnlyButton>
        </div>
      </div>

      {canMargin && (
      <div className="fin-tabs" role="tablist" aria-label="Seções do Financeiro">
        <button type="button" role="tab" id="fin-tab-geral" className="fin-tab"
          aria-selected={tab === 'GERAL'} aria-controls="fin-panel" tabIndex={tab === 'GERAL' ? 0 : -1}
          onClick={() => setTab('GERAL')} onKeyDown={onTabKeyDown}>Visão geral</button>
        <button type="button" role="tab" id="fin-tab-margem" className="fin-tab"
          aria-selected={tab === 'MARGEM'} aria-controls="fin-panel" tabIndex={tab === 'MARGEM' ? 0 : -1}
          onClick={() => setTab('MARGEM')} onKeyDown={onTabKeyDown}>Margem</button>
      </div>
      )}

      <div id="fin-panel" role={canMargin ? 'tabpanel' : undefined} aria-labelledby={canMargin ? (tab === 'GERAL' ? 'fin-tab-geral' : 'fin-tab-margem') : undefined}>
      {tab === 'MARGEM' ? (
        <MarginReport
          workOrders={workOrders}
          settings={settings}
          catalogParts={catalogParts}
          catalogServices={catalogServices}
          selectedMonth={selectedMonth}
          viewMode={viewMode}
        />
      ) : (
      <>
      {!isLoading && <FinAlertStrip messages={alertMessages} actions={alertActions} />}

      <div className="fin-stack">
        <FinResultPanel
          isLoading={isLoading}
          periodLabel={period}
          isYear={isYear}
          entrou={kpiData.receitas}
          saiu={kpiData.despesas}
          saldo={kpiData.saldo}
          showProfit={canMargin}
          format={Money.format}
        />
      </div>

      {offlineCloud && (
        <p className="cfg-warn fin-offline-banner" role="note"><Icon name="sem-internet" size={16} /> {FIN_TABLE_OFFLINE_BANNER}</p>
      )}

      <div className="fin-grid">
        <FinDueList
          idPrefix="fin-pay" kind="pay" title="Contas para pagar"
          scope={`Vencidas (qualquer data) e as que vencem em ${period}.`}
          total={Money.format(payables.totalOverdue + payables.totalDue)}
          lateTotal={payables.totalOverdue > 0 ? Money.format(payables.totalOverdue) : undefined}
          groups={payGroups}
          actionLabel="Paguei" busyLabel="Pagando..."
          onAction={(row, e) => payClick(e, row.id)}
          emptyText="Nenhuma conta para pagar. Tudo em dia."
        />
        <FinDueList
          idPrefix="fin-receive" kind="receive" title="Para receber"
          scope="Todas as datas."
          total={Money.format(receivables.totalAReceber + receivables.totalAtrasado)}
          lateTotal={receivables.totalAtrasado > 0 ? Money.format(receivables.totalAtrasado) : undefined}
          groups={receiveGroups}
          actionLabel="Receber" busyLabel="Recebendo..."
          onAction={onReceiveRow}
          emptyText="Ninguém deve nada agora."
        />
      </div>

      <div className="fin-grid">
        <FinFlowChart data={chartDataFluxo} isYear={isYear} periodLabel={period} formatReais={brl} />
        <FinMixBar
          parts={partsCents} services={servicesCents} average={kpiData.ticketMedio}
          finalizedCount={kpiData.finalizedCount} periodLabel={period} format={Money.format}
        />
      </div>

      <section className="fin-box" aria-labelledby="fin-ledger-title">
          <div className="fin-box__head">
              <h2 id="fin-ledger-title" className="fin-box__title">Lançamentos (entradas e saídas)</h2>
              <div className="fin-filter" role="group" aria-label="Filtrar por tipo">
                  {filterOptions.map(o => (
                    <button key={o.value} type="button" className="chip" aria-pressed={filterType === o.value} onClick={() => setFilterType(o.value)}>{o.label}</button>
                  ))}
              </div>
          </div>

          {paginatedLedger.length === 0 ? (
            <div className="fin-empty">
              <p className="fin-empty__title">{ledger.length === 0 ? 'Nenhum lançamento encontrado.' : 'Página vazia.'}</p>
            </div>
          ) : (
          <table className="data-table fin-ledger-table">
            <thead><tr><th>Descrição</th><th>Valor</th><th>Data</th><th>Ações</th></tr></thead>
            <tbody>
                {paginatedLedger.map(e => {
                    // Paga: receita com paymentDate; despesa pela regra única (expenseStatus.ts).
                    const paidDay = e.type === 'CREDIT'
                      ? (e.paymentDate ? toLocalDay(e.paymentDate) : null)
                      : (isDebitPaid(e, todayDay) ? debitPaidDay(e) : null);
                    const isPaid = paidDay !== null;
                    const dateText = `${isPaid ? 'Pago em' : 'Vence em'} ${shortDay(paidDay ?? toLocalDay(getDueDate(e)), todayDay)}`;
                    const advanceOS = advanceOwners.get(e.id);
                    return (
                        <tr key={e.id}>
                            <td className="fin-ledger__desc">
                                {e.description}
                                {advanceOS && <span className="fin-tag fin-tag--paid">Adiantamento da OS #{advanceOS.osNumber}</span>}
                            </td>
                            <td className={e.type === 'DEBIT' ? 'fin-amount fin-amount--debit' : 'fin-amount fin-amount--credit'}>
                                {e.type === 'DEBIT' ? '- ' : '+ '}{Money.format(e.amount)}
                            </td>
                            <td className="fin-date">
                                {dateText}
                                {isPaid
                                  ? <span className="fin-tag fin-tag--paid"><Icon name="check" size={14} />Pago</span>
                                  : <span className="fin-tag fin-tag--pending"><Icon name="relogio" size={14} />Pendente</span>}
                            </td>
                            <td>
                                <div className="fin-row-actions">
                                {advanceOS ? (
                                    <button className="btn-sm" onClick={() => onOpenOS(advanceOS)} aria-label={`Editar na OS #${advanceOS.osNumber}`}><Icon name="editar" size={16} />Editar na OS #{advanceOS.osNumber}</button>
                                ) : (<>
                                <OnlineOnlyButton
                                    busyLabel={e.type === 'CREDIT' ? 'Recebendo...' : 'Pagando...'} busyKey={e.id}
                                    className={isPaid ? 'btn-sm fin-pay fin-pay--paid' : 'btn-sm fin-pay'}
                                    onClick={(ev) => payClick(ev, e.id)}
                                    aria-pressed={isPaid}
                                    aria-label={isPaid ? `Pago, clique para desfazer: ${e.description}` : `${e.type === 'CREDIT' ? 'Marcar como pago' : 'Paguei'}: ${e.description}`}
                                >
                                    <Icon name="check" size={16} />{isPaid ? 'Desfazer pagamento' : e.type === 'CREDIT' ? 'Marcar como pago' : 'Paguei'}
                                </OnlineOnlyButton>
                                <OnlineOnlyButton className="btn-sm" onClick={() => onEditEntry(e.id)} aria-label={`Editar: ${e.description}`}><Icon name="editar" size={16} />Editar</OnlineOnlyButton>
                                {canDeleteEntry && <OnlineOnlyButton className="btn-sm fin-del" onClick={() => onDeleteEntry(e)} aria-label={`Excluir: ${e.description}`}><Icon name="excluir" size={16} />Excluir</OnlineOnlyButton>}
                                </>)}
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
          </table>
          )}

          {totalPages > 1 && (
             <div className="fin-pager">
                 <button
                    className="btn btn-secondary"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                 >
                    Anterior
                 </button>
                 <span className="fin-pager__info">
                    Página {currentPage} de {totalPages}
                 </span>
                 <button
                    className="btn btn-secondary"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                 >
                    Próxima
                 </button>
             </div>
          )}
      </section>
      </>
      )}
      </div>
      </div>
    </>
  );
};
