import { CatalogItem, Client, LedgerEntry, WorkOrder, OrderItem } from '../types';

// --- GERAÇÃO DE ID ---
export const generateId = (): string => {
  return typeof crypto !== 'undefined' && crypto.randomUUID 
    ? crypto.randomUUID() 
    : Math.random().toString(36).substring(2) + Date.now().toString(36);
};

// --- DATE HELPER ---
/**
 * Retorna a data atual do computador no formato YYYY-MM-DD (padrão para input type="date")
 * Usa o fuso horário local, não UTC, garantindo que a data seja sempre a mesma do sistema do usuário
 */
export const getLocalDateString = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// --- MONEY HELPER ---
export const Money = {
  fromFloat: (amount: number): number => Math.round(amount * 100),
  toFloat: (cents: number): number => cents / 100,
  format: (cents: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(cents / 100);
  }
};

// --- LEDGER (FINANCEIRO) ---

export const createEntry = (
  description: string,
  amount: number,
  type: 'CREDIT' | 'DEBIT',
  dateString?: string,
  groupId?: string,
  paymentDate?: string // 🔧 NOVO PARÂMETRO: Data de pagamento
): LedgerEntry => {
  return {
    id: generateId(),
    description,
    amount,
    type,
    effectiveDate: dateString ? new Date(dateString).toISOString() : new Date().toISOString(),
    createdAt: new Date().toISOString(),
    history: [],
    groupId,
    paymentDate: paymentDate ? new Date(paymentDate).toISOString() : undefined // 🔧 Inclui paymentDate
  };
};

export const updateEntryAmount = (
  entry: LedgerEntry,
  newAmountFloat: number,
  user: string,
  reason: string
): LedgerEntry => {
  const oldAmount = entry.amount;
  const newAmount = Money.fromFloat(newAmountFloat);
  
  if (oldAmount === newAmount) return entry;

  const newHistory = [...(entry.history || [])];  
  newHistory.push({
    timestamp: new Date().toISOString(),
    note: `Alterado de ${Money.format(oldAmount)} para ${Money.format(newAmount)} por ${user}. Motivo: ${reason}`
  });

  return {
    ...entry,
    amount: newAmount,
    history: newHistory
  };
};

// --- WORK ORDER (OS) ---

export const createWorkOrder = (
  osNumber: number,
  vehicle: string,
  clientName: string,
  clientPhone: string,
  mileage: string,
  parts: CatalogItem[],
  services: CatalogItem[],
  dateString?: string
): WorkOrder => {
  
  // --- CORREÇÃO DE DATA (TIMEZONE FIX) ---
  let finalDate = new Date().toISOString();
  
  if (dateString) {
      const d = new Date(dateString);
      d.setUTCHours(12, 0, 0, 0); 
      finalDate = d.toISOString();
  }

  const subParts = parts.reduce((a, b) => a + b.price, 0);
  const subServices = services.reduce((a, b) => a + b.price, 0);

  // Mapeia CatalogItem para OrderItem adicionando ID
  const orderParts: OrderItem[] = parts.map(p => ({ ...p, id: generateId() }));
  const orderServices: OrderItem[] = services.map(s => ({ ...s, id: generateId() }));

  return {
    id: generateId(),
    osNumber,
    clientName,
    clientPhone,
    vehicle,
    mileage: Number(mileage) || 0,
    status: 'ORCAMENTO',
    parts: orderParts,
    services: orderServices,
    total: subParts + subServices,
    createdAt: finalDate,
    checklist: undefined,
    financialId: undefined
  };
};

export const updateWorkOrderData = (
  original: WorkOrder,
  osNumber: number,
  vehicle: string,
  clientName: string,
  clientPhone: string,
  mileage: string,
  parts: CatalogItem[],
  services: CatalogItem[],
  dateString?: string
): WorkOrder => {
  const subParts = parts.reduce((a, b) => a + b.price, 0);
  const subServices = services.reduce((a, b) => a + b.price, 0);
  
  let finalDate = original.createdAt;
  if (dateString) {
      const d = new Date(dateString);
      d.setUTCHours(12, 0, 0, 0);
      finalDate = d.toISOString();
  }

  // Mapeia CatalogItem para OrderItem adicionando ID
  const orderParts: OrderItem[] = parts.map(p => ({ ...p, id: generateId() }));
  const orderServices: OrderItem[] = services.map(s => ({ ...s, id: generateId() }));

  return {
    ...original,
    osNumber,
    vehicle,
    clientName,
    clientPhone,
    mileage: Number(mileage) || 0,
    parts: orderParts,
    services: orderServices,
    total: subParts + subServices,
    createdAt: finalDate
  };
};

// --- APRENDIZADO DE DADOS (CATÁLOGO E CLIENTES) ---

export const learnClientData = (
  currentClients: Client[],
  name: string,
  vehicleModel: string,
  plate: string,
  phone: string,
  notes?: string
): Client[] => {
  const normalizedName = name.trim();
  if (!normalizedName) return currentClients;

  const existingIndex = currentClients.findIndex(c => c.name.toLowerCase() === normalizedName.toLowerCase());
  
  const newVehicle = { model: vehicleModel, plate };
  
  if (existingIndex >= 0) {
    const client = currentClients[existingIndex];
    const vehicleExists = client.vehicles.some(v => v.plate === plate && v.model === vehicleModel);
    
    const updatedClient = {
      ...client,
      phone: phone || client.phone,
      notes: notes || client.notes,
      vehicles: vehicleExists ? client.vehicles : [...client.vehicles, newVehicle]
    };

    const newList = [...currentClients];
    newList[existingIndex] = updatedClient;
    return newList;
  } else {
    return [
      ...currentClients,
      {
        id: generateId(),
        name: normalizedName,
        phone,
        notes: notes || '',
        vehicles: [newVehicle]
      }
    ];
  }
};

export const learnCatalogItems = (
  currentCatalog: CatalogItem[],
  newItems: CatalogItem[]
): CatalogItem[] => {
  const updatedCatalog = [...currentCatalog];

  newItems.forEach(item => {
    const exists = updatedCatalog.find(c => c.description.toLowerCase() === item.description.toLowerCase());
    if (!exists) {
      updatedCatalog.push({ ...item });
    }
  });

  return updatedCatalog;
};