import React, { useMemo } from 'react';
import { Client, WorkOrder, CRMStats } from '../types';
import { Money } from '../utils/helpers';

interface CRMDashboardProps {
  clients: Client[];
  workOrders: WorkOrder[];
  onClientSelect?: (client: Client) => void;
}

export const CRMDashboard: React.FC<CRMDashboardProps> = ({
  clients,
  workOrders,
  onClientSelect
}) => {
  const stats = useMemo((): CRMStats => {
    const clientSpending = new Map<string, { total: number; count: number; lastDate: string }>();
    
    workOrders
      .filter(wo => wo.status === 'FINALIZADO')
      .forEach(wo => {
        const current = clientSpending.get(wo.clientName) || { total: 0, count: 0, lastDate: wo.createdAt };
        clientSpending.set(wo.clientName, {
          total: current.total + wo.total,
          count: current.count + 1,
          lastDate: wo.createdAt > current.lastDate ? wo.createdAt : current.lastDate
        });
      });

    const enrichedClients = clients.map(client => {
      const spending = clientSpending.get(client.name) || { total: 0, count: 0, lastDate: '' };
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

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '8px', color: 'var(--text)' }}>
          📊 Dashboard CRM
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>
          Visão estratégica dos seus clientes e negócios
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '20px',
        marginBottom: '32px'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '24px',
          borderRadius: '16px',
          boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>👥</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '4px' }}>
            {stats.totalClients}
          </div>
          <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>Total de Clientes</div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          color: 'white',
          padding: '24px',
          borderRadius: '16px',
          boxShadow: '0 4px 12px rgba(245, 87, 108, 0.3)'
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🌟</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '4px' }}>
            {stats.vipClients.length}
          </div>
          <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>Clientes VIP</div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          color: 'white',
          padding: '24px',
          borderRadius: '16px',
          boxShadow: '0 4px 12px rgba(79, 172, 254, 0.3)'
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>💰</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '4px' }}>
            {Money.format(stats.monthlyRevenue)}
          </div>
          <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>Receita do Mês</div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
          color: 'white',
          padding: '24px',
          borderRadius: '16px',
          boxShadow: '0 4px 12px rgba(250, 112, 154, 0.3)'
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🎫</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '4px' }}>
            {Money.format(stats.averageTicket)}
          </div>
          <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>Ticket Médio</div>
        </div>
      </div>

      <div style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '32px'
      }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '20px', color: 'var(--text)' }}>
          🏆 Top 5 Clientes
        </h2>
        {stats.topClients.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            📄 Nenhum cliente com serviços finalizados ainda
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {stats.topClients.map((item) => (
              <div
                key={item.client.id}
                onClick={() => onClientSelect?.(item.client)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  cursor: onClientSelect ? 'pointer' : 'default',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (onClientSelect) {
                    e.currentTarget.style.background = 'var(--bg-hover)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(130, 87, 230, 0.2)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background:
                      item.rank === 1 ? '#FFD700' :
                      item.rank === 2 ? '#C0C0C0' :
                      item.rank === 3 ? '#CD7F32' :
                      'var(--primary)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                    fontWeight: 'bold'
                  }}>
                    {item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : item.rank}
                  </div>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text-main)' }}>
                      {item.client.name}
                      {item.client.vipStatus && (
                        <span style={{ marginLeft: '8px', fontSize: '1rem' }}>🌟</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                      {item.serviceCount} serviços realizados
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--success)' }}>
                    {Money.format(item.totalSpent)}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Média: {Money.format(Math.round(item.totalSpent / Math.max(item.serviceCount, 1)))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {stats.pendingServices > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%)',
          border: '2px solid #fdcb6e',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontSize: '2rem' }}>⚠️</div>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '4px' }}>
                Serviços Pendentes
              </div>
              <div style={{ fontSize: '0.95rem' }}>
                Você tem {stats.pendingServices} serviço(s) em andamento que precisam de atenção
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
