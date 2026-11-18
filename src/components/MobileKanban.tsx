import { useEffect, useMemo, useRef, useState } from 'react';
import { OSStatus, STATUS_LABELS, WorkOrder } from '../types';
import { KanbanCard } from './KanbanCard';
import type { KanbanCardActions } from './KanbanCardMenu';
import { Icon } from './ui/Icon';
import { STATUS_ICON, statusClass } from '../services/kanbanCardView';
import { PHONE_CHIPS, buildPlateOf, chipCounts, emptyChipText, filterWorkOrders, initialChip } from '../services/mobileKanban';
import { usePagination } from '../hooks/usePagination';
import { getPhoneChip, setPhoneChip } from '../utils/uiPrefs';
import { useDatabase } from '../context/DatabaseContext';

interface MobileKanbanProps {
  workOrders: WorkOrder[];
  actions: KanbanCardActions;
  formatMoney: (val: number) => string;
  onStatusChange: (orderId: string, newStatus: OSStatus) => void;
  today: string;
  targetMargin?: number;
  showMargin: boolean;
  showPrices: boolean;
  canManage: boolean;
}

/** Quadro do celular: busca, chips de status e lista em coluna única. Sem arrastar (o status muda dentro da OS). */
export default function MobileKanban({ workOrders, actions, formatMoney, onStatusChange, today, targetMargin, showMargin, showPrices, canManage }: MobileKanbanProps) {
  const { cloud, clients } = useDatabase();
  const role = cloud?.role;
  const [chip, setChip] = useState<OSStatus>(() => initialChip(getPhoneChip(), role));
  const [term, setTerm] = useState('');

  const counts = useMemo(() => chipCounts(workOrders), [workOrders]);
  const plateOf = useMemo(() => buildPlateOf(clients ?? []), [clients]);
  const searching = term.trim() !== '';

  // Busca vale para o quadro todo (achar a OS pela placa em qualquer status); sem busca, só o chip ativo.
  const list = useMemo(() => {
    const open = workOrders.filter((o) => o.status !== 'ARQUIVADO');
    const base = searching ? filterWorkOrders(open, term.trim(), plateOf) : open.filter((o) => o.status === chip);
    return [...base].sort((a, b) => b.osNumber - a.osNumber);
  }, [workOrders, term, searching, chip, plateOf]);

  const { paginatedItems, loadMore, hasMore, totalItems } = usePagination({ items: list, itemsPerPage: 30 });

  // Chip ativo visível ao abrir (o trilho rola sozinho; a página não).
  const activeChipRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const el = activeChipRef.current;
    const rail = el?.parentElement;
    if (el && rail) rail.scrollLeft = Math.max(0, el.offsetLeft - (rail.clientWidth - el.offsetWidth) / 2);
  }, [chip, searching]);

  const pick = (s: OSStatus): void => {
    setChip(s);
    setPhoneChip(s);
  };

  return (
    <div className="mk">
      <div className="search-wrapper mk-search">
        <label htmlFor="mk-search" className="sr-only">Buscar</label>
        <Icon name="buscar" size={18} className="search-icon" />
        <input
          id="mk-search"
          type="search"
          className="form-input search-input"
          placeholder="Placa, cliente ou nº da OS"
          autoComplete="off"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        {term && (
          <button type="button" className="btn-clear-search" aria-label="Limpar a busca" onClick={() => setTerm('')}>
            <Icon name="fechar" size={18} />
          </button>
        )}
      </div>

      <div className="mk-chips" role="group" aria-label="Situação da OS">
        {PHONE_CHIPS.map((s) => (
          <button
            key={s}
            type="button"
            ref={!searching && chip === s ? activeChipRef : undefined}
            className={`chip mk-chip${!searching && chip === s ? ' chip--accent' : ''}`}
            aria-pressed={!searching && chip === s}
            onClick={() => { pick(s); setTerm(''); }}
          >
            <span className={`status-light status-light--${statusClass(s)}`} aria-hidden="true" />
            <span>{STATUS_LABELS[s]}</span>
            <span className="mk-chip-n">{counts[s]}</span>
          </button>
        ))}
      </div>

      {searching && <div className="mk-found" role="status">{totalItems} {totalItems === 1 ? 'OS encontrada' : 'OS encontradas'}</div>}

      <div className="mk-list">
        {list.length === 0 ? (
          <div className="empty-state kanban-empty">
            <Icon name={searching ? 'buscar' : STATUS_ICON[chip]} size={40} className="empty-state-icon" />
            <p className="empty-state-title">{searching ? 'Nenhuma OS encontrada.' : emptyChipText(chip)}</p>
          </div>
        ) : (
          paginatedItems.map((os) => (
            <KanbanCard
              key={os.id}
              os={os}
              formatMoney={formatMoney}
              status={os.status}
              actions={actions}
              onStatusChange={onStatusChange}
              today={today}
              showMargin={showMargin}
              targetMargin={targetMargin}
              showPrices={showPrices}
              canManage={canManage}
            />
          ))
        )}
        {hasMore && <button type="button" className="btn-secondary mk-more" onClick={loadMore}>Mostrar mais</button>}
      </div>
    </div>
  );
}
