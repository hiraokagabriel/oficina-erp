import React, { useState, useEffect, useMemo, useRef } from 'react';
import { WorkOrder, LedgerEntry, Client, OrderItem, CatalogItem, Technician, PartCategory, PART_CATEGORY_META, OSModalPayload, OSPhoto } from '../types';
import { generateId, getLocalDateString } from '../utils/helpers';
import { buildClientDebts, clientDebtLine, lastVisitLine } from '../services/osClientContext';
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
import { normalizeItemCost, partialMarginNote } from '../services/marginView';
import { firstErrorField, OSFieldErrors, OSFieldId, validateOSFields } from '../services/osModalView';
import { MoneyField } from '../components/MoneyField';
import { Icon } from '../components/ui/Icon';
import { AdvancesList } from '../components/AdvancesList';
import { AdvanceRow, advanceRowsToPayload, buildAdvanceRows, firstInvalidAdvanceRow, advanceTotals } from '../services/advancesDraft';
import { isAdvanceSyncLocked } from '../services/osFinanceService';
import { OSPhotos } from '../components/OSPhotos';
import { useDatabase } from '../context/DatabaseContext';
import { getShowCosts, setShowCosts, getShowCostColumn, setShowCostColumn as saveShowCostColumn } from '../utils/uiPrefs';
import { trashPhoto } from '../services/photoStore';
import { photosChanged, trimCaptions } from '../services/photosView';

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
  /** Lançamentos, para mostrar o que o cliente escolhido deve. */
  ledger: LedgerEntry[];
}

// 🆕 Issue #41: Ordem de exibição das categorias
const CATEGORY_ORDER: PartCategory[] = [
  'MOTOR', 'FREIO', 'SUSPENSAO', 'ELETRICA',
  'TRANSMISSAO', 'AR_CONDICIONADO', 'CARROCERIA', 'OUTROS'
];

export const OSModal: React.FC<OSModalProps> = ({
  isOpen, onClose, onSave, editingOS, clients, catalogParts, catalogServices, catalogTechnicians, nextOSNumber, isSaving, formatMoney, draft, targetMargin, workOrders, ledger
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
  const [advanceRows, setAdvanceRows] = useState<AdvanceRow[]>([]); // rascunho dos adiantamentos (nada vai ao caixa até salvar a OS)
  const [advanceEditing, setAdvanceEditing] = useState(false);
  const [advanceAttention, setAdvanceAttention] = useState(0);
  const advancesLocked = !!editingOS && isAdvanceSyncLocked(editingOS);

  // Fotos (schema v5): o arquivo vai para o disco ao escolher; os metadados ficam neste rascunho até Salvar.
  const { dbPath, readOnly } = useDatabase();
  const [photos, setPhotos] = useState<OSPhoto[]>([]);
  const [photosBusy, setPhotosBusy] = useState(0); // fotos ainda sendo enviadas: Salvar espera
  // Lido só ao abrir: outro PC pode criar OS na recarga automática e não deve zerar o formulário.
  const nextOSNumberRef = useRef(nextOSNumber);
  nextOSNumberRef.current = nextOSNumber;
  const sessionPhotos = useRef(new Set<string>()); // ids gravados em disco nesta abertura da janela
  const newOsId = useRef(generateId()); // id da OS nova: as fotos já ficam na pasta dela
  const osId = editingOS?.id ?? newOsId.current;

  const [parts, setParts] = useState<OrderItem[]>([]);
  const [services, setServices] = useState<OrderItem[]>([]);
  const [showCostColumn, setShowCostColumn] = useState(getShowCostColumn); // lembra a última escolha deste PC (padrão ligada)
  const [showProfit, setShowProfit] = useState(getShowCosts); // análise de lucro: lembra a última escolha deste PC (padrão recolhida)
  const [errors, setErrors] = useState<OSFieldErrors>({});
  const clearError = (f: OSFieldId) => setErrors(prev => (prev[f] ? { ...prev, [f]: undefined } : prev));

  // --- ESTADOS TEMPORÁRIOS ---
  const [tempPart, setTempPart] = useState<{ description: string; price: number | undefined; cost: number | undefined; category: PartCategory | '' }>(
    { description: '', price: undefined, cost: undefined, category: '' });
  const [tempService, setTempService] = useState<{ description: string; price: number | undefined; cost: number | undefined }>(
    { description: '', price: undefined, cost: undefined });

  // Campos de dinheiro com texto inválido (ids) e se os erros já devem aparecer (tentou salvar/adicionar).
  const moneyInvalid = useRef(new Set<string>());
  const [moneyShown, setMoneyShown] = useState(false);
  const trackMoney = (id: string, invalid: boolean) => { if (invalid) moneyInvalid.current.add(id); else moneyInvalid.current.delete(id); };
  /** Há campo de dinheiro inválido (entre os ids dados, ou em qualquer um)? Mostra o erro e foca o primeiro, na ordem da tela. */
  const blockedByMoney = (ids?: string[]): boolean => {
    const bad = [...moneyInvalid.current].filter(i => !ids || ids.includes(i));
    if (bad.length === 0) return false;
    setMoneyShown(true);
    document.querySelector<HTMLElement>(bad.map(i => `#${CSS.escape(i)}`).join(','))?.focus();
    return true;
  };


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

  // O que o sistema já sabe do cliente: dívida e última visita (do mesmo carro quando já digitado). Homônimo sem escolha: nada.
  const clientDebts = useMemo(
    () => (isOpen ? buildClientDebts(workOrders, ledger, clients, getLocalDateString()) : undefined),
    [isOpen, workOrders, ledger, clients],
  );
  const clientInfo = useMemo(() => {
    if (!isOpen || needsClientChoice || !clientName.trim()) return [];
    const typedVehicle = plate ? `${vehicle} - ${plate}` : vehicle;
    return [
      clientDebtLine({ workOrders, ledger, clients, client: selectedClient, clientName, today: getLocalDateString(), debts: clientDebts }),
      lastVisitLine({ workOrders, clients, client: selectedClient, clientName, vehicle: typedVehicle, excludeId: editingOS?.id }),
    ].filter((l): l is string => !!l);
  }, [isOpen, needsClientChoice, workOrders, ledger, clients, clientDebts, selectedClient, clientName, vehicle, plate, editingOS]);

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
    sessionPhotos.current.clear();
    setErrors({});
    setMoneyShown(false);
    setShowProfit(getShowCosts());
    setShowCostColumn(getShowCostColumn());

    if (editingOS) {
      setOsNumber(editingOS.osNumber.toString());
      setDate(editingOS.createdAt ? editingOS.createdAt.split('T')[0] : getLocalDateString());
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
      setAdvanceRows(buildAdvanceRows(editingOS, getLocalDateString()));

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
      setPhotos(editingOS.photos ?? []);
    } else {
      setOsNumber(nextOSNumberRef.current.toString());
      setDate(getLocalDateString());
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
      setAdvanceRows([]);
      setPhotos([]);
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
  }, [isOpen, editingOS, draft]);

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
    if (blockedByMoney(['os-new-part-cost', 'os-new-part-price'])) return;
    guard.markDirty();
    const partLinkId = resolveCatalogItemId({ description: tempPart.description }, catalogParts);
    const newItem: OrderItem = {
      id: crypto.randomUUID(),
      ...(partLinkId ? { catalogItemId: partLinkId } : {}),
      description: tempPart.description,
      price: tempPart.price ?? 0,
      cost: tempPart.cost && tempPart.cost > 0 ? tempPart.cost : undefined,
      category: tempPart.category || undefined
    };
    setParts(prev => [...prev, newItem]);
    setTempPart({ description: '', price: undefined, cost: undefined, category: '' });
    if (toServices) serviceInputRef.current?.focus(); else partInputRef.current?.focus();
  };

  const addService = (toParts: boolean) => {
    if (!tempService.description) return;
    if (blockedByMoney(['os-new-service-cost', 'os-new-service-price'])) return;
    guard.markDirty();
    const serviceLinkId = resolveCatalogItemId({ description: tempService.description }, catalogServices);
    const newItem: OrderItem = {
      id: crypto.randomUUID(),
      ...(serviceLinkId ? { catalogItemId: serviceLinkId } : {}),
      description: tempService.description,
      price: tempService.price ?? 0,
      cost: tempService.cost && tempService.cost > 0 ? tempService.cost : undefined
    };
    setServices(prev => [...prev, newItem]);
    setTempService({ description: '', price: undefined, cost: undefined });
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
      price: match ? match.price : tempPart.price,
      cost: match ? (match.cost && match.cost > 0 ? match.cost : undefined) : tempPart.cost,
      // 🆕 Issue #42: auto-fill categoria aprendida do catálogo
      category: match?.category ?? tempPart.category
    });
  };

  const handleTempServiceChange = (val: string) => {
    const match = catalogServices.find(c => c.description.toLowerCase() === val.toLowerCase());
    setTempService({
      description: val,
      price: match ? match.price : tempService.price,
      cost: match ? (match.cost && match.cost > 0 ? match.cost : undefined) : tempService.cost
    });
  };

  const handleConfirm = () => {
    if (photosBusy > 0) return; // botão e atalho esperam o envio das fotos
    const found = validateOSFields({ clientName, vehicle, needsClientChoice, osNumber });
    const first = firstErrorField(found);
    if (first) {
      setErrors(found);
      if (moneyInvalid.current.size > 0) setMoneyShown(true);
      document.getElementById(first)?.focus();
      return;
    }
    setErrors({});
    if (blockedByMoney()) return;
    const numOS = parseInt(osNumber, 10);
    const fullVehicle = plate ? `${vehicle} - ${plate.toUpperCase()}` : vehicle;

    if (!advancesLocked) {
      if (advanceEditing) { setAdvanceAttention(n => n + 1); return; }
      const bad = firstInvalidAdvanceRow(advanceRows, getLocalDateString());
      if (bad) {
        setAdvanceAttention(n => n + 1);
        document.querySelector<HTMLElement>(`[data-adv-edit="${CSS.escape(bad.key)}"]`)?.focus();
        return;
      }
    }

    onSave({
      osNumber: numOS,
      createdAt: date,
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
      advances: advancesLocked ? undefined : advanceRowsToPayload(advanceRows),
      id: osId,
      photos: trimCaptions(photos),
    });
  };

  // --- HOTKEY ---
  // handleConfirm é recriado a cada render com o estado atual; o ref garante que o atalho nunca use uma versão velha.
  const confirmRef = useRef(handleConfirm);
  confirmRef.current = handleConfirm;
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        confirmRef.current();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen]);

  // Esc, Cancelar: pergunta antes de descartar o que foi digitado. Salvar fecha direto (handleConfirm -> onSave).
  // resetKey estável (string): recarregar o formulário com a janela aberta (outra OS, outro rascunho) zera a flag.
  // Descartar: as fotos gravadas em disco nesta sessão vão para a lixeira (as já salvas na OS ficam como estavam).
  const discardAndClose = () => {
    for (const id of sessionPhotos.current) {
      trashPhoto(dbPath, osId, id).catch(err => console.warn('Não foi possível mover a foto para a lixeira:', err));
    }
    sessionPhotos.current.clear();
    onClose();
  };
  const guard = useDirtyGuard({
    active: isOpen,
    onClose: discardAndClose,
    isDirty: () => photosChanged(editingOS?.photos, photos),
    resetKey: editingOS ? `os:${editingOS.id}` : draft ? `draft:${draft.clientName}|${draft.vehicle}|${draft.notes}` : 'nova',
  });

  if (!isOpen) return null;

  const costToggle = (
    <label className="osm-switch" title="Mostrar custos">
      <input type="checkbox" role="switch" data-no-dirty className="osm-switch-input" checked={showCostColumn} onChange={e => { setShowCostColumn(e.target.checked); saveShowCostColumn(e.target.checked); }} />
      <span className="osm-switch-track" aria-hidden="true"><span className="osm-switch-thumb" /></span>
      <span>{showCostColumn ? 'Custos: aparecendo' : 'Custos: escondidos'}</span>
    </label>
  );

  const removeBtn = (onClick: () => void, desc: string) => (
    <button type="button" className="osm-remove" onClick={onClick} aria-label={`Remover item ${desc}`.trim()} title="Remover item">
      <Icon name="excluir" size={18} /> <span className="osm-remove-txt">Remover</span>
    </button>
  );

  // Legenda visível sobre o campo de dinheiro (o aria-label do campo continua o nome acessível).
  const numf = (cap: string, field: React.ReactNode) => (
    <div className="osm-numf"><span className="osm-numf-cap" aria-hidden="true">{cap}</span>{field}</div>
  );
  const itemsCount = (n: number) => `${n} ${n === 1 ? 'item' : 'itens'}`;
  const marginSummary = marginLvl === 'NA_META' && margin.marginPct !== null
    ? `${marginLabel(marginLvl, margin.marginPct)} · na meta`
    : marginLabel(marginLvl, margin.marginPct);

  const advTotals = advanceTotals(advanceRows, totalRevenue);

  return (
    <>
    <div className="modal-overlay" ref={guard.overlayRef}>
      <div className="modal-content osm" role="dialog" aria-modal="true" aria-labelledby="os-modal-title">
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
          <button type="button" className="btn-ghost osm-close" onClick={guard.requestClose}>
            <Icon name="fechar" size={18} /> Fechar
          </button>
          {errors['os-number'] && <p id="os-number-error" className="field-error osm-head-error" role="alert">{errors['os-number']}</p>}
        </header>

        <div className="osm-body">

        {/* 1. CLIENTE E VEÍCULO */}
        <section className="osm-section" aria-labelledby="osm-h-cliente">
          <h3 id="osm-h-cliente" className="osm-h"><Icon name="clientes" size={18} /> Cliente e veículo</h3>
          <div className="osm-grid">
            <div className="form-group osm-w2">
              <label className="form-label" htmlFor="os-client">Cliente <span className="osm-opt">(obrigatório)</span></label>
              <input ref={clientInputRef} id="os-client" className="form-input" list="clients_list" value={clientName}
                aria-invalid={errors['os-client'] ? true : undefined} aria-describedby={errors['os-client'] ? 'os-client-error' : undefined}
                onChange={e => { setClientName(e.target.value); clearError('os-client'); clearError('os-client-choice'); }} autoFocus={!editingOS} />
              <datalist id="clients_list">{[...new Set(suggestedClients.map(c => c.name))].map(n => <option key={n} value={n} />)}</datalist>
              {errors['os-client'] && <p id="os-client-error" className="field-error" role="alert">{errors['os-client']}</p>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="os-contact">Contato / Telefone <span className="osm-opt">(opcional)</span></label>
              <input id="os-contact" className="form-input" value={contact} onChange={e => setContact(e.target.value)} />
            </div>
          </div>

          {clientInfo.length > 0 && (
            <p className="osm-client-info" aria-live="polite">
              {clientInfo.map(l => <span key={l} className={l.startsWith('Deve') ? 'osm-client-info-debt' : undefined}>{l}</span>)}
            </p>
          )}

          {hasHomonyms && (
            <fieldset className="osm-note osm-note--warn osm-homonyms">
              <legend className="form-label"><Icon name="alerta" size={16} /> Qual cliente?</legend>
              <div role="radiogroup" aria-label="Qual cliente?" aria-required="true" aria-describedby={needsClientChoice ? 'os-client-choice-error' : undefined} className="osm-radios">
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
              <label className="form-label" htmlFor="os-vehicle">Veículo <span className="osm-opt">(obrigatório)</span></label>
              <VehicleCombobox id="os-vehicle" value={vehicle}
                invalid={!!errors['os-vehicle']} describedBy={errors['os-vehicle'] ? 'os-vehicle-error' : undefined}
                onChange={v => { if (v !== vehicle) guard.markDirty(); setVehicle(v); clearError('os-vehicle'); }}
                clientVehicles={suggestedVehicles} shopVehicles={shopVehicles} />
              {errors['os-vehicle'] && <p id="os-vehicle-error" className="field-error" role="alert">{errors['os-vehicle']}</p>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="os-plate">Placa <span className="osm-opt">(opcional)</span></label>
              <input id="os-plate" className="form-input" value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} maxLength={8} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="os-km">Km <span className="osm-opt">(opcional)</span></label>
              <input id="os-km" className="form-input" type="number" value={mileage} onChange={e => setMileage(e.target.value)} />
            </div>
          </div>
        </section>

        {/* 2. SERVIÇO */}
        <section className="osm-section" aria-labelledby="osm-h-itens">
          <div className="osm-h-row">
            <h3 id="osm-h-itens" className="osm-h"><Icon name="oficina" size={18} /> Serviço <span className="osm-h-count">{itemsCount(parts.length + services.length)} · {formatMoney(totalRevenue)}</span></h3>
            {costToggle}
          </div>
          <div className="osm-grid osm-grid--tech">
            <div className="form-group">
              <label className="form-label" htmlFor="os-tech">Técnico responsável <span className="osm-opt">(opcional)</span></label>
              <input id="os-tech" className="form-input" list="tech_list" value={technician} onChange={e => setTechnician(e.target.value)} />
              <datalist id="tech_list">{suggestedTechnicians.map(t => <option key={t.id} value={t.name} />)}</datalist>
            </div>
            <div className="form-group">
              <label className="form-label osm-nowrap" htmlFor="os-expected-date">Previsão de entrega <span className="osm-opt">(opcional)</span></label>
              <input id="os-expected-date" className="form-input" type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
            </div>
          </div>

          <div className="osm-columns">
            {/* PEÇAS */}
            <div className="items-list-container osm-box osm-box--parts">
              <div className="items-header osm-box-head">
                <span className="osm-box-title"><Icon name="pecas" size={18} /> Peças <span className="osm-h-count">{itemsCount(parts.length)}</span></span>
                <span className="osm-box-sub">{formatMoney(partsTotal)}</span>
              </div>

              <div className="item-row osm-row osm-add">
                <label className="osm-add-label" htmlFor="os-new-part">Adicionar peça</label>
                <input id="os-new-part" ref={partInputRef} className="form-input osm-desc" list="cat-parts" value={tempPart.description}
                  onChange={e => handleTempPartChange(e.target.value)} onKeyDown={handlePartKeyDown} placeholder="Ex.: pastilha de freio" />
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
                {showCostColumn && numf('Custo (interno)',
                  <MoneyField id="os-new-part-cost" kind="cost" className="form-input osm-num osm-num--cost" aria-label="Custo da nova peça" value={tempPart.cost}
                    onChange={c => setTempPart(prev => ({ ...prev, cost: c }))} onInvalidChange={trackMoney} showError={moneyShown}
                    onKeyDown={handlePartKeyDown} placeholder="Custo" />
                )}
                {numf('Preço',
                  <MoneyField id="os-new-part-price" kind="price" className="form-input osm-num" aria-label="Preço da nova peça" value={tempPart.price}
                    onChange={c => setTempPart(prev => ({ ...prev, price: c }))} onInvalidChange={trackMoney} showError={moneyShown}
                    onKeyDown={handlePartKeyDown} placeholder="Preço" />
                )}
                <button type="button" className="btn-accent-outline osm-add-btn" onClick={() => addPart(false)}>
                  <Icon name="adicionar" size={16} /> Adicionar peça
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
                          {showCostColumn && numf('Custo (interno)',
                            <MoneyField id={`os-part-${p.id}-cost`} kind="cost" className="form-input margin-cost-field osm-num osm-num--cost" value={p.cost}
                              onInvalidChange={trackMoney} showError={moneyShown}
                              onChange={c => updateItem(parts, setParts, i, 'cost', c, catalogParts)}
                              placeholder="Custo" title="Custo interno de aquisição (vazio = sem custo, fora da margem)"
                              aria-label={`Custo de ${p.description || 'peça'}`} />
                          )}
                          {numf('Preço',
                            <MoneyField id={`os-part-${p.id}-price`} kind="price" className="form-input osm-num" value={p.price}
                              onInvalidChange={trackMoney} showError={moneyShown}
                              onChange={c => updateItem(parts, setParts, i, 'price', c ?? 0, catalogParts)}
                              aria-label={`Preço de ${p.description || 'peça'}`} />
                          )}
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
                <span className="osm-box-title"><Icon name="chave" size={18} /> Serviços <span className="osm-h-count">{itemsCount(services.length)}</span></span>
                <span className="osm-box-sub">{formatMoney(servicesTotal)}</span>
              </div>

              <div className="item-row osm-row osm-add">
                <label className="osm-add-label" htmlFor="os-new-service">Adicionar serviço</label>
                <input id="os-new-service" ref={serviceInputRef} className="form-input osm-desc" list="cat-serv" value={tempService.description}
                  onChange={e => handleTempServiceChange(e.target.value)} onKeyDown={handleServiceKeyDown} placeholder="Ex.: troca de óleo" />
                <datalist id="cat-serv">
                  {suggestedServices.map((cs, idx) => (
                    <option key={idx} value={cs.description}>{formatMoney(cs.price)}</option>
                  ))}
                </datalist>
                {showCostColumn && numf('Custo (interno)',
                  <MoneyField id="os-new-service-cost" kind="cost" className="form-input osm-num osm-num--cost" aria-label="Custo do novo serviço" value={tempService.cost}
                    onChange={c => setTempService(prev => ({ ...prev, cost: c }))} onInvalidChange={trackMoney} showError={moneyShown}
                    onKeyDown={handleServiceKeyDown} placeholder="Custo" />
                )}
                {numf('Preço',
                  <MoneyField id="os-new-service-price" kind="price" className="form-input osm-num" aria-label="Preço do novo serviço" value={tempService.price}
                    onChange={c => setTempService(prev => ({ ...prev, price: c }))} onInvalidChange={trackMoney} showError={moneyShown}
                    onKeyDown={handleServiceKeyDown} placeholder="Preço" />
                )}
                <button type="button" className="btn-accent-outline osm-add-btn" onClick={() => addService(false)}>
                  <Icon name="adicionar" size={16} /> Adicionar serviço
                </button>
              </div>

              <div className="osm-list">
                {services.map((s, i) => (
                  <div key={s.id} className="osm-item">
                    <div className="item-row osm-row">
                      <input className="form-input osm-desc" aria-label="Descrição do serviço" value={s.description}
                        onChange={e => updateItem(services, setServices, i, 'description', e.target.value, catalogServices)} />
                      {showCostColumn && numf('Custo (interno)',
                        <MoneyField id={`os-service-${s.id}-cost`} kind="cost" className="form-input margin-cost-field osm-num osm-num--cost" value={s.cost}
                          onInvalidChange={trackMoney} showError={moneyShown}
                          onChange={c => updateItem(services, setServices, i, 'cost', c, catalogServices)}
                          placeholder="Custo" title="Custo interno (vazio = sem custo, fora da margem)"
                          aria-label={`Custo de ${s.description || 'serviço'}`} />
                      )}
                      {numf('Preço',
                        <MoneyField id={`os-service-${s.id}-price`} kind="price" className="form-input osm-num" value={s.price}
                          onInvalidChange={trackMoney} showError={moneyShown}
                          onChange={c => updateItem(services, setServices, i, 'price', c ?? 0, catalogServices)}
                          aria-label={`Preço de ${s.description || 'serviço'}`} />
                      )}
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

        {/* 3. PAGAMENTO */}
        <section className="osm-section" aria-labelledby="osm-h-valores">
          <h3 id="osm-h-valores" className="osm-h"><Icon name="cifrao" size={18} /> Pagamento</h3>
          <AdvancesList rows={advanceRows} onChange={setAdvanceRows} total={totalRevenue} today={getLocalDateString()}
            formatMoney={formatMoney} locked={advancesLocked} onDirty={guard.markDirty}
            onEditingChange={setAdvanceEditing} attention={advanceAttention} />

          {!showCostColumn && <p className="osm-hint">Lucro e margem escondidos</p>}
          {showCostColumn && (
            <div className="osm-profit">
              <button type="button" className="btn-secondary osm-profit-toggle" aria-expanded={showProfit} aria-controls="osm-profit-body"
                onClick={() => { const next = !showProfit; setShowProfit(next); setShowCosts(next); }}>
                <Icon name="financeiro" size={16} /> {showProfit ? 'Esconder lucro e margem' : 'Ver lucro e margem'}
                {!showProfit && (
                  <span className="osm-profit-sum">
                    <span className={`osm-dot osm-dot--${marginLvl.toLowerCase()}`} aria-hidden="true" /> {marginSummary}
                  </span>
                )}
              </button>
              <div id="osm-profit-body" className="osm-profit-body" hidden={!showProfit}>
                {showProfit && (<>
                  <p className="osm-profit-goal">Meta da oficina: {targetMargin}%, muda em Configurações</p>
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
                        <div className="osm-note osm-note--warn" role="status">
                          <Icon name="alerta" size={16} /> <span>Esta OS está abaixo da meta de margem ({targetMargin}%). Considere ajustar os preços. Você ainda pode salvar.</span>
                        </div>
                      )}
                    </div>
                  )}
                </>)}
              </div>
            </div>
          )}
        </section>

        {/* 4. FOTOS */}
        <section className="osm-section" aria-labelledby="osm-h-fotos">
          <h3 id="osm-h-fotos" className="osm-h"><Icon name="camera" size={18} /> Fotos do carro</h3>
          <OSPhotos dbPath={dbPath} osId={osId} osNumber={parseInt(osNumber, 10) || 0} photos={photos} setPhotos={setPhotos} sessionRef={sessionPhotos} readOnly={readOnly} onBusyChange={setPhotosBusy} />
        </section>

        {/* 5. OBSERVAÇÕES */}
        <section className="osm-section" aria-labelledby="osm-h-obs">
          <h3 id="osm-h-obs" className="osm-h"><Icon name="prancheta" size={18} /> Observações</h3>
          <div className="form-group">
            <label className="form-label" htmlFor="os-notes">Obs. interna (visível só aqui) <span className="osm-opt">(opcional)</span></label>
            <textarea id="os-notes" className="form-input form-textarea" value={notes} onChange={e => setNotes(e.target.value)} style={{ minHeight: 60 }} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="os-public-notes">Observações da OS (visíveis na impressão) <span className="osm-opt">(opcional)</span></label>
            <textarea id="os-public-notes" className="form-input form-textarea" value={publicNotes} onChange={e => setPublicNotes(e.target.value)}
              placeholder="Ex: Garantia de 3 meses, detalhes técnicos, peças trazidas pelo cliente..." style={{ minHeight: 60 }} />
          </div>
        </section>

        </div>

        <footer className="osm-foot">
          <div className="osm-sum" aria-live="polite">
            <div className="osm-sum-total"><span className="osm-sum-k">Total da OS</span> <strong>{formatMoney(totalRevenue)}</strong></div>
            {advanceRows.length > 0 && (
              <div className="osm-sum-adv">
                <span className="osm-sum-paid">Adiantado {formatMoney(advTotals.sum)}</span>
                <span className="osm-sum-due">Falta pagar {formatMoney(advTotals.remaining)}</span>
              </div>
            )}
          </div>
          <div className="osm-foot-actions">
            {photosBusy > 0 && <p className="osm-foot-why" role="status">Aguarde o envio das fotos para salvar.</p>}
            {needsClientChoice && <p className="osm-foot-why">Escolha o cliente em "Qual cliente?" para salvar.</p>}
            <button type="button" className="btn-secondary" onClick={guard.requestClose}>Cancelar</button>
            <button type="button" className="btn osm-save" onClick={handleConfirm} disabled={isSaving || needsClientChoice || photosBusy > 0} aria-busy={isSaving} title="Atalho: Ctrl + Shift + Enter">
              <Icon name="salvar" size={18} /> {isSaving ? 'Salvando...' : 'Salvar OS'}
            </button>
          </div>
        </footer>
      </div>
    </div>
    {guard.dialog}
    </>
  );
};
