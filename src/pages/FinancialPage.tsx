import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { LedgerEntry, ChartFluxoPoint, ChartPiePoint, WorkOrder, WorkshopSettings, CatalogItem } from '../types';
import { MarginReport } from '../components/MarginReport';
import { Icon } from '../components/ui/Icon';
import { Money as MoneyUtil } from '../utils/helpers';
import { formatAxisBRL, parseYearDraft, YEAR_INVALID_MESSAGE } from '../services/financeView';
import { shouldIgnoreStep } from '../services/kanbanCardView';
import { summarizeReceivables, formatDueDate, getReceivableLabel, getReceivableStatus } from '../services/receivables';

const COLORS = {
  primary: '#8257e6', secondary: '#00bcd4', success: '#04d361', warning: '#ff9800', 
  danger: '#e54c4c', grid: 'var(--border)', text: 'var(--text-2)'
};
const PIE_COLORS = [COLORS.secondary, COLORS.warning];
// Os dados dos gráficos vêm em reais (float); o texto sai no formato brasileiro via Money.
const brl = (v: number | string): string => MoneyUtil.format(MoneyUtil.fromFloat(Number(v)));

const ITEMS_PER_PAGE = 20;

interface FinancialPageProps {
  isLoading: boolean;
  kpiData: { saldo: number; receitas: number; despesas: number; ticketMedio: number; };
  chartDataFluxo: ChartFluxoPoint[];
  chartDataPie: ChartPiePoint[];
  ledger: LedgerEntry[];
  /** Ledger COMPLETO (sem filtro de mês/tipo): base do "A receber". */
  allLedger: LedgerEntry[];
  Money: { format: (val: number) => string; toFloat: (val: number) => number; };
  onOpenExport: () => void;
  onOpenEntry: () => void;
  onEditEntry: (id: string) => void;
  onDeleteEntry: (entry: LedgerEntry) => void;
  onTogglePayment: (id: string) => void; // 🆕 NOVA PROP
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
  isLoading, kpiData, chartDataFluxo, chartDataPie, ledger, allLedger, Money, 
  onOpenExport, onOpenEntry, onEditEntry, onDeleteEntry, onTogglePayment,
  selectedMonth, onMonthChange, viewMode, setViewMode,
  filterType, setFilterType,
  workOrders, settings, catalogParts, catalogServices
}) => {

  const [currentPage, setCurrentPage] = useState(1);
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

  const [tab, setTab] = useState<'GERAL' | 'MARGEM'>('GERAL');

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

  // "A receber" é geral: não depende do mês/ano nem do filtro de tipo.
  const today = new Date();
  const receivables = useMemo(() => summarizeReceivables(allLedger, new Date()), [allLedger]);

  const totalPages = Math.ceil(ledger.length / ITEMS_PER_PAGE);
  const paginatedLedger = ledger.slice(
      (currentPage - 1) * ITEMS_PER_PAGE, 
      currentPage * ITEMS_PER_PAGE
  );

  return (
    <>
      <div className="fin-page">
      <div className="header-area">
        <h1 className="page-title">Painel Financeiro</h1>
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
          <button className="btn" onClick={onOpenEntry}><Icon name="adicionar" size={18} />Lançamento</button>
        </div>
      </div>

      <div className="fin-tabs" role="tablist" aria-label="Seções do Financeiro">
        <button type="button" role="tab" id="fin-tab-geral" className="fin-tab"
          aria-selected={tab === 'GERAL'} aria-controls="fin-panel" tabIndex={tab === 'GERAL' ? 0 : -1}
          onClick={() => setTab('GERAL')} onKeyDown={onTabKeyDown}>Visão geral</button>
        <button type="button" role="tab" id="fin-tab-margem" className="fin-tab"
          aria-selected={tab === 'MARGEM'} aria-controls="fin-panel" tabIndex={tab === 'MARGEM' ? 0 : -1}
          onClick={() => setTab('MARGEM')} onKeyDown={onTabKeyDown}>Margem</button>
      </div>

      <div id="fin-panel" role="tabpanel" aria-labelledby={tab === 'GERAL' ? 'fin-tab-geral' : 'fin-tab-margem'}>
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
      <section className="card fin-receber" aria-labelledby="fin-receber-title">
          <div className="fin-receber-head">
            <h2 id="fin-receber-title" className="fin-section-title">A receber</h2>
            <div className="fin-receber-totals">
              <div className="fin-receber-total">
                <span className="fin-receber-label">Total a receber (inclui atrasado)</span>
                <strong className="fin-receber-value">{Money.format(receivables.totalAReceber + receivables.totalAtrasado)}</strong>
                <span className="fin-receber-sub">{receivables.countAReceber + receivables.countAtrasado} {receivables.countAReceber + receivables.countAtrasado === 1 ? 'lançamento' : 'lançamentos'} (total geral)</span>
              </div>
              <div className={receivables.countAtrasado > 0 ? 'fin-receber-total fin-receber-total--late' : 'fin-receber-total'}>
                <span className="fin-receber-label">
                  {receivables.countAtrasado > 0 && <Icon name="alerta" size={16} />}Atrasado
                </span>
                <strong className="fin-receber-value">{Money.format(receivables.totalAtrasado)}</strong>
                <span className="fin-receber-sub">{receivables.countAtrasado} {receivables.countAtrasado === 1 ? 'lançamento vencido' : 'lançamentos vencidos'}</span>
              </div>
            </div>
          </div>
          <div className="receivables-scroll">
            <table className="data-table receivables-table">
              <thead><tr><th>Vencimento</th><th>Descrição</th><th>Valor</th><th>Situação</th><th>Ação</th></tr></thead>
              <tbody>
                {receivables.items.length === 0 ? (
                  <tr><td colSpan={5} style={{textAlign:'center', padding:20, color:'var(--text-muted)'}}>Nada a receber</td></tr>
                ) : receivables.items.map(e => {
                  const late = getReceivableStatus(e, today) === 'ATRASADO';
                  return (
                    <tr key={e.id}>
                      <td>{formatDueDate(e)}</td>
                      <td className="receivable-desc" title={e.description}>{e.description}</td>
                      <td style={{fontWeight:'bold'}}>{Money.format(e.amount)}</td>
                      <td><span className={`receivable-status ${late ? 'late' : 'open'}`}>{late && <Icon name="alerta" size={14} />}{getReceivableLabel(e, today)}</span></td>
                      <td>
                        <button
                          className="btn btn-success receivable-pay"
                          onClick={(ev) => payClick(ev, e.id)}
                          aria-label={`Receber pagamento: ${e.description}`}
                        >
                          <Icon name="receber" size={18} />Receber
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
      </section>

      {isLoading ? (
          <div className="stats-row fin-stats">
             {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{height: 110, borderRadius: 16}}/>)}
          </div>
      ) : (
          <div className="stats-row fin-stats">
            <div className="stat-card">
               <div className="stat-label">Resultado ({viewMode === 'YEAR' ? 'ano' : 'mês'})</div>
               <div className={kpiData.saldo >= 0 ? 'stat-value stat-value--success' : 'stat-value stat-value--danger'}>{Money.format(kpiData.saldo)}</div>
               <div className="stat-trend">{kpiData.saldo >= 0 ? 'Lucro do período' : 'Prejuízo do período'}</div>
            </div>
            <div className="stat-card"><div className="stat-label">Receitas</div><div className="stat-value stat-value--success">{Money.format(kpiData.receitas)}</div></div>
            <div className="stat-card"><div className="stat-label">Despesas</div><div className="stat-value stat-value--danger">{Money.format(kpiData.despesas)}</div></div>
            <div className="stat-card"><div className="stat-label">Ticket médio</div><div className="stat-value">{Money.format(kpiData.ticketMedio)}</div></div>
          </div>
      )}

      <div className="dashboard-grid">
        <div className="chart-card">
            <div className="chart-header"><div className="chart-title">Faturamento ({viewMode === 'YEAR' ? 'mensal' : 'diário'})</div></div>
            <div style={{flex:1, minHeight: 0}}>
                <ResponsiveContainer>
                    <AreaChart data={chartDataFluxo}>
                        <defs>
                            <linearGradient id="c" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.5}/>
                                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false}/>
                        <XAxis dataKey="name" stroke={COLORS.text} fontSize={12} tickLine={false} axisLine={false}/>
                        <YAxis stroke={COLORS.text} fontSize={12} tickLine={false} axisLine={false} width={76} tickFormatter={(v: number) => formatAxisBRL(Number(v))}/>
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'var(--bg-panel)',
                                borderColor: 'var(--border)',
                                color: 'var(--text-main)',
                                borderRadius: '12px',
                                boxShadow: '0 10px 20px rgba(0,0,0,0.2)'
                            }}
                            itemStyle={{ color: 'var(--text-main)' }}
                            labelStyle={{ color: 'var(--text-muted)' }}
                            formatter={(value: number | string) => [brl(value), 'Valor']}
                        />
                        <Area type="monotone" dataKey="valor" stroke="var(--primary)" fill="url(#c)" strokeWidth={3} activeDot={{r: 6}} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
        <div className="chart-card">
            <div className="chart-header"><div className="chart-title">Receita (peças x serviços)</div></div>
            {chartDataPie.length === 1 && chartDataPie[0].name === '-' ? (
              <p className="fin-chart-empty">Sem receita no período.</p>
            ) : (
              <>
                <div style={{flex:1, minHeight: 0}}>
                    <ResponsiveContainer>
                        <PieChart>
                            <Pie data={chartDataPie} cx="50%" cy="50%" innerRadius={50} outerRadius={72} dataKey="value" isAnimationActive={false}>
                                {chartDataPie.map((p, i) => <Cell key={p.name} fill={PIE_COLORS[i % PIE_COLORS.length]}/>)}
                            </Pie>
                            <Tooltip
                              contentStyle={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)', borderRadius: '12px' }}
                              itemStyle={{ color: 'var(--text-main)' }}
                              formatter={(value: number | string, name: string) => [brl(value), name]}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <ul className="fin-legend" aria-label="Legenda do gráfico">
                  {chartDataPie.map((p, i) => (
                    <li key={p.name}>
                      <span className="fin-legend-swatch" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} aria-hidden="true" />
                      <span className="fin-legend-name">{p.name}</span>
                      <span className="fin-legend-value">{brl(p.value)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
        </div>
      </div>

      <div className="card">
          <div className="fin-ledger-head">
              <h2 className="fin-section-title">Lançamentos</h2>
              <div className="segmented" role="group" aria-label="Filtrar por tipo">
                  <button type="button" aria-pressed={filterType === 'ALL'} onClick={() => setFilterType('ALL')}>Todos</button>
                  <button type="button" aria-pressed={filterType === 'CREDIT'} onClick={() => setFilterType('CREDIT')}>Receitas</button>
                  <button type="button" aria-pressed={filterType === 'DEBIT'} onClick={() => setFilterType('DEBIT')}>Despesas</button>
              </div>
          </div>

          <table className="data-table fin-ledger-table">
            <thead><tr><th>Descrição</th><th>Valor</th><th>Data</th><th>Ações</th></tr></thead>
            <tbody>
                {paginatedLedger.length === 0 ? (
                   <tr><td colSpan={4} style={{textAlign:'center', padding:20, color:'var(--text-muted)'}}>
                       {ledger.length === 0 ? "Nenhum lançamento encontrado." : "Página vazia."}
                   </td></tr>
                ) : (
                    paginatedLedger.map(e => {
                        let displayDate: string;
                        let isPaymentDate = false;

                        if (e.type === 'CREDIT') {
                            if (e.paymentDate) {
                                displayDate = new Date(e.paymentDate).toLocaleDateString('pt-BR');
                                isPaymentDate = true;
                            } else {
                                displayDate = new Date(e.effectiveDate).toLocaleDateString('pt-BR');
                                isPaymentDate = false;
                            }
                        } else {
                            displayDate = new Date(e.effectiveDate).toLocaleDateString('pt-BR');
                        }

                        return (
                            <tr key={e.id}>
                                <td>{e.description}</td>
                                <td className={e.type === 'DEBIT' ? 'fin-amount fin-amount--debit' : 'fin-amount fin-amount--credit'}>
                                    {e.type === 'DEBIT' ? '- ' : '+ '}{Money.format(e.amount)}
                                </td>
                                <td className="fin-date">
                                    {displayDate}
                                    {e.type === 'CREDIT' && isPaymentDate && (
                                        <span className="fin-badge fin-badge--paid"><Icon name="check" size={14} />Pago</span>
                                    )}
                                    {e.type === 'CREDIT' && !isPaymentDate && (
                                        <span className="fin-badge fin-badge--pending"><Icon name="relogio" size={14} />Pendente</span>
                                    )}
                                </td>
                                <td>
                                    <div className="fin-row-actions">
                                    {e.type === 'CREDIT' && (
                                        <button
                                            className={isPaymentDate ? 'btn-sm fin-pay fin-pay--paid' : 'btn-sm fin-pay'}
                                            onClick={(ev) => payClick(ev, e.id)}
                                            aria-pressed={isPaymentDate}
                                            aria-label={isPaymentDate ? `Pago, clique para desfazer: ${e.description}` : `Marcar como pago: ${e.description}`}
                                        >
                                            <Icon name="check" size={16} />{isPaymentDate ? 'Desfazer pagamento' : 'Marcar como pago'}
                                        </button>
                                    )}
                                    <button className="btn-sm" onClick={() => onEditEntry(e.id)} aria-label={`Editar: ${e.description}`}><Icon name="editar" size={16} />Editar</button>
                                    <button className="btn-sm fin-del" onClick={() => onDeleteEntry(e)} aria-label={`Excluir: ${e.description}`}><Icon name="excluir" size={16} />Excluir</button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })
                )}
            </tbody>
          </table>

          {totalPages > 1 && (
             <div style={{display:'flex', justifyContent:'center', alignItems:'center', gap: 15, marginTop: 20}}>
                 <button
                    className="btn-secondary"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                 >
                    Anterior
                 </button>
                 <span style={{color: 'var(--text-muted)', fontSize: '0.9rem'}}>
                    Página {currentPage} de {totalPages}
                 </span>
                 <button
                    className="btn-secondary"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                 >
                    Próxima
                 </button>
             </div>
          )}
      </div>
      </>
      )}
      </div>
      </div>
    </>
  );
};
