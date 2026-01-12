import React, { useState, useMemo } from 'react';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
import { WorkOrder, OSStatus, STATUS_LABELS } from '../types/index.ts';
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
    onArchive?: (os: WorkOrder) => void;
    onRestore?: (os: WorkOrder) => void;
    // ADICIONADO AQUI TAMBÉM
    onQuickFinish?: (id: string) => void;
  };
  formatMoney: (val: number) => string;
}

const EmptyState = ({ status }: { status: OSStatus }) => {
  const messages: Record<string, { icon: string, text: string }> = {
    ORCAMENTO: { icon: '📝', text: 'Sem orçamentos pendentes' },
    APROVADO: { icon: '✅', text: 'Nada aprovado aguardando' },
    EM_SERVICO: { icon: '🔧', text: 'Nenhum veículo no elevador' },
    FINALIZADO: { icon: '🏁', text: 'Nenhuma OS finalizada hoje' },
    ARQUIVADO: { icon: '📦', text: 'Lixeira vazia. Nenhuma OS arquivada.' },
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
  const [showArchived, setShowArchived] = useState(false);

  const [visibleCounts, setVisibleCounts] = useState<Record<OSStatus, number>>({
      ORCAMENTO: 50, APROVADO: 50, EM_SERVICO: 50, FINALIZADO: 50, ARQUIVADO: 50
  });

  const handleShowMore = (status: OSStatus) => {
      setVisibleCounts(prev => ({ ...prev, [status]: prev[status] + 50 }));
  };

  const filteredWorkOrders = useMemo(() => {
    let list = workOrders;
    if (showArchived) list = list.filter(os => os.status === 'ARQUIVADO');
    else list = list.filter(os => os.status !== 'ARQUIVADO');

    if (!searchTerm) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(os => 
      os.clientName.toLowerCase().includes(term) ||
      os.vehicle.toLowerCase().includes(term) ||
      os.osNumber.toString().includes(term) ||
      (os.clientPhone && os.clientPhone.includes(term))
    );
  }, [workOrders, searchTerm, showArchived]);

  const columnsData = useMemo(() => {
    const cols: Record<OSStatus, WorkOrder[]> = {
        ORCAMENTO: [], APROVADO: [], EM_SERVICO: [], FINALIZADO: [], ARQUIVADO: []
    };
    filteredWorkOrders.forEach(os => {
        if(cols[os.status]) cols[os.status].push(os);
    });
    Object.keys(cols).forEach(key => {
        cols[key as OSStatus].sort((a, b) => b.osNumber - a.osNumber);
    });
    return cols;
  }, [filteredWorkOrders]);

  const handleWhatsApp = (os: WorkOrder) => {
    if (!os.clientPhone) return;
    const cleanPhone = os.clientPhone.replace(/\D/g, '');
    let message = `Olá ${os.clientName.split(' ')[0]}, aqui é da Oficina. `;
    if (os.status === 'ORCAMENTO') message += `O orçamento para o ${os.vehicle} ficou em ${formatMoney(os.total)}. Podemos aprovar?`;
    else if (os.status === 'FINALIZADO') message += `O serviço no ${os.vehicle} foi finalizado! Já pode vir buscar.`;
    else message += `Passando para dar um status sobre o ${os.vehicle}.`;
    
    const fullPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
    const url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;

    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderColumn = (status: OSStatus) => {
    const fullList = columnsData[status];
    const visibleList = fullList.slice(0, visibleCounts[status]);
    const hasMore = fullList.length > visibleCounts[status];

    const colColorMap: Record<string, string> = { 
        ORCAMENTO: 'var(--info)', APROVADO: 'var(--warning)', 
        EM_SERVICO: 'var(--primary)', FINALIZADO: 'var(--success)',
        ARQUIVADO: 'var(--text-muted)'
    };

    return (
      <div className={`kanban-column`} style={{ borderTop: `4px solid ${colColorMap[status]}` }}>
        <div className="kanban-header">
          {STATUS_LABELS[status]} 
          <span style={{background: 'rgba(0,0,0,0.05)', padding: '2px 8px', borderRadius: 10, fontSize: '0.75rem'}}>
            {fullList.length}
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
              {visibleList.length === 0 && !snapshot.isDraggingOver ? (
                 <EmptyState status={status} />
              ) : (
                 <>
                    {visibleList.map((os, index) => (
                        <KanbanCard 
                            key={os.id} 
                            os={os} 
                            index={index} 
                            formatMoney={formatMoney} 
                            status={status}
                            actions={actions}
                            onWhatsApp={() => handleWhatsApp(os)}
                        />
                    ))}
                    {hasMore && (
                        <button onClick={() => handleShowMore(status)} className="btn-secondary" style={{ width: '100%', padding: '8px', fontSize: '0.85rem', marginTop: '10px', borderStyle: 'dashed' }}>
                            ⬇ Carregar mais ({fullList.length - visibleCounts[status]})
                        </button>
                    )}
                 </>
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
                <input type="text" className="form-input search-input" placeholder="Buscar Cliente, OS, Veículo..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                {searchTerm && <button className="btn-clear-search" onClick={() => setSearchTerm('')}>✕</button>}
            </div>
            
            <button className={`btn ${showArchived ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setShowArchived(!showArchived)} style={{ marginLeft: 10, display: 'flex', alignItems: 'center', gap: 6, border: showArchived ? '1px solid var(--border)' : 'none', background: showArchived ? 'var(--bg-input)' : 'transparent' }}>
                {showArchived ? '🔙 Voltar ao Quadro' : '📂 Ver Arquivados'}
            </button>

            <div className="filter-stats"><strong>{filteredWorkOrders.length}</strong> ordens</div>
        </div>

        <DragDropContext onDragEnd={onDragEnd}>
            <div className="kanban-board" style={{ gridTemplateColumns: showArchived ? '1fr' : 'repeat(4, 1fr)' }}>
                {showArchived ? renderColumn('ARQUIVADO') : <>{renderColumn('ORCAMENTO')}{renderColumn('APROVADO')}{renderColumn('EM_SERVICO')}{renderColumn('FINALIZADO')}</>}
            </div>
        </DragDropContext>
    </div>
  );
};