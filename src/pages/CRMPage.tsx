import React, { useState, useMemo } from 'react';
import { Client, WorkOrder, STATUS_LABELS } from '../types';
import { CRMDashboard } from '../components/CRMDashboard';
import { ClientEditModal } from '../modals/ClientEditModal';

interface CRMPageProps {
  clients: Client[];
  workOrders: WorkOrder[];
  isLoading: boolean;
  formatMoney: (val: number) => string;
  onSaveClient?: (client: Client) => void; // ✅ Para salvar edições
  onOpenOS?: (os: WorkOrder) => void; // ✅ Para abrir OS do histórico
}

export const CRMPage: React.FC<CRMPageProps> = ({ 
  clients, 
  workOrders, 
  isLoading, 
  formatMoney,
  onSaveClient,
  onOpenOS 
}) => {
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showDashboard, setShowDashboard] = useState(true);
  const [searchTerm, setSearchTerm] = useState(''); // ✅ NOVO: Busca
  const [isEditModalOpen, setIsEditModalOpen] = useState(false); // ✅ NOVO: Modal de edição

  // ✅ NOVO: Filtrar clientes por busca
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

  // Histórico ordenado
  const clientHistory = useMemo(() => {
    if (!selectedClient) return [];
    return workOrders
      .filter(os => os.clientName === selectedClient.name)
      .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [selectedClient, workOrders]);

  // Lembretes
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

  // ✅ CORRIGIDO: Abrir WhatsApp com logs detalhados
  const openWhatsApp = (phone: string, clientName: string) => {
    console.log('📱 ===== ABERTURA WHATSAPP =====');
    console.log('Telefone original:', phone);
    console.log('Nome do cliente:', clientName);
    
    // Remove TUDO que não é número
    let cleanPhone = phone.replace(/\D/g, '');
    console.log('Telefone limpo (só números):', cleanPhone);
    
    // Remove +55 se já estiver no início
    if (cleanPhone.startsWith('55')) {
      cleanPhone = cleanPhone.substring(2);
      console.log('Removeu 55 do início:', cleanPhone);
    }
    
    // Valida se tem pelo menos 10 dígitos (DDD + número)
    if (cleanPhone.length < 10) {
      alert(`Telefone inválido: ${phone}\n\nPrecisa ter pelo menos 10 dígitos (DDD + número)`);
      console.error('❌ Telefone muito curto:', cleanPhone);
      return;
    }
    
    // Formata a mensagem
    const message = encodeURIComponent(
      `Olá ${clientName}, tudo bem?\n\nEstamos entrando em contato da oficina sobre o seu veículo.`
    );
    
    // Monta a URL final
    const whatsappUrl = `https://wa.me/55${cleanPhone}?text=${message}`;
    console.log('URL final:', whatsappUrl);
    console.log('Telefone com código do país: +55' + cleanPhone);
    console.log('✅ Abrindo WhatsApp...');
    
    // Abre em nova aba
    window.open(whatsappUrl, '_blank');
  };

  // ✅ NOVO: Salvar edição do cliente
  const handleSaveClient = (updatedClient: Client) => {
    if (onSaveClient) {
      onSaveClient(updatedClient);
      setSelectedClient(updatedClient); // Atualiza o cliente selecionado
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
          {showDashboard ? '💁 Ocultar Dashboard' : '📊 Mostrar Dashboard'}
        </button>
      </div>

      {/* DASHBOARD CRM */}
      {showDashboard && (
        <div style={{ marginBottom: '24px' }}>
          <CRMDashboard
            clients={clients}
            workOrders={workOrders}
            onClientSelect={(client) => {
              setSelectedClient(client);
              setShowDashboard(false);
            }}
          />
        </div>
      )}
      
      <div className="crm-layout">
          {/* LISTA DE CLIENTES */}
          <div className="client-list">
              {/* ✅ NOVO: Campo de Busca */}
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

              {/* Lista de Clientes Filtrados */}
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
                    </div>
                  ))
              )}
              {!isLoading && filteredClients.length === 0 && (
                <div style={{padding:20, color:'var(--text-muted)', textAlign: 'center'}}>
                  {searchTerm ? `Nenhum cliente encontrado para "${searchTerm}"` : 'Sem clientes.'}
                </div>
              )}
          </div>

          {/* DETALHES */}
          <div className="crm-details">
              {selectedClient ? (
                  <>
                      <div className="crm-header">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <h2 style={{margin:0, fontSize: '1.8rem'}}>{selectedClient.name}</h2>
                              <div style={{color: 'var(--text-muted)', marginTop: 5}}>
                                📞 {selectedClient.phone || "Sem telefone"}
                              </div>
                            </div>
                            
                            {/* ✅ NOVO: Botões de Ação */}
                            <div style={{ display: 'flex', gap: '8px' }}>
                              {selectedClient.phone && (
                                <button 
                                  className="btn btn-success"
                                  onClick={() => openWhatsApp(selectedClient.phone!, selectedClient.name)}
                                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                  <span style={{ fontSize: '1.2rem' }}>💬</span>
                                  WhatsApp
                                </button>
                              )}
                              <button 
                                className="btn btn-primary"
                                onClick={() => setIsEditModalOpen(true)}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                              >
                                ✏️ Editar
                              </button>
                            </div>
                          </div>
                          
                          <div className="crm-tags" style={{marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap'}}>
                              {selectedClient.vehicles.map((v, i) => (
                                  <span key={i} style={{background: 'var(--bg-input)', padding: '6px 12px', borderRadius: 12, fontSize: '0.8rem', border: '1px solid var(--border)'}}>
                                      🚗 {v.model} <span style={{opacity: 0.6}}>{v.plate}</span>
                                  </span>
                              ))}
                          </div>
                          
                          {/* Notas do Cliente */}
                          {selectedClient.notes && (
                            <div style={{ 
                              marginTop: 16, 
                              padding: '12px', 
                              background: 'rgba(130, 87, 230, 0.1)', 
                              border: '1px solid rgba(130, 87, 230, 0.3)',
                              borderRadius: '8px',
                              fontSize: '0.9rem'
                            }}>
                              📝 <strong>Notas:</strong> {selectedClient.notes}
                            </div>
                          )}
                      </div>

                      <div className="crm-stats">
                          <div className="crm-stat-box">
                              <div className="crm-stat-label">Total Investido</div>
                              <div className="crm-stat-value" style={{color: 'var(--success)'}}>{formatMoney(clientHistory.reduce((a, o) => a + (o.status==='FINALIZADO'?o.total:0), 0))}</div>
                          </div>
                          <div className="crm-stat-box">
                              <div className="crm-stat-label">Serviços</div>
                              <div className="crm-stat-value">{clientHistory.length}</div>
                          </div>
                      </div>

                      {reminders.length > 0 && (
                          <div style={{marginBottom: 30}}>
                              <h3 style={{fontSize: '0.9rem', marginBottom: 10, color: 'var(--text-muted)'}}>ALERTA DE MANUTENÇÃO</h3>
                              <div style={{display:'flex', gap: 10, flexWrap: 'wrap'}}>
                                  {reminders.map((r,i)=><div key={i} className={`reminder-badge ${r.type}`}>{r.text}</div>)}
                              </div>
                          </div>
                      )}

                      <h3 style={{fontSize: '1.1rem', marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 10}}>Histórico do Cliente</h3>
                      
                      <div className="timeline-container">
                        {clientHistory.length === 0 ? (
                            <p style={{color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: 20}}>Nenhum serviço encontrado.</p>
                        ) : (
                            clientHistory.map(os => {
                               const dateObj = formatDate(os.createdAt);
                               return (
                                   <div 
                                     key={os.id} 
                                     className="timeline-item"
                                     onClick={() => onOpenOS?.(os)} // ✅ NOVO: Clicável!
                                     style={{ 
                                       cursor: onOpenOS ? 'pointer' : 'default',
                                       transition: 'all 0.2s ease'
                                     }}
                                     onMouseEnter={(e) => {
                                       if (onOpenOS) {
                                         e.currentTarget.style.transform = 'translateX(4px)';
                                         e.currentTarget.querySelector('.timeline-content-card').style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                                       }
                                     }}
                                     onMouseLeave={(e) => {
                                       e.currentTarget.style.transform = 'translateX(0)';
                                       e.currentTarget.querySelector('.timeline-content-card').style.boxShadow = 'none';
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
                                           {/* ✅ NOVO: Hint de clique */}
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
                  </>
              ) : (
                  <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--text-muted)', opacity: 0.6}}>
                      <div style={{fontSize: '4rem', marginBottom: 20}}>📁</div>
                      <p>Selecione um cliente para ver o histórico.</p>
                  </div>
              )}
          </div>
      </div>

      {/* ✅ NOVO: Modal de Edição */}
      {isEditModalOpen && selectedClient && (
        <ClientEditModal
          isOpen={isEditModalOpen}
          client={selectedClient}
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleSaveClient}
        />
      )}
    </>
  );
};