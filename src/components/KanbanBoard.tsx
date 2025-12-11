import React from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { WorkOrder, OSStatus, STATUS_LABELS } from '../types';

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
  };
  formatMoney: (val: number) => string;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ workOrders, isLoading, onDragEnd, actions, formatMoney }) => {
  
  const renderColumn = (status: OSStatus) => {
    const list = workOrders.filter(o => o.status === status).sort((a,b) => b.osNumber - a.osNumber);
    const colColorMap: Record<string, string> = { 
        ORCAMENTO: 'var(--info)', 
        APROVADO: 'var(--warning)', 
        EM_SERVICO: 'var(--primary)', 
        FINALIZADO: 'var(--success)' 
    };

    return (
      <div className={`kanban-column`} style={{borderTop: `4px solid ${colColorMap[status]}`}}>
        <div className="kanban-header">{STATUS_LABELS[status]} <span>{list.length}</span></div>
        
        <Droppable droppableId={status}>
          {(provided, snapshot) => (
            <div 
              className="kanban-list-scroll"
              ref={provided.innerRef}
              {...provided.droppableProps}
              style={{ 
                  // O segredo do alinhamento: GAP controla o espaço, não a margin do card
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px', 
                  padding: '8px', 
                  background: snapshot.isDraggingOver ? 'rgba(255,255,255,0.03)' : 'transparent',
                  transition: 'background-color 0.2s ease',
                  minHeight: 150
              }}
            >
              {list.map((os, index) => (
                <Draggable key={os.id} draggableId={os.id} index={index}>
                  {(provided, snapshot) => {
                    
                    // ESTILO DA ÂNCORA (Div Externa)
                    // Esta div segue o mouse. Não deve ter visual, apenas coordenadas.
                    const anchorStyle = {
                        ...provided.draggableProps.style,
                        // Z-Index altíssimo para flutuar sobre Sidebar e Modais
                        zIndex: snapshot.isDragging ? 10000 : 'auto',
                        // Cursor travado
                        cursor: snapshot.isDragging ? 'grabbing' : 'grab',
                        // Remove margens que causam o "offset" (desvio) do mouse
                        margin: 0,
                        // Preserva a geometria para a animação de soltar funcionar
                        left: provided.draggableProps.style?.left,
                        top: provided.draggableProps.style?.top,
                    };

                    return (
                        <div 
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            style={anchorStyle}
                        >
                            {/* DIV VISUAL (O Card em si) 
                                Aqui aplicamos a rotação e o estilo visual.
                                Como está dentro da âncora, a rotação não afeta a coordenada X/Y do mouse.
                            */}
                            <div 
                                className={`kanban-card ${snapshot.isDragging ? 'is-dragging' : ''}`}
                                style={{
                                    // Rotação suave para dar a sensação de "pegar na mão"
                                    transform: snapshot.isDragging ? 'rotate(3deg) scale(1.02)' : 'none',
                                    // Remove transições durante o arraste para resposta instantânea (1:1 com mouse)
                                    transition: snapshot.isDragging ? 'none' : 'all 0.2s ease',
                                    boxShadow: snapshot.isDragging ? '0 25px 50px rgba(0,0,0,0.5)' : '0 4px 6px rgba(0,0,0,0.1)',
                                    opacity: snapshot.isDragging ? 1 : 1, // Opacidade total para destacar
                                    border: snapshot.isDragging ? '1px solid var(--primary)' : '1px solid var(--border)'
                                }}
                            >
                                <div className="os-header">
                                    <span className="os-number">#{os.osNumber}</span> 
                                    <span className="os-price">{formatMoney(os.total)}</span>
                                </div>
                                <div className="os-client">{os.clientName}</div>
                                <div className="os-vehicle">{os.vehicle}</div>
                                {os.clientPhone && <div className="os-id">📞 {os.clientPhone}</div>}
                                
                                {/* Esconde botões ao arrastar para limpar a visão */}
                                <div className="card-actions" style={{display: snapshot.isDragging ? 'none' : 'flex'}}>
                                    {status !== 'ORCAMENTO' && <button className="btn-icon" onClick={() => actions.onRegress(os.id)}>⬅️</button>} 
                                    <div style={{display: 'flex', gap: 5}}>
                                        <button className="btn-icon" onClick={() => actions.onEdit(os)}>✏️</button>
                                        <button className="btn-icon check" onClick={() => actions.onChecklist(os)}>📋</button>
                                        <button className="btn-icon" onClick={() => actions.onPrint(os)}>🖨️</button>
                                        <button className="btn-icon danger" onClick={() => actions.onDelete(os)}>🗑️</button>
                                    </div>
                                    {status !== 'FINALIZADO' && <button className="btn-icon" onClick={() => actions.onAdvance(os.id)}>➡️</button>}
                                </div>
                            </div>
                        </div>
                    );
                  }}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </div>
    ); 
  };

  if (isLoading) return <div className="kanban-board">{[1,2,3,4].map(i => <div key={i} className="kanban-column"><div className="skeleton skeleton-block"/></div>)}</div>;

  return (
    <DragDropContext onDragEnd={onDragEnd}>
        <div className="kanban-board">
            {renderColumn('ORCAMENTO')} {renderColumn('APROVADO')} {renderColumn('EM_SERVICO')} {renderColumn('FINALIZADO')}
        </div>
    </DragDropContext>
  );
};