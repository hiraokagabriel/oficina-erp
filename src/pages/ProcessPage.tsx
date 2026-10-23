import React, { useState, useMemo } from 'react';
import { WorkOrder, OSStatus, STATUS_LABELS } from '../types';
import { compareByExpectedDate, getDeliveryBadge } from '../services/deliveryBadge';
import { getDeliveryStatus } from '../services/schedule';
import { PAGE_STEP, pageSlice, nextVisible, nextBatchSize, pageCounterLabel } from '../services/pagination';
import { Icon, IconName } from '../components/ui/Icon';
import '../styles-processos.css';

interface ProcessPageProps {
  workOrders: WorkOrder[];
  onOpenNew: () => void;
  onUpdateStatus: (id: string, newStatus: OSStatus) => void;
  /** Abre a OS na janela de edição (a mesma ação do Kanban). */
  onEdit?: (os: WorkOrder) => void;
  /** Abre a tela já com o filtro "Só atrasadas" ligado (botão "Ver todas" do Painel Hoje). */
  initialOnlyLate?: boolean;
}

type SortKey = 'osNumber' | 'clientName' | 'createdAt' | 'total' | 'paymentDate' | 'expectedDate';

const STATUS_ICON: Record<OSStatus, IconName> = {
  ORCAMENTO: 'prancheta',
  APROVADO: 'check',
  EM_SERVICO: 'oficina',
  AGUARDANDO_PAGAMENTO: 'cifrao',
  FINALIZADO: 'bandeira',
  ARQUIVADO: 'caixa',
};

/** Classe da luz de status (status-light--em-servico etc.). */
const lightClass = (status: OSStatus): string =>
  `status-light status-light--${status.toLowerCase().replace(/_/g, '-')}`;

const ALL_STATUSES: OSStatus[] = ['ORCAMENTO', 'APROVADO', 'EM_SERVICO', 'AGUARDANDO_PAGAMENTO', 'FINALIZADO', 'ARQUIVADO'];

const formatMoney = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val / 100);

const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('pt-BR');

export const ProcessPage: React.FC<ProcessPageProps> = ({ workOrders, onOpenNew, onUpdateStatus, onEdit, initialOnlyLate = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<OSStatus | 'ALL'>('ALL');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [sortBy, setSortBy] = useState<SortKey>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedGroups, setExpandedGroups] = useState<Set<OSStatus>>(new Set(['ORCAMENTO', 'APROVADO', 'EM_SERVICO']));
  const [onlyLate, setOnlyLate] = useState(initialOnlyLate);
  // Quantas linhas cada grupo mostra (50 por vez)
  const [visibleByStatus, setVisibleByStatus] = useState<Partial<Record<OSStatus, number>>>({});

  // Estatísticas globais
  const stats = useMemo(() => {
    const total = workOrders.length;
    const totalValue = workOrders.reduce((sum, os) => sum + os.total, 0);
    const avgValue = total > 0 ? totalValue / total : 0;
    return { total, totalValue, avgValue };
  }, [workOrders]);

  // Filtros
  const filteredOrders = useMemo(() => {
    let result = [...workOrders];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(os =>
        os.clientName.toLowerCase().includes(term) ||
        os.vehicle.toLowerCase().includes(term) ||
        os.osNumber.toString().includes(term)
      );
    }

    if (selectedStatus !== 'ALL') {
      result = result.filter(os => os.status === selectedStatus);
    }

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

    if (onlyLate) {
      const today = new Date();
      result = result.filter(os => getDeliveryStatus(os, today) === 'ATRASADA');
    }

    result.sort((a, b) => {
      if (sortBy === 'expectedDate') return compareByExpectedDate(a, b, sortDirection);
      let valA: string | number | undefined = a[sortBy];
      let valB: string | number | undefined = b[sortBy];

      if (sortBy === 'paymentDate') {
        if (!valA && !valB) return 0;
        if (!valA) return sortDirection === 'asc' ? 1 : -1;
        if (!valB) return sortDirection === 'asc' ? -1 : 1;
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      } else if (sortBy === 'createdAt') {
        valA = new Date(a.createdAt).getTime();
        valB = new Date(b.createdAt).getTime();
      } else if (typeof valA === 'string' && typeof valB === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA === undefined || valB === undefined) return 0; // só paymentDate pode faltar, e já foi tratado acima
      const comparison = valA < valB ? -1 : valA > valB ? 1 : 0;
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [workOrders, searchTerm, selectedStatus, dateFilter, onlyLate, sortBy, sortDirection]);

  // Estatísticas por status
  const groupStats = useMemo(() => {
    const groups: Record<OSStatus, { count: number; total: number }> = {
      ORCAMENTO: { count: 0, total: 0 },
      APROVADO: { count: 0, total: 0 },
      EM_SERVICO: { count: 0, total: 0 },
      AGUARDANDO_PAGAMENTO: { count: 0, total: 0 },
      FINALIZADO: { count: 0, total: 0 },
      ARQUIVADO: { count: 0, total: 0 },
    };

    filteredOrders.forEach(os => {
      const group = groups[os.status];
      if (group) {
        group.count++;
        group.total += os.total;
      }
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

  const showMore = (status: OSStatus, total: number) => {
    setVisibleByStatus(prev => ({ ...prev, [status]: nextVisible(prev[status] ?? PAGE_STEP, total) }));
  };

  const sortTh = (column: SortKey, label: React.ReactNode, className?: string) => (
    <th
      scope="col"
      className={className}
      aria-sort={sortBy === column ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className="pr-sort" onClick={() => handleSort(column)}>
        {label}
        {sortBy === column && (
          <>
            <Icon name="proximo" size={14} className={`pr-sort-ic pr-sort-ic--${sortDirection}`} />
            <span className="pr-sr">{sortDirection === 'asc' ? '(ordem crescente)' : '(ordem decrescente)'}</span>
          </>
        )}
      </button>
    </th>
  );

  const hasFilter = !!(searchTerm || selectedStatus !== 'ALL' || dateFilter !== 'all' || onlyLate);
  const now = new Date();

  return (
    <div className="pr-page">
      <header className="pr-head">
        <div className="pr-head-main">
          <h1 className="pr-title">Processos</h1>
          <ul className="pr-summary" aria-label="Resumo das OS">
            <li className="chip">Total: <strong>{stats.total} OS</strong></li>
            <li className="chip">Valor total: <strong>{formatMoney(stats.totalValue)}</strong></li>
            <li className="chip">Valor médio por OS: <strong>{formatMoney(stats.avgValue)}</strong></li>
          </ul>
        </div>
        <button type="button" className="btn" onClick={onOpenNew}>
          <Icon name="adicionar" size={18} />
          Nova OS
        </button>
      </header>

      <section className="pr-filters" aria-label="Filtros">
        <div className="form-group pr-f">
          <label className="form-label" htmlFor="pr-search">Buscar</label>
          <input
            id="pr-search"
            type="text"
            className="form-input"
            placeholder="Cliente, veículo, OS..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="form-group pr-f">
          <label className="form-label" htmlFor="pr-status">Status</label>
          <select id="pr-status" className="form-input" value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as OSStatus | 'ALL')}>
            <option value="ALL">Todos os status</option>
            {ALL_STATUSES.map(status => (
              <option key={status} value={status}>{STATUS_LABELS[status]}</option>
            ))}
          </select>
        </div>
        <div className="form-group pr-f">
          <label className="form-label" htmlFor="pr-period">Período</label>
          <select id="pr-period" className="form-input" value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as 'all' | 'today' | 'week' | 'month')}>
            <option value="all">Todo o período</option>
            <option value="today">Hoje</option>
            <option value="week">Semana</option>
            <option value="month">Mês</option>
          </select>
        </div>
        <label className="delivery-only-late pr-late">
          <input type="checkbox" checked={onlyLate} onChange={(e) => setOnlyLate(e.target.checked)} />
          Só atrasadas
        </label>
        {hasFilter && (
          <button type="button" className="btn-secondary pr-clear" onClick={() => {
            setSearchTerm(''); setSelectedStatus('ALL'); setDateFilter('all'); setOnlyLate(false);
          }}>
            <Icon name="fechar" size={16} />
            Limpar filtros
          </button>
        )}
      </section>

      {filteredOrders.length === 0 ? (
        <div className="empty-state">
          <Icon name="prancheta" size={40} className="empty-state-icon" />
          <h3 className="empty-state-title">Nenhuma OS encontrada</h3>
          <p className="empty-state-text">
            {hasFilter ? 'Tente ajustar os filtros acima.' : 'Crie a primeira OS no botão "Nova OS".'}
          </p>
        </div>
      ) : (
        <div className="pr-groups">
          {ALL_STATUSES.map(status => {
            const groupOrders = filteredOrders.filter(os => os.status === status);
            if (groupOrders.length === 0 && selectedStatus === 'ALL') return null;

            const isExpanded = expandedGroups.has(status);
            const visible = visibleByStatus[status] ?? PAGE_STEP;
            const shown = pageSlice(groupOrders, visible);
            const panelId = `pr-panel-${status}`;

            return (
              <section key={status} className="pr-group">
                <h2 className="pr-group-title">
                  <button
                    type="button"
                    className="pr-group-btn"
                    aria-expanded={isExpanded}
                    aria-controls={panelId}
                    onClick={() => toggleGroup(status)}
                  >
                    <Icon name="proximo" size={18} className={`pr-chev${isExpanded ? ' is-open' : ''}`} />
                    <span className={lightClass(status)}>
                      <Icon name={STATUS_ICON[status]} size={16} />
                      {STATUS_LABELS[status]}
                    </span>
                    <span className="count-badge">{groupOrders.length}</span>
                    <span className="pr-group-total">{formatMoney(groupStats[status].total)}</span>
                    <span className="pr-sr">{isExpanded ? '(recolher)' : '(expandir)'}</span>
                  </button>
                </h2>

                {isExpanded && (
                  <div id={panelId} className="pr-panel">
                    <div className="pr-scroll" tabIndex={0} role="region" aria-label={`Tabela: ${STATUS_LABELS[status]}`}>
                      <table className="pr-table">
                        <thead>
                          <tr>
                            {sortTh('osNumber', 'Nº OS', 'pr-c-os')}
                            {sortTh('clientName', 'Cliente / veículo', 'pr-c-client')}
                            {sortTh('createdAt', 'Data', 'pr-c-opt')}
                            {sortTh('paymentDate', 'Pagamento', 'pr-c-opt')}
                            {sortTh('expectedDate', 'Previsão de entrega', 'pr-c-opt')}
                            {sortTh('total', 'Valor', 'pr-c-total')}
                            <th scope="col" className="pr-c-status">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shown.map((os) => {
                            const badge = os.expectedDate ? getDeliveryBadge(os, now) : null;
                            const late = badge && badge.kind === 'atrasada' ? badge : null;
                            return (
                              <tr
                                key={os.id}
                                className="pr-row"
                                tabIndex={onEdit ? 0 : undefined}
                                aria-label={onEdit ? `Abrir OS #${os.osNumber}, ${os.clientName}` : undefined}
                                onClick={(e) => {
                                  if ((e.target as HTMLElement).closest('select, button, a')) return;
                                  if (onEdit) onEdit(os);
                                }}
                                onKeyDown={(e) => {
                                  if (e.target !== e.currentTarget) return;
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    if (onEdit) onEdit(os);
                                  }
                                }}
                              >
                                <td className="pr-c-os">
                                  <span className={`pr-os ${lightClass(os.status)}`}>#{os.osNumber}</span>
                                </td>
                                <td className="pr-c-client">
                                  <div className="cell-primary">{os.clientName}</div>
                                  <div className="cell-secondary">{os.vehicle}</div>
                                  {late && (
                                    <span className={`delivery-badge delivery-badge--${late.kind} pr-late-inline`}>{late.label}</span>
                                  )}
                                </td>
                                <td className="pr-c-opt cell-secondary">{formatDate(os.createdAt)}</td>
                                <td className="pr-c-opt">
                                  {os.paymentDate ? (
                                    <span className="pr-paid">
                                      <Icon name="check" size={14} />
                                      Pago em {formatDate(os.paymentDate)}
                                    </span>
                                  ) : os.status === 'ORCAMENTO' ? (
                                    <span className="cell-secondary" title="Sem cobrança: o orçamento ainda não foi aprovado">
                                      —<span className="pr-sr"> Sem cobrança ainda</span>
                                    </span>
                                  ) : (
                                    <span className="cell-secondary">A receber</span>
                                  )}
                                </td>
                                <td className="pr-c-opt">
                                  {os.expectedDate ? (
                                    <div className="process-expected">
                                      <span className="cell-secondary">{formatDate(os.expectedDate)}</span>
                                      {late && (
                                        <span className={`delivery-badge delivery-badge--${late.kind}`}>{late.label}</span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="cell-secondary">Sem previsão</span>
                                  )}
                                </td>
                                <td className="pr-c-total"><span className="pr-money">{formatMoney(os.total)}</span></td>
                                <td className="pr-c-status">
                                  <div className="pr-status">
                                    <span className={`${lightClass(os.status)} pr-dot`} aria-hidden="true" />
                                    <select
                                      className="form-input pr-status-select"
                                      aria-label={`Status da OS #${os.osNumber}`}
                                      value={os.status}
                                      onChange={(e) => onUpdateStatus(os.id, e.target.value as OSStatus)}
                                    >
                                      {ALL_STATUSES.map(opt => (
                                        <option key={opt} value={opt}>{STATUS_LABELS[opt]}</option>
                                      ))}
                                    </select>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="pr-more">
                      <span className="pr-counter" role="status">{pageCounterLabel(visible, groupOrders.length)}</span>
                      {nextBatchSize(visible, groupOrders.length) > 0 && (
                        <button type="button" className="btn-secondary" onClick={() => showMore(status, groupOrders.length)}>
                          Mostrar mais {nextBatchSize(visible, groupOrders.length)}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
