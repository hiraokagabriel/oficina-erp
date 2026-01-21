import React, { useState, useMemo } from 'react';
import { WorkOrder, OSStatus } from '../types';
import { KanbanBoard } from '../components/KanbanBoard';

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

  return (
    <div className="workshop-page" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header" style={{ marginBottom: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Gestão de Oficina</h1>
        
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
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