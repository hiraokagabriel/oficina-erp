import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DropResult } from '@hello-pangea/dnd';

// --- HOOKS ---
import { useKeyboard } from './hooks/useKeyboard';

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
  OSStatus, ChecklistSchema, CatalogItem
} from './types';

// --- CONSTANTES ---
const DEFAULT_DB_PATH = "C:\\OficinaData\\database.json";
const GOOGLE_API_KEY = "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"; 

import './styles.css';

// Helper para data local (Brasil)
const getLocalMonth = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 7);
};

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
  
  // --- ESTADOS DE FILTRO & VISUALIZAÇÃO ---
  const [selectedMonth, setSelectedMonth] = useState(getLocalMonth);
  const [viewMode, setViewMode] = useState<'MONTH' | 'YEAR'>('MONTH'); 
  const [filterType, setFilterType] = useState<'ALL' | 'CREDIT' | 'DEBIT'>('ALL');

  const [currentTheme, setCurrentTheme] = useState<'dark' | 'pastel'>('dark');
  const [activeTab, setActiveTab] = useState<'FINANCEIRO' | 'OFICINA' | 'PROCESSOS' | 'CLIENTES' | 'CONFIG'>('FINANCEIRO');
  const [statusMsg, setStatusMsg] = useState("Inicializando...");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // --- ESTADOS DE MODAIS ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const [isDatabaseModalOpen, setIsDatabaseModalOpen] = useState(false);
  
  // --- ESTADOS DE EDIÇÃO ---
  const [editingOS, setEditingOS] = useState<WorkOrder | null>(null);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [checklistOS, setChecklistOS] = useState<WorkOrder | null>(null);
  const [printingOS, setPrintingOS] = useState<WorkOrder | null>(null);

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
      setIsSaving(false);
    }, 1500);
    return () => clearTimeout(t);
  }, [ledger, workOrders, clients, catalogParts, catalogServices, settings, dbPath]);

  useEffect(() => { document.documentElement.setAttribute('data-theme', currentTheme); }, [currentTheme]);
  useEffect(() => { if (showConfetti) setTimeout(() => setShowConfetti(false), 3000); }, [showConfetti]);

  // --- ATALHOS GLOBAIS ---
  useKeyboard('F2', () => {
    if (activeTab === 'OFICINA') {
      setEditingOS(null);
      setIsModalOpen(true);
    } else {
      setActiveTab('OFICINA');
      setTimeout(() => {
          setEditingOS(null);
          setIsModalOpen(true);
      }, 100);
    }
    addToast("Nova OS (F2)", "info");
  });

  useKeyboard('F3', (e) => {
     const searchInput = document.querySelector('.search-input') as HTMLInputElement;
     if (searchInput) {
         e.preventDefault();
         searchInput.focus();
         addToast("Busca Focada", "info");
     } else {
         setActiveTab('OFICINA');
         addToast("Indo para Oficina...", "info");
     }
  });

  useKeyboard('Escape', () => {
    if (isModalOpen) setIsModalOpen(false);
    if (isEntryModalOpen) {
        setIsEntryModalOpen(false);
        setEditingEntry(null);
    }
    if (isExportModalOpen) setIsExportModalOpen(false);
    if (isChecklistOpen) setIsChecklistOpen(false);
    if (isDatabaseModalOpen) setIsDatabaseModalOpen(false);
  });

  // --- HANDLERS PRINCIPAIS ---
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

  const handleArchiveOS = (os: WorkOrder) => {
      if (confirm("Arquivar esta OS? Ela sairá do quadro principal.")) {
          handleUpdateStatus(os.id, 'ARQUIVADO');
          addToast("OS Arquivada.", "info");
      }
  };

  const handleRestoreOS = (os: WorkOrder) => {
      handleUpdateStatus(os.id, 'ORCAMENTO');
      addToast("OS Restaurada para Orçamento.", "success");
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
      const originalTitle = document.title;
      const fileName = `OS ${os.osNumber} - ${os.clientName} - ${os.vehicle}`;
      document.title = fileName;

      setTimeout(() => {
          window.print();
          document.title = originalTitle;
      }, 100);
  };

  const handleSaveChecklist = (data: ChecklistSchema) => {
    if (!checklistOS) return;
    setWorkOrders(prev => prev.map(o => o.id === checklistOS.id ? { ...o, checklist: data } : o));
    addToast("Vistoria salva!", "success");
    setIsChecklistOpen(false);
  };

  // --- HANDLERS FINANCEIROS ---
  const handleSaveEntryModal = (desc: string, val: number, type: 'CREDIT' | 'DEBIT', date?: string) => {
      if (editingEntry) {
          setLedger(prev => prev.map(e => e.id === editingEntry.id ? {
              ...e,
              description: desc,
              amount: Math.abs(val),
              type: type,
              effectiveDate: date || e.effectiveDate,
              updatedAt: new Date().toISOString()
          } : e));
          addToast("Lançamento atualizado.", "success");
          setEditingEntry(null);
      } else {
          const entry = createEntry(desc, Math.abs(val), type, date);
          setLedger(prev => [entry, ...prev]);
          addToast("Lançamento registrado.", "success");
      }
      setIsEntryModalOpen(false);
  };

  const handleEditEntry = (id: string) => {
      const linkedOS = workOrders.find(o => o.financialId === id);
      if (linkedOS) {
          if(confirm(`Este lançamento pertence à OS #${linkedOS.osNumber} (${linkedOS.clientName}).\nDeseja abrir a OS para edição?`)) {
              setEditingOS(linkedOS);
              setIsModalOpen(true);
          }
      } else {
          const entry = ledger.find(e => e.id === id);
          if (entry) {
              setEditingEntry(entry);
              setIsEntryModalOpen(true);
          }
      }
  };

  const handleDeleteEntry = (entry: LedgerEntry) => {
     if (confirm("Excluir lançamento?")) {
         setLedger(p => p.filter(e => e.id !== entry.id));
         setWorkOrders(p => p.map(o => o.financialId === entry.id ? { ...o, financialId: undefined } : o));
         addToast("Lançamento excluído.", "info");
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

  // --- CRUD COM CASCATA (INTEGRIDADE REFERENCIAL) ---
  
  const handleSaveClient = (updatedClient: Client) => {
    const oldClient = clients.find(c => c.id === updatedClient.id);

    setClients(prev => {
        const exists = prev.find(c => c.id === updatedClient.id);
        if (exists) return prev.map(c => c.id === updatedClient.id ? updatedClient : c);
        return [...prev, updatedClient];
    });

    if (oldClient) {
        const nameChanged = oldClient.name !== updatedClient.name;
        const phoneChanged = oldClient.phone !== updatedClient.phone;
        
        const vehicleMap: Record<string, string> = {};
        if (oldClient.vehicles && updatedClient.vehicles) {
             oldClient.vehicles.forEach((oldV, index) => {
                 const newV = updatedClient.vehicles[index];
                 if (newV) {
                     const oldString = `${oldV.model} - ${oldV.plate}`;
                     const newString = `${newV.model} - ${newV.plate}`;
                     if (oldString !== newString) {
                         vehicleMap[oldString] = newString;
                     }
                 }
             });
        }

        if (nameChanged || phoneChanged || Object.keys(vehicleMap).length > 0) {
            setWorkOrders(prev => prev.map(os => {
                if (os.clientName === oldClient.name) {
                    return {
                        ...os,
                        clientName: nameChanged ? updatedClient.name : os.clientName,
                        clientPhone: phoneChanged ? updatedClient.phone : os.clientPhone,
                        vehicle: vehicleMap[os.vehicle] || os.vehicle
                    };
                }
                return os;
            }));
            
            if (nameChanged) {
                 setLedger(prev => prev.map(entry => {
                     if (entry.description.includes(oldClient.name)) {
                         return { 
                             ...entry, 
                             description: entry.description.replace(oldClient.name, updatedClient.name) 
                         };
                     }
                     return entry;
                 }));
            }

            addToast("Cliente e OSs vinculadas atualizados!", "success");
            return;
        }
    }

    addToast("Cliente salvo!", "success");
  };

  const handleDeleteClient = (id: string) => {
    setClients(prev => prev.filter(c => c.id !== id));
    addToast("Cliente removido.", "info");
  };

  const handleSaveCatalogItem = (updatedItem: CatalogItem, type: 'part' | 'service') => {
    let oldItem: CatalogItem | undefined;

    if (type === 'part') {
        oldItem = catalogParts.find(p => p.id === updatedItem.id);
        setCatalogParts(prev => {
           const exists = prev.find(p => p.id === updatedItem.id);
           return exists ? prev.map(p => p.id === updatedItem.id ? updatedItem : p) : [...prev, updatedItem];
        });
    } else {
        oldItem = catalogServices.find(s => s.id === updatedItem.id);
        setCatalogServices(prev => {
           const exists = prev.find(s => s.id === updatedItem.id);
           return exists ? prev.map(s => s.id === updatedItem.id ? updatedItem : s) : [...prev, updatedItem];
        });
    }

    // CORREÇÃO: Utilizando .description ao invés de .name
    if (oldItem && oldItem.description !== updatedItem.description) {
        setWorkOrders(prev => prev.map(os => {
            let changed = false;
            const newParts = os.parts.map(p => {
                if (p.description === oldItem!.description) { 
                    changed = true; 
                    return { ...p, description: updatedItem.description }; 
                }
                return p;
            });
            const newServices = os.services.map(s => {
                if (s.description === oldItem!.description) { 
                    changed = true; 
                    return { ...s, description: updatedItem.description }; 
                }
                return s;
            });
            
            if (changed) return { ...os, parts: newParts, services: newServices };
            return os;
        }));
        addToast("Item salvo e nomes atualizados nas OSs.", "success");
    } else {
        addToast("Item salvo no catálogo.", "success");
    }
  };

  const handleDeleteCatalogItem = (id: string, type: 'part' | 'service') => {
    if (type === 'part') setCatalogParts(prev => prev.filter(p => p.id !== id));
    else setCatalogServices(prev => prev.filter(s => s.id !== id));
    addToast("Item removido.", "info");
  };

  // --- DADOS DO DASHBOARD E FILTROS ---
  const filteredLedger = useMemo(() => {
    let data = ledger;
    if (viewMode === 'YEAR') {
        const year = selectedMonth.slice(0, 4);
        data = data.filter(e => e.effectiveDate.startsWith(year));
    } else {
        data = data.filter(e => e.effectiveDate.startsWith(selectedMonth));
    }
    if (filterType !== 'ALL') {
        data = data.filter(e => e.type === filterType);
    }
    return data;
  }, [ledger, selectedMonth, viewMode, filterType]);

  const filteredWorkOrders = useMemo(() => {
    if (viewMode === 'YEAR') {
        const year = selectedMonth.slice(0, 4);
        return workOrders.filter(o => o.createdAt.startsWith(year));
    }
    return workOrders.filter(o => o.createdAt.startsWith(selectedMonth));
  }, [workOrders, selectedMonth, viewMode]);

  const kpiData = useMemo(() => {
      let kpiLedger = ledger;
      if (viewMode === 'YEAR') {
          const year = selectedMonth.slice(0, 4);
          kpiLedger = kpiLedger.filter(e => e.effectiveDate.startsWith(year));
      } else {
          kpiLedger = kpiLedger.filter(e => e.effectiveDate.startsWith(selectedMonth));
      }

      return {
          saldo: kpiLedger.reduce((a,e) => a + (e.type === 'CREDIT' ? e.amount : -e.amount), 0),
          receitas: kpiLedger.filter(e => e.type === 'CREDIT').reduce((a,e)=>a+e.amount, 0),
          despesas: kpiLedger.filter(e => e.type === 'DEBIT').reduce((a,e)=>a+e.amount, 0),
          ticketMedio: filteredWorkOrders.filter(o => o.status === 'FINALIZADO').reduce((a,o)=>a+o.total, 0) / (filteredWorkOrders.filter(o => o.status === 'FINALIZADO').length || 1)
      };
  }, [ledger, filteredWorkOrders, selectedMonth, viewMode]);

  const chartFluxo = useMemo(() => {
     const map: Record<string, number> = {};
     const monthLabels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

     filteredLedger.forEach(e => { 
       if (filterType === 'DEBIT' && e.type === 'DEBIT') {
           let key;
           if (viewMode === 'YEAR') {
              const monthIdx = parseInt(e.effectiveDate.slice(5, 7)) - 1;
              key = monthLabels[monthIdx] || "N/A";
           } else {
              key = e.effectiveDate.slice(8, 10);
           }
           map[key] = (map[key] || 0) + e.amount;
       } 
       else if ((filterType === 'ALL' || filterType === 'CREDIT') && e.type === 'CREDIT') {
          let key;
          if (viewMode === 'YEAR') {
              const monthIdx = parseInt(e.effectiveDate.slice(5, 7)) - 1;
              key = monthLabels[monthIdx] || "N/A";
          } else {
              key = e.effectiveDate.slice(8, 10);
          }
          map[key] = (map[key] || 0) + e.amount;
       }
     });

     let sortedEntries;
     if (viewMode === 'YEAR') {
        sortedEntries = Object.entries(map).sort((a,b) => monthLabels.indexOf(a[0]) - monthLabels.indexOf(b[0]));
     } else {
        sortedEntries = Object.entries(map).sort((a,b) => a[0].localeCompare(b[0]));
     }

     return sortedEntries.map(([k, v]) => ({ name: k, valor: Money.toFloat(v) }));
  }, [filteredLedger, viewMode, filterType]);

  const chartPie = useMemo(() => {
      let parts = 0, servs = 0;
      filteredWorkOrders.forEach(o => { parts += o.parts.reduce((a,i)=>a+i.price,0); servs += o.services.reduce((a,i)=>a+i.price,0); });
      return parts+servs === 0 ? [{name:'-', value:1}] : [{name:'Peças', value: Money.toFloat(parts)}, {name:'Serviços', value: Money.toFloat(servs)}];
  }, [filteredWorkOrders]);

  return (
    <>
      {showConfetti && <Confetti />}
      
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div className="app-container">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        
        <main className="main-content">
          {activeTab === 'FINANCEIRO' && (
            <FinancialPage 
              isLoading={isLoading} 
              kpiData={kpiData} 
              chartDataFluxo={chartFluxo} 
              chartDataPie={chartPie} 
              ledger={filteredLedger} 
              Money={Money}
              onOpenExport={() => setIsExportModalOpen(true)} 
              onOpenEntry={() => { setEditingEntry(null); setIsEntryModalOpen(true); }} 
              onEditEntry={handleEditEntry} 
              onDeleteEntry={handleDeleteEntry}
              selectedMonth={selectedMonth}
              onMonthChange={setSelectedMonth}
              viewMode={viewMode}
              setViewMode={setViewMode}
              filterType={filterType}
              setFilterType={setFilterType}
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
                onDelete: handleDeleteOS,
                onArchive: handleArchiveOS,
                onRestore: handleRestoreOS,
                onQuickFinish: (id) => handleUpdateStatus(id, 'FINALIZADO')
              }}
            />
          )}

          {activeTab === 'PROCESSOS' && <ProcessPage workOrders={workOrders} onOpenNew={() => { setEditingOS(null); setIsModalOpen(true); }} onUpdateStatus={handleUpdateStatus} />}
          {activeTab === 'CLIENTES' && <CRMPage clients={clients} workOrders={workOrders} isLoading={isLoading} formatMoney={Money.format} />}
          
          {activeTab === 'CONFIG' && (
            <ConfigPage 
                settings={settings} 
                setSettings={setSettings} 
                currentTheme={currentTheme} 
                setCurrentTheme={setCurrentTheme} 
                onBackup={handleBackup} 
                isBackuping={isBackuping} 
                driveStatus={driveStatus} 
                onImportData={handleImportData}
                onOpenDatabase={() => setIsDatabaseModalOpen(true)}
            />
          )}
        </main>
      </div>

      <OSModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveOSModal} editingOS={editingOS} clients={clients} catalogParts={catalogParts} catalogServices={catalogServices} nextOSNumber={workOrders.length > 0 ? Math.max(...workOrders.map(o => o.osNumber)) + 1 : 1} isSaving={isSaving} formatMoney={Money.format} />
      
      <EntryModal 
        isOpen={isEntryModalOpen} 
        onClose={() => { setIsEntryModalOpen(false); setEditingEntry(null); }} 
        onSave={handleSaveEntryModal} 
        initialData={editingEntry}
      />
      
      <DatabaseModal 
        isOpen={isDatabaseModalOpen}
        onClose={() => setIsDatabaseModalOpen(false)}
        clients={clients}
        catalogParts={catalogParts}
        catalogServices={catalogServices}
        onSaveClient={handleSaveClient}
        onDeleteClient={handleDeleteClient}
        onSaveCatalogItem={handleSaveCatalogItem}
        onDeleteCatalogItem={handleDeleteCatalogItem}
        formatMoney={Money.format}
      />

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