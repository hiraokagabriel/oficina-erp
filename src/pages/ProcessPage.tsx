import React, { useState, useMemo } from 'react';
import { WorkOrder, OSStatus, STATUS_LABELS } from '../types';

interface ProcessPageProps {
  workOrders: WorkOrder[];
  onOpenNew: () => void;
  onUpdateStatus: (id: string, newStatus: OSStatus) => void;
}

type ViewMode = 'grouped' | 'timeline' | 'compact';
type SortKey = 'osNumber' | 'clientName' | 'createdAt' | 'total';

export const ProcessPage: React.FC<ProcessPageProps> = ({ workOrders, onOpenNew, onUpdateStatus }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<OSStatus | 'ALL'>('ALL');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [sortBy, setSortBy] = useState<SortKey>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedGroups, setExpandedGroups] = useState<Set<OSStatus>>(new Set(['ORCAMENTO', 'APROVADO', 'EM_SERVICO']));
  const [selectedOS, setSelectedOS] = useState<string | null>(null);

  // 📊 ESTATÍSTICAS GLOBAIS
  const stats = useMemo(() => {
    const total = workOrders.length;
    const totalValue = workOrders.reduce((sum, os) => sum + os.total, 0);
    const avgValue = total > 0 ? totalValue / total : 0;
    const finalized = workOrders.filter(os => os.status === 'FINALIZADO').length;
    const pending = workOrders.filter(os => os.status === 'ORCAMENTO' || os.status === 'APROVADO').length;
    
    return { total, totalValue, avgValue, finalized, pending };
  }, [workOrders]);

  // 🔍 FILTROS
  const filteredOrders = useMemo(() => {
    let result = [...workOrders];

    // Busca global
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(os => 
        os.clientName.toLowerCase().includes(term) ||
        os.vehicle.toLowerCase().includes(term) ||
        os.osNumber.toString().includes(term)
      );
    }

    // Filtro de status
    if (selectedStatus !== 'ALL') {
      result = result.filter(os => os.status === selectedStatus);
    }

    // Filtro de data
    if (dateFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      result = result.filter(os => {
        const osDate = new Date(os.createdAt);
        const daysDiff = Math.floor((now.getTime() - osDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (dateFilter === 'today') return daysDiff === 0;
        if (dateFilter === 'week') return daysDiff <= 7;
        if (dateFilter === 'month') return daysDiff <= 30;
        return true;
      });
    }

    // Ordenação
    result.sort((a, b) => {
      let valA: any = a[sortBy];
      let valB: any = b[sortBy];

      if (sortBy === 'createdAt') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      } else if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      const comparison = valA < valB ? -1 : valA > valB ? 1 : 0;
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [workOrders, searchTerm, selectedStatus, dateFilter, sortBy, sortDirection]);

  // 📊 ESTATÍSTICAS POR STATUS
  const groupStats = useMemo(() => {
    const groups: Record<OSStatus, { count: number; total: number }> = {
      ORCAMENTO: { count: 0, total: 0 },
      APROVADO: { count: 0, total: 0 },
      EM_SERVICO: { count: 0, total: 0 },
      FINALIZADO: { count: 0, total: 0 },
      ARQUIVADO: { count: 0, total: 0 }
    };

    filteredOrders.forEach(os => {
      groups[os.status].count++;
      groups[os.status].total += os.total;
    });

    return groups;
  }, [filteredOrders]);

  const toggleGroup = (status: OSStatus) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(status)) newSet.delete(status);
      else newSet.add(status);
      return newSet;
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDirection('desc');
    }
  };

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val / 100);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return {
      day: date.getDate().toString().padStart(2, '0'),
      month: date.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase(),
      year: date.getFullYear(),
      full: date.toLocaleDateString('pt-BR')
    };
  };

  const getStatusColor = (status: OSStatus) => {
    const colors = {
      ORCAMENTO: { bg: 'rgba(0, 188, 212, 0.1)', border: 'var(--info)', text: 'var(--info)' },
      APROVADO: { bg: 'rgba(251, 169, 76, 0.1)', border: 'var(--warning)', text: 'var(--warning)' },
      EM_SERVICO: { bg: 'rgba(130, 87, 230, 0.1)', border: 'var(--primary)', text: 'var(--primary)' },
      FINALIZADO: { bg: 'rgba(4, 211, 97, 0.1)', border: 'var(--success)', text: 'var(--success)' },
      ARQUIVADO: { bg: 'rgba(160, 160, 160, 0.1)', border: 'var(--text-muted)', text: 'var(--text-muted)' }
    };
    return colors[status];
  };

  const allStatuses: OSStatus[] = ['ORCAMENTO', 'APROVADO', 'EM_SERVICO', 'FINALIZADO', 'ARQUIVADO'];

  return (
    <>
      {/* 🎨 HEADER MODERNIZADO */}
      <div style={{
        background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)',
        borderRadius: 'var(--radius-card)',
        padding: '32px',
        marginBottom: '32px',
        color: '#fff',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 10px 40px rgba(130, 87, 230, 0.3)'
      }}>
        {/* Decoração de fundo */}
        <div style={{
          position: 'absolute',
          top: '-100px',
          right: '-100px',
          width: '300px',
          height: '300px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '50%',
          filter: 'blur(60px)'
        }}/>
        
        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Título e Ações */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
            <div>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.9, marginBottom: '8px' }}>
                Gestão de
              </div>
              <h1 style={{ margin: 0, fontSize: '2.5rem', fontWeight: 800, lineHeight: 1 }}>
                Processos & Ordens de Serviço
              </h1>
            </div>
            
            <button 
              className="btn"
              onClick={onOpenNew}
              style={{ 
                background: 'rgba(255,255,255,0.2)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              ➕ Novo Processo
            </button>
          </div>

          {/* 📊 ESTATÍSTICAS */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
            gap: '16px'
          }}>
            {/* Total de Processos */}
            <div style={{
              background: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(10px)',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.2)'
            }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8, marginBottom: '4px' }}>
                Total
              </div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1 }}>
                {stats.total}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '4px' }}>
                processos
              </div>
            </div>

            {/* Valor Total */}
            <div style={{
              background: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(10px)',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.2)'
            }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8, marginBottom: '4px' }}>
                Valor Total
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1 }}>
                {formatMoney(stats.totalValue)}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '4px' }}>
                acumulado
              </div>
            </div>

            {/* Média */}
            <div style={{
              background: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(10px)',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.2)'
            }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8, marginBottom: '4px' }}>
                Ticket Médio
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1 }}>
                {formatMoney(stats.avgValue)}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '4px' }}>
                por processo
              </div>
            </div>

            {/* Finalizados */}
            <div style={{
              background: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(10px)',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.2)'
            }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8, marginBottom: '4px' }}>
                Finalizados
              </div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1 }}>
                {stats.finalized}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '4px' }}>
                {stats.total > 0 ? `${Math.round((stats.finalized / stats.total) * 100)}% completo` : '0%'}
              </div>
            </div>

            {/* Pendentes */}
            <div style={{
              background: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(10px)',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.2)'
            }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8, marginBottom: '4px' }}>
                Pendentes
              </div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1 }}>
                {stats.pending}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '4px' }}>
                aguardando
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 🔍 FILTROS AVANÇADOS */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'end' }}>
          {/* Busca Global */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">🔍 Buscar</label>
            <input
              type="text"
              className="form-input"
              placeholder="Cliente, veículo, OS..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Filtro de Status */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">📊 Status</label>
            <select 
              className="form-input" 
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as OSStatus | 'ALL')}
              style={{ cursor: 'pointer' }}
            >
              <option value="ALL">Todos os Status</option>
              {allStatuses.map(status => (
                <option key={status} value={status}>{STATUS_LABELS[status]}</option>
              ))}
            </select>
          </div>

          {/* Filtro de Período */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">📅 Período</label>
            <select 
              className="form-input"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              style={{ cursor: 'pointer' }}
            >
              <option value="all">Todo o período</option>
              <option value="today">Hoje</option>
              <option value="week">Semana</option>
              <option value="month">Mês</option>
            </select>
          </div>

          {/* Ordenação */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">🔢 Ordenar por</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select 
                className="form-input"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                style={{ cursor: 'pointer', flex: 1 }}
              >
                <option value="createdAt">Data</option>
                <option value="osNumber">Nº OS</option>
                <option value="clientName">Cliente</option>
                <option value="total">Valor</option>
              </select>
              <button 
                className="btn-sm"
                onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                style={{ padding: '0 16px' }}
              >
                {sortDirection === 'asc' ? '⬆️' : '⬇️'}
              </button>
            </div>
          </div>
        </div>

        {/* Limpar Filtros */}
        {(searchTerm || selectedStatus !== 'ALL' || dateFilter !== 'all') && (
          <div style={{ marginTop: '16px', textAlign: 'right' }}>
            <button 
              className="btn-sm"
              onClick={() => {
                setSearchTerm('');
                setSelectedStatus('ALL');
                setDateFilter('all');
              }}
            >
              ✕ Limpar Filtros
            </button>
          </div>
        )}
      </div>

      {/* 📋 LISTAGEM AGRUPADA */}
      {filteredOrders.length === 0 ? (
        {/* Estado Vazio */}
        <div className="card" style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: 'var(--text-muted)'
        }}>
          <div style={{ fontSize: '5rem', marginBottom: '16px', opacity: 0.3 }}>📋</div>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text-main)' }}>
            Nenhum processo encontrado
          </h3>
          <p style={{ fontSize: '1rem', opacity: 0.7 }}>
            {searchTerm || selectedStatus !== 'ALL' || dateFilter !== 'all'
              ? 'Tente ajustar os filtros acima'
              : 'Crie seu primeiro processo clicando no botão acima'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {allStatuses.map(status => {
            const groupOrders = filteredOrders.filter(os => os.status === status);
            if (groupOrders.length === 0 && selectedStatus === 'ALL') return null;
            
            const isExpanded = expandedGroups.has(status);
            const colors = getStatusColor(status);

            return (
              <div key={status} className="process-group-modern" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                {/* Cabeçalho do Grupo */}
                <div 
                  onClick={() => toggleGroup(status)}
                  style={{
                    background: colors.bg,
                    borderLeft: `4px solid ${colors.border}`,
                    padding: '16px 24px',
                    borderRadius: 'var(--radius-card)',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s ease',
                    border: `1px solid ${colors.border}`,
                    marginBottom: isExpanded ? '16px' : 0
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateX(4px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateX(0)'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontSize: '1.5rem' }}>
                      {isExpanded ? '🔽' : '🔺'}
                    </span>
                    <div>
                      <div style={{ 
                        fontSize: '1.1rem', 
                        fontWeight: 700, 
                        color: colors.text,
                        marginBottom: '4px'
                      }}>
                        {STATUS_LABELS[status]}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {groupOrders.length} {groupOrders.length === 1 ? 'processo' : 'processos'} • {formatMoney(groupStats[status].total)}
                      </div>
                    </div>
                  </div>

                  <div style={{ 
                    background: colors.border,
                    color: '#fff',
                    padding: '8px 16px',
                    borderRadius: '20px',
                    fontWeight: 700,
                    fontSize: '1.1rem'
                  }}>
                    {groupOrders.length}
                  </div>
                </div>

                {/* Lista de Cards */}
                {isExpanded && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '16px' }}>
                    {groupOrders.map((os, index) => {
                      const dateObj = formatDate(os.createdAt);
                      
                      return (
                        <div 
                          key={os.id}
                          className="process-card-modern"
                          onClick={() => setSelectedOS(selectedOS === os.id ? null : os.id)}
                          style={{
                            background: 'var(--bg-panel)',
                            border: `1px solid ${selectedOS === os.id ? colors.border : 'var(--border)'}`,
                            borderRadius: '12px',
                            padding: '20px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            animation: `slideInUp 0.3s ease-out ${index * 0.05}s both`,
                            position: 'relative',
                            overflow: 'hidden'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-4px)';
                            e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.15)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          {/* Barra lateral colorida */}
                          <div style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            width: '4px',
                            height: '100%',
                            background: colors.border
                          }}/>

                          {/* Header do Card */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <div style={{
                              background: colors.bg,
                              border: `1px solid ${colors.border}`,
                              padding: '6px 12px',
                              borderRadius: '8px',
                              fontWeight: 700,
                              color: colors.text,
                              fontSize: '0.9rem'
                            }}>
                              OS #{os.osNumber}
                            </div>

                            {/* Dropdown de Status */}
                            <div style={{ position: 'relative' }}>
                              <button
                                className="btn-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedOS(selectedOS === os.id ? null : os.id);
                                }}
                                style={{
                                  background: colors.bg,
                                  borderColor: colors.border,
                                  color: colors.text
                                }}
                              >
                                {STATUS_LABELS[os.status]} ▼
                              </button>

                              {selectedOS === os.id && (
                                <div style={{
                                  position: 'absolute',
                                  top: '100%',
                                  right: 0,
                                  marginTop: '8px',
                                  background: 'var(--bg-panel)',
                                  border: '1px solid var(--border)',
                                  borderRadius: '8px',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                  zIndex: 10,
                                  minWidth: '180px',
                                  overflow: 'hidden'
                                }}>
                                  {allStatuses.map(newStatus => (
                                    <div
                                      key={newStatus}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onUpdateStatus(os.id, newStatus);
                                        setSelectedOS(null);
                                      }}
                                      style={{
                                        padding: '12px 16px',
                                        cursor: 'pointer',
                                        background: newStatus === os.status ? 'var(--bg-card-hover)' : 'transparent',
                                        borderBottom: '1px solid var(--border)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        transition: 'background 0.2s'
                                      }}
                                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                                      onMouseLeave={(e) => {
                                        if (newStatus !== os.status) {
                                          e.currentTarget.style.background = 'transparent';
                                        }
                                      }}
                                    >
                                      {newStatus === os.status && <span>✔️</span>}
                                      <span>{STATUS_LABELS[newStatus]}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Cliente */}
                          <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                              {os.clientName}
                            </div>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              🚗 {os.vehicle}
                            </div>
                          </div>

                          {/* Data e Valor */}
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            paddingTop: '12px',
                            borderTop: '1px solid var(--border)'
                          }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                              📅 {dateObj.full}
                            </div>
                            <div style={{ 
                              fontSize: '1.2rem', 
                              fontWeight: 800, 
                              color: 'var(--success)',
                              fontFamily: 'monospace'
                            }}>
                              {formatMoney(os.total)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Animações CSS */}
      <style>{`
        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
};