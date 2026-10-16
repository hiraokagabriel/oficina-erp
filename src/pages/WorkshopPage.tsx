import React, { useState, useMemo } from 'react';
import { WorkOrder, OSStatus } from '../types';
import { KanbanBoard } from '../components/KanbanBoard';
import { summarizeDeliveries } from '../services/schedule';

interface WorkshopPageProps {
  workOrders: WorkOrder[];
  isLoading: boolean;
  formatMoney: (val: number) => string;
  onNewOS: () => void;
  onStatusChange: (osId: string, newStatus: OSStatus) => void;
  kanbanActions: {
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
}

export const WorkshopPage: React.FC<WorkshopPageProps> = ({
  workOrders,
  isLoading,
  formatMoney,
  onNewOS,
  onStatusChange,
  kanbanActions
}) => {
  const [showArchived, setShowArchived] = useState(false);

  // 🆕 Conta OSs arquivadas
  const archivedCount = useMemo(() => 
    workOrders.filter(os => os.status === 'ARQUIVADO').length,
    [workOrders]
  );

  const deliveries = useMemo(() => summarizeDeliveries(workOrders, new Date()), [workOrders]);
  const lateCount = deliveries.atrasadas.length;

  return (
    <div className="workshop-page" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header" style={{ marginBottom: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Gestão de Oficina</h1>
        
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {(lateCount > 0 || deliveries.hoje > 0) && (
            <span className="delivery-summary" role="status">
              <span className="delivery-late">{lateCount} {lateCount === 1 ? 'atrasada' : 'atrasadas'}</span>
              <span aria-hidden="true">·</span>
              <span className="delivery-today">{deliveries.hoje} com entrega hoje</span>
            </span>
          )}
          {/* 🆕 BOTÃO DE TOGGLE ARQUIVADAS */}
          <button 
            className={showArchived ? "btn" : "btn-secondary"} 
            onClick={() => setShowArchived(!showArchived)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              position: 'relative'
            }}
          >
            📦 {showArchived ? 'Voltar ao Kanban' : 'Ver Arquivadas'}
            {archivedCount > 0 && !showArchived && (
              <span 
                style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  background: 'var(--danger)',
                  color: 'white',
                  borderRadius: '50%',
                  width: 20,
                  height: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem',
                  fontWeight: 'bold'
                }}
              >
                {archivedCount}
              </span>
            )}
          </button>
          
          <button className="btn" onClick={onNewOS}>+ Nova OS (F2)</button>
        </div>
      </div>
      
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <KanbanBoard 
            workOrders={workOrders} 
            isLoading={isLoading} 
            onStatusChange={onStatusChange}
            actions={kanbanActions} 
            formatMoney={formatMoney}
            showArchived={showArchived}
        />
      </div>
    </div>
  );
};