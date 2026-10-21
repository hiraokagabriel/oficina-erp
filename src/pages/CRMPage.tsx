import React, { useState, useMemo } from 'react';
import { Client, WorkOrder, LedgerEntry, STATUS_LABELS } from '../types';
import { osBelongsToClient } from '../utils/links';
import { getClientReceivables } from '../services/receivables';
import { CRMDashboard } from '../components/CRMDashboard';
import { ClientEditModal } from '../modals/ClientEditModal';

// ✅ Declaração global do Tauri
declare global {
  interface Window {
    __TAURI__?: {
      shell: {
        open: (url: string) => Promise<void>;
      };
    };
  }
}

interface CRMPageProps {
  clients: Client[];
  workOrders: WorkOrder[];
  ledger: LedgerEntry[];
  isLoading: boolean;
  formatMoney: (val: number) => string;
  onSaveClient?: (client: Client) => void;
  onOpenOS?: (os: WorkOrder) => void;
}

export const CRMPage: React.FC<CRMPageProps> = ({ 
  clients, 
  workOrders, 
  ledger,
  isLoading, 
  formatMoney,
  onSaveClient,
  onOpenOS 
}) => {
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showDashboard, setShowDashboard] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Dívida por cliente, ligada pelo id resolvido da OS (chave de byClient = id do cliente).
  const receivables = useMemo(() => getClientReceivables(workOrders, ledger, new Date(), clients), [workOrders, ledger, clients]);
  const selectedDebt = selectedClient ? receivables.byClient.get(selectedClient.id) : undefined;

  const filteredClients = useMemo(() => {
    if (!searchTerm) return clients;
    
    const term = searchTerm.toLowerCase();
    return clients.filter(c => 
      c.name.toLowerCase().includes(term) ||
      c.phone?.toLowerCase().includes(term) ||
      c.vehicles.some(v => 
        v.model.toLowerCase().includes(term) || 
        v.plate?.toLowerCase().includes(term)
      )
    );
  }, [clients, searchTerm]);

  const clientHistory = useMemo(() => {
    if (!selectedClient) return [];
    return workOrders
      .filter(os => osBelongsToClient(os, selectedClient, clients))
      .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [selectedClient, workOrders, clients]);

  const reminders = useMemo(() => {
      if (!selectedClient) return [];
      const result = [];
      const now = new Date();
      
      const lastOil = clientHistory.find(os => 
        os.status === 'FINALIZADO' && 
        (os.parts.some(p => p.description.match(/óleo|oleo/i)) || os.services.some(s => s.description.match(/óleo|oleo/i)))
      );

      if (lastOil) {
          const diffDays = Math.ceil(Math.abs(now.getTime() - new Date(lastOil.createdAt).getTime()) / (86400000)); 
          if (diffDays > 180) result.push({ type: 'danger', text: 'Troca de Óleo Vencida (+6 meses)' });
          else if (diffDays > 150) result.push({ type: 'warning', text: 'Troca de Óleo Próxima' });
      } 
      return result;
  }, [clientHistory, selectedClient]);

  const getWorkSummary = (os: WorkOrder) => {
      const mainItem = os.services[0]?.description || os.parts[0]?.description;
      if (!mainItem) return "Serviço inicial";
      const count = (os.services.length + os.parts.length) - 1;
      return count > 0 ? `${mainItem} (+${count} itens)` : mainItem;
  };

  const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      return {
          day: date.getDate().toString().padStart(2, '0'),
          month: date.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase(),
          year: date.getFullYear()
      };
  };

  // ✅ OTIMIZADO PARA .EXE: Abrir WhatsApp com suporte Tauri
  const openWhatsApp = async (phone: string, clientName: string) => {
    console.log('📱 ===== ABERTURA WHATSAPP =====');
    console.log('Telefone original:', phone);
    console.log('Nome do cliente:', clientName);
    
    let cleanPhone = phone.replace(/\D/g, '');
    console.log('Telefone limpo (só números):', cleanPhone);
    
    if (cleanPhone.startsWith('55')) {
      cleanPhone = cleanPhone.substring(2);
      console.log('Removeu 55 do início:', cleanPhone);
    }
    
    if (cleanPhone.length < 10) {
      alert(`Telefone inválido: ${phone}\n\nPrecisa ter pelo menos 10 dígitos (DDD + número)`);
      console.error('❌ Telefone muito curto:', cleanPhone);
      return;
    }
    
    const message = encodeURIComponent(
      `Olá ${clientName}, tudo bem?\n\nEstamos entrando em contato da oficina sobre o seu veículo.`
    );
    
    const whatsappUrl = `https://wa.me/55${cleanPhone}?text=${message}`;
    console.log('URL final:', whatsappUrl);
    console.log('Telefone com código do país: +55' + cleanPhone);
    
    // MÉTODO 1: Tauri
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
    
    // MÉTODO 2: Navegador web
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

  const handleSaveClient = (updatedClient: Client) => {
    if (onSaveClient) {
      onSaveClient(updatedClient);
      setSelectedClient(updatedClient);
    }
    setIsEditModalOpen(false);
  };

  return (
    <>
      <div className="header-area" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">CRM & Clientes</h1>
        <button 
          className="btn btn-secondary"
          onClick={() => setShowDashboard(!showDashboard)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          {showDashboard ? '👁 Ocultar Dashboard' : '📊 Mostrar Dashboard'}
        </button>
      </div>

      {showDashboard && (
        <div style={{ marginBottom: '24px' }}>
          <CRMDashboard
            clients={clients}
            workOrders={workOrders}
            topDebtors={receivables.ranking.slice(0, 5)}
            onClientSelect={(client) => {
              setSelectedClient(client);
              setShowDashboard(false);
            }}
          />
        </div>
      )}
      
      <div className={showDashboard ? 'crm-layout crm-layout--below-dashboard' : 'crm-layout'}>
          {/* LISTA DE CLIENTES */}
          <div className="client-list">
              <div style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
                <div className="search-wrapper" style={{ margin: 0 }}>
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    className="form-input search-input"
                    placeholder="Buscar por nome, telefone ou placa..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ width: '100%' }}
                  />
                  {searchTerm && (
                    <button 
                      className="btn-clear-search" 
                      onClick={() => setSearchTerm('')}
                      style={{ position: 'absolute', right: '12px' }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {isLoading ? (
                  Array.from({length:5}).map((_,i)=><div key={i} className="skeleton" style={{height: 60, marginBottom: 10}}/>) 
              ) : (
                  filteredClients.map(c => (
                    <div 
                      key={c.id} 
                      className={`client-list-item ${selectedClient?.id === c.id ? 'active' : ''}`} 
                      onClick={() => setSelectedClient(c)}
                    >
                        <div className="client-name">{c.name}</div>
                        <div className="client-contact">{c.phone || '...'} • {c.vehicles.length} veículo(s)</div>
                        {receivables.byClient.get(c.id) && (
                          <div className="client-debt">
                            Em aberto {formatMoney(receivables.byClient.get(c.id)!.emAberto)}
                            {receivables.byClient.get(c.id)!.atrasado > 0 && (
                              <span className="late">Atrasado {formatMoney(receivables.byClient.get(c.id)!.atrasado)}</span>
                            )}
                          </div>
                        )}
                    </div>
                  ))
              )}
              {!isLoading && filteredClients.length === 0 && (
                <div style={{padding:20, color:'var(--text-muted)', textAlign: 'center'}}>
                  {searchTerm ? `Nenhum cliente encontrado para "${searchTerm}"` : 'Sem clientes.'}
                </div>
              )}
          </div>

          {/* ✨ PAINEL DE DETALHES REFORMULADO */}
          <div className="crm-details">
              {selectedClient ? (
                  <>
                      {/* 🎨 HEADER MODERNIZADO COM GRADIENTE */}
                      <div style={{
                        background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)',
                        borderRadius: 'var(--radius-card)',
                        padding: '32px',
                        marginBottom: '24px',
                        color: '#fff',
                        position: 'relative',
                        overflow: 'hidden',
                        boxShadow: '0 10px 40px rgba(130, 87, 230, 0.3)'
                      }}>
                        {/* Decoração de fundo */}
                        <div style={{
                          position: 'absolute',
                          top: '-50px',
                          right: '-50px',
                          width: '200px',
                          height: '200px',
                          background: 'rgba(255,255,255,0.1)',
                          borderRadius: '50%',
                          filter: 'blur(40px)'
                        }}/>
                        
                        <div style={{ position: 'relative', zIndex: 1 }}>
                          {/* Nome e ações */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                            <div>
                              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.9, marginBottom: '8px' }}>
                                Cliente
                              </div>
                              <h2 style={{ margin: 0, fontSize: '2.2rem', fontWeight: 800, lineHeight: 1.2 }}>
                                {selectedClient.name}
                              </h2>
                            </div>
                            
                            {/* Botões de ação */}
                            <div style={{ display: 'flex', gap: '12px' }}>
                              {selectedClient.phone && (
                                <button 
                                  className="btn btn-success"
                                  onClick={() => openWhatsApp(selectedClient.phone!, selectedClient.name)}
                                  style={{ 
                                    background: '#10b981',
                                    border: 'none',
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '8px',
                                    boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)'
                                  }}
                                >
                                  <span style={{ fontSize: '1.2rem' }}>💬</span>
                                  WhatsApp
                                </button>
                              )}
                              <button 
                                className="btn"
                                onClick={() => setIsEditModalOpen(true)}
                                style={{ 
                                  background: 'rgba(255,255,255,0.2)',
                                  backdropFilter: 'blur(10px)',
                                  border: '1px solid rgba(255,255,255,0.3)',
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '8px'
                                }}
                              >
                                ✏️ Editar
                              </button>
                            </div>
                          </div>

                          {/* Telefone */}
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px',
                            fontSize: '1.1rem',
                            opacity: 0.95,
                            marginBottom: '16px'
                          }}>
                            <span>📞</span>
                            <span style={{ fontWeight: 500 }}>{selectedClient.phone || "Sem telefone"}</span>
                          </div>

                          {/* Tags de veículos */}
                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {selectedClient.vehicles.map((v, i) => (
                              <span 
                                key={i} 
                                style={{
                                  background: 'rgba(255,255,255,0.25)',
                                  backdropFilter: 'blur(10px)',
                                  padding: '10px 16px',
                                  borderRadius: '12px',
                                  fontSize: '0.9rem',
                                  border: '1px solid rgba(255,255,255,0.3)',
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px'
                                }}
                              >
                                <span>🚗</span>
                                {v.model}
                                {v.plate && <span style={{ opacity: 0.8, fontWeight: 400 }}>• {v.plate}</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* 📝 NOTAS DO CLIENTE */}
                      {selectedClient.notes && (
                        <div style={{ 
                          marginBottom: '24px',
                          padding: '20px',
                          background: 'rgba(130, 87, 230, 0.08)',
                          border: '2px solid rgba(130, 87, 230, 0.2)',
                          borderRadius: 'var(--radius-card)',
                          borderLeft: '4px solid var(--primary)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '1.2rem' }}>📝</span>
                            <strong style={{ color: 'var(--primary)' }}>Notas Importantes</strong>
                          </div>
                          <p style={{ margin: 0, lineHeight: 1.6 }}>{selectedClient.notes}</p>
                        </div>
                      )}

                      {/* 📊 CARDS DE ESTATÍSTICAS ESTILIZADOS */}
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                        gap: '20px',
                        marginBottom: '32px'
                      }}>
                        {/* Total Investido */}
                        <div className="stat-card" style={{
                          background: 'linear-gradient(135deg, rgba(4, 211, 97, 0.1) 0%, rgba(4, 211, 97, 0.05) 100%)',
                          borderLeft: '4px solid var(--success)',
                          padding: '24px',
                          borderRadius: 'var(--radius-card)',
                          border: '1px solid rgba(4, 211, 97, 0.2)'
                        }}>
                          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 700 }}>
                            💰 Total Investido
                          </div>
                          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success)' }}>
                            {formatMoney(clientHistory.reduce((a, o) => a + (o.status==='FINALIZADO'?o.total:0), 0))}
                          </div>
                        </div>

                        {/* Em aberto (contas a receber) */}
                        {selectedDebt && (
                          <div className="stat-card" style={{ padding: '24px', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 700 }}>
                              Em aberto
                            </div>
                            <div style={{ fontSize: '2rem', fontWeight: 800 }}>{formatMoney(selectedDebt.emAberto)}</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                              {selectedDebt.countAberto} {selectedDebt.countAberto === 1 ? 'lançamento' : 'lançamentos'}
                            </div>
                            {selectedDebt.atrasado > 0 && (
                              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--danger)', marginTop: '6px' }}>
                                Atrasado {formatMoney(selectedDebt.atrasado)} ({selectedDebt.countAtrasado})
                              </div>
                            )}
                          </div>
                        )}

                        {/* Serviços Realizados */}
                        <div className="stat-card" style={{
                          background: 'linear-gradient(135deg, rgba(130, 87, 230, 0.1) 0%, rgba(130, 87, 230, 0.05) 100%)',
                          borderLeft: '4px solid var(--primary)',
                          padding: '24px',
                          borderRadius: 'var(--radius-card)',
                          border: '1px solid rgba(130, 87, 230, 0.2)'
                        }}>
                          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 700 }}>
                            🔧 Serviços
                          </div>
                          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)' }}>
                            {clientHistory.length}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {clientHistory.filter(o => o.status === 'FINALIZADO').length} finalizados
                          </div>
                        </div>
                      </div>

                      {/* ⚠️ ALERTAS DE MANUTENÇÃO */}
                      {reminders.length > 0 && (
                        <div style={{ marginBottom: '32px' }}>
                          <h3 style={{ 
                            fontSize: '0.9rem', 
                            marginBottom: '12px', 
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            fontWeight: 700
                          }}>
                            ⚠️ ALERTAS DE MANUTENÇÃO
                          </h3>
                          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            {reminders.map((r, i) => (
                              <div 
                                key={i} 
                                className={`reminder-badge ${r.type}`}
                                style={{
                                  padding: '12px 20px',
                                  borderRadius: '12px',
                                  fontSize: '0.9rem',
                                  fontWeight: 600,
                                  border: '2px solid',
                                  borderColor: r.type === 'danger' ? 'var(--danger)' : 'var(--warning)',
                                  background: r.type === 'danger' ? 'rgba(247, 90, 104, 0.1)' : 'rgba(251, 169, 76, 0.1)',
                                  color: r.type === 'danger' ? 'var(--danger)' : 'var(--warning)'
                                }}
                              >
                                {r.type === 'danger' ? '🔴' : '🟡'} {r.text}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 📜 HISTÓRICO DO CLIENTE */}
                      <div style={{
                        background: 'var(--bg-panel)',
                        borderRadius: 'var(--radius-card)',
                        border: '1px solid var(--border)',
                        padding: '24px'
                      }}>
                        <h3 style={{ 
                          fontSize: '1.1rem', 
                          marginBottom: '24px', 
                          borderBottom: '2px solid var(--border)', 
                          paddingBottom: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          fontWeight: 700
                        }}>
                          <span style={{ fontSize: '1.3rem' }}>📜</span>
                          Histórico do Cliente
                        </h3>
                        
                        <div className="timeline-container">
                          {clientHistory.length === 0 ? (
                            <div style={{
                              textAlign: 'center',
                              padding: '60px 20px',
                              color: 'var(--text-muted)'
                            }}>
                              <div style={{ fontSize: '4rem', marginBottom: '16px', opacity: 0.3 }}>📋</div>
                              <p style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '8px' }}>
                                Nenhum serviço registrado
                              </p>
                              <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>
                                O histórico aparecerá aqui quando houver ordens de serviço
                              </p>
                            </div>
                          ) : (
                            clientHistory.map(os => {
                               const dateObj = formatDate(os.createdAt);
                               return (
                                   <div 
                                     key={os.id} 
                                     className="timeline-item"
                                     onClick={() => onOpenOS?.(os)}
                                     style={{ 
                                       cursor: onOpenOS ? 'pointer' : 'default',
                                       transition: 'all 0.2s ease',
                                       marginBottom: '16px'
                                     }}
                                     onMouseEnter={(e) => {
                                       if (onOpenOS) {
                                         e.currentTarget.style.transform = 'translateX(4px)';
                                         const card = e.currentTarget.querySelector('.timeline-content-card') as HTMLElement;
                                         if (card) card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                                       }
                                     }}
                                     onMouseLeave={(e) => {
                                       e.currentTarget.style.transform = 'translateX(0)';
                                       const card = e.currentTarget.querySelector('.timeline-content-card') as HTMLElement;
                                       if (card) card.style.boxShadow = 'none';
                                     }}
                                   >
                                       {/* Coluna 1: Data */}
                                       <div className="timeline-date-col">
                                           <span className="tl-day">{dateObj.day}</span>
                                           <span className="tl-month">{dateObj.month}</span>
                                           <span className="tl-year">{dateObj.year}</span>
                                       </div>

                                       {/* Coluna 2: Linha */}
                                       <div className="timeline-marker-col">
                                           <div className={`tl-dot st-${os.status}`}></div>
                                           <div className="tl-line"></div>
                                       </div>

                                       {/* Coluna 3: Card */}
                                       <div className="timeline-content-card">
                                           <div className="tl-card-header">
                                               <span className="tl-vehicle">{os.vehicle}</span>
                                               <span className={`status-badge st-${os.status}`} style={{fontSize: '0.65rem', padding: '2px 8px'}}>{STATUS_LABELS[os.status]}</span>
                                           </div>
                                           <div className="tl-card-body">{getWorkSummary(os)}</div>
                                           <div className="tl-card-footer">
                                               <span className="tl-os-number">OS #{os.osNumber}</span>
                                               <span className="tl-price">{formatMoney(os.total)}</span>
                                           </div>
                                           
                                           {/* 🆕 DATA DE PAGAMENTO */}
                                           {os.paymentDate && (
                                             <div style={{
                                               marginTop: '8px',
                                               padding: '6px 10px',
                                               background: 'rgba(4, 211, 97, 0.1)',
                                               border: '1px solid rgba(4, 211, 97, 0.3)',
                                               borderRadius: '6px',
                                               fontSize: '0.75rem',
                                               color: 'var(--success)',
                                               fontWeight: 600,
                                               display: 'flex',
                                               alignItems: 'center',
                                               gap: '6px'
                                             }}>
                                               📅 Pago em: {new Date(os.paymentDate).toLocaleDateString('pt-BR')}
                                             </div>
                                           )}
                                           
                                           {onOpenOS && (
                                             <div style={{ 
                                               fontSize: '0.7rem', 
                                               color: 'var(--text-muted)', 
                                               marginTop: '4px',
                                               fontStyle: 'italic'
                                             }}>
                                               👆 Clique para abrir OS
                                             </div>
                                           )}
                                       </div>
                                   </div>
                               );
                            })
                          )}
                        </div>
                      </div>
                  </>
              ) : (
                  <div style={{
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    height: '100%', 
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                    padding: '40px'
                  }}>
                      <div style={{ 
                        fontSize: '5rem', 
                        marginBottom: '24px',
                        opacity: 0.3,
                        animation: 'float 3s ease-in-out infinite'
                      }}>
                        👥
                      </div>
                      <h3 style={{ 
                        fontSize: '1.5rem', 
                        fontWeight: 700, 
                        marginBottom: '12px',
                        color: 'var(--text-main)'
                      }}>
                        Selecione um Cliente
                      </h3>
                      <p style={{ fontSize: '1rem', opacity: 0.7, maxWidth: '400px' }}>
                        Escolha um cliente na lista ao lado para visualizar o histórico completo de serviços e informações detalhadas
                      </p>
                  </div>
              )}
          </div>
      </div>

      {/* Modal de Edição */}
      {isEditModalOpen && selectedClient && (
        <ClientEditModal
          isOpen={isEditModalOpen}
          client={selectedClient}
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleSaveClient}
          workOrders={workOrders}
        />
      )}

      {/* Animação flutuante para o ícone */}
    </>
  );
};