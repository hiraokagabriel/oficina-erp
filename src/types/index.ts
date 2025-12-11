// src/types/index.ts

// --- CONSTANTES COMPARTILHADAS ---

export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export type OSStatus = 'ORCAMENTO' | 'APROVADO' | 'EM_SERVICO' | 'FINALIZADO';

export const STATUS_LABELS: Record<OSStatus, string> = {
  ORCAMENTO: 'Orçamento',
  APROVADO: 'Aprovado',
  EM_SERVICO: 'Em Serviço',
  FINALIZADO: 'Finalizado'
};

// --- INTERFACES ---

export interface LedgerEntry {
  id: string;
  description: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
  effectiveDate: string;
  history: { timestamp: string; note: string }[];
}

export interface OrderItem { 
  id: string; 
  description: string; 
  price: number; 
}

export interface ChecklistSchema { 
  fuelLevel: number; 
  tires: { fl: boolean; fr: boolean; bl: boolean; br: boolean }; 
  notes: string; 
}

export interface WorkOrder {
  id: string;
  osNumber: number;
  clientName: string;
  clientPhone: string;
  vehicle: string;
  mileage: number;
  status: OSStatus;
  parts: OrderItem[];
  services: OrderItem[];
  total: number;
  createdAt: string;
  checklist?: ChecklistSchema;
  financialId?: string;
}

export interface ClientVehicle { model: string; plate: string; }

export interface Client { 
  id: string; 
  name: string; 
  phone: string; 
  notes: string; 
  vehicles: ClientVehicle[]; 
}

export interface CatalogItem {
  description: string;
  price: number;
}

export interface WorkshopSettings { 
  name: string; 
  cnpj: string; 
  address: string; 
  technician: string; 
  exportPath: string;
  googleDriveToken: string; 
}

export interface DatabaseSchema { 
  ledger: LedgerEntry[]; 
  workOrders: WorkOrder[]; 
  clients: Client[]; 
  catalogParts: CatalogItem[]; 
  catalogServices: CatalogItem[]; 
  settings: WorkshopSettings; 
}