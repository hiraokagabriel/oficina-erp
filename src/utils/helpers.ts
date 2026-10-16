import { CatalogItem, LedgerEntry, WorkOrder, OrderItem, Technician } from '../types';
import { toISOFromDateInput } from './dates';

export const generateId = (): string => {
  return typeof crypto !== 'undefined' && crypto.randomUUID 
    ? crypto.randomUUID() 
    : Math.random().toString(36).substring(2) + Date.now().toString(36);
};

export const getLocalDateString = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const Money = {
  // toPrecision(15) remove o ruído binário (1.005 * 100 = 100.49999999999999) antes de arredondar.
  // Simétrico para negativos (meio centavo se afasta de zero) e nunca devolve -0.
  fromFloat: (amount: number): number => {
    const cents = Math.round(Number((Math.abs(amount) * 100).toPrecision(15)));
    return amount < 0 && cents !== 0 ? -cents : cents;
  },
  toFloat: (cents: number): number => cents / 100,
  format: (cents: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(cents / 100);
  }
};

// Divide um total em centavos em `count` partes inteiras; o resto vai na última parcela (a soma é exata).
export const splitCents = (totalCents: number, count: number): number[] => {
  const n = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1;
  const base = Math.floor(totalCents / n);
  const parts = Array<number>(n).fill(base);
  parts[n - 1] = totalCents - base * (n - 1);
  return parts;
};

export const createEntry = (
  description: string,
  amount: number,
  type: 'CREDIT' | 'DEBIT',
  dateString?: string,
  groupId?: string,
  paymentDate?: string
): LedgerEntry => {
  return {
    id: generateId(),
    description,
    amount,
    type,
    effectiveDate: dateString ? toISOFromDateInput(dateString) : new Date().toISOString(),
    createdAt: new Date().toISOString(),
    groupId,
    paymentDate: paymentDate ? toISOFromDateInput(paymentDate) : undefined
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

  console.log(`Alteração de valor: ${Money.format(oldAmount)} → ${Money.format(newAmount)} (${user}) Motivo: ${reason}`);

  return {
    ...entry,
    amount: newAmount,
  };
};

export const calculateFinancials = (
  parts: OrderItem[],
  services: OrderItem[]
): {
  totalRevenue: number;
  totalCost: number;
  profit: number;
  profitMargin: number;
  roi: number;
} => {
  const partsRevenue = parts.reduce((acc, p) => acc + p.price, 0);
  const servicesRevenue = services.reduce((acc, s) => acc + s.price, 0);
  const totalRevenue = partsRevenue + servicesRevenue;

  const partsCost = parts.reduce((acc, p) => acc + (p.cost || 0), 0);
  const servicesCost = services.reduce((acc, s) => acc + (s.cost || 0), 0);
  const totalCost = partsCost + servicesCost;

  const profit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
  const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;

  return { totalRevenue, totalCost, profit, profitMargin, roi };
};

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
  
  let finalDate = new Date().toISOString();
  
  if (dateString) {
      const d = new Date(dateString);
      d.setUTCHours(12, 0, 0, 0); 
      finalDate = d.toISOString();
  }

  const subParts = parts.reduce((a, b) => a + b.price, 0);
  const subServices = services.reduce((a, b) => a + b.price, 0);

  const orderParts: OrderItem[] = parts.map(p => ({ ...p, id: generateId() }));
  const orderServices: OrderItem[] = services.map(s => ({ ...s, id: generateId() }));

  const financials = calculateFinancials(orderParts, orderServices);

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
    totalCost: financials.totalCost,
    profit: financials.profit,
    profitMargin: financials.profitMargin,
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
  mileage: string | number, // o App passa number (OSModal); os testes passam string
  parts: CatalogItem[],
  services: CatalogItem[],
  dateString?: string,
  publicNotes?: string,
  advanceAmount?: number
): WorkOrder => {
  const subParts = parts.reduce((a, b) => a + b.price, 0);
  const subServices = services.reduce((a, b) => a + b.price, 0);
  
  let finalDate = original.createdAt;
  if (dateString) {
      const d = new Date(dateString);
      d.setUTCHours(12, 0, 0, 0);
      finalDate = d.toISOString();
  }

  const orderParts: OrderItem[] = parts.map(p => ({ ...p, id: generateId() }));
  const orderServices: OrderItem[] = services.map(s => ({ ...s, id: generateId() }));

  const financials = calculateFinancials(orderParts, orderServices);

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
    totalCost: financials.totalCost,
    profit: financials.profit,
    profitMargin: financials.profitMargin,
    createdAt: finalDate,
    publicNotes: publicNotes !== undefined ? publicNotes : original.publicNotes,
    advanceAmount: advanceAmount !== undefined ? advanceAmount : original.advanceAmount,
  };
};

export const learnTechnician = (
  currentTechnicians: Technician[],
  technicianName: string
): Technician[] => {
  const normalizedName = technicianName.trim();
  if (!normalizedName) return currentTechnicians;

  const exists = currentTechnicians.find(t => t.name.toLowerCase() === normalizedName.toLowerCase());
  
  if (exists) {
    return currentTechnicians;
  }

  return [
    ...currentTechnicians,
    {
      id: generateId(),
      name: normalizedName
    }
  ];
};
