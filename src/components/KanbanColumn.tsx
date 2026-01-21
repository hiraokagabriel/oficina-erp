import React, { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { WorkOrder, OSStatus, STATUS_LABELS } from '../types';
import { KanbanCard } from './KanbanCard';
import { usePagination } from '../hooks/usePagination';
import { InfiniteScroll } from './InfiniteScroll';

interface KanbanColumnProps {
  status: OSStatus;
  workOrders: WorkOrder[];
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
}

const EmptyState: React.FC<{ status: OSStatus }> = ({ status }) => {
  const messages: Record<string, { icon: string; text: string }> = {
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
};

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  status,
  workOrders,
  actions,
  formatMoney,
}) => {
  // ✅ Hook do @dnd-kit para tornar a coluna droppable
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  // Aplica paginação
  const {
    paginatedItems,
    loadMore,
    hasMore,
    loadedItems,
    totalItems,
  } = usePagination({
    items: workOrders,
    itemsPerPage: 50,
  });

  const colColorMap: Record<string, string> = {
    ORCAMENTO: 'var(--info)',
    APROVADO: 'var(--warning)',
    EM_SERVICO: 'var(--primary)',
    FINALIZADO: 'var(--success)',
    ARQUIVADO: 'var(--text-muted)',
  };

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

      {/* ✅ Área droppable */}
      <div
        ref={setNodeRef}
        className="kanban-list-scroll"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          padding: '8px',
          background: isOver
            ? 'linear-gradient(180deg, rgba(130, 87, 230, 0.1) 0%, rgba(130, 87, 230, 0.05) 100%)'
            : 'transparent',
          border: isOver ? '2px dashed var(--primary)' : '2px solid transparent',
          borderRadius: '12px',
          transition: 'all 0.2s ease',
          minHeight: 150,
          flex: 1,
          overflowY: 'auto',
        }}
      >
        {paginatedItems.length === 0 ? (
          <EmptyState status={status} />
        ) : (
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
        )}
      </div>
    </div>
  );
};