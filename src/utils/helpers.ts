import { LedgerEntry, Client, CatalogItem, OrderItem, WorkOrder } from '../types';

export const Money = {
  format: (centavos: number): string => {
    const reais = centavos / 100;
    return reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },
  parse: (valor: string): number => {
    const num = parseFloat(valor.replace(/[^\d,-]/g, '').replace(',', '.'));
    return isNaN(num) ? 0 : Math.round(num * 100);
  },
  fromFloat: (reais: number): number => {
    return Math.round(reais * 100);
  },
  toFloat: (centavos: number): number => {
    return centavos / 100;
  }
};

export function generateUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function getNormalizedMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function getEndOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function isSameMonth(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();
}

export function toDateInputValue(date: Date): string {
  const offset = date.getTimezoneOffset();
  const adjusted = new Date(date.getTime() - offset * 60 * 1000);
  return adjusted.toISOString().slice(0, 10);
}

export function fromDateInputValue(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// ✅ ADICIONADO: Retorna data local no formato YYYY-MM-DD para inputs
export function getLocalDateString(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const adjusted = new Date(now.getTime() - offset * 60 * 1000);
  return adjusted.toISOString().split('T')[0];
}

export function createLedgerEntry(
  description: string,
  amount: number,
  type: 'CREDIT' | 'DEBIT',
  effectiveDate: string,
  options: Partial<LedgerEntry> = {}
): LedgerEntry {
  return {
    id: generateUniqueId(),
    description,
    amount,
    type,
    effectiveDate,
    createdAt: new Date().toISOString(),
    history: [],
    ...options
  };
}

export function createEntry(
  description: string,
  amount: number,
  type: 'CREDIT' | 'DEBIT',
  effectiveDate: string,
  groupId?: string,
  paymentDate?: string
): LedgerEntry {
  return createLedgerEntry(description, amount, type, effectiveDate, { 
    groupId,
    paymentDate 
  });
}

export function updateLedgerEntry(
  entry: LedgerEntry,
  updates: Partial<Omit<LedgerEntry, 'id' | 'createdAt'>>,
  user?: string
): LedgerEntry {
  const newHistory = [...(entry.history || [])];
  newHistory.push({
    date: new Date().toISOString(),
    timestamp: new Date().toISOString(),
    action: `Atualizado: ${Object.keys(updates).join(', ')}`,
    user
  });

  return {
    ...entry,
    ...updates,
    history: newHistory
  };
}

export function learnClientData(
  clients: Client[],
  clientName: string,
  vehicle: string,
  plate: string,
  phone: string,
  notes: string
): Client[] {
  const existing = clients.find(c => c.name === clientName);
  
  if (existing) {
    const hasVehicle = existing.vehicles.some(v => v.model === vehicle);
    const updatedVehicles = hasVehicle 
      ? existing.vehicles 
      : [...existing.vehicles, { model: vehicle, plate: plate || '' }];
    
    return clients.map(c => 
      c.id === existing.id 
        ? { 
            ...c, 
            phone: phone || c.phone,
            notes: notes || c.notes,
            vehicles: updatedVehicles 
          }
        : c
    );
  } else {
    const newClient: Client = {
      id: generateUniqueId(),
      name: clientName,
      phone: phone || '',
      notes: notes || '',
      vehicles: [{ model: vehicle, plate: plate || '' }]
    };
    return [...clients, newClient];
  }
}

export function learnCatalogItems(
  catalog: CatalogItem[],
  items: OrderItem[]
): CatalogItem[] {
  let updatedCatalog = [...catalog];
  
  items.forEach(item => {
    const exists = updatedCatalog.some(c => c.description === item.description);
    if (!exists) {
      updatedCatalog.push({
        id: generateUniqueId(),
        description: item.description,
        price: item.price,
        cost: item.cost
      });
    }
  });
  
  return updatedCatalog;
}

export function updateWorkOrderData(
  os: WorkOrder,
  osNumber: number,
  vehicle: string,
  clientName: string,
  clientPhone: string,
  mileage: number,
  parts: OrderItem[],
  services: OrderItem[],
  createdAt: string,
  publicNotes?: string
): WorkOrder {
  const totalCost = [
    ...parts.map(p => p.cost || 0),
    ...services.map(s => s.cost || 0)
  ].reduce((sum, cost) => sum + cost, 0);
  
  const total = [
    ...parts.map(p => p.price),
    ...services.map(s => s.price)
  ].reduce((sum, price) => sum + price, 0);
  
  const profit = total - totalCost;
  const profitMargin = totalCost > 0 ? (profit / totalCost) * 100 : 0;
  
  return {
    ...os,
    osNumber,
    vehicle,
    clientName,
    clientPhone,
    mileage,
    parts,
    services,
    total,
    totalCost,
    profit,
    profitMargin,
    createdAt,
    publicNotes: publicNotes || os.publicNotes
  };
}