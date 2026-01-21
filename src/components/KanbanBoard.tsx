import React, { useState, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
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
import { WorkOrder, OSStatus, STATUS_LABELS } from '../types';
import { KanbanCard } from './KanbanCard';
import { DroppableColumn } from './DroppableColumn';
import { usePagination } from '../hooks/usePagination';
import { InfiniteScroll } from './InfiniteScroll';

interface KanbanBoardProps {
  workOrders: WorkOrder[];
  isLoading: boolean;
  onStatusChange: (orderId: string, newStatus: OSStatus) => void;
  actions: {
    onRegress: (id: string) => void;
    onEdit: (os: WorkOrder) => void;
    onChecklist: (os: WorkOrder) => void;
    onPrint: (os: WorkOrder) => void;
    onDelete: (os: WorkOrder) => void;
    onAdvance: (id: string) => void;
    onArchive?: (os: WorkOrder) => void;
    onRestore?: (os: WorkOrder) => void;
    onQuickFinish?: (id: string) => void;
  };
  formatMoney: (val: number) => string;
  showArchived?: boolean;
}

const EmptyState = React.memo(({ status }: { status: OSStatus }) => {
  const messages: Record<OSStatus, { icon: string; text: string }> = {
    ORCAMENTO: { icon: '📝', text: 'Sem orçamentos pendentes' },
    APROVADO: { icon: '✅', text: 'Nada aprovado aguardando' },
    EM_SERVICO: { icon: '🔧', text: 'Nenhum veículo no elevador' },
    FINALIZADO: { icon: '🏁', text: 'Nenhuma OS finalizada hoje' },
    ARQUIVADO: { icon: '📦', text: 'Lixeira vazia. Nenhuma OS arquivada.' },
  };

  const info = messages[status] || { icon: '📂', text: 'Lista vazia' };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        opacity: 0.5,
        textAlign: 'center',
        border: '2px dashed var(--border)',
        borderRadius: '12px',
        margin: '10px',
      }}
    >
      <div style={{ fontSize: '2rem', marginBottom: '10px' }}>{info.icon}</div>
      <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>
        {info.text}
      </div>
    </div>
  );
});

const KanbanColumn = React.memo(
  ({
    status,
    workOrders,
    actions,
    formatMoney,
  }: {
    status: OSStatus;
    workOrders: WorkOrder[];
    actions: KanbanBoardProps['actions'];
    formatMoney: (val: number) => string;
  }) => {
    // Filtra e ordena
    const sortedList = useMemo(() => {
      return workOrders
        .filter((o) => o.status === status)
        .sort((a, b) => b.osNumber - a.osNumber);
    }, [workOrders, status]);

    // Aplica paginação
    const { paginatedItems, loadMore, hasMore, loadedItems, totalItems } = usePagination({
      items: sortedList,
      itemsPerPage: 50,
    });

    const colColorMap: Record<OSStatus, string> = {
      ORCAMENTO: 'var(--info)',
      APROVADO: 'var(--warning)',
      EM_SERVICO: 'var(--primary)',
      FINALIZADO: 'var(--success)',
      ARQUIVADO: 'var(--text-muted)',
    };

    // IDs para o SortableContext
    const itemIds = paginatedItems.map((os) => os.id);

    return (
      <div
        className="kanban-column"
        style={{ borderTop: `4px solid ${colColorMap[status]}` }}
      >
        <div className="kanban-header">
          {STATUS_LABELS[status]}
          <span
            style={{
              background: 'rgba(0,0,0,0.05)',
              padding: '2px 8px',
              borderRadius: 10,
            }}
          >
            {loadedItems}/{totalItems}
          </span>
        </div>

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
  ({ workOrders, isLoading, onStatusChange, actions, formatMoney, showArchived = false }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

    // ✅ Sensores otimizados - suporte a touch, mouse e teclado
    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: {
          distance: 8, // Previne cliques acidentais
        },
      }),
      useSensor(KeyboardSensor)
    );

    // Filtragem por busca
    const filteredWorkOrders = useMemo(() => {
      if (!searchTerm) return workOrders;

      const term = searchTerm.toLowerCase();
      return workOrders.filter(
        (os) =>
          os.clientName.toLowerCase().includes(term) ||
          os.vehicle.toLowerCase().includes(term) ||
          os.osNumber.toString().includes(term) ||
          (os.clientPhone && os.clientPhone.includes(term))
      );
    }, [workOrders, searchTerm]);

    // Encontra a OS sendo arrastada
    const activeWorkOrder = useMemo(
      () => workOrders.find((os) => os.id === activeId),
      [activeId, workOrders]
    );

    // Handlers
    const handleDragStart = (event: DragStartEvent) => {
      setActiveId(event.active.id);
    };

    const handleDragEnd = (event: DragEndEvent) => {
      const { active, over } = event;

      setActiveId(null);

      if (!over) return;

      const orderId = active.id as string;
      const newStatus = over.id as OSStatus;

      // Verifica se mudou de coluna
      const workOrder = workOrders.find((wo) => wo.id === orderId);
      if (workOrder && workOrder.status !== newStatus) {
        onStatusChange(orderId, newStatus);
      }
    };

    const handleDragCancel = () => {
      setActiveId(null);
    };

    if (isLoading) {
      return (
        <div className="kanban-board">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="kanban-column">
              <div className="skeleton skeleton-block" />
            </div>
          ))}
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Barra de busca */}
        <div className="kanban-filter-bar">
          <div className="search-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="form-input search-input"
              placeholder="Buscar por Cliente, OS, Veículo ou Placa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button className="btn-clear-search" onClick={() => setSearchTerm('')}>
                ✕
              </button>
            )}
          </div>
          <div className="filter-stats">
            Mostrando <strong>{filteredWorkOrders.length}</strong> de {workOrders.length} ordens
          </div>
        </div>

        {/* Drag and Drop Context */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div
            className="kanban-board"
            style={{
              gridTemplateColumns: showArchived ? '1fr' : 'repeat(4, 1fr)',
            }}
          >
            {showArchived ? (
              <KanbanColumn
                status="ARQUIVADO"
                workOrders={filteredWorkOrders}
                actions={actions}
                formatMoney={formatMoney}
              />
            ) : (
              <>
                <KanbanColumn
                  status="ORCAMENTO"
                  workOrders={filteredWorkOrders}
                  actions={actions}
                  formatMoney={formatMoney}
                />
                <KanbanColumn
                  status="APROVADO"
                  workOrders={filteredWorkOrders}
                  actions={actions}
                  formatMoney={formatMoney}
                />
                <KanbanColumn
                  status="EM_SERVICO"
                  workOrders={filteredWorkOrders}
                  actions={actions}
                  formatMoney={formatMoney}
                />
                <KanbanColumn
                  status="FINALIZADO"
                  workOrders={filteredWorkOrders}
                  actions={actions}
                  formatMoney={formatMoney}
                />
              </>
            )}
          </div>

          {/* Overlay visual durante o drag */}
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
                  isDragging
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
    );
  }
);