import React, { useMemo } from 'react';
import { Client, WorkOrder, CRMStats } from '../types';
import { Money } from '../utils/helpers';
import { ClientReceivable, getClientSpending } from '../services/receivables';
import { Icon, IconName } from './ui/Icon';

interface CRMDashboardProps {
  clients: Client[];
  workOrders: WorkOrder[];
  /** Maiores devedores (já ordenados e limitados); vazio/ausente esconde o card. */
  topDebtors?: ClientReceivable[];
  onClientSelect?: (client: Client) => void;
}

export const CRMDashboard: React.FC<CRMDashboardProps> = ({
  clients,
  workOrders,
  topDebtors = [],
  onClientSelect
}) => {
  const stats = useMemo((): CRMStats => {
    const clientSpending = getClientSpending(workOrders, clients);

    const enrichedClients = clients.map(client => {
      const spending = clientSpending.get(client.id) || { total: 0, count: 0, lastDate: '' };
      return {
        ...client,
        totalSpent: spending.total,
        serviceCount: spending.count,
        lastServiceDate: spending.lastDate,
        averageTicket: spending.count > 0 ? spending.total / spending.count : 0,
        vipStatus: spending.total > 500000 || spending.count >= 5
      };
    });

    const topClients = enrichedClients
      .filter(c => c.totalSpent && c.totalSpent > 0)
      .sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0))
      .slice(0, 5)
      .map((client, index) => ({
        client,
        totalSpent: client.totalSpent || 0,
        serviceCount: client.serviceCount || 0,
        rank: index + 1,
      }));

    const vipClients = enrichedClients.filter(c => c.vipStatus);

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthlyRevenue = workOrders
      .filter(wo => {
        const woDate = new Date(wo.createdAt);
        return wo.status === 'FINALIZADO' && 
               woDate.getMonth() === currentMonth && 
               woDate.getFullYear() === currentYear;
      })
      .reduce((sum, wo) => sum + wo.total, 0);

    const pendingServices = workOrders.filter(
      wo => wo.status === 'APROVADO' || wo.status === 'EM_SERVICO'
    ).length;

    const completedOrders = workOrders.filter(wo => wo.status === 'FINALIZADO');
    const averageTicket = completedOrders.length > 0
      ? completedOrders.reduce((sum, wo) => sum + wo.total, 0) / completedOrders.length
      : 0;

    return {
      totalClients: clients.length,
      vipClients,
      monthlyRevenue,
      pendingServices,
      averageTicket,
      topClients,
    };
  }, [clients, workOrders]);

  const kpis: { key: string; icon: IconName; tone: string; value: string; label: string }[] = [
    { key: 'clients', icon: 'clientes', tone: 'accent', value: String(stats.totalClients), label: 'Total de clientes' },
    { key: 'vip', icon: 'bandeira', tone: 'info', value: String(stats.vipClients.length), label: 'Clientes VIP' },
    { key: 'revenue', icon: 'cifrao', tone: 'success', value: Money.format(stats.monthlyRevenue), label: 'Receita do mês' },
    { key: 'ticket', icon: 'receber', tone: 'warning', value: Money.format(stats.averageTicket), label: 'Ticket médio' },
  ];

  return (
    <div className="crm-dash">
      <div className="crm-dash-intro">
        <h2>Painel de clientes</h2>
        <p>Visão geral dos seus clientes e do movimento da oficina.</p>
      </div>

      <div className="crm-kpis">
        {kpis.map(k => (
          <div key={k.key} className={`crm-kpi crm-kpi--${k.tone}`}>
            <span className="crm-kpi-icon"><Icon name={k.icon} size={22} /></span>
            <div>
              <div className="crm-kpi-value">{k.value}</div>
              <div className="crm-kpi-label">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      <section className="crm-dash-card" aria-labelledby="crm-top5-title">
        <h2 id="crm-top5-title">Top 5 clientes</h2>
        {stats.topClients.length === 0 ? (
          <div className="crm-dash-empty">Nenhum cliente com serviços finalizados ainda.</div>
        ) : (
          <ul className="crm-top-list">
            {stats.topClients.map((item) => {
              const body = (
                <>
                  <span className={`crm-rank${item.rank <= 3 ? ' crm-rank--top' : ''}`} aria-label={`Posição ${item.rank}`}>{item.rank}</span>
                  <span className="crm-top-id">
                    <span className="crm-top-name">
                      {item.client.name}
                      {item.client.vipStatus && <span className="chip chip--accent crm-vip">VIP</span>}
                    </span>
                    <span className="crm-top-sub">{item.serviceCount} {item.serviceCount === 1 ? 'serviço realizado' : 'serviços realizados'}</span>
                  </span>
                  <span className="crm-top-money">
                    <span className="crm-top-total">{Money.format(item.totalSpent)}</span>
                    <span className="crm-top-sub">Média: {Money.format(Math.round(item.totalSpent / Math.max(item.serviceCount, 1)))}</span>
                  </span>
                </>
              );
              return (
                <li key={item.client.id}>
                  {onClientSelect ? (
                    <button type="button" className="crm-top-row" onClick={() => onClientSelect(item.client)}>{body}</button>
                  ) : (
                    <div className="crm-top-row">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {topDebtors.length > 0 && (
        <section className="crm-dash-card" aria-labelledby="crm-debt-title">
          <h2 id="crm-debt-title">Maiores devedores</h2>
          <div className="crm-debtors">
            {topDebtors.map(d => {
              const client = d.clientId ? clients.find(c => c.id === d.clientId) : undefined;
              const content = (
                <>
                  <span style={{ fontWeight: 'bold' }}>{d.clientName}</span>
                  <span style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 'bold' }}>Em aberto {Money.format(d.emAberto)}</span>
                    {d.atrasado > 0 && (
                      <span className="crm-debtor-late">
                        <Icon name="alerta" size={16} />
                        Atrasado {Money.format(d.atrasado)}
                      </span>
                    )}
                  </span>
                </>
              );
              return client && onClientSelect ? (
                <button key={d.clientId ?? d.clientName} type="button" className="debtor-row" onClick={() => onClientSelect(client)}>{content}</button>
              ) : (
                <div key={d.clientId ?? d.clientName} className="debtor-row">{content}</div>
              );
            })}
          </div>
        </section>
      )}

      {stats.pendingServices > 0 && (
        <div className="attention-note" role="status">
          <Icon name="alerta" size={28} className="attention-note-icon" />
          <div>
            <div className="attention-note-title">Serviços pendentes</div>
            <div className="attention-note-text">
              Você tem {stats.pendingServices} serviço(s) em andamento que precisam de atenção
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
