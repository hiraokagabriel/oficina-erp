import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { LedgerEntry, WorkOrder } from '../utils/types';
import { Money, COLORS, MONTH_NAMES } from '../utils/format.ts';

interface FinancialDashboardProps {
  ledger: LedgerEntry[];
  workOrders: WorkOrder[];
  isLoading: boolean;
  onOpenExport: () => void;
  onOpenEntry: () => void;
  onEditEntry: (id: string) => void;
  onDeleteEntry: (entry: LedgerEntry) => void;
}

export const FinancialDashboard: React.FC<FinancialDashboardProps> = ({
  ledger,
  workOrders,
  isLoading,
  onOpenExport,
  onOpenEntry,
  onEditEntry,
  onDeleteEntry
}) => {
  
  // KPI Calculation
  const kpiData = useMemo(() => {
    const s = ledger.reduce((a, e) => a + (e.type === 'DEBIT' ? -e.amount : e.amount), 0);
    const finalizedOrders = workOrders.filter(o => o.status === 'FINALIZADO');
    const totalFinalized = finalizedOrders.reduce((a, o) => a + o.total, 0);
    const ticket = finalizedOrders.length > 0 ? totalFinalized / finalizedOrders.length : 0;
    return {
      saldo: s,
      receitas: ledger.filter(e => e.type === 'CREDIT').reduce((a, e) => a + e.amount, 0),
      despesas: ledger.filter(e => e.type === 'DEBIT').reduce((a, e) => a + e.amount, 0),
      ticketMedio: ticket
    };
  }, [ledger, workOrders]);

  // Chart Logic (Moved from App.tsx)
  const chartDataFluxo = useMemo(() => {
    const days: Record<string, number> = {};
    ledger.forEach(e => {
        if (e.type !== 'CREDIT') return; 
        const d = new Date(e.effectiveDate);
        const key = d.toISOString().split('T')[0];
        days[key] = (days[key] || 0) + e.amount;
    });
    return Object.entries(days).sort((a, b) => a[0].localeCompare(b[0])).slice(-14).map(([dateStr, val]) => {
          const [y, m, d] = dateStr.split('-');
          const dateObj = new Date(parseInt(y), parseInt(m)-1, parseInt(d));
          return { name: dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }), valor: Money.toFloat(val) };
      });
  }, [ledger]);

  const chartDataPie = useMemo(() => { 
    let tp=0, ts=0; 
    workOrders.forEach(o => { 
      tp+=o.parts.reduce((a,i)=>a+i.price,0); 
      ts+=o.services.reduce((a,i)=>a+i.price,0); 
    }); 
    return tp+ts===0 ? [{name:'--',value:1}] : [{name:'Peças',value:Money.toFloat(tp)},{name:'Mão de Obra',value:Money.toFloat(ts)}]; 
  }, [workOrders]);

  return (
    <>
      <div className="header-area">
        <h1 className="page-title">Painel Financeiro</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" onClick={onOpenExport}>📄 Exportar</button>
          <button className="btn" onClick={onOpenEntry}>+ Lançamento</button>
        </div>
      </div>

      {isLoading ? (
        <div className="stats-row">
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 120, borderRadius: 16 }}></div>)}
        </div>
      ) : (
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">Saldo Atual</div>
            <div className="stat-value" style={{ color: kpiData.saldo >= 0 ? COLORS.success : COLORS.danger }}>
              {Money.format(kpiData.saldo)}
            </div>
            <div className="stat-trend">Lucro Líquido</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Receitas</div>
            <div className="stat-value" style={{ color: COLORS.success }}>{Money.format(kpiData.receitas)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Despesas</div>
            <div className="stat-value" style={{ color: COLORS.danger }}>{Money.format(kpiData.despesas)}</div>
          </div>
          <div className="stat-card" style={{ borderColor: COLORS.border }}>
            <div className="stat-label">Ticket Médio</div>
            <div className="stat-value">{Money.format(kpiData.ticketMedio)}</div>
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        <div className="chart-card">
          <div className="chart-header"><div className="chart-title">Faturamento Diário</div></div>
          <div style={{ flex: 1 }}>
            {isLoading ? <div className="skeleton skeleton-block"></div> : (
              <ResponsiveContainer>
                <AreaChart data={chartDataFluxo}>
                  <defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.5}/><stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false}/>
                  <XAxis dataKey="name" stroke={COLORS.text} fontSize={10} tickLine={false} axisLine={false}/>
                  <YAxis stroke={COLORS.text} fontSize={10} tickLine={false} axisLine={false}/>
                  <Tooltip contentStyle={{ background: COLORS.tooltipBg, border: 'none' }}/>
                  <Area type="monotone" dataKey="valor" stroke={COLORS.primary} fill="url(#c)" strokeWidth={3} activeDot={{ r: 6 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="chart-card">
            <div className="chart-header"><div className="chart-title">Receita (Peças vs M.O.)</div></div>
            <div style={{ flex: 1 }}>
              {isLoading ? <div className="skeleton skeleton-block"></div> : (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={chartDataPie} cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value">
                      <Cell fill={COLORS.secondary}/><Cell fill={COLORS.warning}/>
                    </Pie>
                    <Tooltip/>
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
        </div>
      </div>

      <div className="card">
        {isLoading ? <div className="skeleton" style={{ height: 200 }}></div> : (
          <table className="data-table">
            <thead><tr><th>Descrição</th><th>Valor</th><th>Ações</th></tr></thead>
            <tbody>
              {ledger.slice(0, 50).map(e => (
                <tr key={e.id}>
                  <td>{e.description}</td>
                  <td style={{ fontWeight: 'bold', color: e.type === 'DEBIT' ? COLORS.danger : COLORS.success }}>
                    {e.type === 'DEBIT' ? '- ' : '+ '}{Money.format(e.amount)}
                  </td>
                  <td>
                    <button className="btn-sm" onClick={() => onEditEntry(e.id)}>Edit</button>{' '}
                    <button className="btn-sm" onClick={() => onDeleteEntry(e)}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
};