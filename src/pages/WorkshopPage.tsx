import React, { useState, useMemo } from 'react';
import { WorkOrder, OSStatus } from '../types';
import { KanbanBoard } from '../components/KanbanBoard';
import { summarizeDeliveries } from '../services/schedule';
import { Icon } from '../components/ui/Icon';
import type { KanbanCardActions } from '../components/KanbanCardMenu';

interface WorkshopPageProps {
  workOrders: WorkOrder[];
  isLoading: boolean;
  formatMoney: (val: number) => string;
  /** Meta de margem global (%), das Configurações. */
  targetMargin?: number;
  /** Selo de margem nos cartões (opção da Configuração). */
  showMargin?: boolean;
  onNewOS: () => void;
  onStatusChange: (osId: string, newStatus: OSStatus) => void;
  kanbanActions: KanbanCardActions;
}

export const WorkshopPage: React.FC<WorkshopPageProps> = ({
  workOrders,
  isLoading,
  formatMoney,
  targetMargin,
  showMargin,
  onNewOS,
  onStatusChange,
  kanbanActions
}) => {
  const [showArchived, setShowArchived] = useState(false);

  // Conta OS arquivadas
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
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowArchived(!showArchived)}
          >
            <Icon name={showArchived ? 'voltar' : 'caixa'} size={18} />
            {showArchived ? 'Voltar ao quadro' : 'Ver arquivadas'}
            {archivedCount > 0 && !showArchived && (
              <span className="count-pill" title={`${archivedCount} OS arquivadas`}>{archivedCount}</span>
            )}
          </button>

          <button type="button" className="btn" onClick={onNewOS}>
            <Icon name="adicionar" size={18} />
            Nova OS (F2)
          </button>
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
            targetMargin={targetMargin}
            showMargin={showMargin}
        />
      </div>
    </div>
  );
};