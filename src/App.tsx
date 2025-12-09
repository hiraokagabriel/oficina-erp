import { useState, useEffect, useMemo } from 'react';
// IMPORTANTE: Agora usando a API nativa do Tauri para comunicação com o Rust
import { invoke } from '@tauri-apps/api/core';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar } from 'recharts';

// --- CONFIGURAÇÃO GOOGLE ---
const GOOGLE_API_KEY = "AIzaSyA1-UOlhqE8wK-YhXZshbSwoU7Fs4TycFI"; 

// --- CONFIGURAÇÃO PADRÃO DO BANCO DE DADOS ---
const DEFAULT_DB_PATH = "C:\\OficinaData\\database.json";
const BACKUP_PATH = "C:\\OficinaData\\Backups";

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
  
  // Theme Manager: Vintage Earth adicionado
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'vintage'>('dark');

  const [statusMsg, setStatusMsg] = useState("Inicializando...");
  const [isSaving, setIsSaving] = useState(false);
  
  // Estado do Backup
  const [isBackuping, setIsBackuping] = useState(false);
  const [driveStatus, setDriveStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [driveErrorMsg, setDriveErrorMsg] = useState("");
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'FINANCEIRO' | 'OFICINA' | 'CONFIG'>('FINANCEIRO');

  // --- ESTADOS UI ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOS, setEditingOS] = useState<WorkOrder | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportTargetMonth, setExportTargetMonth] = useState(""); 
  const [exportPathInput, setExportPathInput] = useState("");

  // ESTADO PARA MODAL DE LANÇAMENTO
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [entryDate, setEntryDate] = useState("");
  const [entryDescription, setEntryDescription] = useState("");
  const [entryValue, setEntryValue] = useState("");
  const [entryType, setEntryType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');

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
      setStatusMsg(`Carregando de: ${dbPath}...`);
      try {
        const data = await invoke<string>('load_database', { filepath: dbPath });
        
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
      }
    }
    load();
  }, [dbPath]); 

  // --- DATA SAVE ---
  useEffect(() => {
    const timer = setTimeout(async () => {
      // Evita salvar se estivermos com erro de carregamento ou inicializando
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

  // --- HANDLER PARA ATUALIZAR CAMINHO DO BANCO ---
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

  // --- LÓGICA DE BACKUP GOOGLE DRIVE ---
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
        alert(`Sucesso!\n${res.message}`);
        setIsExportModalOpen(false);
      } else {
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
    if (!formClient || !formVehicle) { alert("Preencha cliente e veículo."); return; }
    const mileage = parseInt(formMileage) || 0;
    const osNumber = parseInt(formOSNumber);
    if (isNaN(osNumber)) { alert("Número OS inválido."); return; }
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
    setIsModalOpen(false);
  };

  const handleUpdateSettings = (f: keyof WorkshopSettings, v: string) => setSettings(p => ({ ...p, [f]: v }));
  const handlePrintOS = (os: WorkOrder) => { setPrintingOS(os); };
  useEffect(() => { if (printingOS) { const t = setTimeout(() => window.print(), 500); return () => clearTimeout(t); } }, [printingOS]);

  const openChecklistModal = (os: WorkOrder) => { setChecklistOS(os); const d = os.checklist || EMPTY_CHECKLIST; setCheckFuel(d.fuelLevel); setCheckTires({ ...d.tires }); setCheckNotes(d.notes); setIsChecklistOpen(true); };
  const handleSaveChecklist = () => { if (!checklistOS) return; setWorkOrders(p => p.map(o => o.id === checklistOS.id ? updateWorkOrderChecklist(o, { fuelLevel: checkFuel, tires: checkTires, notes: checkNotes }) : o)); setIsChecklistOpen(false); };
  const handleDeleteOS = (os: WorkOrder) => { if (confirm("Excluir OS e lançamentos?")) { setWorkOrders(p => p.filter(i => i.id !== os.id)); if (os.financialId) setLedger(p => p.filter(e => e.id !== os.financialId)); } };
  
  const handleAdvanceOS = (id: string) => {
    const os = workOrders.find(o => o.id === id); if (!os) return; const next = advanceStatus(os); let fid: string | undefined = undefined;
    if (next.status === 'FINALIZADO' && os.status !== 'FINALIZADO' && !os.financialId) {
      if (confirm("Lançar no Financeiro?")) { 
          const entry = createEntry(`Receita OS #${os.osNumber} - ${os.vehicle}`, os.total, 'CREDIT', os.createdAt); 
          fid = entry.id; setLedger(p => [entry, ...p]); 
      }
    }
    setWorkOrders(p => p.map(o => { if (o.id !== id) return o; const up = advanceStatus(o); if (fid) return { ...up, financialId: fid }; return up; }));
  };
  
  const handleRegressOS = (id: string) => { const os = workOrders.find(o => o.id === id); if (!os) return; if (os.status === 'FINALIZADO' && os.financialId) { if (confirm("Remover do Financeiro?")) { setLedger(p => p.filter(e => e.id !== os.financialId)); setWorkOrders(p => p.map(o => o.id === id ? { ...regressStatus(o), financialId: undefined } : o)); } } else { setWorkOrders(p => p.map(o => o.id === id ? regressStatus(o) : o)); } };
  
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
      alert("Preencha a descrição e o valor.");
      return;
    }
    
    let valFloat = parseFloat(entryValue.replace(',', '.'));
    if (isNaN(valFloat)) {
      alert("Valor inválido.");
      return;
    }
    
    // Converte para centavos (inteiro) para o backend
    const valInt = Money.fromFloat(Math.abs(valFloat));

    // IMPORTANTE: Agora usamos a data do estado entryDate, não o dia atual do sistema
    const entry = createEntry(entryDescription, valInt, entryType, entryDate);
    
    // Correção: Atualiza o estado usando a versão anterior de forma segura
    setLedger(prev => [entry, ...prev]);
    setIsEntryModalOpen(false);
  };
  
  const handleEditEntry = (id: string) => { const reason = prompt("Motivo:"); if (!reason) return; const valStr = prompt("Novo Valor:"); if (!valStr) return; const val = parseFloat(valStr.replace(',', '.')); if (isNaN(val)) return; setLedger(p => p.map(e => e.id !== id ? e : updateEntryAmount(e, Money.fromFloat(Math.abs(val)), "Admin", reason))); };
  const handleDeleteEntry = (e: LedgerEntry) => { if (confirm("Excluir?")) { setLedger(p => p.filter(i => i.id !== e.id)); setWorkOrders(p => p.filter(os => os.financialId !== e.id)); } };

  // --- RENDER KANBAN (COM SCROLL INTERNO) ---
  const renderKanbanColumn = (status: OSStatus) => {
    const list = workOrders.filter(o => o.status === status).sort((a,b) => b.osNumber - a.osNumber);
    return (
      <div className={`kanban-column col-${status}`}>
        <div className="kanban-header">{STATUS_LABELS[status]} <span>{list.length}</span></div>
        <div className="kanban-list-scroll">
          {list.map(os => (
            <div key={os.id} className="kanban-card">
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
          ))}
        </div>
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
    
    // Filtra apenas as ordens de serviço com status 'FINALIZADO'
    const finalizedOrders = workOrders.filter(o => o.status === 'FINALIZADO');
    // Calcula o total dessas ordens
    const totalFinalized = finalizedOrders.reduce((a, o) => a + o.total, 0);
    // Calcula a média. Se não houver ordens finalizadas, ticket médio é 0
    const ticket = finalizedOrders.length > 0 ? totalFinalized / finalizedOrders.length : 0;

    return { 
      saldo: s, 
      receitas: ledger.filter(e=>e.type==='CREDIT').reduce((a,e)=>a+e.amount,0), 
      despesas: ledger.filter(e=>e.type==='DEBIT').reduce((a,e)=>a+e.amount,0), 
      ticketMedio: ticket 
    }; 
  }, [ledger, workOrders]);

  return (
    <>
      <div className="app-container">
        <nav className="sidebar"><div className="logo-area"><div className="logo-text">OFICINA<span className="logo-highlight">PRO</span></div></div><div className="nav-menu"><div className={`nav-item ${activeTab === 'FINANCEIRO' ? 'active' : ''}`} onClick={() => setActiveTab('FINANCEIRO')}>📊 Financeiro</div><div className={`nav-item ${activeTab === 'OFICINA' ? 'active' : ''}`} onClick={() => setActiveTab('OFICINA')}>🔧 Oficina</div><div className={`nav-item ${activeTab === 'CONFIG' ? 'active' : ''}`} onClick={() => setActiveTab('CONFIG')}>⚙️ Config</div></div></nav>
        <main className="main-content">
          {activeTab === 'FINANCEIRO' && (
            <>
              <div className="header-area"><h1 className="page-title">Painel Financeiro</h1><div style={{display:'flex', gap:10}}><button className="btn-secondary" onClick={handleOpenExportModal}>📄 Exportar</button><button className="btn" onClick={handleOpenEntryModal}>+ Lançamento</button></div></div>
              <div className="stats-row">
                <div className="stat-card"><div className="stat-label">Saldo Atual</div><div className="stat-value" style={{color: kpiData.saldo >= 0 ? COLORS.success : COLORS.danger}}>{Money.format(kpiData.saldo)}</div><div className="stat-trend">Lucro Líquido</div></div>
                <div className="stat-card"><div className="stat-label">Receitas</div><div className="stat-value" style={{color: COLORS.success}}>{Money.format(kpiData.receitas)}</div></div>
                <div className="stat-card"><div className="stat-label">Despesas</div><div className="stat-value" style={{color: COLORS.danger}}>{Money.format(kpiData.despesas)}</div></div>
                <div className="stat-card" style={{borderColor: COLORS.border}}><div className="stat-label">Ticket Médio</div><div className="stat-value">{Money.format(kpiData.ticketMedio)}</div></div>
              </div>
              <div className="dashboard-grid">
                <div className="chart-card"><div className="chart-header"><div className="chart-title">Faturamento Diário</div></div><div style={{flex:1}}><ResponsiveContainer><AreaChart data={chartDataFluxo}><defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.5}/><stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false}/><XAxis dataKey="name" stroke={COLORS.text} fontSize={10} tickLine={false} axisLine={false}/><YAxis stroke={COLORS.text} fontSize={10} tickLine={false} axisLine={false}/><Tooltip contentStyle={{background:COLORS.tooltipBg, border:'none'}}/><Area type="monotone" dataKey="valor" stroke={COLORS.primary} fill="url(#c)" strokeWidth={3} activeDot={{r: 6}} /></AreaChart></ResponsiveContainer></div></div>
                <div className="chart-card"><div className="chart-header"><div className="chart-title">Receita</div></div><div style={{flex:1}}><ResponsiveContainer><PieChart><Pie data={chartDataPie} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value"><Cell fill={COLORS.secondary}/><Cell fill={COLORS.warning}/></Pie><Tooltip/></PieChart></ResponsiveContainer></div></div>
                <div className="chart-card"><div className="chart-header"><div className="chart-title">Status (Distribuição)</div></div><div style={{flex:1}}><ResponsiveContainer><PieChart><Pie data={chartDataStatus} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="qtd" stroke="none">{chartDataStatus.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.fill} />))}</Pie><Tooltip contentStyle={{ backgroundColor: COLORS.tooltipBg, border: 'none', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} formatter={(value, name, props) => [`${value} OS`, props.payload.name]} /><Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '0.8rem', color: COLORS.text }} /></PieChart></ResponsiveContainer></div></div>
              </div>
              <div className="card"><table className="data-table"><thead><tr><th>Descrição</th><th>Valor</th><th>Ações</th></tr></thead><tbody>{ledger.slice(0, 50).map(e => (<tr key={e.id}><td>{e.description}</td><td style={{fontWeight:'bold', color: e.type === 'DEBIT' ? COLORS.danger : COLORS.success}}>{e.type === 'DEBIT' ? '- ' : '+ '}{Money.format(e.amount)}</td><td><button className="btn-sm" onClick={() => handleEditEntry(e.id)}>Edit</button> <button className="btn-sm" onClick={() => handleDeleteEntry(e)}>Del</button></td></tr>))}</tbody></table></div>
            </>
          )}
          {activeTab === 'OFICINA' && (
            <>
              <div className="header-area"><h1 className="page-title">Quadro Oficina</h1><button className="btn" onClick={openNewOSModal}>+ Nova OS</button></div>
              <div className="kanban-board">{renderKanbanColumn('ORCAMENTO')} {renderKanbanColumn('APROVADO')} {renderKanbanColumn('EM_SERVICO')} {renderKanbanColumn('FINALIZADO')}</div>
            </>
          )}
          {activeTab === 'CONFIG' && (
            <div className="card">
              <h3>Configurações Gerais</h3>
              
              {/* --- NOVO CAMPO: CAMINHO DO BANCO --- */}
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
              {/* ------------------------------------ */}

              <div className="form-group"><label className="form-label">Nome da Oficina</label><input className="form-input" value={settings.name} onChange={e=>handleUpdateSettings('name',e.target.value)}/></div>
              <div className="form-group"><label className="form-label">CNPJ</label><input className="form-input" value={settings.cnpj} onChange={e=>handleUpdateSettings('cnpj',e.target.value)}/></div>
              <div className="form-group"><label className="form-label">Endereço</label><input className="form-input" value={settings.address} onChange={e=>handleUpdateSettings('address',e.target.value)}/></div>
              
              <h3 style={{marginTop: 30}}>Backup & Google Drive</h3>
              <div style={{background: 'rgba(0,0,0,0.2)', padding: 20, borderRadius: 12, border: '1px solid var(--border)'}}>
                <div style={{marginBottom: 15, fontSize: '0.9rem', color: 'var(--text-muted)'}}>
                  Esta função cria uma cópia de segurança dos dados atuais e envia para a nuvem.
                  <br/>
                  <a href="https://developers.google.com/oauthplayground/" target="_blank" style={{color: 'var(--primary)', textDecoration: 'none'}}>
                    Gerar Token no Google Playground (Escopo: Drive API v3)
                  </a>
                </div>

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
                    {isBackuping ? 'Processando...' : '☁️ Criar Backup & Sincronizar'}
                  </button>
                  
                  {driveStatus === 'uploading' && <span style={{color: 'var(--info)'}}>⏳ Enviando...</span>}
                  {driveStatus === 'success' && <span style={{color: 'var(--success)'}}>✅ Sucesso! Último: {lastBackup}</span>}
                  {driveStatus === 'error' && <span style={{color: 'var(--danger)'}} title={driveErrorMsg}>❌ Erro (Passe o mouse).</span>}
                </div>
              </div>

              <h3 style={{marginTop: 30}}>Aparência</h3>
              <div className="theme-selector-container">
                <div className={`theme-card ${currentTheme === 'dark' ? 'active' : ''}`} onClick={() => setCurrentTheme('dark')}>
                  <div className="theme-preview" style={{background: '#1e1e2e'}}></div>
                  <span>Dark Aero (Padrão)</span>
                </div>
                <div className={`theme-card ${currentTheme === 'vintage' ? 'active' : ''}`} onClick={() => setCurrentTheme('vintage')}>
                  <div className="theme-preview" style={{background: '#c1121f'}}></div>
                  <span>Retro Classic</span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ... MODAIS (Export, OS, Checklist) permanecem iguais ... */}
      {isExportModalOpen && (<div className="modal-overlay"><div className="modal-content" style={{width: 500}}><h2 className="modal-title">Exportar Dados</h2><div className="form-group"><label className="form-label">Mês de Referência</label><select className="form-input" value={exportTargetMonth} onChange={e => setExportTargetMonth(e.target.value)}>{availableMonths.map(dateStr => { const [y, m] = dateStr.split('-'); return (<option key={dateStr} value={dateStr}>{MONTH_NAMES[parseInt(m)-1]} / {y}</option>); })}</select></div><div className="form-group"><label className="form-label">Destino (Pasta)</label><input className="form-input" value={exportPathInput} onChange={e => setExportPathInput(e.target.value)}/></div><div className="modal-actions"><button className="btn-secondary" onClick={() => setIsExportModalOpen(false)}>Cancelar</button><button className="btn" onClick={handleConfirmExport}>Confirmar Exportação</button></div></div></div>)}
      
      {/* MODAL DE LANÇAMENTO FINANCEIRO (NOVO) */}
      {isEntryModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{width: 450}}>
            <h2 className="modal-title">Novo Lançamento</h2>
            
            <div className="form-group">
              <label className="form-label">Data</label>
              <input 
                className="form-input" 
                type="date" 
                value={entryDate} 
                onChange={e => setEntryDate(e.target.value)}
                style={{color: 'var(--text-main)'}}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Tipo</label>
              <div style={{display: 'flex', gap: 10}}>
                <button 
                  className={`btn ${entryType === 'CREDIT' ? '' : 'btn-secondary'}`} 
                  onClick={() => setEntryType('CREDIT')}
                  style={{flex: 1, borderColor: entryType === 'CREDIT' ? 'var(--success)' : ''}}
                >
                  Receita
                </button>
                <button 
                  className={`btn ${entryType === 'DEBIT' ? '' : 'btn-secondary'}`} 
                  onClick={() => setEntryType('DEBIT')}
                  style={{flex: 1, borderColor: entryType === 'DEBIT' ? 'var(--danger)' : ''}}
                >
                  Despesa
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Descrição</label>
              <input 
                className="form-input" 
                value={entryDescription} 
                onChange={e => setEntryDescription(e.target.value)}
                placeholder="Ex: Conta de Luz"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Valor (R$)</label>
              <input 
                className="form-input" 
                type="number"
                value={entryValue} 
                onChange={e => setEntryValue(e.target.value)}
                placeholder="0,00"
                step="0.01"
              />
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setIsEntryModalOpen(false)}>Cancelar</button>
              <button className="btn" onClick={handleSaveEntry}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (<div className="modal-overlay"><div className="modal-content"><h2 className="modal-title">{editingOS?"Editar OS":"Nova OS"}</h2><div style={{display:'flex', gap:16}}><div className="form-group" style={{flex:1}}><label className="form-label">Nº OS</label><input className="form-input" value={formOSNumber} onChange={e=>setFormOSNumber(e.target.value)} style={{fontWeight:'bold', color:'var(--primary)'}} /></div><div className="form-group" style={{flex:1}}><label className="form-label">Data</label><input className="form-input" type="date" value={formDate} onChange={e=>setFormDate(e.target.value)} style={{color:'var(--text-main)'}} /></div><div className="form-group" style={{flex:2}}><label className="form-label">Cliente</label><input className="form-input" list="clients" value={formClient} onChange={e=>setFormClient(e.target.value)} /><datalist id="clients">{clients.map(c=><option key={c.id} value={c.name}/>)}</datalist></div></div><div style={{display:'flex', gap:16}}><div className="form-group" style={{flex:1}}><label className="form-label">Contato</label><input className="form-input" value={formContact} onChange={e=>setFormContact(e.target.value)} /></div></div><div className="form-group"><label className="form-label">Obs.</label><textarea className="form-input form-textarea" value={formClientNotes} onChange={e=>setFormClientNotes(e.target.value)} /></div><div style={{display:'flex', gap:16}}><div className="form-group" style={{flex:2}}><label className="form-label">Veículo</label><input className="form-input" list="vehicles" value={formVehicle} onChange={e=>setFormVehicle(e.target.value)} /><datalist id="vehicles">{suggestedVehicles.map((v,i)=><option key={i} value={v.model}/>)}</datalist></div><div className="form-group" style={{flex:1}}><label className="form-label">Placa</label><input className="form-input" value={formPlate} onChange={e=>setFormPlate(e.target.value.toUpperCase())} maxLength={8}/></div><div className="form-group" style={{flex:1}}><label className="form-label">Km</label><input className="form-input" type="number" value={formMileage} onChange={e=>setFormMileage(e.target.value)}/></div></div><div className="items-list-container"><div className="items-header"><span>Peças</span> <span>{Money.format(calcTotal(formParts))}</span></div>{formParts.map((p,i)=><div key={p.id} className="item-row"><input className="form-input" list="cat-parts" value={p.description} onChange={e=>updatePart(i,'description',e.target.value)} style={{flex:2}} placeholder="Peça"/><datalist id="cat-parts">{catalogParts.map((cp,idx)=><option key={idx} value={cp.description}>{Money.format(cp.price)}</option>)}</datalist><input className="form-input" type="number" value={Money.toFloat(p.price)} onChange={e=>updatePart(i,'price',Money.fromFloat(parseFloat(e.target.value)||0))} style={{flex:1}}/><button className="btn-icon danger" onClick={()=>removePart(i)}>x</button></div>)}<button className="btn-secondary" style={{width:'100%', marginTop:10}} onClick={addPart}>+ Peça</button></div><div className="items-list-container"><div className="items-header"><span>Serviços</span> <span>{Money.format(calcTotal(formServices))}</span></div>{formServices.map((s,i)=><div key={s.id} className="item-row"><input className="form-input" list="cat-services" value={s.description} onChange={e=>updateService(i,'description',e.target.value)} style={{flex:2}} placeholder="Serviço"/><datalist id="cat-services">{catalogServices.map((cs,idx)=><option key={idx} value={cs.description}>{Money.format(cs.price)}</option>)}</datalist><input className="form-input" type="number" value={Money.toFloat(s.price)} onChange={e=>updateService(i,'price',Money.fromFloat(parseFloat(e.target.value)||0))} style={{flex:1}}/><button className="btn-icon danger" onClick={()=>removeService(i)}>x</button></div>)}<button className="btn-secondary" style={{width:'100%', marginTop:10}} onClick={addService}>+ Serviço</button></div><div className="total-display"><span>Total</span> <span>{Money.format(calcTotal(formParts)+calcTotal(formServices))}</span></div><div className="modal-actions"><button className="btn-secondary" onClick={()=>setIsModalOpen(false)}>Cancelar</button><button className="btn" onClick={handleSaveModal}>Salvar</button></div></div></div>)}
      {isChecklistOpen && checklistOS && (<div className="modal-overlay"><div className="modal-content"><h2 className="modal-title">Checklist</h2><div className="form-group"><label className="form-label">Combustível</label><div className="fuel-gauge">{[0,1,2,3,4].map(l=><div key={l} className={`fuel-bar ${checkFuel>=l?'active-'+checkFuel:''}`} onClick={()=>setCheckFuel(l)}/>)}</div></div><div className="tires-container"><div className="tire-grid"><div style={{gridArea:'fl'}} className={`tire-item ${!checkTires.fl?'damaged':''}`} onClick={()=>setCheckTires(p=>({...p,fl:!p.fl}))}>{!checkTires.fl?'⚠️':'🆗'}</div><div style={{gridArea:'fr'}} className={`tire-item ${!checkTires.fr?'damaged':''}`} onClick={()=>setCheckTires(p=>({...p,fr:!p.fr}))}>{!checkTires.fr?'⚠️':'🆗'}</div><div className="car-silhouette"><span className="car-label">FRENTE</span><span style={{fontSize:'2rem', opacity:0.3}}>🚗</span><span className="car-label">TRÁS</span></div><div style={{gridArea:'bl'}} className={`tire-item ${!checkTires.bl?'damaged':''}`} onClick={()=>setCheckTires(p=>({...p,bl:!p.bl}))}>{!checkTires.bl?'⚠️':'🆗'}</div><div style={{gridArea:'br'}} className={`tire-item ${!checkTires.br?'damaged':''}`} onClick={()=>setCheckTires(p=>({...p,br:!p.br}))}>{!checkTires.br?'⚠️':'🆗'}</div></div></div><div className="form-group"><label className="form-label">Obs.</label><textarea className="form-input form-textarea" value={checkNotes} onChange={e=>setCheckNotes(e.target.value)}/></div><div className="modal-actions"><button className="btn-secondary" onClick={()=>setIsChecklistOpen(false)}>Fechar</button><button className="btn" onClick={handleSaveChecklist}>Salvar</button></div></div></div>)}
      
      {printingOS && (
  <div className="printable-content">
    <div className="print-header"><div className="brand-section"><h1>{settings.name}</h1><p>{settings.address} • {settings.cnpj}</p></div><div className="meta-section"><span className="doc-label">Comprovante de Serviço</span><h2 className="doc-number">#{printingOS.osNumber}</h2><div className="doc-label" style={{marginTop:5}}>{new Date(printingOS.createdAt).toLocaleDateString()}</div></div></div>
    <div className="info-grid"><div className="info-col"><span className="info-label">Cliente</span><span className="info-value">{printingOS.clientName}</span></div><div className="info-col"><span className="info-label">Veículo</span><span className="info-value">{printingOS.vehicle}</span><span className="info-sub">Quilometragem: {printingOS.mileage} km</span></div></div>
    <div className="section-title">Detalhamento Técnico</div>
    <table className="print-table"><thead><tr><th>Descrição do Item / Serviço</th><th style={{textAlign:'right'}}>Valor</th></tr></thead><tbody>{printingOS.parts.map(p => (<tr key={p.id}><td>{p.description} <small style={{color:'#666'}}>(Peça)</small></td><td className="money">{Money.format(p.price)}</td></tr>))}{printingOS.services.map(s => (<tr key={s.id}><td>{s.description} <small style={{color:'#666'}}>(Serviço)</small></td><td className="money">{Money.format(s.price)}</td></tr>))}</tbody></table>
    <div className="total-area"><div className="total-wrapper"><span className="total-label">Valor Total</span><span className="total-value">{Money.format(printingOS.total)}</span></div></div>
    <div className="print-footer"><div className="sign-line">Cliente</div><div className="sign-line">{settings.technician || "Técnico Responsável"}</div></div><div className="print-legal">Documento processado digitalmente. Válido como garantia de 90 dias.</div>
  </div>
)}
    </>
  );
}

export default App;