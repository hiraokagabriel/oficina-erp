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
  /** @deprecated Não é mais gravado nem lido: `paymentDate` é a única verdade de "pago". Mantido só por bancos antigos. */
  isPaid?: boolean;
  dueDate?: string;
  paymentDate?: string;
}

export interface WorkOrder {
  id: string;
  osNumber: number;
  vehicle: string;
  clientName: string;
  clientPhone: string;
  /** Vínculos por id (schema v2; opcionais para bancos antigos). O texto acima continua sendo o gravado/exibido. */
  clientId?: string;
  vehicleId?: string;
  technicianId?: string;
  mileage: number;
  status: OSStatus;
  parts: OrderItem[];
  services: OrderItem[];
  total: number;
  totalCost?: number;
  profit?: number;
  /** @deprecated Não é mais gravado nem lido: a margem é recalculada dos itens (src/services/marginView.ts). Mantido só para ler bancos antigos. */
  profitMargin?: number;
  createdAt: string;
  financialId?: string;
  checklist?: ChecklistSchema;
  publicNotes?: string;
  paymentDate?: string;
  paymentMethod?: 'SINGLE' | 'INSTALLMENT';
  installmentConfig?: InstallmentConfig;
  technician?: string;
  /** @deprecated Schema v4: a migração v3ToV4 move para `advances`. Só lido em OS legadas ainda sem `advances`. */
  advanceAmount?: number;
  /** @deprecated Schema v4: ver `advances`. Lançamento CREDIT do adiantamento legado (syncAdvanceEntry). */
  advanceEntryId?: string;
  /** Adiantamentos da OS com data (schema v4). Cada um tem seu lançamento CREDIT já recebido. Ausente = OS legada. */
  advances?: OSAdvance[];
  /** Previsão de entrega prometida (schema v3; ISO do meio-dia local; só a data conta). Opcional. */
  expectedDate?: string;
  /** Fotos da OS (schema v5): só metadados; os JPEG ficam em `<pasta do banco>\fotos\<osId>\`. Ausente = sem fotos. */
  photos?: OSPhoto[];
}

/** Metadados de uma foto da OS (schema v5). Arquivos: `<photoId>.jpg` e miniatura `<photoId>.t.jpg`. */
export interface OSPhoto {
  id: string;
  /** ISO do momento em que a foto foi anexada. */
  createdAt: string;
  caption?: string;
}

/** Adiantamento de uma OS (schema v4). */
export interface OSAdvance {
  id: string;
  /** ISO do meio-dia local do dia do adiantamento (hoje ou passado). */
  date: string;
  /** Centavos inteiros > 0. */
  amount: number;
  /** Lançamento CREDIT já recebido no Financeiro (travado lá: edição só pela OS). */
  entryId: string;
}

/** Rascunho de adiantamento vindo do modal da OS (sem `id` = novo). `date` é 'AAAA-MM-DD' (ou ISO). */
export interface OSAdvanceDraft {
  id?: string;
  date: string;
  amount: number;
}

export type AuditAction = 'ADIANTAMENTO_CRIADO' | 'ADIANTAMENTO_ALTERADO' | 'ADIANTAMENTO_REMOVIDO';

/** Trilha de auditoria somente-acréscimo (schema v4; oculta na tela). */
export interface AuditEvent {
  id: string;
  /** ISO do momento da ação. */
  at: string;
  /** Nome do PC que fez a ação. */
  machine: string;
  action: AuditAction;
  osId: string;
  osNumber: number;
  advanceId: string;
  before?: { date: string; amount: number };
  after?: { date: string; amount: number };
  reason?: 'OS_EXCLUIDA';
}

export type AppointmentStatus = 'AGENDADO' | 'COMPARECEU' | 'CANCELADO' | 'FALTOU';

/** Agendamento de entrada de veículo (schema v3). */
export interface Appointment {
  id: string;
  /** ISO do meio-dia local do dia agendado. */
  date: string;
  /** 'HH:MM' (opcional). */
  time?: string;
  clientName: string;
  clientId?: string;
  clientPhone?: string;
  /** Texto 'modelo - PLACA', como na OS. */
  vehicle: string;
  vehicleId?: string;
  reason?: string;
  status: AppointmentStatus;
  /** OS criada a partir do agendamento. */
  workOrderId?: string;
  createdAt: string;
}

export type OSStatus =
  | 'ORCAMENTO'
  | 'APROVADO'
  | 'EM_SERVICO'
  | 'AGUARDANDO_PAGAMENTO'
  | 'FINALIZADO'
  | 'ARQUIVADO';

export const STATUS_LABELS: Record<OSStatus, string> = {
  ORCAMENTO: 'Orçamento',
  APROVADO: 'Aprovado',
  EM_SERVICO: 'Em Serviço',
  AGUARDANDO_PAGAMENTO: 'Aguardando Pagamento',
  FINALIZADO: 'Finalizado',
  ARQUIVADO: 'Arquivado',
};

export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Veículo do cliente. `id` é opcional para bancos antigos (a migração v1ToV2 o preenche). */
export interface Vehicle {
  id?: string;
  model: string;
  plate: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  notes?: string;
  vehicles: Vehicle[];
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
  category?: PartCategory;
}

export interface Technician {
  id: string;
  name: string;
}

export type PartCategory =
  | 'MOTOR'
  | 'FREIO'
  | 'SUSPENSAO'
  | 'ELETRICA'
  | 'TRANSMISSAO'
  | 'AR_CONDICIONADO'
  | 'CARROCERIA'
  | 'OUTROS';

export interface PartCategoryMeta {
  label: string;
  color: string;
}

export const PART_CATEGORY_META: Record<PartCategory, PartCategoryMeta> = {
  MOTOR:           { label: 'Motor',           color: '#E53935' },
  FREIO:           { label: 'Freio',           color: '#FB8C00' },
  SUSPENSAO:       { label: 'Suspensão',       color: '#FDD835' },
  ELETRICA:        { label: 'Elétrica',        color: '#1E88E5' },
  TRANSMISSAO:     { label: 'Transmissão',     color: '#8E24AA' },
  AR_CONDICIONADO: { label: 'Ar-condicionado', color: '#00ACC1' },
  CARROCERIA:      { label: 'Carroceria',      color: '#43A047' },
  OUTROS:          { label: 'Outros',          color: '#757575' },
};

export interface OrderItem {
  id: string;
  /** Item do catálogo de origem (schema v2; opcional). */
  catalogItemId?: string;
  description: string;
  price: number;
  cost?: number;
  category?: PartCategory;
}

export interface InstallmentConfig {
  totalAmount: number;
  installments: number;
  installmentAmount: number;
  lastInstallmentAmount: number;
  firstPaymentDate: string;
  groupId: string;
  description: string;
}

export interface WorkshopSettings {
  name: string;
  cnpj: string;
  address: string;
  exportPath: string;
  /** Meta de margem global em % inteiro (1..99). Ausente = padrão (70). Ver services/margin.ts. */
  targetMargin?: number;
  /** Mostra o selo de margem nos cartões do quadro. Ausente = desligado (o cliente no balcão pode ver a tela). */
  showMarginOnBoard?: boolean;
  /** Letras do logo impresso (1 a 3 caracteres). Ausente = 'AM'. */
  logoText?: string;
  /** Segredos: ficam só no localStorage deste PC (ver utils/secrets.ts); nunca vão para o database.json. */
  googleDriveToken?: string;
  googleApiKey?: string;
}

/** Payload que o OSModal entrega a handleSaveOSModal (App.tsx) ao salvar uma OS. */
export interface OSModalPayload {
  osNumber: number;
  createdAt: string;
  paymentDate?: string;
  /** Previsão de entrega (ISO do meio-dia local); ainda não preenchida pelo OSModal. */
  expectedDate?: string;
  /** Ainda não usados (passo posterior do plano 4.6). */
  clientId?: string;
  technicianId?: string;
  clientName: string;
  clientPhone: string;
  clientNotes: string;
  /** Modelo + placa, como gravado na OS. */
  vehicle: string;
  vehicleModelOnly: string;
  plate: string;
  mileage: number;
  parts: OrderItem[];
  services: OrderItem[];
  publicNotes: string;
  technician?: string;
  /** @deprecated Schema v4: use `advances`. Mantido só até o OSModal/App serem ligados. */
  advanceAmount?: number;
  /** Adiantamentos com data (schema v4). Lista completa: o que sumir da lista é removido. */
  advances?: OSAdvanceDraft[];
  /** Id da OS nova, gerado ao abrir a janela (as fotos já estão na pasta dessa OS). Ao editar, é o id da própria OS. */
  id?: string;
  /** Fotos da OS (metadados, schema v5): lista completa; o que sumir da lista vai para a lixeira. */
  photos?: OSPhoto[];
}

/** Ponto do gráfico de fluxo de caixa (useFinance.chartFluxo). */
export type ChartFluxoPoint = {
  name: string;
  valor: number;
};

/** Fatia do gráfico de pizza peças x serviços (useFinance.chartPie). */
export type ChartPiePoint = {
  name: string;
  value: number;
};

export interface DatabaseSchema {
  ledger: LedgerEntry[];
  workOrders: WorkOrder[];
  clients: Client[];
  catalogParts: CatalogItem[];
  catalogServices: CatalogItem[];
  catalogTechnicians: Technician[];
  /** Agendamentos (schema v3). Ausente em bancos antigos = []. */
  appointments: Appointment[];
  /** Trilha de auditoria (schema v4). Ausente em bancos antigos = []. */
  auditLog: AuditEvent[];
  settings: WorkshopSettings;
  /** Ausente = banco v0 (anterior ao controle de versão). */
  meta?: DatabaseMeta;
}

export interface DatabaseMeta {
  schemaVersion: number;
  /** Identifica o último salvamento; usada para detectar conflito entre computadores. */
  revision: string;
  /** Revisions anteriores, da mais recente para a mais antiga (máx. 50). */
  history: string[];
  savedAt: string;
  savedBy: string;
}

export type InspectionStatus = 'pending' | 'ok' | 'attention' | 'urgent';

export const INSPECTION_STATUS_META: Record<
  InspectionStatus,
  { label: string; color: string; emoji: string }
> = {
  pending:   { label: 'Não inspecionado', color: '#9E9E9E', emoji: '⚪' },
  ok:        { label: 'OK / Feito',        color: '#43A047', emoji: '🟢' },
  attention: { label: 'Necessita trocar',  color: '#FB8C00', emoji: '🟡' },
  urgent:    { label: 'Urgente!',          color: '#E53935', emoji: '🔴' },
};

export const NEXT_INSPECTION_STATUS: Record<InspectionStatus, InspectionStatus> = {
  pending:   'ok',
  ok:        'attention',
  attention: 'urgent',
  urgent:    'pending',
};

export interface InspectionItem {
  id: string;
  label: string;
  status: InspectionStatus;
  note?: string;
  custom?: boolean;
}

export interface InspectionCategory {
  id: string;
  label: string;
  items: InspectionItem[];
  custom?: boolean;
}

export interface ChecklistSchema {
  mileageIn?: number;
  categories: InspectionCategory[];
  notes: string;
  inspectedAt?: string;
}

export const DEFAULT_CHECKLIST_CATEGORIES: Omit<InspectionCategory, 'id'>[] = [
  {
    label: 'Motor',
    items: [
      { id: 'motor-1', label: 'Óleo do motor',         status: 'pending' },
      { id: 'motor-2', label: 'Filtro de óleo',         status: 'pending' },
      { id: 'motor-3', label: 'Filtro de ar',            status: 'pending' },
      { id: 'motor-4', label: 'Correia dentada',         status: 'pending' },
      { id: 'motor-5', label: 'Correia alternador/ar',   status: 'pending' },
      { id: 'motor-6', label: 'Bomba de água',          status: 'pending' },
      { id: 'motor-7', label: 'Válvula termostática',  status: 'pending' },
    ],
  },
  {
    label: 'Sistema de Freios',
    items: [
      { id: 'freio-1', label: 'Pastilha dianteira', status: 'pending' },
      { id: 'freio-2', label: 'Pastilha traseira',  status: 'pending' },
      { id: 'freio-3', label: 'Disco dianteiro',    status: 'pending' },
      { id: 'freio-4', label: 'Disco traseiro',     status: 'pending' },
      { id: 'freio-5', label: 'Fluido de freio',    status: 'pending' },
      { id: 'freio-6', label: 'Mangueiras',         status: 'pending' },
    ],
  },
  {
    label: 'Suspensão',
    items: [
      { id: 'susp-1',  label: 'Amortecedor diant. esq.', status: 'pending' },
      { id: 'susp-2',  label: 'Amortecedor diant. dir.', status: 'pending' },
      { id: 'susp-3',  label: 'Amortecedor tras. esq.',  status: 'pending' },
      { id: 'susp-4',  label: 'Amortecedor tras. dir.',  status: 'pending' },
      { id: 'susp-5',  label: 'Bandeja dianteira',       status: 'pending' },
      { id: 'susp-6',  label: 'Bieletas',                status: 'pending' },
      { id: 'susp-7',  label: 'Buchas',                  status: 'pending' },
      { id: 'susp-8',  label: 'Rolamentos',              status: 'pending' },
      { id: 'susp-9',  label: 'Braço oscilante diant.',  status: 'pending' },
      { id: 'susp-10', label: 'Braço oscilante tras.',   status: 'pending' },
    ],
  },
  {
    label: 'Direção',
    items: [
      { id: 'dir-1', label: 'Terminais direção', status: 'pending' },
      { id: 'dir-2', label: 'Caixa de direção', status: 'pending' },
      { id: 'dir-3', label: 'Fluido direção',   status: 'pending' },
      { id: 'dir-4', label: 'Alinhamento',       status: 'pending' },
      { id: 'dir-5', label: 'Braço axial',       status: 'pending' },
    ],
  },
  {
    label: 'Transmissão',
    items: [
      { id: 'trans-1', label: 'Óleo câmbio',        status: 'pending' },
      { id: 'trans-2', label: 'Filtro câmbio',       status: 'pending' },
      { id: 'trans-3', label: 'Coifa homocinética',  status: 'pending' },
    ],
  },
  {
    label: 'Sistema Elétrico',
    items: [
      { id: 'elet-1', label: 'Bateria',          status: 'pending' },
      { id: 'elet-2', label: 'Alternador',        status: 'pending' },
      { id: 'elet-3', label: 'Motor partida',     status: 'pending' },
      { id: 'elet-4', label: 'Fiação/chicotes',  status: 'pending' },
      { id: 'elet-5', label: 'Tomada',            status: 'pending' },
    ],
  },
  {
    label: 'Radiador e Arrefecimento',
    items: [
      { id: 'rad-1', label: 'Fluido radiador',       status: 'pending' },
      { id: 'rad-2', label: 'Mangueira inferior',    status: 'pending' },
      { id: 'rad-3', label: 'Mangueira superior',    status: 'pending' },
      { id: 'rad-4', label: 'Reservatório',         status: 'pending' },
      { id: 'rad-5', label: 'Termostato',            status: 'pending' },
      { id: 'rad-6', label: 'Sensor de temperatura', status: 'pending' },
      { id: 'rad-7', label: 'Selo motor',            status: 'pending' },
      { id: 'rad-8', label: 'Cano de água',         status: 'pending' },
    ],
  },
  {
    label: 'Pneus e Rodas',
    items: [
      { id: 'pneu-1', label: 'Pneu diant. esquerdo', status: 'pending' },
      { id: 'pneu-2', label: 'Pneu diant. direito',  status: 'pending' },
      { id: 'pneu-3', label: 'Pneu tras. esquerdo',  status: 'pending' },
      { id: 'pneu-4', label: 'Pneu tras. direito',   status: 'pending' },
      { id: 'pneu-5', label: 'Pressão pneus',        status: 'pending' },
    ],
  },
  {
    label: 'Sistema de Combustível',
    items: [
      { id: 'comb-1', label: 'Filtro combustível', status: 'pending' },
      { id: 'comb-2', label: 'Injetores',           status: 'pending' },
    ],
  },
  {
    label: 'Injeção Eletrônica',
    items: [
      { id: 'inj-1', label: 'Limpeza TBI',        status: 'pending' },
      { id: 'inj-2', label: 'Limpeza injetores',  status: 'pending' },
      { id: 'inj-3', label: 'Sensor O2',          status: 'pending' },
      { id: 'inj-4', label: 'Bobina ignição',    status: 'pending' },
      { id: 'inj-5', label: 'Velas de ignição',  status: 'pending' },
      { id: 'inj-6', label: 'Cabo de velas',      status: 'pending' },
    ],
  },
  {
    label: 'Ar Condicionado',
    items: [
      { id: 'ac-1', label: 'Compressor',         status: 'pending' },
      { id: 'ac-2', label: 'Gás/Refrigerante',  status: 'pending' },
      { id: 'ac-3', label: 'Filtro do clima',    status: 'pending' },
      { id: 'ac-4', label: 'Mangueiras',         status: 'pending' },
    ],
  },
  {
    label: 'Escapamento',
    items: [
      { id: 'esc-1', label: 'Silenciador',    status: 'pending' },
      { id: 'esc-2', label: 'Tubo escape',    status: 'pending' },
      { id: 'esc-3', label: 'Catalisador',    status: 'pending' },
      { id: 'esc-4', label: 'Junta coletor',  status: 'pending' },
    ],
  },
  {
    label: 'Embreagem',
    items: [
      { id: 'emb-1', label: 'Disco embreagem',  status: 'pending' },
      { id: 'emb-2', label: 'Platô',           status: 'pending' },
      { id: 'emb-3', label: 'Cilindro mestre',  status: 'pending' },
      { id: 'emb-4', label: 'Rolamento',        status: 'pending' },
    ],
  },
  {
    label: 'Iluminação',
    items: [
      { id: 'luz-1', label: 'Farol dianteiro',   status: 'pending' },
      { id: 'luz-2', label: 'Lanterna traseira', status: 'pending' },
      { id: 'luz-3', label: 'Luz interna',       status: 'pending' },
      { id: 'luz-4', label: 'Pisca',             status: 'pending' },
    ],
  },
];

export function createEmptyChecklist(mileageIn = 0): ChecklistSchema {
  return {
    mileageIn,
    categories: DEFAULT_CHECKLIST_CATEGORIES.map((cat, i) => ({
      id: `cat-default-${i}`,
      label: cat.label,
      items: cat.items.map(item => ({ ...item })),
    })),
    notes: '',
    inspectedAt: new Date().toISOString(),
  };
}

/** Checklist como pode vir de bancos antigos: parcial, nulo ou sem `categories`. */
export type LegacyChecklist = Partial<ChecklistSchema> | null | undefined;

export function migrateChecklist(raw: LegacyChecklist): ChecklistSchema {
  if (raw && Array.isArray(raw.categories)) return raw as ChecklistSchema;
  const base = createEmptyChecklist(raw?.mileageIn ?? 0);
  return { ...base, notes: raw?.notes ?? '' };
}

export interface CRMTopClient {
  client: Client;
  totalSpent: number;
  serviceCount: number;
  rank: number;
}

export interface CRMStats {
  totalClients: number;
  vipClients: Client[];
  monthlyRevenue: number;
  pendingServices: number;
  averageTicket: number;
  topClients: CRMTopClient[];
}
