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
    onArchive?: (os: WorkOrder) => void;
    onRestore?: (os: WorkOrder) => void;
    onQuickFinish?: (id: string) => void;
  };
  onWhatsApp?: () => void;
}

export const KanbanCard = React.memo(({ 
  os, 
  index, 
  formatMoney, 
  status, 
  actions, 
  onWhatsApp 
}: KanbanCardProps) => {
  return (
    <Draggable draggableId={os.id} index={index}>
      {(provided, snapshot) => {
        // 🎯 FIX: Estilo dinâmico correto
        const cardStyle: React.CSSProperties = {
          ...provided.draggableProps.style,
          // FIX: Garante z-index correto
          zIndex: snapshot.isDragging ? 9999 : 'auto',
          // FIX: Transform aplicado corretamente
          transform: snapshot.isDragging 
            ? `${provided.draggableProps.style?.transform || ''} rotate(2deg) scale(1.03)`
            : provided.draggableProps.style?.transform,
          // FIX: Cursor feedback
          cursor: snapshot.isDragging ? 'grabbing' : 'grab',
          // FIX: Transição suave
          transition: snapshot.isDragging 
            ? 'box-shadow 0.2s ease' 
            : 'all 0.2s cubic-bezier(0.2, 0, 0, 1)',
          // FIX: Box shadow dramático
          boxShadow: snapshot.isDragging 
            ? '0 20px 40px rgba(0, 0, 0, 0.3), 0 0 0 2px var(--primary)'
            : '0 2px 8px rgba(0, 0, 0, 0.1)',
          // FIX: Garantir posicionamento
          position: 'relative',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        };

        return (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            style={cardStyle}
          >
            <div
              className={`kanban-card ${snapshot.isDragging ? 'is-dragging' : ''}`}
              title="💡 Dica: Ctrl + Clique para finalizar imediatamente"
              onClick={(e) => {
                if (e.ctrlKey && status !== 'FINALIZADO' && actions.onQuickFinish) {
                  e.preventDefault();
                  e.stopPropagation();
                  actions.onQuickFinish(os.id);
                }
              }}
              style={{
                // FIX: Opacidade durante drag
                opacity: snapshot.isDragging ? 0.9 : status === 'ARQUIVADO' ? 0.7 : 1,
                // FIX: Borda highlight
                border: snapshot.isDragging 
                  ? '2px solid var(--primary)' 
                  : '1px solid var(--border)',
                // ✅ FIX TEMA: Usa variável CSS que responde ao tema
                background: snapshot.isDragging 
                  ? 'var(--bg-panel)' 
                  : 'var(--bg-card, var(--bg-panel))',
                // ✅ FIX TEMA: Cor do texto também responde ao tema
                color: 'var(--text)',
                // Performance boost
                willChange: 'transform, box-shadow, opacity',
              }}
            >
              <div className="os-header">
                <span className="os-number">#{os.osNumber}</span>
                <span className="os-price">{formatMoney(os.total)}</span>
              </div>
              <div className="os-client">{os.clientName}</div>
              <div className="os-vehicle">{os.vehicle}</div>
              
              {os.clientPhone && (
                <div className="os-id" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📞 {os.clientPhone}</span>
                  {onWhatsApp && (
                    <button 
                        className="btn-icon" 
                        title="Enviar mensagem no WhatsApp"
                        onClick={(e) => { e.stopPropagation(); onWhatsApp(); }}
                        style={{
                            background: '#25D366', 
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

              {/* FIX: Esconde actions durante drag para melhor performance */}
              <div 
                className="card-actions" 
                style={{ 
                  display: snapshot.isDragging ? 'none' : 'flex',
                  opacity: snapshot.isDragging ? 0 : 1,
                  transition: 'opacity 0.2s ease'
                }}
              >
                {status !== 'ARQUIVADO' && status !== 'ORCAMENTO' && (
                  <button 
                    className="btn-icon" 
                    title="Voltar" 
                    onClick={(e) => {
                      e.stopPropagation(); 
                      actions.onRegress(os.id);
                    }}
                  >
                    ⬅️
                  </button>
                )}

                <div style={{ display: 'flex', gap: 5 }}>
                  <button 
                    className="btn-icon" 
                    title="Editar" 
                    onClick={(e) => {
                      e.stopPropagation(); 
                      actions.onEdit(os);
                    }}
                  >
                    ✏️
                  </button>
                  <button 
                    className="btn-icon check" 
                    title="Checklist" 
                    onClick={(e) => {
                      e.stopPropagation(); 
                      actions.onChecklist(os);
                    }}
                  >
                    📋
                  </button>
                  <button 
                    className="btn-icon" 
                    title="Imprimir" 
                    onClick={(e) => {
                      e.stopPropagation(); 
                      actions.onPrint(os);
                    }}
                  >
                    🖨️
                  </button>
                  
                  {status === 'ARQUIVADO' ? (
                      <button 
                        className="btn-icon" 
                        title="Restaurar OS" 
                        onClick={(e) => {
                          e.stopPropagation(); 
                          actions.onRestore && actions.onRestore(os);
                        }} 
                        style={{color: 'var(--success)'}}
                      >
                          ↩️
                      </button>
                  ) : (
                      <button 
                        className="btn-icon" 
                        title="Arquivar OS" 
                        onClick={(e) => {
                          e.stopPropagation(); 
                          actions.onArchive && actions.onArchive(os);
                        }} 
                        style={{color: 'var(--text-muted)'}}
                      >
                          📦
                      </button>
                  )}
                  
                  <button 
                    className="btn-icon danger" 
                    title="Excluir" 
                    onClick={(e) => {
                      e.stopPropagation(); 
                      actions.onDelete(os);
                    }}
                  >
                    🗑️
                  </button>
                </div>

                {status !== 'ARQUIVADO' && status !== 'FINALIZADO' && (
                  <button 
                    className="btn-icon" 
                    title="Avançar" 
                    onClick={(e) => {
                      e.stopPropagation(); 
                      actions.onAdvance(os.id);
                    }}
                  >
                    ➡️
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      }}
    </Draggable>
  );
});