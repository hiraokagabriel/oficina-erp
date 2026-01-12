import React, { useState, useMemo } from 'react';
import { Client, CatalogItem } from '../types';

interface DatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: Client[];
  catalogParts: CatalogItem[];
  catalogServices: CatalogItem[];
  // Funções de CRUD que virão do App.tsx
  onSaveClient: (client: Client) => void;
  onDeleteClient: (id: string) => void;
  onSaveCatalogItem: (item: CatalogItem, type: 'part' | 'service') => void;
  onDeleteCatalogItem: (id: string, type: 'part' | 'service') => void;
  formatMoney: (val: number) => string;
}

type Tab = 'CLIENTS' | 'PARTS' | 'SERVICES';

export const DatabaseModal: React.FC<DatabaseModalProps> = ({
  isOpen, onClose, clients, catalogParts, catalogServices,
  onSaveClient, onDeleteClient, onSaveCatalogItem, onDeleteCatalogItem, formatMoney
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('CLIENTS');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados de Edição
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);

  // --- FILTROS & PERFORMANCE ---
  const filteredList = useMemo(() => {
    const term = searchTerm.toLowerCase();
    let list: any[] = [];
    
    if (activeTab === 'CLIENTS') list = clients;
    else if (activeTab === 'PARTS') list = catalogParts;
    else list = catalogServices;

    // Filtra e limita a 50 itens para performance máxima
    return list.filter((item: any) => {
        if (activeTab === 'CLIENTS') {
            return item.name.toLowerCase().includes(term) || item.phone.includes(term);
        }
        return item.description.toLowerCase().includes(term);
    }).slice(0, 50);
  }, [activeTab, searchTerm, clients, catalogParts, catalogServices]);

  // --- HANDLERS CLIENTES ---
  const handleAddVehicle = () => {
      if (!editingClient) return;
      setEditingClient({
          ...editingClient,
          vehicles: [...editingClient.vehicles, { model: '', plate: '' }]
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
      newVehicles[index] = { ...newVehicles[index], [field]: value.toUpperCase() };
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
                        <input className="form-input" placeholder="Modelo/Cor" value={v.model} onChange={e => handleVehicleChange(i, 'model', e.target.value)} style={{flex:2}} />
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
                    onChange={e => setEditingItem({...editingItem, price: Math.round(parseFloat(e.target.value) * 100)})} 
                />
             </div>

             <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setEditingItem(null)}>Cancelar</button>
                <button className="btn" onClick={() => { 
                    onSaveCatalogItem(editingItem, activeTab === 'PARTS' ? 'part' : 'service'); 
                    setEditingItem(null); 
                }}>Salvar</button>
            </div>
          </div>
        </div>
      );
  }

  // 3. TELA PRINCIPAL (LISTAGEM)
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '900px', height: '80vh', display: 'flex', flexDirection: 'column' }}>
        
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20}}>
            <h2 className="modal-title" style={{margin:0}}>Gerenciador de Cadastros</h2>
            <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        {/* ABAS */}
        <div style={{display:'flex', gap:10, marginBottom:15, borderBottom:'1px solid var(--border)', paddingBottom:10}}>
            <button className={`btn ${activeTab === 'CLIENTS' ? '' : 'btn-ghost'}`} onClick={() => setActiveTab('CLIENTS')}>👥 Clientes & Veículos</button>
            <button className={`btn ${activeTab === 'PARTS' ? '' : 'btn-ghost'}`} onClick={() => setActiveTab('PARTS')}>🔧 Catálogo de Peças</button>
            <button className={`btn ${activeTab === 'SERVICES' ? '' : 'btn-ghost'}`} onClick={() => setActiveTab('SERVICES')}>🛠️ Catálogo de Serviços</button>
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
                if (activeTab === 'CLIENTS') setEditingClient({ id: crypto.randomUUID(), name: '', phone: '', vehicles: [], notes: '' });
                else setEditingItem({ id: crypto.randomUUID(), description: '', price: 0 });
            }}>+ Novo</button>
        </div>

        {/* LISTA (COM SCROLL) */}
        <div className="items-list-scroll" style={{flex:1, overflowY:'auto', border:'1px solid var(--border)', borderRadius:8}}>
            <table className="data-table">
                <thead>
                    <tr>
                        <th style={{textAlign:'left'}}>{activeTab === 'CLIENTS' ? 'Nome / Veículos' : 'Descrição'}</th>
                        <th style={{textAlign:'right', width:150}}>{activeTab === 'CLIENTS' ? 'Contato' : 'Preço'}</th>
                        <th style={{textAlign:'center', width:100}}>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredList.map((item: any) => (
                        <tr key={item.id}>
                            <td>
                                {activeTab === 'CLIENTS' ? (
                                    <div>
                                        <strong>{item.name}</strong>
                                        <div style={{fontSize:'0.8rem', color:'var(--text-muted)'}}>
                                            {item.vehicles.length > 0 
                                                ? item.vehicles.map((v:any) => v.model).join(', ') 
                                                : 'Sem veículos'}
                                        </div>
                                    </div>
                                ) : (
                                    item.description
                                )}
                            </td>
                            <td style={{textAlign:'right'}}>
                                {activeTab === 'CLIENTS' ? item.phone : formatMoney(item.price)}
                            </td>
                            <td style={{textAlign:'center'}}>
                                <button className="btn-icon" title="Editar" onClick={() => activeTab === 'CLIENTS' ? setEditingClient({...item}) : setEditingItem({...item})}>✏️</button>
                                <button 
                                    className="btn-icon danger" 
                                    title="Excluir" 
                                    onClick={() => {
                                        if(confirm("Tem certeza? Esta ação é irreversível.")) {
                                            if (activeTab === 'CLIENTS') onDeleteClient(item.id);
                                            else onDeleteCatalogItem(item.id, activeTab === 'PARTS' ? 'part' : 'service');
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