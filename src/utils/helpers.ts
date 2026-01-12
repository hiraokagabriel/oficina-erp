// src/utils/helpers.ts
import { LedgerEntry, WorkOrder, Client, CatalogItem, OrderItem } from '../types';

// --- FORMATADORES ---
export const Money = {
  format: (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val / 100),
  toFloat: (val: number) => val / 100,
  fromFloat: (val: number) => Math.round(val * 100)
};

// --- FACTORIES (Criação de Objetos) ---

// ATUALIZADO: Inclui createdAt e groupId
export const createEntry = (
  description: string, 
  amount: number, 
  type: 'CREDIT' | 'DEBIT' = 'CREDIT', 
  date?: string,
  groupId?: string 
): LedgerEntry => ({
  id: crypto.randomUUID(), 
  description, 
  amount, 
  type,
  effectiveDate: date ? new Date(date).toISOString() : new Date().toISOString(),
  
  // Novos campos obrigatórios
  createdAt: new Date().toISOString(),
  groupId: groupId, 
  
  history: [{ timestamp: new Date().toISOString(), note: 'Criação inicial' }]
});

export const updateEntryAmount = (entry: LedgerEntry, newAmount: number, user: string, reason: string): LedgerEntry => ({
  ...entry, amount: newAmount,
  history: entry.history 
    ? [...entry.history, { timestamp: new Date().toISOString(), note: `${user}: Alterou valor para ${newAmount} (${reason})` }]
    : [{ timestamp: new Date().toISOString(), note: `${user}: Alterou valor para ${newAmount} (${reason})` }]
});

export const createWorkOrder = (
  osNumber: number, 
  vehicle: string, 
  clientName: string, 
  clientPhone: string, 
  mileage: number, 
  parts: OrderItem[], 
  services: OrderItem[], 
  date?: string,
  publicNotes?: string,
): WorkOrder => ({
  id: crypto.randomUUID(), osNumber, vehicle, clientName, clientPhone, mileage, status: 'ORCAMENTO',
  parts, services, total: parts.reduce((a, b) => a + b.price, 0) + services.reduce((a, b) => a + b.price, 0),
  createdAt: date ? new Date(date).toISOString() : new Date().toISOString(),
  publicNotes
});

export const updateWorkOrderData = ( 
  old: WorkOrder,
  osNumber: number, 
  vehicle: string, 
  clientName: string, 
  clientPhone: string, 
  mileage: number, 
  parts: OrderItem[], 
  services: OrderItem[], 
  date?: string,
  publicNotes?: string,
): WorkOrder => ({
  ...old, osNumber, vehicle, clientName, clientPhone, mileage, parts, services,
  total: parts.reduce((a, b) => a + b.price, 0) + services.reduce((a, b) => a + b.price, 0),
  createdAt: date ? new Date(date).toISOString() : old.createdAt, publicNotes
});

// --- APRENDIZADO DE DADOS (CRM & Catálogo) ---
export const learnClientData = (clients: Client[], name: string, model: string, plate: string, phone: string, notes: string): Client[] => {
  const existing = clients.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    const hasVehicle = existing.vehicles.some(v => v.model === model && v.plate === plate);
    return clients.map(c => c.id === existing.id ? {
      ...c, phone: phone || c.phone, notes: notes || c.notes,
      vehicles: hasVehicle ? c.vehicles : [...c.vehicles, { model, plate }]
    } : c);
  }
  return [...clients, { id: crypto.randomUUID(), name, phone, notes, vehicles: [{ model, plate }] }];
};

export const learnCatalogItems = (catalog: CatalogItem[], newItems: CatalogItem[]): CatalogItem[] => {
  const updated = [...catalog];
  newItems.forEach(item => {
    if (!updated.some(i => i.description.toLowerCase() === item.description.toLowerCase())) {
      updated.push(item);
    }
  });
  return updated;
};