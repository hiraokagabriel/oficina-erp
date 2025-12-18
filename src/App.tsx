import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DropResult } from '@hello-pangea/dnd';

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

// --- SERVICES & UTILS ---
import { SoundFX } from './utils/audio';
import { uploadToDrive } from './services/googleDrive';
import { 
  Money, createEntry, updateEntryAmount, createWorkOrder, 
  updateWorkOrderData, learnClientData, learnCatalogItems 
} from './utils/helpers';

// --- TYPES ---
import { 
  LedgerEntry, WorkOrder, Client, WorkshopSettings, DatabaseSchema, 
  OSStatus, ChecklistSchema
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

  // Estados de Modais
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  
  const [editingOS, setEditingOS] = useState<WorkOrder | null>(null);
  const [checklistOS, setChecklistOS] = useState<WorkOrder | null>(null);
  const [printingOS, setPrintingOS] = useState<WorkOrder | null>(null);

  const [isBackuping, setIsBackuping] = useState(false);
  const [driveStatus, setDriveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Estado de Notificações
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Helper de Notificação
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

  // --- HANDLERS ---
  const handleImportData = (content: string) => {
    try {
      const parsed = JSON.parse(content);
      if (!parsed.workOrders && !parsed.clients && !parsed.ledger) {
        addToast("Arquivo de backup inválido.", "error"); return;
      }
      if (confirm(`Importar backup? Substituirá dados atuais.`)) {
        setLedger(parsed.ledger || []);
        setWorkOrders(parsed.workOrders || []);
        setClients(parsed.clients || []);
        setCatalogParts(parsed.catalogParts || []);
        setCatalogServices(parsed.catalogServices || []);
        if (parsed.settings) setSettings(parsed.settings);
        addToast("Dados importados com sucesso!", "success");
      }
    } catch (e) { addToast("Erro ao ler JSON.", "error"); }
  };

  const handleSaveOSModal = (data: any) => {
    const duplicate = workOrders.find(o => o.osNumber === data.osNumber && o.id !== editingOS?.id);
    if (duplicate && !confirm(`OS #${data.osNumber} duplicada. Continuar?`)) return;

    setClients(prev => learnClientData(prev, data.clientName, data.vehicleModelOnly, data.plate, data.clientPhone, data.clientNotes));
    setCatalogParts(prev => learnCatalogItems(prev, data.parts));
    setCatalogServices(prev => learnCatalogItems(prev, data.services));

    if (editingOS) {
      const updated = updateWorkOrderData(editingOS, data.osNumber, data.vehicle, data.clientName, data.clientPhone, data.mileage, data.parts, data.services, data.createdAt);
      setWorkOrders(prev => prev.map(o => o.id === editingOS.id ? updated : o));
      if (updated.financialId) {
        setLedger(prev => prev.map(e => e.id === updated.financialId ? updateEntryAmount(e, Money.toFloat(updated.total), "Sistema", `Atualização OS #${data.osNumber}`) : e));
      }
      addToast("OS atualizada com sucesso!", "success");
    } else {
      const newOS = createWorkOrder(data.osNumber, data.vehicle, data.clientName, data.clientPhone, data.mileage, data.parts, data.services, data.createdAt);
      setWorkOrders(prev => [...prev, newOS]);
      addToast("Nova OS criada!", "success");
    }
    
    setIsModalOpen(false);
  };

  const handleUpdateStatus = (osId: string, newStatus: OSStatus) => {
    const os = workOrders.find(o => o.id === osId);
    if (!os || os.status === newStatus) return;

    if (newStatus === 'FINALIZADO' && os.status !== 'FINALIZADO' && !os.financialId) {
       if (confirm(`Lançar ${Money.format(os.total)} no financeiro?`)) {
           const entry = createEntry(`Receita OS #${os.osNumber} - ${os.clientName}`, os.total, 'CREDIT', os.createdAt);
           setLedger(prev => [entry, ...prev]);
           setWorkOrders(prev => prev.map(o => o.id === osId ? { ...o, status: newStatus, financialId: entry.id } : o));
           
           addToast("OS Finalizada e Receita lançada!", "success"); 
           setShowConfetti(true);
           return;
       }
    } else if (os.status === 'FINALIZADO' && newStatus !== 'FINALIZADO' && os.financialId) {
        if (confirm("Remover lançamento financeiro?")) {
            setLedger(prev => prev.filter(e => e.id !== os.financialId));
            setWorkOrders(prev => prev.map(o => o.id === osId ? { ...o, status: newStatus, financialId: undefined } : o));
            addToast("OS reaberta e financeiro estornado.", "info");
            return;
        }
    }
    setWorkOrders(prev => prev.map(o => o.id === osId ? { ...o, status: newStatus } : o));
    SoundFX.pop();
  };

  const handleDeleteOS = (os: WorkOrder) => {
     if (confirm("Tem certeza? Isso excluirá a OS e o lançamento financeiro vinculado.")) {
         setWorkOrders(p => p.filter(i => i.id !== os.id));
         if (os.financialId) setLedger(p => p.filter(e => e.id !== os.financialId));
         addToast("OS Excluída.", "info");
     }
  };

  // --- LÓGICA DE IMPRESSÃO COM NOME DE ARQUIVO AUTOMÁTICO ---
  const handlePrintOS = (os: WorkOrder) => {
      setPrintingOS(os);
      
      // 1. Salva o título atual da janela ("OficinaPro")
      const originalTitle = document.title;

      // 2. Tenta obter a placa (caso exista na interface WorkOrder, senão usa string vazia)
      // Se a placa já estiver escrita no campo 'vehicle', isso pode duplicar, mas garante o pedido.
      const plateSuffix = (os as any).plate ? ` ${(os as any).plate}` : '';

      // 3. Define o título da página para o nome do arquivo desejado
      // Formato: OS [Numero] [Cliente] [Veiculo] [Placa]
      // Ex: "OS 1042 João Silva Honda Civic ABC-1234"
      document.title = `OS ${os.osNumber} ${os.clientName} ${os.vehicle}${plateSuffix}`;

      // 4. Aguarda renderização e chama o print
      setTimeout(() => {
          window.print();
          // 5. Restaura o título original
          document.title = originalTitle;
      }, 100);
  };

  const handleSaveChecklist = (data: ChecklistSchema) => {
    if (!checklistOS) return;
    setWorkOrders(prev => prev.map(o => o.id === checklistOS.id ? { ...o, checklist: data } : o));
    addToast("Vistoria salva!", "success");
    setIsChecklistOpen(false);
  };

  const handleSaveEntryModal = (desc: string, val: number, type: 'CREDIT' | 'DEBIT', date?: string) => {
      const entry = createEntry(desc, Money.fromFloat(Math.abs(val)), type, date);
      setLedger(prev => [entry, ...prev]);
      addToast("Lançamento financeiro registrado.", "success");
  };

  const handleDeleteEntry = (entry: LedgerEntry) => {
     if (confirm("Excluir lançamento?")) {
         setLedger(p => p.filter(e => e.id !== entry.id));
         setWorkOrders(p => p.map(o => o.financialId === entry.id ? { ...o, financialId: undefined } : o));
         addToast("Lançamento excluído.", "info");
     }
  };
  
  const handleEditEntry = (id: string) => {
      const entry = ledger.find(e => e.id === id);
      if (!entry) return;
      const newValStr = prompt("Novo valor:", Money.toFloat(entry.amount).toString());
      if (newValStr) {
          const val = parseFloat(newValStr.replace(',', '.'));
          if (!isNaN(val)) {
            setLedger(p => p.map(e => e.id === id ? updateEntryAmount(e, Money.fromFloat(val), "Admin", "Edição") : e));
            addToast("Valor atualizado.", "success");
          }
      }
  };

  const handleBackup = async () => {
    if (!settings.googleDriveToken) return addToast("Configure o Token do Google Drive na aba Config.", "error");
    setIsBackuping(true); setDriveStatus('idle');
    try {
      const content = JSON.stringify({ ledger, workOrders, clients, settings, catalogParts, catalogServices });
      await uploadToDrive(`backup_${Date.now()}.json`, content, settings.googleDriveToken, GOOGLE_API_KEY);
      setDriveStatus('success'); 
      addToast("Backup na nuvem realizado!", "success");
    } catch { 
      setDriveStatus('error'); 
      addToast("Erro no backup. Verifique sua conexão/token.", "error");
    } 
    finally { setIsBackuping(false); }
  };

  const kpiData = useMemo(() => ({
      saldo: ledger.reduce((a,e) => a + (e.type === 'CREDIT' ? e.amount : -e.amount), 0),
      receitas: ledger.filter(e => e.type === 'CREDIT').reduce((a,e)=>a+e.amount, 0),
      despesas: ledger.filter(e => e.type === 'DEBIT').reduce((a,e)=>a+e.amount, 0),
      ticketMedio: workOrders.filter(o => o.status === 'FINALIZADO').reduce((a,o)=>a+o.total, 0) / (workOrders.filter(o => o.status === 'FINALIZADO').length || 1)
  }), [ledger, workOrders]);

  const chartFluxo = useMemo(() => {
     const map: Record<string, number> = {};
     ledger.forEach(e => { if(e.type==='CREDIT') map[e.effectiveDate.slice(5, 10)] = (map[e.effectiveDate.slice(5, 10)] || 0) + e.amount; });
     return Object.entries(map).sort().slice(-10).map(([k, v]) => ({ name: k, valor: Money.toFloat(v) }));
  }, [ledger]);

  const chartPie = useMemo(() => {
      let parts = 0, servs = 0;
      workOrders.forEach(o => { parts += o.parts.reduce((a,i)=>a+i.price,0); servs += o.services.reduce((a,i)=>a+i.price,0); });
      return parts+servs === 0 ? [{name:'-', value:1}] : [{name:'Peças', value: Money.toFloat(parts)}, {name:'Serviços', value: Money.toFloat(servs)}];
  }, [workOrders]);

  return (
    <>
      {showConfetti && <Confetti />}
      
      {/* Container de Notificações */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div className="app-container">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        
        <main className="main-content">
          {activeTab === 'FINANCEIRO' && (
            <FinancialPage 
              isLoading={isLoading} kpiData={kpiData} chartDataFluxo={chartFluxo} chartDataPie={chartPie} ledger={ledger} Money={Money}
              onOpenExport={() => setIsExportModalOpen(true)} onOpenEntry={() => setIsEntryModalOpen(true)} onEditEntry={handleEditEntry} onDeleteEntry={handleDeleteEntry}
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
                onPrint: handlePrintOS,
                onDelete: handleDeleteOS
              }}
            />
          )}

          {activeTab === 'PROCESSOS' && <ProcessPage workOrders={workOrders} onOpenNew={() => { setEditingOS(null); setIsModalOpen(true); }} onUpdateStatus={handleUpdateStatus} />}
          {activeTab === 'CLIENTES' && <CRMPage clients={clients} workOrders={workOrders} isLoading={isLoading} formatMoney={Money.format} />}
          {activeTab === 'CONFIG' && <ConfigPage settings={settings} setSettings={setSettings} currentTheme={currentTheme} setCurrentTheme={setCurrentTheme} onBackup={handleBackup} isBackuping={isBackuping} driveStatus={driveStatus} onImportData={handleImportData} />}
        </main>
      </div>

      <OSModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveOSModal} editingOS={editingOS} clients={clients} catalogParts={catalogParts} catalogServices={catalogServices} nextOSNumber={workOrders.length > 0 ? Math.max(...workOrders.map(o => o.osNumber)) + 1 : 1} isSaving={isSaving} formatMoney={Money.format} />
      <EntryModal isOpen={isEntryModalOpen} onClose={() => setIsEntryModalOpen(false)} onSave={handleSaveEntryModal} />
      
      <ExportModal 
        isOpen={isExportModalOpen} 
        onClose={() => setIsExportModalOpen(false)} 
        ledger={ledger} 
        workOrders={workOrders} 
        defaultPath={settings.exportPath} 
        Money={Money} 
        SoundFX={{ success: () => addToast("Exportado com sucesso!", "success"), error: () => addToast("Erro ao exportar", "error") }} 
      />
      
      <ChecklistModal isOpen={isChecklistOpen} onClose={() => setIsChecklistOpen(false)} onSave={handleSaveChecklist} os={checklistOS} />
      
      <PrintableInvoice data={printingOS} settings={settings} formatMoney={Money.format} />
    </>
  );
}

export default App;