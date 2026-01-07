import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { LedgerEntry } from '../types';

const COLORS = {
  primary: '#8257e6', secondary: '#00bcd4', success: '#04d361', warning: '#ff9800', 
  danger: '#e54c4c', grid: 'var(--border)', text: 'var(--text-muted)'
};

interface FinancialPageProps {
  isLoading: boolean;
  kpiData: { saldo: number; receitas: number; despesas: number; ticketMedio: number; };
  chartDataFluxo: any[];
  chartDataPie: any[];
  ledger: LedgerEntry[];
  Money: { format: (val: number) => string; toFloat: (val: number) => number; };
  onOpenExport: () => void;
  onOpenEntry: () => void;
  onEditEntry: (id: string) => void;
  onDeleteEntry: (entry: LedgerEntry) => void;
  // NOVAS PROPS
  selectedMonth: string;
  onMonthChange: (val: string) => void;
}

export const FinancialPage: React.FC<FinancialPageProps> = ({ 
  isLoading, kpiData, chartDataFluxo, chartDataPie, ledger, Money, 
  onOpenExport, onOpenEntry, onEditEntry, onDeleteEntry,
  selectedMonth, onMonthChange
}) => {
  return (
    <>
      <div className="header-area">
        <h1 className="page-title">Painel Financeiro</h1>
        <div style={{display:'flex', gap:10, alignItems: 'center'}}>
          {/* SELETOR DE MÊS */}
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
               {/* Label Ajustado */}
               <div className="stat-label">Resultado (Mês)</div>
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
            <div className="chart-header"><div className="chart-title">Faturamento Diário (Dia)</div></div>
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
                            // CORREÇÃO: Alterado para 'any' para evitar erro de tipagem estrita
                            formatter={(value: any) => [`R$ ${Number(value).toFixed(2)}`, 'Valor']}
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
          <table className="data-table">
            <thead><tr><th>Descrição</th><th>Valor</th><th>Data</th><th>Ações</th></tr></thead>
            <tbody>
                {ledger.length === 0 ? (
                   <tr><td colSpan={4} style={{textAlign:'center', padding:20, color:'var(--text-muted)'}}>Sem lançamentos neste mês.</td></tr>
                ) : (
                    ledger.map(e => (
                        <tr key={e.id}>
                            <td>{e.description}</td>
                            <td style={{fontWeight:'bold', color: e.type === 'DEBIT' ? 'var(--danger)' : 'var(--success)'}}>
                                {e.type === 'DEBIT' ? '- ' : '+ '}{Money.format(e.amount)}
                            </td>
                            <td style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>
                                {new Date(e.effectiveDate).toLocaleDateString()}
                            </td>
                            <td>
                                <button className="btn-sm" onClick={() => onEditEntry(e.id)}>Edit</button> 
                                <button className="btn-sm" onClick={() => onDeleteEntry(e)}>Del</button>
                            </td>
                        </tr>
                    ))
                )}
            </tbody>
          </table>
      </div>
    </>
  );
};