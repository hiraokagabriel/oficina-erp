import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { WorkOrder, OSStatus } from '../types';

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
    
    console.log('📱 ===== ABERTURA WHATSAPP =====');
    console.log('Telefone original:', os.clientPhone);
    console.log('Nome do cliente:', os.clientName);
    
    let cleanPhone = os.clientPhone.replace(/\D/g, '');
    console.log('Telefone limpo (só números):', cleanPhone);
    
    if (cleanPhone.startsWith('55')) {
      cleanPhone = cleanPhone.substring(2);
      console.log('Removeu 55 do início:', cleanPhone);
    }
    
    if (cleanPhone.length < 10) {
      alert(`Telefone inválido: ${os.clientPhone}\n\nPrecisa ter pelo menos 10 dígitos (DDD + número)`);
      console.error('❌ Telefone muito curto:', cleanPhone);
      return;
    }
    
    const message = encodeURIComponent(
      `Olá ${os.clientName}, tudo bem?\n\nEstamos entrando em contato da oficina sobre a OS #${os.osNumber} do seu ${os.vehicle}.`
    );
    
    const whatsappUrl = `https://wa.me/55${cleanPhone}?text=${message}`;
    console.log('URL final:', whatsappUrl);
    console.log('Telefone com código do país: +55' + cleanPhone);
    
    // MÉTODO 1: Electron
    if (window.electron?.shell?.openExternal) {
      console.log('🚀 Ambiente detectado: ELECTRON (.exe)');
      console.log('✅ Usando electron.shell.openExternal()...');
      try {
        await window.electron.shell.openExternal(whatsappUrl);
        console.log('✅ WhatsApp aberto via Electron!');
        return;
      } catch (error) {
        console.error('❌ Erro no Electron:', error);
      }
    }
    
    // MÉTODO 2: Tauri
    if (window.__TAURI__?.shell?.open) {
      console.log('🚀 Ambiente detectado: TAURI (.exe)');
      console.log('✅ Usando Tauri shell.open()...');
      try {
        await window.__TAURI__.shell.open(whatsappUrl);
        console.log('✅ WhatsApp aberto via Tauri!');
        return;
      } catch (error) {
        console.error('❌ Erro no Tauri:', error);
      }
    }
    
    // MÉTODO 3: Navegador web
    console.log('🌐 Ambiente detectado: NAVEGADOR WEB');
    console.log('✅ Usando window.open() padrão...');
    const newWindow = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      console.warn('⚠️ window.open() bloqueado!');
      
      console.log('✅ Tentando método alternativo: link <a>...');
      try {
        const link = document.createElement('a');
        link.href = whatsappUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log('✅ Link criado e clicado!');
        return;
      } catch (error) {
        console.error('❌ Método <a> falhou:', error);
      }
      
      console.log('✅ Último recurso: copiando URL...');
      try {
        await navigator.clipboard.writeText(whatsappUrl);
        alert(`Não foi possível abrir o WhatsApp automaticamente.\n\nO link foi COPIADO para sua área de transferência!\n\nCole (Ctrl+V) no navegador:\n${whatsappUrl}`);
        console.log('✅ URL copiada com sucesso!');
      } catch (clipboardError) {
        console.error('❌ Clipboard falhou:', clipboardError);
        prompt('Copie este link e cole no navegador:', whatsappUrl);
      }
    } else {
      console.log('✅ WhatsApp aberto via window.open()!');
    }
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
        {/* 👑 HEADER: Número da OS e Valor */}
        <div className="os-header">
          <span className="os-number">#{os.osNumber}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
        </div>

        {/* 👤 INFO: Cliente e Veículo */}
        <div className="os-client" style={{ marginBottom: 4 }}>{os.clientName}</div>
        <div className="os-vehicle" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{os.vehicle}</div>
        
        {/* 📞 TELEFONE COM BOTÃO WHATSAPP - UI/UX APRIMORADO */}
        {os.clientPhone && (
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8,
              marginTop: 10,
              paddingTop: 10,
              borderTop: '1px solid var(--border)'
            }}
          >
            <span style={{ 
              flex: 1,
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}>
              📞 {os.clientPhone}
            </span>
            
            {/* 🆕 BOTÃO WHATSAPP - DESIGN MODERNO */}
            <button 
              className="btn-whatsapp" 
              title="Abrir conversa no WhatsApp"
              onClick={(e) => { 
                e.stopPropagation(); 
                openWhatsApp(); 
              }}
              style={{
                background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.3px',
                boxShadow: '0 2px 8px rgba(37, 211, 102, 0.25)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                textTransform: 'uppercase'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 211, 102, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(37, 211, 102, 0.25)';
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp
            </button>
          </div>
        )}

        {/* 🎯 AÇÕES - APLICANDO BOAS PRÁTICAS DE UI/UX */}
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
          {/* 🆕 LINHA 1: AÇÕES PRIMÁRIAS (Hierarquia Visual) */}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
            {/* BOTÃO PRIMÁRIO: Editar - Mais Proeminente */}
            <button 
              className="btn-primary-action" 
              title="Editar OS" 
              onClick={(e) => {
                e.stopPropagation(); 
                actions.onEdit(os);
              }}
              style={{
                padding: '7px 14px',
                fontSize: '0.8rem',
                fontWeight: 600,
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(130, 87, 230, 0.2)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(130, 87, 230, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(130, 87, 230, 0.2)';
              }}
            >
              ✏️ Editar
            </button>
            
            {/* BOTÕES SECUNDÁRIOS: Checklist e Imprimir - Mais Sutis */}
            <button 
              className="btn-secondary-action" 
              title="Checklist de Inspeção" 
              onClick={(e) => {
                e.stopPropagation(); 
                actions.onChecklist(os);
              }}
              style={{
                padding: '7px 12px',
                fontSize: '0.8rem',
                fontWeight: 500,
                background: 'var(--bg-panel)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover, rgba(130, 87, 230, 0.1))';
                e.currentTarget.style.borderColor = 'var(--primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-panel)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              📋
            </button>
            
            <button 
              className="btn-secondary-action" 
              title="Imprimir OS" 
              onClick={(e) => {
                e.stopPropagation(); 
                actions.onPrint(os);
              }}
              style={{
                padding: '7px 12px',
                fontSize: '0.8rem',
                fontWeight: 500,
                background: 'var(--bg-panel)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover, rgba(130, 87, 230, 0.1))';
                e.currentTarget.style.borderColor = 'var(--primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-panel)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              🖨️
            </button>
          </div>

          {/* 🆕 LINHA 2: NAVEGAÇÃO E GERENCIAMENTO (Agrupamento Lógico) */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            gap: 6
          }}>
            {/* Navegação: Voltar */}
            {status !== 'ARQUIVADO' && status !== 'ORCAMENTO' ? (
              <button 
                className="btn-nav" 
                title="Voltar Status" 
                onClick={(e) => {
                  e.stopPropagation(); 
                  actions.onRegress(os.id);
                }}
                style={{
                  padding: '6px 10px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: '1rem',
                  transition: 'all 0.2s ease',
                  opacity: 0.7
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.borderColor = 'var(--primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0.7';
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              >
                ⬅️
              </button>
            ) : <div style={{ width: 40 }} />}

            {/* Grupo Central: Ações Destrutivas/Importantes */}
            <div style={{ display: 'flex', gap: 6 }}>
              {status === 'ARQUIVADO' ? (
                <button 
                  className="btn-restore" 
                  title="Restaurar OS" 
                  onClick={(e) => {
                    e.stopPropagation(); 
                    actions.onRestore && actions.onRestore(os);
                  }} 
                  style={{
                    padding: '6px 10px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    background: 'rgba(4, 211, 97, 0.1)',
                    color: 'var(--success)',
                    border: '1px solid var(--success)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--success)';
                    e.currentTarget.style.color = '#fff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(4, 211, 97, 0.1)';
                    e.currentTarget.style.color = 'var(--success)';
                  }}
                >
                  ↩️ Restaurar
                </button>
              ) : (
                <button 
                  className="btn-archive" 
                  title="Arquivar OS" 
                  onClick={(e) => {
                    e.stopPropagation(); 
                    actions.onArchive && actions.onArchive(os);
                  }} 
                  style={{
                    padding: '6px 10px',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    opacity: 0.6
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.borderColor = 'var(--text-muted)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '0.6';
                    e.currentTarget.style.borderColor = 'var(--border)';
                  }}
                >
                  📦
                </button>
              )}
              
              <button 
                className="btn-delete" 
                title="Excluir OS Permanentemente" 
                onClick={(e) => {
                  e.stopPropagation(); 
                  actions.onDelete(os);
                }}
                style={{
                  padding: '6px 10px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  background: 'transparent',
                  color: 'var(--danger)',
                  border: '1px solid transparent',
                  borderRadius: 6,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  opacity: 0.6
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.background = 'rgba(229, 76, 76, 0.1)';
                  e.currentTarget.style.borderColor = 'var(--danger)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0.6';
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'transparent';
                }}
              >
                🗑️
              </button>
            </div>

            {/* Navegação: Avançar */}
            {status !== 'ARQUIVADO' && status !== 'FINALIZADO' ? (
              <button 
                className="btn-nav" 
                title="Avançar Status" 
                onClick={(e) => {
                  e.stopPropagation(); 
                  actions.onAdvance(os.id);
                }}
                style={{
                  padding: '6px 10px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: '1rem',
                  transition: 'all 0.2s ease',
                  opacity: 0.7
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.borderColor = 'var(--primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0.7';
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              >
                ➡️
              </button>
            ) : <div style={{ width: 40 }} />}
          </div>
        </div>
      </div>
    </div>
  );
});