import React, { useState, useMemo } from 'react';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
// REMOVIDO: import { open } from '@tauri-apps/plugin-opener'; 
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
  const [searchTerm, setSearchTerm] = useState('');

  // Lógica de Filtro
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

  // Agrupamento
  const columnsData = useMemo(() => {
    const cols: Record<OSStatus, WorkOrder[]> = {
        ORCAMENTO: [], APROVADO: [], EM_SERVICO: [], FINALIZADO: []
    };
    filteredWorkOrders.forEach(os => {
        if(cols[os.status]) cols[os.status].push(os);
    });
    Object.keys(cols).forEach(key => {
        cols[key as OSStatus].sort((a, b) => b.osNumber - a.osNumber);
    });
    return cols;
  }, [filteredWorkOrders]);

  // --- ONE-CLICK WHATSAPP INTEGRATION ---
  const handleWhatsApp = (os: WorkOrder) => {
    if (!os.clientPhone) return;
    
    // 1. Limpa o número (remove ( ) - e espaços)
    const cleanPhone = os.clientPhone.replace(/\D/g, '');
    
    // 2. Mensagem personalizada baseada no status
    let message = `Olá ${os.clientName.split(' ')[0]}, aqui é da Oficina. `;
    if (os.status === 'ORCAMENTO') {
        message += `O orçamento para o ${os.vehicle} ficou em ${formatMoney(os.total)}. Podemos aprovar?`;
    } else if (os.status === 'FINALIZADO') {
        message += `O serviço no ${os.vehicle} foi finalizado! Já pode vir buscar.`;
    } else {
        message += `Passando para dar um status sobre o ${os.vehicle}.`;
    }

    // 3. Monta o link (Adiciona 55 do Brasil se não tiver)
    const fullPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
    const url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;

    // 4. Abertura do link (Método Seguro sem Plugin)
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderColumn = (status: OSStatus) => {
    const list = columnsData[status];
    const colColorMap: Record<string, string> = { 
        ORCAMENTO: 'var(--info)', APROVADO: 'var(--warning)', 
        EM_SERVICO: 'var(--primary)', FINALIZADO: 'var(--success)' 
    };

    return (
      <div className={`kanban-column`} style={{ borderTop: `4px solid ${colColorMap[status]}` }}>
        <div className="kanban-header">
          {STATUS_LABELS[status]} 
          <span style={{background: 'rgba(0,0,0,0.05)', padding: '2px 8px', borderRadius: 10, fontSize: '0.75rem'}}>
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
              {list.length === 0 && !snapshot.isDraggingOver ? (
                 <EmptyState status={status} />
              ) : (
                 list.map((os, index) => (
                    <KanbanCard 
                        key={os.id} 
                        os={os} 
                        index={index} 
                        formatMoney={formatMoney} 
                        status={status}
                        actions={actions}
                        onWhatsApp={() => handleWhatsApp(os)}
                    />
                 ))
              )}
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
        <div className="kanban-filter-bar">
            <div className="search-wrapper">
                <span className="search-icon">🔍</span>
                <input 
                    type="text" 
                    className="form-input search-input" 
                    placeholder="Buscar Cliente, OS, Veículo..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && <button className="btn-clear-search" onClick={() => setSearchTerm('')}>✕</button>}
            </div>
            <div className="filter-stats"><strong>{filteredWorkOrders.length}</strong> ordens encontradas</div>
        </div>

        <DragDropContext onDragEnd={onDragEnd}>
            <div className="kanban-board">
                {renderColumn('ORCAMENTO')} {renderColumn('APROVADO')} {renderColumn('EM_SERVICO')} {renderColumn('FINALIZADO')}
            </div>
        </DragDropContext>
    </div>
  );
};