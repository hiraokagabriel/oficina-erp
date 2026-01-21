import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
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

export const KanbanCard = React.memo(({ 
  os, 
  formatMoney, 
  status, 
  actions, 
  isDragging: forcedDragging
}: KanbanCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: os.id });

  // ✅ Estilo otimizado com @dnd-kit
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging || forcedDragging ? 9999 : 'auto',
    cursor: isDragging ? 'grabbing' : 'grab',
    opacity: isDragging ? 0.5 : status === 'ARQUIVADO' ? 0.7 : 1,
    position: 'relative',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  };

  const cardClassName = [
    'kanban-card',
    isDragging && 'is-dragging',
    forcedDragging && 'is-overlay'
  ].filter(Boolean).join(' ');

  // 🆕 LÓGICA DE CORES DA MARGEM DE LUCRO
  const getProfitMarginColor = (margin: number) => {
    if (margin >= 70) return { color: 'var(--success)', bg: 'rgba(4, 211, 97, 0.1)' };
    if (margin >= 16) return { color: 'var(--warning)', bg: 'rgba(255, 152, 0, 0.1)' };
    return { color: 'var(--danger)', bg: 'rgba(229, 76, 76, 0.1)' };
  };

  // 🆕 FUNÇÃO PARA ABRIR WHATSAPP
  const handleWhatsApp = () => {
    if (!os.clientPhone) return;
    
    // Remove caracteres não numéricos do telefone
    const phone = os.clientPhone.replace(/\D/g, '');
    
    // Adiciona código do país (Brasil = 55) se não tiver
    const fullPhone = phone.startsWith('55') ? phone : `55${phone}`;
    
    // Mensagem padrão
    const message = encodeURIComponent(`Olá ${os.clientName}, tudo bem? Sou da oficina em relação à OS #${os.osNumber} do seu ${os.vehicle}.`);
    
    // Abre WhatsApp Web
    window.open(`https://wa.me/${fullPhone}?text=${message}`, '_blank');
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div
        className={cardClassName}
        title="💡 Dica: Ctrl + Clique para finalizar imediatamente"
        onClick={(e) => {
          if (e.ctrlKey && status !== 'FINALIZADO' && actions.onQuickFinish) {
            e.preventDefault();
            e.stopPropagation();
            actions.onQuickFinish(os.id);
          }
        }}
        style={{
          border: isDragging || forcedDragging
            ? '2px solid var(--primary)' 
            : '1px solid var(--border)',
          background: isDragging || forcedDragging
            ? 'var(--bg-panel)' 
            : 'var(--bg-card, var(--bg-panel))',
          color: 'var(--text)',
          boxShadow: isDragging || forcedDragging
            ? '0 20px 40px rgba(0, 0, 0, 0.3), 0 0 0 2px var(--primary)'
            : '0 2px 8px rgba(0, 0, 0, 0.1)',
          willChange: 'transform, box-shadow, opacity',
        }}
      >
        {/* HEADER: NÚmero da OS e Valor */}
        <div className="os-header">
          <span className="os-number">#{os.osNumber}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="os-price">{formatMoney(os.total)}</span>
            
            {/* 🆕 INDICADOR DE MARGEM DE LUCRO */}
            {os.profitMargin !== undefined && os.profitMargin > 0 && (
              <span 
                style={{ 
                  fontSize: '0.7rem', 
                  color: getProfitMarginColor(os.profitMargin).color,
                  fontWeight: 'bold',
                  marginLeft: 2,
                  padding: '2px 4px',
                  borderRadius: 4,
                  backgroundColor: getProfitMarginColor(os.profitMargin).bg
                }}
                title={`Lucro: ${formatMoney(os.profit || 0)} | ROI: ${os.totalCost && os.totalCost > 0 ? ((os.profit || 0) / os.totalCost * 100).toFixed(0) : '0'}%`}
              >
                +{os.profitMargin.toFixed(0)}%
              </span>
            )}
          </div>
        </div>

        {/* INFO: Cliente, Veículo, Telefone */}
        <div className="os-client">{os.clientName}</div>
        <div className="os-vehicle">{os.vehicle}</div>
        
        {/* 🆕 TELEFONE COM BOTÃO WHATSAPP */}
        {os.clientPhone && (
          <div 
            className="os-phone" 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8,
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
              marginTop: 6,
              paddingTop: 6,
              borderTop: '1px solid var(--border)'
            }}
          >
            <span style={{ flex: 1 }}>📞 {os.clientPhone}</span>
            <button 
              className="btn-whatsapp" 
              title="Enviar mensagem no WhatsApp"
              onClick={(e) => { 
                e.stopPropagation(); 
                handleWhatsApp(); 
              }}
              style={{
                background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
                boxShadow: '0 2px 4px rgba(37, 211, 102, 0.3)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(37, 211, 102, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(37, 211, 102, 0.3)';
              }}
            >
              <span style={{ marginRight: 4 }}>💬</span>
              WhatsApp
            </button>
          </div>
        )}

        {/* 🆕 AÇÕES REORGANIZADAS - Mais espaçadas e harmônicas */}
        <div 
          className="card-actions" 
          style={{ 
            display: isDragging || forcedDragging ? 'none' : 'flex',
            opacity: isDragging || forcedDragging ? 0 : 1,
            flexDirection: 'column',
            gap: 8,
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid var(--border)'
          }}
        >
          {/* LINHA 1: Ações Principais (Editar, Checklist, Imprimir) */}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button 
              className="btn-icon" 
              title="Editar OS" 
              onClick={(e) => {
                e.stopPropagation(); 
                actions.onEdit(os);
              }}
              style={{ padding: '6px 10px', fontSize: '0.9rem' }}
            >
              ✏️ Editar
            </button>
            <button 
              className="btn-icon" 
              title="Checklist de Inspeção" 
              onClick={(e) => {
                e.stopPropagation(); 
                actions.onChecklist(os);
              }}
              style={{ padding: '6px 10px', fontSize: '0.9rem' }}
            >
              📋 Check
            </button>
            <button 
              className="btn-icon" 
              title="Imprimir OS" 
              onClick={(e) => {
                e.stopPropagation(); 
                actions.onPrint(os);
              }}
              style={{ padding: '6px 10px', fontSize: '0.9rem' }}
            >
              🖨️ Print
            </button>
          </div>

          {/* LINHA 2: Navegação e Gerenciamento */}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', alignItems: 'center' }}>
            {/* Botão Voltar (esquerda) */}
            {status !== 'ARQUIVADO' && status !== 'ORCAMENTO' && (
              <button 
                className="btn-icon" 
                title="Voltar Status" 
                onClick={(e) => {
                  e.stopPropagation(); 
                  actions.onRegress(os.id);
                }}
                style={{ padding: '6px 12px' }}
              >
                ⬅️
              </button>
            )}

            {/* Ações centrais (Arquivar/Restaurar, Excluir) */}
            <div style={{ display: 'flex', gap: 6 }}>
              {status === 'ARQUIVADO' ? (
                <button 
                  className="btn-icon" 
                  title="Restaurar OS" 
                  onClick={(e) => {
                    e.stopPropagation(); 
                    actions.onRestore && actions.onRestore(os);
                  }} 
                  style={{ padding: '6px 10px', color: 'var(--success)' }}
                >
                  ↩️ Restaurar
                </button>
              ) : (
                <button 
                  className="btn-icon" 
                  title="Arquivar OS" 
                  onClick={(e) => {
                    e.stopPropagation(); 
                    actions.onArchive && actions.onArchive(os);
                  }} 
                  style={{ padding: '6px 10px', color: 'var(--text-muted)' }}
                >
                  📦 Arquivar
                </button>
              )}
              
              <button 
                className="btn-icon danger" 
                title="Excluir OS Permanentemente" 
                onClick={(e) => {
                  e.stopPropagation(); 
                  actions.onDelete(os);
                }}
                style={{ padding: '6px 10px' }}
              >
                🗑️ Excluir
              </button>
            </div>

            {/* Botão Avançar (direita) */}
            {status !== 'ARQUIVADO' && status !== 'FINALIZADO' && (
              <button 
                className="btn-icon" 
                title="Avançar Status" 
                onClick={(e) => {
                  e.stopPropagation(); 
                  actions.onAdvance(os.id);
                }}
                style={{ padding: '6px 12px' }}
              >
                ➡️
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});