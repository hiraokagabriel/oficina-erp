import { Cents, Money } from '../shared/Money';

export type OSStatus = 'ORCAMENTO' | 'APROVADO' | 'EM_SERVICO' | 'FINALIZADO';

export interface OrderItem {
  id: string;
  description: string;
  price: Cents;
}

export interface ChecklistSchema {
  fuelLevel: number;
  tires: { fl: boolean; fr: boolean; bl: boolean; br: boolean; };
  notes: string;
}

export interface WorkOrder {
  readonly id: string;
  readonly osNumber: number;
  readonly vehicle: string;
  readonly mileage: number;
  readonly clientName: string;
  readonly clientPhone: string; // NOVO CAMPO
  readonly description: string;
  readonly parts: OrderItem[];
  readonly services: OrderItem[];
  readonly status: OSStatus;
  readonly total: Cents;
  readonly createdAt: string;
  readonly financialId?: string;
  readonly checklist?: ChecklistSchema;
}

// === FUNÇÕES PURAS ===

export const createWorkOrder = (
  osNumber: number,
  vehicle: string,
  clientName: string,
  clientPhone: string, // NOVO ARGUMENTO
  mileage: number,
  parts: OrderItem[],
  services: OrderItem[]
): WorkOrder => {
  const partsTotal = parts.reduce((acc, item) => acc + item.price, 0);
  const servicesTotal = services.reduce((acc, item) => acc + item.price, 0);

  return {
    id: crypto.randomUUID(),
    osNumber,
    vehicle,
    clientName,
    clientPhone,
    mileage,
    description: "Orçamento Detalhado",
    parts,
    services,
    status: 'ORCAMENTO',
    total: partsTotal + servicesTotal,
    createdAt: new Date().toISOString()
  };
};

export const updateWorkOrderData = (
  os: WorkOrder,
  osNumber: number,
  vehicle: string,
  clientName: string,
  clientPhone: string, // NOVO ARGUMENTO
  mileage: number,
  parts: OrderItem[],
  services: OrderItem[]
): WorkOrder => {
  const partsTotal = parts.reduce((acc, item) => acc + item.price, 0);
  const servicesTotal = services.reduce((acc, item) => acc + item.price, 0);

  return {
    ...os,
    osNumber,
    vehicle,
    clientName,
    clientPhone,
    mileage,
    parts,
    services,
    total: partsTotal + servicesTotal
  };
};

export const updateWorkOrderChecklist = (
  os: WorkOrder,
  checklist: ChecklistSchema
): WorkOrder => ({
  ...os,
  checklist
});

export const advanceStatus = (os: WorkOrder): WorkOrder => {
  const flow: Record<OSStatus, OSStatus> = {
    'ORCAMENTO': 'APROVADO',
    'APROVADO': 'EM_SERVICO',
    'EM_SERVICO': 'FINALIZADO',
    'FINALIZADO': 'FINALIZADO'
  };
  return { ...os, status: flow[os.status] };
};

export const regressStatus = (os: WorkOrder): WorkOrder => {
  const flow: Record<OSStatus, OSStatus> = {
    'ORCAMENTO': 'ORCAMENTO',
    'APROVADO': 'ORCAMENTO',
    'EM_SERVICO': 'APROVADO',
    'FINALIZADO': 'EM_SERVICO'
  };
  return { ...os, status: flow[os.status] };
};

export const STATUS_LABELS: Record<OSStatus, string> = {
  'ORCAMENTO': '📝 Orçamento',
  'APROVADO': '✅ Aprovado',
  'EM_SERVICO': '🔧 Em Serviço',
  'FINALIZADO': '🏁 Finalizado'
};