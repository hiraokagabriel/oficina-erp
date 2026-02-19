export interface LedgerEntry {
  id: string;
  description: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
  effectiveDate: string;
  createdAt: string;
  groupId?: string;
  installmentNumber?: number;
  totalInstallments?: number;
  installmentGroupId?: string;
  isPaid?: boolean;
  dueDate?: string;
  paymentDate?: string;
  history?: Array<{
    date: string;
    action: string;
    user?: string;
    timestamp?: string;
  }>;
}

export interface WorkOrder {
  id: string;
  osNumber: number;
  vehicle: string;
  clientName: string;
  clientPhone: string;
  mileage: number;
  status: OSStatus;
  parts: OrderItem[];
  services: OrderItem[];
  total: number;
  totalCost?: number;
  profit?: number;
  profitMargin?: number;
  createdAt: string;
  financialId?: string;
  checklist?: ChecklistSchema;
  publicNotes?: string;
  paymentDate?: string;
  paymentMethod?: 'SINGLE' | 'INSTALLMENT';
  installmentConfig?: InstallmentConfig;
}

export type OSStatus = 'ORCAMENTO' | 'APROVADO' | 'EM_SERVICO' | 'FINALIZADO' | 'ARQUIVADO';

export const STATUS_LABELS: Record<OSStatus, string> = {
  ORCAMENTO: 'Orçamento',
  APROVADO: 'Aprovado',
  EM_SERVICO: 'Em Serviço',
  FINALIZADO: 'Finalizado',
  ARQUIVADO: 'Arquivado'
};

export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export interface Client {
  id: string;
  name: string;
  phone: string;
  notes?: string;
  vehicles: { model: string; plate: string }[];
  totalSpent?: number;
  serviceCount?: number;
  lastServiceDate?: string;
  averageTicket?: number;
  vipStatus?: boolean;
}

export interface CatalogItem {
  id: string;
  description: string;
  price: number;
  cost?: number;
}

export interface OrderItem {
  id: string;
  description: string;
  price: number;
  cost?: number;
}

export interface WorkshopSettings {
  name: string;
  cnpj: string;
  address: string;
  technician: string;
  exportPath: string;
  googleDriveToken: string;
  googleApiKey: string;
}

export interface DatabaseSchema {
  ledger: LedgerEntry[];
  workOrders: WorkOrder[];
  clients: Client[];
  catalogParts: CatalogItem[];
  catalogServices: CatalogItem[];
  settings: WorkshopSettings;
}

// 🆕 Issue #43 — Passo 1: Tipos do Checklist de Vistoria

/** Estado de conservação de cada pneu */
export type TireCondition = 'ok' | 'careca' | 'murcho' | 'avariado';

/** Rótulos de exibição e cor para cada estado de pneu */
export const TIRE_CONDITION_META: Record<TireCondition, { label: string; color: string }> = {
  ok:       { label: 'OK',      color: '#43A047' },
  careca:   { label: 'Careca', color: '#FB8C00' },
  murcho:   { label: 'Murcho', color: '#1E88E5' },
  avariado: { label: 'Avariado', color: '#E53935' },
};

/** Acessórios e itens presentes no veículo no momento da entrada */
export interface ChecklistAccessories {
  documents:  boolean; // CRLV / documentos
  spareWheel: boolean; // estepe
  jack:       boolean; // macaco
  triangle:   boolean; // triângulo de segurança
  radio:      boolean; // rádio / central multimídia
  mats:       boolean; // tapetes
  antenna:    boolean; // antena
  hubcaps:    boolean; // calotas
}

/** Valor padrão de acessórios (usado ao criar um novo checklist) */
export const DEFAULT_ACCESSORIES: ChecklistAccessories = {
  documents:  true,
  spareWheel: true,
  jack:       true,
  triangle:   true,
  radio:      false,
  mats:       false,
  antenna:    true,
  hubcaps:    true,
};

/** Rótulos legíveis dos acessórios (para exibição e impressão) */
export const ACCESSORY_LABELS: Record<keyof ChecklistAccessories, string> = {
  documents:  '📄 Documentos (CRLV)',
  spareWheel: '🔧 Estepe',
  jack:       '🛠️ Macaco',
  triangle:   '⚠️ Triângulo',
  radio:      '📡 Rádio / Central',
  mats:       '🧹 Tapetes',
  antenna:    '📶 Antena',
  hubcaps:    '⚪ Calotas',
};

/**
 * Zonas de dano no diagrama SVG (vista top-down).
 * Chave = id da zona (ex: 'hood', 'door-fl', 'rear-bumper').
 * Valor = true se a zona apresenta avaria.
 */
export type DamageZones = Record<string, boolean>;

/** Schema principal do checklist de vistoria */
export interface ChecklistSchema {
  /** Nível de combustível: 0 (vazio) → 4 (cheio), increments de 25% */
  fuelLevel: number;

  /** Estado de conservação de cada pneu */
  tires: {
    fl: TireCondition; // Dianteiro Esquerdo (OE)
    fr: TireCondition; // Dianteiro Direito  (OD)
    bl: TireCondition; // Traseiro Esquerdo  (TE)
    br: TireCondition; // Traseiro Direito   (TD)
  };

  /** Acessórios presentes na entrada (opcional para retrocompat) */
  accessories?: ChecklistAccessories;

  /** Zonas com avaria no diagrama SVG (opcional para retrocompat) */
  damageZones?: DamageZones;

  /** Quilometragem registrada no momento da entrada do veículo */
  mileageIn?: number;

  /** Observações livres do vistoriador */
  notes: string;
}

/**
 * Migra um checklist legado (tires: boolean) para o novo schema.
 * Chamado no ChecklistModal ao abrir um checklist antigo.
 */
export function migrateChecklist(raw: any): ChecklistSchema {
  const empty: ChecklistSchema = {
    fuelLevel:    0,
    tires:        { fl: 'ok', fr: 'ok', bl: 'ok', br: 'ok' },
    accessories:  { ...DEFAULT_ACCESSORIES },
    damageZones:  {},
    mileageIn:    0,
    notes:        '',
  };

  if (!raw) return empty;

  const migrateTire = (v: any): TireCondition => {
    if (v === true  || v === 'ok')       return 'ok';
    if (v === false || v === 'avariado') return 'avariado';
    if (v === 'careca' || v === 'murcho') return v as TireCondition;
    return 'ok';
  };

  const t = raw.tires ?? {};

  return {
    fuelLevel:   raw.fuelLevel   ?? 0,
    tires: {
      fl: migrateTire(t.fl),
      fr: migrateTire(t.fr),
      bl: migrateTire(t.bl),
      br: migrateTire(t.br),
    },
    accessories:  raw.accessories  ?? { ...DEFAULT_ACCESSORIES },
    damageZones:  raw.damageZones  ?? {},
    mileageIn:    raw.mileageIn    ?? 0,
    notes:        raw.notes        ?? '',
  };
}

// ✅ CORRIGIDO: InstallmentConfig com todos os campos usados
export interface InstallmentConfig {
  installments: number;
  firstPaymentDate: string;
  totalAmount: number;
  installmentAmount: number;
  lastInstallmentAmount: number;
  groupId: string;
  description: string;
  interval?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  amounts?: number[];
}

export interface CRMStats {
  totalClients: number;
  vipClients: Client[];
  monthlyRevenue: number;
  pendingServices: number;
  averageTicket: number;
  topClients: Array<{
    client: Client;
    totalSpent: number;
    serviceCount: number;
  }>;
}
