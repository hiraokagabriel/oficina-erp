import React, { useState, useMemo } from 'react';
import { Client, WorkOrder, CatalogItem, Technician, PART_CATEGORY_META } from '../types';
import { Money, generateId } from '../utils/helpers';
import { PartCategorySelect } from '../components/PartCategorySelect';
import { VehicleCombobox, useShopVehicles } from '../components/VehicleCombobox';
import { normalizeItemCost, parseCostEdit } from '../services/marginView';

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

export const DatabaseModal: React.FC<DatabaseModalProps> = ({
  isOpen, onClose, clients, catalogParts, catalogServices, catalogTechnicians,
  onSaveClient, onDeleteClient, onSaveCatalogItem, onDeleteCatalogItem, 
  onSaveTechnician, onDeleteTechnician, formatMoney, workOrders
}) => {
  const shopVehicles = useShopVehicles(clients, workOrders);
  const [activeTab, setActiveTab] = useState<Tab>('CLIENTS');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados de Edição
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [editingTechnician, setEditingTechnician] = useState<Technician | null>(null);

  // --- FILTROS & PERFORMANCE ---
  const filteredList = useMemo(() => {
    const term = searchTerm.toLowerCase();
    let rows: DbRow[];

    if (activeTab === 'CLIENTS') rows = clients.map((item): DbRow => ({ kind: 'CLIENT', item }));
    else if (activeTab === 'PARTS') rows = catalogParts.map((item): DbRow => ({ kind: 'PART', item }));
    else if (activeTab === 'SERVICES') rows = catalogServices.map((item): DbRow => ({ kind: 'SERVICE', item }));
    else rows = catalogTechnicians.map((item): DbRow => ({ kind: 'TECHNICIAN', item }));

    // Filtra e limita a 50 itens para performance máxima
    return rows.filter((row) => {
        if (row.kind === 'CLIENT') {
            return row.item.name.toLowerCase().includes(term) || row.item.phone.includes(term);
        }
        if (row.kind === 'TECHNICIAN') {
            return row.item.name.toLowerCase().includes(term);
        }
        return row.item.description.toLowerCase().includes(term);
    }).slice(0, 50);
  }, [activeTab, searchTerm, clients, catalogParts, catalogServices, catalogTechnicians]);

  // --- HANDLERS CLIENTES ---
  const handleAddVehicle = () => {
      if (!editingClient) return;
      setEditingClient({
          ...editingClient,
          vehicles: [...editingClient.vehicles, { id: generateId(), model: '', plate: '' }]
      });
  };

  const handleRemoveVehicle = (index: number) => {
      if (!editingClient) return;
      const newVehicles = [...editingClient.vehicles];
      newVehicles.splice(index, 1);
      setEditingClient({ ...editingClient, vehicles: newVehicles });
  };

  const handleVehicleChange = (index: number, field: 'model' | 'plate', value: string) => {
      if (!editingClient) return;
      const newVehicles = [...editingClient.vehicles];
      // Só a placa vai em maiúsculas; o modelo mantém a grafia sugerida (ex.: Honda Civic 2.0 16v 2015).
      newVehicles[index] = { ...newVehicles[index], [field]: field === 'plate' ? value.toUpperCase() : value };
      setEditingClient({ ...editingClient, vehicles: newVehicles });
  };

  // --- RENDERIZADORES ---
  
  // 1. EDITOR DE CLIENTE
  if (editingClient) {
      return (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <h2 className="modal-title">Editar Cliente</h2>
            
            <div className="form-group">
                <label className="form-label">Nome Completo</label>
                <input className="form-input" value={editingClient.name} onChange={e => setEditingClient({...editingClient, name: e.target.value})} />
            </div>
            <div className="form-group">
                <label className="form-label">Telefone / Contato</label>
                <input className="form-input" value={editingClient.phone} onChange={e => setEditingClient({...editingClient, phone: e.target.value})} />
            </div>
            
            <div className="form-group">
                <label className="form-label">Obs. Gerais</label>
                <textarea className="form-input" value={editingClient.notes || ''} onChange={e => setEditingClient({...editingClient, notes: e.target.value})} />
            </div>

            <hr className="divider" />
            
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                <h4 style={{margin:0}}>Veículos Vinculados</h4>
                <button className="btn-sm" onClick={handleAddVehicle}>+ Adicionar Carro</button>
            </div>

            <div style={{maxHeight: 200, overflowY:'auto', paddingRight:5}}>
                {editingClient.vehicles.map((v, i) => (
                    <div key={i} style={{display:'flex', gap:10, marginBottom:8}}>
                        <div style={{flex:2, minWidth:0}}><VehicleCombobox id={`db-vehicle-${i}`} placeholder="Modelo/Cor" value={v.model} onChange={val => handleVehicleChange(i, 'model', val)} shopVehicles={shopVehicles} /></div>
                        <input className="form-input" placeholder="Placa" value={v.plate} onChange={e => handleVehicleChange(i, 'plate', e.target.value)} style={{flex:1}} />
                        <button className="btn-icon danger" onClick={() => handleRemoveVehicle(i)}>🗑️</button>
                    </div>
                ))}
            </div>

            <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setEditingClient(null)}>Cancelar</button>
                <button className="btn" onClick={() => { onSaveClient(editingClient); setEditingClient(null); }}>Salvar Alterações</button>
            </div>
          </div>
        </div>
      );
  }

  // 2. EDITOR DE ITEM (PEÇA/SERVIÇO)
  if (editingItem) {
      return (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
             <h2 className="modal-title">{activeTab === 'PARTS' ? 'Editar Peça' : 'Editar Serviço'}</h2>
             
             <div className="form-group">
                <label className="form-label">Descrição</label>
                <input className="form-input" value={editingItem.description} onChange={e => setEditingItem({...editingItem, description: e.target.value})} />
             </div>

             <div className="form-group">
                <label className="form-label">Preço Padrão</label>
                <input 
                    className="form-input" 
                    type="number" 
                    value={editingItem.price / 100} 
                    onChange={e => setEditingItem({...editingItem, price: Money.fromFloat(parseFloat(e.target.value))})}
                />
             </div>

             <div className="form-group">
                <label className="form-label" htmlFor="catalog-item-cost">Custo <span style={{ opacity: 0.6, fontSize: '0.8rem' }}>(Opcional)</span></label>
                <input
                    id="catalog-item-cost"
                    className="form-input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Vazio = sem custo"
                    value={editingItem.cost === undefined ? '' : editingItem.cost / 100}
                    onChange={e => setEditingItem({ ...editingItem, cost: parseCostEdit(e.target.value) })}
                />
                <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
                    Itens sem custo ficam fora do cálculo de margem.
                </small>
             </div>

             {/* 🆕 Issue #42: categoria editável diretamente no catálogo (apenas para peças) */}
             {activeTab === 'PARTS' && (
               <div className="form-group">
                 <label className="form-label">Categoria</label>
                 <PartCategorySelect
                   value={editingItem.category ?? ''}
                   onChange={cat => setEditingItem({ ...editingItem, category: cat || undefined })}
                   style={{ width: '100%' }}
                 />
                 {editingItem.category && (
                   <div style={{
                     marginTop: 6,
                     fontSize: '0.75rem',
                     color: PART_CATEGORY_META[editingItem.category].color,
                     fontWeight: 'bold'
                   }}>
                     ● {PART_CATEGORY_META[editingItem.category].label} selecionado
                   </div>
                 )}
               </div>
             )}

             <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setEditingItem(null)}>Cancelar</button>
                <button className="btn" onClick={() => { 
                    onSaveCatalogItem(normalizeItemCost(editingItem), activeTab === 'PARTS' ? 'part' : 'service');
                    setEditingItem(null); 
                }}>Salvar</button>
            </div>
          </div>
        </div>
      );
  }

  // 3. EDITOR DE TÉCNICO
  if (editingTechnician) {
      return (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
             <h2 className="modal-title">{editingTechnician.id ? 'Editar Técnico' : 'Novo Técnico'}</h2>
             
             <div className="form-group">
                <label className="form-label">Nome do Técnico</label>
                <input 
                    className="form-input" 
                    value={editingTechnician.name} 
                    onChange={e => setEditingTechnician({...editingTechnician, name: e.target.value})} 
                    placeholder="Ex: Carlos Silva"
                    autoFocus
                />
             </div>

             <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setEditingTechnician(null)}>Cancelar</button>
                <button 
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
      );
  }

  // 4. TELA PRINCIPAL (LISTAGEM)
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '900px', height: '80vh', display: 'flex', flexDirection: 'column' }}>
        
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20}}>
            <h2 className="modal-title" style={{margin:0}}>Gerenciador de Cadastros</h2>
            <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        {/* ABAS */}
        <div style={{display:'flex', gap:10, marginBottom:15, borderBottom:'1px solid var(--border)', paddingBottom:10, flexWrap:'wrap'}}>
            <button className={`btn ${activeTab === 'CLIENTS' ? '' : 'btn-ghost'}`} onClick={() => setActiveTab('CLIENTS')}>👥 Clientes</button>
            <button className={`btn ${activeTab === 'PARTS' ? '' : 'btn-ghost'}`} onClick={() => setActiveTab('PARTS')}>🔧 Peças</button>
            <button className={`btn ${activeTab === 'SERVICES' ? '' : 'btn-ghost'}`} onClick={() => setActiveTab('SERVICES')}>🛠️ Serviços</button>
            <button className={`btn ${activeTab === 'TECHNICIANS' ? '' : 'btn-ghost'}`} onClick={() => setActiveTab('TECHNICIANS')}>👨‍🔧 Técnicos</button>
        </div>

        {/* BUSCA E NOVO */}
        <div style={{display:'flex', gap:10, marginBottom:15}}>
            <input 
                className="form-input search-input" 
                placeholder="Pesquisar..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
                autoFocus
            />
            <button className="btn" onClick={() => {
                if (activeTab === 'CLIENTS') {
                    setEditingClient({ id: crypto.randomUUID(), name: '', phone: '', vehicles: [], notes: '' });
                } else if (activeTab === 'TECHNICIANS') {
                    setEditingTechnician({ id: crypto.randomUUID(), name: '' });
                } else {
                    setEditingItem({ id: crypto.randomUUID(), description: '', price: 0 });
                }
            }}>+ Novo</button>
        </div>

        {/* LISTA (COM SCROLL) */}
        <div className="items-list-scroll" style={{flex:1, overflowY:'auto', border:'1px solid var(--border)', borderRadius:8}}>
            <table className="data-table">
                <thead>
                    <tr>
                        <th style={{textAlign:'left'}}>
                            {activeTab === 'CLIENTS' ? 'Nome / Veículos' : 
                             activeTab === 'TECHNICIANS' ? 'Nome do Técnico' : 
                             'Descrição'}
                        </th>
                        <th style={{textAlign:'right', width:150}}>
                            {activeTab === 'CLIENTS' ? 'Contato' : 
                             activeTab === 'TECHNICIANS' ? '' : 
                             'Preço'}
                        </th>
                        <th style={{textAlign:'center', width:100}}>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredList.map((row) => (
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
                                        <strong>👨‍🔧 {row.item.name}</strong>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span>{row.item.description}</span>
                                        {/* 🆕 Issue #42: badge de categoria na listagem de peças */}
                                        {row.kind === 'PART' && row.item.category && (
                                          <span style={{
                                            fontSize: '0.68rem',
                                            fontWeight: 800,
                                            textTransform: 'uppercase',
                                            color: PART_CATEGORY_META[row.item.category].color,
                                            letterSpacing: '0.04em',
                                            opacity: 0.85
                                          }}>
                                            ● {PART_CATEGORY_META[row.item.category].label}
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
                                <button 
                                    className="btn-icon" 
                                    title="Editar" 
                                    onClick={() => {
                                        if (row.kind === 'CLIENT') setEditingClient({...row.item});
                                        else if (row.kind === 'TECHNICIAN') setEditingTechnician({...row.item});
                                        else setEditingItem({...row.item});
                                    }}
                                >✏️</button>
                                <button 
                                    className="btn-icon danger" 
                                    title="Excluir" 
                                    onClick={() => {
                                        if(confirm("Tem certeza? Esta ação é irreversível.")) {
                                            if (row.kind === 'CLIENT') onDeleteClient(row.item.id);
                                            else if (row.kind === 'TECHNICIAN') onDeleteTechnician(row.item.id);
                                            else onDeleteCatalogItem(row.item.id, row.kind === 'PART' ? 'part' : 'service');
                                        }
                                    }}
                                >🗑️</button>
                            </td>
                        </tr>
                    ))}
                    {filteredList.length === 0 && (
                        <tr><td colSpan={3} style={{textAlign:'center', padding:20, color:'var(--text-muted)'}}>Nenhum registro encontrado.</td></tr>
                    )}
                </tbody>
            </table>
        </div>

      </div>
    </div>
  );
};
