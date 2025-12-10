import React from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { WorkOrder, OSStatus } from '../utils/types';
import { Money, STATUS_LABELS, COLORS } from '../utils/format';

interface KanbanBoardProps {
  workOrders: WorkOrder[];
  isLoading: boolean;
  onDragEnd: (result: DropResult) => void;
  onEdit: (os: WorkOrder) => void;
  onChecklist: (os: WorkOrder) => void;
  onPrint: (os: WorkOrder) => void;
  onDelete: (os: WorkOrder) => void;
  onAdvance: (id: string) => void;
  onRegress: (id: string) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  workOrders,
  isLoading,
  onDragEnd,
  onEdit,
  onChecklist,
  onPrint,
  onDelete,
  onAdvance,
  onRegress
}) => {

  const renderColumn = (status: OSStatus) => {
    // Filtra e ordena por número da OS decrescente
    const list = workOrders.filter(o => o.status === status).sort((a, b) => b.osNumber - a.osNumber);

    return (
      <div className={`kanban-column col-${status}`} key={status}>
        <div className="kanban-header">
          {STATUS_LABELS[status]} <span>{list.length}</span>
        </div>
        <Droppable droppableId={status}>
          {(provided, snapshot) => (
            <div
              className="kanban-list-scroll"
              ref={provided.innerRef}
              {...provided.droppableProps}
              style={{
                backgroundColor: snapshot.isDraggingOver ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
              }}
            >
              {list.map((os, index) => (
                <Draggable key={os.id} draggableId={os.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      className={`kanban-card ${snapshot.isDragging ? 'is-dragging' : ''}`}
                      style={{
                        ...provided.draggableProps.style,
                        // Mantém a rotação customizada durante o drag
                        transform: snapshot.isDragging
                          ? `${provided.draggableProps.style?.transform} rotate(3deg) scale(1.05)`
                          : provided.draggableProps.style?.transform
                      }}
                    >
                      <div className="os-header">
                        <span className="os-number">OS #{os.osNumber}</span>
                        <span className="os-price">{Money.format(os.total)}</span>
                      </div>
                      <div className="os-client">{os.clientName}</div>
                      <div className="os-vehicle">{os.vehicle}</div>
                      {os.clientPhone && <div className="os-id" style={{ color: COLORS.info }}>📞 {os.clientPhone}</div>}
                      
                      <div className="card-actions">
                        {status !== 'ORCAMENTO' ? (
                          <button className="btn-icon" title="Voltar" onClick={() => onRegress(os.id)}>⬅️</button>
                        ) : <div />}
                        
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button className="btn-icon" title="Editar" onClick={() => onEdit(os)}>✏️</button>
                          <button className="btn-icon check" title="Checklist" onClick={() => onChecklist(os)}>📋</button>
                          <button className="btn-icon" title="Imprimir" onClick={() => onPrint(os)}>🖨️</button>
                          <button className="btn-icon danger" title="Excluir" onClick={() => onDelete(os)}>🗑️</button>
                        </div>

                        {status !== 'FINALIZADO' ? (
                          <button className="btn-icon" title="Avançar" onClick={() => onAdvance(os.id)}>➡️</button>
                        ) : <div />}
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="kanban-board">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="kanban-column"><div className="skeleton skeleton-block" /></div>
        ))}
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="kanban-board">
        {renderColumn('ORCAMENTO')}
        {renderColumn('APROVADO')}
        {renderColumn('EM_SERVICO')}
        {renderColumn('FINALIZADO')}
      </div>
    </DragDropContext>
  );
};