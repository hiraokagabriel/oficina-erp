import React, { useState, useMemo } from 'react';
import { Client, WorkOrder, STATUS_LABELS } from '../types';

interface CRMPageProps {
  clients: Client[];
  workOrders: WorkOrder[];
  isLoading: boolean;
  formatMoney: (val: number) => string;
}

export const CRMPage: React.FC<CRMPageProps> = ({ clients, workOrders, isLoading, formatMoney }) => {
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

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

  return (
    <>
      <div className="header-area"><h1 className="page-title">CRM & Clientes</h1></div>
      
      <div className="crm-layout">
          {/* LISTA DE CLIENTES */}
          <div className="client-list">
              {isLoading ? (
                  Array.from({length:5}).map((_,i)=><div key={i} className="skeleton" style={{height: 60, marginBottom: 10}}/>) 
              ) : (
                  clients.map(c => (
                    <div key={c.id} className={`client-list-item ${selectedClient?.id === c.id ? 'active' : ''}`} onClick={() => setSelectedClient(c)}>
                        <div className="client-name">{c.name}</div>
                        <div className="client-contact">{c.phone || '...'} • {c.vehicles.length} veículo(s)</div>
                    </div>
                  ))
              )}
              {!isLoading && clients.length === 0 && <div style={{padding:20, color:'var(--text-muted)'}}>Sem clientes.</div>}
          </div>

          {/* DETALHES */}
          <div className="crm-details">
              {selectedClient ? (
                  <>
                      <div className="crm-header">
                          <h2 style={{margin:0, fontSize: '1.8rem'}}>{selectedClient.name}</h2>
                          <div style={{color: 'var(--text-muted)', marginTop: 5}}>📞 {selectedClient.phone || "Sem telefone"}</div>
                          <div className="crm-tags" style={{marginTop: 12, display: 'flex', gap: 8}}>
                              {selectedClient.vehicles.map((v, i) => (
                                  <span key={i} style={{background: 'var(--bg-input)', padding: '6px 12px', borderRadius: 12, fontSize: '0.8rem', border: '1px solid var(--border)'}}>
                                      🚗 {v.model} <span style={{opacity: 0.6}}>{v.plate}</span>
                                  </span>
                              ))}
                          </div>
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
                              <div style={{display:'flex', gap: 10}}>
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
                                   <div key={os.id} className="timeline-item">
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
    </>
  );
};