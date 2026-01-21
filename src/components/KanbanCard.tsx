import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { WorkOrder, OSStatus } from '../types';

interface KanbanCardProps {
  os: WorkOrder;
  formatMoney: (val: number) => string;
  status: OSStatus;
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
  isDragging?: boolean;
}

export const KanbanCard = React.memo(({ 
  os, 
  formatMoney, 
  status, 
  actions, 
  onWhatsApp,
  isDragging: forcedDragging
}: KanbanCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: os.id });

  // ✅ Estilo otimizado com @dnd-kit
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging || forcedDragging ? 9999 : 'auto',
    cursor: isDragging ? 'grabbing' : 'grab',
    opacity: isDragging ? 0.5 : status === 'ARQUIVADO' ? 0.7 : 1,
    position: 'relative',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  };

  const cardClassName = [
    'kanban-card',
    isDragging && 'is-dragging',
    forcedDragging && 'is-overlay'
  ].filter(Boolean).join(' ');

  // 🆕 LÓGICA DE CORES DA MARGEM DE LUCRO
  const getProfitMarginColor = (margin: number) => {
    if (margin >= 70) return { color: 'var(--success)', bg: 'rgba(4, 211, 97, 0.1)' };
    if (margin >= 16) return { color: 'var(--warning)', bg: 'rgba(255, 152, 0, 0.1)' };
    return { color: 'var(--danger)', bg: 'rgba(229, 76, 76, 0.1)' };
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div
        className={cardClassName}
        title="💡 Dica: Ctrl + Clique para finalizar imediatamente"
        onClick={(e) => {
          if (e.ctrlKey && status !== 'FINALIZADO' && actions.onQuickFinish) {
            e.preventDefault();
            e.stopPropagation();
            actions.onQuickFinish(os.id);
          }
        }}
        style={{
          border: isDragging || forcedDragging
            ? '2px solid var(--primary)' 
            : '1px solid var(--border)',
          background: isDragging || forcedDragging
            ? 'var(--bg-panel)' 
            : 'var(--bg-card, var(--bg-panel))',
          color: 'var(--text)',
          boxShadow: isDragging || forcedDragging
            ? '0 20px 40px rgba(0, 0, 0, 0.3), 0 0 0 2px var(--primary)'
            : '0 2px 8px rgba(0, 0, 0, 0.1)',
          willChange: 'transform, box-shadow, opacity',
        }}
      >
        <div className="os-header">
          <span className="os-number">#{os.osNumber}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="os-price">{formatMoney(os.total)}</span>
            
            {/* 🆕 INDICADOR DE MARGEM DE LUCRO */}
            {os.profitMargin !== undefined && os.profitMargin > 0 && (
              <span 
                style={{ 
                  fontSize: '0.7rem', 
                  color: getProfitMarginColor(os.profitMargin).color,
                  fontWeight: 'bold',
                  marginLeft: 2,
                  padding: '2px 4px',
                  borderRadius: 4,
                  backgroundColor: getProfitMarginColor(os.profitMargin).bg
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

        {/* ✅ Esconde ações durante drag para melhor performance */}
        <div 
          className="card-actions" 
          style={{ 
            display: isDragging || forcedDragging ? 'none' : 'flex',
            opacity: isDragging || forcedDragging ? 0 : 1,
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
});