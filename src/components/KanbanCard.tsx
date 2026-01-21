import React, { useState, useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { WorkOrder, OSStatus } from '../types';
import { ContextMenu } from './ContextMenu';
import { ActionMenu } from './ActionMenu';

// 🆕 DECLARAÇÕES GLOBAIS PARA ELECTRON/TAURI
declare global {
  interface Window {
    electron?: {
      shell: {
        openExternal: (url: string) => Promise<void>;
      };
    };
    __TAURI__?: {
      shell: {
        open: (url: string) => Promise<void>;
      };
    };
  }
}

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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: os.id });

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

  const getProfitMarginColor = (margin: number) => {
    if (margin >= 70) return { color: 'var(--success)', bg: 'rgba(4, 211, 97, 0.1)' };
    if (margin >= 16) return { color: 'var(--warning)', bg: 'rgba(255, 152, 0, 0.1)' };
    return { color: 'var(--danger)', bg: 'rgba(229, 76, 76, 0.1)' };
  };

  // 🆕 FUNÇÃO WHATSAPP DO CRM - OTIMIZADA PARA .EXE
  const openWhatsApp = async () => {
    if (!os.clientPhone) return;
    
    let cleanPhone = os.clientPhone.replace(/\D/g, '');
    if (cleanPhone.startsWith('55')) cleanPhone = cleanPhone.substring(2);
    
    if (cleanPhone.length < 10) {
      alert(`Telefone inválido: ${os.clientPhone}\n\nPrecisa ter pelo menos 10 dígitos (DDD + número)`);
      return;
    }
    
    const message = encodeURIComponent(
      `Olá ${os.clientName}, tudo bem?\n\nEstamos entrando em contato da oficina sobre a OS #${os.osNumber} do seu ${os.vehicle}.`
    );
    
    const whatsappUrl = `https://wa.me/55${cleanPhone}?text=${message}`;
    
    if (window.electron?.shell?.openExternal) {
      await window.electron.shell.openExternal(whatsappUrl);
      return;
    }
    
    if (window.__TAURI__?.shell?.open) {
      await window.__TAURI__.shell.open(whatsappUrl);
      return;
    }
    
    const newWindow = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      try {
        await navigator.clipboard.writeText(whatsappUrl);
        alert(`Link do WhatsApp copiado!\n\nCole no navegador:\n${whatsappUrl}`);
      } catch {
        prompt('Copie este link:', whatsappUrl);
      }
    }
  };

  // 🆕 ITENS DO MENU (Compartilhado entre Context Menu e Action Menu)
  const menuItems = useMemo(() => {
    const items = [
      {
        icon: '✏️',
        label: 'Editar OS',
        onClick: () => actions.onEdit(os),
        variant: 'primary' as const
      },
      {
        icon: '📋',
        label: 'Checklist',
        onClick: () => actions.onChecklist(os)
      },
      {
        icon: '🖨️',
        label: 'Imprimir',
        onClick: () => actions.onPrint(os)
      }
    ];

    // Adiciona WhatsApp se tiver telefone
    if (os.clientPhone) {
      items.push({
        icon: '💬',
        label: 'WhatsApp',
        onClick: openWhatsApp,
        variant: 'success' as const
      });
    }

    // Divider antes das ações de navegação
    items.push({ icon: '', label: '', onClick: () => {}, divider: true });

    // Navegação
    if (status !== 'ARQUIVADO' && status !== 'ORCAMENTO') {
      items.push({
        icon: '⬅️',
        label: 'Voltar Status',
        onClick: () => actions.onRegress(os.id)
      });
    }

    if (status !== 'ARQUIVADO' && status !== 'FINALIZADO') {
      items.push({
        icon: '➡️',
        label: 'Avançar Status',
        onClick: () => actions.onAdvance(os.id)
      });
    }

    // Divider antes das ações destrutivas
    items.push({ icon: '', label: '', onClick: () => {}, divider: true });

    // Arquivar/Restaurar
    if (status === 'ARQUIVADO') {
      items.push({
        icon: '↩️',
        label: 'Restaurar OS',
        onClick: () => actions.onRestore?.(os),
        variant: 'success' as const
      });
    } else {
      items.push({
        icon: '📦',
        label: 'Arquivar',
        onClick: () => actions.onArchive?.(os)
      });
    }

    // Excluir
    items.push({
      icon: '🗑️',
      label: 'Excluir Permanentemente',
      onClick: () => actions.onDelete(os),
      variant: 'danger' as const
    });

    return items;
  }, [os, status, actions]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div 
        ref={setNodeRef} 
        style={style} 
        {...attributes} 
        {...listeners}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          className={cardClassName}
          title="💡 Clique direito para mais opções | Ctrl+Clique para finalizar"
          onClick={(e) => {
            if (e.ctrlKey && status !== 'FINALIZADO' && actions.onQuickFinish) {
              e.preventDefault();
              e.stopPropagation();
              actions.onQuickFinish(os.id);
            }
          }}
          onContextMenu={handleContextMenu}
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
              : isHovered 
                ? '0 8px 24px rgba(0, 0, 0, 0.15)'
                : '0 2px 8px rgba(0, 0, 0, 0.1)',
            willChange: 'transform, box-shadow, opacity',
            transition: 'box-shadow 0.2s ease'
          }}
        >
          {/* 👑 HEADER: Número, Valor e Action Menu */}
          <div className="os-header" style={{ position: 'relative' }}>
            <span className="os-number">#{os.osNumber}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="os-price">{formatMoney(os.total)}</span>
              
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

            {/* 🆕 ACTION MENU (Kebab) - Aparece no hover */}
            <div 
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                opacity: isHovered ? 1 : 0,
                transition: 'opacity 0.2s ease',
                pointerEvents: isHovered ? 'auto' : 'none'
              }}
            >
              <ActionMenu items={menuItems} buttonSize={28} />
            </div>
          </div>

          {/* 👤 INFO: Cliente e Veículo */}
          <div className="os-client" style={{ marginBottom: 4, marginTop: 8 }}>{os.clientName}</div>
          <div className="os-vehicle" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{os.vehicle}</div>
          
          {/* 📞 TELEFONE - Minimalista */}
          {os.clientPhone && (
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 6,
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px solid var(--border)',
                fontSize: '0.8rem',
                color: 'var(--text-muted)'
              }}
            >
              📞 {os.clientPhone}
            </div>
          )}

          {/* 🆕 AÇÕES PRINCIPAIS - MINIMALISTA (Aparecem no Hover) */}
          <div 
            className="card-quick-actions" 
            style={{ 
              display: isDragging || forcedDragging ? 'none' : 'flex',
              opacity: isHovered ? 1 : 0,
              transform: isHovered ? 'translateY(0)' : 'translateY(-5px)',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              gap: 6,
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
              pointerEvents: isHovered ? 'auto' : 'none'
            }}
          >
            {/* Botão Editar - Primário */}
            <button 
              className="btn-quick-edit" 
              title="Editar OS (Principal)" 
              onClick={(e) => {
                e.stopPropagation(); 
                actions.onEdit(os);
              }}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: '0.8rem',
                fontWeight: 600,
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 8px rgba(130, 87, 230, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(130, 87, 230, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(130, 87, 230, 0.3)';
              }}
            >
              ✏️ Editar
            </button>

            {/* Botão WhatsApp - Secundário (Se tiver telefone) */}
            {os.clientPhone && (
              <button 
                className="btn-quick-whatsapp" 
                title="WhatsApp Rápido" 
                onClick={(e) => {
                  e.stopPropagation(); 
                  openWhatsApp();
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 8px rgba(37, 211, 102, 0.3)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 211, 102, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(37, 211, 102, 0.3)';
                }}
              >
                💬 WhatsApp
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Menu de Contexto (Clique Direito) */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
});