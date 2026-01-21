import React from 'react';
import { useDraggable } from '@dnd-kit/core';
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
  isDragging?: boolean;
}

export const KanbanCard: React.FC<KanbanCardProps> = ({
  os,
  formatMoney,
  status,
  actions,
  isDragging = false,
}) => {
  // ✅ Hook do @dnd-kit para tornar o card dragg able
  const { attributes, listeners, setNodeRef, transform, isDragging: isCardDragging } = useDraggable({
    id: os.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isCardDragging && !isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  };

  const handleDoubleClick = () => {
    actions.onEdit(os);
  };

  const handleCtrlClick = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      if (actions.onQuickFinish) {
        actions.onQuickFinish(os.id);
      }
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="kanban-card"
      onDoubleClick={handleDoubleClick}
      onClick={handleCtrlClick}
    >
      <div className="card-header">
        <span className="os-number">OS #{os.osNumber}</span>
        <span className="card-date">
          {new Date(os.createdAt).toLocaleDateString('pt-BR')}
        </span>
      </div>

      <div className="card-body">
        <div className="client-info">
          <div className="client-name">👤 {os.clientName}</div>
          {os.clientPhone && (
            <div className="client-phone">📞 {os.clientPhone}</div>
          )}
        </div>

        <div className="vehicle-info">
          <div>🚗 {os.vehicle}</div>
          {os.mileage > 0 && (
            <div className="mileage">📊 {os.mileage.toLocaleString()} km</div>
          )}
        </div>

        <div className="card-total">
          <strong>{formatMoney(os.total)}</strong>
        </div>

        {os.checklist && (
          <div className="checklist-badge">✅ Checklist</div>
        )}

        {os.financialId && (
          <div className="financial-badge">💰 Lançado</div>
        )}
      </div>

      <div className="card-actions">
        {status !== 'ORCAMENTO' && status !== 'ARQUIVADO' && (
          <button
            className="btn-icon"
            onClick={(e) => {
              e.stopPropagation();
              actions.onRegress(os.id);
            }}
            title="Retroceder"
          >
            ⬅️
          </button>
        )}

        <button
          className="btn-icon"
          onClick={(e) => {
            e.stopPropagation();
            actions.onEdit(os);
          }}
          title="Editar (Duplo clique)"
        >
          ✏️
        </button>

        <button
          className="btn-icon"
          onClick={(e) => {
            e.stopPropagation();
            actions.onChecklist(os);
          }}
          title="Checklist"
        >
          📋
        </button>

        <button
          className="btn-icon"
          onClick={(e) => {
            e.stopPropagation();
            actions.onPrint(os);
          }}
          title="Imprimir"
        >
          🖨️
        </button>

        {status === 'ARQUIVADO' ? (
          <button
            className="btn-icon"
            onClick={(e) => {
              e.stopPropagation();
              actions.onRestore?.(os);
            }}
            title="Restaurar"
          >
            ♻️
          </button>
        ) : (
          <button
            className="btn-icon btn-danger"
            onClick={(e) => {
              e.stopPropagation();
              if (status === 'FINALIZADO' && actions.onArchive) {
                actions.onArchive(os);
              } else {
                actions.onDelete(os);
              }
            }}
            title={status === 'FINALIZADO' ? 'Arquivar' : 'Excluir'}
          >
            {status === 'FINALIZADO' ? '📦' : '🗑️'}
          </button>
        )}

        {status !== 'FINALIZADO' && status !== 'ARQUIVADO' && (
          <button
            className="btn-icon btn-success"
            onClick={(e) => {
              e.stopPropagation();
              actions.onAdvance(os.id);
            }}
            title="Avançar (Ctrl + Click para Finalizar)"
          >
            ➡️
          </button>
        )}
      </div>
    </div>
  );
};