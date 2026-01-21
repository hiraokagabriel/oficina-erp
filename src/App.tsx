import { useState, useEffect, lazy, Suspense } from 'react';

// --- CONTEXT & HOOKS ---
import { DatabaseProvider, useDatabase } from './context/DatabaseContext';
import { useFinance } from './hooks/useFinance';
import { useKeyboard } from './hooks/useKeyboard';

// --- SERVICES ---
import { updateClientCascading, updateCatalogItemCascading } from './services/cascadeService';
import { uploadToDrive } from './services/googleDrive';

// --- COMPONENTES VISUAIS (carregamento imediato) ---
import { Sidebar } from './components/Sidebar';
import { Confetti } from './components/ui/Confetti';
import { PrintableInvoice } from './components/PrintableInvoice';
import { ToastContainer, ToastMessage, ToastType } from './components/ui/ToastContainer';
import { LoadingSkeleton } from './components/ui/LoadingSkeleton';

// --- PÁGINAS (lazy loading) ---
const FinancialPage = lazy(() => import('./pages/FinancialPage').then(m => ({ default: m.FinancialPage })));
const WorkshopPage = lazy(() => import('./pages/WorkshopPage').then(m => ({ default: m.WorkshopPage })));
const CRMPage = lazy(() => import('./pages/CRMPage').then(m => ({ default: m.CRMPage })));
const ProcessPage = lazy(() => import('./pages/ProcessPage').then(m => ({ default: m.ProcessPage })));
const ConfigPage = lazy(() => import('./pages/ConfigPage').then(m => ({ default: m.ConfigPage })));

// --- MODAIS (lazy loading) ---
const OSModal = lazy(() => import('./modals/OSModal').then(m => ({ default: m.OSModal })));
const EntryModal = lazy(() => import('./modals/EntryModal').then(m => ({ default: m.EntryModal })));
const ExportModal = lazy(() => import('./modals/ExportModal').then(m => ({ default: m.ExportModal })));
const ChecklistModal = lazy(() => import('./modals/ChecklistModal').then(m => ({ default: m.ChecklistModal })));
const DatabaseModal = lazy(() => import('./modals/DatabaseModal').then(m => ({ default: m.DatabaseModal })));
const DeleteConfirmationModal = lazy(() => import('./modals/DeleteConfirmationModal').then(m => ({ default: m.DeleteConfirmationModal })));
const ConfirmationModal = lazy(() => import('./modals/ConfirmationModal').then(m => ({ default: m.ConfirmationModal })));
const InstallmentModal = lazy(() => import('./modals/InstallmentModal').then(m => ({ default: m.InstallmentModal })));

// --- UTILS ---
import { SoundFX } from './utils/audio';
import { 
  Money, createEntry, updateWorkOrderData, learnClientData, learnCatalogItems 
} from './utils/helpers';

// --- TYPES ---
import { 
  LedgerEntry, WorkOrder, Client, CatalogItem, OSStatus
} from './types';

// --- CONSTANTES ---
const GOOGLE_API_KEY = "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";

interface PendingAction {
  type: 'DELETE_OS' | 'ARCHIVE_OS' | 'FINISH_OS_FINANCIAL' | 'RESTORE_FINANCIAL' | 'IMPORT_DATA';
  data?: any;
  content?: string;
}

function AppContent() {
  // Usar o contexto em vez de estados locais
  const { 
    ledger, setLedger,
    workOrders, setWorkOrders,
    clients, setClients,
    catalogParts, setCatalogParts,
    catalogServices, setCatalogServices,
    settings, setSettings,
    isLoading, isSaving
  } = useDatabase();
  
  const finance = useFinance();
  
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'pastel'>('dark');
  const [activeTab, setActiveTab] = useState<'FINANCEIRO' | 'OFICINA' | 'PROCESSOS' | 'CLIENTES' | 'CONFIG'>('OFICINA');
  const [showConfetti, setShowConfetti] = useState(false);

  // Modais
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const [isDatabaseModalOpen, setIsDatabaseModalOpen] = useState(false);
  const [isInstallmentModalOpen, setIsInstallmentModalOpen] = useState(false);
  const [installmentOS, setInstallmentOS] = useState<WorkOrder | null>(null);

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

  // --- BACKUP GOOGLE DRIVE ---
  const handleGoogleDriveBackup = async () => {
    if (isBackuping) return;
    if (!settings.googleDriveToken || settings.googleDriveToken.trim() === "") {
      alert("Por favor, insira um Token de Acesso válido nas configurações para usar o Google Drive.");
      return;
    }

    setIsBackuping(true);
    setDriveStatus('idle');
    addToast("Criando backup...", "info");

    try {
      const fullDb = { ledger, workOrders, clients, catalogParts, catalogServices, settings };
      const content = JSON.stringify(fullDb, null, 2);
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
      const filename = `backup_oficina_${timestamp}.json`;

      await uploadToDrive(filename, content, settings.googleDriveToken, GOOGLE_API_KEY);
      setDriveStatus('success');
      addToast("Backup salvo na nuvem!", "success");
    } catch (e: any) {
      console.error("Erro Backup:", e);
      setDriveStatus('error');
      addToast(e.message || "Erro no backup.", "error");
    } finally {
      setIsBackuping(false);
    }
  };

  // --- IMPORT DATA ---
  const handleImportData = (content: string) => {
    setPendingAction({ type: 'IMPORT_DATA', content });
  };

  // --- ACTIONS ---
  // ✅ NOVA API: Handler simplificado que recebe diretamente (osId, newStatus)
  const handleUpdateStatus = (osId: string, newStatus: OSStatus) => {
    const os = workOrders.find(o => o.id === osId);
    if (!os || os.status === newStatus) return;

    // Verificar se precisa criar/remover lançamento financeiro
    if (newStatus === 'FINALIZADO' && os.status !== 'FINALIZADO' && !os.financialId) {
      setPendingAction({ type: 'FINISH_OS_FINANCIAL', data: os });
      return;
    } else if (os.status === 'FINALIZADO' && newStatus !== 'FINALIZADO' && os.financialId) {
      setPendingAction({ type: 'RESTORE_FINANCIAL', data: os });
      return;
    }

    // ✅ Atualização direta - sem gambiarras!
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
        editingOS, data.osNumber, data.vehicle, data.clientName, data.clientPhone,
        data.mileage, data.parts, data.services, data.createdAt
      );

      setWorkOrders(prev => prev.map(o => o.id === editingOS.id ? updated : o));
      
      if (updated.financialId) {
        setLedger(prev => prev.map(e => {
          if (e.id === updated.financialId) {
            return {
              ...e,
              effectiveDate: updated.createdAt,
              amount: updated.total,
              description: `Receita OS #${data.osNumber} - ${data.clientName}`
            };
          }
          return e;
        }));
      }
      
      addToast("OS atualizada!", "success");
    } else {
      const newOS = {
        id: crypto.randomUUID(),
        osNumber: data.osNumber,
        vehicle: data.vehicle,
        clientName: data.clientName,
        clientPhone: data.clientPhone,
        mileage: data.mileage,
        status: 'ORCAMENTO' as OSStatus,
        parts: data.parts,
        services: data.services,
        total: data.parts.reduce((a: number, b: any) => a + b.price, 0) + data.services.reduce((a: number, b: any) => a + b.price, 0),
        createdAt: data.createdAt || new Date().toISOString()
      };
      setWorkOrders(prev => [...prev, newOS]);
      addToast("Nova OS criada!", "success");
    }
    setIsModalOpen(false);
  };

  const handleSaveEntryModal = (desc: string, val: number, type: 'CREDIT' | 'DEBIT', dateStr: string, recurrence: 'SINGLE' | 'INSTALLMENT' | 'RECURRING', count: number) => {
    const absVal = Math.abs(val);
    if (editingEntry) {
      finance.updateEntry({ 
        ...editingEntry, 
        description: desc, 
        amount: Money.fromFloat(absVal), 
        type, 
        effectiveDate: dateStr 
      });
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
      if (confirm(`Este lançamento pertence à OS #${linkedOS.osNumber}.\nAbrir OS para edição?`)) {
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

  const handleRequestDeleteEntry = (entry: LedgerEntry) => setDeleteModalInfo({ isOpen: true, entry });
  
  const confirmDeleteSingle = () => {
    if (deleteModalInfo.entry) {
      finance.deleteEntry(deleteModalInfo.entry.id);
      addToast("Excluído.", "info");
    }
    setDeleteModalInfo({ isOpen: false, entry: null });
  };
  
  const confirmDeleteGroup = () => {
    if (deleteModalInfo.entry?.groupId) {
      finance.deleteGroup(deleteModalInfo.entry.groupId);
      addToast("Série excluída.", "info");
    }
    setDeleteModalInfo({ isOpen: false, entry: null });
  };

  const handleSaveClient = (updatedClient: Client) => {
    const oldClient = clients.find(c => c.id === updatedClient.id);
    setClients(prev => {
      const exists = prev.find(c => c.id === updatedClient.id);
      return exists ? prev.map(c => c.id === updatedClient.id ? updatedClient : c) : [...prev, updatedClient];
    });
    const { newWorkOrders, newLedger, hasChanges } = updateClientCascading(oldClient, updatedClient, workOrders, ledger);
    if (hasChanges) {
      setWorkOrders(newWorkOrders);
      setLedger(newLedger);
      addToast("Atualizado em cascata!", "success");
    } else {
      addToast("Salvo!", "success");
    }
  };

  const handleSaveCatalogItem = (updatedItem: CatalogItem, type: 'part' | 'service') => {
    let oldItem: CatalogItem | undefined;
    if (type === 'part') {
      oldItem = catalogParts.find(p => p.id === updatedItem.id);
      setCatalogParts(prev => {
        const ex = prev.find(p => p.id === updatedItem.id);
        return ex ? prev.map(p => p.id === updatedItem.id ? updatedItem : p) : [...prev, updatedItem];
      });
    } else {
      oldItem = catalogServices.find(s => s.id === updatedItem.id);
      setCatalogServices(prev => {
        const ex = prev.find(s => s.id === updatedItem.id);
        return ex ? prev.map(s => s.id === updatedItem.id ? updatedItem : s) : [...prev, updatedItem];
      });
    }
    const { newWorkOrders, hasChanges } = updateCatalogItemCascading(oldItem, updatedItem, workOrders);
    if (hasChanges) {
      setWorkOrders(newWorkOrders);
      addToast("Atualizado em cascata!", "success");
    } else {
      addToast("Salvo!", "success");
    }
  };

  const handleInstallmentConfirm = (config: any) => {
    const newEntries: LedgerEntry[] = [];
    const baseDate = new Date(config.firstPaymentDate);
    
    for (let i = 0; i < config.installments; i++) {
      const dueDate = new Date(baseDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      
      const entry: LedgerEntry = {
        id: crypto.randomUUID(),
        description: `${config.description} - Parcela ${i + 1}/${config.installments}`,
        amount: config.installmentAmount,
        type: 'CREDIT',
        effectiveDate: dueDate.toISOString(),
        createdAt: new Date().toISOString(),
        groupId: config.groupId,
        installmentNumber: i + 1,
        totalInstallments: config.installments,
        installmentGroupId: config.groupId,
        isPaid: false,
        dueDate: dueDate.toISOString()
      };
      newEntries.push(entry);
    }
    
    setLedger(prev => [...newEntries, ...prev]);
    
    if (installmentOS) {
      setWorkOrders(prev => prev.map(o => 
        o.id === installmentOS.id 
          ? { ...o, financialId: newEntries[0].id, paymentMethod: 'INSTALLMENT', installmentConfig: config } 
          : o
      ));
    }
    
    addToast(`Parcelamento criado! ${config.installments}x de ${Money.format(config.installmentAmount)}`, "success");
    setIsInstallmentModalOpen(false);
    setInstallmentOS(null);
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
      
      if (confirm(`Deseja parcelar o pagamento de ${Money.format(os.total)}?`)) {
        setInstallmentOS(os);
        setIsInstallmentModalOpen(true);
        setPendingAction(null);
        return;
      }
      
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
      const parsed = JSON.parse(pendingAction.content!);
      setLedger(parsed.ledger || []);
      setWorkOrders(parsed.workOrders || []);
      setClients(parsed.clients || []);
      setCatalogParts(parsed.catalogParts || []);
      setCatalogServices(parsed.catalogServices || []);
      if (parsed.settings) setSettings(parsed.settings);
      addToast("Dados importados com sucesso!", "success");
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
    if (isEntryModalOpen) { setIsEntryModalOpen(false); setEditingEntry(null); }
    if (isExportModalOpen) setIsExportModalOpen(false);
    if (isChecklistOpen) setIsChecklistOpen(false);
    if (isDatabaseModalOpen) setIsDatabaseModalOpen(false);
    if (isInstallmentModalOpen) { setIsInstallmentModalOpen(false); setInstallmentOS(null); }
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
          <Suspense fallback={<LoadingSkeleton type="page" />}>
            {activeTab === 'FINANCEIRO' && (
              <FinancialPage
                isLoading={isLoading}
                kpiData={finance.kpiData}
                chartDataFluxo={finance.chartFluxo}
                chartDataPie={finance.chartPie}
                ledger={finance.filteredLedger}
                Money={Money}
                onOpenExport={() => setIsExportModalOpen(true)}
                onOpenEntry={() => { setEditingEntry(null); setIsEntryModalOpen(true); }}
                onEditEntry={handleEditEntry}
                onDeleteEntry={handleRequestDeleteEntry}
                selectedMonth={finance.selectedMonth}
                onMonthChange={finance.setSelectedMonth}
                viewMode={finance.viewMode}
                setViewMode={finance.setViewMode}
                filterType={finance.filterType}
                setFilterType={finance.setFilterType}
              />
            )}

            {activeTab === 'OFICINA' && (
              <WorkshopPage
                workOrders={workOrders}
                isLoading={isLoading}
                formatMoney={Money.format}
                onNewOS={() => { setEditingOS(null); setIsModalOpen(true); }}
                onStatusChange={handleUpdateStatus}
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

            {activeTab === 'PROCESSOS' && (
              <ProcessPage
                workOrders={workOrders}
                onOpenNew={() => { setEditingOS(null); setIsModalOpen(true); }}
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

            {activeTab === 'CONFIG' && (
              <ConfigPage
                settings={settings}
                setSettings={setSettings}
                currentTheme={currentTheme}
                setCurrentTheme={setCurrentTheme}
                onBackup={handleGoogleDriveBackup}
                isBackuping={isBackuping}
                driveStatus={driveStatus}
                onImportData={handleImportData}
                onOpenDatabase={() => setIsDatabaseModalOpen(true)}
              />
            )}
          </Suspense>
        </main>
      </div>

      <Suspense fallback={null}>
        {isModalOpen && (
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
        )}

        {isEntryModalOpen && (
          <EntryModal
            isOpen={isEntryModalOpen}
            onClose={() => { setIsEntryModalOpen(false); setEditingEntry(null); }}
            onSave={handleSaveEntryModal}
            initialData={editingEntry}
          />
        )}

        {isInstallmentModalOpen && installmentOS && (
          <InstallmentModal
            isOpen={isInstallmentModalOpen}
            onClose={() => { setIsInstallmentModalOpen(false); setInstallmentOS(null); }}
            totalAmount={installmentOS.total}
            description={`OS #${installmentOS.osNumber} - ${installmentOS.clientName}`}
            onConfirm={handleInstallmentConfirm}
          />
        )}

        {isDatabaseModalOpen && (
          <DatabaseModal
            isOpen={isDatabaseModalOpen}
            onClose={() => setIsDatabaseModalOpen(false)}
            clients={clients}
            catalogParts={catalogParts}
            catalogServices={catalogServices}
            onSaveClient={handleSaveClient}
            onDeleteClient={(id) => setClients(p => p.filter(c => c.id !== id))}
            onSaveCatalogItem={handleSaveCatalogItem}
            onDeleteCatalogItem={(id, type) =>
              type === 'part'
                ? setCatalogParts(p => p.filter(x => x.id !== id))
                : setCatalogServices(p => p.filter(x => x.id !== id))
            }
            formatMoney={Money.format}
          />
        )}

        {isExportModalOpen && (
          <ExportModal
            isOpen={isExportModalOpen}
            onClose={() => setIsExportModalOpen(false)}
            ledger={ledger}
            workOrders={workOrders}
            defaultPath={settings.exportPath}
            Money={Money}
            SoundFX={{
              success: () => addToast("Sucesso!", "success"),
              error: () => addToast("Erro", "error")
            }}
          />
        )}

        {isChecklistOpen && (
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
        )}

        <PrintableInvoice data={printingOS} settings={settings} formatMoney={Money.format} />

        {deleteModalInfo.isOpen && (
          <DeleteConfirmationModal
            isOpen={deleteModalInfo.isOpen}
            onClose={() => setDeleteModalInfo({ isOpen: false, entry: null })}
            onConfirmSingle={confirmDeleteSingle}
            onConfirmGroup={confirmDeleteGroup}
            isGroup={!!deleteModalInfo.entry?.groupId}
          />
        )}

        {pendingAction && (
          <ConfirmationModal
            isOpen={!!pendingAction}
            onClose={() => setPendingAction(null)}
            onConfirm={executePendingAction}
            title={
              pendingAction?.type === 'DELETE_OS' ? 'Excluir Ordem de Serviço?' :
              pendingAction?.type === 'ARCHIVE_OS' ? 'Arquivar Ordem de Serviço?' :
              pendingAction?.type === 'FINISH_OS_FINANCIAL' ? 'OS Finalizada' :
              pendingAction?.type === 'RESTORE_FINANCIAL' ? 'Reabrir OS?' :
              pendingAction?.type === 'IMPORT_DATA' ? 'Importar Backup?' : 'Confirmar'
            }
            message={
              pendingAction?.type === 'DELETE_OS' ? 'Esta ação removerá a OS e qualquer lançamento financeiro vinculado. Não pode ser desfeito.' :
              pendingAction?.type === 'ARCHIVE_OS' ? 'A OS sairá do quadro Kanban mas ficará salva no histórico.' :
              pendingAction?.type === 'FINISH_OS_FINANCIAL' ? `Deseja lançar o valor de ${Money.format(pendingAction.data?.total || 0)} nas Receitas?` :
              pendingAction?.type === 'RESTORE_FINANCIAL' ? 'Isso removerá o lançamento financeiro vinculado e voltará a OS para "Em Serviço".' :
              pendingAction?.type === 'IMPORT_DATA' ? 'ATENÇÃO: Isso substituirá todos os dados atuais pelos do backup. Continuar?' : 'Tem certeza?'
            }
            confirmText={
              pendingAction?.type === 'DELETE_OS' ? 'Excluir' :
              pendingAction?.type === 'IMPORT_DATA' ? 'Substituir Tudo' : 'Confirmar'
            }
            confirmColor={
              pendingAction?.type === 'DELETE_OS' || pendingAction?.type === 'RESTORE_FINANCIAL' ? 'danger' : 'primary'
            }
          />
        )}
      </Suspense>
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