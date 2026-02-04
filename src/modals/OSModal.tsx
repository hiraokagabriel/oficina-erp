import React, { useState, useEffect, useMemo, useRef } from 'react';
import { WorkOrder, Client, OrderItem, CatalogItem, Technician } from '../types';
import { getLocalDateString } from '../utils/helpers';
import { MarginIndicator } from '../components/MarginIndicator';

interface OSModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (osData: any) => void;
  editingOS: WorkOrder | null;
  clients: Client[];
  catalogParts: CatalogItem[];
  catalogServices: CatalogItem[];
  catalogTechnicians: Technician[];
  nextOSNumber: number;
  isSaving: boolean;
  formatMoney: (val: number) => string;
}

export const OSModal: React.FC<OSModalProps> = ({
  isOpen, onClose, onSave, editingOS, clients, catalogParts, catalogServices, catalogTechnicians, nextOSNumber, isSaving, formatMoney
}) => {
  // --- REFS PARA ATALHOS ---
  const partInputRef = useRef<HTMLInputElement>(null);
  const serviceInputRef = useRef<HTMLInputElement>(null);
  const clientInputRef = useRef<HTMLInputElement>(null);

  // --- ESTADOS DE DADOS ---
  const [osNumber, setOsNumber] = useState("");
  const [date, setDate] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [clientName, setClientName] = useState("");
  const [contact, setContact] = useState("");
  const [technician, setTechnician] = useState("");
  const [notes, setNotes] = useState("");
  const [publicNotes, setPublicNotes] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [plate, setPlate] = useState("");
  const [mileage, setMileage] = useState("");

  const [parts, setParts] = useState<OrderItem[]>([]);
  const [services, setServices] = useState<OrderItem[]>([]);
  const [showCostColumn, setShowCostColumn] = useState(false);
  const [minMargin, setMinMargin] = useState(70); // 🆕 Margem mínima configurável

  // --- ESTADOS TEMPORÁRIOS ---
  const [tempPart, setTempPart] = useState({ description: '', price: '', cost: '' });
  const [tempService, setTempService] = useState({ description: '', price: '', cost: '' });

  const toFloat = (val: number) => val / 100;
  const fromFloat = (val: number) => Math.round(val * 100);

  // --- 🆕 CÁLCULOS FINANCEIROS MEMOIZADOS ---
  const partsTotal = useMemo(() => parts.reduce((acc, i) => acc + i.price, 0), [parts]);
  const servicesTotal = useMemo(() => services.reduce((acc, i) => acc + i.price, 0), [services]);
  const partsCost = useMemo(() => parts.reduce((acc, i) => acc + (i.cost || 0), 0), [parts]);
  const servicesCost = useMemo(() => services.reduce((acc, i) => acc + (i.cost || 0), 0), [services]);
  const totalRevenue = useMemo(() => partsTotal + servicesTotal, [partsTotal, servicesTotal]);
  const totalCost = useMemo(() => partsCost + servicesCost, [partsCost, servicesCost]);
  const profit = useMemo(() => totalRevenue - totalCost, [totalRevenue, totalCost]);
  const profitMargin = useMemo(() => {
    if (totalRevenue === 0) return 0;
    return (profit / totalRevenue) * 100;
  }, [profit, totalRevenue]);
  const roi = useMemo(() => {
    if (totalCost === 0) return 0;
    return (profit / totalCost) * 100;
  }, [profit, totalCost]);

  // 🆕 Valor mínimo sugerido para atingir a margem desejada
  const minSuggestedRevenue = useMemo(() => {
    if (totalCost === 0) return 0;
    return totalCost / (1 - minMargin / 100);
  }, [totalCost, minMargin]);

  const revenueDifference = useMemo(() => {
    return totalRevenue - minSuggestedRevenue;
  }, [totalRevenue, minSuggestedRevenue]);

  // --- LISTAS OTIMIZADAS ---
  const suggestedParts = useMemo(() => {
    const term = tempPart.description.trim().toLowerCase();
    if (!term) return catalogParts.slice(0, 50);
    return catalogParts.filter(p => p.description.toLowerCase().includes(term)).slice(0, 50);
  }, [catalogParts, tempPart.description]);

  const suggestedServices = useMemo(() => {
    const term = tempService.description.trim().toLowerCase();
    if (!term) return catalogServices.slice(0, 50);
    return catalogServices.filter(s => s.description.toLowerCase().includes(term)).slice(0, 50);
  }, [catalogServices, tempService.description]);

  const suggestedClients = useMemo(() => {
    const term = clientName.trim().toLowerCase();
    if (!term) return clients.slice(0, 50);
    return clients.filter(c => c.name.toLowerCase().includes(term)).slice(0, 50);
  }, [clients, clientName]);

  const suggestedVehicles = useMemo(() => {
    if (!clientName) return [];
    const client = clients.find(c => c.name.toLowerCase() === clientName.trim().toLowerCase());
    return client ? client.vehicles : [];
  }, [clientName, clients]);

  const suggestedTechnicians = useMemo(() => {
    const term = technician.trim().toLowerCase();
    if (!term) return catalogTechnicians.slice(0, 50);
    return catalogTechnicians.filter(t => t.name.toLowerCase().includes(term)).slice(0, 50);
  }, [catalogTechnicians, technician]);

  // Inicialização
  useEffect(() => {
    if (!isOpen) return;

    if (editingOS) {
      setOsNumber(editingOS.osNumber.toString());
      setDate(editingOS.createdAt ? editingOS.createdAt.split('T')[0] : getLocalDateString());
      setPaymentDate(editingOS.paymentDate ? editingOS.paymentDate.split('T')[0] : "");
      setClientName(editingOS.clientName);

      const client = clients.find(c => c.name.toLowerCase() === editingOS.clientName.trim().toLowerCase());
      setContact(editingOS.clientPhone || client?.phone || "");
      setTechnician(editingOS.technician || "");
      setNotes(client?.notes || "");
      setPublicNotes(editingOS.publicNotes || "");

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
      setDate(getLocalDateString());
      setPaymentDate("");
      setClientName("");
      setContact("");
      setTechnician("");
      setNotes("");
      setPublicNotes("");
      setVehicle("");
      setPlate("");
      setMileage("");
      setParts([]);
      setServices([]);
    }
    setTimeout(() => clientInputRef.current?.focus(), 100);
  }, [isOpen, editingOS, nextOSNumber]);

  // Auto-preencher contato
  useEffect(() => {
    if (!clientName || contact) return;
    const client = clients.find(c => c.name.toLowerCase() === clientName.trim().toLowerCase());
    if (client) {
      setContact(client.phone || "");
      if (!notes) setNotes(client.notes || "");
    }
  }, [clientName, clients]);

  // Auto-preencher placa
  useEffect(() => {
    if (!vehicle || plate || suggestedVehicles.length === 0) return;
    const match = suggestedVehicles.find(v => v.model.toLowerCase() === vehicle.toLowerCase());
    if (match && match.plate) setPlate(match.plate);
  }, [vehicle, suggestedVehicles]);

  const updateItem = (
    list: OrderItem[],
    setList: any,
    index: number,
    field: keyof OrderItem,
    value: any,
    catalog: CatalogItem[]
  ) => {
    const newList = [...list];
    newList[index] = { ...newList[index], [field]: value };

    if (field === 'description') {
      const match = catalog.find(c => c.description.toLowerCase() === (value as string).toLowerCase());
      if (match) {
        newList[index].price = match.price;
        newList[index].cost = match.cost || 0;
      }
    }
    setList(newList);
  };

  // --- HANDLERS ---
  const handlePartKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!tempPart.description) return;
      const priceVal = parseFloat(tempPart.price.replace(',', '.')) || 0;
      const costVal = parseFloat(tempPart.cost.replace(',', '.')) || 0;
      const newItem: OrderItem = {
        id: crypto.randomUUID(),
        description: tempPart.description,
        price: fromFloat(priceVal),
        cost: fromFloat(costVal)
      };
      setParts(prev => [...prev, newItem]);
      setTempPart({ description: '', price: '', cost: '' });
      if (e.shiftKey) serviceInputRef.current?.focus(); else partInputRef.current?.focus();
    }
  };

  const handleServiceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!tempService.description) return;
      const priceVal = parseFloat(tempService.price.replace(',', '.')) || 0;
      const costVal = parseFloat(tempService.cost.replace(',', '.')) || 0;
      const newItem: OrderItem = {
        id: crypto.randomUUID(),
        description: tempService.description,
        price: fromFloat(priceVal),
        cost: fromFloat(costVal)
      };
      setServices(prev => [...prev, newItem]);
      setTempService({ description: '', price: '', cost: '' });
      if (e.shiftKey) partInputRef.current?.focus(); else serviceInputRef.current?.focus();
    }
  };

  const handleTempPartChange = (val: string) => {
    const match = catalogParts.find(c => c.description.toLowerCase() === val.toLowerCase());
    setTempPart({
      description: val,
      price: match ? (match.price / 100).toString() : tempPart.price,
      cost: match ? ((match.cost || 0) / 100).toString() : tempPart.cost
    });
  };

  const handleTempServiceChange = (val: string) => {
    const match = catalogServices.find(c => c.description.toLowerCase() === val.toLowerCase());
    setTempService({
      description: val,
      price: match ? (match.price / 100).toString() : tempService.price,
      cost: match ? ((match.cost || 0) / 100).toString() : tempService.cost
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
      paymentDate: paymentDate ? new Date(paymentDate).toISOString() : undefined,
      clientName,
      clientPhone: contact,
      clientNotes: notes,
      vehicle: fullVehicle,
      vehicleModelOnly: vehicle,
      plate: plate.toUpperCase(),
      mileage: parseInt(mileage) || 0,
      parts: parts.filter(p => p.description.trim() !== ""),
      services: services.filter(s => s.description.trim() !== ""),
      publicNotes,
      technician: technician.trim() || undefined
    });
  };

  // --- HOTKEY ---
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, clientName, vehicle, parts, services, osNumber, publicNotes, technician]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '1100px', width: '95%' }}>
        <h2 className="modal-title">{editingOS ? "Editar OS" : "Nova OS"}</h2>

        {/* DADOS GERAIS */}
        <div style={{ display: 'flex', gap: 16 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Nº OS</label>
            <input className="form-input" value={osNumber} onChange={e => setOsNumber(e.target.value)} style={{ fontWeight: 'bold', color: 'var(--primary)' }} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Data</label>
            <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ color: 'var(--text-main)' }} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">📅 Data Pagamento <span style={{ opacity: 0.6, fontSize: '0.8rem' }}>(Opcional)</span></label>
            <input
              className="form-input"
              type="date"
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
              style={{ color: paymentDate ? 'var(--success)' : 'var(--text-muted)', fontWeight: paymentDate ? 'bold' : 'normal' }}
            />
          </div>
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label">Cliente</label>
            <input ref={clientInputRef} className="form-input" list="clients_list" value={clientName} onChange={e => setClientName(e.target.value)} autoFocus={!editingOS} />
            <datalist id="clients_list">{suggestedClients.map(c => <option key={c.id} value={c.name} />)}</datalist>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Contato / Telefone</label>
            <input className="form-input" value={contact} onChange={e => setContact(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">🔧 Técnico Responsável <span style={{ opacity: 0.6, fontSize: '0.8rem' }}>(Opcional)</span></label>
            <input className="form-input" list="tech_list" value={technician} onChange={e => setTechnician(e.target.value)} />
            <datalist id="tech_list">{suggestedTechnicians.map(t => <option key={t.id} value={t.name} />)}</datalist>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Obs. Interna (Visível apenas aqui)</label>
          <textarea className="form-input form-textarea" value={notes} onChange={e => setNotes(e.target.value)} style={{ minHeight: 60 }} />
        </div>

        {/* VEÍCULO */}
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

        {/* 🆕 Configuração de margem mínima */}
        {showCostColumn && (
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', backgroundColor: 'rgba(130, 87, 230, 0.05)', borderRadius: '6px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--primary)' }}>Margem Mínima Desejada:</label>
            <input
              type="number"
              value={minMargin}
              onChange={e => setMinMargin(parseInt(e.target.value) || 70)}
              min="0"
              max="100"
              style={{ width: '70px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '0.9rem' }}
            />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>%</span>
          </div>
        )}

        {/* COLUNAS PEÇAS / SERVIÇOS */}
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

          {/* PEÇAS */}
          <div className="items-list-container" style={{ flex: 1, backgroundColor: 'rgba(0, 188, 212, 0.03)', border: '1px solid rgba(0, 188, 212, 0.2)' }}>
            <div className="items-header" style={{ color: 'var(--info)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>🔧 Peças</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showCostColumn}
                    onChange={e => setShowCostColumn(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  Custo
                </label>
                <span>{formatMoney(partsTotal)}</span>
              </div>
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
                placeholder="Nova peça (Enter)..."
              />
              <datalist id="cat-parts">
                {suggestedParts.map((cp, idx) => (
                  <option key={idx} value={cp.description}>{formatMoney(cp.price)}</option>
                ))}
              </datalist>

              {showCostColumn && (
                <input
                  className="form-input"
                  type="number"
                  value={tempPart.cost}
                  onChange={e => setTempPart({ ...tempPart, cost: e.target.value })}
                  onKeyDown={handlePartKeyDown}
                  placeholder="Custo"
                  style={{ flex: 0.8, fontSize: '0.85rem' }}
                />
              )}

              <input
                className="form-input"
                type="number"
                value={tempPart.price}
                onChange={e => setTempPart({ ...tempPart, price: e.target.value })}
                onKeyDown={handlePartKeyDown}
                style={{ flex: 1 }}
                placeholder="Preço"
              />
            </div>

            <div style={{ maxHeight: 250, overflowY: 'auto' }}>
              {parts.map((p, i) => (
                <div key={p.id} style={{ marginBottom: showCostColumn ? '12px' : '0' }}>
                  <div className="item-row">
                    <input
                      className="form-input"
                      value={p.description}
                      onChange={e => updateItem(parts, setParts, i, 'description', e.target.value, catalogParts)}
                      style={{ flex: 2 }}
                    />

                    {showCostColumn && (
                      <input
                        className="form-input"
                        type="number"
                        value={toFloat(p.cost || 0)}
                        onChange={e => updateItem(parts, setParts, i, 'cost', fromFloat(parseFloat(e.target.value) || 0), catalogParts)}
                        style={{ flex: 0.8, fontSize: '0.85rem', backgroundColor: 'rgba(255,152,0,0.1)' }}
                        placeholder="Custo"
                        title="Custo interno de aquisição"
                      />
                    )}

                    <input
                      className="form-input"
                      type="number"
                      value={toFloat(p.price)}
                      onChange={e => updateItem(parts, setParts, i, 'price', fromFloat(parseFloat(e.target.value) || 0), catalogParts)}
                      style={{ flex: 1 }}
                    />

                    <button
                      className="btn-icon danger"
                      onClick={() => setParts(parts.filter((_, idx) => idx !== i))}
                      tabIndex={-1}
                    >
                      x
                    </button>
                  </div>

                  {/* 🆕 Indicador de Margem */}
                  {showCostColumn && p.cost && p.cost > 0 && (
                    <MarginIndicator
                      cost={p.cost}
                      price={p.price}
                      formatMoney={formatMoney}
                      minMarginPercent={minMargin}
                      onSuggestPrice={(suggestedPrice) => {
                        updateItem(parts, setParts, i, 'price', suggestedPrice, catalogParts);
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* SERVIÇOS */}
          <div className="items-list-container" style={{ flex: 1, backgroundColor: 'rgba(130, 87, 230, 0.03)', border: '1px solid rgba(130, 87, 230, 0.2)' }}>
            <div className="items-header" style={{ color: 'var(--primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>🛠️ Serviços</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showCostColumn}
                    onChange={e => setShowCostColumn(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  Custo
                </label>
                <span>{formatMoney(servicesTotal)}</span>
              </div>
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
                placeholder="Novo serviço (Enter)..."
              />
              <datalist id="cat-serv">
                {suggestedServices.map((cs, idx) => (
                  <option key={idx} value={cs.description}>{formatMoney(cs.price)}</option>
                ))}
              </datalist>

              {showCostColumn && (
                <input
                  className="form-input"
                  type="number"
                  value={tempService.cost}
                  onChange={e => setTempService({ ...tempService, cost: e.target.value })}
                  onKeyDown={handleServiceKeyDown}
                  placeholder="Custo"
                  style={{ flex: 0.8, fontSize: '0.85rem' }}
                />
              )}

              <input
                className="form-input"
                type="number"
                value={tempService.price}
                onChange={e => setTempService({ ...tempService, price: e.target.value })}
                onKeyDown={handleServiceKeyDown}
                style={{ flex: 1 }}
                placeholder="Preço"
              />
            </div>

            <div style={{ maxHeight: 250, overflowY: 'auto' }}>
              {services.map((s, i) => (
                <div key={s.id} style={{ marginBottom: showCostColumn ? '12px' : '0' }}>
                  <div className="item-row">
                    <input
                      className="form-input"
                      value={s.description}
                      onChange={e => updateItem(services, setServices, i, 'description', e.target.value, catalogServices)}
                      style={{ flex: 2 }}
                    />

                    {showCostColumn && (
                      <input
                        className="form-input"
                        type="number"
                        value={toFloat(s.cost || 0)}
                        onChange={e => updateItem(services, setServices, i, 'cost', fromFloat(parseFloat(e.target.value) || 0), catalogServices)}
                        style={{ flex: 0.8, fontSize: '0.85rem', backgroundColor: 'rgba(255,152,0,0.1)' }}
                        placeholder="Custo"
                        title="Custo interno de aquisição"
                      />
                    )}

                    <input
                      className="form-input"
                      type="number"
                      value={toFloat(s.price)}
                      onChange={e => updateItem(services, setServices, i, 'price', fromFloat(parseFloat(e.target.value) || 0), catalogServices)}
                      style={{ flex: 1 }}
                    />

                    <button
                      className="btn-icon danger"
                      onClick={() => setServices(services.filter((_, idx) => idx !== i))}
                      tabIndex={-1}
                    >
                      x
                    </button>
                  </div>

                  {/* 🆕 Indicador de Margem */}
                  {showCostColumn && s.cost && s.cost > 0 && (
                    <MarginIndicator
                      cost={s.cost}
                      price={s.price}
                      formatMoney={formatMoney}
                      minMarginPercent={minMargin}
                      onSuggestPrice={(suggestedPrice) => {
                        updateItem(services, setServices, i, 'price', suggestedPrice, catalogServices);
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 🆕 ANÁLISE FINANCEIRA / HUB DE ROI */}
        {showCostColumn && (
          <div style={{
            marginTop: 20,
            padding: 16,
            backgroundColor: 'rgba(130, 87, 230, 0.05)',
            borderRadius: 8,
            border: '1px solid var(--border)'
          }}>
            <h4 style={{ margin: '0 0 12px 0', color: 'var(--primary)' }}>📊 Análise Financeira</h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Receita Total</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--success)' }}>
                  {formatMoney(totalRevenue)}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Custo Total</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--warning)' }}>
                  {formatMoney(totalCost)}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Lucro Bruto</div>
                <div style={{
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  color: profit >= 0 ? 'var(--success)' : 'var(--danger)'
                }}>
                  {formatMoney(profit)}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ROI</div>
                <div style={{
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  color: roi >= 0 ? 'var(--success)' : 'var(--danger)'
                }}>
                  {roi.toFixed(1)}%
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Margem de Lucro: <strong style={{ color: 'var(--primary)' }}>{profitMargin.toFixed(1)}%</strong>
            </div>

            {/* 🆕 RESUMO GERAL - VALOR MÍNIMO SUGERIDO */}
            {totalCost > 0 && (
              <div style={{
                marginTop: 16,
                padding: 12,
                backgroundColor: profitMargin < minMargin ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                borderRadius: 6,
                border: `2px solid ${profitMargin < minMargin ? '#ef4444' : '#22c55e'}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>
                      🎯 Valor Mínimo Sugerido ({minMargin}% margem)
                    </div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                      {formatMoney(Math.round(minSuggestedRevenue))}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {revenueDifference >= 0 ? 'Acima do mínimo' : 'Abaixo do mínimo'}
                    </div>
                    <div style={{
                      fontSize: '1.1rem',
                      fontWeight: 'bold',
                      color: revenueDifference >= 0 ? '#22c55e' : '#ef4444'
                    }}>
                      {revenueDifference >= 0 ? '+' : ''}{formatMoney(Math.round(revenueDifference))}
                    </div>
                  </div>
                </div>

                {profitMargin < minMargin && (
                  <div style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 'bold', marginTop: 8 }}>
                    ⚠️ Esta OS está abaixo da margem mínima desejada. Considere ajustar os preços.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* OBSERVAÇÕES PARA IMPRESSÃO */}
        <div className="form-group" style={{ marginTop: 24 }}>
          <label className="form-label">Observações da OS (Visível na Impressão)</label>
          <textarea
            className="form-input form-textarea"
            value={publicNotes}
            onChange={e => setPublicNotes(e.target.value)}
            placeholder="Ex: Garantia de 3 meses, detalhes técnicos, peças trazidas pelo cliente..."
            style={{ minHeight: 60 }}
          />
        </div>

        <div className="total-display" style={{ marginTop: 10 }}>
          <span>Total Geral</span>
          <span>{formatMoney(totalRevenue)}</span>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn" onClick={handleConfirm} disabled={isSaving} title="Atalho: Ctrl + Shift + Enter">
            {isSaving ? '...' : 'Salvar (Ctrl+Shift+Enter)'}
          </button>
        </div>
      </div>
    </div>
  );
};
