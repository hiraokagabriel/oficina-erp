import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DropResult } from '@hello-pangea/dnd';

// --- COMPONENTES VISUAIS ---
import { Sidebar } from './components/Sidebar';
import { Confetti } from './components/ui/Confetti';
import { PrintableInvoice } from './components/PrintableInvoice';
import { ToastContainer, ToastMessage, ToastType } from './components/ui/ToastContainer'; // IMPORT NOVO

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
  OSStatus, OrderItem, CatalogItem, ChecklistSchema
} from './types';

const DEFAULT_DB_PATH = "C:\\OficinaData\\database.json";
const GOOGLE_API_KEY = "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"; 

import './styles.css';

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
  
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'pastel'>('dark');
  const [activeTab, setActiveTab] = useState<'FINANCEIRO' | 'OFICINA' | 'PROCESSOS' | 'CLIENTES' | 'CONFIG'>('FINANCEIRO');
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

  // NOVO: Estado de Notificações
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Helper de Notificação (Substitui alert)
  const addToast = (message: string, type: ToastType = 'info') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    
    // Tocar som baseado no tipo
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
      setIsSaving(false);
    }, 1500);
    return () => clearTimeout(t);
  }, [ledger, workOrders, clients, catalogParts, catalogServices, settings, dbPath]);

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

  const handlePrintOS = (os: WorkOrder) => {
      setPrintingOS(os);
      setTimeout(() => window.print(), 100);
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

      {/* --- MODAIS --- */}
      {/* Precisamos atualizar os modais para usarem o addToast se eles tiverem validação interna */}
      {/* Por enquanto, a lógica de validação está principalmente no pai (handleSaveOSModal), mas se movêssemos a validação para dentro, passaríamos addToast */}
      
      <OSModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveOSModal} editingOS={editingOS} clients={clients} catalogParts={catalogParts} catalogServices={catalogServices} nextOSNumber={workOrders.length > 0 ? Math.max(...workOrders.map(o => o.osNumber)) + 1 : 1} isSaving={isSaving} formatMoney={Money.format} />
      <EntryModal isOpen={isEntryModalOpen} onClose={() => setIsEntryModalOpen(false)} onSave={handleSaveEntryModal} />
      
      {/* O ExportModal precisa do addToast para erro/sucesso */}
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