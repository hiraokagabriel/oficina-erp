import { useState, useEffect } from 'react';
import { DropResult } from '@hello-pangea/dnd';

// --- CONTEXT & HOOKS ---
import { DatabaseProvider, useDatabase } from './context/DatabaseContext';
import { useFinance } from './hooks/useFinance';
import { useKeyboard } from './hooks/useKeyboard';

// --- SERVICES ---
import { updateClientCascading, updateCatalogItemCascading } from './services/cascadeService';
import { uploadToDrive } from './services/googleDrive';

// --- COMPONENTES VISUAIS ---
import { Sidebar } from './components/Sidebar';
import { Confetti } from './components/ui/Confetti';
import { PrintableInvoice } from './components/PrintableInvoice';
import { ToastContainer, ToastMessage, ToastType } from './components/ui/ToastContainer';

// --- PÁGINAS ---
import { FinancialPage } from './pages/FinancialPage';
import { WorkshopPage } from './pages/WorkshopPage';
import { CRMPage } from './pages/CRMPage';
import { ProcessPage } from './pages/ProcessPage';
import { ConfigPage } from './pages/ConfigPage';

// --- MODAIS ---
import { OSModal } from './modals/OSModal';
import { EntryModal } from './modals/EntryModal';
import { ExportModal } from './modals/ExportModal';
import { ChecklistModal } from './modals/ChecklistModal';
import { DatabaseModal } from './modals/DatabaseModal';
import { DeleteConfirmationModal } from './modals/DeleteConfirmationModal'; // Modal Financeiro (Parcelas)
import { ConfirmationModal } from './modals/ConfirmationModal'; // Modal Genérico (UX)

// --- UTILS ---
import { SoundFX } from './utils/audio';
import { uploadToDrive } from './services/googleDrive';
import { 
  Money, createEntry, updateEntryAmount, createWorkOrder, 
  updateWorkOrderData, learnClientData, learnCatalogItems 
} from './utils/helpers';

// --- TYPES ---
import { 
  LedgerEntry, WorkOrder, Client, WorkshopSettings, DatabaseSchema, 
  OSStatus, ChecklistSchema, CatalogItem
} from './types';

// --- CONSTANTES ---
const DEFAULT_DB_PATH = "C:\\OficinaData\\database.json";
const BACKUP_PATH = "C:\\OficinaData\\Backups";

// --- AUDIO SYNTH (GAMIFICAÇÃO SEM ARQUIVOS EXTERNOS) ---
const SoundFX = {
  playTone: (freq: number, type: 'sine' | 'square' | 'triangle', duration: number) => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) { console.error("Audio error", e); }
  },
  success: () => {
    SoundFX.playTone(600, 'sine', 0.1);
    setTimeout(() => SoundFX.playTone(800, 'sine', 0.2), 100);
  },
  error: () => {
    SoundFX.playTone(150, 'square', 0.3);
  },
  pop: () => {
    SoundFX.playTone(400, 'triangle', 0.05);
  }
};

// --- COMPONENTE DE CONFETI ---
const Confetti = () => {
  const pieces = Array.from({ length: 50 });
  return (
    <div className="confetti-container">
      {pieces.map((_, i) => (
        <div 
          key={i} 
          className="confetti-piece"
          style={{
            left: `${Math.random() * 100}vw`,
            animationDelay: `${Math.random() * 2}s`,
            backgroundColor: `hsl(${Math.random() * 360}, 70%, 50%)`
          }}
        />
      ))}
    </div>
  );
};

// --- CONSTANTES VISUAIS ---
const COLORS = {
  primary: '#8257e6',
  secondary: '#00bcd4',
  success: '#04d361',
  warning: '#ff9800',
  danger: '#e54c4c',
  grid: '#323238',
  text: '#a8a8b3',
  tooltipBg: '#202024',
  cardBg: '#2b2b3b',
  border: '#3e3e4e',
  info: '#00bcd4'
};

// --- CONFIGURAÇÃO GOOGLE ---
const GOOGLE_API_KEY = "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"; 

// --- DOMAIN: SHARED/MONEY ---
const Money = {
  format: (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val / 100),
  toFloat: (val: number) => val / 100,
  fromFloat: (val: number) => Math.round(val * 100)
};

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

// --- DOMAIN: SHARED TYPES ---
type OSStatus = 'ORCAMENTO' | 'APROVADO' | 'EM_SERVICO' | 'FINALIZADO';

const STATUS_LABELS: Record<OSStatus, string> = {
  ORCAMENTO: 'Orçamento',
  APROVADO: 'Aprovado',
  EM_SERVICO: 'Em Serviço',
  FINALIZADO: 'Finalizado'
};

// --- DOMAIN: FINANCIAL/LEDGER ---
interface LedgerEntry {
  id: string;
  description: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
  effectiveDate: string; 
  history: { timestamp: string; note: string }[];
}

const createEntry = (description: string, amount: number, type: 'CREDIT' | 'DEBIT' = 'CREDIT', date?: string): LedgerEntry => ({
  id: crypto.randomUUID(),
  description,
  amount,
  type,
  effectiveDate: date ? new Date(date).toISOString() : new Date().toISOString(),
  history: [{ timestamp: new Date().toISOString(), note: 'Criação inicial' }]
});

const updateEntryAmount = (entry: LedgerEntry, newAmount: number, user: string, reason: string): LedgerEntry => ({
  ...entry,
  amount: newAmount,
  history: [...entry.history, { timestamp: new Date().toISOString(), note: `${user}: Alterou valor para ${newAmount} (${reason})` }]
});

// --- DOMAIN: WORKSHOP/WORKORDER ---
interface OrderItem { id: string; description: string; price: number; }
interface ChecklistSchema { fuelLevel: number; tires: { fl: boolean; fr: boolean; bl: boolean; br: boolean }; notes: string; }

const EMPTY_CHECKLIST: ChecklistSchema = { fuelLevel: 0, tires: { fl: true, fr: true, bl: true, br: true }, notes: "" };

interface WorkOrder {
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

const createWorkOrder = (osNumber: number, vehicle: string, clientName: string, clientPhone: string, mileage: number, parts: OrderItem[], services: OrderItem[], date?: string): WorkOrder => ({
  id: crypto.randomUUID(),
  osNumber,
  vehicle,
  clientName,
  clientPhone,
  mileage,
  status: 'ORCAMENTO',
  parts,
  services,
  total: parts.reduce((a, b) => a + b.price, 0) + services.reduce((a, b) => a + b.price, 0),
  createdAt: date ? new Date(date).toISOString() : new Date().toISOString()
});

const updateWorkOrderData = (old: WorkOrder, osNumber: number, vehicle: string, clientName: string, clientPhone: string, mileage: number, parts: OrderItem[], services: OrderItem[], date?: string): WorkOrder => ({
  ...old,
  osNumber,
  vehicle,
  clientName,
  clientPhone,
  mileage,
  parts,
  services,
  total: parts.reduce((a, b) => a + b.price, 0) + services.reduce((a, b) => a + b.price, 0),
  createdAt: date ? new Date(date).toISOString() : old.createdAt
});

const updateWorkOrderChecklist = (os: WorkOrder, checklist: ChecklistSchema): WorkOrder => ({ ...os, checklist });

const advanceStatus = (os: WorkOrder): WorkOrder => {
  const flow: OSStatus[] = ['ORCAMENTO', 'APROVADO', 'EM_SERVICO', 'FINALIZADO'];
  const idx = flow.indexOf(os.status);
  return idx < flow.length - 1 ? { ...os, status: flow[idx + 1] } : os;
};

const regressStatus = (os: WorkOrder): WorkOrder => {
  const flow: OSStatus[] = ['ORCAMENTO', 'APROVADO', 'EM_SERVICO', 'FINALIZADO'];
  const idx = flow.indexOf(os.status);
  return idx > 0 ? { ...os, status: flow[idx - 1] } : os;
};

// --- DOMAIN: WORKSHOP/CLIENT ---
interface ClientVehicle { model: string; plate: string; }
interface Client { id: string; name: string; phone: string; notes: string; vehicles: ClientVehicle[]; }

const learnClientData = (clients: Client[], name: string, vehicleModel: string, vehiclePlate: string, phone: string, notes: string): Client[] => {
  const existing = clients.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    const hasVehicle = existing.vehicles.some(v => v.model === vehicleModel && v.plate === vehiclePlate);
    return clients.map(c => c.id === existing.id ? {
      ...c,
      phone: phone || c.phone,
      notes: notes || c.notes,
      vehicles: hasVehicle ? c.vehicles : [...c.vehicles, { model: vehicleModel, plate: vehiclePlate }]
    } : c);
  }
  return [...clients, { id: crypto.randomUUID(), name, phone, notes, vehicles: [{ model: vehicleModel, plate: vehiclePlate }] }];
};

// --- DOMAIN: WORKSHOP/CATALOG ---
interface CatalogItem { description: string; price: number; }
const learnCatalogItems = (catalog: CatalogItem[], newItems: CatalogItem[]): CatalogItem[] => {
  const updated = [...catalog];
  newItems.forEach(item => {
    if (!updated.some(i => i.description.toLowerCase() === item.description.toLowerCase())) {
      updated.push(item);
    }
  });
  return updated;
};

// --- APP CONSTANTS ---
const DB_PATH = "C:\\OficinaData\\database.json";
const BACKUP_PATH = "C:\\OficinaData\\Backups";

interface WorkshopSettings { 
  name: string; 
  cnpj: string; 
  address: string; 
  technician: string; 
  exportPath: string;
  googleDriveToken: string; 
}

interface DatabaseSchema { 
  ledger: LedgerEntry[]; 
  workOrders: WorkOrder[]; 
  clients: Client[]; 
  catalogParts: CatalogItem[]; 
  catalogServices: CatalogItem[]; 
  settings: WorkshopSettings; 
}

const DEFAULT_SETTINGS: WorkshopSettings = { 
  name: "OFICINA PREMIUM", 
  cnpj: "", 
  address: "", 
  technician: "", 
  exportPath: "C:\\OficinaData\\Exportacoes",
  googleDriveToken: "" 
};

const EMPTY_CHECKLIST: ChecklistSchema = { fuelLevel: 0, tires: { fl: true, fr: true, bl: true, br: true }, notes: "" };

const COLORS = {
  primary: '#8257e6',
  secondary: '#00bcd4',
  success: '#04d361',
  warning: '#ff9800',
  danger: '#e54c4c',
  grid: '#323238',
  text: '#a8a8b3',
  tooltipBg: '#202024',
  cardBg: '#2b2b3b',
  border: '#3e3e4e',
  info: '#00bcd4'
};

// --- FUNÇÃO AUXILIAR: UPLOAD GOOGLE DRIVE ---
async function uploadToDrive(fileName: string, content: string, accessToken: string, apiKey: string) {
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([content], { type: 'application/json' }));

  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
    body: form
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || "Erro desconhecido no upload");
  }

  return await response.json();
}

function App() {
  const [dbPath] = useState(() => localStorage.getItem("oficina_db_path") || DEFAULT_DB_PATH);
  
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [catalogParts, setCatalogParts] = useState<CatalogItem[]>([]);
  const [catalogServices, setCatalogServices] = useState<CatalogItem[]>([]);
  const [settings, setSettings] = useState<WorkshopSettings>({ 
    name: "OFICINA", cnpj: "", address: "", technician: "", exportPath: "", googleDriveToken: "" 
  });
  
  // Theme Manager: Vintage Earth adicionado
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'vintage'>('dark');

  const [statusMsg, setStatusMsg] = useState("Inicializando...");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  
  // Modais
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const [isDatabaseModalOpen, setIsDatabaseModalOpen] = useState(false);

  // Estados de Edição
  const [editingOS, setEditingOS] = useState<WorkOrder | null>(null);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [checklistOS, setChecklistOS] = useState<WorkOrder | null>(null);
  const [printingOS, setPrintingOS] = useState<WorkOrder | null>(null);

  // Estados de Confirmação (UX)
  const [deleteModalInfo, setDeleteModalInfo] = useState<{ isOpen: boolean; entry: LedgerEntry | null }>({ isOpen: false, entry: null });
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const [isBackuping, setIsBackuping] = useState(false);
  const [driveStatus, setDriveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (message: string, type: ToastType = 'info') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    if (type === 'success') SoundFX.success();
    if (type === 'error') SoundFX.error();
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // --- EFEITOS ---
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const data = await invoke<string>('load_database', { filepath: dbPath });
        if (data && data.trim()) {
          const parsed = JSON.parse(data);
          setLedger(parsed.ledger || []);
          setWorkOrders(parsed.workOrders || []);
          setClients(parsed.clients || []);
          setCatalogParts(parsed.catalogParts || []);
          setCatalogServices(parsed.catalogServices || []);
          setSettings(parsed.settings || settings);
          setStatusMsg("Sistema pronto.");
        }
      } catch (e) {
        setStatusMsg("Banco novo ou erro.");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [dbPath]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (isLoading || statusMsg.includes("Erro")) return;
      if (workOrders.length === 0 && clients.length === 0 && ledger.length === 0) return;

      setIsSaving(true);
      try {
        const fullDb: DatabaseSchema = { ledger, workOrders, clients, catalogParts, catalogServices, settings };
        await invoke('save_database_atomic', { filepath: dbPath, content: JSON.stringify(fullDb) });
        setStatusMsg("Dados salvos.");
      } catch (e) {
        setStatusMsg("Erro ao salvar: " + e);
      }
  };

  const handleGoogleDriveBackup = async () => {
    if (isBackuping) return;
    
    if (!settings.googleDriveToken || settings.googleDriveToken.trim() === "") {
        alert("Por favor, insira um Token de Acesso válido nas configurações para usar o Google Drive.");
        return;
    }

    setIsBackuping(true);
    setDriveStatus('uploading');
    setDriveErrorMsg("");
    setStatusMsg("Criando backup local...");

    try {
        const fullDb: DatabaseSchema = { ledger, workOrders, clients, catalogParts, catalogServices, settings };
        const content = JSON.stringify(fullDb, null, 2); 

        const now = new Date();
        const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
        const filename = `backup_oficina_${timestamp}.json`;
        const localPath = `${BACKUP_PATH}\\${filename}`;

        try {
          await invoke('create_backup_file', { path: localPath, content: content });
        } catch (err) {
          console.warn("create_backup_file falhou, tentando save_database_atomic", err);
          await invoke('save_database_atomic', { filepath: localPath, content: content });
        }

        setStatusMsg("Enviando para nuvem Google...");
        
        await uploadToDrive(filename, content, settings.googleDriveToken, GOOGLE_API_KEY);

        setDriveStatus('success');
        SoundFX.success(); // Sound Effect
        setLastBackup(now.toLocaleString());
        setStatusMsg("Backup salvo na nuvem!");
        
    } catch (e: any) {
        console.error("Erro Backup:", e);
        setDriveStatus('error');
        SoundFX.error(); // Sound Effect
        setDriveErrorMsg(e.message || "Erro de conexão/permissão");
        setStatusMsg("Erro no backup.");
    } finally {
        setIsBackuping(false);
    }
  };

  // --- LÓGICA DE BACKUP GOOGLE DRIVE ---
  const handleGoogleDriveBackup = async () => {
    if (isBackuping) return;
    
    // Validação
    if (!settings.googleDriveToken || settings.googleDriveToken.trim() === "") {
        alert("Por favor, insira um Token de Acesso válido nas configurações para usar o Google Drive.");
        return;
    }

    setIsBackuping(true);
    setDriveStatus('uploading');
    setDriveErrorMsg("");
    setStatusMsg("Criando backup local...");

    try {
        const fullDb: DatabaseSchema = { ledger, workOrders, clients, catalogParts, catalogServices, settings };
        const content = JSON.stringify(fullDb, null, 2); 

        const now = new Date();
        const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
        const filename = `backup_oficina_${timestamp}.json`;
        const localPath = `${BACKUP_PATH}\\${filename}`;

        // Salva CÓPIA LOCAL (Via Rust)
        try {
          await invoke('create_backup_file', { path: localPath, content: content });
        } catch (err) {
          console.warn("create_backup_file falhou, tentando save_database_atomic", err);
          await invoke('save_database_atomic', { filepath: localPath, content: content });
        }

        setStatusMsg("Enviando para nuvem Google...");
        
        // UPLOAD REAL PARA O GOOGLE DRIVE
        await uploadToDrive(filename, content, settings.googleDriveToken, GOOGLE_API_KEY);

        setDriveStatus('success');
        setLastBackup(now.toLocaleString());
        setStatusMsg("Backup salvo na nuvem!");
        
    } catch (e: any) {
        console.error("Erro Backup:", e);
        setDriveStatus('error');
        setDriveErrorMsg(e.message || "Erro de conexão/permissão");
        setStatusMsg("Erro no backup.");
    } finally {
        setIsBackuping(false);
    }
  };

  // --- LOGICA EXPORTAÇÃO ---
  const availableMonths = useMemo(() => {
    const dates = new Set<string>();
    ledger.forEach(e => {
        const d = new Date(e.effectiveDate);
        if (!isNaN(d.getTime())) {
           dates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
    });
    if (dates.size === 0) {
        const now = new Date();
        dates.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    }
    return Array.from(dates).sort().reverse();
  }, [ledger]);

  const handleOpenExportModal = () => {
    setExportTargetMonth(availableMonths[0]);
    setExportPathInput(settings.exportPath || "C:\\OficinaData\\Exportacoes");
    setIsExportModalOpen(true);
  };

  const handleConfirmExport = async () => {
    if (!exportTargetMonth) return;
    const [yearStr, monthStr] = exportTargetMonth.split('-');
    const targetYear = parseInt(yearStr);
    const targetMonth = parseInt(monthStr);

    const filteredLedger = ledger.filter(e => {
        const d = new Date(e.effectiveDate);
        return d.getFullYear() === targetYear && (d.getMonth() + 1) === targetMonth;
    });

    if (filteredLedger.length === 0) { 
        alert(`Não há lançamentos financeiros registrados para o mês de competência ${monthStr}/${yearStr}.`); 
        return; 
    }

  useEffect(() => { document.documentElement.setAttribute('data-theme', currentTheme); }, [currentTheme]);
  useEffect(() => { if (showConfetti) setTimeout(() => setShowConfetti(false), 3000); }, [showConfetti]);

  useKeyboard('F2', () => {
    if (activeTab === 'OFICINA') { setEditingOS(null); setIsModalOpen(true); } 
    else { setActiveTab('OFICINA'); setTimeout(() => { setEditingOS(null); setIsModalOpen(true); }, 100); }
    addToast("Nova OS (F2)", "info");
  });
  useKeyboard('Escape', () => {
    if (isModalOpen) setIsModalOpen(false);
    if (isEntryModalOpen) { setIsEntryModalOpen(false); setEditingEntry(null); }
    if (isExportModalOpen) setIsExportModalOpen(false);
    if (isChecklistOpen) setIsChecklistOpen(false);
    if (isDatabaseModalOpen) setIsDatabaseModalOpen(false);
    if (deleteModalInfo.isOpen) setDeleteModalInfo({ isOpen: false, entry: null });
    if (pendingAction) setPendingAction(null);
  });

  // --- LÓGICA CENTRAL DE CONFIRMAÇÃO (UX Melhorada) ---
  const executePendingAction = () => {
      if (!pendingAction) return;

      if (pendingAction.type === 'DELETE_OS') {
          const os = pendingAction.data;
          setWorkOrders(p => p.filter(i => i.id !== os.id));
          if (os.financialId) setLedger(p => p.filter(e => e.id !== os.financialId));
          addToast("OS excluída com sucesso.", "info");
      }

      if (pendingAction.type === 'ARCHIVE_OS') {
          const os = pendingAction.data;
          handleUpdateStatus(os.id, 'ARQUIVADO');
          addToast("OS Arquivada.", "info");
      }

      if (pendingAction.type === 'FINISH_OS_FINANCIAL') {
          const os = pendingAction.data;
          const entry = createEntry(`Receita OS #${os.osNumber} - ${os.clientName}`, os.total, 'CREDIT', os.createdAt);
          setLedger(prev => [entry, ...prev]);
          setWorkOrders(prev => prev.map(o => o.id === os.id ? { ...o, status: 'FINALIZADO', financialId: entry.id } : o));
          addToast("OS Finalizada e Receita lançada!", "success"); 
          setShowConfetti(true);
      }

      if (pendingAction.type === 'RESTORE_FINANCIAL') {
          const os = pendingAction.data;
          setLedger(prev => prev.filter(e => e.id !== os.financialId));
          setWorkOrders(prev => prev.map(o => o.id === os.id ? { ...o, status: 'EM_SERVICO', financialId: undefined } : o));
          addToast("OS reaberta e financeiro estornado.", "info");
      }

      if (pendingAction.type === 'IMPORT_DATA') {
          const parsed = JSON.parse(pendingAction.content);
          setLedger(parsed.ledger || []); setWorkOrders(parsed.workOrders || []); setClients(parsed.clients || []);
          setCatalogParts(parsed.catalogParts || []); setCatalogServices(parsed.catalogServices || []);
          if (parsed.settings) setSettings(parsed.settings);
          addToast("Dados importados com sucesso!", "success");
      }

      setPendingAction(null);
  };

  // --- ACTIONS (Oficina & Geral) ---

  const handleUpdateStatus = (osId: string, newStatus: OSStatus) => {
    const os = workOrders.find(o => o.id === osId);
    if (!os || os.status === newStatus) return;

    if (newStatus === 'FINALIZADO' && os.status !== 'FINALIZADO' && !os.financialId) {
       setPendingAction({ type: 'FINISH_OS_FINANCIAL', data: os });
       return;
    } 
    else if (os.status === 'FINALIZADO' && newStatus !== 'FINALIZADO' && os.financialId) {
       setPendingAction({ type: 'RESTORE_FINANCIAL', data: os });
       return;
    }
    
    setWorkOrders(prev => prev.map(o => o.id === osId ? { ...o, status: newStatus } : o));
    SoundFX.pop();
  };

  // --- CORREÇÃO APLICADA AQUI: Adicionado data.publicNotes ---
  const handleSaveOSModal = (data: any) => {
    const duplicate = workOrders.find(o => o.osNumber === data.osNumber && o.id !== editingOS?.id);
    if (duplicate && !confirm(`OS #${data.osNumber} duplicada. Continuar?`)) return;

    setClients(prev => learnClientData(prev, data.clientName, data.vehicleModelOnly, data.plate, data.clientPhone, data.clientNotes));
    setCatalogParts(prev => learnCatalogItems(prev, data.parts));
    setCatalogServices(prev => learnCatalogItems(prev, data.services));

    if (editingOS) {
      const updated = updateWorkOrderData(
        editingOS, 
        data.osNumber, 
        data.vehicle, 
        data.clientName, 
        data.clientPhone, 
        data.mileage, 
        data.parts, 
        data.services, 
        data.createdAt,
        data.publicNotes // <--- SALVANDO NOTA PÚBLICA
      );

      setWorkOrders(prev => prev.map(o => o.id === editingOS.id ? updated : o));

      if (updated.financialId) {
        setLedger(prev => prev.map(e => {
            if (e.id === updated.financialId) {
                return { 
                    ...e, 
                    effectiveDate: updated.createdAt, 
                    amount: updated.total, 
                    description: `Receita OS #${data.osNumber} - ${data.clientName}`,
                    updatedAt: new Date().toISOString()
                };
            }
            return e;
        }));
      }
      addToast("OS atualizada!", "success");
    } else {
      const newOS = createWorkOrder(
        data.osNumber, 
        data.vehicle, 
        data.clientName, 
        data.clientPhone, 
        data.mileage, 
        data.parts, 
        data.services, 
        data.createdAt,
        data.publicNotes // <--- SALVANDO NOTA PÚBLICA
      );
      setWorkOrders(prev => [...prev, newOS]);
      addToast("Nova OS criada!", "success");
    }
    setIsModalOpen(false);
  };

  // --- ACTIONS (Financeiro) ---
  const handleSaveEntryModal = (desc: string, val: number, type: 'CREDIT' | 'DEBIT', dateStr: string, recurrence: 'SINGLE' | 'INSTALLMENT' | 'RECURRING', count: number) => {
      const absVal = Math.abs(val);
      if (editingEntry) {
          finance.updateEntry({ ...editingEntry, description: desc, amount: Money.fromFloat(absVal), type, effectiveDate: dateStr, updatedAt: new Date().toISOString() });
          addToast("Lançamento atualizado.", "success");
          setEditingEntry(null);
      } else {
          const createdCount = finance.addEntryWithRecurrence(desc, val, type, dateStr, recurrence, count);
          addToast(createdCount > 1 ? `${createdCount} lançamentos gerados!` : "Lançamento registrado.", "success");
      }
      setIsEntryModalOpen(false);
  };

  const handleEditEntry = (id: string) => {
      const linkedOS = workOrders.find(o => o.financialId === id);
      if (linkedOS) {
          if(confirm(`Este lançamento pertence à OS #${linkedOS.osNumber}.\nAbrir OS para edição?`)) { setEditingOS(linkedOS); setIsModalOpen(true); }
      } else {
          const entry = ledger.find(e => e.id === id);
          if (entry) { setEditingEntry(entry); setIsEntryModalOpen(true); }
      }
  };

  const handleRequestDeleteEntry = (entry: LedgerEntry) => setDeleteModalInfo({ isOpen: true, entry });
  const confirmDeleteSingle = () => { if (deleteModalInfo.entry) { finance.deleteEntry(deleteModalInfo.entry.id); addToast("Excluído.", "info"); } setDeleteModalInfo({ isOpen: false, entry: null }); };
  const confirmDeleteGroup = () => { if (deleteModalInfo.entry?.groupId) { finance.deleteGroup(deleteModalInfo.entry.groupId); addToast("Série excluída.", "info"); } setDeleteModalInfo({ isOpen: false, entry: null }); };

  // --- ACTIONS (Cadastros & Backup) ---
  const handleSaveClient = (updatedClient: Client) => {
    const oldClient = clients.find(c => c.id === updatedClient.id);
    setClients(prev => { const exists = prev.find(c => c.id === updatedClient.id); return exists ? prev.map(c => c.id === updatedClient.id ? updatedClient : c) : [...prev, updatedClient]; });
    const { newWorkOrders, newLedger, hasChanges } = updateClientCascading(oldClient, updatedClient, workOrders, ledger);
    if (hasChanges) { setWorkOrders(newWorkOrders); setLedger(newLedger); addToast("Atualizado em cascata!", "success"); } else { addToast("Salvo!", "success"); }
  };

  const handleSaveCatalogItem = (updatedItem: CatalogItem, type: 'part' | 'service') => {
    let oldItem: CatalogItem | undefined;
    if (type === 'part') {
        oldItem = catalogParts.find(p => p.id === updatedItem.id);
        setCatalogParts(prev => { const ex = prev.find(p => p.id === updatedItem.id); return ex ? prev.map(p => p.id === updatedItem.id ? updatedItem : p) : [...prev, updatedItem]; });
    } else {
        oldItem = catalogServices.find(s => s.id === updatedItem.id);
        setCatalogServices(prev => { const ex = prev.find(s => s.id === updatedItem.id); return ex ? prev.map(s => s.id === updatedItem.id ? updatedItem : s) : [...prev, updatedItem]; });
    }
    const { newWorkOrders, hasChanges } = updateCatalogItemCascading(oldItem, updatedItem, workOrders);
    if (hasChanges) { setWorkOrders(newWorkOrders); addToast("Atualizado em cascata!", "success"); } else { addToast("Salvo!", "success"); }
  };

  const handleBackup = async () => {
    if (!settings.googleDriveToken) return addToast("Configure o Token.", "error");
    setIsBackuping(true); setDriveStatus('idle');
    try {
      const content = JSON.stringify({ ledger, workOrders, clients, settings, catalogParts, catalogServices });
      await uploadToDrive(`backup_${Date.now()}.json`, content, settings.googleDriveToken, GOOGLE_API_KEY);
      setDriveStatus('success'); addToast("Backup realizado!", "success");
    } catch { setDriveStatus('error'); addToast("Erro no backup.", "error"); } finally { setIsBackuping(false); }
  };

  const handleImportData = (content: string) => {
     setPendingAction({ type: 'IMPORT_DATA', content });
  };

  // --- RENDER ---
  return (
    <>
      {showConfetti && <Confetti />}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div className="app-container">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        
        <main className="main-content">
          {activeTab === 'FINANCEIRO' && (
            <FinancialPage 
              isLoading={isLoading} kpiData={finance.kpiData} chartDataFluxo={finance.chartFluxo} chartDataPie={finance.chartPie} ledger={finance.filteredLedger} Money={Money}
              onOpenExport={() => setIsExportModalOpen(true)} onOpenEntry={() => { setEditingEntry(null); setIsEntryModalOpen(true); }} onEditEntry={handleEditEntry} 
              onDeleteEntry={handleRequestDeleteEntry} selectedMonth={finance.selectedMonth} onMonthChange={finance.setSelectedMonth} viewMode={finance.viewMode} setViewMode={finance.setViewMode} filterType={finance.filterType} setFilterType={finance.setFilterType}
            />
          )}

          {activeTab === 'OFICINA' && (
            <WorkshopPage 
              workOrders={workOrders} isLoading={isLoading} formatMoney={Money.format}
              onNewOS={() => { setEditingOS(null); setIsModalOpen(true); }}
              onDragEnd={(res: DropResult) => { if (res.destination && res.destination.droppableId !== res.source.droppableId) handleUpdateStatus(res.draggableId, res.destination.droppableId as OSStatus); }}
              kanbanActions={{
                onRegress: (id) => { const os = workOrders.find(o=>o.id===id); if(os) handleUpdateStatus(id, os.status==='FINALIZADO'?'EM_SERVICO':os.status==='EM_SERVICO'?'APROVADO':'ORCAMENTO'); },
                onAdvance: (id) => { const os = workOrders.find(o=>o.id===id); if(os) handleUpdateStatus(id, os.status==='ORCAMENTO'?'APROVADO':os.status==='APROVADO'?'EM_SERVICO':'FINALIZADO'); },
                onEdit: (os) => { setEditingOS(os); setIsModalOpen(true); },
                onChecklist: (os) => { setChecklistOS(os); setIsChecklistOpen(true); },
                onPrint: (os) => { setPrintingOS(os); setTimeout(() => window.print(), 100); },
                onDelete: (os) => setPendingAction({ type: 'DELETE_OS', data: os }),
                onArchive: (os) => setPendingAction({ type: 'ARCHIVE_OS', data: os }),
                onRestore: (os) => handleUpdateStatus(os.id, 'ORCAMENTO'),
                onQuickFinish: (id) => handleUpdateStatus(id, 'FINALIZADO')
              }}
            />
          )}

          {activeTab === 'PROCESSOS' && <ProcessPage workOrders={workOrders} onOpenNew={() => { setEditingOS(null); setIsModalOpen(true); }} onUpdateStatus={handleUpdateStatus} />}
          {activeTab === 'CLIENTES' && <CRMPage clients={clients} workOrders={workOrders} isLoading={isLoading} formatMoney={Money.format} />}
          
          {activeTab === 'CONFIG' && (
            <ConfigPage settings={settings} setSettings={setSettings} currentTheme={currentTheme} setCurrentTheme={setCurrentTheme} onBackup={handleBackup} isBackuping={isBackuping} driveStatus={driveStatus} onImportData={handleImportData} onOpenDatabase={() => setIsDatabaseModalOpen(true)} />
          )}
        </main>
      </div>

      <OSModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveOSModal} editingOS={editingOS} clients={clients} catalogParts={catalogParts} catalogServices={catalogServices} nextOSNumber={workOrders.length > 0 ? Math.max(...workOrders.map(o => o.osNumber)) + 1 : 1} isSaving={isSaving} formatMoney={Money.format} />
      <EntryModal isOpen={isEntryModalOpen} onClose={() => { setIsEntryModalOpen(false); setEditingEntry(null); }} onSave={handleSaveEntryModal} initialData={editingEntry} />
      <DatabaseModal isOpen={isDatabaseModalOpen} onClose={() => setIsDatabaseModalOpen(false)} clients={clients} catalogParts={catalogParts} catalogServices={catalogServices} onSaveClient={handleSaveClient} onDeleteClient={(id) => setClients(p => p.filter(c => c.id !== id))} onSaveCatalogItem={handleSaveCatalogItem} onDeleteCatalogItem={(id, type) => type === 'part' ? setCatalogParts(p=>p.filter(x=>x.id!==id)) : setCatalogServices(p=>p.filter(x=>x.id!==id))} formatMoney={Money.format} />
      <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} ledger={ledger} workOrders={workOrders} defaultPath={settings.exportPath} Money={Money} SoundFX={{ success: () => addToast("Sucesso!", "success"), error: () => addToast("Erro", "error") }} />
      <ChecklistModal isOpen={isChecklistOpen} onClose={() => setIsChecklistOpen(false)} onSave={(data) => { if(checklistOS) setWorkOrders(p=>p.map(o=>o.id===checklistOS.id ? {...o, checklist:data} : o)); setIsChecklistOpen(false); }} os={checklistOS} />
      <PrintableInvoice data={printingOS} settings={settings} formatMoney={Money.format} />

      <DeleteConfirmationModal 
        isOpen={deleteModalInfo.isOpen}
        onClose={() => setDeleteModalInfo({ isOpen: false, entry: null })}
        onConfirmSingle={confirmDeleteSingle}
        onConfirmGroup={confirmDeleteGroup}
        isGroup={!!deleteModalInfo.entry?.groupId} 
      />

      <ConfirmationModal
        isOpen={!!pendingAction}
        onClose={() => setPendingAction(null)}
        onConfirm={executePendingAction}
        title={pendingAction?.type === 'DELETE_OS' ? 'Excluir Ordem de Serviço?' : 
               pendingAction?.type === 'ARCHIVE_OS' ? 'Arquivar Ordem de Serviço?' :
               pendingAction?.type === 'FINISH_OS_FINANCIAL' ? 'OS Finalizada' : 
               pendingAction?.type === 'RESTORE_FINANCIAL' ? 'Reabrir OS?' :
               pendingAction?.type === 'IMPORT_DATA' ? 'Importar Backup?' : 'Confirmar'}
        message={pendingAction?.type === 'DELETE_OS' ? 'Esta ação removerá a OS e qualquer lançamento financeiro vinculado. Não pode ser desfeito.' : 
                 pendingAction?.type === 'ARCHIVE_OS' ? 'A OS sairá do quadro Kanban mas ficará salva no histórico.' :
                 pendingAction?.type === 'FINISH_OS_FINANCIAL' ? `Deseja lançar o valor de ${Money.format(pendingAction.data?.total || 0)} nas Receitas?` :
                 pendingAction?.type === 'RESTORE_FINANCIAL' ? 'Isso removerá o lançamento financeiro vinculado e voltará a OS para "Em Serviço".' :
                 pendingAction?.type === 'IMPORT_DATA' ? 'ATENÇÃO: Isso substituirá todos os dados atuais pelos do backup. Continuar?' : 'Tem certeza?'}
        confirmText={pendingAction?.type === 'DELETE_OS' ? 'Excluir' : pendingAction?.type === 'IMPORT_DATA' ? 'Substituir Tudo' : 'Confirmar'}
        confirmColor={pendingAction?.type === 'DELETE_OS' || pendingAction?.type === 'RESTORE_FINANCIAL' ? 'danger' : 'primary'}
      />
    </>
  );
}

function App() {
  return (
    <DatabaseProvider>
      <AppContent />
    </DatabaseProvider>
  );
}

export default App;