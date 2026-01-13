import React, { useState, useEffect } from 'react';
import { WorkshopPage } from './pages/WorkshopPage';
import { FinancialPage } from './pages/FinancialPage';
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

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(mockWorkOrders);
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);
  const [clients, setClients] = useState<Client[]>(mockClients);
  const [processes, setProcesses] = useState<ProcessDefinition[]>(mockProcesses);
  const [config, setConfig] = useState<AppConfig>(mockConfig);

  // Update theme on document
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const formatMoney = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
  };

  return (
    <div className="app-container" data-theme={theme}>
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">🏭</span>
            <span className="logo-text">Oficina ERP</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${currentPage === item.page ? 'active' : ''}`}
              onClick={() => setCurrentPage(item.page as PageType)}
              title={item.label}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className="theme-toggle"
            onClick={() => handleThemeChange(theme === 'dark' ? 'light' : 'dark')}
            title="Toggle tema"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <div className="main-inner">
          {currentPage === 'workshop' && (
            <WorkshopPage
              workOrders={workOrders}
              isLoading={false}
              formatMoney={formatMoney}
              onNewOS={() => console.log('New OS')}
              onDragEnd={() => console.log('Drag end')}
              kanbanActions={{
                onRegress: () => {},
                onAdvance: () => {},
                onEdit: () => {},
                onChecklist: () => {},
                onPrint: () => {},
                onDelete: () => {},
                onArchive: () => {},
                onRestore: () => {},
                onQuickFinish: () => {},
              }}
            />
          )}

          {currentPage === 'financial' && (
            <FinancialPage
              transactions={transactions}
              isLoading={false}
              formatMoney={formatMoney}
              onAddTransaction={() => console.log('Add transaction')}
              onEditTransaction={() => console.log('Edit transaction')}
              onDeleteTransaction={() => console.log('Delete transaction')}
            />
          )}

          {currentPage === 'crm' && (
            <CRMPage
              clients={clients}
              isLoading={false}
              onAddClient={() => console.log('Add client')}
              onEditClient={() => console.log('Edit client')}
              onDeleteClient={() => console.log('Delete client')}
              onViewOrders={() => console.log('View orders')}
            />
          )}

          {currentPage === 'process' && (
            <ProcessPage
              processes={processes}
              isLoading={false}
              onAddProcess={() => console.log('Add process')}
              onEditProcess={() => console.log('Edit process')}
              onDeleteProcess={() => console.log('Delete process')}
              onToggleActive={() => console.log('Toggle active')}
            />
          )}

          {currentPage === 'config' && (
            <ConfigPage
              config={config}
              isLoading={false}
              onSaveConfig={(newConfig) => setConfig(newConfig)}
              onResetConfig={() => setConfig(mockConfig)}
              theme={theme}
              onThemeChange={handleThemeChange}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
