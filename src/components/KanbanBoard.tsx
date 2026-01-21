import React, { useState, useMemo } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners
} from '@dnd-kit/core';
import { WorkOrder, OSStatus, STATUS_LABELS } from '../types';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';

interface KanbanBoardProps {
  workOrders: WorkOrder[];
  isLoading: boolean;
  onStatusChange: (osId: string, newStatus: OSStatus) => void;
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
  formatMoney: (val: number) => string;
  showArchived?: boolean;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  workOrders,
  isLoading,
  onStatusChange,
  actions,
  formatMoney,
  showArchived = false
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // ✅ Configurar sensores otimizados
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Só ativa drag após 8px de movimento
      },
    })
  );

  // ✅ Filtrar work orders
  const filteredWorkOrders = useMemo(() => {
    if (!searchTerm) return workOrders;
    
    const term = searchTerm.toLowerCase();
    return workOrders.filter(os => 
      os.clientName.toLowerCase().includes(term) ||
      os.vehicle.toLowerCase().includes(term) ||
      os.osNumber.toString().includes(term) ||
      (os.clientPhone && os.clientPhone.includes(term))
    );
  }, [workOrders, searchTerm]);

  // ✅ Agrupar por status
  const workOrdersByStatus = useMemo(() => {
    const groups: Record<OSStatus, WorkOrder[]> = {
      ORCAMENTO: [],
      APROVADO: [],
      EM_SERVICO: [],
      FINALIZADO: [],
      ARQUIVADO: []
    };

    filteredWorkOrders.forEach(wo => {
      if (groups[wo.status]) {
        groups[wo.status].push(wo);
      }
    });

    // Ordenar por número da OS (decrescente)
    Object.keys(groups).forEach(status => {
      groups[status as OSStatus].sort((a, b) => b.osNumber - a.osNumber);
    });

    return groups;
  }, [filteredWorkOrders]);

  // ✅ Handler de início do drag
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // ✅ Handler de fim do drag
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    setActiveId(null);

    if (!over) return;

    const osId = active.id as string;
    const newStatus = over.id as OSStatus;
    
    // Verificar se mudou de coluna
    const workOrder = workOrders.find(wo => wo.id === osId);
    if (workOrder && workOrder.status !== newStatus) {
      onStatusChange(osId, newStatus);
    }
  };

  // ✅ Encontrar work order ativa
  const activeWorkOrder = useMemo(
    () => workOrders.find(wo => wo.id === activeId),
    [activeId, workOrders]
  );

  if (isLoading) {
    return (
      <div className="kanban-board">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="kanban-column">
            <div className="skeleton skeleton-block" />
          </div>
        ))}
      </div>
    );
  }

  const statuses: OSStatus[] = showArchived 
    ? ['ARQUIVADO'] 
    : ['ORCAMENTO', 'APROVADO', 'EM_SERVICO', 'FINALIZADO'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Barra de busca */}
      <div className="kanban-filter-bar">
        <div className="search-wrapper">
          <span className="search-icon">🔍</span>
          <input 
            type="text" 
            className="form-input search-input" 
            placeholder="Buscar por Cliente, OS, Veículo ou Placa..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="btn-clear-search" onClick={() => setSearchTerm('')}>
              ✕
            </button>
          )}
        </div>
        <div className="filter-stats">
          Mostrando <strong>{filteredWorkOrders.length}</strong> de {workOrders.length} ordens
        </div>
      </div>

      {/* ✅ DndContext com configuração otimizada */}
      <DndContext 
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div 
          className="kanban-board" 
          style={{ 
            gridTemplateColumns: showArchived 
              ? '1fr' 
              : 'repeat(4, 1fr)' 
          }}
        >
          {statuses.map(status => (
            <KanbanColumn
              key={status}
              status={status}
              workOrders={workOrdersByStatus[status]}
              actions={actions}
              formatMoney={formatMoney}
            />
          ))}
        </div>

        {/* ✅ Overlay visual durante o drag */}
        <DragOverlay>
          {activeWorkOrder ? (
            <div style={{ 
              opacity: 0.9, 
              transform: 'rotate(3deg)',
              cursor: 'grabbing'
            }}>
              <KanbanCard
                os={activeWorkOrder}
                formatMoney={formatMoney}
                status={activeWorkOrder.status}
                actions={actions}
                isDragging
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};