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

interface PendingAction {
  type: 'DELETE_OS' | 'ARCHIVE_OS' | 'FINISH_OS_FINANCIAL' | 'RESTORE_FINANCIAL' | 'IMPORT_DATA';
  data?: any;
  content?: string;
}

function AppContent() {
  const { dbPath } = useDatabase();
  const finance = useFinance();
  
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [catalogParts, setCatalogParts] = useState<CatalogItem[]>([]);
  const [catalogServices, setCatalogServices] = useState<CatalogItem[]>([]);
  const [settings, setSettings] = useState<WorkshopSettings>({
    name: "OFICINA",
    cnpj: "",
    address: "",
    technician: "",
    exportPath: "",
    googleDriveToken: ""
  });

  const [currentTheme, setCurrentTheme] = useState<'dark' | 'vintage'>('dark');
  const [activeTab, setActiveTab] = useState<'FINANCEIRO' | 'OFICINA' | 'PROCESSOS' | 'CLIENTES' | 'CONFIG'>('OFICINA');
  
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

  // Estados de Confirmação
  const [deleteModalInfo, setDeleteModalInfo] = useState<{ isOpen: boolean; entry: LedgerEntry | null }>({ isOpen: false, entry: null });
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

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

  // --- ACTIONS ---
  const handleUpdateStatus = (osId: string, newStatus: OSStatus) => {
    const os = workOrders.find(o => o.id === osId);
    if (!os || os.status === newStatus) return;

    if (newStatus === 'FINALIZADO' && os.status !== 'FINALIZADO' && !os.financialId) {
      setPendingAction({ type: 'FINISH_OS_FINANCIAL', data: os });
      return;
    } else if (os.status === 'FINALIZADO' && newStatus !== 'FINALIZADO' && os.financialId) {
      setPendingAction({ type: 'RESTORE_FINANCIAL', data: os });
      return;
    }

    setWorkOrders(prev => prev.map(o => o.id === osId ? { ...o, status: newStatus } : o));
    SoundFX.pop();
  };

  const handleSaveOSModal = (data: any) => {
    const duplicate = workOrders.find(o => o.osNumber === data.osNumber && o.id !== editingOS?.id);
    if (duplicate && !confirm(`OS #${data.osNumber} duplicada. Continuar?`)) return;

    setClients(prev => learnClientData(prev, data.clientName, data.vehicle, data.plate || '', data.clientPhone, data.clientNotes || ''));
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

    setPendingAction(null);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
  }, [currentTheme]);

  useEffect(() => {
    if (showConfetti) setTimeout(() => setShowConfetti(false), 3000);
  }, [showConfetti]);

  useKeyboard('F2', () => {
    if (activeTab === 'OFICINA') {
      setEditingOS(null);
      setIsModalOpen(true);
    }
    addToast("Nova OS (F2)", "info");
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
    if (deleteModalInfo.isOpen) setDeleteModalInfo({ isOpen: false, entry: null });
    if (pendingAction) setPendingAction(null);
  });

  return (
    <>
      {showConfetti && <Confetti />}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div className="app-container">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        <main className="main-content">
          {activeTab === 'OFICINA' && (
            <WorkshopPage
              workOrders={workOrders}
              isLoading={isLoading}
              formatMoney={Money.format}
              onNewOS={() => {
                setEditingOS(null);
                setIsModalOpen(true);
              }}
              onDragEnd={(res: DropResult) => {
                if (res.destination && res.destination.droppableId !== res.source.droppableId)
                  handleUpdateStatus(res.draggableId, res.destination.droppableId as OSStatus);
              }}
              kanbanActions={{
                onRegress: (id) => {
                  const os = workOrders.find(o => o.id === id);
                  if (os) {
                    const newStatus = os.status === 'FINALIZADO' ? 'EM_SERVICO' : os.status === 'EM_SERVICO' ? 'APROVADO' : 'ORCAMENTO';
                    handleUpdateStatus(id, newStatus);
                  }
                },
                onAdvance: (id) => {
                  const os = workOrders.find(o => o.id === id);
                  if (os) {
                    const newStatus = os.status === 'ORCAMENTO' ? 'APROVADO' : os.status === 'APROVADO' ? 'EM_SERVICO' : 'FINALIZADO';
                    handleUpdateStatus(id, newStatus);
                  }
                },
                onEdit: (os) => {
                  setEditingOS(os);
                  setIsModalOpen(true);
                },
                onChecklist: (os) => {
                  setChecklistOS(os);
                  setIsChecklistOpen(true);
                },
                onPrint: (os) => {
                  setPrintingOS(os);
                  setTimeout(() => window.print(), 100);
                },
                onDelete: (os) => setPendingAction({ type: 'DELETE_OS', data: os }),
                onArchive: (os) => setPendingAction({ type: 'ARCHIVE_OS', data: os }),
                onRestore: (os) => handleUpdateStatus(os.id, 'ORCAMENTO'),
                onQuickFinish: (id) => handleUpdateStatus(id, 'FINALIZADO')
              }}
            />
          )}

          {activeTab === 'PROCESSOS' && (
            <ProcessPage
              workOrders={workOrders}
              onOpenNew={() => {
                setEditingOS(null);
                setIsModalOpen(true);
              }}
              onUpdateStatus={handleUpdateStatus}
            />
          )}

          {activeTab === 'CLIENTES' && (
            <CRMPage
              clients={clients}
              workOrders={workOrders}
              isLoading={isLoading}
              formatMoney={Money.format}
            />
          )}
        </main>
      </div>

      <OSModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveOSModal}
        editingOS={editingOS}
        clients={clients}
        catalogParts={catalogParts}
        catalogServices={catalogServices}
        nextOSNumber={workOrders.length > 0 ? Math.max(...workOrders.map(o => o.osNumber)) + 1 : 1}
        isSaving={isSaving}
        formatMoney={Money.format}
      />

      <ChecklistModal
        isOpen={isChecklistOpen}
        onClose={() => setIsChecklistOpen(false)}
        onSave={(data) => {
          if (checklistOS)
            setWorkOrders(p => p.map(o => o.id === checklistOS.id ? { ...o, checklist: data } : o));
          setIsChecklistOpen(false);
        }}
        os={checklistOS}
      />

      <PrintableInvoice data={printingOS} settings={settings} formatMoney={Money.format} />

      <ConfirmationModal
        isOpen={!!pendingAction}
        onClose={() => setPendingAction(null)}
        onConfirm={executePendingAction}
        title={
          pendingAction?.type === 'DELETE_OS'
            ? 'Excluir Ordem de Serviço?'
            : pendingAction?.type === 'ARCHIVE_OS'
            ? 'Arquivar Ordem de Serviço?'
            : pendingAction?.type === 'FINISH_OS_FINANCIAL'
            ? 'OS Finalizada'
            : pendingAction?.type === 'RESTORE_FINANCIAL'
            ? 'Reabrir OS?'
            : 'Confirmar'
        }
        message={
          pendingAction?.type === 'DELETE_OS'
            ? 'Esta ação removerá a OS e qualquer lançamento financeiro vinculado. Não pode ser desfeito.'
            : pendingAction?.type === 'ARCHIVE_OS'
            ? 'A OS sairá do quadro Kanban mas ficará salva no histórico.'
            : pendingAction?.type === 'FINISH_OS_FINANCIAL'
            ? `Deseja lançar o valor de ${Money.format(pendingAction.data?.total || 0)} nas Receitas?`
            : pendingAction?.type === 'RESTORE_FINANCIAL'
            ? 'Isso removerá o lançamento financeiro vinculado e voltará a OS para "Em Serviço".'
            : 'Tem certeza?'
        }
        confirmText={pendingAction?.type === 'DELETE_OS' ? 'Excluir' : 'Confirmar'}
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