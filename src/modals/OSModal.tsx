import React, { useState, useEffect, useMemo, useRef } from 'react';
import { WorkOrder, Client, OrderItem, CatalogItem, Technician, PartCategory, PART_CATEGORY_META, OSModalPayload } from '../types';
import { getLocalDateString, Money } from '../utils/helpers';
import { normalizeName, resolveCatalogItemId, resolveClientId, resolveTechnicianId, splitVehicle } from '../utils/links';
import type { OSDraftFromAppointment } from '../services/schedule';
import { appendNote } from '../services/agenda';
import { toISOFromDateInput, parseDateFlexible, formatDateOnly } from '../utils/dates';
import { MarginIndicator } from '../components/MarginIndicator';
import { PartCategorySelect } from '../components/PartCategorySelect';
import { VehicleCombobox, useShopVehicles } from '../components/VehicleCombobox';
import { computeOSMargin, formatPct, marginLabel, marginLevel, suggestPriceForTarget } from '../services/margin';
import { PriceSuggestion, suggestHistoricalPrice } from '../services/pricing';
import { useDirtyGuard } from '../hooks/useDirtyGuard';
import { costToInput, normalizeItemCost, parseCostEdit, parseCostInput, partialMarginNote } from '../services/marginView';

/** Sugestão discreta do histórico de vendas; só sugere, o botão grava apenas o preço da linha. */
const HistoryHint: React.FC<{
  suggestion: PriceSuggestion | null | undefined;
  currentPrice: number;
  formatMoney: (val: number) => string;
  onUse: (price: number) => void;
}> = ({ suggestion, currentPrice, formatMoney, onUse }) => {
  if (!suggestion) return null;
  const same = suggestion.price === currentPrice;
  return (
    <div className="margin-hist">
      <span>Histórico: {formatMoney(suggestion.price)} (mediana de {suggestion.samples} vendas)</span>
      <button
        type="button"
        disabled={same}
        onClick={() => onUse(suggestion.price)}
        aria-label={`Usar o preço do histórico, ${formatMoney(suggestion.price)}`}
        title={same ? 'O preço da linha já é este' : 'Aplica só o preço desta linha'}
      >
        Usar
      </button>
    </div>
  );
};

interface OSModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (osData: OSModalPayload) => void;
  editingOS: WorkOrder | null;
  clients: Client[];
  catalogParts: CatalogItem[];
  catalogServices: CatalogItem[];
  catalogTechnicians: Technician[];
  nextOSNumber: number;
  isSaving: boolean;
  formatMoney: (val: number) => string;
  /** Valores iniciais ao CRIAR (vindos de um agendamento). Ignorado ao editar. */
  draft?: OSDraftFromAppointment;
  /** Meta de margem global (%), das Configurações. */
  targetMargin: number;
  /** Todas as OS, para a sugestão de preço pelo histórico. */
  workOrders: WorkOrder[];
}

// 🆕 Issue #41: Ordem de exibição das categorias
const CATEGORY_ORDER: PartCategory[] = [
  'MOTOR', 'FREIO', 'SUSPENSAO', 'ELETRICA',
  'TRANSMISSAO', 'AR_CONDICIONADO', 'CARROCERIA', 'OUTROS'
];

export const OSModal: React.FC<OSModalProps> = ({
  isOpen, onClose, onSave, editingOS, clients, catalogParts, catalogServices, catalogTechnicians, nextOSNumber, isSaving, formatMoney, draft, targetMargin, workOrders
}) => {
  // --- REFS PARA ATALHOS ---
  const partInputRef = useRef<HTMLInputElement>(null);
  const serviceInputRef = useRef<HTMLInputElement>(null);
  const clientInputRef = useRef<HTMLInputElement>(null);
  // Motivo do agendamento a levar para a Obs. Interna (vazio = sem rascunho) e o último texto que o app mesmo preencheu.
  const pendingDraftNote = useRef("");
  const autoDraftNotes = useRef("");

  // --- ESTADOS DE DADOS ---
  const [osNumber, setOsNumber] = useState("");
  const [date, setDate] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [expectedDate, setExpectedDate] = useState(""); // previsão de entrega (AAAA-MM-DD do input; vazio = sem previsão)
  const [clientName, setClientName] = useState("");
  // Cliente escolhido quando há homônimos no cadastro (plano 4.6); vazio = sem escolha.
  const [chosenClientId, setChosenClientId] = useState("");
  const [contact, setContact] = useState("");
  const [technician, setTechnician] = useState("");
  const [notes, setNotes] = useState("");
  const [publicNotes, setPublicNotes] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [plate, setPlate] = useState("");
  const [mileage, setMileage] = useState("");
  const [advanceAmountDisplay, setAdvanceAmountDisplay] = useState(""); // 🆕 Campo de adiantamento (em reais, string)

  const [parts, setParts] = useState<OrderItem[]>([]);
  const [services, setServices] = useState<OrderItem[]>([]);
  const [showCostColumn, setShowCostColumn] = useState(true);

  // --- ESTADOS TEMPORÁRIOS ---
  const [tempPart, setTempPart] = useState({ description: '', price: '', cost: '', category: '' as PartCategory | '' });
  const [tempService, setTempService] = useState({ description: '', price: '', cost: '' });

  const toFloat = Money.toFloat;
  const fromFloat = Money.fromFloat;

  // --- CÁLCULOS FINANCEIROS MEMOIZADOS ---
  const partsTotal = useMemo(() => parts.reduce((acc, i) => acc + i.price, 0), [parts]);
  const servicesTotal = useMemo(() => services.reduce((acc, i) => acc + i.price, 0), [services]);
  const totalRevenue = useMemo(() => partsTotal + servicesTotal, [partsTotal, servicesTotal]);

  // Margem só dos itens COM custo (item sem custo fica fora da conta e é sinalizado).
  const margin = useMemo(() => computeOSMargin({ parts, services }), [parts, services]);
  const marginLvl = marginLevel(margin.marginPct, targetMargin);
  const partialNote = partialMarginNote(margin);
  const roi = margin.cost > 0 ? (margin.profit / margin.cost) * 100 : null;
  // Valor dos itens com custo que atingiria a meta, e quanto falta (ou sobra) em relação ao praticado.
  const minSuggestedRevenue = useMemo(() => suggestPriceForTarget(margin.cost, targetMargin), [margin.cost, targetMargin]);
  const revenueDifference = minSuggestedRevenue === null ? 0 : margin.costedRevenue - minSuggestedRevenue;

  // Sugestão pelo histórico (mediana de vendas finalizadas, 12 meses): por id de linha. A própria OS fica de fora.
  const today = useMemo(() => getLocalDateString(), [isOpen]);
  const historyOrders = useMemo(
    () => (editingOS ? workOrders.filter(o => o.id !== editingOS.id) : workOrders),
    [workOrders, editingOS]
  );
  const partHistory = useMemo(() => {
    const out: Record<string, PriceSuggestion | null> = {};
    if (!isOpen) return out;
    for (const p of parts) {
      if (p.description.trim()) out[p.id] = suggestHistoricalPrice({ kind: 'PART', catalogItemId: p.catalogItemId, description: p.description }, historyOrders, today);
    }
    return out;
  }, [isOpen, parts, historyOrders, today]);
  const serviceHistory = useMemo(() => {
    const out: Record<string, PriceSuggestion | null> = {};
    if (!isOpen) return out;
    for (const s of services) {
      if (s.description.trim()) out[s.id] = suggestHistoricalPrice({ kind: 'SERVICE', catalogItemId: s.catalogItemId, description: s.description }, historyOrders, today);
    }
    return out;
  }, [isOpen, services, historyOrders, today]);

  // 🆕 Issue #41: Agrupamento de peças por categoria
  const groupedParts = useMemo(() => {
    const groups: Partial<Record<PartCategory, { part: OrderItem; idx: number }[]>> = {};
    parts.forEach((p, idx) => {
      const cat: PartCategory = p.category ?? 'OUTROS';
      if (!groups[cat]) groups[cat] = [];
      groups[cat]!.push({ part: p, idx });
    });
    return CATEGORY_ORDER
      .filter(cat => groups[cat] && groups[cat]!.length > 0)
      .map(cat => ({ category: cat, items: groups[cat]! }));
  }, [parts]);

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

  // Clientes de mesmo nome (normalizado). Mais de um = homônimos: o usuário precisa escolher qual.
  const sameNameClients = useMemo(() => {
    const n = normalizeName(clientName);
    return n ? clients.filter(c => normalizeName(c.name) === n) : [];
  }, [clients, clientName]);
  const hasHomonyms = sameNameClients.length > 1;
  const selectedClient = useMemo(() => {
    if (sameNameClients.length === 1) return sameNameClients[0];
    return sameNameClients.find(c => c.id === chosenClientId);
  }, [sameNameClients, chosenClientId]);
  const needsClientChoice = hasHomonyms && !selectedClient;

  const suggestedVehicles = useMemo(() => selectedClient ? selectedClient.vehicles : [], [selectedClient]);
  const shopVehicles = useShopVehicles(clients, workOrders);

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
      setExpectedDate(editingOS.expectedDate ? formatDateOnly(parseDateFlexible(editingOS.expectedDate)) : "");
      setClientName(editingOS.clientName);

      // Por clientId; sem ele, pelo nome (só se único: homônimos não são adivinhados).
      const linkedId = resolveClientId(editingOS, clients);
      const client = linkedId ? clients.find(c => c.id === linkedId) : undefined;
      setChosenClientId(editingOS.clientId && clients.some(c => c.id === editingOS.clientId) ? editingOS.clientId : "");
      setContact(editingOS.clientPhone || client?.phone || "");
      setTechnician(editingOS.technician || "");
      setNotes(client?.notes || "");
      setPublicNotes(editingOS.publicNotes || "");

      // 🆕 Pré-preencher adiantamento (se existir na OS) em reais
      setAdvanceAmountDisplay(
        typeof editingOS.advanceAmount === 'number' && editingOS.advanceAmount > 0
          ? (editingOS.advanceAmount / 100).toString()
          : ""
      );

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
      setExpectedDate("");
      setClientName("");
      setChosenClientId("");
      setContact("");
      setTechnician("");
      setNotes("");
      setPublicNotes("");
      setVehicle("");
      setPlate("");
      setMileage("");
      setParts([]);
      setServices([]);
      setAdvanceAmountDisplay("");
    }
    // Rascunho (Agenda -> Criar OS): só valores iniciais ao CRIAR. clientId só vale se o cliente ainda existe.
    if (!editingOS && draft) {
      const draftClient = draft.clientId ? clients.find(c => c.id === draft.clientId) : undefined;
      setClientName(draft.clientName);
      setChosenClientId(draftClient ? draftClient.id : "");
      setContact(draft.clientPhone || draftClient?.phone || "");
      const dv = splitVehicle(draft.vehicle);
      setVehicle(dv.model);
      setPlate(dv.plate);
      // O motivo do agendamento vai para a Obs. Interna (nunca para as Observações da OS, que saem impressas),
      // acrescentado na linha de baixo das notas que o cliente já tem: aplicado no efeito de auto-preenchimento.
      pendingDraftNote.current = draft.notes.trim();
      autoDraftNotes.current = "";
    } else {
      // sem rascunho (ou edição): nunca herda motivo de uma abertura anterior
      pendingDraftNote.current = "";
      autoDraftNotes.current = "";
    }
    setTimeout(() => clientInputRef.current?.focus(), 100);
  }, [isOpen, editingOS, nextOSNumber, draft]);

  // Motivo vindo da Agenda: com o cliente conhecido, notas atuais dele + linha de baixo + motivo; cliente não cadastrado:
  // só o motivo; homônimo sem escolha: espera a escolha. Trocar a escolha refaz o texto para o NOVO cliente, mas só
  // enquanto a Obs. Interna estiver vazia ou ainda for a que este efeito preencheu (o que o usuário digitou é respeitado).
  // Isso também evita gravar as notas de um homônimo no cadastro do outro.
  useEffect(() => {
    const motivo = pendingDraftNote.current;
    if (!motivo || !clientName) return;
    let alvo: string | null = null;
    if (selectedClient) alvo = appendNote(selectedClient.notes, motivo);
    else if (!needsClientChoice) alvo = motivo;
    if (alvo === null) return;
    const novo = alvo;
    const anterior = autoDraftNotes.current;
    autoDraftNotes.current = novo;
    setNotes(prev => (prev === "" || prev === anterior ? novo : prev));
  }, [clientName, clients, selectedClient, needsClientChoice]);

  // Auto-preencher contato
  useEffect(() => {
    if (!clientName || contact) return;
    const client = selectedClient;
    if (client) {
      setContact(client.phone || "");
      if (!notes) setNotes(client.notes || "");
    }
  }, [clientName, clients, selectedClient]);

  // Auto-preencher placa
  useEffect(() => {
    if (!vehicle || plate || suggestedVehicles.length === 0) return;
    const match = suggestedVehicles.find(v => v.model.toLowerCase() === vehicle.toLowerCase());
    if (match && match.plate) setPlate(match.plate);
  }, [vehicle, suggestedVehicles]);

  const updateItem = (
    list: OrderItem[],
    setList: React.Dispatch<React.SetStateAction<OrderItem[]>>,
    index: number,
    field: keyof OrderItem,
    value: OrderItem[keyof OrderItem],
    catalog: CatalogItem[]
  ) => {
    const newList = [...list];
    newList[index] = { ...newList[index], [field]: value };

    if (field === 'description') {
      const match = catalog.find(c => c.description.toLowerCase() === (value as string).toLowerCase());
      // O vínculo com o catálogo só vale enquanto a descrição casar com UM item; editada para outra coisa, perde.
      const linkId = resolveCatalogItemId({ description: value as string }, catalog);
      if (linkId) newList[index].catalogItemId = linkId;
      else delete newList[index].catalogItemId;
      if (match) {
        newList[index].price = match.price;
        // Custo só se o catálogo tiver; sem custo no catálogo, a linha continua sem custo (nunca 0).
        if (match.cost && match.cost > 0) newList[index].cost = match.cost;
        // 🆕 Issue #42: auto-fill category se o item ainda não tem uma
        if (match.category && !newList[index].category) {
          newList[index].category = match.category;
        }
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
      const partLinkId = resolveCatalogItemId({ description: tempPart.description }, catalogParts);
      const newItem: OrderItem = {
        id: crypto.randomUUID(),
        ...(partLinkId ? { catalogItemId: partLinkId } : {}),
        description: tempPart.description,
        price: fromFloat(priceVal),
        cost: parseCostInput(tempPart.cost),
        category: tempPart.category || undefined
      };
      setParts(prev => [...prev, newItem]);
      setTempPart({ description: '', price: '', cost: '', category: '' });
      if (e.shiftKey) serviceInputRef.current?.focus(); else partInputRef.current?.focus();
    }
  };

  const handleServiceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!tempService.description) return;
      const priceVal = parseFloat(tempService.price.replace(',', '.')) || 0;
      const serviceLinkId = resolveCatalogItemId({ description: tempService.description }, catalogServices);
      const newItem: OrderItem = {
        id: crypto.randomUUID(),
        ...(serviceLinkId ? { catalogItemId: serviceLinkId } : {}),
        description: tempService.description,
        price: fromFloat(priceVal),
        cost: parseCostInput(tempService.cost)
      };
      setServices(prev => [...prev, newItem]);
      setTempService({ description: '', price: '', cost: '' });
      if (e.shiftKey) partInputRef.current?.focus(); else serviceInputRef.current?.focus();
    }
  };

  const handleTempPartChange = (val: string) => {
    const match = catalogParts.find(c => c.description.toLowerCase() === val.toLowerCase());
    setTempPart({
      ...tempPart,
      description: val,
      price: match ? (match.price / 100).toString() : tempPart.price,
      cost: match ? costToInput(match.cost) : tempPart.cost,
      // 🆕 Issue #42: auto-fill categoria aprendida do catálogo
      category: match?.category ?? tempPart.category
    });
  };

  const handleTempServiceChange = (val: string) => {
    const match = catalogServices.find(c => c.description.toLowerCase() === val.toLowerCase());
    setTempService({
      description: val,
      price: match ? (match.price / 100).toString() : tempService.price,
      cost: match ? costToInput(match.cost) : tempService.cost
    });
  };

  const handleConfirm = () => {
    if (!clientName || !vehicle) { alert("Preencha cliente e veículo."); return; }
    if (needsClientChoice) { alert("Há mais de um cliente com esse nome. Escolha o cliente em \"Qual cliente?\"."); return; }
    const numOS = parseInt(osNumber, 10);
    if (isNaN(numOS)) { alert("Número OS inválido."); return; }
    const fullVehicle = plate ? `${vehicle} - ${plate.toUpperCase()}` : vehicle;

    const advanceAmount = (() => {
      const trimmed = advanceAmountDisplay.trim();
      if (!trimmed) return undefined;
      const val = parseFloat(trimmed.replace(',', '.'));
      if (isNaN(val) || val <= 0) return undefined;
      return fromFloat(val);
    })();

    onSave({
      osNumber: numOS,
      createdAt: date,
      paymentDate: paymentDate ? toISOFromDateInput(paymentDate) : undefined,
      expectedDate: expectedDate ? toISOFromDateInput(expectedDate) : undefined,
      clientId: selectedClient?.id,
      technicianId: resolveTechnicianId(technician, catalogTechnicians),
      clientName,
      clientPhone: contact,
      clientNotes: notes,
      vehicle: fullVehicle,
      vehicleModelOnly: vehicle,
      plate: plate.toUpperCase(),
      mileage: parseInt(mileage, 10) || 0,
      parts: parts.filter(p => p.description.trim() !== "").map(normalizeItemCost),
      services: services.filter(s => s.description.trim() !== "").map(normalizeItemCost),
      publicNotes,
      technician: technician.trim() || undefined,
      advanceAmount,
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
  }, [isOpen, clientName, vehicle, parts, services, osNumber, publicNotes, technician, advanceAmountDisplay, selectedClient, needsClientChoice]);

  // Esc, Cancelar: pergunta antes de descartar o que foi digitado. Salvar fecha direto (handleConfirm -> onSave).
  // resetKey estável (string): recarregar o formulário com a janela aberta (outra OS, outro rascunho) zera a flag.
  const guard = useDirtyGuard({
    active: isOpen,
    onClose,
    resetKey: editingOS ? `os:${editingOS.id}` : draft ? `draft:${draft.clientName}|${draft.vehicle}|${draft.notes}` : 'nova',
  });

  if (!isOpen) return null;

  return (
    <>
    <div className="modal-overlay" ref={guard.overlayRef}>
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
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label" htmlFor="os-expected-date">🚚 Previsão de entrega <span style={{ opacity: 0.6, fontSize: '0.8rem' }}>(Opcional)</span></label>
            <input
              id="os-expected-date"
              className="form-input"
              type="date"
              value={expectedDate}
              onChange={e => setExpectedDate(e.target.value)}
              style={{ color: 'var(--text-main)' }}
            />
          </div>
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label">Cliente</label>
            <input ref={clientInputRef} className="form-input" list="clients_list" value={clientName} onChange={e => setClientName(e.target.value)} autoFocus={!editingOS} />
            <datalist id="clients_list">{[...new Set(suggestedClients.map(c => c.name))].map(n => <option key={n} value={n} />)}</datalist>
          </div>
        </div>

        {hasHomonyms && (
          <fieldset
            className="form-group"
            style={{ border: '1px solid var(--warning, var(--border))', borderRadius: 6, padding: '8px 12px', margin: '0 0 12px' }}
          >
            <legend className="form-label" style={{ padding: '0 6px' }}>Qual cliente?</legend>
            <div role="radiogroup" aria-label="Qual cliente?" aria-required="true" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sameNameClients.map(c => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input
                    type="radio"
                    name="os-client-choice"
                    checked={chosenClientId === c.id}
                    onChange={() => { setChosenClientId(c.id); setContact(c.phone || ""); }}
                  />
                  <span>
                    <strong>{c.name}</strong> · {c.phone ? c.phone : 'sem telefone'}
                    <br />
                    <span style={{ color: 'var(--text-muted)' }}>
                      {c.vehicles.length > 0 ? c.vehicles.map(v => (v.plate ? `${v.model} - ${v.plate}` : v.model)).join(', ') : 'sem veículos'}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {needsClientChoice && (
              <small role="alert" style={{ display: 'block', marginTop: 6, color: 'var(--danger, #e53935)' }}>
                Existe mais de um cliente com este nome. Escolha qual é para poder salvar a OS.
              </small>
            )}
          </fieldset>
        )}

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

        {/* Campo sutil de adiantamento */}
        <div className="form-group" style={{ marginTop: 8 }}>
          <label className="form-label">💵 Valor adiantado (Opcional)</label>
          <input
            className="form-input"
            type="number"
            min="0"
            step="0.01"
            value={advanceAmountDisplay}
            onChange={e => setAdvanceAmountDisplay(e.target.value)}
            placeholder="Ex: 200,00"
          />
          <small style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Use apenas se o cliente já deixou algum valor adiantado. Deixe vazio se não houver adiantamento.
          </small>
        </div>

        <div className="form-group">
          <label className="form-label">Obs. Interna (Visível apenas aqui)</label>
          <textarea className="form-input form-textarea" value={notes} onChange={e => setNotes(e.target.value)} style={{ minHeight: 60 }} />
        </div>

        {/* VEÍCULO */}
        <div style={{ display: 'flex', gap: 16 }}>
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label">Veículo</label>
            <VehicleCombobox id="os-vehicle" value={vehicle} onChange={v => { if (v !== vehicle) guard.markDirty(); setVehicle(v); }} clientVehicles={suggestedVehicles} shopVehicles={shopVehicles} />
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

        {/* Meta de margem (global, das Configurações) */}
        <div className="margin-goal-note">
          Meta de margem: <strong>{targetMargin}%</strong> (altere em Config)
        </div>

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

            {/* Linha de nova peça */}
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

              <PartCategorySelect
                value={tempPart.category}
                onChange={cat => { if (cat !== tempPart.category) guard.markDirty(); setTempPart({ ...tempPart, category: cat }); }}
                style={{ flex: 0.8 }}
              />

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

            {/* 🆕 Issue #41: Listagem agrupada por categoria */}
            <div style={{ maxHeight: 250, overflowY: 'auto' }}>
              {groupedParts.map(({ category: cat, items }) => (
                <div key={cat}>

                  {/*
                   * Cabeçalho do grupo:
                   * className="category-group-header" + --category-color no style.
                   * Toda a aparência (borda, cor, fonte) vive em styles-part-categories.css.
                   */}
                  <div
                    className="category-group-header"
                    style={{ '--category-color': PART_CATEGORY_META[cat].color } as React.CSSProperties}
                  >
                    {PART_CATEGORY_META[cat].label}
                  </div>

                  {items.map(({ part: p, idx: i }) => (
                    <div key={p.id} style={{ marginBottom: showCostColumn ? '12px' : '0' }}>
                      {/*
                       * Linha de peça:
                       * className="item-row part-row" + --category-color no style.
                       * A borda esquerda colorida vive em styles-part-categories.css.
                       */}
                      <div
                        className="item-row part-row"
                        style={{
                          '--category-color': PART_CATEGORY_META[p.category ?? 'OUTROS'].color
                        } as React.CSSProperties}
                      >
                        <input
                          className="form-input"
                          value={p.description}
                          onChange={e => updateItem(parts, setParts, i, 'description', e.target.value, catalogParts)}
                          style={{ flex: 2 }}
                        />

                        <PartCategorySelect
                          value={p.category ?? ''}
                          onChange={cat => { guard.markDirty(); updateItem(parts, setParts, i, 'category', cat || undefined, catalogParts); }}
                          style={{ flex: 0.7 }}
                          placeholder="—"
                        />

                        {showCostColumn && (
                          <input
                            className="form-input margin-cost-field"
                            type="number"
                            min="0"
                            step="0.01"
                            value={p.cost === undefined ? '' : toFloat(p.cost)}
                            onChange={e => updateItem(parts, setParts, i, 'cost', parseCostEdit(e.target.value), catalogParts)}
                            style={{ flex: 0.8, fontSize: '0.85rem' }}
                            placeholder="Custo"
                            title="Custo interno de aquisição (vazio = sem custo, fora da margem)"
                            aria-label={`Custo de ${p.description || 'peça'}`}
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
                          onClick={() => { guard.markDirty(); setParts(parts.filter((_, idx) => idx !== i)); }}
                          tabIndex={-1}
                        >
                          x
                        </button>
                      </div>

                      <HistoryHint
                        suggestion={partHistory[p.id]}
                        currentPrice={p.price}
                        formatMoney={formatMoney}
                        onUse={(price) => { guard.markDirty(); updateItem(parts, setParts, i, 'price', price, catalogParts); }}
                      />

                      {showCostColumn && p.description.trim() !== '' && (
                        <MarginIndicator
                          cost={p.cost}
                          price={p.price}
                          formatMoney={formatMoney}
                          minMarginPercent={targetMargin}
                          onSuggestPrice={(suggestedPrice) => {
                            guard.markDirty();
                            updateItem(parts, setParts, i, 'price', suggestedPrice, catalogParts);
                          }}
                        />
                      )}
                    </div>
                  ))}
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
                        className="form-input margin-cost-field"
                        type="number"
                        min="0"
                        step="0.01"
                        value={s.cost === undefined ? '' : toFloat(s.cost)}
                        onChange={e => updateItem(services, setServices, i, 'cost', parseCostEdit(e.target.value), catalogServices)}
                        style={{ flex: 0.8, fontSize: '0.85rem' }}
                        placeholder="Custo"
                        title="Custo interno (vazio = sem custo, fora da margem)"
                        aria-label={`Custo de ${s.description || 'serviço'}`}
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
                      onClick={() => { guard.markDirty(); setServices(services.filter((_, idx) => idx !== i)); }}
                      tabIndex={-1}
                    >
                      x
                    </button>
                  </div>

                  <HistoryHint
                    suggestion={serviceHistory[s.id]}
                    currentPrice={s.price}
                    formatMoney={formatMoney}
                    onUse={(price) => { guard.markDirty(); updateItem(services, setServices, i, 'price', price, catalogServices); }}
                  />

                  {showCostColumn && s.description.trim() !== '' && (
                    <MarginIndicator
                      cost={s.cost}
                      price={s.price}
                      formatMoney={formatMoney}
                      minMarginPercent={targetMargin}
                      onSuggestPrice={(suggestedPrice) => {
                        guard.markDirty();
                        updateItem(services, setServices, i, 'price', suggestedPrice, catalogServices);
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ANÁLISE FINANCEIRA */}
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
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Custo (itens com custo)</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-main)' }}>
                  {formatMoney(margin.cost)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Lucro Bruto (itens com custo)</div>
                <div className={`margin-text--${marginLvl.toLowerCase()}`} style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
                  {formatMoney(margin.profit)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ROI</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-main)' }}>
                  {roi === null ? 'Sem custo' : `${formatPct(roi)}%`}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Margem de Lucro: <strong className={`margin-text--${marginLvl.toLowerCase()}`}>{marginLabel(marginLvl, margin.marginPct)}</strong>
              {' '}(meta {targetMargin}%)
            </div>
            {partialNote && <div className="margin-partial-note" role="status">{partialNote}</div>}

            {minSuggestedRevenue !== null && margin.marginPct !== null && (
              <div className={`margin-min-box${marginLvl === 'ABAIXO' || marginLvl === 'ATENCAO' ? ' margin-min-box--abaixo' : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>
                      🎯 Valor Mínimo Sugerido ({targetMargin}% margem{partialNote ? ', só itens com custo' : ''})
                    </div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                      {formatMoney(minSuggestedRevenue)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {revenueDifference >= 0 ? 'Acima do mínimo' : 'Abaixo do mínimo'}
                    </div>
                    <div className={revenueDifference >= 0 ? 'margin-text--na_meta' : 'margin-text--abaixo'} style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
                      {revenueDifference >= 0 ? '+' : ''}{formatMoney(revenueDifference)}
                    </div>
                  </div>
                </div>
                {marginLvl !== 'NA_META' && (
                  <div className="margin-min-box__alert" role="status">
                    ⚠️ Esta OS está abaixo da meta de margem ({targetMargin}%). Considere ajustar os preços. Você ainda pode salvar.
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
          <button className="btn-secondary" onClick={guard.requestClose}>Cancelar</button>
          <button className="btn" onClick={handleConfirm} disabled={isSaving || needsClientChoice} title="Atalho: Ctrl + Shift + Enter">
            {isSaving ? '...' : 'Salvar (Ctrl+Shift+Enter)'}
          </button>
        </div>
      </div>
    </div>
    {guard.dialog}
    </>
  );
};
