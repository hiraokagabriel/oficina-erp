import { useState, useEffect, useMemo, useRef } from 'react';

// --- BIBLIOTECA DE DRAG AND DROP PERFORMÁTICA ---
// Requer: npm install @hello-pangea/dnd
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

import { invoke } from '@tauri-apps/api/core';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

// --- CONFIGURAÇÃO GOOGLE ---
const GOOGLE_API_KEY = "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"; 

// --- CONFIGURAÇÃO PADRÃO DO BANCO DE DADOS ---
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
  // --- ESTADO GLOBAL ---
  const [dbPath, setDbPath] = useState(() => {
    return localStorage.getItem("oficina_db_path") || DEFAULT_DB_PATH;
  });
  const [tempDbPath, setTempDbPath] = useState(dbPath);

  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [catalogParts, setCatalogParts] = useState<CatalogItem[]>([]);
  const [catalogServices, setCatalogServices] = useState<CatalogItem[]>([]);
  const [settings, setSettings] = useState<WorkshopSettings>(DEFAULT_SETTINGS);
  
  // Theme Manager
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'vintage'>('dark');

  const [statusMsg, setStatusMsg] = useState("Inicializando...");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // NOVO: Estado de carregamento
  
  // Estado do Backup
  const [isBackuping, setIsBackuping] = useState(false);
  const [driveStatus, setDriveStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [driveErrorMsg, setDriveErrorMsg] = useState("");
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'FINANCEIRO' | 'OFICINA' | 'PROCESSOS' | 'CLIENTES' | 'CONFIG'>('FINANCEIRO');

  // Estados UI
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOS, setEditingOS] = useState<WorkOrder | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportTargetMonth, setExportTargetMonth] = useState(""); 
  const [exportPathInput, setExportPathInput] = useState("");
  const [showConfetti, setShowConfetti] = useState(false); // NOVO: Gamificação

  // ESTADO PARA MODAL DE LANÇAMENTO
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [entryDate, setEntryDate] = useState("");
  const [entryDescription, setEntryDescription] = useState("");
  const [entryValue, setEntryValue] = useState("");
  const [entryType, setEntryType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  
  // ESTADO PARA EDIÇÃO RÁPIDA DE STATUS NA ABA PROCESSOS E ORDENAÇÃO
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: 'createdAt' | 'clientName' | 'total' | 'osNumber', direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });

  // CRM
  const [selectedClientForCRM, setSelectedClientForCRM] = useState<Client | null>(null);

  // Form OS
  const [formOSNumber, setFormOSNumber] = useState("");
  const [formDate, setFormDate] = useState(""); 
  const [formClient, setFormClient] = useState("");
  const [formContact, setFormContact] = useState("");
  const [formClientNotes, setFormClientNotes] = useState("");
  const [formVehicle, setFormVehicle] = useState("");
  const [formPlate, setFormPlate] = useState("");
  const [formMileage, setFormMileage] = useState("");
  const [formParts, setFormParts] = useState<OrderItem[]>([]);
  const [formServices, setFormServices] = useState<OrderItem[]>([]);

  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const [checklistOS, setChecklistOS] = useState<WorkOrder | null>(null);
  const [checkFuel, setCheckFuel] = useState(0);
  const [checkTires, setCheckTires] = useState(EMPTY_CHECKLIST.tires);
  const [checkNotes, setCheckNotes] = useState("");
  const [printingOS, setPrintingOS] = useState<WorkOrder | null>(null);

  // --- EFEITO: TEMA ---
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
  }, [currentTheme]);

  // --- EFEITO: CONFETE ---
  useEffect(() => {
    if (showConfetti) {
      const t = setTimeout(() => setShowConfetti(false), 3500);
      return () => clearTimeout(t);
    }
  }, [showConfetti]);

  // --- LÓGICA CRM (Sugestões) ---
  const suggestedVehicles = useMemo(() => {
    if (!formClient) return [];
    const client = clients.find(c => c.name.toLowerCase() === formClient.trim().toLowerCase());
    if (client) {
        if (!formContact) setFormContact(client.phone || "");
        if (!formClientNotes) setFormClientNotes(client.notes || "");
    }
    return client ? client.vehicles : [];
  }, [formClient, clients]);

  useEffect(() => {
    if (formVehicle && suggestedVehicles.length > 0) {
      const match = suggestedVehicles.find(v => v.model.toLowerCase() === formVehicle.toLowerCase());
      if (match && match.plate) setFormPlate(match.plate);
    }
  }, [formVehicle, suggestedVehicles]);

  // --- DATA LOAD ---
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setStatusMsg(`Carregando de: ${dbPath}...`);
      try {
        const data = await invoke<string>('load_database', { filepath: dbPath });
        
        // Simular um pequeno delay para mostrar o Skeleton (Feedback Visual 2.1)
        await new Promise(r => setTimeout(r, 600));

        if (data && data.trim() !== "") {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            setLedger(parsed); setWorkOrders([]); setClients([]); setSettings(DEFAULT_SETTINGS);
          } else {
            const migratedLedger = (parsed.ledger || []).map((e: any) => ({
              ...e,
              effectiveDate: e.effectiveDate || (e.history[0]?.timestamp || new Date().toISOString())
            }));
            setLedger(migratedLedger);
            
            const migatedOS = (parsed.workOrders || []).map((os: any, index: number) => ({
              ...os,
              osNumber: os.osNumber || (index + 1),
              mileage: os.mileage || 0,
              clientPhone: os.clientPhone || "",
              parts: os.parts || [],
              services: os.services || (os.description ? [{ id: 'legacy', description: os.description, price: os.total }] : []),
              createdAt: os.createdAt || new Date().toISOString()
            }));
            setWorkOrders(migatedOS);
            setClients(parsed.clients || []);
            setCatalogParts(parsed.catalogParts || []);
            setCatalogServices(parsed.catalogServices || []);
            setSettings({ ...DEFAULT_SETTINGS, ...(parsed.settings || {}) });
          }
          setStatusMsg("Sistema pronto.");
        } else {
          setStatusMsg("Banco vazio ou novo. Pronto para iniciar.");
        }
      } catch (e) {
        console.error("Erro ao carregar banco:", e);
        setStatusMsg("Erro ao ler arquivo. Verifique o caminho nas configurações.");
        setLedger([]); setWorkOrders([]); setClients([]);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [dbPath]); 

  // --- DATA SAVE ---
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (statusMsg.includes("Erro") || statusMsg.includes("Carregando")) return;
      if (ledger.length === 0 && workOrders.length === 0 && clients.length === 0 && statusMsg.includes("Iniciando")) return;
      
      try {
        setIsSaving(true);
        setStatusMsg("Sincronizando...");
        const fullDb: DatabaseSchema = { ledger, workOrders, clients, catalogParts, catalogServices, settings };
        await invoke('save_database_atomic', { filepath: dbPath, content: JSON.stringify(fullDb) });
        setStatusMsg("Dados seguros.");
        setIsSaving(false);
      } catch (e) { setStatusMsg("ERRO I/O: " + e); setIsSaving(false); }
    }, 1500);
    return () => clearTimeout(timer);
  }, [ledger, workOrders, clients, catalogParts, catalogServices, settings, dbPath, statusMsg]);

  // --- HANDLER PRINCIPAL DO DRAG AND DROP (LIBRARY) ---
  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    // Se soltou fora ou no mesmo lugar, não faz nada
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    // Se mudou de coluna (Status)
    if (destination.droppableId !== source.droppableId) {
        const newStatus = destination.droppableId as OSStatus;
        handleUpdateStatus(draggableId, newStatus);
    } 
  };

  const handleUpdateDbPath = () => {
      if (tempDbPath.trim() === "") {
          alert("O caminho do arquivo não pode ser vazio.");
          return;
      }
      if (confirm(`Deseja alterar o local do banco de dados para:\n${tempDbPath}\n\nO sistema tentará carregar os dados deste local imediatamente.`)) {
          setDbPath(tempDbPath);
          localStorage.setItem("oficina_db_path", tempDbPath);
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

    const headers = ["ID", "Data", "Data de Criacao do Registro", "Nº OS", "Cliente", "Descricao", "Valor", "Tipo", "Auditado"];
    const rows = filteredLedger.map(entry => {
      const valor = Money.toFloat(entry.amount).toFixed(2).replace('.', ',');
      const audit = entry.history.length > 0 ? "SIM" : "NAO";
      const desc = entry.description.replace(/;/g, " - ");
      const dataCompetencia = new Date(entry.effectiveDate).toLocaleDateString();
      const dataRegistro = entry.history.length > 0 ? new Date(entry.history[0].timestamp).toLocaleDateString() : dataCompetencia;
      const relatedOS = workOrders.find(w => w.financialId === entry.id);
      const osNum = relatedOS ? relatedOS.osNumber.toString() : "";
      const client = relatedOS ? relatedOS.clientName.replace(/;/g, " ") : ""; 
      return `${entry.id.slice(0,8)};${dataCompetencia};${dataRegistro};${osNum};${client};${desc};${valor};${entry.type};${audit}`;
    });
    
    const csvContent = [headers.join(";"), ...rows].join("\n");
    const monthName = MONTH_NAMES[targetMonth - 1];
    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2,'0')}-${String(today.getMonth()+1).padStart(2,'0')}-${today.getFullYear()}`;
    const filename = `Fluxo_${monthName}_${targetYear}_${todayStr}.csv`;

    try {
      setStatusMsg("Exportando...");
      const res = await invoke<{success: boolean, message: string}>('export_report', { 
        targetFolder: exportPathInput, 
        filename, 
        content: csvContent 
      });
      if (res && res.success) {
        SoundFX.success();
        alert(`Sucesso!\n${res.message}`);
        setIsExportModalOpen(false);
      } else {
        SoundFX.error();
        alert("Erro ao exportar: " + (res?.message || "Erro desconhecido no backend"));
      }
      setStatusMsg("Pronto.");
    } catch (e) { alert("Erro de comunicação com Rust: " + e); }
  };

  const getNextOSNumber = () => workOrders.length === 0 ? 1 : Math.max(...workOrders.map(o => o.osNumber || 0)) + 1;
  const addPart = () => setFormParts([...formParts, { id: crypto.randomUUID(), description: "", price: 0 }]);
  const updatePart = (i: number, f: keyof OrderItem, v: any) => { 
      const n = [...formParts]; n[i] = { ...n[i], [f]: v }; 
      if(f === 'description') {
          const m = catalogParts.find(c => c.description.toLowerCase() === (v as string).toLowerCase());
          if(m) n[i].price = m.price;
      }
      setFormParts(n); 
  };
  const removePart = (i: number) => setFormParts(formParts.filter((_, idx) => idx !== i));
  const addService = () => setFormServices([...formServices, { id: crypto.randomUUID(), description: "", price: 0 }]);
  const updateService = (i: number, f: keyof OrderItem, v: any) => { 
      const n = [...formServices]; n[i] = { ...n[i], [f]: v }; 
      if(f === 'description') {
          const m = catalogServices.find(c => c.description.toLowerCase() === (v as string).toLowerCase());
          if(m) n[i].price = m.price;
      }
      setFormServices(n); 
  };
  const removeService = (i: number) => setFormServices(formServices.filter((_, idx) => idx !== i));
  const calcTotal = (items: OrderItem[]) => items.reduce((acc, i) => acc + i.price, 0);

  const openNewOSModal = () => { 
    setEditingOS(null); 
    setFormOSNumber(getNextOSNumber().toString()); 
    setFormDate(new Date().toISOString().split('T')[0]); 
    setFormClient(""); 
    setFormContact(""); 
    setFormClientNotes(""); 
    setFormVehicle(""); 
    setFormPlate(""); 
    setFormMileage(""); 
    setFormParts([]); 
    setFormServices([]); 
    setIsModalOpen(true); 
  };

  const openEditOSModal = (os: WorkOrder) => { 
    setEditingOS(os); 
    setFormOSNumber(os.osNumber.toString()); 
    setFormDate(os.createdAt ? os.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]); 
    setFormClient(os.clientName); 
    const client = clients.find(c => c.name.toLowerCase() === os.clientName.trim().toLowerCase());
    setFormContact(os.clientPhone || client?.phone || "");
    setFormClientNotes(client?.notes || "");
    const sep = os.vehicle.lastIndexOf(" - ");
    if (sep > 0) { setFormVehicle(os.vehicle.substring(0, sep)); setFormPlate(os.vehicle.substring(sep+3)); } else { setFormVehicle(os.vehicle); setFormPlate(""); }
    setFormMileage(os.mileage.toString()); 
    setFormParts(os.parts); 
    setFormServices(os.services); 
    setIsModalOpen(true); 
  };
  
  const handleSaveModal = () => {
    if (!formClient || !formVehicle) { SoundFX.error(); alert("Preencha cliente e veículo."); return; }
    const mileage = parseInt(formMileage) || 0;
    const osNumber = parseInt(formOSNumber);
    if (isNaN(osNumber)) { SoundFX.error(); alert("Número OS inválido."); return; }
    const duplicate = workOrders.find(o => o.osNumber === osNumber && o.id !== editingOS?.id);
    if (duplicate && !confirm(`Número ${osNumber} já existe. Duplicar?`)) return;

    const fullVehicleString = formPlate ? `${formVehicle} - ${formPlate.toUpperCase()}` : formVehicle;
    const validParts = formParts.filter(p => p.description.trim() !== "");
    const validServices = formServices.filter(s => s.description.trim() !== "");
    
    setClients(prev => learnClientData(prev, formClient, formVehicle, formPlate, formContact, formClientNotes));
    setCatalogParts(prev => learnCatalogItems(prev, validParts.map(p => ({ description: p.description, price: p.price }))));
    setCatalogServices(prev => learnCatalogItems(prev, validServices.map(s => ({ description: s.description, price: s.price }))));

    if (editingOS) {
      const updatedOS = updateWorkOrderData(editingOS, osNumber, fullVehicleString, formClient, formContact, mileage, validParts, validServices, formDate);
      setWorkOrders(prev => prev.map(os => os.id === editingOS.id ? updatedOS : os));
      
      if (updatedOS.financialId) {
        setLedger(prev => prev.map(entry => {
            if (entry.id === updatedOS.financialId) {
                const updatedEntry = updateEntryAmount(entry, Money.toFloat(updatedOS.total), "Sistema", `Atualização OS #${osNumber}`);
                return { ...updatedEntry, effectiveDate: updatedOS.createdAt }; 
            }
            return entry;
        }));
      }
    } else {
      const newOS = createWorkOrder(osNumber, fullVehicleString, formClient, formContact, mileage, validParts, validServices, formDate);
      setWorkOrders(prev => [...prev, newOS]);
    }
    SoundFX.success();
    setIsModalOpen(false);
  };

  const handleUpdateSettings = (f: keyof WorkshopSettings, v: string) => setSettings(p => ({ ...p, [f]: v }));
  const handlePrintOS = (os: WorkOrder) => { setPrintingOS(os); };
  useEffect(() => { if (printingOS) { const t = setTimeout(() => window.print(), 500); return () => clearTimeout(t); } }, [printingOS]);

  const openChecklistModal = (os: WorkOrder) => { setChecklistOS(os); const d = os.checklist || EMPTY_CHECKLIST; setCheckFuel(d.fuelLevel); setCheckTires({ ...d.tires }); setCheckNotes(d.notes); setIsChecklistOpen(true); };
  const handleSaveChecklist = () => { if (!checklistOS) return; setWorkOrders(p => p.map(o => o.id === checklistOS.id ? updateWorkOrderChecklist(o, { fuelLevel: checkFuel, tires: checkTires, notes: checkNotes }) : o)); SoundFX.success(); setIsChecklistOpen(false); };
  const handleDeleteOS = (os: WorkOrder) => { if (confirm("Excluir OS e lançamentos?")) { setWorkOrders(p => p.filter(i => i.id !== os.id)); if (os.financialId) setLedger(p => p.filter(e => e.id !== os.financialId)); } };
  
  const handleAdvanceOS = (id: string) => {
    const os = workOrders.find(o => o.id === id); if (!os) return; 
    const next = advanceStatus(os);
    handleUpdateStatus(id, next.status); // Usa a função centralizada
  };
  
  const handleRegressOS = (id: string) => { 
      const os = workOrders.find(o => o.id === id); if (!os) return;
      const prev = regressStatus(os);
      handleUpdateStatus(id, prev.status); // Usa a função centralizada
  };
  
  // -- ABRIR MODAL DE LANÇAMENTO --
  const handleOpenEntryModal = () => {
    setEntryDate(new Date().toISOString().split('T')[0]); // Data de hoje
    setEntryDescription("");
    setEntryValue("");
    setEntryType('CREDIT'); // Padrão: Receita
    setIsEntryModalOpen(true);
  };

  const handleSaveEntry = () => {
    if (!entryDescription || !entryValue) {
      SoundFX.error();
      alert("Preencha a descrição e o valor.");
      return;
    }
    
    let valFloat = parseFloat(entryValue.replace(',', '.'));
    if (isNaN(valFloat)) {
      SoundFX.error();
      alert("Valor inválido.");
      return;
    }
    
    const valInt = Money.fromFloat(Math.abs(valFloat));
    const entry = createEntry(entryDescription, valInt, entryType, entryDate);
    
    setLedger(prev => [entry, ...prev]);
    SoundFX.success();
    setIsEntryModalOpen(false);
  };
  
  const handleEditEntry = (id: string) => { const reason = prompt("Motivo:"); if (!reason) return; const valStr = prompt("Novo Valor:"); if (!valStr) return; const val = parseFloat(valStr.replace(',', '.')); if (isNaN(val)) return; setLedger(p => p.map(e => e.id !== id ? e : updateEntryAmount(e, Money.fromFloat(Math.abs(val)), "Admin", reason))); };
  const handleDeleteEntry = (e: LedgerEntry) => { if (confirm("Excluir?")) { setLedger(p => p.filter(i => i.id !== e.id)); setWorkOrders(p => p.filter(os => os.financialId !== e.id)); } };

  // --- RENDER KANBAN (COM @hello-pangea/dnd) ---
  const renderKanbanColumn = (status: OSStatus) => {
    const list = workOrders.filter(o => o.status === status).sort((a,b) => b.osNumber - a.osNumber);

    return (
      <div className={`kanban-column col-${status}`}>
        <div className="kanban-header">{STATUS_LABELS[status]} <span>{list.length}</span></div>
        <Droppable droppableId={status}>
          {(provided, snapshot) => (
            <div 
              className="kanban-list-scroll"
              ref={provided.innerRef}
              {...provided.droppableProps}
              style={{
                backgroundColor: snapshot.isDraggingOver ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                transition: 'background-color 0.2s ease',
              }}
            >
              {list.map((os, index) => (
                <Draggable key={os.id} draggableId={os.id} index={index}>
                  {(provided, snapshot) => (
                    <div 
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        className={`kanban-card ${snapshot.isDragging ? 'is-dragging' : ''}`}
                        style={{ 
                          ...provided.draggableProps.style,
                          // ADICIONADO MANUALMENTE PARA EVITAR QUEBRA
                          // Se estiver arrastando, injetamos a rotação na string de transform do JS
                          // Isso garante que a rotação aconteça JUNTO com o translate(x,y)
                          transform: snapshot.isDragging 
                            ? `${provided.draggableProps.style?.transform} rotate(3deg) scale(1.05)` 
                            : provided.draggableProps.style?.transform
                        }}
                    >
                      <div className="os-header"><span className="os-number">OS #{os.osNumber}</span> <span className="os-price">{Money.format(os.total)}</span></div>
                      <div className="os-client">{os.clientName}</div>
                      <div className="os-vehicle">{os.vehicle}</div>
                      {os.clientPhone && <div className="os-id" style={{color: COLORS.info}}>📞 {os.clientPhone}</div>}
                      <div className="card-actions">
                        {status !== 'ORCAMENTO' ? <button className="btn-icon" onClick={() => handleRegressOS(os.id)}>⬅️</button> : <div/>} 
                        <div style={{display: 'flex', gap: 5}}>
                          <button className="btn-icon" onClick={() => openEditOSModal(os)}>✏️</button>
                          <button className="btn-icon check" onClick={() => openChecklistModal(os)}>📋</button>
                          <button className="btn-icon" onClick={() => handlePrintOS(os)}>🖨️</button>
                          <button className="btn-icon danger" onClick={() => handleDeleteOS(os)}>🗑️</button>
                        </div>
                        {status !== 'FINALIZADO' ? <button className="btn-icon" title="Avançar" onClick={() => handleAdvanceOS(os.id)}>➡️</button> : <div/>}
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </div>
    ); 
  };

  const chartDataFluxo = useMemo(() => {
    const days: Record<string, number> = {};
    ledger.forEach(e => {
        if (e.type !== 'CREDIT') return; 
        const d = new Date(e.effectiveDate);
        const key = d.toISOString().split('T')[0];
        days[key] = (days[key] || 0) + e.amount;
    });
    return Object.entries(days).sort((a, b) => a[0].localeCompare(b[0])).slice(-14).map(([dateStr, val]) => {
          const [y, m, d] = dateStr.split('-');
          const dateObj = new Date(parseInt(y), parseInt(m)-1, parseInt(d));
          return { name: dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }), valor: Money.toFloat(val) };
      });
  }, [ledger]);

  const chartDataPie = useMemo(() => { let tp=0, ts=0; workOrders.forEach(o => { tp+=o.parts.reduce((a,i)=>a+i.price,0); ts+=o.services.reduce((a,i)=>a+i.price,0); }); return tp+ts===0 ? [{name:'--',value:1}] : [{name:'Peças',value:Money.toFloat(tp)},{name:'Mão de Obra',value:Money.toFloat(ts)}]; }, [workOrders]);
  const chartDataStatus = useMemo(() => { const c = {ORCAMENTO:0, APROVADO:0, EM_SERVICO:0, FINALIZADO:0}; workOrders.forEach(o => { if(c[o.status]!==undefined) c[o.status]++; }); return [{name:'Orç.',qtd:c.ORCAMENTO,fill:COLORS.info},{name:'Aprov.',qtd:c.APROVADO,fill:COLORS.warning},{name:'Serv.',qtd:c.EM_SERVICO,fill:COLORS.primary},{name:'Final.',qtd:c.FINALIZADO,fill:COLORS.success}]; }, [workOrders]);
  const kpiData = useMemo(() => { 
    const s = ledger.reduce((a,e)=>a+(e.type==='DEBIT'?-e.amount:e.amount),0); 
    const finalizedOrders = workOrders.filter(o => o.status === 'FINALIZADO');
    const totalFinalized = finalizedOrders.reduce((a, o) => a + o.total, 0);
    const ticket = finalizedOrders.length > 0 ? totalFinalized / finalizedOrders.length : 0;
    return { 
      saldo: s, 
      receitas: ledger.filter(e=>e.type==='CREDIT').reduce((a,e)=>a+e.amount,0), 
      despesas: ledger.filter(e=>e.type==='DEBIT').reduce((a,e)=>a+e.amount,0), 
      ticketMedio: ticket 
    }; 
  }, [ledger, workOrders]);


  // --- FUNÇÕES DA NOVA ABA PROCESSOS (COM REGRAS DE NEGÓCIO) ---
  const handleUpdateStatus = (osId: string, newStatus: OSStatus) => {
    const os = workOrders.find(o => o.id === osId);
    if (!os) return;

    // Se já estiver no status, ignora
    if (os.status === newStatus) return;

    const oldStatus = os.status;

    // Regra 1: Entrando em FINALIZADO (GAMIFICAÇÃO + FINANCEIRO)
    if (newStatus === 'FINALIZADO' && oldStatus !== 'FINALIZADO') {
        SoundFX.pop(); 
        
        if (!os.financialId) {
            if (confirm("Lançar no Financeiro?")) {
                const entry = createEntry(`Receita OS #${os.osNumber} - ${os.vehicle}`, os.total, 'CREDIT', os.createdAt);
                setLedger(prev => [entry, ...prev]);
                setWorkOrders(prev => prev.map(o => o.id === osId ? { ...o, status: newStatus, financialId: entry.id } : o));
                
                SoundFX.success();
                setShowConfetti(true); // Dispara Confete!
            } else {
                 setWorkOrders(prev => prev.map(o => o.id === osId ? { ...o, status: newStatus } : o));
            }
        } else {
            setWorkOrders(prev => prev.map(o => o.id === osId ? { ...o, status: newStatus } : o));
            SoundFX.success();
            setShowConfetti(true); // Dispara Confete!
        }
    }
    // Regra 2: Saindo de FINALIZADO
    else if (oldStatus === 'FINALIZADO' && newStatus !== 'FINALIZADO') {
        if (os.financialId) {
            if (confirm("Remover do Financeiro?")) {
                setLedger(prev => prev.filter(e => e.id !== os.financialId));
                setWorkOrders(prev => prev.map(o => o.id === osId ? { ...o, status: newStatus, financialId: undefined } : o));
            } else {
                setEditingStatusId(null);
                return; 
            }
        } else {
             setWorkOrders(prev => prev.map(o => o.id === osId ? { ...o, status: newStatus } : o));
        }
    }
    // Regra 3: Transição Normal
    else {
        SoundFX.pop();
        setWorkOrders(prev => prev.map(o => o.id === osId ? { ...o, status: newStatus } : o));
    }

    setEditingStatusId(null);
  };

  const handleUpdateOSDate = (osId: string, newDate: string) => {
      setWorkOrders(prev => prev.map(os => os.id === osId ? { ...os, createdAt: new Date(newDate).toISOString() } : os));
  };

  const handleSort = (key: 'createdAt' | 'clientName' | 'total' | 'osNumber') => {
      setSortConfig(current => ({
          key,
          direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
      }));
  };

  const renderProcessList = () => {
    // 1. Agrupar por Status
    const groups: Record<OSStatus, WorkOrder[]> = {
        ORCAMENTO: [], APROVADO: [], EM_SERVICO: [], FINALIZADO: []
    };

    // Aplicar ordenação global antes de agrupar, ou ordenar cada grupo
    // Opção: Ordenar cada grupo respeitando a config
    const sortedOS = [...workOrders].sort((a, b) => {
        let valA: any = a[sortConfig.key];
        let valB: any = b[sortConfig.key];

        if (sortConfig.key === 'createdAt') {
            valA = new Date(a.createdAt).getTime();
            valB = new Date(b.createdAt).getTime();
        } else if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    sortedOS.forEach(os => {
        if (groups[os.status]) groups[os.status].push(os);
    });

    const SortIcon = ({ colKey }: { colKey: string }) => {
        if (sortConfig.key !== colKey) return <span className="sort-indicator">↕</span>;
        return <span className="sort-indicator">{sortConfig.direction === 'asc' ? '⬆' : '⬇'}</span>;
    };

    // 2. Renderizar (Feedback Visual 2.1: Skeleton se estiver carregando)
    if (isLoading) {
       return (
         <div className="process-view">
             {[1,2,3].map(i => (
                 <div key={i} className="process-group" style={{padding: 20, background: 'var(--bg-panel)', borderRadius: 16, border: '1px solid var(--border)'}}>
                    <div className="skeleton skeleton-text" style={{width: '200px'}}></div>
                    <div className="skeleton skeleton-block" style={{height: '100px', marginTop: 15}}></div>
                 </div>
             ))}
         </div>
       );
    }

    return (
      <div className="process-view">
        {Object.entries(groups).map(([statusKey, list]) => {
          const status = statusKey as OSStatus;
          if (list.length === 0) return null;

          return (
            <div key={status} className="process-group">
               <div className={`process-group-header status-${status}`}>
                   <span>{STATUS_LABELS[status]}</span>
                   <span style={{background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem'}}>{list.length}</span>
               </div>
               
               <table className="process-table">
                   <thead>
                       <tr>
                           <th width="10%" onClick={() => handleSort('osNumber')} className={sortConfig.key === 'osNumber' ? 'sort-active' : ''}>Nº <SortIcon colKey='osNumber'/></th>
                           <th width="40%" onClick={() => handleSort('clientName')} className={sortConfig.key === 'clientName' ? 'sort-active' : ''}>Cliente / Veículo <SortIcon colKey='clientName'/></th>
                           <th width="20%" onClick={() => handleSort('createdAt')} className={sortConfig.key === 'createdAt' ? 'sort-active' : ''}>Data <SortIcon colKey='createdAt'/></th>
                           <th width="30%">Status</th>
                       </tr>
                   </thead>
                   <tbody>
                       {list.map(os => (
                           <tr key={os.id} className="process-row">
                               <td>
                                   <div className="os-number">#{os.osNumber}</div>
                               </td>
                               <td>
                                   <div style={{fontWeight: 600, color: 'var(--text-main)'}}>{os.clientName}</div>
                                   <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>{os.vehicle}</div>
                               </td>
                               <td>
                                   <input 
                                     type="date" 
                                     className="inline-date-input"
                                     value={new Date(os.createdAt).toISOString().split('T')[0]}
                                     onChange={(e) => handleUpdateOSDate(os.id, e.target.value)}
                                   />
                               </td>
                               <td style={{position: 'relative'}}>
                                   <div 
                                      className={`status-badge st-${os.status}`} 
                                      onClick={() => setEditingStatusId(editingStatusId === os.id ? null : os.id)}
                                   >
                                       {STATUS_LABELS[os.status]} ▾
                                   </div>

                                   {editingStatusId === os.id && (
                                       <div className="status-dropdown">
                                           {(Object.keys(STATUS_LABELS) as OSStatus[]).map(s => (
                                               <div 
                                                 key={s} 
                                                 className={`status-option ${s === os.status ? 'active' : ''}`}
                                                 onClick={() => handleUpdateStatus(os.id, s)}
                                               >
                                                   {STATUS_LABELS[s]}
                                               </div>
                                           ))}
                                       </div>
                                   )}
                               </td>
                           </tr>
                       ))}
                   </tbody>
               </table>
            </div>
          );
        })}
      </div>
    );
  };
  
  // --- HELPER CRM (Histórico do Cliente) ---
  const getClientHistory = (clientName: string) => {
    return workOrders.filter(os => os.clientName === clientName).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  const getClientReminders = (clientName: string) => {
      const history = getClientHistory(clientName);
      const reminders = [];
      const now = new Date();
      const lastOilChange = history.find(os => 
          os.status === 'FINALIZADO' && 
          (os.parts.some(p => p.description.toLowerCase().includes('óleo') || p.description.toLowerCase().includes('oleo')) ||
           os.services.some(s => s.description.toLowerCase().includes('óleo') || s.description.toLowerCase().includes('oleo')))
      );

      if (lastOilChange) {
          const lastDate = new Date(lastOilChange.createdAt);
          const diffTime = Math.abs(now.getTime() - lastDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

          if (diffDays > 180) {
              reminders.push({ type: 'danger', text: 'Troca de Óleo Vencida (+6 meses)' });
          } else if (diffDays > 150) {
              reminders.push({ type: 'warning', text: 'Troca de Óleo Próxima' });
          }
      } 
      return reminders;
  };

  return (
    <>
      {showConfetti && <Confetti />}
      <div className="app-container">
        <nav className="sidebar"><div className="logo-area"><div className="logo-text">OFICINA<span className="logo-highlight">PRO</span></div></div><div className="nav-menu"><div className={`nav-item ${activeTab === 'FINANCEIRO' ? 'active' : ''}`} onClick={() => setActiveTab('FINANCEIRO')}>📊 Financeiro</div><div className={`nav-item ${activeTab === 'PROCESSOS' ? 'active' : ''}`} onClick={() => setActiveTab('PROCESSOS')}>📋 Processos</div><div className={`nav-item ${activeTab === 'CLIENTES' ? 'active' : ''}`} onClick={() => setActiveTab('CLIENTES')}>👥 Clientes (CRM)</div><div className={`nav-item ${activeTab === 'OFICINA' ? 'active' : ''}`} onClick={() => setActiveTab('OFICINA')}>🔧 Oficina</div><div className={`nav-item ${activeTab === 'CONFIG' ? 'active' : ''}`} onClick={() => setActiveTab('CONFIG')}>⚙️ Config</div></div></nav>
        <main className="main-content">
          {activeTab === 'FINANCEIRO' && (
            <>
              <div className="header-area"><h1 className="page-title">Painel Financeiro</h1><div style={{display:'flex', gap:10}}><button className="btn-secondary" onClick={handleOpenExportModal}>📄 Exportar</button><button className="btn" onClick={handleOpenEntryModal}>+ Lançamento</button></div></div>
              
              {isLoading ? (
                  // SKELETON LOADING
                  <div className="stats-row">
                      <div className="skeleton" style={{height: 120, borderRadius: 16}}></div>
                      <div className="skeleton" style={{height: 120, borderRadius: 16}}></div>
                      <div className="skeleton" style={{height: 120, borderRadius: 16}}></div>
                      <div className="skeleton" style={{height: 120, borderRadius: 16}}></div>
                  </div>
              ) : (
                  <div className="stats-row">
                    <div className="stat-card"><div className="stat-label">Saldo Atual</div><div className="stat-value" style={{color: kpiData.saldo >= 0 ? COLORS.success : COLORS.danger}}>{Money.format(kpiData.saldo)}</div><div className="stat-trend">Lucro Líquido</div></div>
                    <div className="stat-card"><div className="stat-label">Receitas</div><div className="stat-value" style={{color: COLORS.success}}>{Money.format(kpiData.receitas)}</div></div>
                    <div className="stat-card"><div className="stat-label">Despesas</div><div className="stat-value" style={{color: COLORS.danger}}>{Money.format(kpiData.despesas)}</div></div>
                    <div className="stat-card" style={{borderColor: COLORS.border}}><div className="stat-label">Ticket Médio</div><div className="stat-value">{Money.format(kpiData.ticketMedio)}</div></div>
                  </div>
              )}

              <div className="dashboard-grid">
                <div className="chart-card"><div className="chart-header"><div className="chart-title">Faturamento Diário</div></div><div style={{flex:1}}>
                    {isLoading ? <div className="skeleton skeleton-block"></div> : (
                    <ResponsiveContainer><AreaChart data={chartDataFluxo}><defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.5}/><stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false}/><XAxis dataKey="name" stroke={COLORS.text} fontSize={10} tickLine={false} axisLine={false}/><YAxis stroke={COLORS.text} fontSize={10} tickLine={false} axisLine={false}/><Tooltip contentStyle={{background:COLORS.tooltipBg, border:'none'}}/><Area type="monotone" dataKey="valor" stroke={COLORS.primary} fill="url(#c)" strokeWidth={3} activeDot={{r: 6}} /></AreaChart></ResponsiveContainer>
                    )}
                </div></div>
                <div className="chart-card"><div className="chart-header"><div className="chart-title">Receita</div></div><div style={{flex:1}}>
                    {isLoading ? <div className="skeleton skeleton-block"></div> : (
                    <ResponsiveContainer><PieChart><Pie data={chartDataPie} cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value"><Cell fill={COLORS.secondary}/><Cell fill={COLORS.warning}/></Pie><Tooltip/></PieChart></ResponsiveContainer>
                    )}
                </div></div>
              </div>
              
              <div className="card">
                  {isLoading ? <div className="skeleton" style={{height: 200}}></div> : (
                  <table className="data-table"><thead><tr><th>Descrição</th><th>Valor</th><th>Ações</th></tr></thead><tbody>{ledger.slice(0, 50).map(e => (<tr key={e.id}><td>{e.description}</td><td style={{fontWeight:'bold', color: e.type === 'DEBIT' ? COLORS.danger : COLORS.success}}>{e.type === 'DEBIT' ? '- ' : '+ '}{Money.format(e.amount)}</td><td><button className="btn-sm" onClick={() => handleEditEntry(e.id)}>Edit</button> <button className="btn-sm" onClick={() => handleDeleteEntry(e)}>Del</button></td></tr>))}</tbody></table>
                  )}
              </div>
            </>
          )}

          {/* --- ABA PROCESSOS --- */}
          {activeTab === 'PROCESSOS' && (
            <>
              <div className="header-area"><h1 className="page-title">Gestão de Processos</h1><button className="btn" onClick={openNewOSModal}>+ Novo Processo</button></div>
              {renderProcessList()}
            </>
          )}

          {/* --- ABA CRM (CLIENTES) --- */}
          {activeTab === 'CLIENTES' && (
            <>
              <div className="header-area"><h1 className="page-title">CRM & Clientes</h1></div>
              <div className="crm-layout">
                  {/* Lista de Clientes */}
                  <div className="client-list">
                      {isLoading ? Array.from({length:5}).map((_,i)=><div key={i} className="skeleton" style={{height: 60, marginBottom: 10}}/>) : clients.map(client => (
                          <div 
                              key={client.id} 
                              className={`client-list-item ${selectedClientForCRM?.id === client.id ? 'active' : ''}`}
                              onClick={() => setSelectedClientForCRM(client)}
                          >
                              <div className="client-name">{client.name}</div>
                              <div className="client-contact">{client.phone || 'Sem telefone'} • {client.vehicles.length} veículo(s)</div>
                          </div>
                      ))}
                      {!isLoading && clients.length === 0 && <div style={{padding:20, color:'var(--text-muted)'}}>Nenhum cliente cadastrado. Crie uma OS para adicionar.</div>}
                  </div>

                  {/* Detalhes do Cliente */}
                  <div className="crm-details">
                      {selectedClientForCRM ? (
                          <>
                              <div className="crm-header">
                                  <h2 style={{margin:0, fontSize:'1.8rem'}}>{selectedClientForCRM.name}</h2>
                                  <div style={{color: 'var(--text-muted)', marginTop: 5}}>
                                      📞 {selectedClientForCRM.phone} <br/>
                                      🚗 {selectedClientForCRM.vehicles.map(v => `${v.model} (${v.plate})`).join(', ')}
                                  </div>
                              </div>
                              <div className="crm-stats">
                                  <div className="crm-stat-box">
                                      <div className="crm-stat-label">Total Gasto</div>
                                      <div className="crm-stat-value" style={{color: 'var(--success)'}}>
                                          {Money.format(getClientHistory(selectedClientForCRM.name).reduce((acc, os) => acc + (os.status === 'FINALIZADO' ? os.total : 0), 0))}
                                      </div>
                                  </div>
                              </div>
                              <h3 style={{marginBottom: 20}}>Lembretes Automáticos</h3>
                              <div style={{marginBottom: 30}}>
                                  {getClientReminders(selectedClientForCRM.name).length > 0 ? (
                                      getClientReminders(selectedClientForCRM.name).map((rem, idx) => (
                                          <div key={idx} className={`reminder-badge ${rem.type}`}>
                                              {rem.type === 'danger' ? '🔴' : '⚠️'} {rem.text}
                                          </div>
                                      ))
                                  ) : (
                                      <span style={{color: 'var(--text-muted)'}}>Nenhum lembrete pendente.</span>
                                  )}
                              </div>
                          </>
                      ) : (
                          <div style={{display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--text-muted)'}}>
                              Selecione um cliente para ver detalhes.
                          </div>
                      )}
                  </div>
              </div>
            </>
          )}

          {activeTab === 'OFICINA' && (
            <>
              <div className="header-area"><h1 className="page-title">Quadro Oficina</h1><button className="btn" onClick={openNewOSModal}>+ Nova OS</button></div>
              <DragDropContext onDragEnd={handleDragEnd}>
                  <div className="kanban-board">
                      {isLoading ? (
                          [1,2,3,4].map(i => <div key={i} className="kanban-column"><div className="skeleton skeleton-block"/></div>)
                      ) : (
                        <>
                            {renderKanbanColumn('ORCAMENTO')} 
                            {renderKanbanColumn('APROVADO')} 
                            {renderKanbanColumn('EM_SERVICO')} 
                            {renderKanbanColumn('FINALIZADO')}
                        </>
                      )}
                  </div>
              </DragDropContext>
            </>
          )}
          {activeTab === 'CONFIG' && (
            <div className="card">
              <h3>Configurações Gerais</h3>
              <div className="form-group" style={{marginBottom: 30}}>
                <label className="form-label" style={{color: 'var(--primary)', fontWeight: 'bold'}}>Local do Banco de Dados</label>
                <div style={{display: 'flex', gap: 10}}>
                    <input 
                        className="form-input" 
                        value={tempDbPath} 
                        onChange={e=>setTempDbPath(e.target.value)}
                        placeholder="Ex: C:\OficinaData\database.json"
                    />
                    <button className="btn" onClick={handleUpdateDbPath}>
                        Definir & Carregar
                    </button>
                </div>
                <div style={{fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 5}}>
                    Caminho atual em uso: {dbPath}
                </div>
              </div>

              <div className="form-group"><label className="form-label">Nome da Oficina</label><input className="form-input" value={settings.name} onChange={e=>handleUpdateSettings('name',e.target.value)}/></div>
              
              <h3 style={{marginTop: 30}}>Aparência & Temas</h3>
              <div className="theme-selection-area">
                {/* TEMA DARK AERO (PADRÃO) */}
                <div className={`theme-card-visual ${currentTheme === 'dark' ? 'active' : ''}`} onClick={() => setCurrentTheme('dark')}>
                   <div className="theme-check-icon">✓</div>
                   <div className="theme-preview-palette">
                      <div className="theme-color-swatch" style={{background: '#1e1e2e'}}></div>
                      <div className="theme-color-swatch" style={{background: '#8257e6'}}></div>
                      <div className="theme-color-swatch" style={{background: '#2b2b3b'}}></div>
                   </div>
                   <div className="theme-info">
                      <h4>Dark Aero</h4>
                      <p>Moderno, escuro e com alto contraste.</p>
                   </div>
                </div>

                {/* TEMA RETRO CLASSIC */}
                <div className={`theme-card-visual ${currentTheme === 'vintage' ? 'active' : ''}`} onClick={() => setCurrentTheme('vintage')}>
                   <div className="theme-check-icon">✓</div>
                   <div className="theme-preview-palette">
                      <div className="theme-color-swatch" style={{background: '#fdf0d5'}}></div>
                      <div className="theme-color-swatch" style={{background: '#c1121f'}}></div>
                      <div className="theme-color-swatch" style={{background: '#2c3e50'}}></div>
                   </div>
                   <div className="theme-info">
                      <h4>Retro Classic</h4>
                      <p>Estilo vintage com tons quentes e papel.</p>
                   </div>
                </div>
              </div>

              <h3 style={{marginTop: 40}}>Backup & Google Drive</h3>
              <div style={{background: 'rgba(0,0,0,0.2)', padding: 20, borderRadius: 12, border: '1px solid var(--border)'}}>
                <div className="form-group">
                  <label className="form-label">Token de Acesso (Google Drive)</label>
                  <input 
                    className="form-input" 
                    type="password"
                    placeholder="Cole seu Access Token aqui (ya29...)" 
                    value={settings.googleDriveToken} 
                    onChange={e=>handleUpdateSettings('googleDriveToken',e.target.value)}
                  />
                </div>
                
                <div style={{display: 'flex', gap: 15, alignItems: 'center', marginTop: 15}}>
                  <button className="btn" onClick={handleGoogleDriveBackup} disabled={isBackuping}>
                    {isBackuping ? <span className="spinner" style={{marginRight: 8}}></span> : '☁️ Criar Backup & Sincronizar'}
                  </button>
                  
                  {driveStatus === 'success' && <span style={{color: 'var(--success)'}}>✅ Sucesso! Último: {lastBackup}</span>}
                  {driveStatus === 'error' && <span style={{color: 'var(--danger)'}} title={driveErrorMsg}>❌ Erro (Passe o mouse).</span>}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {isExportModalOpen && (<div className="modal-overlay"><div className="modal-content" style={{width: 500}}><h2 className="modal-title">Exportar Dados</h2><div className="form-group"><label className="form-label">Mês de Referência</label><select className="form-input" value={exportTargetMonth} onChange={e => setExportTargetMonth(e.target.value)}>{availableMonths.map(dateStr => { const [y, m] = dateStr.split('-'); return (<option key={dateStr} value={dateStr}>{MONTH_NAMES[parseInt(m)-1]} / {y}</option>); })}</select></div><div className="form-group"><label className="form-label">Destino (Pasta)</label><input className="form-input" value={exportPathInput} onChange={e => setExportPathInput(e.target.value)}/></div><div className="modal-actions"><button className="btn-secondary" onClick={() => setIsExportModalOpen(false)}>Cancelar</button><button className="btn" onClick={handleConfirmExport}>Confirmar Exportação</button></div></div></div>)}
      
      {isEntryModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{width: 450}}>
            <h2 className="modal-title">Novo Lançamento</h2>
            <div className="form-group"><label className="form-label">Data</label><input className="form-input" type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} style={{color: 'var(--text-main)'}}/></div>
            <div className="form-group"><label className="form-label">Tipo</label><div style={{display: 'flex', gap: 10}}><button className={`btn ${entryType === 'CREDIT' ? '' : 'btn-secondary'}`} onClick={() => setEntryType('CREDIT')} style={{flex: 1, borderColor: entryType === 'CREDIT' ? 'var(--success)' : ''}}>Receita</button><button className={`btn ${entryType === 'DEBIT' ? '' : 'btn-secondary'}`} onClick={() => setEntryType('DEBIT')} style={{flex: 1, borderColor: entryType === 'DEBIT' ? 'var(--danger)' : ''}}>Despesa</button></div></div>
            <div className="form-group"><label className="form-label">Descrição</label><input className="form-input" value={entryDescription} onChange={e => setEntryDescription(e.target.value)} placeholder="Ex: Conta de Luz"/></div>
            <div className="form-group"><label className="form-label">Valor (R$)</label><input className="form-input" type="number" value={entryValue} onChange={e => setEntryValue(e.target.value)} placeholder="0,00" step="0.01"/></div>
            <div className="modal-actions"><button className="btn-secondary" onClick={() => setIsEntryModalOpen(false)}>Cancelar</button><button className="btn" onClick={handleSaveEntry}>Salvar</button></div>
          </div>
        </div>
      )}

      {isModalOpen && (<div className="modal-overlay"><div className="modal-content"><h2 className="modal-title">{editingOS?"Editar OS":"Nova OS"}</h2><div style={{display:'flex', gap:16}}><div className="form-group" style={{flex:1}}><label className="form-label">Nº OS</label><input className="form-input" value={formOSNumber} onChange={e=>setFormOSNumber(e.target.value)} style={{fontWeight:'bold', color:'var(--primary)'}} /></div><div className="form-group" style={{flex:1}}><label className="form-label">Data</label><input className="form-input" type="date" value={formDate} onChange={e=>setFormDate(e.target.value)} style={{color:'var(--text-main)'}} /></div><div className="form-group" style={{flex:2}}><label className="form-label">Cliente</label><input className="form-input" list="clients" value={formClient} onChange={e=>setFormClient(e.target.value)} /><datalist id="clients">{clients.map(c=><option key={c.id} value={c.name}/>)}</datalist></div></div><div style={{display:'flex', gap:16}}><div className="form-group" style={{flex:1}}><label className="form-label">Contato</label><input className="form-input" value={formContact} onChange={e=>setFormContact(e.target.value)} /></div></div><div className="form-group"><label className="form-label">Obs.</label><textarea className="form-input form-textarea" value={formClientNotes} onChange={e=>setFormClientNotes(e.target.value)} /></div><div style={{display:'flex', gap:16}}><div className="form-group" style={{flex:2}}><label className="form-label">Veículo</label><input className="form-input" list="vehicles" value={formVehicle} onChange={e=>setFormVehicle(e.target.value)} /><datalist id="vehicles">{suggestedVehicles.map((v,i)=><option key={i} value={v.model}/>)}</datalist></div><div className="form-group" style={{flex:1}}><label className="form-label">Placa</label><input className="form-input" value={formPlate} onChange={e=>setFormPlate(e.target.value.toUpperCase())} maxLength={8}/></div><div className="form-group" style={{flex:1}}><label className="form-label">Km</label><input className="form-input" type="number" value={formMileage} onChange={e=>setFormMileage(e.target.value)}/></div></div><div className="items-list-container"><div className="items-header"><span>Peças</span> <span>{Money.format(calcTotal(formParts))}</span></div>{formParts.map((p,i)=><div key={p.id} className="item-row"><input className="form-input" list="cat-parts" value={p.description} onChange={e=>updatePart(i,'description',e.target.value)} style={{flex:2}} placeholder="Peça"/><datalist id="cat-parts">{catalogParts.map((cp,idx)=><option key={idx} value={cp.description}>{Money.format(cp.price)}</option>)}</datalist><input className="form-input" type="number" value={Money.toFloat(p.price)} onChange={e=>updatePart(i,'price',Money.fromFloat(parseFloat(e.target.value)||0))} style={{flex:1}}/><button className="btn-icon danger" onClick={()=>removePart(i)}>x</button></div>)}<button className="btn-secondary" style={{width:'100%', marginTop:10}} onClick={addPart}>+ Peça</button></div><div className="items-list-container"><div className="items-header"><span>Serviços</span> <span>{Money.format(calcTotal(formServices))}</span></div>{formServices.map((s,i)=><div key={s.id} className="item-row"><input className="form-input" list="cat-services" value={s.description} onChange={e=>updateService(i,'description',e.target.value)} style={{flex:2}} placeholder="Serviço"/><datalist id="cat-services">{catalogServices.map((cs,idx)=><option key={idx} value={cs.description}>{Money.format(cs.price)}</option>)}</datalist><input className="form-input" type="number" value={Money.toFloat(s.price)} onChange={e=>updateService(i,'price',Money.fromFloat(parseFloat(e.target.value)||0))} style={{flex:1}}/><button className="btn-icon danger" onClick={()=>removeService(i)}>x</button></div>)}<button className="btn-secondary" style={{width:'100%', marginTop:10}} onClick={addService}>+ Serviço</button></div><div className="total-display"><span>Total</span> <span>{Money.format(calcTotal(formParts)+calcTotal(formServices))}</span></div><div className="modal-actions"><button className="btn-secondary" onClick={()=>setIsModalOpen(false)}>Cancelar</button><button className="btn" onClick={handleSaveModal}>{isSaving ? <span className="spinner"></span> : 'Salvar'}</button></div></div></div>)}
    </>
  );
}

export default App;