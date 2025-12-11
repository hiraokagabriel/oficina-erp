import React, { useState, useEffect, useMemo } from 'react';
import { WorkOrder, Client, OrderItem, CatalogItem } from '../types';

interface OSModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (osData: any) => void;
  editingOS: WorkOrder | null;
  clients: Client[];
  catalogParts: CatalogItem[];
  catalogServices: CatalogItem[];
  nextOSNumber: number;
  isSaving: boolean;
  formatMoney: (val: number) => string;
}

export const OSModal: React.FC<OSModalProps> = ({
  isOpen, onClose, onSave, editingOS, clients, catalogParts, catalogServices, nextOSNumber, isSaving, formatMoney
}) => {
  const [osNumber, setOsNumber] = useState("");
  const [date, setDate] = useState("");
  const [clientName, setClientName] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [plate, setPlate] = useState("");
  const [mileage, setMileage] = useState("");
  
  const [parts, setParts] = useState<OrderItem[]>([]);
  const [services, setServices] = useState<OrderItem[]>([]);

  // Inicialização
  useEffect(() => {
    if (isOpen) {
      if (editingOS) {
        setOsNumber(editingOS.osNumber.toString());
        setDate(editingOS.createdAt ? editingOS.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]);
        setClientName(editingOS.clientName);
        
        const client = clients.find(c => c.name.toLowerCase() === editingOS.clientName.trim().toLowerCase());
        setContact(editingOS.clientPhone || client?.phone || "");
        setNotes(client?.notes || "");
        
        const sep = editingOS.vehicle.lastIndexOf(" - ");
        if (sep > 0) {
           setVehicle(editingOS.vehicle.substring(0, sep));
           setPlate(editingOS.vehicle.substring(sep + 3));
        } else {
           setVehicle(editingOS.vehicle);
           setPlate("");
        }
        setMileage(editingOS.mileage.toString());
        setParts(editingOS.parts || []);
        setServices(editingOS.services || []);
      } else {
        setOsNumber(nextOSNumber.toString());
        setDate(new Date().toISOString().split('T')[0]);
        setClientName("");
        setContact("");
        setNotes("");
        setVehicle("");
        setPlate("");
        setMileage("");
        setParts([]);
        setServices([]);
      }
    }
  }, [isOpen, editingOS, nextOSNumber, clients]);

  // Sugestões de Veículo
  const suggestedVehicles = useMemo(() => {
    if (!clientName) return [];
    const client = clients.find(c => c.name.toLowerCase() === clientName.trim().toLowerCase());
    return client ? client.vehicles : [];
  }, [clientName, clients]);

  // Auto-preencher contato
  useEffect(() => {
      const client = clients.find(c => c.name.toLowerCase() === clientName.trim().toLowerCase());
      if (client && !contact) {
          setContact(client.phone || "");
          if (!notes) setNotes(client.notes || "");
      }
  }, [clientName]);

  // Auto-preencher placa
  useEffect(() => {
    if (vehicle && suggestedVehicles.length > 0) {
        const match = suggestedVehicles.find(v => v.model.toLowerCase() === vehicle.toLowerCase());
        if (match && match.plate && !plate) setPlate(match.plate);
    }
  }, [vehicle, suggestedVehicles]);

  // Helpers de Lista
  const toFloat = (val: number) => val / 100;
  const fromFloat = (val: number) => Math.round(val * 100);
  const calcTotal = (items: OrderItem[]) => items.reduce((acc, i) => acc + i.price, 0);

  const updateItem = (list: OrderItem[], setList: any, index: number, field: keyof OrderItem, value: any, catalog: CatalogItem[]) => {
    const newList = [...list];
    newList[index] = { ...newList[index], [field]: value };
    if (field === 'description') {
        const match = catalog.find(c => c.description.toLowerCase() === (value as string).toLowerCase());
        if (match) newList[index].price = match.price;
    }
    setList(newList);
  };

  const handleConfirm = () => {
    if (!clientName || !vehicle) { alert("Preencha cliente e veículo."); return; }
    const numOS = parseInt(osNumber);
    if (isNaN(numOS)) { alert("Número OS inválido."); return; }

    const fullVehicle = plate ? `${vehicle} - ${plate.toUpperCase()}` : vehicle;

    onSave({
        osNumber: numOS,
        createdAt: date,
        clientName,
        clientPhone: contact,
        clientNotes: notes,
        vehicle: fullVehicle,
        vehicleModelOnly: vehicle,
        plate: plate.toUpperCase(),
        mileage: parseInt(mileage) || 0,
        parts: parts.filter(p => p.description.trim() !== ""),
        services: services.filter(s => s.description.trim() !== "")
    });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      {/* AUMENTAMOS A LARGURA PARA ACOMODAR AS COLUNAS LADO A LADO */}
      <div className="modal-content" style={{ maxWidth: '1100px', width: '95%' }}>
        <h2 className="modal-title">{editingOS ? "Editar OS" : "Nova OS"}</h2>
        
        {/* --- DADOS GERAIS (LINHA 1) --- */}
        <div style={{ display: 'flex', gap: 16 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Nº OS</label>
            <input className="form-input" value={osNumber} onChange={e => setOsNumber(e.target.value)} style={{ fontWeight: 'bold', color: 'var(--primary)' }} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Data</label>
            <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ color: 'var(--text-main)' }} />
          </div>
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label">Cliente</label>
            <input className="form-input" list="clients_list" value={clientName} onChange={e => setClientName(e.target.value)} autoFocus={!editingOS}/>
            <datalist id="clients_list">{clients.map(c => <option key={c.id} value={c.name} />)}</datalist>
          </div>
        </div>

        {/* --- DADOS GERAIS (LINHA 2) --- */}
        <div style={{ display: 'flex', gap: 16 }}>
           <div className="form-group" style={{ flex: 1 }}>
             <label className="form-label">Contato / Telefone</label>
             <input className="form-input" value={contact} onChange={e => setContact(e.target.value)} />
           </div>
        </div>

        <div className="form-group">
           <label className="form-label">Obs. Cliente</label>
           <textarea className="form-input form-textarea" value={notes} onChange={e => setNotes(e.target.value)} style={{minHeight: 60}}/>
        </div>

        {/* --- VEÍCULO (LINHA 3) --- */}
        <div style={{ display: 'flex', gap: 16 }}>
           <div className="form-group" style={{ flex: 2 }}>
             <label className="form-label">Veículo</label>
             <input className="form-input" list="veh_list" value={vehicle} onChange={e => setVehicle(e.target.value)} />
             <datalist id="veh_list">{suggestedVehicles.map((v, i) => <option key={i} value={v.model} />)}</datalist>
           </div>
           <div className="form-group" style={{ flex: 1 }}>
             <label className="form-label">Placa</label>
             <input className="form-input" value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} maxLength={8} />
           </div>
           <div className="form-group" style={{ flex: 1 }}>
             <label className="form-label">Km</label>
             <input className="form-input" type="number" value={mileage} onChange={e => setMileage(e.target.value)} />
           </div>
        </div>

        <hr style={{ borderColor: 'var(--border)', margin: '20px 0', opacity: 0.3 }} />

        {/* --- COLUNAS DE PEÇAS E SERVIÇOS (LADO A LADO) --- */}
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            
            {/* COLUNA PEÇAS (Estilo Azulado/Info) */}
            <div className="items-list-container" style={{ 
                flex: 1, 
                backgroundColor: 'rgba(0, 188, 212, 0.03)', 
                border: '1px solid rgba(0, 188, 212, 0.2)' 
            }}>
                <div className="items-header" style={{ color: 'var(--info)' }}>
                    <span>🔧 Peças</span> 
                    <span>{formatMoney(calcTotal(parts))}</span>
                </div>
                {parts.map((p, i) => (
                    <div key={p.id} className="item-row">
                        <input className="form-input" list="cat-parts" value={p.description} onChange={e => updateItem(parts, setParts, i, 'description', e.target.value, catalogParts)} style={{ flex: 2 }} placeholder="Peça"/>
                        <datalist id="cat-parts">{catalogParts.map((cp, idx) => <option key={idx} value={cp.description}>{formatMoney(cp.price)}</option>)}</datalist>
                        <input className="form-input" type="number" value={toFloat(p.price)} onChange={e => updateItem(parts, setParts, i, 'price', fromFloat(parseFloat(e.target.value) || 0), catalogParts)} style={{ flex: 1 }} />
                        <button className="btn-icon danger" onClick={() => setParts(parts.filter((_, idx) => idx !== i))} tabIndex={-1}>x</button>
                    </div>
                ))}
                <button 
                    className="btn-secondary" 
                    style={{ width: '100%', marginTop: 10, borderColor: 'var(--info)', color: 'var(--info)' }} 
                    onClick={() => setParts([...parts, { id: crypto.randomUUID(), description: "", price: 0 }])}
                >
                    + Adicionar Peça
                </button>
            </div>

            {/* COLUNA SERVIÇOS (Estilo Roxo/Primary) */}
            <div className="items-list-container" style={{ 
                flex: 1, 
                backgroundColor: 'rgba(130, 87, 230, 0.03)', 
                border: '1px solid rgba(130, 87, 230, 0.2)' 
            }}>
                <div className="items-header" style={{ color: 'var(--primary)' }}>
                    <span>🛠️ Serviços</span> 
                    <span>{formatMoney(calcTotal(services))}</span>
                </div>
                {services.map((s, i) => (
                    <div key={s.id} className="item-row">
                        <input className="form-input" list="cat-serv" value={s.description} onChange={e => updateItem(services, setServices, i, 'description', e.target.value, catalogServices)} style={{ flex: 2 }} placeholder="Serviço"/>
                        <datalist id="cat-serv">{catalogServices.map((cs, idx) => <option key={idx} value={cs.description}>{formatMoney(cs.price)}</option>)}</datalist>
                        <input className="form-input" type="number" value={toFloat(s.price)} onChange={e => updateItem(services, setServices, i, 'price', fromFloat(parseFloat(e.target.value) || 0), catalogServices)} style={{ flex: 1 }} />
                        <button className="btn-icon danger" onClick={() => setServices(services.filter((_, idx) => idx !== i))} tabIndex={-1}>x</button>
                    </div>
                ))}
                <button 
                    className="btn-secondary" 
                    style={{ width: '100%', marginTop: 10, borderColor: 'var(--primary)', color: 'var(--primary)' }} 
                    onClick={() => setServices([...services, { id: crypto.randomUUID(), description: "", price: 0 }])}
                >
                    + Adicionar Serviço
                </button>
            </div>
        
        </div>

        <div className="total-display" style={{ marginTop: 24 }}>
            <span>Total Geral</span> 
            <span>{formatMoney(calcTotal(parts) + calcTotal(services))}</span>
        </div>

        <div className="modal-actions">
           <button className="btn-secondary" onClick={onClose}>Cancelar</button>
           <button className="btn" onClick={handleConfirm} disabled={isSaving}>{isSaving ? '...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
};