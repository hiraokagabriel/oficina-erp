import React, { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import { WorkOrder, OSStatus, STATUS_LABELS } from '../types';
import { KanbanCard } from '../components/KanbanCard';
import type { KanbanCardActions } from './KanbanCardMenu';
import { DroppableColumn } from './DroppableColumn';
import { usePagination } from '../hooks/usePagination';
import { InfiniteScroll } from './InfiniteScroll';
import { Icon } from './ui/Icon';
import { STATUS_ICON, shouldIgnoreStep, statusClass } from '../services/kanbanCardView';
import { toLocalDay } from '../services/receivables';

interface KanbanBoardProps {
  workOrders: WorkOrder[];
  isLoading: boolean;
  onStatusChange: (orderId: string, newStatus: OSStatus) => void;
  actions: KanbanCardActions;
  formatMoney: (val: number) => string;
  showArchived?: boolean;
  /** Meta de margem global (%), das Configurações. */
  targetMargin?: number;
  /** Mostra o selo de margem nos cartões (opção da Configuração; desligado por padrão). */
  showMargin?: boolean;
}

// ...restante dos imports DnD
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

const POINTER_OPTIONS = { activationConstraint: { distance: 8 } };

// Enter e Espaço abrem a OS no cartão focado; o arraste por teclado começa com M (e termina com Enter ou Espaço).
const KEYBOARD_OPTIONS = { keyboardCodes: { start: ['KeyM'], cancel: ['Escape'], end: ['Enter', 'Space'] } };

const ACCESSIBILITY = {
  screenReaderInstructions: {
    draggable:
      'Enter abre a OS. Para mover a OS com o teclado, tecle M, use as setas para escolher a coluna e confirme com Enter. Esc cancela.',
  },
  announcements: {
    onDragStart: () => 'OS selecionada para mover.',
    onDragOver: () => 'OS sobre outra posição.',
    onDragEnd: () => 'OS solta.',
    onDragCancel: () => 'Movimento cancelado.',
  },
};

const EMPTY_TITLES: Record<OSStatus, string> = {
  ORCAMENTO: 'Nenhuma OS aqui',
  APROVADO: 'Nenhuma OS aqui',
  EM_SERVICO: 'Nenhuma OS aqui',
  AGUARDANDO_PAGAMENTO: 'Nenhuma OS aqui',
  FINALIZADO: 'Nenhuma OS finalizada',
  ARQUIVADO: 'Nenhuma OS arquivada',
};

const EmptyState = React.memo(({ status }: { status: OSStatus }) => (
  <div className="empty-state kanban-empty">
    <Icon name={STATUS_ICON[status]} size={40} className="empty-state-icon" />
    <p className="empty-state-title">{EMPTY_TITLES[status]}</p>
  </div>
));

const KanbanColumn = React.memo(
  ({
    status,
    workOrders,
    actions,
    formatMoney,
    targetMargin,
    showMargin,
    onStatusChange,
    today,
  }: {
    status: OSStatus;
    workOrders: WorkOrder[];
    actions: KanbanBoardProps['actions'];
    formatMoney: (val: number) => string;
    targetMargin?: number;
    showMargin?: boolean;
    onStatusChange: (orderId: string, newStatus: OSStatus) => void;
    today: string;
  }) => {
    const sortedList = useMemo(() => {
      return workOrders
        .filter((o) => o.status === status)
        .sort((a, b) => b.osNumber - a.osNumber);
    }, [workOrders, status]);

    const { paginatedItems, loadMore, hasMore, loadedItems, totalItems } = usePagination({
      items: sortedList,
      itemsPerPage: 50,
    });

    // Mesma identidade enquanto os ids não mudam: array novo a cada render faz o
    // SortableContext re-renderizar todos os cartões (digitar no filtro, por exemplo).
    const itemIdsRef = useRef<string[]>([]);
    const nextIds = paginatedItems.map((os) => os.id);
    if (
      nextIds.length !== itemIdsRef.current.length ||
      nextIds.some((id, i) => id !== itemIdsRef.current[i])
    ) {
      itemIdsRef.current = nextIds;
    }
    const itemIds = itemIdsRef.current;

    return (
      <div className={`kanban-column kanban-column--${statusClass(status)}`}>
        <div className="kanban-header">
          <span className={`status-light status-light--${statusClass(status)}`}>
            <Icon name={STATUS_ICON[status]} size={16} />
            {STATUS_LABELS[status]}
          </span>
          <span className="kanban-count" aria-label={`Total: ${totalItems}`}>{totalItems}</span>
        </div>
        {hasMore && <div className="kanban-partial">Mostrando {loadedItems} de {totalItems}</div>}

        <DroppableColumn id={status}>
          {paginatedItems.length === 0 ? (
            <EmptyState status={status} />
          ) : (
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
              <InfiniteScroll hasMore={hasMore} loadMore={loadMore}>
                {paginatedItems.map((os) => (
                  <KanbanCard
                    key={os.id}
                    os={os}
                    formatMoney={formatMoney}
                    status={status}
                    actions={actions}
                    onStatusChange={onStatusChange}
                    today={today}
                    showMargin={showMargin}
                    targetMargin={targetMargin}
                  />
                ))}
              </InfiniteScroll>
            </SortableContext>
          )}
        </DroppableColumn>
      </div>
    );
  }
);

export const KanbanBoard = React.memo<KanbanBoardProps>(
  ({ workOrders, isLoading, onStatusChange, actions, formatMoney, showArchived = false, targetMargin, showMargin }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [technicianFilter, setTechnicianFilter] = useState<'ALL' | 'NONE' | string>('ALL');
    const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
    // Hoje, uma vez por render do quadro (string: os cartões memoizados só re-renderizam na virada do dia).
    const today = toLocalDay(new Date());

    // Trava do clique duplo no botão de próximo passo (o arraste usa onStatusChange direto, sem trava).
    const lastStepAt = useRef<number | null>(null);
    const handleStep = useCallback((orderId: string, newStatus: OSStatus) => {
      const now = Date.now();
      if (shouldIgnoreStep(lastStepAt.current, now)) return;
      lastStepAt.current = now;
      onStatusChange(orderId, newStatus);
    }, [onStatusChange]);

    // Opções fora do render (POINTER_OPTIONS): objeto novo a cada render recriava os sensores
    // e re-renderizava todos os cartões via contexto do dnd-kit.
    const sensors = useSensors(
      useSensor(PointerSensor, POINTER_OPTIONS),
      useSensor(KeyboardSensor, KEYBOARD_OPTIONS)
    );

    const technicianStats = useMemo(() => {
      const map = new Map<string, number>();
      let noneCount = 0;

      workOrders.forEach(os => {
        const t = (os.technician || '').trim();
        if (!t) {
          noneCount++;
          return;
        }
        map.set(t, (map.get(t) || 0) + 1);
      });

      const list = Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { sensitivity: 'base' }))
        .map(([name, count]) => ({ name, count }));

      return { noneCount, list };
    }, [workOrders]);

    const filteredWorkOrders = useMemo(() => {
      let base = workOrders;

      if (technicianFilter !== 'ALL') {
        if (technicianFilter === 'NONE') {
          base = base.filter(os => !(os.technician || '').trim());
        } else {
          base = base.filter(os => (os.technician || '').trim() === technicianFilter);
        }
      }

      if (!searchTerm) return base;

      const term = searchTerm.toLowerCase();
      return base.filter(
        (os) =>
          os.clientName.toLowerCase().includes(term) ||
          os.vehicle.toLowerCase().includes(term) ||
          os.osNumber.toString().includes(term) ||
          (os.clientPhone && os.clientPhone.includes(term)) ||
          ((os.technician || '').toLowerCase().includes(term))
      );
    }, [workOrders, searchTerm, technicianFilter]);

    const activeWorkOrder = useMemo(
      () => workOrders.find((os) => os.id === activeId),
      [activeId, workOrders]
    );

    const handleDragStart = (event: DragStartEvent) => {
      setActiveId(event.active.id);
    };

    const handleDragEnd = (event: DragEndEvent) => {
      const { active, over } = event;

      setActiveId(null);

      if (!over) {
        return;
      }

      const orderId = active.id as string;
      const overId = over.id as string;

      const validStatuses: OSStatus[] = ['ORCAMENTO', 'APROVADO', 'EM_SERVICO', 'AGUARDANDO_PAGAMENTO', 'FINALIZADO', 'ARQUIVADO'];

      let newStatus: OSStatus | null = null;

      if (validStatuses.includes(overId as OSStatus)) {
        newStatus = overId as OSStatus;
      } else {
        const overWorkOrder = workOrders.find((wo) => wo.id === overId);
        if (overWorkOrder) {
          newStatus = overWorkOrder.status;
        }
      }

      if (!newStatus) {
        return;
      }

      const workOrder = workOrders.find((wo) => wo.id === orderId);

      if (!workOrder) {
        return;
      }

      if (workOrder.status === newStatus) {
        return;
      }

      onStatusChange(orderId, newStatus);
    };

    const handleDragCancel = () => {
      setActiveId(null);
    };

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const [columnWidth, setColumnWidth] = useState<number | null>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    useEffect(() => {
      if (!scrollRef.current) return;
      const firstColumn = scrollRef.current.querySelector('.kanban-column') as HTMLDivElement | null;
      if (firstColumn) {
        setColumnWidth(firstColumn.offsetWidth + 16); // largura + gap
      }
    }, [filteredWorkOrders.length, showArchived]);

    useEffect(() => {
      if (!scrollRef.current || showArchived) return;

      const el = scrollRef.current;
      const updateScrollFlags = () => {
        const { scrollLeft, scrollWidth, clientWidth } = el;
        const tolerance = 8;
        setCanScrollLeft(scrollLeft > tolerance);
        setCanScrollRight(scrollLeft < scrollWidth - clientWidth - tolerance);
      };

      updateScrollFlags();
      el.addEventListener('scroll', updateScrollFlags);
      return () => {
        el.removeEventListener('scroll', updateScrollFlags);
      };
    }, [filteredWorkOrders.length, showArchived]);

    const handleStepScroll = (direction: 'left' | 'right') => {
      if (!scrollRef.current || !columnWidth) return;
      const delta = direction === 'left' ? -columnWidth : columnWidth;
      scrollRef.current.scrollBy({ left: delta, behavior: 'smooth' });
    };

    if (isLoading) {
      return (
        <div className="kanban-board">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="kanban-column">
              <div className="skeleton skeleton-block" />
            </div>
          ))}
        </div>
      );
    }

    const showArrows = !showArchived;
    const columnProps = {
      workOrders: filteredWorkOrders,
      actions,
      formatMoney,
      targetMargin,
      showMargin,
      onStatusChange: handleStep,
      today,
    };

    return (
      <div className="kanban-wrap">
        <div className="kanban-filter-bar">
          <div className="search-wrapper">
            <label htmlFor="kanban-search" className="sr-only">Buscar OS</label>
            <Icon name="buscar" size={18} className="search-icon" />
            <input
              id="kanban-search"
              type="text"
              className="form-input search-input"
              placeholder="Buscar cliente, OS, veículo ou placa"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button type="button" className="btn-clear-search" aria-label="Limpar a busca" title="Limpar a busca" onClick={() => setSearchTerm('')}>
                <Icon name="fechar" size={18} />
              </button>
            )}
          </div>

          <div className="kanban-tech-filter">
            <label htmlFor="kanban-tech" className="kanban-filter-label">Técnico</label>
            <select
              id="kanban-tech"
              className="form-input"
              value={technicianFilter}
              onChange={(e) => setTechnicianFilter(e.target.value)}
            >
              <option value="ALL">Todos os técnicos</option>
              <option value="NONE">Sem técnico ({technicianStats.noneCount})</option>
              {technicianStats.list.map(t => (
                <option key={t.name} value={t.name}>{t.name} ({t.count})</option>
              ))}
            </select>
          </div>

          <div className="filter-stats">
            Mostrando <strong>{filteredWorkOrders.length}</strong> de {workOrders.length} ordens
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
          accessibility={ACCESSIBILITY}
        >
          <div
            ref={scrollRef}
            className="kanban-board"
            style={{
              overflowX: showArchived ? 'hidden' : 'auto',
              scrollSnapType: showArchived ? 'none' : 'x mandatory',
            }}
          >
            {showArchived ? (
              <KanbanColumn status="ARQUIVADO" {...columnProps} />
            ) : (
              <>
                <KanbanColumn status="ORCAMENTO" {...columnProps} />
                <KanbanColumn status="APROVADO" {...columnProps} />
                <KanbanColumn status="EM_SERVICO" {...columnProps} />
                <KanbanColumn status="AGUARDANDO_PAGAMENTO" {...columnProps} />
                <KanbanColumn status="FINALIZADO" {...columnProps} />
              </>
            )}
          </div>

          {showArrows && (
            <>
              {canScrollLeft && (
                <button
                  type="button"
                  className="kanban-scroll-btn kanban-scroll-btn--left"
                  onClick={() => handleStepScroll('left')}
                  aria-label="Ver colunas anteriores"
                  title="Ver colunas anteriores"
                >
                  <Icon name="voltar" size={22} />
                </button>
              )}

              {canScrollRight && (
                <button
                  type="button"
                  className="kanban-scroll-btn kanban-scroll-btn--right"
                  onClick={() => handleStepScroll('right')}
                  aria-label="Ver próximas colunas"
                  title="Ver próximas colunas"
                >
                  <Icon name="proximo" size={22} />
                </button>
              )}
            </>
          )}

          <DragOverlay>
            {activeWorkOrder && (
              <div
                style={{
                  opacity: 0.9,
                  transform: 'rotate(3deg)',
                  cursor: 'grabbing',
                }}
              >
                <KanbanCard
                  os={activeWorkOrder}
                  formatMoney={formatMoney}
                  status={activeWorkOrder.status}
                  actions={actions}
                  onStatusChange={handleStep}
                  today={today}
                  showMargin={showMargin}
                  isDragging
                  targetMargin={targetMargin}
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
    );
  }
);
