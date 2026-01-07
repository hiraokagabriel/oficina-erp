import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { WorkOrder } from '../types';

interface KanbanCardProps {
  os: WorkOrder;
  index: number;
  formatMoney: (val: number) => string;
  status: string; 
  actions: {
    onRegress: (id: string) => void;
    onEdit: (os: WorkOrder) => void;
    onChecklist: (os: WorkOrder) => void;
    onPrint: (os: WorkOrder) => void;
    onDelete: (os: WorkOrder) => void;
    onAdvance: (id: string) => void;
  };
  // Nova prop para o clique do WhatsApp
  onWhatsApp?: () => void;
}

// React.memo: O segredo da performance. O componente só renderiza se as props mudarem.
export const KanbanCard = React.memo(({ os, index, formatMoney, status, actions, onWhatsApp }: KanbanCardProps) => {
  return (
    <Draggable draggableId={os.id} index={index}>
      {(provided, snapshot) => {
        // Estilo da âncora (movimento)
        const anchorStyle = {
          ...provided.draggableProps.style,
          zIndex: snapshot.isDragging ? 10000 : 'auto',
          cursor: snapshot.isDragging ? 'grabbing' : 'grab',
          margin: 0,
          left: (provided.draggableProps.style as React.CSSProperties)?.left,
          top: (provided.draggableProps.style as React.CSSProperties)?.top,
        };

        return (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            style={anchorStyle}
          >
            {/* O Card Visual */}
            <div
              className={`kanban-card ${snapshot.isDragging ? 'is-dragging' : ''}`}
              style={{
                transform: snapshot.isDragging ? 'rotate(3deg) scale(1.02)' : 'none',
                // will-change avisa o navegador para preparar a GPU (Performance gráfica)
                willChange: 'transform, box-shadow', 
                transition: snapshot.isDragging ? 'none' : 'all 0.2s ease',
                boxShadow: snapshot.isDragging ? '0 25px 50px rgba(0,0,0,0.5)' : '0 2px 4px rgba(0,0,0,0.1)',
                opacity: 1,
                border: snapshot.isDragging ? '1px solid var(--primary)' : '1px solid var(--border)'
              }}
            >
              <div className="os-header">
                <span className="os-number">#{os.osNumber}</span>
                <span className="os-price">{formatMoney(os.total)}</span>
              </div>
              <div className="os-client">{os.clientName}</div>
              <div className="os-vehicle">{os.vehicle}</div>
              
              {/* Seção de Telefone com Botão WhatsApp Integrado */}
              {os.clientPhone && (
                <div className="os-id" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📞 {os.clientPhone}</span>
                  
                  {onWhatsApp && (
                    <button 
                        className="btn-icon" 
                        title="Enviar mensagem no WhatsApp"
                        onClick={(e) => {
                            e.stopPropagation(); // Impede que o clique inicie o arrasto do card
                            onWhatsApp();
                        }}
                        style={{
                            background: '#25D366', // Verde oficial do WhatsApp
                            color: '#fff',
                            border: 'none',
                            borderRadius: '50%',
                            width: '22px',
                            height: '22px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }}
                    >
                        💬
                    </button>
                  )}
                </div>
              )}

              <div className="card-actions" style={{ display: snapshot.isDragging ? 'none' : 'flex' }}>
                {status !== 'ORCAMENTO' && (
                  <button className="btn-icon" title="Voltar" onClick={() => actions.onRegress(os.id)}>⬅️</button>
                )}
                <div style={{ display: 'flex', gap: 5 }}>
                  <button className="btn-icon" title="Editar" onClick={() => actions.onEdit(os)}>✏️</button>
                  <button className="btn-icon check" title="Checklist" onClick={() => actions.onChecklist(os)}>📋</button>
                  <button className="btn-icon" title="Imprimir" onClick={() => actions.onPrint(os)}>🖨️</button>
                  <button className="btn-icon danger" title="Excluir" onClick={() => actions.onDelete(os)}>🗑️</button>
                </div>
                {status !== 'FINALIZADO' && (
                  <button className="btn-icon" title="Avançar" onClick={() => actions.onAdvance(os.id)}>➡️</button>
                )}
              </div>
            </div>
          </div>
        );
      }}
    </Draggable>
  );
});