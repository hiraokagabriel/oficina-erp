import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { WorkOrder, OSStatus } from '../types';
import { Button, Card, Badge, EmptyState, Skeleton } from '../components/ui/PremiumComponents';

interface WorkshopPageProps {
  workOrders: WorkOrder[];
  isLoading: boolean;
  formatMoney: (val: number) => string;
  onNewOS: () => void;
  onDragEnd: (result: DropResult) => void;
  kanbanActions: {
    onRegress: (id: string) => void;
    onAdvance: (id: string) => void;
    onEdit: (os: WorkOrder) => void;
    onChecklist: (os: WorkOrder) => void;
    onPrint: (os: WorkOrder) => void;
    onDelete: (os: WorkOrder) => void;
    onArchive: (os: WorkOrder) => void;
    onRestore: (os: WorkOrder) => void;
    onQuickFinish: (id: string) => void;
  };
}

const statusConfig = {
  ORCAMENTO: { label: 'Orçamento', color: 'info', icon: '💰' },
  APROVADO: { label: 'Aprovado', color: 'warning', icon: '✅' },
  EM_SERVICO: { label: 'Em Serviço', color: 'primary', icon: '🔧' },
  FINALIZADO: { label: 'Finalizado', color: 'success', icon: '🎉' },
  ARQUIVADO: { label: 'Arquivado', color: 'info', icon: '📦' },
};

const KanbanCard: React.FC<{
  os: WorkOrder;
  actions: typeof WorkshopPageProps.prototype.kanbanActions;
  formatMoney: (val: number) => string;
}> = ({ os, actions, formatMoney }) => (
  <Card className="kanban-card">
    <div className="kanban-card-header">
      <span className="kanban-card-number">#{os.osNumber}</span>
      <span className="kanban-card-price">{formatMoney(os.total)}</span>
    </div>

    <h4 className="kanban-card-title">{os.clientName}</h4>
    <p className="kanban-card-subtitle">{os.vehicle.model || 'Veículo'}</p>

    <div className="kanban-card-meta">
      <span>{os.parts.length + os.services.length} itens</span>
      <span>{new Date(os.createdAt).toLocaleDateString('pt-BR')}</span>
    </div>

    <div className="kanban-card-actions">
      {os.status !== 'FINALIZADO' && os.status !== 'ARQUIVADO' && (
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => actions.onEdit(os)}
            className="kanban-btn"
            title="Editar"
          >
            ✏️
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => actions.onChecklist(os)}
            className="kanban-btn"
            title="Checklist"
          >
            ☑️
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => actions.onPrint(os)}
            className="kanban-btn"
            title="Imprimir"
          >
            🖨️
          </Button>
        </>
      )}
      {os.status === 'FINALIZADO' && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => actions.onRestore(os)}
          className="kanban-btn"
          title="Reabrir"
        >
          🔄
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => actions.onDelete(os)}
        className="kanban-btn danger"
        title="Excluir"
      >
        🗑️
      </Button>
    </div>
  </Card>
);

const KanbanColumn: React.FC<{
  status: OSStatus;
  orders: WorkOrder[];
  actions: WorkshopPageProps['kanbanActions'];
  formatMoney: (val: number) => string;
  provided?: any;
}> = ({ status, orders, actions, formatMoney, provided }) => {
  const config = statusConfig[status];
  const displayStatus = status === 'ARQUIVADO' ? 'ARQUIVADO' : status;

  return (
    <div
      className="kanban-column"
      ref={provided?.innerRef}
      {...provided?.droppableProps}
    >
      <div className="kanban-header">
        <div>
          <span>{config.icon}</span>
          <strong>{config.label}</strong>
        </div>
        <span className="kanban-count">{orders.length}</span>
      </div>

      <div className="kanban-list">
        {orders.length === 0 ? (
          <div style={{ opacity: 0.5, textAlign: 'center', padding: 'var(--space-6)' }}>
            Nenhuma OS
          </div>
        ) : (
          orders.map((os, index) => (
            <Draggable
              key={os.id}
              draggableId={os.id}
              index={index}
              isDragDisabled={displayStatus === 'ARQUIVADO'}
            >
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.draggableProps}
                  {...provided.dragHandleProps}
                  style={{
                    ...provided.draggableProps.style,
                    opacity: snapshot.isDragging ? 0.5 : 1,
                  }}
                >
                  <KanbanCard os={os} actions={actions} formatMoney={formatMoney} />
                </div>
              )}
            </Draggable>
          ))
        )}
        {provided?.placeholder}
      </div>
    </div>
  );
};

export const WorkshopPage: React.FC<WorkshopPageProps> = ({
  workOrders,
  isLoading,
  formatMoney,
  onNewOS,
  onDragEnd,
  kanbanActions,
}) => {
  const [filterStatus, setFilterStatus] = useState<OSStatus | 'TODOS'>('TODOS');

  const statuses: OSStatus[] = ['ORCAMENTO', 'APROVADO', 'EM_SERVICO', 'FINALIZADO', 'ARQUIVADO'];
  const filteredOrders = (status: OSStatus) =>
    filterStatus === 'TODOS'
      ? workOrders.filter((o) => o.status === status)
      : filterStatus === status
      ? workOrders.filter((o) => o.status === status)
      : [];

  return (
    <div>
      {/* Header */}
      <div className="header-area">
        <div>
          <h1 className="page-title">🔧 Oficina</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
            Total: {workOrders.length} OS
          </p>
        </div>
        <Button variant="primary" size="lg" onClick={onNewOS}>
          + Nova OS
        </Button>
      </div>

      {/* Status Filter */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-3)',
        marginBottom: 'var(--space-6)',
        overflowX: 'auto',
        paddingBottom: 'var(--space-3)',
      }}>
        {['TODOS', ...statuses].map((s) => {
          const isActive = filterStatus === s;
          const config = s === 'TODOS' ? { label: 'Todas', icon: '📋' } : statusConfig[s as OSStatus];
          
          return (
            <Button
              key={s}
              variant={isActive ? 'primary' : 'secondary'}
              onClick={() => setFilterStatus(s as OSStatus | 'TODOS')}
              size="sm"
            >
              {config.icon} {config.label}
            </Button>
          );
        })}
      </div>

      {/* Kanban Board */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--space-6)' }}>
          {Array(5)
            .fill(null)
            .map((_, i) => (
              <div key={i}>
                <Skeleton count={3} height="3rem" />
              </div>
            ))}
        </div>
      ) : workOrders.length === 0 ? (
        <Card className="flex flex-col items-center justify-center" style={{ minHeight: '400px' }}>
          <EmptyState
            icon="📋"
            title="Nenhuma Ordem de Serviço"
            message="Comece criando uma nova OS para gerenciar suas oficinas."
            action={{ label: 'Criar Primeira OS', onClick: onNewOS }}
          />
        </Card>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="kanban-board">
            {statuses.map((status) => (
              <Droppable key={status} droppableId={status}>
                {(provided) => (
                  <KanbanColumn
                    status={status}
                    orders={filteredOrders(status)}
                    actions={kanbanActions}
                    formatMoney={formatMoney}
                    provided={provided}
                  />
                )}
              </Droppable>
            ))}
          </div>
        </DragDropContext>
      )}
    </div>
  );
};