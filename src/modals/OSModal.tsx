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
import { firstErrorField, OSFieldErrors, OSFieldId, parsePriceText, sanitizeMoneyText, validateOSFields } from '../services/osModalView';
import { MoneyField } from '../components/MoneyField';
import { Icon } from '../components/ui/Icon';

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
  const [showProfit, setShowProfit] = useState(false); // análise de lucro recolhida por padrão
  const [errors, setErrors] = useState<OSFieldErrors>({});
  const clearError = (f: OSFieldId) => setErrors(prev => (prev[f] ? { ...prev, [f]: undefined } : prev));

  // --- ESTADOS TEMPORÁRIOS ---
  const [tempPart, setTempPart] = useState({ description: '', price: '', cost: '', category: '' as PartCategory | '' });
  const [tempService, setTempService] = useState({ description: '', price: '', cost: '' });

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
    setErrors({});
    setShowProfit(false);

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
  const addPart = (toServices: boolean) => {
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
    if (toServices) serviceInputRef.current?.focus(); else partInputRef.current?.focus();
  };

  const addService = (toParts: boolean) => {
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
    if (toParts) partInputRef.current?.focus(); else serviceInputRef.current?.focus();
  };

  const handlePartKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); addPart(e.shiftKey); }
  };

  const handleServiceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); addService(e.shiftKey); }
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
    const found = validateOSFields({ clientName, vehicle, needsClientChoice, osNumber });
    const first = firstErrorField(found);
    if (first) {
      setErrors(found);
      document.getElementById(first)?.focus();
      return;
    }
    setErrors({});
    const numOS = parseInt(osNumber, 10);
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

  const costToggle = (
    <label className="osm-check">
      <input type="checkbox" checked={showCostColumn} onChange={e => setShowCostColumn(e.target.checked)} />
      Mostrar custos
    </label>
  );

  const removeBtn = (onClick: () => void, desc: string) => (
    <button type="button" className="osm-remove" onClick={onClick} aria-label={`Remover item ${desc}`.trim()} title="Remover item">
      <Icon name="excluir" size={18} />
    </button>
  );

  return (
    <>
    <div className="modal-overlay" ref={guard.overlayRef}>
      <div className="modal-content osm" role="dialog" aria-modal="true" aria-labelledby="os-modal-title" style={{ maxWidth: '1100px', width: '95%' }}>
        <header className="osm-head">
          <h2 id="os-modal-title" className="modal-title">{editingOS ? "Editar OS" : "Nova OS"}</h2>
          <div className="osm-meta">
            <div className="osm-meta-field">
              <label htmlFor="os-number">Nº da OS</label>
              <input id="os-number" className="form-input" inputMode="numeric" value={osNumber}
                aria-invalid={errors['os-number'] ? true : undefined} aria-describedby={errors['os-number'] ? 'os-number-error' : undefined}
                onChange={e => { setOsNumber(e.target.value); clearError('os-number'); }} />
            </div>
            <div className="osm-meta-field">
              <label htmlFor="os-date">Data</label>
              <input id="os-date" className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          {errors['os-number'] && <p id="os-number-error" className="field-error osm-head-error" role="alert">{errors['os-number']}</p>}
        </header>

        {/* 1. CLIENTE E VEÍCULO */}
        <section className="osm-section" aria-labelledby="osm-h-cliente">
          <h3 id="osm-h-cliente" className="osm-h"><Icon name="clientes" size={18} /> Cliente e veículo</h3>
          <div className="osm-grid">
            <div className="form-group osm-w2">
              <label className="form-label" htmlFor="os-client">Cliente</label>
              <input ref={clientInputRef} id="os-client" className="form-input" list="clients_list" value={clientName}
                aria-invalid={errors['os-client'] ? true : undefined} aria-describedby={errors['os-client'] ? 'os-client-error' : undefined}
                onChange={e => { setClientName(e.target.value); clearError('os-client'); clearError('os-client-choice'); }} autoFocus={!editingOS} />
              <datalist id="clients_list">{[...new Set(suggestedClients.map(c => c.name))].map(n => <option key={n} value={n} />)}</datalist>
              {errors['os-client'] && <p id="os-client-error" className="field-error" role="alert">{errors['os-client']}</p>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="os-contact">Contato / Telefone</label>
              <input id="os-contact" className="form-input" value={contact} onChange={e => setContact(e.target.value)} />
            </div>
          </div>

          {hasHomonyms && (
            <fieldset className="osm-homonyms">
              <legend className="form-label">Qual cliente?</legend>
              <div role="radiogroup" aria-label="Qual cliente?" aria-required="true" aria-describedby="os-client-choice-error" className="osm-radios">
                {sameNameClients.map((c, idx) => (
                  <label key={c.id} className="osm-radio">
                    <input
                      id={idx === 0 ? 'os-client-choice' : undefined}
                      type="radio"
                      name="os-client-choice"
                      checked={chosenClientId === c.id}
                      onChange={() => { setChosenClientId(c.id); setContact(c.phone || ""); clearError('os-client-choice'); }}
                    />
                    <span>
                      <strong>{c.name}</strong> · {c.phone ? c.phone : 'sem telefone'}
                      <br />
                      <span className="osm-muted">
                        {c.vehicles.length > 0 ? c.vehicles.map(v => (v.plate ? `${v.model} - ${v.plate}` : v.model)).join(', ') : 'sem veículos'}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {needsClientChoice && (
                <p id="os-client-choice-error" className="field-error" role="alert">
                  Existe mais de um cliente com este nome. Escolha qual é para poder salvar a OS.
                </p>
              )}
            </fieldset>
          )}

          <div className="osm-grid">
            <div className="form-group osm-w2">
              <label className="form-label" htmlFor="os-vehicle">Veículo</label>
              <VehicleCombobox id="os-vehicle" value={vehicle}
                invalid={!!errors['os-vehicle']} describedBy={errors['os-vehicle'] ? 'os-vehicle-error' : undefined}
                onChange={v => { if (v !== vehicle) guard.markDirty(); setVehicle(v); clearError('os-vehicle'); }}
                clientVehicles={suggestedVehicles} shopVehicles={shopVehicles} />
              {errors['os-vehicle'] && <p id="os-vehicle-error" className="field-error" role="alert">{errors['os-vehicle']}</p>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="os-plate">Placa</label>
              <input id="os-plate" className="form-input" value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} maxLength={8} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="os-km">Km</label>
              <input id="os-km" className="form-input" type="number" value={mileage} onChange={e => setMileage(e.target.value)} />
            </div>
          </div>
        </section>

        {/* 2. O QUE SERÁ FEITO */}
        <section className="osm-section" aria-labelledby="osm-h-itens">
          <div className="osm-h-row">
            <h3 id="osm-h-itens" className="osm-h"><Icon name="oficina" size={18} /> O que será feito</h3>
            {costToggle}
          </div>
          <div className="form-group osm-tech">
            <label className="form-label" htmlFor="os-tech">Técnico responsável <span className="osm-opt">(opcional)</span></label>
            <input id="os-tech" className="form-input" list="tech_list" value={technician} onChange={e => setTechnician(e.target.value)} />
            <datalist id="tech_list">{suggestedTechnicians.map(t => <option key={t.id} value={t.name} />)}</datalist>
          </div>
          {showCostColumn && (
            <div className="margin-goal-note">Meta de margem: <strong>{targetMargin}%</strong> (altere em Config)</div>
          )}

          <div className="osm-columns">
            {/* PEÇAS */}
            <div className="items-list-container osm-box osm-box--parts">
              <div className="items-header osm-box-head">
                <span><Icon name="pecas" size={16} /> Peças</span>
                <span>{formatMoney(partsTotal)}</span>
              </div>

              <div className="item-row osm-row osm-add">
                <label className="sr-only" htmlFor="os-new-part">Nova peça</label>
                <input id="os-new-part" ref={partInputRef} className="form-input osm-desc" list="cat-parts" value={tempPart.description}
                  onChange={e => handleTempPartChange(e.target.value)} onKeyDown={handlePartKeyDown} placeholder="Nova peça (Enter)..." />
                <datalist id="cat-parts">
                  {suggestedParts.map((cp, idx) => (
                    <option key={idx} value={cp.description}>{formatMoney(cp.price)}</option>
                  ))}
                </datalist>
                <PartCategorySelect
                  ariaLabel="Categoria da nova peça"
                  value={tempPart.category}
                  onChange={cat => { if (cat !== tempPart.category) guard.markDirty(); setTempPart({ ...tempPart, category: cat }); }}
                  style={{ flex: '1 1 140px' }}
                />
                {showCostColumn && (
                  <input className="form-input osm-num" type="text" inputMode="decimal" aria-label="Custo da nova peça" value={tempPart.cost}
                    onChange={e => setTempPart({ ...tempPart, cost: sanitizeMoneyText(e.target.value) })} onKeyDown={handlePartKeyDown} placeholder="Custo" />
                )}
                <input className="form-input osm-num" type="text" inputMode="decimal" aria-label="Preço da nova peça" value={tempPart.price}
                  onChange={e => setTempPart({ ...tempPart, price: sanitizeMoneyText(e.target.value) })} onKeyDown={handlePartKeyDown} placeholder="Preço" />
                <button type="button" className="btn-secondary osm-add-btn" onClick={() => { guard.markDirty(); addPart(false); }}>
                  <Icon name="adicionar" size={16} /> Adicionar
                </button>
              </div>

              <div className="osm-list">
                {groupedParts.map(({ category: cat, items }) => (
                  <div key={cat}>
                    <div className="category-group-header" style={{ '--category-color': PART_CATEGORY_META[cat].color } as React.CSSProperties}>
                      {PART_CATEGORY_META[cat].label}
                    </div>
                    {items.map(({ part: p, idx: i }) => (
                      <div key={p.id} className="osm-item">
                        <div className="item-row part-row osm-row" style={{ '--category-color': PART_CATEGORY_META[p.category ?? 'OUTROS'].color } as React.CSSProperties}>
                          <input className="form-input osm-desc" aria-label="Descrição da peça" value={p.description}
                            onChange={e => updateItem(parts, setParts, i, 'description', e.target.value, catalogParts)} />
                          <PartCategorySelect
                            ariaLabel={`Categoria de ${p.description || 'peça'}`}
                            value={p.category ?? ''}
                            onChange={cat2 => { guard.markDirty(); updateItem(parts, setParts, i, 'category', cat2 || undefined, catalogParts); }}
                            style={{ flex: '1 1 140px' }}
                            placeholder="—"
                          />
                          {showCostColumn && (
                            <MoneyField className="form-input margin-cost-field osm-num" value={p.cost} parse={parseCostEdit}
                              onChange={c => updateItem(parts, setParts, i, 'cost', c, catalogParts)}
                              placeholder="Custo" title="Custo interno de aquisição (vazio = sem custo, fora da margem)"
                              aria-label={`Custo de ${p.description || 'peça'}`} />
                          )}
                          <MoneyField className="form-input osm-num" value={p.price} parse={parsePriceText}
                            onChange={c => updateItem(parts, setParts, i, 'price', c ?? 0, catalogParts)}
                            aria-label={`Preço de ${p.description || 'peça'}`} />
                          {removeBtn(() => { guard.markDirty(); setParts(parts.filter((_, idx) => idx !== i)); }, p.description)}
                        </div>
                        <HistoryHint suggestion={partHistory[p.id]} currentPrice={p.price} formatMoney={formatMoney}
                          onUse={(price) => { guard.markDirty(); updateItem(parts, setParts, i, 'price', price, catalogParts); }} />
                        {showCostColumn && p.description.trim() !== '' && (
                          <MarginIndicator cost={p.cost} price={p.price} formatMoney={formatMoney} minMarginPercent={targetMargin}
                            onSuggestPrice={(sp) => { guard.markDirty(); updateItem(parts, setParts, i, 'price', sp, catalogParts); }} />
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* SERVIÇOS */}
            <div className="items-list-container osm-box osm-box--services">
              <div className="items-header osm-box-head">
                <span><Icon name="chave" size={16} /> Serviços</span>
                <span>{formatMoney(servicesTotal)}</span>
              </div>

              <div className="item-row osm-row osm-add">
                <label className="sr-only" htmlFor="os-new-service">Novo serviço</label>
                <input id="os-new-service" ref={serviceInputRef} className="form-input osm-desc" list="cat-serv" value={tempService.description}
                  onChange={e => handleTempServiceChange(e.target.value)} onKeyDown={handleServiceKeyDown} placeholder="Novo serviço (Enter)..." />
                <datalist id="cat-serv">
                  {suggestedServices.map((cs, idx) => (
                    <option key={idx} value={cs.description}>{formatMoney(cs.price)}</option>
                  ))}
                </datalist>
                {showCostColumn && (
                  <input className="form-input osm-num" type="text" inputMode="decimal" aria-label="Custo do novo serviço" value={tempService.cost}
                    onChange={e => setTempService({ ...tempService, cost: sanitizeMoneyText(e.target.value) })} onKeyDown={handleServiceKeyDown} placeholder="Custo" />
                )}
                <input className="form-input osm-num" type="text" inputMode="decimal" aria-label="Preço do novo serviço" value={tempService.price}
                  onChange={e => setTempService({ ...tempService, price: sanitizeMoneyText(e.target.value) })} onKeyDown={handleServiceKeyDown} placeholder="Preço" />
                <button type="button" className="btn-secondary osm-add-btn" onClick={() => { guard.markDirty(); addService(false); }}>
                  <Icon name="adicionar" size={16} /> Adicionar
                </button>
              </div>

              <div className="osm-list">
                {services.map((s, i) => (
                  <div key={s.id} className="osm-item">
                    <div className="item-row osm-row">
                      <input className="form-input osm-desc" aria-label="Descrição do serviço" value={s.description}
                        onChange={e => updateItem(services, setServices, i, 'description', e.target.value, catalogServices)} />
                      {showCostColumn && (
                        <MoneyField className="form-input margin-cost-field osm-num" value={s.cost} parse={parseCostEdit}
                          onChange={c => updateItem(services, setServices, i, 'cost', c, catalogServices)}
                          placeholder="Custo" title="Custo interno (vazio = sem custo, fora da margem)"
                          aria-label={`Custo de ${s.description || 'serviço'}`} />
                      )}
                      <MoneyField className="form-input osm-num" value={s.price} parse={parsePriceText}
                        onChange={c => updateItem(services, setServices, i, 'price', c ?? 0, catalogServices)}
                        aria-label={`Preço de ${s.description || 'serviço'}`} />
                      {removeBtn(() => { guard.markDirty(); setServices(services.filter((_, idx) => idx !== i)); }, s.description)}
                    </div>
                    <HistoryHint suggestion={serviceHistory[s.id]} currentPrice={s.price} formatMoney={formatMoney}
                      onUse={(price) => { guard.markDirty(); updateItem(services, setServices, i, 'price', price, catalogServices); }} />
                    {showCostColumn && s.description.trim() !== '' && (
                      <MarginIndicator cost={s.cost} price={s.price} formatMoney={formatMoney} minMarginPercent={targetMargin}
                        onSuggestPrice={(sp) => { guard.markDirty(); updateItem(services, setServices, i, 'price', sp, catalogServices); }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 3. VALORES */}
        <section className="osm-section" aria-labelledby="osm-h-valores">
          <h3 id="osm-h-valores" className="osm-h"><Icon name="cifrao" size={18} /> Valores</h3>
          <div className="form-group osm-advance">
            <label className="form-label" htmlFor="os-advance">Valor adiantado <span className="osm-opt">(opcional)</span></label>
            <input id="os-advance" className="form-input" type="text" inputMode="decimal" autoComplete="off" value={advanceAmountDisplay}
              onChange={e => setAdvanceAmountDisplay(sanitizeMoneyText(e.target.value))} placeholder="Ex: 200,00" aria-describedby="os-advance-hint" />
            <small id="os-advance-hint" className="field-hint">Use só se o cliente já deixou algum valor. Deixe vazio se não houver.</small>
          </div>

          {showCostColumn && (
            <div className="osm-profit">
              <button type="button" className="btn-secondary osm-profit-toggle" aria-expanded={showProfit} aria-controls="osm-profit-body"
                onClick={() => setShowProfit(v => !v)}>
                <Icon name="financeiro" size={16} /> {showProfit ? 'Esconder lucro e margem' : 'Ver lucro e margem'}
              </button>
              {showProfit && (
                <div id="osm-profit-body" className="osm-profit-body">
                  <div className="osm-profit-grid">
                    <div><div className="osm-k">Receita total</div><div className="osm-v osm-v--ok">{formatMoney(totalRevenue)}</div></div>
                    <div><div className="osm-k">Custo (itens com custo)</div><div className="osm-v">{formatMoney(margin.cost)}</div></div>
                    <div><div className="osm-k">Lucro bruto (itens com custo)</div><div className={`osm-v margin-text--${marginLvl.toLowerCase()}`}>{formatMoney(margin.profit)}</div></div>
                    <div><div className="osm-k">Retorno sobre o custo</div><div className="osm-v">{roi === null ? 'Sem custo' : `${formatPct(roi)}%`}</div></div>
                  </div>
                  <div className="osm-profit-line">
                    Margem de lucro: <strong className={`margin-text--${marginLvl.toLowerCase()}`}>{marginLabel(marginLvl, margin.marginPct)}</strong> (meta {targetMargin}%)
                  </div>
                  {partialNote && <div className="margin-partial-note" role="status">{partialNote}</div>}
                  {minSuggestedRevenue !== null && margin.marginPct !== null && (
                    <div className={`margin-min-box${marginLvl === 'ABAIXO' || marginLvl === 'ATENCAO' ? ' margin-min-box--abaixo' : ''}`}>
                      <div className="osm-min-row">
                        <div>
                          <div className="osm-k osm-k--up">Valor mínimo sugerido ({targetMargin}% de margem{partialNote ? ', só itens com custo' : ''})</div>
                          <div className="osm-v osm-v--big">{formatMoney(minSuggestedRevenue)}</div>
                        </div>
                        <div className="osm-min-diff">
                          <div className="osm-k">{revenueDifference >= 0 ? 'Acima do mínimo' : 'Abaixo do mínimo'}</div>
                          <div className={`osm-v ${revenueDifference >= 0 ? 'margin-text--na_meta' : 'margin-text--abaixo'}`}>
                            {revenueDifference >= 0 ? '+' : ''}{formatMoney(revenueDifference)}
                          </div>
                        </div>
                      </div>
                      {marginLvl !== 'NA_META' && (
                        <div className="margin-min-box__alert osm-alert" role="status">
                          <Icon name="alerta" size={16} /> Esta OS está abaixo da meta de margem ({targetMargin}%). Considere ajustar os preços. Você ainda pode salvar.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="total-display osm-total">
            <span>Total geral</span>
            <span>{formatMoney(totalRevenue)}</span>
          </div>
        </section>

        {/* 4. PRAZO E PAGAMENTO */}
        <section className="osm-section" aria-labelledby="osm-h-prazo">
          <h3 id="osm-h-prazo" className="osm-h"><Icon name="calendario" size={18} /> Prazo e pagamento</h3>
          <div className="osm-grid">
            <div className="form-group">
              <label className="form-label osm-nowrap" htmlFor="os-expected-date">Previsão de entrega <span className="osm-opt">(opcional)</span></label>
              <input id="os-expected-date" className="form-input" type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label osm-nowrap" htmlFor="os-payment-date">Data de pagamento <span className="osm-opt">(opcional)</span></label>
              <input id="os-payment-date" className="form-input" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
            </div>
          </div>
        </section>

        {/* 5. OBSERVAÇÕES */}
        <section className="osm-section" aria-labelledby="osm-h-obs">
          <h3 id="osm-h-obs" className="osm-h"><Icon name="prancheta" size={18} /> Observações</h3>
          <div className="form-group">
            <label className="form-label" htmlFor="os-notes">Obs. interna (visível só aqui)</label>
            <textarea id="os-notes" className="form-input form-textarea" value={notes} onChange={e => setNotes(e.target.value)} style={{ minHeight: 60 }} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="os-public-notes">Observações da OS (visíveis na impressão)</label>
            <textarea id="os-public-notes" className="form-input form-textarea" value={publicNotes} onChange={e => setPublicNotes(e.target.value)}
              placeholder="Ex: Garantia de 3 meses, detalhes técnicos, peças trazidas pelo cliente..." style={{ minHeight: 60 }} />
          </div>
        </section>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={guard.requestClose}>Cancelar</button>
          <button type="button" className="btn" onClick={handleConfirm} disabled={isSaving || needsClientChoice} aria-busy={isSaving} title="Atalho: Ctrl + Shift + Enter">
            {isSaving ? 'Salvando...' : 'Salvar (Ctrl+Shift+Enter)'}
          </button>
        </div>
      </div>
    </div>
    {guard.dialog}
    </>
  );
};
