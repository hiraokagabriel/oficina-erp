import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { LedgerEntry } from '../types';

const COLORS = {
  primary: '#8257e6', secondary: '#00bcd4', success: '#04d361', warning: '#ff9800', 
  danger: '#e54c4c', grid: 'var(--border)', text: 'var(--text-muted)'
};

const ITEMS_PER_PAGE = 20;

interface FinancialPageProps {
  isLoading: boolean;
  kpiData: { saldo: number; receitas: number; despesas: number; ticketMedio: number; };
  chartDataFluxo: any[];
  chartDataPie: any[];
  ledger: LedgerEntry[]; // Essa lista já vem filtrada por Data e Tipo do App.tsx
  Money: { format: (val: number) => string; toFloat: (val: number) => number; };
  onOpenExport: () => void;
  onOpenEntry: () => void;
  onEditEntry: (id: string) => void;
  onDeleteEntry: (entry: LedgerEntry) => void;
  selectedMonth: string;
  onMonthChange: (val: string) => void;
  viewMode: 'MONTH' | 'YEAR';
  setViewMode: (mode: 'MONTH' | 'YEAR') => void;
  // NOVAS PROPS
  filterType: 'ALL' | 'CREDIT' | 'DEBIT';
  setFilterType: (type: 'ALL' | 'CREDIT' | 'DEBIT') => void;
}

export const FinancialPage: React.FC<FinancialPageProps> = ({ 
  isLoading, kpiData, chartDataFluxo, chartDataPie, ledger, Money, 
  onOpenExport, onOpenEntry, onEditEntry, onDeleteEntry,
  selectedMonth, onMonthChange, viewMode, setViewMode,
  filterType, setFilterType
}) => {
  
  // Estado local para paginação
  const [currentPage, setCurrentPage] = useState(1);

  // Reseta para página 1 se o filtro mudar ou os dados mudarem
  useEffect(() => {
    setCurrentPage(1);
  }, [ledger.length, filterType, viewMode, selectedMonth]);

  // Lógica de Paginação
  const totalPages = Math.ceil(ledger.length / ITEMS_PER_PAGE);
  const paginatedLedger = ledger.slice(
      (currentPage - 1) * ITEMS_PER_PAGE, 
      currentPage * ITEMS_PER_PAGE
  );

  return (
    <>
      <div className="header-area">
        <h1 className="page-title">Painel Financeiro</h1>
        <div style={{display:'flex', gap:10, alignItems: 'center'}}>
          
          <div className="toggle-group" style={{display: 'flex', background: 'var(--bg-panel)', borderRadius: 8, padding: 2}}>
             <button 
                className="btn-sm" 
                style={{
                    background: viewMode === 'MONTH' ? 'var(--primary)' : 'transparent', 
                    color: viewMode === 'MONTH' ? '#fff' : 'var(--text-muted)'
                }}
                onClick={() => setViewMode('MONTH')}
             >
                Mensal
             </button>
             <button 
                className="btn-sm" 
                style={{
                    background: viewMode === 'YEAR' ? 'var(--primary)' : 'transparent', 
                    color: viewMode === 'YEAR' ? '#fff' : 'var(--text-muted)'
                }}
                onClick={() => setViewMode('YEAR')}
             >
                Anual
             </button>
          </div>

          <input 
            type="month" 
            className="form-input" 
            style={{width: 'auto', fontWeight: 'bold', color: 'var(--primary)', cursor: 'pointer'}}
            value={selectedMonth}
            onChange={(e) => onMonthChange(e.target.value)}
          />

          <button className="btn-secondary" onClick={onOpenExport}>📄 Exportar</button>
          <button className="btn" onClick={onOpenEntry}>+ Lançamento</button>
        </div>
      </div>
      
      {isLoading ? (
          <div className="stats-row">
             {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{height: 120, borderRadius: 16}}/>)}
          </div>
      ) : (
          <div className="stats-row">
            <div className="stat-card">
               <div className="stat-label">Resultado ({viewMode === 'YEAR' ? 'Ano' : 'Mês'})</div>
               <div className="stat-value" style={{color: kpiData.saldo >= 0 ? 'var(--success)' : 'var(--danger)'}}>{Money.format(kpiData.saldo)}</div>
               <div className="stat-trend">{kpiData.saldo >= 0 ? 'Lucro do período' : 'Prejuízo do período'}</div>
            </div>
            <div className="stat-card"><div className="stat-label">Receitas</div><div className="stat-value" style={{color: 'var(--success)'}}>{Money.format(kpiData.receitas)}</div></div>
            <div className="stat-card"><div className="stat-label">Despesas</div><div className="stat-value" style={{color: 'var(--danger)'}}>{Money.format(kpiData.despesas)}</div></div>
            <div className="stat-card" style={{borderColor: 'var(--border)'}}><div className="stat-label">Ticket Médio</div><div className="stat-value">{Money.format(kpiData.ticketMedio)}</div></div>
          </div>
      )}

      <div className="dashboard-grid">
        <div className="chart-card">
            <div className="chart-header"><div className="chart-title">Faturamento ({viewMode === 'YEAR' ? 'Mensal' : 'Diário'})</div></div>
            <div style={{flex:1}}>
                <ResponsiveContainer>
                    <AreaChart data={chartDataFluxo}>
                        <defs>
                            <linearGradient id="c" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.5}/>
                                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false}/>
                        <XAxis dataKey="name" stroke={COLORS.text} fontSize={10} tickLine={false} axisLine={false}/>
                        <YAxis stroke={COLORS.text} fontSize={10} tickLine={false} axisLine={false}/>
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
                            formatter={(value: number | string) => [`R$ ${Number(value).toFixed(2)}`, 'Valor']}
                        />
                        <Area type="monotone" dataKey="valor" stroke="var(--primary)" fill="url(#c)" strokeWidth={3} activeDot={{r: 6}} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
        <div className="chart-card">
            <div className="chart-header"><div className="chart-title">Receita (Peças x Serviços)</div></div>
            <div style={{flex:1}}>
                <ResponsiveContainer>
                    <PieChart>
                        <Pie data={chartDataPie} cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value">
                            <Cell fill={COLORS.secondary}/><Cell fill={COLORS.warning}/>
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)', borderRadius: '12px' }} />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
      </div>
      
      <div className="card">
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 15}}>
              <h3 style={{margin:0}}>Lançamentos</h3>
              
              {/* FILTRO DE TIPO (RECEITAS / DESPESAS) */}
              <div className="toggle-group" style={{display: 'flex', gap: 5}}>
                  <button 
                    className="btn-sm" 
                    style={{opacity: filterType === 'ALL' ? 1 : 0.5, border: filterType === 'ALL' ? '1px solid var(--primary)' : '1px solid transparent'}}
                    onClick={() => setFilterType('ALL')}
                  >
                    Todos
                  </button>
                  <button 
                    className="btn-sm" 
                    style={{opacity: filterType === 'CREDIT' ? 1 : 0.5, color: 'var(--success)', border: filterType === 'CREDIT' ? '1px solid var(--success)' : '1px solid transparent'}}
                    onClick={() => setFilterType('CREDIT')}
                  >
                    Receitas
                  </button>
                  <button 
                    className="btn-sm" 
                    style={{opacity: filterType === 'DEBIT' ? 1 : 0.5, color: 'var(--danger)', border: filterType === 'DEBIT' ? '1px solid var(--danger)' : '1px solid transparent'}}
                    onClick={() => setFilterType('DEBIT')}
                  >
                    Despesas
                  </button>
              </div>
          </div>

          <table className="data-table">
            <thead><tr><th>Descrição</th><th>Valor</th><th>Data</th><th>Ações</th></tr></thead>
            <tbody>
                {paginatedLedger.length === 0 ? (
                   <tr><td colSpan={4} style={{textAlign:'center', padding:20, color:'var(--text-muted)'}}>
                       {ledger.length === 0 ? "Nenhum lançamento encontrado." : "Página vazia."}
                   </td></tr>
                ) : (
                    paginatedLedger.map(e => {
                        // 🆕 Determinar qual data exibir: paymentDate para receitas, effectiveDate para demais
                        const displayDate = (e.type === 'CREDIT' && e.paymentDate) 
                            ? new Date(e.paymentDate).toLocaleDateString('pt-BR')
                            : new Date(e.effectiveDate).toLocaleDateString('pt-BR');
                        
                        return (
                            <tr key={e.id}>
                                <td>{e.description}</td>
                                <td style={{fontWeight:'bold', color: e.type === 'DEBIT' ? 'var(--danger)' : 'var(--success)'}}>
                                    {e.type === 'DEBIT' ? '- ' : '+ '}{Money.format(e.amount)}
                                </td>
                                <td style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>
                                    {displayDate}
                                    {e.type === 'CREDIT' && e.paymentDate && (
                                        <span style={{
                                            marginLeft: '6px',
                                            fontSize: '0.7rem',
                                            padding: '2px 6px',
                                            background: 'rgba(4, 211, 97, 0.15)',
                                            color: 'var(--success)',
                                            borderRadius: '4px',
                                            fontWeight: 600
                                        }}>
                                            💵
                                        </span>
                                    )}
                                </td>
                                <td>
                                    <button className="btn-sm" onClick={() => onEditEntry(e.id)}>Edit</button> 
                                    <button className="btn-sm" onClick={() => onDeleteEntry(e)}>Del</button>
                                </td>
                            </tr>
                        );
                    })
                )}
            </tbody>
          </table>

          {/* RODAPÉ DE PAGINAÇÃO */}
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
  );
};