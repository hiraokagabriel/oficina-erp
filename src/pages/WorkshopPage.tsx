import React from 'react';
import { DropResult } from '@hello-pangea/dnd';
import { WorkOrder } from '../types';
import { KanbanBoard } from '../components/KanbanBoard';

interface WorkshopPageProps {
  workOrders: WorkOrder[];
  isLoading: boolean;
  formatMoney: (val: number) => string;
  onNewOS: () => void;
  onDragEnd: (result: DropResult) => void;
  kanbanActions: {
    onRegress: (id: string) => void;
    onEdit: (os: WorkOrder) => void;
    onChecklist: (os: WorkOrder) => void;
    onPrint: (os: WorkOrder) => void;
    onDelete: (os: WorkOrder) => void;
    onAdvance: (id: string) => void;
    // ADICIONADO: As novas ações de arquivamento
    onArchive?: (os: WorkOrder) => void;
    onRestore?: (os: WorkOrder) => void;
    // ADICIONADO: Atalho Ctrl + Click
    onQuickFinish?: (id: string) => void;
  };
}

export const WorkshopPage: React.FC<WorkshopPageProps> = ({
  workOrders,
  isLoading,
  formatMoney,
  onNewOS,
  onDragEnd,
  kanbanActions
}) => {
  return (
    <div className="workshop-page" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header" style={{ marginBottom: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Gestão de Oficina</h1>
        <button className="btn" onClick={onNewOS}>+ Nova OS (F2)</button>
      </div>
      
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <KanbanBoard 
            workOrders={workOrders} 
            isLoading={isLoading} 
            onDragEnd={onDragEnd} 
            actions={kanbanActions} 
            formatMoney={formatMoney} 
        />
      </div>
    </div>
  );
};