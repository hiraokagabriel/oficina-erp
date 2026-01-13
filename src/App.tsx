import { useState, useEffect, useMemo } from 'react';
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
import { DeleteConfirmationModal } from './modals/DeleteConfirmationModal';
import { ConfirmationModal } from './modals/ConfirmationModal';

// --- UTILS ---
import { SoundFX } from './utils/audio';
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
const GOOGLE_API_KEY = "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";

// --- MONTH_NAMES ---
const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

// --- STATUS_LABELS ---
const STATUS_LABELS: Record<OSStatus, string> = {
  ORCAMENTO: 'Orçamento',
  APROVADO: 'Aprovado',
  EM_SERVICO: 'Em Serviço',
  FINALIZADO: 'Finalizado',
  ARQUIVADO: 'Arquivado'
};

// --- COLORS ---
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

const EMPTY_CHECKLIST: ChecklistSchema = { fuelLevel: 0, tires: { fl: true, fr: true, bl: true, br: true }, notes: "" };

const DEFAULT_SETTINGS: WorkshopSettings = { 
  name: "OFICINA PREMIUM", 
  cnpj: "", 
  address: "", 
  technician: "", 
  exportPath: "C:\\OficinaData\\Exportacoes",
  googleDriveToken: "" 
};

// --- PENDING ACTION TYPE ---
type PendingAction = 
  | { type: 'DELETE_OS'; data: WorkOrder }
  | { type: 'ARCHIVE_OS'; data: WorkOrder }
  | { type: 'FINISH_OS_FINANCIAL'; data: WorkOrder }
  | { type: 'RESTORE_FINANCIAL'; data: WorkOrder }
  | { type: 'IMPORT_DATA'; content: string }
  | null;

function App() {
  const [dbPath] = useState(() => localStorage.getItem("oficina_db_path") || DEFAULT_DB_PATH);
  
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [catalogParts, setCatalogParts] = useState<CatalogItem[]>([]);
  const [catalogServices, setCatalogServices] = useState<CatalogItem[]>([]);
  const [settings, setSettings] = useState<WorkshopSettings>(DEFAULT_SETTINGS);
  
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'pastel'>('dark');
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
  const [activeTab, setActiveTab] = useState<'FINANCEIRO' | 'OFICINA' | 'PROCESSOS' | 'CLIENTES' | 'CONFIG'>('OFICINA');

  // Estados de Edição
  const [editingOS, setEditingOS] = useState<WorkOrder | null>(null);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [checklistOS, setChecklistOS] = useState<WorkOrder | null>(null);
  const [printingOS, setPrintingOS] = useState<WorkOrder | null>(null);

  // Estados de Exportação
  const [exportTargetMonth, setExportTargetMonth] = useState<string>('');
  const [exportPathInput, setExportPathInput] = useState<string>('');

  // Estados de Confirmação (UX)
  const [deleteModalInfo, setDeleteModalInfo] = useState<{ isOpen: boolean; entry: LedgerEntry | null }>({ isOpen: false, entry: null });
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const [isBackuping, setIsBackuping] = useState(false);
  const [driveStatus, setDriveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [driveErrorMsg, setDriveErrorMsg] = useState<string>('');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [lastBackup, setLastBackup] = useState<string>('');

  // --- FINANCE HOOK ---
  const finance = useFinance(ledger, setLedger);

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
        // Simular carregamento do banco de dados
        setStatusMsg("Sistema pronto.");
      } catch (e) {
        setStatusMsg("Banco novo ou erro.");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [dbPath]);

  // --- AUTO-SAVE ---
  useEffect(() => {
    const t = setTimeout(async () => {
      if (isLoading || statusMsg.includes("Erro")) return;
      if (workOrders.length === 0 && clients.length === 0 && ledger.length === 0) return;

      setIsSaving(true);
      try {
        const fullDb: DatabaseSchema = { ledger, workOrders, clients, catalogParts, catalogServices, settings };
        setStatusMsg("Dados salvos.");
      } catch (e) {
        setStatusMsg("Erro ao salvar: " + e);
      } finally {
        setIsSaving(false);
      }
    }, 3000);
    
    return () => clearTimeout(t);
  }, [ledger, workOrders, clients, catalogParts, catalogServices, settings, isLoading, statusMsg]);

  // --- LÓGICA DE BACKUP GOOGLE DRIVE ---
  const handleGoogleDriveBackup = async () => {
    if (isBackuping) return;
    
    if (!settings.googleDriveToken || settings.googleDriveToken.trim() === "") {
        alert("Por favor, insira um Token de Acesso válido nas configurações para usar o Google Drive.");
        return;
    }

    setIsBackuping(true);
    setDriveStatus('idle');
    setDriveErrorMsg("");
    setStatusMsg("Criando backup local...");

    try {
        const fullDb: DatabaseSchema = { ledger, workOrders, clients, catalogParts, catalogServices, settings };
        const content = JSON.stringify(fullDb, null, 2); 

        const now = new Date();
        const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
        const filename = `backup_oficina_${timestamp}.json`;

        setStatusMsg("Enviando para nuvem Google...");
        
        await uploadToDrive(filename, content, settings.googleDriveToken, GOOGLE_API_KEY);

        setDriveStatus('success');
        SoundFX.success();
        setLastBackup(now.toLocaleString());
        setStatusMsg("Backup salvo na nuvem!");
        
    } catch (e: any) {
        console.error("Erro Backup:", e);
        setDriveStatus('error');
        SoundFX.error();
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
  };

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
        data.createdAt
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
        data.createdAt
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
          finance.updateEntry({ ...editingEntry, description: desc, amount: Money.fromFloat(absVal), type, effectiveDate: dateStr });
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
  const confirmDeleteGroup = () => { setDeleteModalInfo({ isOpen: false, entry: null }); };

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
    await handleGoogleDriveBackup();
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
        isGroup={false} 
      />

      <ConfirmationModal
        isOpen={!!pendingAction}
        onClose={() => setPendingAction(null)}
        onConfirm={executePendingAction}
        title={
          pendingAction?.type === 'DELETE_OS' ? "Confirmar exclusão" :
          pendingAction?.type === 'ARCHIVE_OS' ? "Arquivar OS" :
          pendingAction?.type === 'FINISH_OS_FINANCIAL' ? "Finalizar OS e lançar receita" :
          pendingAction?.type === 'RESTORE_FINANCIAL' ? "Reabrir OS" :
          pendingAction?.type === 'IMPORT_DATA' ? "Importar dados" :
          "Confirmar ação"
        }
        message={
          pendingAction?.type === 'DELETE_OS' ? `Tem certeza que deseja deletar a OS #${(pendingAction.data as WorkOrder).osNumber}?` :
          pendingAction?.type === 'ARCHIVE_OS' ? `Arquivar OS #${(pendingAction.data as WorkOrder).osNumber}?` :
          pendingAction?.type === 'FINISH_OS_FINANCIAL' ? `Finalizar OS #${(pendingAction.data as WorkOrder).osNumber}?` :
          "Tem certeza?"
        }
      />
    </>
  );
}

export default App;
