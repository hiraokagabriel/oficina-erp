import React, { useState, useMemo } from 'react';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
import { WorkOrder, OSStatus, STATUS_LABELS } from '../types';
import { KanbanCard } from './KanbanCard';

interface KanbanBoardProps {
  workOrders: WorkOrder[];
  isLoading: boolean;
  onDragEnd: (result: DropResult) => void;
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
  const messages: Record<string, { icon: string, text: string }> = {
    ORCAMENTO: { icon: '📝', text: 'Sem orçamentos pendentes' },
    APROVADO: { icon: '✅', text: 'Nada aprovado aguardando' },
    EM_SERVICO: { icon: '🔧', text: 'Nenhum veículo no elevador' },
    FINALIZADO: { icon: '🏁', text: 'Nenhuma OS finalizada hoje' },
    ARQUIVADO: { icon: '📦', text: 'Lixeira vazia. Nenhuma OS arquivada.' },
  };

  const info = messages[status] || { icon: '📂', text: 'Lista vazia' };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', opacity: 0.5, textAlign: 'center',
      border: '2px dashed var(--border)', borderRadius: '12px', margin: '10px'
    }}>
      <div style={{ fontSize: '2rem', marginBottom: '10px' }}>{info.icon}</div>
      <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>{info.text}</div>
    </div>
  );
});

const KanbanColumn = React.memo(({ 
  status, 
  workOrders, 
  actions, 
  formatMoney 
}: { 
  status: OSStatus; 
  workOrders: WorkOrder[]; 
  actions: KanbanBoardProps['actions']; 
  formatMoney: (val: number) => string;
}) => {
  // Memoiza a lista filtrada e ordenada
  const sortedList = useMemo(() => {
    return workOrders
      .filter(o => o.status === status)
      .sort((a, b) => b.osNumber - a.osNumber);
  }, [workOrders, status]);
  
  const colColorMap: Record<string, string> = { 
    ORCAMENTO: 'var(--info)', 
    APROVADO: 'var(--warning)', 
    EM_SERVICO: 'var(--primary)', 
    FINALIZADO: 'var(--success)',
    ARQUIVADO: 'var(--text-muted)'
  };

  return (
    <div className="kanban-column" style={{borderTop: `4px solid ${colColorMap[status]}`}}>
      <div className="kanban-header">
        {STATUS_LABELS[status]} 
        <span style={{background: 'rgba(0,0,0,0.05)', padding: '2px 8px', borderRadius: 10}}>
          {sortedList.length}
        </span>
      </div>
      
      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div 
            className="kanban-list-scroll"
            ref={provided.innerRef}
            {...provided.droppableProps}
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '12px', 
              padding: '8px', 
              background: snapshot.isDraggingOver ? 'rgba(0,0,0,0.02)' : 'transparent',
              transition: 'background-color 0.2s ease', 
              minHeight: 150, 
              flex: 1
            }}
          >
            {sortedList.length === 0 ? (
              <EmptyState status={status} />
            ) : (
              sortedList.map((os, index) => (
                <KanbanCard 
                  key={os.id}
                  os={os}
                  index={index}
                  formatMoney={formatMoney}
                  status={status}
                  actions={actions}
                />
              ))
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  ); 
});

export const KanbanBoard = React.memo<KanbanBoardProps>(({ 
  workOrders, 
  isLoading, 
  onDragEnd, 
  actions, 
  formatMoney 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Memoiza a filtragem de busca
  const filteredWorkOrders = useMemo(() => {
    if (!searchTerm) return workOrders;
    
    const term = searchTerm.toLowerCase();
    return workOrders.filter(os => 
      os.clientName.toLowerCase().includes(term) ||
      os.vehicle.toLowerCase().includes(term) ||
      os.osNumber.toString().includes(term) ||
      (os.clientPhone && os.clientPhone.includes(term))
    );
  }, [workOrders, searchTerm]);

  if (isLoading) {
    return (
      <div className="kanban-board">
        {[1,2,3,4].map(i => (
          <div key={i} className="kanban-column">
            <div className="skeleton skeleton-block"/>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="kanban-board" style={{ gridTemplateColumns: showArchived ? '1fr' : 'repeat(4, 1fr)' }}>
          {showArchived ? (
            <KanbanColumn 
              status="ARQUIVADO" 
              workOrders={filteredWorkOrders} 
              actions={actions} 
              formatMoney={formatMoney}
            />
          ) : (
            <>
              <KanbanColumn status="ORCAMENTO" workOrders={filteredWorkOrders} actions={actions} formatMoney={formatMoney} />
              <KanbanColumn status="APROVADO" workOrders={filteredWorkOrders} actions={actions} formatMoney={formatMoney} />
              <KanbanColumn status="EM_SERVICO" workOrders={filteredWorkOrders} actions={actions} formatMoney={formatMoney} />
              <KanbanColumn status="FINALIZADO" workOrders={filteredWorkOrders} actions={actions} formatMoney={formatMoney} />
            </>
          )}
        </div>
      </DragDropContext>
    </div>
  );
});