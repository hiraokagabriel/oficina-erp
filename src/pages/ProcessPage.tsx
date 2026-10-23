import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { WorkOrder, OSStatus, STATUS_LABELS } from '../types';
import { compareByExpectedDate, getDeliveryBadge, DeliveryBadge } from '../services/deliveryBadge';
import { getDeliveryStatus } from '../services/schedule';
import { PAGE_STEP, pageSlice, nextVisible, nextBatchSize, pageCounterLabel, resetVisible } from '../services/pagination';
import { Money } from '../utils/helpers';
import { Icon, IconName } from '../components/ui/Icon';
import { ProcessRow, ALL_STATUSES } from '../components/ProcessRow';
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

const SORT_LABELS: Record<SortKey, string> = {
  osNumber: 'Nº OS',
  clientName: 'Cliente',
  createdAt: 'Data',
  total: 'Valor',
  paymentDate: 'Pagamento',
  expectedDate: 'Previsão de entrega',
};
/** Colunas que somem em janela estreita (ver @container em styles-processos.css). */
const NARROW_HIDDEN: SortKey[] = ['createdAt', 'paymentDate', 'expectedDate'];

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

interface Group {
  orders: WorkOrder[];
  total: number;
}

type PendingFocus = { kind: 'row'; id: string } | { kind: 'more'; status: OSStatus } | null;

export const ProcessPage: React.FC<ProcessPageProps> = ({ workOrders, onOpenNew, onUpdateStatus, onEdit, initialOnlyLate = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<OSStatus | 'ALL'>('ALL');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [sortBy, setSortBy] = useState<SortKey>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedGroups, setExpandedGroups] = useState<Set<OSStatus>>(new Set(['ORCAMENTO', 'APROVADO', 'EM_SERVICO']));
  const [onlyLate, setOnlyLate] = useState(initialOnlyLate);
  // Quantas linhas cada grupo mostra (50 por vez). Zera quando busca, filtros ou ordem mudam.
  const [visibleByStatus, setVisibleByStatus] = useState<Partial<Record<OSStatus, number>>>({});
  const resetPaging = useCallback(() => setVisibleByStatus(prev => resetVisible(prev)), []);

  // Callbacks estáveis: as linhas são memoizadas e não podem re-renderizar a cada tecla da busca.
  const latest = useRef({ onUpdateStatus, onEdit });
  latest.current = { onUpdateStatus, onEdit };
  const pendingFocus = useRef<PendingFocus>(null);
  const handleStatus = useCallback((id: string, status: OSStatus) => {
    pendingFocus.current = { kind: 'row', id };
    latest.current.onUpdateStatus(id, status);
  }, []);
  const handleOpen = useCallback((os: WorkOrder) => latest.current.onEdit?.(os), []);
  const canOpen = !!onEdit;

  // Estatísticas globais
  const stats = useMemo(() => {
    const total = workOrders.length;
    const totalValue = workOrders.reduce((sum, os) => sum + os.total, 0);
    const avgValue = total > 0 ? Math.round(totalValue / total) : 0;
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

  // Uma passada só: agrupa por status, soma o valor e calcula o selo de atraso de cada OS.
  const { groups, lateById } = useMemo(() => {
    const g: Record<OSStatus, Group> = {
      ORCAMENTO: { orders: [], total: 0 },
      APROVADO: { orders: [], total: 0 },
      EM_SERVICO: { orders: [], total: 0 },
      AGUARDANDO_PAGAMENTO: { orders: [], total: 0 },
      FINALIZADO: { orders: [], total: 0 },
      ARQUIVADO: { orders: [], total: 0 },
    };
    const late = new Map<string, DeliveryBadge>();
    const now = new Date();
    for (const os of filteredOrders) {
      const group = g[os.status];
      if (!group) continue;
      group.orders.push(os);
      group.total += os.total;
      if (os.expectedDate) {
        const badge = getDeliveryBadge(os, now);
        if (badge && badge.kind === 'atrasada') late.set(os.id, badge);
      }
    }
    return { groups: g, lateById: late };
  }, [filteredOrders]);

  // Devolve o foco a um alvo estável quando a linha some ou muda de grupo (o foco cairia no body).
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return; // outro elemento (menu, diálogo) já tem o foco
    if (target.kind === 'row') {
      const btn = document.querySelector<HTMLElement>(`[data-status-btn="${CSS.escape(target.id)}"]`);
      if (btn) { btn.focus(); return; }
      const moved = workOrders.find(o => o.id === target.id);
      const header = moved ? document.querySelector<HTMLElement>(`[data-group-btn="${moved.status}"]`) : null;
      (header ?? document.getElementById('pr-search'))?.focus();
    } else {
      document.querySelector<HTMLElement>(`[data-counter="${target.status}"]`)?.focus();
    }
  });

  const toggleGroup = (status: OSStatus) => {
    const wasOpen = expandedGroups.has(status);
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(status)) newSet.delete(status);
      else newSet.add(status);
      return newSet;
    });
    if (wasOpen) setVisibleByStatus(prev => resetVisible(prev, status));
  };

  const handleSort = (key: SortKey) => {
    resetPaging();
    if (sortBy === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDirection('desc');
    }
  };

  const showMore = (status: OSStatus, total: number) => {
    pendingFocus.current = { kind: 'more', status };
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
  const sortNote = NARROW_HIDDEN.includes(sortBy)
    ? `Ordenado por ${SORT_LABELS[sortBy]} (${sortDirection === 'asc' ? 'crescente' : 'decrescente'})`
    : null;

  return (
    <div className="pr-page">
      <header className="pr-head">
        <div className="pr-head-main">
          <h1 className="pr-title">Processos</h1>
          <ul className="pr-summary" aria-label="Resumo das OS">
            <li className="chip">Total: <strong>{stats.total} OS</strong></li>
            <li className="chip">Valor total: <strong>{Money.format(stats.totalValue)}</strong></li>
            <li className="chip">Valor médio por OS: <strong>{Money.format(stats.avgValue)}</strong></li>
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
            onChange={(e) => { resetPaging(); setSearchTerm(e.target.value); }}
          />
        </div>
        <div className="form-group pr-f">
          <label className="form-label" htmlFor="pr-status">Status</label>
          <select id="pr-status" className="form-input" value={selectedStatus}
            onChange={(e) => { resetPaging(); setSelectedStatus(e.target.value as OSStatus | 'ALL'); }}>
            <option value="ALL">Todos os status</option>
            {ALL_STATUSES.map(status => (
              <option key={status} value={status}>{STATUS_LABELS[status]}</option>
            ))}
          </select>
        </div>
        <div className="form-group pr-f">
          <label className="form-label" htmlFor="pr-period">Período</label>
          <select id="pr-period" className="form-input" value={dateFilter}
            onChange={(e) => { resetPaging(); setDateFilter(e.target.value as 'all' | 'today' | 'week' | 'month'); }}>
            <option value="all">Todo o período</option>
            <option value="today">Hoje</option>
            <option value="week">Semana</option>
            <option value="month">Mês</option>
          </select>
        </div>
        <label className="delivery-only-late pr-late">
          <input type="checkbox" checked={onlyLate} onChange={(e) => { resetPaging(); setOnlyLate(e.target.checked); }} />
          Só atrasadas
        </label>
        {hasFilter && (
          <button type="button" className="btn-secondary pr-clear" onClick={() => {
            resetPaging();
            setSearchTerm(''); setSelectedStatus('ALL'); setDateFilter('all'); setOnlyLate(false);
          }}>
            <Icon name="fechar" size={16} />
            Limpar filtros
          </button>
        )}
      </section>

      {/* Um único aviso para leitor de tela (os contadores por grupo não anunciam a cada tecla) */}
      <div className="pr-sr" role="status" aria-live="polite">
        {filteredOrders.length === 1 ? '1 OS encontrada' : `${filteredOrders.length} OS encontradas`}
      </div>

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
            const group = groups[status];
            const groupOrders = group.orders;
            if (groupOrders.length === 0 && selectedStatus === 'ALL') return null;

            const isExpanded = expandedGroups.has(status);
            const visible = visibleByStatus[status] ?? PAGE_STEP;
            const shown = isExpanded ? pageSlice(groupOrders, visible) : [];
            const panelId = `pr-panel-${status}`;

            return (
              <section key={status} className="pr-group">
                <h2 className="pr-group-title">
                  <button
                    type="button"
                    className="pr-group-btn"
                    data-group-btn={status}
                    aria-expanded={isExpanded}
                    aria-controls={isExpanded ? panelId : undefined}
                    onClick={() => toggleGroup(status)}
                  >
                    <Icon name="proximo" size={18} className={`pr-chev${isExpanded ? ' is-open' : ''}`} />
                    <span className={lightClass(status)}>
                      <Icon name={STATUS_ICON[status]} size={16} />
                      {STATUS_LABELS[status]}
                    </span>
                    <span className="count-badge">{groupOrders.length}</span>
                    <span className="pr-group-total">{Money.format(group.total)}</span>
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
                          {shown.map((os) => (
                            <ProcessRow
                              key={os.id}
                              os={os}
                              late={lateById.get(os.id) ?? null}
                              canOpen={canOpen}
                              onOpen={handleOpen}
                              onUpdateStatus={handleStatus}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {sortNote && <p className="pr-sort-note">{sortNote}</p>}
                    <div className="pr-more">
                      <span className="pr-counter" data-counter={status} tabIndex={-1}>{pageCounterLabel(visible, groupOrders.length)}</span>
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
