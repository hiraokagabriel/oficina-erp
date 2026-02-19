import { useState, useEffect, lazy, Suspense } from 'react';

import { DatabaseProvider, useDatabase } from './context/DatabaseContext';
import { useFinance } from './hooks/useFinance';
import { useKeyboard } from './hooks/useKeyboard';
import { updateClientCascading, updateCatalogItemCascading } from './services/cascadeService';
import { uploadToDrive } from './services/googleDrive';
import { Sidebar } from './components/Sidebar';
import { Confetti } from './components/ui/Confetti';
import { ToastContainer, ToastMessage, ToastType } from './components/ui/ToastContainer';
import { LoadingSkeleton } from './components/ui/LoadingSkeleton';
import { printOS } from './utils/printOS';

const FinancialPage = lazy(() => import('./pages/FinancialPage').then(m => ({ default: m.FinancialPage })));
const WorkshopPage = lazy(() => import('./pages/WorkshopPage').then(m => ({ default: m.WorkshopPage })));
const CRMPage = lazy(() => import('./pages/CRMPage').then(m => ({ default: m.CRMPage })));
const ProcessPage = lazy(() => import('./pages/ProcessPage').then(m => ({ default: m.ProcessPage })));
const PartsPage = lazy(() => import('./pages/PartsPage').then(m => ({ default: m.PartsPage })));
const ConfigPage = lazy(() => import('./pages/ConfigPage').then(m => ({ default: m.ConfigPage })));
const OSModal = lazy(() => import('./modals/OSModal').then(m => ({ default: m.OSModal })));
const EntryModal = lazy(() => import('./modals/EntryModal').then(m => ({ default: m.EntryModal })));
const ExportModal = lazy(() => import('./modals/ExportModal').then(m => ({ default: m.ExportModal })));
const ChecklistModal = lazy(() => import('./modals/ChecklistModal').then(m => ({ default: m.ChecklistModal })));
const DatabaseModal = lazy(() => import('./modals/DatabaseModal').then(m => ({ default: m.DatabaseModal })));
const DeleteConfirmationModal = lazy(() => import('./modals/DeleteConfirmationModal').then(m => ({ default: m.DeleteConfirmationModal })));
const ConfirmationModal = lazy(() => import('./modals/ConfirmationModal').then(m => ({ default: m.ConfirmationModal })));
const InstallmentModal = lazy(() => import('./modals/InstallmentModal').then(m => ({ default: m.InstallmentModal })));
const ChoiceModal = lazy(() => import('./modals/ChoiceModal').then(m => ({ default: m.ChoiceModal })));

import { SoundFX } from './utils/audio';
import { Money, createEntry, updateWorkOrderData, learnClientData, learnCatalogItems, learnTechnician } from './utils/helpers';
import { LedgerEntry, WorkOrder, Client, CatalogItem, OSStatus, Technician } from './types';

interface PendingAction {
  type: 'DELETE_OS' | 'ARCHIVE_OS' | 'FINISH_OS_FINANCIAL' | 'RESTORE_FINANCIAL' | 'IMPORT_DATA';
  data?: any;
  content?: string;
}

function AppContent() {
  const {
    ledger,
    setLedger,
    workOrders,
    setWorkOrders,
    clients,
    setClients,
    catalogParts,
    setCatalogParts,
    catalogServices,
    setCatalogServices,
    catalogTechnicians,
    setCatalogTechnicians,
    settings,
    setSettings,
    isLoading,
    isSaving
  } = useDatabase();

  const finance = useFinance();

  const [currentTheme, setCurrentTheme] = useState<'dark' | 'pastel'>('dark');
  const [activeTab, setActiveTab] = useState<'FINANCEIRO' | 'OFICINA' | 'PROCESSOS' | 'CLIENTES' | 'PECAS' | 'CONFIG'>('OFICINA');
  const [showConfetti, setShowConfetti] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const [isDatabaseModalOpen, setIsDatabaseModalOpen] = useState(false);
  const [isInstallmentModalOpen, setIsInstallmentModalOpen] = useState(false);
  const [installmentOS, setInstallmentOS] = useState<WorkOrder | null>(null);
  const [isInstallmentChoiceOpen, setIsInstallmentChoiceOpen] = useState(false);
  const [pendingInstallmentOS, setPendingInstallmentOS] = useState<WorkOrder | null>(null);
  const [editingOS, setEditingOS] = useState<WorkOrder | null>(null);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [checklistOS, setChecklistOS] = useState<WorkOrder | null>(null);
  const [deleteModalInfo, setDeleteModalInfo] = useState<{ isOpen: boolean; entry: LedgerEntry | null }>({ isOpen: false, entry: null });
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [isBackuping, setIsBackuping] = useState(false);
  const [driveStatus, setDriveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // 🆕 MIGRAÇÃO: Atualiza OSs finalizadas antigas com paymentDate
  useEffect(() => {
    const migrateOldWorkOrders = () => {
      let updated = false;
      const newWorkOrders = workOrders.map(os => {
        if (os.status === 'FINALIZADO' && !os.paymentDate) {
          console.log(`🔄 Migrando OS #${os.osNumber}: paymentDate = createdAt`);
          updated = true;
          return { ...os, paymentDate: os.createdAt };
        }
        return os;
      });

      if (updated) {
        console.log('✅ Migração de OSs antigas concluída!');
        setWorkOrders(newWorkOrders);
        addToast('OSs antigas atualizadas!', 'success');
      }
    };

    if (!isLoading && workOrders.length > 0) {
      migrateOldWorkOrders();
    }
  }, [isLoading]);

  // 🔧 MIGRAÇÃO: Atualiza lançamentos de receitas sem paymentDate
  useEffect(() => {
    const migrateLedgerEntries = () => {
      let updated = false;
      const newLedger = ledger.map(entry => {
        if (entry.type === 'CREDIT' && !entry.paymentDate) {
          const linkedOS = workOrders.find(os => os.financialId === entry.id);
          if (linkedOS && linkedOS.paymentDate) {
            console.log(`💵 Migrando lançamento ${entry.description}: paymentDate da OS`);
            updated = true;
            return { ...entry, paymentDate: linkedOS.paymentDate };
          }
        }
        return entry;
      });

      if (updated) {
        console.log('✅ Migração de lançamentos concluída!');
        setLedger(newLedger);
      }
    };

    if (!isLoading && ledger.length > 0 && workOrders.length > 0) {
      migrateLedgerEntries();
    }
  }, [isLoading, workOrders]);

  // 🆕 MIGRAÇÃO: settings.technician (legado) -> catalogTechnicians
  useEffect(() => {
    if (isLoading) return;

    const legacyTech = (settings as any)?.technician;
    if (!legacyTech || typeof legacyTech !== 'string' || legacyTech.trim() === '') return;

    const name = legacyTech.trim();
    setCatalogTechnicians(prev => learnTechnician(prev, name));

    setSettings(prev => {
      const copy: any = { ...prev };
      delete copy.technician;
      return copy;
    });
  }, [isLoading, settings]);

  const addToast = (message: string, type: ToastType = 'info') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    if (type === 'success') SoundFX.success();
    if (type === 'error') SoundFX.error();
  };

  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  const handleGoogleDriveBackup = async () => {
    if (isBackuping) return;

    if (!settings.googleApiKey || settings.googleApiKey.trim() === '') {
      addToast('⚠️ Configure a Google API Key nas configurações.', 'error');
      return;
    }

    if (!settings.googleDriveToken || settings.googleDriveToken.trim() === '') {
      addToast('⚠️ Configure o Token de Acesso do Google Drive.', 'error');
      return;
    }

    setIsBackuping(true);
    setDriveStatus('idle');
    addToast('Criando backup...', 'info');

    try {
      const fullDb = { ledger, workOrders, clients, catalogParts, catalogServices, catalogTechnicians, settings };
      const content = JSON.stringify(fullDb, null, 2);
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
      const filename = `backup_oficina_${timestamp}.json`;

      await uploadToDrive(filename, content, settings.googleDriveToken, settings.googleApiKey);
      setDriveStatus('success');
      addToast('Backup salvo!', 'success');
    } catch (e: any) {
      console.error('Erro:', e);
      setDriveStatus('error');
      addToast(e.message || 'Erro no backup.', 'error');
    } finally {
      setIsBackuping(false);
    }
  };

  const handleImportData = (content: string) => setPendingAction({ type: 'IMPORT_DATA', content });

  const handleUpdateStatus = (osId: string, newStatus: OSStatus) => {
    const os = workOrders.find(o => o.id === osId);
    if (!os || os.status === newStatus) return;

    const isBecomingFinalized = newStatus === 'FINALIZADO' && os.status !== 'FINALIZADO';
    const isLeavingFinalized = os.status === 'FINALIZADO' && newStatus !== 'FINALIZADO';

    if (isBecomingFinalized && !os.financialId) {
      setPendingAction({ type: 'FINISH_OS_FINANCIAL', data: os });
      return;
    } else if (isLeavingFinalized && os.financialId) {
      setPendingAction({ type: 'RESTORE_FINANCIAL', data: os });
      return;
    }

    setWorkOrders(prev => prev.map(o => {
      if (o.id !== osId) return o;

      const updates: Partial<WorkOrder> = { status: newStatus };

      if (isBecomingFinalized) {
        updates.paymentDate = new Date().toISOString();
      }

      if (isLeavingFinalized) {
        updates.paymentDate = undefined;
      }

      return { ...o, ...updates };
    }));

    SoundFX.pop();
  };

  const handleSaveOSModal = (data: any) => {
    const duplicate = workOrders.find(o => o.osNumber === data.osNumber && o.id !== editingOS?.id);
    if (duplicate && !confirm(`OS #${data.osNumber} duplicada. Continuar?`)) return;

    setClients(prev => learnClientData(prev, data.clientName, data.vehicleModelOnly || data.vehicle, data.plate || '', data.clientPhone, data.clientNotes || ''));
    setCatalogParts(prev => learnCatalogItems(prev, data.parts));
    setCatalogServices(prev => learnCatalogItems(prev, data.services));

    const technicianName = (data.technician || '').trim();
    if (technicianName) {
      setCatalogTechnicians(prev => learnTechnician(prev, technicianName));
    }

    if (editingOS) {
      const updatedBase = updateWorkOrderData(
        editingOS,
        data.osNumber,
        data.vehicle,
        data.clientName,
        data.clientPhone,
        data.mileage,
        data.parts,
        data.services,
        data.createdAt,
        data.publicNotes
      );

      const updated: WorkOrder = { ...updatedBase, technician: technicianName || undefined };
      setWorkOrders(prev => prev.map(o => o.id === editingOS.id ? updated : o));

      if (updated.financialId) {
        setLedger(prev => prev.map(e => e.id === updated.financialId ? { ...e, effectiveDate: updated.createdAt, amount: updated.total, description: `Receita OS #${data.osNumber} - ${data.clientName}` } : e));
      }
      addToast('OS atualizada!', 'success');
    } else {
      const newOS: WorkOrder = {
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
        createdAt: data.createdAt || new Date().toISOString(),
        publicNotes: data.publicNotes || '',
        technician: technicianName || undefined,
      };
      setWorkOrders(prev => [...prev, newOS]);
      addToast('Nova OS criada!', 'success');
    }
    setIsModalOpen(false);
  };

  const handleSaveEntryModal = (desc: string, val: number, type: 'CREDIT' | 'DEBIT', dateStr: string, recurrence: 'SINGLE' | 'INSTALLMENT' | 'RECURRING', count: number) => {
    const absVal = Math.abs(val);
    if (editingEntry) {
      finance.updateEntry({ ...editingEntry, description: desc, amount: Money.fromFloat(absVal), type, effectiveDate: dateStr });
      addToast('Lançamento atualizado.', 'success');
      setEditingEntry(null);
    } else {
      const createdCount = finance.addEntryWithRecurrence(desc, val, type, dateStr, recurrence, count);
      addToast(createdCount > 1 ? `${createdCount} lançamentos gerados!` : 'Lançamento registrado.', 'success');
    }
    setIsEntryModalOpen(false);
  };

  const handleEditEntry = (id: string) => {
    const linkedOS = workOrders.find(o => o.financialId === id);
    if (linkedOS) {
      if (confirm(`Este lançamento pertence à OS #${linkedOS.osNumber}.\nAbrir OS?`)) {
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

  const handleTogglePayment = (entryId: string) => {
    const entry = ledger.find(e => e.id === entryId);
    if (!entry || entry.type !== 'CREDIT') return;

    const now = new Date().toISOString();
    const newPaymentDate = entry.paymentDate ? undefined : now;

    setLedger(prev => prev.map(e =>
      e.id === entryId
        ? { ...e, paymentDate: newPaymentDate }
        : e
    ));

    const linkedOS = workOrders.find(os => os.financialId === entryId);
    if (linkedOS) {
      setWorkOrders(prev => prev.map(os =>
        os.id === linkedOS.id
          ? { ...os, paymentDate: newPaymentDate }
          : os
      ));
    }

    addToast(newPaymentDate ? '💵 Marcado como pago!' : '⏳ Marcado como pendente', 'info');
    SoundFX.pop();
  };

  const handleRequestDeleteEntry = (entry: LedgerEntry) => setDeleteModalInfo({ isOpen: true, entry });

  const confirmDeleteSingle = () => {
    if (deleteModalInfo.entry) finance.deleteEntry(deleteModalInfo.entry.id);
    addToast('Excluído.', 'info');
    setDeleteModalInfo({ isOpen: false, entry: null });
  };

  const confirmDeleteGroup = () => {
    if (deleteModalInfo.entry?.groupId) finance.deleteGroup(deleteModalInfo.entry.groupId);
    addToast('Série excluída.', 'info');
    setDeleteModalInfo({ isOpen: false, entry: null });
  };

  const handleSaveClient = (updatedClient: Client) => {
    const oldClient = clients.find(c => c.id === updatedClient.id);
    setClients(prev => prev.find(c => c.id === updatedClient.id) ? prev.map(c => c.id === updatedClient.id ? updatedClient : c) : [...prev, updatedClient]);
    const { newWorkOrders, newLedger, hasChanges } = updateClientCascading(oldClient, updatedClient, workOrders, ledger);
    if (hasChanges) {
      setWorkOrders(newWorkOrders);
      setLedger(newLedger);
      addToast('Atualizado em cascata!', 'success');
    } else {
      addToast('Salvo!', 'success');
    }
  };

  const handleSaveCatalogItem = (updatedItem: CatalogItem, type: 'part' | 'service') => {
    let oldItem: CatalogItem | undefined;
    if (type === 'part') {
      oldItem = catalogParts.find(p => p.id === updatedItem.id);
      setCatalogParts(prev => prev.find(p => p.id === updatedItem.id) ? prev.map(p => p.id === updatedItem.id ? updatedItem : p) : [...prev, updatedItem]);
    } else {
      oldItem = catalogServices.find(s => s.id === updatedItem.id);
      setCatalogServices(prev => prev.find(s => s.id === updatedItem.id) ? prev.map(s => s.id === updatedItem.id ? updatedItem : s) : [...prev, updatedItem]);
    }
    const { newWorkOrders, hasChanges } = updateCatalogItemCascading(oldItem, updatedItem, workOrders);
    if (hasChanges) {
      setWorkOrders(newWorkOrders);
      addToast('Atualizado em cascata!', 'success');
    } else {
      addToast('Salvo!', 'success');
    }
  };

  // 🆕 Handler para salvar/criar técnico no DatabaseModal
  const handleSaveTechnician = (tech: Technician) => {
    setCatalogTechnicians(prev =>
      prev.find(t => t.id === tech.id)
        ? prev.map(t => t.id === tech.id ? tech : t)
        : [...prev, tech]
    );
    addToast('Técnico salvo!', 'success');
  };

  const handleInstallmentConfirm = (config: any) => {
    console.log('🚀 ===== INÍCIO PARCELAMENTO =====');
    console.log('installmentOS:', installmentOS);
    console.log('config:', config);

    const newEntries: LedgerEntry[] = [];
    const baseDate = new Date(config.firstPaymentDate);
    const groupId = config.groupId;

    for (let i = 0; i < config.installments; i++) {
      const dueDate = new Date(baseDate);
      dueDate.setMonth(dueDate.getMonth() + i);

      const isLastInstallment = i === config.installments - 1;
      const amount = isLastInstallment ? config.lastInstallmentAmount : config.installmentAmount;

      console.log(`  Parcela ${i + 1}/${config.installments}: ${Money.format(amount)} (${isLastInstallment ? 'Última' : 'Normal'})`);

      newEntries.push({
        id: crypto.randomUUID(),
        description: `${config.description} - Parcela ${i + 1}/${config.installments}`,
        amount: amount,
        type: 'CREDIT',
        effectiveDate: dueDate.toISOString(),
        createdAt: new Date().toISOString(),
        groupId: groupId,
        installmentNumber: i + 1,
        totalInstallments: config.installments,
        installmentGroupId: groupId,
        isPaid: false,
        dueDate: dueDate.toISOString()
      });
    }

    console.log(`✅ ${newEntries.length} entradas criadas`);
    setLedger(prev => [...newEntries, ...prev]);

    if (installmentOS) {
      console.log(`🔄 Atualizando OS #${installmentOS.osNumber} (ID: ${installmentOS.id})`);

      setWorkOrders(prev => prev.map(o =>
        o.id === installmentOS.id
          ? {
              ...o,
              status: 'FINALIZADO' as OSStatus,
              financialId: newEntries[0].id,
              paymentMethod: 'INSTALLMENT',
              installmentConfig: config,
              paymentDate: new Date().toISOString()
            }
          : o
      ));

      addToast(`OS #${installmentOS.osNumber} finalizada!`, 'success');
      setShowConfetti(true);
    } else {
      console.error('❌ installmentOS é NULL!');
    }

    addToast(`Parcelamento criado! ${config.installments}x`, 'success');
    setIsInstallmentModalOpen(false);
    setInstallmentOS(null);

    console.log('🏁 ===== FIM PARCELAMENTO =====');
  };

  const handleOpenOSFromCRM = (os: WorkOrder) => {
    setEditingOS(os);
    setIsModalOpen(true);
    setActiveTab('OFICINA');
  };

  // 🖨️ Impressão padrão (ambas assinaturas - comportamento original)
  const handlePrintOS = (os: WorkOrder) => {
    addToast(`Imprimindo OS #${os.osNumber}...`, 'info');
    printOS(os, settings);
  };

  // 🧧 Impressão via do cliente: só assina o mecânico
  const handlePrintOSClient = (os: WorkOrder) => {
    addToast(`Imprimindo via do cliente - OS #${os.osNumber}...`, 'info');
    printOS(os, settings, 'CLIENT');
  };

  // 🏬 Impressão via da oficina: só assina o cliente
  const handlePrintOSShop = (os: WorkOrder) => {
    addToast(`Imprimindo via da oficina - OS #${os.osNumber}...`, 'info');
    printOS(os, settings, 'SHOP');
  };

  const executePendingAction = () => {
    if (!pendingAction) return;

    if (pendingAction.type === 'DELETE_OS') {
      const os = pendingAction.data;
      setWorkOrders(p => p.filter(i => i.id !== os.id));
      if (os.financialId) setLedger(p => p.filter(e => e.id !== os.financialId));
      addToast('OS excluída.', 'info');
    }

    if (pendingAction.type === 'ARCHIVE_OS') {
      handleUpdateStatus(pendingAction.data.id, 'ARQUIVADO');
      addToast('OS Arquivada.', 'info');
    }

    if (pendingAction.type === 'FINISH_OS_FINANCIAL') {
      const os = pendingAction.data;
      console.log('💰 FINISH_OS_FINANCIAL:', os);

      setPendingInstallmentOS(os);
      setIsInstallmentChoiceOpen(true);
      setPendingAction(null);
      return;
    }

    if (pendingAction.type === 'RESTORE_FINANCIAL') {
      const os = pendingAction.data;
      console.log('🔙 RESTORE_FINANCIAL:', os);

      const financialEntry = ledger.find(e => e.id === os.financialId);

      if (financialEntry) {
        const groupToDelete = financialEntry.groupId || financialEntry.installmentGroupId;

        if (groupToDelete) {
          console.log(`🗑️ Removendo TODAS as parcelas do grupo: ${groupToDelete}`);
          const parcelsToRemove = ledger.filter(e =>
            e.groupId === groupToDelete || e.installmentGroupId === groupToDelete
          );
          console.log(`  Total de parcelas a remover: ${parcelsToRemove.length}`);

          setLedger(prev => prev.filter(e =>
            e.groupId !== groupToDelete && e.installmentGroupId !== groupToDelete
          ));

          addToast(`${parcelsToRemove.length} parcelas removidas.`, 'info');
        } else {
          console.log('💵 Removendo pagamento único');
          setLedger(prev => prev.filter(e => e.id !== os.financialId));
          addToast('Lançamento removido.', 'info');
        }
      } else {
        console.warn('⚠️ FinancialId não encontrado no ledger');
      }

      setWorkOrders(prev => prev.map(o =>
        o.id === os.id
          ? {
              ...o,
              status: 'EM_SERVICO' as OSStatus,
              financialId: undefined,
              paymentMethod: undefined,
              installmentConfig: undefined,
              paymentDate: undefined
            }
          : o
      ));

      addToast('OS reaberta.', 'success');
    }

    if (pendingAction.type === 'IMPORT_DATA') {
      const parsed = JSON.parse(pendingAction.content!);
      setLedger(parsed.ledger || []);
      setWorkOrders(parsed.workOrders || []);
      setClients(parsed.clients || []);
      setCatalogParts(parsed.catalogParts || []);
      setCatalogServices(parsed.catalogServices || []);
      setCatalogTechnicians(parsed.catalogTechnicians || []);
      if (parsed.settings) setSettings(parsed.settings);
      addToast('Dados importados!', 'success');
    }

    setPendingAction(null);
  };

  const handleInstallmentChoice = (wantsInstallment: boolean) => {
    if (!pendingInstallmentOS) return;

    if (wantsInstallment) {
      console.log('✅ Usuário escolheu PARCELAR');
      setInstallmentOS(pendingInstallmentOS);
      setIsInstallmentModalOpen(true);
    } else {
      console.log('❌ Usuário escolheu NÃO parcelar - pagamento único');
      const paymentDate = new Date().toISOString();
      const entry = createEntry(
        `Receita OS #${pendingInstallmentOS.osNumber} - ${pendingInstallmentOS.clientName}`,
        pendingInstallmentOS.total,
        'CREDIT',
        pendingInstallmentOS.createdAt,
        undefined,
        paymentDate
      );
      setLedger(prev => [entry, ...prev]);
      setWorkOrders(prev => prev.map(o =>
        o.id === pendingInstallmentOS.id
          ? {
              ...o,
              status: 'FINALIZADO' as OSStatus,
              financialId: entry.id,
              paymentDate: paymentDate
            }
          : o
      ));
      addToast('OS Finalizada!', 'success');
      setShowConfetti(true);
    }

    setPendingInstallmentOS(null);
  };

  useEffect(() => { document.documentElement.setAttribute('data-theme', currentTheme); }, [currentTheme]);
  useEffect(() => { if (showConfetti) setTimeout(() => setShowConfetti(false), 3000); }, [showConfetti]);

  useKeyboard('F2', () => {
    if (activeTab === 'OFICINA') {
      setEditingOS(null);
      setIsModalOpen(true);
    }
    addToast('Nova OS (F2)', 'info');
  });

  useKeyboard('Escape', () => {
    if (isModalOpen) setIsModalOpen(false);
    if (isEntryModalOpen) { setIsEntryModalOpen(false); setEditingEntry(null); }
    if (isExportModalOpen) setIsExportModalOpen(false);
    if (isChecklistOpen) setIsChecklistOpen(false);
    if (isDatabaseModalOpen) setIsDatabaseModalOpen(false);
    if (isInstallmentModalOpen) { setIsInstallmentModalOpen(false); setInstallmentOS(null); }
    if (isInstallmentChoiceOpen) { setIsInstallmentChoiceOpen(false); setPendingInstallmentOS(null); }
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
            {activeTab === 'FINANCEIRO' && <FinancialPage isLoading={isLoading} kpiData={finance.kpiData} chartDataFluxo={finance.chartFluxo} chartDataPie={finance.chartPie} ledger={finance.filteredLedger} Money={Money} onOpenExport={() => setIsExportModalOpen(true)} onOpenEntry={() => { setEditingEntry(null); setIsEntryModalOpen(true); }} onEditEntry={handleEditEntry} onDeleteEntry={handleRequestDeleteEntry} onTogglePayment={handleTogglePayment} selectedMonth={finance.selectedMonth} onMonthChange={finance.setSelectedMonth} viewMode={finance.viewMode} setViewMode={finance.setViewMode} filterType={finance.filterType} setFilterType={finance.setFilterType} />}
            {activeTab === 'OFICINA' && <WorkshopPage workOrders={workOrders} isLoading={isLoading} formatMoney={Money.format} onNewOS={() => { setEditingOS(null); setIsModalOpen(true); }} onStatusChange={handleUpdateStatus} kanbanActions={{ onRegress: (id) => { const os = workOrders.find(o => o.id === id); if (os) handleUpdateStatus(id, os.status === 'FINALIZADO' ? 'EM_SERVICO' : os.status === 'EM_SERVICO' ? 'APROVADO' : 'ORCAMENTO'); }, onAdvance: (id) => { const os = workOrders.find(o => o.id === id); if (os) handleUpdateStatus(id, os.status === 'ORCAMENTO' ? 'APROVADO' : os.status === 'APROVADO' ? 'EM_SERVICO' : 'FINALIZADO'); }, onEdit: (os) => { setEditingOS(os); setIsModalOpen(true); }, onChecklist: (os) => { setChecklistOS(os); setIsChecklistOpen(true); }, onPrint: handlePrintOS, onPrintClient: handlePrintOSClient, onPrintShop: handlePrintOSShop, onDelete: (os) => setPendingAction({ type: 'DELETE_OS', data: os }), onArchive: (os) => setPendingAction({ type: 'ARCHIVE_OS', data: os }), onRestore: (os) => handleUpdateStatus(os.id, 'ORCAMENTO'), onQuickFinish: (id) => handleUpdateStatus(id, 'FINALIZADO') }} />}
            {activeTab === 'PROCESSOS' && <ProcessPage workOrders={workOrders} onOpenNew={() => { setEditingOS(null); setIsModalOpen(true); }} onUpdateStatus={handleUpdateStatus} />}
            {activeTab === 'CLIENTES' && <CRMPage clients={clients} workOrders={workOrders} isLoading={isLoading} formatMoney={Money.format} onSaveClient={handleSaveClient} onOpenOS={handleOpenOSFromCRM} />}
            {activeTab === 'PECAS' && <PartsPage workOrders={workOrders} isLoading={isLoading} />}
            {activeTab === 'CONFIG' && <ConfigPage settings={settings} setSettings={setSettings} currentTheme={currentTheme} setCurrentTheme={setCurrentTheme} onBackup={handleGoogleDriveBackup} isBackuping={isBackuping} driveStatus={driveStatus} onImportData={handleImportData} onOpenDatabase={() => setIsDatabaseModalOpen(true)} />}
          </Suspense>
        </main>
      </div>

      <Suspense fallback={null}>
        {isModalOpen && <OSModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveOSModal} editingOS={editingOS} clients={clients} catalogParts={catalogParts} catalogServices={catalogServices} catalogTechnicians={catalogTechnicians} nextOSNumber={workOrders.length > 0 ? Math.max(...workOrders.map(o => o.osNumber)) + 1 : 1} isSaving={isSaving} formatMoney={Money.format} />}
        {isEntryModalOpen && <EntryModal isOpen={isEntryModalOpen} onClose={() => { setIsEntryModalOpen(false); setEditingEntry(null); }} onSave={handleSaveEntryModal} initialData={editingEntry} />}
        {isInstallmentModalOpen && installmentOS && <InstallmentModal isOpen={isInstallmentModalOpen} onClose={() => { setIsInstallmentModalOpen(false); setInstallmentOS(null); }} totalAmount={installmentOS.total} description={`OS #${installmentOS.osNumber} - ${installmentOS.clientName}`} onConfirm={handleInstallmentConfirm} />}
        {isDatabaseModalOpen && <DatabaseModal
          isOpen={isDatabaseModalOpen}
          onClose={() => setIsDatabaseModalOpen(false)}
          clients={clients}
          catalogParts={catalogParts}
          catalogServices={catalogServices}
          catalogTechnicians={catalogTechnicians}
          onSaveClient={handleSaveClient}
          onDeleteClient={(id) => setClients(p => p.filter(c => c.id !== id))}
          onSaveCatalogItem={handleSaveCatalogItem}
          onDeleteCatalogItem={(id, type) => type === 'part' ? setCatalogParts(p => p.filter(x => x.id !== id)) : setCatalogServices(p => p.filter(x => x.id !== id))}
          onSaveTechnician={handleSaveTechnician}
          onDeleteTechnician={(id) => setCatalogTechnicians(p => p.filter(t => t.id !== id))}
          formatMoney={Money.format}
        />}
        {isExportModalOpen && <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} ledger={ledger} workOrders={workOrders} defaultPath={settings.exportPath} Money={Money} SoundFX={{ success: () => addToast('Sucesso!', 'success'), error: () => addToast('Erro', 'error') }} />}

        {/* ✅ Issue #43: ChecklistModal com settings para impressão */}
        {isChecklistOpen && <ChecklistModal
          isOpen={isChecklistOpen}
          onClose={() => setIsChecklistOpen(false)}
          onSave={(data) => {
            if (checklistOS) setWorkOrders(p => p.map(o => o.id === checklistOS.id ? { ...o, checklist: data } : o));
            setIsChecklistOpen(false);
          }}
          os={checklistOS}
          settings={settings}
        />}

        {deleteModalInfo.isOpen && <DeleteConfirmationModal isOpen={deleteModalInfo.isOpen} onClose={() => setDeleteModalInfo({ isOpen: false, entry: null })} onConfirmSingle={confirmDeleteSingle} onConfirmGroup={confirmDeleteGroup} isGroup={!!deleteModalInfo.entry?.groupId} />}

        {isInstallmentChoiceOpen && pendingInstallmentOS && (
          <ChoiceModal
            isOpen={isInstallmentChoiceOpen}
            onClose={() => { setIsInstallmentChoiceOpen(false); setPendingInstallmentOS(null); }}
            onYes={() => handleInstallmentChoice(true)}
            onNo={() => handleInstallmentChoice(false)}
            title="Deseja Parcelar?"
            message={`Valor total: ${Money.format(pendingInstallmentOS.total)}\n\nEscolha como deseja receber o pagamento`}
            yesText="Parcelar"
            noText="Pagamento Único"
            yesIcon="💳"
            noIcon="💵"
            icon="💰"
          />
        )}

        {pendingAction && <ConfirmationModal isOpen={!!pendingAction} onClose={() => setPendingAction(null)} onConfirm={executePendingAction} title={pendingAction?.type === 'DELETE_OS' ? 'Excluir OS?' : pendingAction?.type === 'ARCHIVE_OS' ? 'Arquivar OS?' : pendingAction?.type === 'FINISH_OS_FINANCIAL' ? 'OS Finalizada' : pendingAction?.type === 'RESTORE_FINANCIAL' ? 'Reabrir OS?' : pendingAction?.type === 'IMPORT_DATA' ? 'Importar?' : 'Confirmar'} message={pendingAction?.type === 'DELETE_OS' ? 'Removerá a OS e lançamento financeiro.' : pendingAction?.type === 'ARCHIVE_OS' ? 'A OS sairá do quadro Kanban.' : pendingAction?.type === 'FINISH_OS_FINANCIAL' ? `Lançar ${Money.format(pendingAction.data?.total || 0)} nas Receitas?` : pendingAction?.type === 'RESTORE_FINANCIAL' ? 'Removerá o lançamento financeiro.' : pendingAction?.type === 'IMPORT_DATA' ? 'Substituir todos os dados?' : 'Tem certeza?'} confirmText={pendingAction?.type === 'DELETE_OS' ? 'Excluir' : pendingAction?.type === 'IMPORT_DATA' ? 'Substituir' : 'Confirmar'} confirmColor={pendingAction?.type === 'DELETE_OS' || pendingAction?.type === 'RESTORE_FINANCIAL' ? 'danger' : 'primary'} />}
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
