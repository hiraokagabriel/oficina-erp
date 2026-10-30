import React, { useState, useMemo, useCallback, useId } from 'react';
import { Client, WorkOrder, LedgerEntry, STATUS_LABELS } from '../types';
import { osBelongsToClient } from '../utils/links';
import { getClientReceivables, ClientReceivable } from '../services/receivables';
import { clientCountLabel, clientSummaryLine, filterClients } from '../services/clientListView';
import { PAGE_STEP, nextBatchSize, nextVisible, pageCounterLabel, pageSlice } from '../services/pagination';
import { CRMDashboard } from '../components/CRMDashboard';
import { Icon } from '../components/ui/Icon';
import { ClientEditModal } from '../modals/ClientEditModal';
import { ClientPhotos } from '../components/ClientPhotos';
import { useDatabase } from '../context/DatabaseContext';

// Declaração global do Tauri
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

interface ClientRowProps {
  client: Client;
  selected: boolean;
  debt: ClientReceivable | undefined;
  formatMoney: (val: number) => string;
  onSelect: (client: Client) => void;
}

/** Linha da lista: botão de verdade (Tab + Enter). Memoizada para a lista longa não redesenhar a cada tecla. */
const ClientRow = React.memo(({ client, selected, debt, formatMoney, onSelect }: ClientRowProps) => {
  const s = clientSummaryLine(client);
  return (
    <li>
      <button
        type="button"
        className={`client-list-item${selected ? ' active' : ''}`}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(client)}
      >
        <span className="client-name">{client.name || 'Sem nome'}</span>
        <span className="client-contact">{s.phone}</span>
        <span className="client-contact">{s.vehicle}</span>
        {debt && (
          <span className="client-debt">
            Em aberto {formatMoney(debt.emAberto)}
            {debt.atrasado > 0 && <span className="late">Atrasado {formatMoney(debt.atrasado)}</span>}
          </span>
        )}
      </button>
    </li>
  );
});
ClientRow.displayName = 'ClientRow';

type Reminder = { type: 'danger' | 'warning'; text: string };

export const CRMPage: React.FC<CRMPageProps> = ({
  clients,
  workOrders,
  ledger,
  isLoading,
  formatMoney,
  onSaveClient,
  onOpenOS
}) => {
  const searchId = useId();
  const { dbPath } = useDatabase();
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [visible, setVisible] = useState(PAGE_STEP);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  /** Cliente novo ainda não salvo (mesmo formato do "+ Novo" do Gerenciador). */
  const [newClientDraft, setNewClientDraft] = useState<Client | null>(null);

  // Dívida por cliente, ligada pelo id resolvido da OS (chave de byClient = id do cliente).
  const receivables = useMemo(() => getClientReceivables(workOrders, ledger, new Date(), clients), [workOrders, ledger, clients]);
  const selectedDebt = selectedClient ? receivables.byClient.get(selectedClient.id) : undefined;

  const filteredClients = useMemo(() => filterClients(clients, searchTerm), [clients, searchTerm]);
  const shownClients = useMemo(() => pageSlice(filteredClients, visible), [filteredClients, visible]);
  const searching = searchTerm.trim() !== '';

  const clientHistory = useMemo(() => {
    if (!selectedClient) return [];
    return workOrders
      .filter(os => osBelongsToClient(os, selectedClient, clients))
      .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [selectedClient, workOrders, clients]);

  const totalSpent = useMemo(
    () => clientHistory.reduce((a, o) => a + (o.status === 'FINALIZADO' ? o.total : 0), 0),
    [clientHistory],
  );

  const reminders = useMemo((): Reminder[] => {
      if (!selectedClient) return [];
      const result: Reminder[] = [];
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

  // Abre o WhatsApp (Tauri ou navegador). Só a lógica de abertura; sem registro no console.
  const openWhatsApp = async (phone: string, clientName: string) => {
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('55')) cleanPhone = cleanPhone.substring(2);

    if (cleanPhone.length < 10) {
      alert(`Telefone inválido: ${phone}\n\nPrecisa ter pelo menos 10 dígitos (DDD + número)`);
      return;
    }

    const message = encodeURIComponent(
      `Olá ${clientName}, tudo bem?\n\nEstamos entrando em contato da oficina sobre o seu veículo.`
    );
    const whatsappUrl = `https://wa.me/55${cleanPhone}?text=${message}`;

    // MÉTODO 1: Tauri
    if (window.__TAURI__?.shell?.open) {
      try {
        await window.__TAURI__.shell.open(whatsappUrl);
        return;
      } catch (error) {
        console.error('Erro ao abrir o WhatsApp pelo Tauri:', error);
      }
    }

    // MÉTODO 2: Navegador web
    const newWindow = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      try {
        const link = document.createElement('a');
        link.href = whatsappUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      } catch (error) {
        console.error('Erro ao abrir o link do WhatsApp:', error);
      }

      try {
        await navigator.clipboard.writeText(whatsappUrl);
        alert(`Não foi possível abrir o WhatsApp automaticamente.\n\nO link foi COPIADO para sua área de transferência!\n\nCole (Ctrl+V) no navegador:\n${whatsappUrl}`);
      } catch (clipboardError) {
        console.error('Erro ao copiar o link do WhatsApp:', clipboardError);
        prompt('Copie este link e cole no navegador:', whatsappUrl);
      }
    }
  };

  const handleSaveClient = (updatedClient: Client) => {
    if (onSaveClient) {
      onSaveClient(updatedClient);
      setSelectedClient(updatedClient);
    }
    setNewClientDraft(null);
    setIsEditModalOpen(false);
  };

  const closeEditModal = () => {
    setNewClientDraft(null);
    setIsEditModalOpen(false);
  };

  const startNewClient = () => {
    setNewClientDraft({ id: crypto.randomUUID(), name: '', phone: '', vehicles: [], notes: '' });
    setIsEditModalOpen(true);
  };

  const handleSelect = useCallback((c: Client) => setSelectedClient(c), []);

  const changeSearch = (value: string) => {
    setSearchTerm(value);
    setVisible(PAGE_STEP);
  };

  const modalClient = newClientDraft ?? selectedClient;

  return (
    <>
      <div className="header-area" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 className="page-title">Clientes</h1>
        <button
          type="button"
          className="btn btn-secondary"
          aria-expanded={showDashboard}
          onClick={() => setShowDashboard(!showDashboard)}
        >
          <Icon name="financeiro" />
          {showDashboard ? 'Ocultar painel' : 'Mostrar painel'}
        </button>
      </div>

      {showDashboard && (
        <div className="crm-dash-wrap">
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
              <div className="client-list-head">
                <button type="button" className="btn" onClick={startNewClient}>
                  <Icon name="adicionar" />
                  Novo cliente
                </button>
                <label htmlFor={searchId} className="client-search-label">Buscar cliente</label>
                <div className="search-wrapper" style={{ margin: 0, maxWidth: 'none' }}>
                  <span className="search-icon"><Icon name="buscar" size={18} /></span>
                  <input
                    id={searchId}
                    type="text"
                    className="form-input search-input"
                    placeholder="Nome, telefone ou placa"
                    value={searchTerm}
                    onChange={(e) => changeSearch(e.target.value)}
                    style={{ width: '100%' }}
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      className="client-search-clear"
                      onClick={() => changeSearch('')}
                      aria-label="Limpar busca"
                    >
                      <Icon name="fechar" size={18} />
                    </button>
                  )}
                </div>
                {!isLoading && clients.length > 0 && (
                  <div className="client-count" role="status" aria-live="polite">
                    {clientCountLabel(filteredClients.length, clients.length, searching)}
                  </div>
                )}
              </div>

              <div className="client-items">
                {isLoading ? (
                    Array.from({length:5}).map((_,i)=><div key={i} className="skeleton" style={{height: 60, marginBottom: 10}}/>)
                ) : (
                  <>
                    <ul className="client-ul" aria-label="Lista de clientes">
                      {shownClients.map(c => (
                        <ClientRow
                          key={c.id}
                          client={c}
                          selected={selectedClient?.id === c.id}
                          debt={receivables.byClient.get(c.id)}
                          formatMoney={formatMoney}
                          onSelect={handleSelect}
                        />
                      ))}
                    </ul>
                    {filteredClients.length > shownClients.length && (
                      <div className="client-more">
                        <div className="client-count">{pageCounterLabel(visible, filteredClients.length)}</div>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setVisible(v => nextVisible(v, filteredClients.length))}
                        >
                          Mostrar mais {nextBatchSize(visible, filteredClients.length)}
                        </button>
                      </div>
                    )}
                    {filteredClients.length === 0 && (
                      <div className="client-empty">
                        {searching ? (
                          <>
                            <p>Nenhum cliente encontrado para "{searchTerm}".</p>
                            <button type="button" className="btn btn-secondary" onClick={() => changeSearch('')}>
                              Limpar busca
                            </button>
                          </>
                        ) : (
                          <>
                            <p>Nenhum cliente cadastrado ainda.</p>
                            <button type="button" className="btn" onClick={startNewClient}>
                              <Icon name="adicionar" />
                              Novo cliente
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
          </div>

          {/* PAINEL DE DETALHES */}
          <div className="crm-details">
              {selectedClient ? (
                  <>
                      {/* CABEÇALHO DO CLIENTE */}
                      <div className="crm-head">
                        <div className="crm-head-top">
                          <div className="crm-head-id">
                            <h2 className="crm-head-name">{selectedClient.name}</h2>
                            <div className="crm-head-phone">
                              <Icon name="telefone" size={18} />
                              <span>{selectedClient.phone || 'Sem telefone'}</span>
                            </div>
                          </div>
                          <div className="crm-head-actions">
                            {selectedClient.phone && (
                              <button
                                type="button"
                                className="btn btn-success"
                                onClick={() => openWhatsApp(selectedClient.phone!, selectedClient.name)}
                              >
                                <Icon name="whatsapp" />
                                WhatsApp
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => { setNewClientDraft(null); setIsEditModalOpen(true); }}
                            >
                              <Icon name="editar" />
                              Editar
                            </button>
                          </div>
                        </div>

                        {selectedClient.vehicles.length > 0 ? (
                          <ul className="crm-head-vehicles" aria-label="Veículos do cliente">
                            {selectedClient.vehicles.map((v, i) => (
                              <li key={v.id ?? i} className="chip">
                                <span>{v.model}</span>
                                {v.plate && <span className="plate">{v.plate}</span>}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="crm-muted">Nenhum veículo cadastrado.</p>
                        )}
                      </div>

                      {/* NOTAS DO CLIENTE */}
                      {selectedClient.notes && (
                        <div className="crm-note">
                          <div className="crm-note-title">
                            <Icon name="prancheta" size={18} />
                            Notas importantes
                          </div>
                          <p>{selectedClient.notes}</p>
                        </div>
                      )}

                      {/* NÚMEROS DO CLIENTE */}
                      <div className="crm-stats">
                        <div className="crm-stat crm-stat--success">
                          <div className="crm-stat-label"><Icon name="cifrao" size={18} />Total gasto na oficina</div>
                          <div className="crm-stat-value">{formatMoney(totalSpent)}</div>
                        </div>

                        {selectedDebt && (
                          <div className="crm-stat crm-stat--warning">
                            <div className="crm-stat-label"><Icon name="receber" size={18} />Em aberto</div>
                            <div className="crm-stat-value">{formatMoney(selectedDebt.emAberto)}</div>
                            <div className="crm-stat-sub">
                              {selectedDebt.countAberto} {selectedDebt.countAberto === 1 ? 'lançamento' : 'lançamentos'}
                            </div>
                            {selectedDebt.atrasado > 0 && (
                              <div className="crm-stat-late">
                                <Icon name="alerta" size={16} />
                                Atrasado {formatMoney(selectedDebt.atrasado)} ({selectedDebt.countAtrasado})
                              </div>
                            )}
                          </div>
                        )}

                        <div className="crm-stat crm-stat--accent">
                          <div className="crm-stat-label"><Icon name="oficina" size={18} />Serviços</div>
                          <div className="crm-stat-value">{clientHistory.length}</div>
                          <div className="crm-stat-sub">
                            {clientHistory.filter(o => o.status === 'FINALIZADO').length} finalizados
                          </div>
                        </div>
                      </div>

                      {/* ALERTAS DE MANUTENÇÃO */}
                      {reminders.length > 0 && (
                        <div className="crm-reminders">
                          <h3 className="crm-section-title">Alertas de manutenção</h3>
                          <div className="crm-reminders-list">
                            {reminders.map((r, i) => (
                              <div key={i} className={`reminder-badge ${r.type}`}>
                                <Icon name="alerta" size={18} />
                                {r.text}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* FOTOS DO CLIENTE */}
                      <div className="crm-photos">
                        <h3 className="crm-history-title">
                          <Icon name="camera" size={20} />
                          Fotos
                        </h3>
                        <ClientPhotos dbPath={dbPath} clientId={selectedClient.id} clientName={selectedClient.name} workOrders={workOrders} clients={clients} onOpenOS={onOpenOS} />
                      </div>

                      {/* HISTÓRICO DO CLIENTE */}
                      <div className="crm-history">
                        <h3 className="crm-history-title">
                          <Icon name="relogio" size={20} />
                          Histórico do cliente
                        </h3>

                        <div className="timeline-container">
                          {clientHistory.length === 0 ? (
                            <div className="crm-history-empty">
                              <Icon name="prancheta" size={40} />
                              <p className="crm-history-empty-title">Nenhum serviço registrado</p>
                              <p>O histórico aparecerá aqui quando houver ordens de serviço.</p>
                            </div>
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
                                               <span className={`status-light status-light--${os.status.toLowerCase().replace(/_/g, '-')}`}>{STATUS_LABELS[os.status]}</span>
                                           </div>
                                           <div className="tl-card-body">{getWorkSummary(os)}</div>
                                           <div className="tl-card-footer">
                                               <span className="tl-os-number">OS #{os.osNumber}</span>
                                               <span className="tl-price">{formatMoney(os.total)}</span>
                                           </div>

                                           {os.paymentDate && (
                                             <div className="tl-paid">
                                               <Icon name="calendario" size={16} />
                                               Pago em: {new Date(os.paymentDate).toLocaleDateString('pt-BR')}
                                             </div>
                                           )}

                                           {onOpenOS && (
                                             <div className="tl-open">
                                               <button
                                                 type="button"
                                                 className="btn-sm"
                                                 onClick={() => onOpenOS(os)}
                                               >
                                                 <Icon name="prancheta" size={16} />
                                                 Abrir OS #{os.osNumber}
                                               </button>
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
                  <div className="crm-empty-detail">
                      <Icon name="clientes" size={48} />
                      <h3>Selecione um cliente</h3>
                      <p>Escolha um cliente na lista para ver o histórico de serviços e os dados dele.</p>
                  </div>
              )}
          </div>
      </div>

      {/* Modal de Edição / Novo cliente */}
      {isEditModalOpen && modalClient && (
        <ClientEditModal
          isOpen={isEditModalOpen}
          client={modalClient}
          isNew={newClientDraft !== null}
          onClose={closeEditModal}
          onSave={handleSaveClient}
          workOrders={workOrders}
        />
      )}
    </>
  );
};
