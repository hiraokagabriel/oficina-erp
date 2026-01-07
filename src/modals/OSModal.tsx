import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  // --- REFS PARA ATALHOS ---
  const partInputRef = useRef<HTMLInputElement>(null);
  const serviceInputRef = useRef<HTMLInputElement>(null);
  const clientInputRef = useRef<HTMLInputElement>(null);

  // --- ESTADOS DE DADOS ---
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

  // --- ESTADOS TEMPORÁRIOS (SPEED ENTRY) ---
  const [tempPart, setTempPart] = useState({ description: '', price: '' });
  const [tempService, setTempService] = useState({ description: '', price: '' });

  // --- PERFORMANCE FIX: LISTAS SUPER OTIMIZADAS (5 Itens) ---
  
  const suggestedParts = useMemo(() => {
      const term = tempPart.description.trim().toLowerCase();
      // Limite agressivo de 5 itens para máxima performance
      if (!term) return catalogParts.slice(0, 5);
      return catalogParts
          .filter(p => p.description.toLowerCase().includes(term))
          .slice(0, 5);
  }, [catalogParts, tempPart.description]);

  const suggestedServices = useMemo(() => {
      const term = tempService.description.trim().toLowerCase();
      if (!term) return catalogServices.slice(0, 5);
      return catalogServices
          .filter(s => s.description.toLowerCase().includes(term))
          .slice(0, 5);
  }, [catalogServices, tempService.description]);

  const suggestedClients = useMemo(() => {
      const term = clientName.trim().toLowerCase();
      if (!term) return clients.slice(0, 5);
      return clients
          .filter(c => c.name.toLowerCase().includes(term))
          .slice(0, 5);
  }, [clients, clientName]);

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
        setParts((editingOS.parts || []) as OrderItem[]);
        setServices((editingOS.services || []) as OrderItem[]);
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
      setTimeout(() => clientInputRef.current?.focus(), 100);
    }
  }, [isOpen, editingOS, nextOSNumber, clients]);

  // Sugestões de Veículo (Também limitado)
  const suggestedVehicles = useMemo(() => {
    if (!clientName) return [];
    const client = clients.find(c => c.name.toLowerCase() === clientName.trim().toLowerCase());
    return client ? client.vehicles.slice(0, 5) : [];
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

  // --- HANDLERS ---

  const handlePartKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!tempPart.description) return;

      const priceVal = parseFloat(tempPart.price.replace(',', '.')) || 0;
      const newItem: OrderItem = { 
        id: crypto.randomUUID(), 
        description: tempPart.description, 
        price: fromFloat(priceVal)
      };
      
      setParts(prev => [...prev, newItem]);
      setTempPart({ description: '', price: '' });

      if (e.shiftKey) serviceInputRef.current?.focus();
      else partInputRef.current?.focus();
    }
  };

  const handleServiceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!tempService.description) return;

      const priceVal = parseFloat(tempService.price.replace(',', '.')) || 0;
      const newItem: OrderItem = { 
        id: crypto.randomUUID(), 
        description: tempService.description, 
        price: fromFloat(priceVal)
      };

      setServices(prev => [...prev, newItem]);
      setTempService({ description: '', price: '' });

      if (e.shiftKey) partInputRef.current?.focus();
      else serviceInputRef.current?.focus();
    }
  };

  const handleTempPartChange = (val: string) => {
      const match = catalogParts.find(c => c.description.toLowerCase() === val.toLowerCase());
      setTempPart({ 
          description: val, 
          price: match ? (match.price / 100).toString() : tempPart.price 
      });
  };

  const handleTempServiceChange = (val: string) => {
      const match = catalogServices.find(c => c.description.toLowerCase() === val.toLowerCase());
      setTempService({ 
          description: val, 
          price: match ? (match.price / 100).toString() : tempService.price 
      });
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
            <input 
                ref={clientInputRef}
                className="form-input" 
                list="clients_list" 
                value={clientName} 
                onChange={e => setClientName(e.target.value)} 
                autoFocus={!editingOS}
            />
            {/* DATALIST ULTRA OTIMIZADO (5 ITENS) */}
            <datalist id="clients_list">
                {suggestedClients.map(c => <option key={c.id} value={c.name} />)}
            </datalist>
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

        {/* --- COLUNAS DE PEÇAS E SERVIÇOS --- */}
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            
            {/* COLUNA PEÇAS */}
            <div className="items-list-container" style={{ 
                flex: 1, 
                backgroundColor: 'rgba(0, 188, 212, 0.03)', 
                border: '1px solid rgba(0, 188, 212, 0.2)' 
            }}>
                <div className="items-header" style={{ color: 'var(--info)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>🔧 Peças</span> 
                    <span>{formatMoney(calcTotal(parts))}</span>
                </div>

                <div className="item-row" style={{ borderBottom: '2px dashed var(--info)', paddingBottom: 10, marginBottom: 10 }}>
                    <input 
                        ref={partInputRef}
                        className="form-input" 
                        list="cat-parts" 
                        value={tempPart.description} 
                        onChange={e => handleTempPartChange(e.target.value)} 
                        onKeyDown={handlePartKeyDown}
                        style={{ flex: 2 }} 
                        placeholder="Nova peça (Enter para adicionar)..."
                    />
                    {/* DATALIST ULTRA OTIMIZADO (5 ITENS) */}
                    <datalist id="cat-parts">
                        {suggestedParts.map((cp, idx) => (
                            <option key={idx} value={cp.description}>{formatMoney(cp.price)}</option>
                        ))}
                    </datalist>
                    <input 
                        className="form-input" 
                        type="number" 
                        value={tempPart.price} 
                        onChange={e => setTempPart({...tempPart, price: e.target.value})} 
                        onKeyDown={handlePartKeyDown}
                        style={{ flex: 1 }} 
                        placeholder="0.00"
                    />
                </div>

                <div className="items-list-scroll" style={{ background: 'var(--bg-input)', borderRadius: 8, padding: 8, maxHeight: 250, border: '1px solid var(--border)' }}>
                    {parts.length === 0 && <div style={{ padding: 10, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhuma peça lançada.</div>}
                    {parts.map((item, idx) => (
                        <div key={item.id} className="item-row">
                            <input className="form-input" value={item.description} onChange={e => updateItem(parts, setParts, idx, 'description', e.target.value, catalogParts)} style={{ flex: 2 }} />
                            <input className="form-input" type="number" value={toFloat(item.price)} onChange={e => updateItem(parts, setParts, idx, 'price', fromFloat(parseFloat(e.target.value) || 0), catalogParts)} style={{ flex: 1 }} />
                            <button className="btn-icon danger" onClick={() => setParts(parts.filter((_, i) => i !== idx))} tabIndex={-1}>x</button>
                        </div>
                    ))}
                </div>
            </div>

            {/* COLUNA SERVIÇOS */}
            <div className="items-list-container" style={{ 
                flex: 1, 
                backgroundColor: 'rgba(130, 87, 230, 0.03)', 
                border: '1px solid rgba(130, 87, 230, 0.2)' 
            }}>
                <div className="items-header" style={{ color: 'var(--primary)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>🛠️ Serviços</span> 
                    <span>{formatMoney(calcTotal(services))}</span>
                </div>

                 <div className="item-row" style={{ borderBottom: '2px dashed var(--primary)', paddingBottom: 10, marginBottom: 10 }}>
                    <input 
                        ref={serviceInputRef}
                        className="form-input" 
                        list="cat-serv" 
                        value={tempService.description} 
                        onChange={e => handleTempServiceChange(e.target.value)} 
                        onKeyDown={handleServiceKeyDown}
                        style={{ flex: 2 }} 
                        placeholder="Novo serviço (Enter para adicionar)..."
                    />
                    {/* DATALIST ULTRA OTIMIZADO (5 ITENS) */}
                    <datalist id="cat-serv">
                        {suggestedServices.map((cs, idx) => (
                            <option key={idx} value={cs.description}>{formatMoney(cs.price)}</option>
                        ))}
                    </datalist>
                    <input 
                        className="form-input" 
                        type="number" 
                        value={tempService.price} 
                        onChange={e => setTempService({...tempService, price: e.target.value})} 
                        onKeyDown={handleServiceKeyDown}
                        style={{ flex: 1 }} 
                        placeholder="0.00"
                    />
                </div>

                <div className="items-list-scroll" style={{ background: 'var(--bg-input)', borderRadius: 8, padding: 8, maxHeight: 250, border: '1px solid var(--border)' }}>
                    {services.length === 0 && <div style={{ padding: 10, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhum serviço lançado.</div>}
                    {services.map((item, idx) => (
                        <div key={item.id} className="item-row">
                            <input className="form-input" value={item.description} onChange={e => updateItem(services, setServices, idx, 'description', e.target.value, catalogServices)} style={{ flex: 2 }} />
                            <input className="form-input" type="number" value={toFloat(item.price)} onChange={e => updateItem(services, setServices, idx, 'price', fromFloat(parseFloat(e.target.value) || 0), catalogServices)} style={{ flex: 1 }} />
                            <button className="btn-icon danger" onClick={() => setServices(services.filter((_, i) => i !== idx))} tabIndex={-1}>x</button>
                        </div>
                    ))}
                </div>
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