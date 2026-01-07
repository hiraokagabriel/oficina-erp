import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { WorkOrder, OSStatus, STATUS_LABELS } from '../types';
import { KanbanCard } from './KanbanCard';

interface KanbanBoardProps {
  workOrders: WorkOrder[];
  isLoading: boolean;
  onDragEnd: (result: DropResult) => void;
  actions: {
    onRegress: (id: string) => void;
    onEdit: (os: WorkOrder) => void;
    onChecklist: (os: WorkOrder) => void;
    onPrint: (os: WorkOrder) => void;
    onDelete: (os: WorkOrder) => void;
    onAdvance: (id: string) => void;
  };
  formatMoney: (val: number) => string;
}

// Componente visual para quando a coluna está vazia
const EmptyState = ({ status }: { status: OSStatus }) => {
  const messages: Record<string, { icon: string, text: string }> = {
    ORCAMENTO: { icon: '📝', text: 'Sem orçamentos pendentes' },
    APROVADO: { icon: '✅', text: 'Nada aprovado aguardando' },
    EM_SERVICO: { icon: '🔧', text: 'Nenhum veículo no elevador' },
    FINALIZADO: { icon: '🏁', text: 'Nenhuma OS finalizada hoje' },
  };

  const info = messages[status] || { icon: '📂', text: 'Lista vazia' };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', opacity: 0.5, textAlign: 'center',
      border: '2px dashed var(--border)', borderRadius: '12px', margin: '10px'
    }}>
      <div style={{ fontSize: '2rem', marginBottom: '10px' }}>{info.icon}</div>
      <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>{info.text}</div>
    </div>
  );
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ workOrders, isLoading, onDragEnd, actions, formatMoney }) => {
  
  // Estado local para a busca
  const [searchTerm, setSearchTerm] = useState('');

  // Lógica de Filtro
  const filteredWorkOrders = workOrders.filter(os => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    
    return (
      os.clientName.toLowerCase().includes(term) || // Busca por Nome
      os.vehicle.toLowerCase().includes(term) ||    // Busca por Veículo
      os.osNumber.toString().includes(term) ||      // Busca por Número da OS
      (os.clientPhone && os.clientPhone.includes(term)) // Busca por Telefone
    );
  });

  const renderColumn = (status: OSStatus) => {
    // Usa a lista filtrada em vez da lista completa
    const list = filteredWorkOrders.filter(o => o.status === status).sort((a,b) => b.osNumber - a.osNumber);
    
    const colColorMap: Record<string, string> = { 
        ORCAMENTO: 'var(--info)', APROVADO: 'var(--warning)', 
        EM_SERVICO: 'var(--primary)', FINALIZADO: 'var(--success)' 
    };

    return (
      <div className={`kanban-column`} style={{borderTop: `4px solid ${colColorMap[status]}`}}>
        <div className="kanban-header">
          {STATUS_LABELS[status]} 
          <span style={{background: 'rgba(0,0,0,0.05)', padding: '2px 8px', borderRadius: 10}}>
            {list.length}
          </span>
        </div>
        
        <Droppable droppableId={status}>
          {(provided, snapshot) => (
            <div 
              className="kanban-list-scroll"
              ref={provided.innerRef}
              {...provided.droppableProps}
              style={{ 
                  display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px', 
                  background: snapshot.isDraggingOver ? 'rgba(0,0,0,0.02)' : 'transparent',
                  transition: 'background-color 0.2s ease', minHeight: 150, flex: 1
              }}
            >
              {list.map((os, index) => (
                <Draggable key={os.id} draggableId={os.id} index={index}>
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
                                style={{
                                    transform: snapshot.isDragging ? 'rotate(3deg) scale(1.02)' : 'none',
                                    transition: snapshot.isDragging ? 'none' : 'all 0.2s ease',
                                    boxShadow: snapshot.isDragging ? '0 25px 50px rgba(0,0,0,0.5)' : '0 4px 6px rgba(0,0,0,0.1)',
                                    opacity: snapshot.isDragging ? 1 : 1,
                                    border: snapshot.isDragging ? '1px solid var(--primary)' : '1px solid var(--border)'
                                }}
                            >
                                <div className="os-header">
                                    <span className="os-number">#{os.osNumber}</span> 
                                    <span className="os-price">{formatMoney(os.total)}</span>
                                </div>
                                <div className="os-client">{os.clientName}</div>
                                <div className="os-vehicle">{os.vehicle}</div>
                                {os.clientPhone && <div className="os-id">📞 {os.clientPhone}</div>}
                                
                                <div className="card-actions" style={{display: snapshot.isDragging ? 'none' : 'flex'}}>
                                    {status !== 'ORCAMENTO' && <button className="btn-icon" title="Voltar Etapa" onClick={() => actions.onRegress(os.id)}>⬅️</button>} 
                                    <div style={{display: 'flex', gap: 5}}>
                                        <button className="btn-icon" title="Editar" onClick={() => actions.onEdit(os)}>✏️</button>
                                        <button className="btn-icon check" title="Checklist" onClick={() => actions.onChecklist(os)}>📋</button>
                                        <button className="btn-icon" title="Imprimir" onClick={() => actions.onPrint(os)}>🖨️</button>
                                        <button className="btn-icon danger" title="Excluir" onClick={() => actions.onDelete(os)}>🗑️</button>
                                    </div>
                                    {status !== 'FINALIZADO' && <button className="btn-icon" title="Avançar Etapa" onClick={() => actions.onAdvance(os.id)}>➡️</button>}
                                </div>
                            </div>
                        </div>
                    );
                  }}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </div>
    ); 
  };

  if (isLoading) return <div className="kanban-board">{[1,2,3,4].map(i => <div key={i} className="kanban-column"><div className="skeleton skeleton-block"/></div>)}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* BARRA DE BUSCA E FILTRO */}
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

        <DragDropContext onDragEnd={onDragEnd}>
            <div className="kanban-board">
                {renderColumn('ORCAMENTO')} {renderColumn('APROVADO')} {renderColumn('EM_SERVICO')} {renderColumn('FINALIZADO')}
            </div>
        </DragDropContext>
    </div>
  );
};