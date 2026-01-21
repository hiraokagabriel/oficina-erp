import React, { useState, useMemo, useEffect, useRef } from 'react';
import { WorkOrder, OSStatus, STATUS_LABELS } from '../types';

interface ProcessPageProps {
  workOrders: WorkOrder[];
  onOpenNew: () => void;
  onUpdateStatus: (id: string, newStatus: OSStatus) => void;
}

type SortKey = 'osNumber' | 'clientName' | 'createdAt' | 'total';

export const ProcessPage: React.FC<ProcessPageProps> = ({ workOrders, onOpenNew, onUpdateStatus }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<OSStatus | 'ALL'>('ALL');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [sortBy, setSortBy] = useState<SortKey>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedGroups, setExpandedGroups] = useState<Set<OSStatus>>(new Set(['ORCAMENTO', 'APROVADO', 'EM_SERVICO']));
  const [selectedOS, setSelectedOS] = useState<string | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerRef = useRef<HTMLDivElement>(null);

  // Calcula altura do header dinamicamente
  useEffect(() => {
    const updateHeaderHeight = () => {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight);
      }
    };
    
    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    
    return () => window.removeEventListener('resize', updateHeaderHeight);
  }, []);

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
    return date.toLocaleDateString('pt-BR');
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

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortBy !== column) return <span style={{ opacity: 0.3, marginLeft: 5 }}>⇅</span>;
    return <span style={{ marginLeft: 5 }}>{sortDirection === 'asc' ? '⬆️' : '⬇️'}</span>;
  };

  const allStatuses: OSStatus[] = ['ORCAMENTO', 'APROVADO', 'EM_SERVICO', 'FINALIZADO', 'ARQUIVADO'];

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      {/* 🏝️ ILHA FLUTUANTE FIXA - SEMPRE VISÍVEL */}
      <div 
        ref={headerRef}
        style={{
          position: 'fixed',
          top: '20px',
          left: '280px',
          right: '20px',
          width: 'calc(100% - 300px)',
          maxWidth: '1600px',
          background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)',
          backdropFilter: 'blur(30px)',
          borderRadius: '24px',
          padding: '32px',
          color: '#fff',
          overflow: 'hidden',
          boxShadow: '0 25px 70px rgba(130, 87, 230, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.15)',
          zIndex: 999,
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}
      >
        {/* Orbes decorativos */}
        <div style={{
          position: 'absolute',
          top: '-120px',
          right: '-120px',
          width: '350px',
          height: '350px',
          background: 'rgba(255,255,255,0.15)',
          borderRadius: '50%',
          filter: 'blur(80px)',
          pointerEvents: 'none'
        }}/>
        
        <div style={{
          position: 'absolute',
          bottom: '-80px',
          left: '-80px',
          width: '250px',
          height: '250px',
          background: 'rgba(255,255,255,0.08)',
          borderRadius: '50%',
          filter: 'blur(60px)',
          pointerEvents: 'none'
        }}/>
        
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
            <div>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.9, marginBottom: '8px' }}>
                Gestão de
              </div>
              <h1 style={{ margin: 0, fontSize: '2.5rem', fontWeight: 800, lineHeight: 1, textShadow: '0 2px 20px rgba(0,0,0,0.2)' }}>
                Processos & Ordens de Serviço
              </h1>
            </div>
            
            <button 
              className="btn"
              onClick={onOpenNew}
              style={{ 
                background: 'rgba(255,255,255,0.25)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
              }}
            >
              ➕ Novo Processo
            </button>
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(5, 1fr)', 
            gap: '16px'
          }}>
            <div style={{
              background: 'rgba(255,255,255,0.18)',
              backdropFilter: 'blur(10px)',
              padding: '20px',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.25)',
              boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.85, marginBottom: '6px' }}>
                Total
              </div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1 }}>
                {stats.total}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.85, marginTop: '6px' }}>
                processos
              </div>
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.18)',
              backdropFilter: 'blur(10px)',
              padding: '20px',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.25)',
              boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.85, marginBottom: '6px' }}>
                Valor Total
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1 }}>
                {formatMoney(stats.totalValue)}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.85, marginTop: '6px' }}>
                acumulado
              </div>
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.18)',
              backdropFilter: 'blur(10px)',
              padding: '20px',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.25)',
              boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.85, marginBottom: '6px' }}>
                Ticket Médio
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1 }}>
                {formatMoney(stats.avgValue)}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.85, marginTop: '6px' }}>
                por processo
              </div>
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.18)',
              backdropFilter: 'blur(10px)',
              padding: '20px',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.25)',
              boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.85, marginBottom: '6px' }}>
                Finalizados
              </div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1 }}>
                {stats.finalized}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.85, marginTop: '6px' }}>
                {stats.total > 0 ? `${Math.round((stats.finalized / stats.total) * 100)}% completo` : '0%'}
              </div>
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.18)',
              backdropFilter: 'blur(10px)',
              padding: '20px',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.25)',
              boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.85, marginBottom: '6px' }}>
                Pendentes
              </div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1 }}>
                {stats.pending}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.85, marginTop: '6px' }}>
                aguardando
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CONTEÚDO COM PADDING-TOP DINÂMICO */}
      <div style={{ paddingTop: headerHeight > 0 ? `${headerHeight + 40}px` : '320px' }}>
        {/* 🔍 FILTROS AVANÇADOS */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'end' }}>
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
          </div>

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

        {/* 📋 LISTAGEM EM FORMATO DE TABELA */}
        {filteredOrders.length === 0 ? (
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
          <div className="process-view" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {allStatuses.map(status => {
              const groupOrders = filteredOrders.filter(os => os.status === status);
              if (groupOrders.length === 0 && selectedStatus === 'ALL') return null;
              
              const isExpanded = expandedGroups.has(status);
              const colors = getStatusColor(status);

              return (
                <div key={status} className="process-group" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                  {/* Cabeçalho do Grupo (Clicável) */}
                  <div 
                    className={`process-group-header status-${status}`}
                    onClick={() => toggleGroup(status)}
                    style={{ 
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'translateX(4px)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'translateX(0)'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '1.2rem' }}>
                        {isExpanded ? '🔽' : '🔺'}
                      </span>
                      <span>{STATUS_LABELS[status]}</span>
                      <span className="count-badge">{groupOrders.length}</span>
                    </div>
                    <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
                      {formatMoney(groupStats[status].total)}
                    </div>
                  </div>
                  
                  {/* Tabela do Grupo */}
                  {isExpanded && (
                    <div className="card" style={{ 
                      padding: 0, 
                      overflow: 'visible', 
                      borderTopLeftRadius: 0, 
                      marginTop: -1,
                      animation: 'slideDown 0.3s ease-out'
                    }}>
                      <table className="process-table">
                        <thead>
                          <tr>
                            <th 
                              style={{ width: '12%', cursor: 'pointer' }} 
                              onClick={() => handleSort('osNumber')}
                              className="sortable-th"
                            > 
                              Nº OS <SortIcon column="osNumber" />
                            </th>
                            <th 
                              onClick={() => handleSort('clientName')} 
                              className="sortable-th"
                              style={{ cursor: 'pointer' }}
                            >
                              Cliente / Veículo <SortIcon column="clientName"/>
                            </th>
                            <th 
                              style={{ width: '15%', cursor: 'pointer' }} 
                              onClick={() => handleSort('createdAt')}
                              className="sortable-th"
                            >
                              Data <SortIcon column="createdAt" />
                            </th>
                            <th 
                              style={{ width: '15%', cursor: 'pointer' }}
                              onClick={() => handleSort('total')}
                              className="sortable-th"
                            >
                              Valor <SortIcon column="total" />
                            </th>
                            <th style={{ width: '18%' }}>Status (Alterar)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupOrders.map((os, index) => (
                            <tr 
                              key={os.id} 
                              className="process-row"
                              style={{
                                animation: `slideIn 0.3s ease-out ${index * 0.03}s both`,
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <td>
                                <span className="os-number" style={{
                                  background: colors.bg,
                                  border: `1px solid ${colors.border}`,
                                  color: colors.text,
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  fontWeight: 700,
                                  fontSize: '0.85rem'
                                }}>#{os.osNumber}</span>
                              </td>
                              <td>
                                <div className="cell-primary">{os.clientName}</div>
                                <div className="cell-secondary">🚗 {os.vehicle}</div>
                              </td>
                              <td className="cell-secondary">
                                📅 {formatDate(os.createdAt)}
                              </td>
                              <td>
                                <span style={{
                                  fontWeight: 700,
                                  color: 'var(--success)',
                                  fontSize: '1.05rem',
                                  fontFamily: 'monospace'
                                }}>
                                  {formatMoney(os.total)}
                                </span>
                              </td>
                              
                              {/* Célula de Status com Dropdown */}
                              <td className="status-cell" style={{ position: 'relative' }}>
                                <span 
                                  className={`status-badge st-${os.status} clickable`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedOS(selectedOS === os.id ? null : os.id);
                                  }}
                                  style={{
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.2s ease'
                                  }}
                                >
                                  {STATUS_LABELS[os.status]} 
                                  <span className="dropdown-arrow">▼</span>
                                </span>

                                {/* Menu Dropdown */}
                                {selectedOS === os.id && (
                                  <div 
                                    className="status-dropdown-menu" 
                                    style={{
                                      position: 'absolute',
                                      top: '100%',
                                      left: 0,
                                      marginTop: '8px',
                                      background: 'var(--bg-panel)',
                                      border: '1px solid var(--border)',
                                      borderRadius: '8px',
                                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                      zIndex: 10,
                                      minWidth: '180px',
                                      overflow: 'hidden',
                                      animation: 'fadeIn 0.2s ease-out'
                                    }}
                                  >
                                    {allStatuses.map(optStatus => (
                                      <div 
                                        key={optStatus}
                                        className={`status-option ${optStatus === os.status ? 'selected' : ''}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onUpdateStatus(os.id, optStatus);
                                          setSelectedOS(null);
                                        }}
                                        style={{
                                          padding: '12px 16px',
                                          cursor: 'pointer',
                                          background: optStatus === os.status ? 'var(--bg-card-hover)' : 'transparent',
                                          borderBottom: '1px solid var(--border)',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '8px',
                                          transition: 'background 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                                        onMouseLeave={(e) => {
                                          if (optStatus !== os.status) {
                                            e.currentTarget.style.background = 'transparent';
                                          }
                                        }}
                                      >
                                        {optStatus === os.status && <span>✔️</span>}
                                        {STATUS_LABELS[optStatus]}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Animações CSS */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .process-row:hover {
          background-color: var(--bg-card-hover) !important;
          transform: translateX(2px);
        }

        .status-badge.clickable:hover {
          transform: scale(1.05);
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
      `}</style>
    </div>
  );
};