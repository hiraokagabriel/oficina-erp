import React, { useState, useMemo, useEffect, useId } from 'react';
import { Client, WorkOrder, CatalogItem, Technician, PART_CATEGORY_META } from '../types';
import { generateId } from '../utils/helpers';
import { PartCategorySelect } from '../components/PartCategorySelect';
import { VehicleCombobox, useShopVehicles } from '../components/VehicleCombobox';
import { MoneyField } from '../components/MoneyField';
import { Icon, IconName } from '../components/ui/Icon';
import { normalizeItemCost } from '../services/marginView';
import {
  countClientOrders, countTechnicianOrders, deleteCatalogMessage, deleteClientMessage, deleteTechnicianMessage,
} from '../services/clientListView';
import { useDirtyGuard } from '../hooks/useDirtyGuard';
import { ConfirmationModal } from './ConfirmationModal';

interface DatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: Client[];
  catalogParts: CatalogItem[];
  catalogServices: CatalogItem[];
  catalogTechnicians: Technician[];
  onSaveClient: (client: Client) => void;
  onDeleteClient: (id: string) => void;
  onSaveCatalogItem: (item: CatalogItem, type: 'part' | 'service') => void;
  onDeleteCatalogItem: (id: string, type: 'part' | 'service') => void;
  onSaveTechnician: (technician: Technician) => void;
  onDeleteTechnician: (id: string) => void;
  formatMoney: (val: number) => string;
  /** Histórico de OS para sugerir veículos já atendidos na oficina. */
  workOrders?: WorkOrder[];
}

type Tab = 'CLIENTS' | 'PARTS' | 'SERVICES' | 'TECHNICIANS';

// Linha da listagem: carrega o tipo do item para o JSX poder estreitar sem cast.
type DbRow =
  | { kind: 'CLIENT'; item: Client }
  | { kind: 'PART' | 'SERVICE'; item: CatalogItem }
  | { kind: 'TECHNICIAN'; item: Technician };

const TABS: { id: Tab; label: string; icon: IconName; newLabel: string }[] = [
  { id: 'CLIENTS', label: 'Clientes', icon: 'clientes', newLabel: 'Novo cliente' },
  { id: 'PARTS', label: 'Peças', icon: 'pecas', newLabel: 'Nova peça' },
  { id: 'SERVICES', label: 'Serviços', icon: 'oficina', newLabel: 'Novo serviço' },
  { id: 'TECHNICIANS', label: 'Técnicos', icon: 'chave', newLabel: 'Novo técnico' },
];

const LIST_LIMIT = 50;

/** Pedido de exclusão aguardando confirmação (o que acontece ao confirmar não muda). */
interface PendingDelete {
  title: string;
  message: string;
  run: () => void;
}

export const DatabaseModal: React.FC<DatabaseModalProps> = ({
  isOpen, onClose, clients, catalogParts, catalogServices, catalogTechnicians,
  onSaveClient, onDeleteClient, onSaveCatalogItem, onDeleteCatalogItem,
  onSaveTechnician, onDeleteTechnician, formatMoney, workOrders
}) => {
  const uid = useId();
  const shopVehicles = useShopVehicles(clients, workOrders);
  const [activeTab, setActiveTab] = useState<Tab>('CLIENTS');
  const [searchTerm, setSearchTerm] = useState('');

  // Estados de Edição
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [editingTechnician, setEditingTechnician] = useState<Technician | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  // Campos de dinheiro do editor de item: texto inválido bloqueia o Salvar (o valor gravado nunca vira NaN).
  const [invalidMoney, setInvalidMoney] = useState<Record<string, boolean>>({});
  const [triedSaveItem, setTriedSaveItem] = useState(false);

  // Esc, Cancelar e fechar: os editores (cliente, item, técnico) perguntam antes de descartar; a listagem fecha
  // direto (o campo de busca não conta como alteração). Salvar fecha o editor sem perguntar.
  const view = editingClient ? 'client' : editingItem ? 'item' : editingTechnician ? 'technician' : 'list';
  const guard = useDirtyGuard({
    active: isOpen,
    resetKey: view,
    trackInputs: view !== 'list',
    onClose: () => {
      if (editingClient) setEditingClient(null);
      else if (editingItem) setEditingItem(null);
      else if (editingTechnician) setEditingTechnician(null);
      else onClose();
    },
  });

  // Esc com a pergunta de exclusão aberta fecha só a pergunta (o guard ignora evento já tratado).
  useEffect(() => {
    if (!pendingDelete) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setPendingDelete(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pendingDelete]);

  useEffect(() => { setTriedSaveItem(false); setInvalidMoney({}); }, [editingItem?.id]);

  // --- FILTROS & PERFORMANCE ---
  const { filteredList, totalMatches } = useMemo(() => {
    const term = searchTerm.toLowerCase();
    let rows: DbRow[];

    if (activeTab === 'CLIENTS') rows = clients.map((item): DbRow => ({ kind: 'CLIENT', item }));
    else if (activeTab === 'PARTS') rows = catalogParts.map((item): DbRow => ({ kind: 'PART', item }));
    else if (activeTab === 'SERVICES') rows = catalogServices.map((item): DbRow => ({ kind: 'SERVICE', item }));
    else rows = catalogTechnicians.map((item): DbRow => ({ kind: 'TECHNICIAN', item }));

    const matches = rows.filter((row) => {
        if (row.kind === 'CLIENT') {
            return row.item.name.toLowerCase().includes(term) || row.item.phone.includes(term);
        }
        if (row.kind === 'TECHNICIAN') {
            return row.item.name.toLowerCase().includes(term);
        }
        return row.item.description.toLowerCase().includes(term);
    });
    // Limita a 50 itens para performance máxima
    return { filteredList: matches.slice(0, LIST_LIMIT), totalMatches: matches.length };
  }, [activeTab, searchTerm, clients, catalogParts, catalogServices, catalogTechnicians]);

  // --- HANDLERS CLIENTES ---
  const handleAddVehicle = () => {
      if (!editingClient) return;
      guard.markDirty();
      setEditingClient({
          ...editingClient,
          vehicles: [...editingClient.vehicles, { id: generateId(), model: '', plate: '' }]
      });
  };

  const handleRemoveVehicle = (index: number) => {
      if (!editingClient) return;
      guard.markDirty();
      const newVehicles = [...editingClient.vehicles];
      newVehicles.splice(index, 1);
      setEditingClient({ ...editingClient, vehicles: newVehicles });
  };

  const handleVehicleChange = (index: number, field: 'model' | 'plate', value: string) => {
      if (!editingClient) return;
      guard.markDirty();
      const newVehicles = [...editingClient.vehicles];
      // Só a placa vai em maiúsculas; o modelo mantém a grafia sugerida (ex.: Honda Civic 2.0 16v 2015).
      newVehicles[index] = { ...newVehicles[index], [field]: field === 'plate' ? value.toUpperCase() : value };
      setEditingClient({ ...editingClient, vehicles: newVehicles });
  };

  const askDelete = (row: DbRow) => {
      if (row.kind === 'CLIENT') {
          const n = countClientOrders(workOrders ?? [], row.item, clients);
          setPendingDelete({ title: 'Excluir cliente?', message: deleteClientMessage(row.item.name, n), run: () => onDeleteClient(row.item.id) });
      } else if (row.kind === 'TECHNICIAN') {
          const n = countTechnicianOrders(workOrders ?? [], row.item);
          setPendingDelete({ title: 'Excluir técnico?', message: deleteTechnicianMessage(row.item.name, n), run: () => onDeleteTechnician(row.item.id) });
      } else {
          const type = row.kind === 'PART' ? 'part' : 'service';
          setPendingDelete({
              title: row.kind === 'PART' ? 'Excluir peça?' : 'Excluir serviço?',
              message: deleteCatalogMessage(row.kind === 'PART' ? 'peça' : 'serviço', row.item.description),
              run: () => onDeleteCatalogItem(row.item.id, type),
          });
      }
  };

  // --- RENDERIZADORES ---

  // 1. EDITOR DE CLIENTE
  if (editingClient) {
      const isNewClient = !clients.some(c => c.id === editingClient.id);
      return (
        <>
        <div className="modal-overlay" ref={guard.overlayRef}>
          <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`} style={{ maxWidth: '600px' }}>
            <h2 id={`${uid}-title`} className="modal-title">{isNewClient ? 'Novo cliente' : 'Editar cliente'}</h2>

            <div className="form-group">
                <label className="form-label" htmlFor={`${uid}-name`}>Nome completo</label>
                <input id={`${uid}-name`} className="form-input" value={editingClient.name} onChange={e => setEditingClient({...editingClient, name: e.target.value})} />
            </div>
            <div className="form-group">
                <label className="form-label" htmlFor={`${uid}-phone`}>Telefone / contato</label>
                <input id={`${uid}-phone`} className="form-input" value={editingClient.phone} onChange={e => setEditingClient({...editingClient, phone: e.target.value})} />
            </div>

            <div className="form-group">
                <label className="form-label" htmlFor={`${uid}-notes`}>Obs. gerais</label>
                <textarea id={`${uid}-notes`} className="form-input" value={editingClient.notes || ''} onChange={e => setEditingClient({...editingClient, notes: e.target.value})} />
            </div>

            <hr className="divider" />

            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10, gap: 8, flexWrap: 'wrap'}}>
                <h4 style={{margin:0}}>Veículos vinculados</h4>
                <button type="button" className="btn-sm" onClick={handleAddVehicle}><Icon name="adicionar" size={16} />Adicionar carro</button>
            </div>

            <div style={{maxHeight: 200, overflowY:'auto', paddingRight:5}}>
                {editingClient.vehicles.map((v, i) => (
                    <div key={i} style={{display:'flex', gap:10, marginBottom:8, alignItems: 'center'}}>
                        <div style={{flex:2, minWidth:0}}><VehicleCombobox id={`db-vehicle-${i}`} placeholder="Modelo/Cor" ariaLabel={`Modelo do veículo ${i + 1}`} value={v.model} onChange={val => handleVehicleChange(i, 'model', val)} shopVehicles={shopVehicles} /></div>
                        <input className="form-input plate" placeholder="Placa" aria-label={`Placa do veículo ${i + 1}`} value={v.plate} onChange={e => handleVehicleChange(i, 'plate', e.target.value)} style={{flex:1, minWidth: 0}} />
                        <button type="button" className="btn-sm db-del" onClick={() => handleRemoveVehicle(i)} aria-label={`Remover veículo ${i + 1}`}><Icon name="excluir" size={16} />Remover</button>
                    </div>
                ))}
            </div>

            <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={guard.requestClose}>Cancelar</button>
                <button type="button" className="btn" onClick={() => { onSaveClient(editingClient); setEditingClient(null); }}>Salvar alterações</button>
            </div>
          </div>
        </div>
        {guard.dialog}
        </>
      );
  }

  // 2. EDITOR DE ITEM (PEÇA/SERVIÇO)
  if (editingItem) {
      const anyInvalid = Object.values(invalidMoney).some(Boolean);
      const isNewItem = ![...catalogParts, ...catalogServices].some(c => c.id === editingItem.id);
      const itemTitle = activeTab === 'PARTS' ? (isNewItem ? 'Nova peça' : 'Editar peça') : (isNewItem ? 'Novo serviço' : 'Editar serviço');
      return (
        <>
        <div className="modal-overlay" ref={guard.overlayRef}>
          <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`} style={{ maxWidth: '400px' }}>
             <h2 id={`${uid}-title`} className="modal-title">{itemTitle}</h2>

             <div className="form-group">
                <label className="form-label" htmlFor={`${uid}-desc`}>Descrição</label>
                <input id={`${uid}-desc`} className="form-input" value={editingItem.description} onChange={e => setEditingItem({...editingItem, description: e.target.value})} />
             </div>

             <div className="form-group">
                <label className="form-label" htmlFor="catalog-item-price">Preço padrão (R$)</label>
                <MoneyField
                    id="catalog-item-price"
                    className="form-input"
                    kind="price"
                    value={editingItem.price}
                    placeholder="0,00"
                    showError={triedSaveItem}
                    onChange={c => { guard.markDirty(); setEditingItem(prev => prev ? { ...prev, price: c ?? 0 } : prev); }}
                    onInvalidChange={(id, inv) => setInvalidMoney(prev => prev[id] === inv ? prev : { ...prev, [id]: inv })}
                />
             </div>

             <div className="form-group">
                <label className="form-label" htmlFor="catalog-item-cost">Custo (R$) <span className="osm-opt" style={{ fontSize: '0.8rem' }}>(Opcional)</span></label>
                <MoneyField
                    id="catalog-item-cost"
                    className="form-input"
                    kind="cost"
                    value={editingItem.cost}
                    placeholder="Vazio = sem custo"
                    showError={triedSaveItem}
                    aria-describedby="catalog-item-cost-hint"
                    onChange={c => { guard.markDirty(); setEditingItem(prev => prev ? { ...prev, cost: c } : prev); }}
                    onInvalidChange={(id, inv) => setInvalidMoney(prev => prev[id] === inv ? prev : { ...prev, [id]: inv })}
                />
                <small id="catalog-item-cost-hint" style={{ color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
                    Itens sem custo ficam fora do cálculo de margem.
                </small>
             </div>

             {/* Issue #42: categoria editável diretamente no catálogo (apenas para peças) */}
             {activeTab === 'PARTS' && (
               <div className="form-group">
                 <div className="form-label">Categoria</div>
                 <PartCategorySelect
                   ariaLabel="Categoria da peça"
                   value={editingItem.category ?? ''}
                   onChange={cat => { guard.markDirty(); setEditingItem({ ...editingItem, category: cat || undefined }); }}
                   style={{ width: '100%' }}
                 />
                 {editingItem.category && (
                   <div className="db-cat db-cat--selected">
                     <span className="db-cat-dot" aria-hidden="true" style={{ background: PART_CATEGORY_META[editingItem.category].color }} />
                     {PART_CATEGORY_META[editingItem.category].label} selecionado
                   </div>
                 )}
               </div>
             )}

             <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={guard.requestClose}>Cancelar</button>
                <button type="button" className="btn" onClick={() => {
                    if (anyInvalid) { setTriedSaveItem(true); return; }
                    onSaveCatalogItem(normalizeItemCost(editingItem), activeTab === 'PARTS' ? 'part' : 'service');
                    setEditingItem(null);
                }}>Salvar</button>
            </div>
          </div>
        </div>
        {guard.dialog}
        </>
      );
  }

  // 3. EDITOR DE TÉCNICO
  if (editingTechnician) {
      const isNewTech = !catalogTechnicians.some(t => t.id === editingTechnician.id);
      return (
        <>
        <div className="modal-overlay" ref={guard.overlayRef}>
          <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`} style={{ maxWidth: '400px' }}>
             <h2 id={`${uid}-title`} className="modal-title">{isNewTech ? 'Novo técnico' : 'Editar técnico'}</h2>

             <div className="form-group">
                <label className="form-label" htmlFor={`${uid}-tech`}>Nome do técnico</label>
                <input
                    id={`${uid}-tech`}
                    className="form-input"
                    value={editingTechnician.name}
                    onChange={e => setEditingTechnician({...editingTechnician, name: e.target.value})}
                    placeholder="Ex: Carlos Silva"
                    autoFocus
                />
             </div>

             <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={guard.requestClose}>Cancelar</button>
                <button
                    type="button"
                    className="btn"
                    onClick={() => {
                        if (editingTechnician.name.trim()) {
                            onSaveTechnician(editingTechnician);
                            setEditingTechnician(null);
                        }
                    }}
                    disabled={!editingTechnician.name.trim()}
                >
                    Salvar
                </button>
            </div>
          </div>
        </div>
        {guard.dialog}
        </>
      );
  }

  // 4. TELA PRINCIPAL (LISTAGEM)
  if (!isOpen) return null;

  const tabInfo = TABS.find(t => t.id === activeTab) ?? TABS[0];

  return (
    <>
    <div className="modal-overlay" ref={guard.overlayRef}>
      <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`} style={{ maxWidth: '900px', height: '80vh', display: 'flex', flexDirection: 'column' }}>

        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, gap: 12}}>
            <h2 id={`${uid}-title`} className="modal-title" style={{margin:0}}>Gerenciador de cadastros</h2>
            <button type="button" className="btn btn-secondary" onClick={guard.requestClose}>
                <Icon name="fechar" size={18} />
                Fechar
            </button>
        </div>

        {/* ABAS */}
        <div role="group" aria-label="Tipo de cadastro" style={{display:'flex', gap:10, marginBottom:15, borderBottom:'1px solid var(--border)', paddingBottom:10, flexWrap:'wrap'}}>
            {TABS.map(t => (
                <button
                    key={t.id}
                    type="button"
                    className={`btn ${activeTab === t.id ? '' : 'btn-ghost'}`}
                    aria-pressed={activeTab === t.id}
                    onClick={() => setActiveTab(t.id)}
                >
                    <Icon name={t.icon} size={18} />
                    {t.label}
                </button>
            ))}
        </div>

        {/* BUSCA E NOVO */}
        <div style={{display:'flex', gap:10, marginBottom:15, flexWrap: 'wrap'}}>
            <input
                className="form-input search-input"
                placeholder="Pesquisar..."
                aria-label={`Pesquisar em ${tabInfo.label.toLowerCase()}`}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                autoFocus
                style={{ flex: '1 1 200px', minWidth: 0 }}
            />
            <button type="button" className="btn" onClick={() => {
                if (activeTab === 'CLIENTS') {
                    setEditingClient({ id: crypto.randomUUID(), name: '', phone: '', vehicles: [], notes: '' });
                } else if (activeTab === 'TECHNICIANS') {
                    setEditingTechnician({ id: crypto.randomUUID(), name: '' });
                } else {
                    setEditingItem({ id: crypto.randomUUID(), description: '', price: 0 });
                }
            }}>
                <Icon name="adicionar" />
                {tabInfo.newLabel}
            </button>
        </div>

        {/* LISTA (COM SCROLL) */}
        <div className="items-list-scroll" style={{flex:1, overflowY:'auto', border:'1px solid var(--border)', borderRadius:8}}>
            <table className="data-table">
                <thead>
                    <tr>
                        <th style={{textAlign:'left'}}>
                            {activeTab === 'CLIENTS' ? 'Nome / Veículos' :
                             activeTab === 'TECHNICIANS' ? 'Nome do técnico' :
                             'Descrição'}
                        </th>
                        <th style={{textAlign:'right', width:150}}>
                            {activeTab === 'CLIENTS' ? 'Contato' :
                             activeTab === 'TECHNICIANS' ? '' :
                             'Preço'}
                        </th>
                        <th style={{textAlign:'center', width:210}}>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredList.map((row) => {
                        const rowName = row.kind === 'CLIENT' || row.kind === 'TECHNICIAN' ? row.item.name : row.item.description;
                        return (
                        <tr key={row.item.id}>
                            <td>
                                {row.kind === 'CLIENT' ? (
                                    <div>
                                        <strong>{row.item.name}</strong>
                                        <div style={{fontSize:'0.8rem', color:'var(--text-muted)'}}>
                                            {row.item.vehicles.length > 0
                                                ? row.item.vehicles.map((v) => v.model).join(', ')
                                                : 'Sem veículos'}
                                        </div>
                                    </div>
                                ) : row.kind === 'TECHNICIAN' ? (
                                    <div>
                                        <strong>{row.item.name}</strong>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span>{row.item.description}</span>
                                        {/* Issue #42: badge de categoria na listagem de peças */}
                                        {row.kind === 'PART' && row.item.category && (
                                          <span className="db-cat">
                                            <span className="db-cat-dot" aria-hidden="true" style={{ background: PART_CATEGORY_META[row.item.category].color }} />
                                            {PART_CATEGORY_META[row.item.category].label}
                                          </span>
                                        )}
                                    </div>
                                )}
                            </td>
                            <td style={{textAlign:'right'}}>
                                {row.kind === 'CLIENT' ? row.item.phone :
                                 row.kind === 'TECHNICIAN' ? '' :
                                 <>
                                    {formatMoney(row.item.price)}
                                    <div style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>
                                        {typeof row.item.cost === 'number' && row.item.cost > 0 ? `Custo ${formatMoney(row.item.cost)}` : 'sem custo'}
                                    </div>
                                 </>}
                            </td>
                            <td style={{textAlign:'center'}}>
                                <div className="db-actions">
                                    <button
                                        type="button"
                                        className="btn-sm"
                                        aria-label={`Editar ${rowName}`}
                                        onClick={() => {
                                            if (row.kind === 'CLIENT') setEditingClient({...row.item});
                                            else if (row.kind === 'TECHNICIAN') setEditingTechnician({...row.item});
                                            else setEditingItem(normalizeItemCost({ ...row.item }));
                                        }}
                                    ><Icon name="editar" size={16} />Editar</button>
                                    <button
                                        type="button"
                                        className="btn-sm db-del"
                                        aria-label={`Excluir ${rowName}`}
                                        onClick={() => askDelete(row)}
                                    ><Icon name="excluir" size={16} />Excluir</button>
                                </div>
                            </td>
                        </tr>
                        );
                    })}
                    {filteredList.length === 0 && (
                        <tr><td colSpan={3} style={{textAlign:'center', padding:20, color:'var(--text-muted)'}}>Nenhum registro encontrado.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
        {totalMatches > filteredList.length && (
            <p className="db-limit" role="status">Mostrando {filteredList.length} de {totalMatches}. Use a busca para achar os outros.</p>
        )}

      </div>
    </div>
    {guard.dialog}
    <ConfirmationModal
      isOpen={pendingDelete !== null}
      onClose={() => setPendingDelete(null)}
      onConfirm={() => pendingDelete?.run()}
      title={pendingDelete?.title ?? ''}
      message={pendingDelete?.message ?? ''}
      confirmText="Excluir"
      cancelText="Manter"
      confirmColor="danger"
    />
    </>
  );
};
