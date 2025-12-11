import React from 'react';
import { KanbanBoard } from '../components/KanbanBoard';
import { WorkOrder } from '../types';
import { DropResult } from '@hello-pangea/dnd';

interface WorkshopPageProps {
  workOrders: WorkOrder[];
  isLoading: boolean;
  onNewOS: () => void;
  onDragEnd: (result: DropResult) => void;
  kanbanActions: {
    onRegress: (id: string) => void;
    onEdit: (os: WorkOrder) => void;
    onChecklist: (os: WorkOrder) => void;
    onPrint: (os: WorkOrder) => void;
    onDelete: (os: WorkOrder) => void;
    onAdvance: (id: string) => void;
  };
  formatMoney: (val: number) => string;
}

export const WorkshopPage: React.FC<WorkshopPageProps> = ({ 
  workOrders, isLoading, onNewOS, onDragEnd, kanbanActions, formatMoney 
}) => {
  return (
    <>
      <div className="header-area">
        <h1 className="page-title">Quadro Oficina</h1>
        <button className="btn" onClick={onNewOS}>+ Nova OS</button>
      </div>
      <KanbanBoard 
        workOrders={workOrders} isLoading={isLoading} onDragEnd={onDragEnd}
        actions={kanbanActions} formatMoney={formatMoney}
      />
    </>
  );
};