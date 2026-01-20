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

export const KanbanCard = React.memo(({ os, index, formatMoney, status, actions, onWhatsApp }: KanbanCardProps) => {
  return (
    <Draggable draggableId={os.id} index={index}>
      {(provided, snapshot) => {
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
            <div
              className={`kanban-card ${snapshot.isDragging ? 'is-dragging' : ''}`}
              title="Dica: Ctrl + Clique para finalizar imediatamente"
              onClick={(e) => {
                  if (e.ctrlKey && status !== 'FINALIZADO' && actions.onQuickFinish) {
                      e.preventDefault();
                      e.stopPropagation();
                      actions.onQuickFinish(os.id);
                  }
              }}
              style={{
                transform: snapshot.isDragging ? 'rotate(3deg) scale(1.02)' : 'none',
                willChange: 'transform, box-shadow', 
                transition: snapshot.isDragging ? 'none' : 'all 0.2s ease',
                boxShadow: snapshot.isDragging ? '0 25px 50px rgba(0,0,0,0.5)' : '0 2px 4px rgba(0,0,0,0.1)',
                opacity: status === 'ARQUIVADO' ? 0.7 : 1,
                border: snapshot.isDragging ? '1px solid var(--primary)' : '1px solid var(--border)'
              }}
            >
              <div className="os-header">
                <span className="os-number">#{os.osNumber}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="os-price">{formatMoney(os.total)}</span>
                  
                  {os.profitMargin !== undefined && os.profitMargin > 0 && (
                    <span 
                      style={{ 
                        fontSize: '0.7rem', 
                        color: os.profitMargin >= 30 ? 'var(--success)' : os.profitMargin >= 15 ? 'var(--warning)' : 'var(--danger)',
                        fontWeight: 'bold',
                        marginLeft: 2,
                        padding: '2px 4px',
                        borderRadius: 4,
                        backgroundColor: os.profitMargin >= 30 ? 'rgba(4, 211, 97, 0.1)' : os.profitMargin >= 15 ? 'rgba(255, 152, 0, 0.1)' : 'rgba(229, 76, 76, 0.1)'
                      }}
                      title={`Lucro: ${formatMoney(os.profit || 0)} | ROI: ${os.totalCost && os.totalCost > 0 ? ((os.profit || 0) / os.totalCost * 100).toFixed(0) : '0'}%`}
                    >
                      +{os.profitMargin.toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
              
              <div className="os-client">{os.clientName}</div>
              <div className="os-vehicle">{os.vehicle}</div>
              
              {os.clientPhone && (
                <div className="os-id" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{String.fromCharCode(128222)} {os.clientPhone}</span>
                  {onWhatsApp && (
                    <button 
                        className="btn-icon" 
                        title="Enviar mensagem no WhatsApp"
                        onClick={(e) => { e.stopPropagation(); onWhatsApp(); }}
                        style={{
                            background: '#25D366', color: '#fff', border: 'none', borderRadius: '50%',
                            width: '22px', height: '22px', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', cursor: 'pointer', fontSize: '0.8rem',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }}
                    >
                        {String.fromCharCode(128172)}
                    </button>
                  )}
                </div>
              )}

              <div className="card-actions" style={{ display: snapshot.isDragging ? 'none' : 'flex' }}>
                {status !== 'ARQUIVADO' && status !== 'ORCAMENTO' && (
                  <button className="btn-icon" title="Voltar" onClick={(e) => {e.stopPropagation(); actions.onRegress(os.id)}}>
                    {String.fromCharCode(11013)}
                  </button>
                )}

                <div style={{ display: 'flex', gap: 5 }}>
                  <button className="btn-icon" title="Editar" onClick={(e) => {e.stopPropagation(); actions.onEdit(os)}}>
                    {String.fromCharCode(9999)}
                  </button>
                  <button className="btn-icon check" title="Checklist" onClick={(e) => {e.stopPropagation(); actions.onChecklist(os)}}>
                    {String.fromCharCode(128203)}
                  </button>
                  <button className="btn-icon" title="Imprimir" onClick={(e) => {e.stopPropagation(); actions.onPrint(os)}}>
                    {String.fromCharCode(128424)}
                  </button>
                  
                  {status === 'ARQUIVADO' ? (
                      <button className="btn-icon" title="Restaurar OS" onClick={(e) => {e.stopPropagation(); actions.onRestore && actions.onRestore(os)}} style={{color: 'var(--success)'}}>
                          {String.fromCharCode(8617)}
                      </button>
                  ) : (
                      <button className="btn-icon" title="Arquivar OS" onClick={(e) => {e.stopPropagation(); actions.onArchive && actions.onArchive(os)}} style={{color: 'var(--text-muted)'}}>
                          {String.fromCharCode(128230)}
                      </button>
                  )}
                  
                  <button className="btn-icon danger" title="Excluir" onClick={(e) => {e.stopPropagation(); actions.onDelete(os)}}>
                    {String.fromCharCode(128465)}
                  </button>
                </div>

                {status !== 'ARQUIVADO' && status !== 'FINALIZADO' && (
                  <button className="btn-icon" title="Avan\u00e7ar" onClick={(e) => {e.stopPropagation(); actions.onAdvance(os.id)}}>
                    {String.fromCharCode(10145)}
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