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
import { STATUS_LABELS } from './types';

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
import { Money, createEntry, updateWorkOrderData, learnClientData, learnCatalogItems } from './utils/helpers';
import { LedgerEntry, WorkOrder, Client, CatalogItem, OSStatus } from './types';

interface PendingAction {
  type: 'DELETE_OS' | 'ARCHIVE_OS' | 'FINISH_OS_FINANCIAL' | 'RESTORE_FINANCIAL' | 'IMPORT_DATA';
  data?: any;
  content?: string;
}

function AppContent() {
  const { ledger, setLedger, workOrders, setWorkOrders, clients, setClients, catalogParts, setCatalogParts, catalogServices, setCatalogServices, settings, setSettings, isLoading, isSaving } = useDatabase();
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

  const addToast = (message: string, type: ToastType = 'info') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    if (type === 'success') SoundFX.success();
    if (type === 'error') SoundFX.error();
  };

  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  const handleGoogleDriveBackup = async () => {
    if (isBackuping) return;
    
    if (!settings.googleApiKey || settings.googleApiKey.trim() === "") {
      addToast("⚠️ Configure a Google API Key nas configurações.", "error");
      return;
    }
    
    if (!settings.googleDriveToken || settings.googleDriveToken.trim() === "") {
      addToast("⚠️ Configure o Token de Acesso do Google Drive.", "error");
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

      await uploadToDrive(filename, content, settings.googleDriveToken, settings.googleApiKey);
      setDriveStatus('success');
      addToast("Backup salvo!", "success");
    } catch (e: any) {
      console.error("Erro:", e);
      setDriveStatus('error');
      addToast(e.message || "Erro no backup.", "error");
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
        data.createdAt,
        data.publicNotes
      );
      setWorkOrders(prev => prev.map(o => o.id === editingOS.id ? updated : o));
      
      if (updated.financialId) {
        setLedger(prev => prev.map(e => e.id === updated.financialId ? { ...e, effectiveDate: updated.createdAt, amount: updated.total, description: `Receita OS #${data.osNumber} - ${data.clientName}` } : e));
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
        createdAt: data.createdAt || new Date().toISOString(),
        publicNotes: data.publicNotes || ''
      };
      setWorkOrders(prev => [...prev, newOS]);
      addToast("Nova OS criada!", "success");
    }
    setIsModalOpen(false);
  };

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

    addToast(newPaymentDate ? '💵 Marcado como pago!' : '⌛ Marcado como pendente', 'info');
    SoundFX.pop();
  };

  const handleRequestDeleteEntry = (entry: LedgerEntry) => setDeleteModalInfo({ isOpen: true, entry });
  
  const confirmDeleteSingle = () => {
    if (deleteModalInfo.entry) finance.deleteEntry(deleteModalInfo.entry.id);
    addToast("Excluído.", "info");
    setDeleteModalInfo({ isOpen: false, entry: null });
  };
  
  const confirmDeleteGroup = () => {
    if (deleteModalInfo.entry?.groupId) finance.deleteGroup(deleteModalInfo.entry.groupId);
    addToast("Série excluída.", "info");
    setDeleteModalInfo({ isOpen: false, entry: null });
  };

  const handleSaveClient = (updatedClient: Client) => {
    const oldClient = clients.find(c => c.id === updatedClient.id);
    setClients(prev => prev.find(c => c.id === updatedClient.id) ? prev.map(c => c.id === updatedClient.id ? updatedClient : c) : [...prev, updatedClient]);
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
      setCatalogParts(prev => prev.find(p => p.id === updatedItem.id) ? prev.map(p => p.id === updatedItem.id ? updatedItem : p) : [...prev, updatedItem]);
    } else {
      oldItem = catalogServices.find(s => s.id === updatedItem.id);
      setCatalogServices(prev => prev.find(s => s.id === updatedItem.id) ? prev.map(s => s.id === updatedItem.id ? updatedItem : s) : [...prev, updatedItem]);
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
      console.log(`  Status atual: ${installmentOS.status}`);
      console.log(`  Novo status: FINALIZADO`);
      console.log(`  FinancialId: ${newEntries[0].id}`);
      console.log(`  📅 PaymentDate: ${new Date().toISOString()}`);
      
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
      
      addToast(`OS #${installmentOS.osNumber} finalizada!`, "success");
      setShowConfetti(true);
    } else {
      console.error('❌ installmentOS é NULL!');
    }
    
    addToast(`Parcelamento criado! ${config.installments}x`, "success");
    setIsInstallmentModalOpen(false);
    setInstallmentOS(null);
    
    console.log('🏁 ===== FIM PARCELAMENTO =====');
  };

  const handleOpenOSFromCRM = (os: WorkOrder) => {
    setEditingOS(os);
    setIsModalOpen(true);
    setActiveTab('OFICINA');
  };

  // 🖨️ SOLUÇÃO DEFINITIVA: Usa técnica de iframe (igual PartsPage.tsx)
  const handlePrintOS = (os: WorkOrder) => {
    console.log('🖨️ Iniciando impressão da OS #' + os.osNumber);

    const formatDate = (dateString: string) => {
      if (!dateString) return '-';
      return new Date(dateString).toLocaleDateString('pt-BR');
    };

    const formatMoney = (val: number) => {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val / 100);
    };

    const subtotalParts = os.parts.reduce((acc, item) => acc + item.price, 0);
    const subtotalServices = os.services.reduce((acc, item) => acc + item.price, 0);

    // Gera HTML completo como string
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>OS #${os.osNumber} - ${os.clientName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          
          body {
            font-family: 'Inter', Arial, sans-serif;
            padding: 20px;
            background: white;
            color: black;
            font-size: 11px;
          }

          .invoice-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 25px;
            padding-top: 20px;
          }

          .invoice-col { flex: 1; }
          .client-col { text-align: right; }
          
          .label-sm {
            font-size: 0.65rem;
            color: #888;
            letter-spacing: 1px;
            margin-bottom: 4px;
            font-weight: 700;
            text-transform: uppercase;
          }

          .company-name, .client-name {
            font-size: 1.1rem;
            font-weight: 800;
            margin: 0 0 4px 0;
            text-transform: uppercase;
            color: #000;
          }

          .invoice-col p {
            margin: 2px 0;
            font-size: 0.8rem;
            color: #333;
          }

          .invoice-logo-area {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            align-items: center;
            gap: 8px;
          }

          .invoice-main-title {
            font-size: 0.8rem;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin: 0;
            color: #000;
            text-align: center;
            line-height: 1;
          }

          .invoice-logo-circle {
            width: 50px;
            height: 50px;
            background-color: #222;
            color: #fff;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.4rem;
            font-weight: 800;
            letter-spacing: -1px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .divider {
            border: 0;
            border-top: 1px solid #ddd;
            margin: 15px 0;
          }

          .invoice-meta-grid {
            display: flex;
            justify-content: space-between;
            margin-bottom: 25px;
          }

          .meta-item {
            display: flex;
            flex-direction: column;
          }

          .meta-value {
            font-size: 1rem;
            font-weight: 600;
            margin-top: 4px;
            color: #000;
          }

          .meta-value.status-print {
            font-size: 0.8rem;
            text-transform: uppercase;
            border: 1px solid #000;
            padding: 2px 6px;
            border-radius: 4px;
          }

          .section-title {
            color: #8B5CF6;
            font-size: 0.7rem;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin: 20px 0 5px 0;
            border-bottom: 2px solid #8B5CF6;
            display: inline-block;
            padding-bottom: 2px;
          }

          .invoice-items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 5px;
          }

          .invoice-items-table th {
            padding: 6px 0;
            border-bottom: 1px solid #bbb;
            font-size: 0.7rem;
            color: #444;
            text-transform: uppercase;
            font-weight: 700;
            text-align: left;
          }

          .invoice-items-table td {
            padding: 6px 0;
            border-bottom: 1px solid #eee;
            font-size: 0.85rem;
            color: #111;
          }

          .text-right { text-align: right; }

          .subtotal-row {
            text-align: right;
            font-size: 0.85rem;
            font-weight: 600;
            color: #444;
            padding: 8px 0;
            display: flex;
            justify-content: flex-end;
            gap: 20px;
          }

          .subtotal-value {
            font-weight: 700;
            color: #000;
          }

          .invoice-total-block {
            display: flex;
            justify-content: flex-end;
            margin-top: 20px;
            padding-top: 15px;
            border-top: 2px solid #000;
          }

          .total-line { text-align: right; }

          .label-total {
            font-size: 0.9rem;
            letter-spacing: 1px;
            color: #8B5CF6;
            font-weight: 700;
            margin-right: 15px;
          }

          .value-total {
            font-weight: 900;
            color: #000;
            font-size: 1.8rem;
            line-height: 1;
          }

          .signature-area {
            display: flex;
            justify-content: space-between;
            margin-top: 40px;
            padding: 0 10px;
          }

          .signature-block {
            width: 40%;
            text-align: center;
          }

          .sign-line {
            border-top: 1px solid #000;
            margin-bottom: 5px;
            height: 1px;
            width: 100%;
          }

          .sign-name {
            display: block;
            font-size: 0.85rem;
            font-weight: 700;
            color: #000;
          }

          .sign-label {
            display: block;
            font-size: 0.6rem;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 2px;
          }

          .footer-text-block {
            text-align: center;
            border-top: 1px dashed #ddd;
            padding-top: 10px;
            margin-top: 20px;
          }

          .declaration-text {
            font-size: 0.65rem;
            color: #333;
            margin-bottom: 5px;
          }

          .thank-you-msg {
            font-size: 0.75rem;
            font-weight: 800;
            letter-spacing: 2px;
            text-transform: uppercase;
            color: #8B5CF6;
          }

          @page {
            size: A4;
            margin: 15mm;
          }
        </style>
      </head>
      <body>
        <header class="invoice-header">
          <div class="invoice-col supplier-col">
            <h4 class="label-sm">PRESTADOR DE SERVIÇO</h4>
            <h2 class="company-name">${settings.name || "NOME DA OFICINA"}</h2>
            <p>${settings.address || "Endereço não informado"}</p>
            <p>${settings.cnpj || "CNPJ não informado"}</p>
            ${settings.technician ? `<p>Téc. Resp: ${settings.technician}</p>` : ''}
          </div>

          <div class="invoice-logo-area">
            <h1 class="invoice-main-title">ORDEM DE SERVIÇO</h1>
            <div class="invoice-logo-circle">AM</div>
          </div>

          <div class="invoice-col client-col">
            <h4 class="label-sm">CLIENTE</h4>
            <h2 class="client-name">${os.clientName}</h2>
            <p>${os.clientPhone}</p>
            <div style="margin-top: 8px;">
              <p><strong>Veículo:</strong> ${os.vehicle}</p>
              <p><strong>KM:</strong> ${os.mileage}</p>
            </div>
          </div>
        </header>

        <hr class="divider" />

        <div class="invoice-meta-grid">
          <div class="meta-item">
            <span class="label-sm">NÚMERO OS</span>
            <span class="meta-value">#${os.osNumber}</span>
          </div>
          <div class="meta-item">
            <span class="label-sm">DATA EMISSÃO</span>
            <span class="meta-value">${formatDate(os.createdAt)}</span>
          </div>
          <div class="meta-item">
            <span class="label-sm">STATUS</span>
            <span class="meta-value status-print">${STATUS_LABELS[os.status]}</span>
          </div>
        </div>

        <hr class="divider" />

        <div class="table-section">
          <h3 class="section-title">PEÇAS E MATERIAIS</h3>
          <table class="invoice-items-table">
            <thead>
              <tr>
                <th style="width: 75%;">ITEM / DESCRIÇÃO</th>
                <th style="width: 25%;" class="text-right">VALOR</th>
              </tr>
            </thead>
            <tbody>
              ${os.parts.length === 0 ? '<tr><td colspan="2" style="font-style:italic; color:#999; padding: 15px 0">Nenhuma peça utilizada.</td></tr>' : os.parts.map(item => `
                <tr>
                  <td>${item.description}</td>
                  <td class="text-right">${formatMoney(item.price)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="subtotal-row">
            <span>Subtotal Peças:</span>
            <span class="subtotal-value">${formatMoney(subtotalParts)}</span>
          </div>
        </div>

        <div class="table-section" style="margin-top: 30px;">
          <h3 class="section-title">MÃO DE OBRA E SERVIÇOS</h3>
          <table class="invoice-items-table">
            <thead>
              <tr>
                <th style="width: 75%;">DESCRIÇÃO DO SERVIÇO</th>
                <th style="width: 25%;" class="text-right">VALOR</th>
              </tr>
            </thead>
            <tbody>
              ${os.services.length === 0 ? '<tr><td colspan="2" style="font-style:italic; color:#999; padding: 15px 0">Nenhum serviço registrado.</td></tr>' : os.services.map(item => `
                <tr>
                  <td>${item.description}</td>
                  <td class="text-right">${formatMoney(item.price)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="subtotal-row">
            <span>Subtotal Serviços:</span>
            <span class="subtotal-value">${formatMoney(subtotalServices)}</span>
          </div>
        </div>

        <div class="invoice-total-block">
          <div class="total-line">
            <span class="label-total">TOTAL GERAL</span>
            <span class="value-total">${formatMoney(os.total)}</span>
          </div>
        </div>

        ${os.publicNotes && os.publicNotes.trim() !== '' ? `
          <div class="table-section" style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;">
            <h3 class="section-title" style="margin-bottom: 5px;">OBSERVAÇÕES / GARANTIA</h3>
            <div style="font-size: 10pt; line-height: 1.4; white-space: pre-wrap; color: #333;">
              ${os.publicNotes}
            </div>
          </div>
        ` : ''}

        <div class="signature-area">
          <div class="signature-block">
            <div class="sign-line"></div>
            <span class="sign-name">${settings.name}</span>
            <span class="sign-label">Responsável Técnico</span>
          </div>
          <div class="signature-block">
            <div class="sign-line"></div>
            <span class="sign-name">${os.clientName}</span>
            <span class="sign-label">Cliente</span>
          </div>
        </div>

        <div class="footer-text-block">
          <p class="declaration-text">
            Declaro ter recebido os serviços e produtos acima descritos em perfeito estado.
          </p>
          <p class="thank-you-msg">
            OBRIGADO PELA PREFERÊNCIA!
          </p>
        </div>
      </body>
      </html>
    `;

    // Cria iframe invisível
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    // Escreve conteúdo no iframe
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(printContent);
      doc.close();

      // Aguarda carregar e imprime
      iframe.contentWindow?.focus();
      setTimeout(() => {
        console.log('🖨️ Disparando print() do iframe');
        iframe.contentWindow?.print();
        // Remove iframe após impressão
        setTimeout(() => {
          console.log('✅ Removendo iframe');
          document.body.removeChild(iframe);
        }, 100);
      }, 250);
    }
  };

  const executePendingAction = () => {
    if (!pendingAction) return;

    if (pendingAction.type === 'DELETE_OS') {
      const os = pendingAction.data;
      setWorkOrders(p => p.filter(i => i.id !== os.id));
      if (os.financialId) setLedger(p => p.filter(e => e.id !== os.financialId));
      addToast("OS excluída.", "info");
    }

    if (pendingAction.type === 'ARCHIVE_OS') {
      handleUpdateStatus(pendingAction.data.id, 'ARQUIVADO');
      addToast("OS Arquivada.", "info");
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
          parcelsToRemove.forEach(p => {
            console.log(`    - ${p.description}: ${Money.format(p.amount)}`);
          });
          
          setLedger(prev => prev.filter(e => 
            e.groupId !== groupToDelete && e.installmentGroupId !== groupToDelete
          ));
          
          addToast(`${parcelsToRemove.length} parcelas removidas.`, "info");
        } else {
          console.log('💵 Removendo pagamento único');
          setLedger(prev => prev.filter(e => e.id !== os.financialId));
          addToast("Lançamento removido.", "info");
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
      
      addToast("OS reaberta.", "success");
    }

    if (pendingAction.type === 'IMPORT_DATA') {
      const parsed = JSON.parse(pendingAction.content!);
      setLedger(parsed.ledger || []);
      setWorkOrders(parsed.workOrders || []);
      setClients(parsed.clients || []);
      setCatalogParts(parsed.catalogParts || []);
      setCatalogServices(parsed.catalogServices || []);
      if (parsed.settings) setSettings(parsed.settings);
      addToast("Dados importados!", "success");
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
      addToast("OS Finalizada!", "success");
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
    addToast("Nova OS (F2)", "info");
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
            {activeTab === 'OFICINA' && <WorkshopPage workOrders={workOrders} isLoading={isLoading} formatMoney={Money.format} onNewOS={() => { setEditingOS(null); setIsModalOpen(true); }} onStatusChange={handleUpdateStatus} kanbanActions={{ onRegress: (id) => { const os = workOrders.find(o => o.id === id); if (os) handleUpdateStatus(id, os.status === 'FINALIZADO' ? 'EM_SERVICO' : os.status === 'EM_SERVICO' ? 'APROVADO' : 'ORCAMENTO'); }, onAdvance: (id) => { const os = workOrders.find(o => o.id === id); if (os) handleUpdateStatus(id, os.status === 'ORCAMENTO' ? 'APROVADO' : os.status === 'APROVADO' ? 'EM_SERVICO' : 'FINALIZADO'); }, onEdit: (os) => { setEditingOS(os); setIsModalOpen(true); }, onChecklist: (os) => { setChecklistOS(os); setIsChecklistOpen(true); }, onPrint: handlePrintOS, onDelete: (os) => setPendingAction({ type: 'DELETE_OS', data: os }), onArchive: (os) => setPendingAction({ type: 'ARCHIVE_OS', data: os }), onRestore: (os) => handleUpdateStatus(os.id, 'ORCAMENTO'), onQuickFinish: (id) => handleUpdateStatus(id, 'FINALIZADO') }} />}
            {activeTab === 'PROCESSOS' && <ProcessPage workOrders={workOrders} onOpenNew={() => { setEditingOS(null); setIsModalOpen(true); }} onUpdateStatus={handleUpdateStatus} />}
            {activeTab === 'CLIENTES' && <CRMPage clients={clients} workOrders={workOrders} isLoading={isLoading} formatMoney={Money.format} onSaveClient={handleSaveClient} onOpenOS={handleOpenOSFromCRM} />}
            {activeTab === 'PECAS' && <PartsPage workOrders={workOrders} isLoading={isLoading} />}
            {activeTab === 'CONFIG' && <ConfigPage settings={settings} setSettings={setSettings} currentTheme={currentTheme} setCurrentTheme={setCurrentTheme} onBackup={handleGoogleDriveBackup} isBackuping={isBackuping} driveStatus={driveStatus} onImportData={handleImportData} onOpenDatabase={() => setIsDatabaseModalOpen(true)} />}
          </Suspense>
        </main>
      </div>

      <Suspense fallback={null}>
        {isModalOpen && <OSModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveOSModal} editingOS={editingOS} clients={clients} catalogParts={catalogParts} catalogServices={catalogServices} nextOSNumber={workOrders.length > 0 ? Math.max(...workOrders.map(o => o.osNumber)) + 1 : 1} isSaving={isSaving} formatMoney={Money.format} />}
        {isEntryModalOpen && <EntryModal isOpen={isEntryModalOpen} onClose={() => { setIsEntryModalOpen(false); setEditingEntry(null); }} onSave={handleSaveEntryModal} initialData={editingEntry} />}
        {isInstallmentModalOpen && installmentOS && <InstallmentModal isOpen={isInstallmentModalOpen} onClose={() => { setIsInstallmentModalOpen(false); setInstallmentOS(null); }} totalAmount={installmentOS.total} description={`OS #${installmentOS.osNumber} - ${installmentOS.clientName}`} onConfirm={handleInstallmentConfirm} />}
        {isDatabaseModalOpen && <DatabaseModal isOpen={isDatabaseModalOpen} onClose={() => setIsDatabaseModalOpen(false)} clients={clients} catalogParts={catalogParts} catalogServices={catalogServices} onSaveClient={handleSaveClient} onDeleteClient={(id) => setClients(p => p.filter(c => c.id !== id))} onSaveCatalogItem={handleSaveCatalogItem} onDeleteCatalogItem={(id, type) => type === 'part' ? setCatalogParts(p => p.filter(x => x.id !== id)) : setCatalogServices(p => p.filter(x => x.id !== id))} formatMoney={Money.format} />}
        {isExportModalOpen && <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} ledger={ledger} workOrders={workOrders} defaultPath={settings.exportPath} Money={Money} SoundFX={{ success: () => addToast("Sucesso!", "success"), error: () => addToast("Erro", "error") }} />}
        {isChecklistOpen && <ChecklistModal isOpen={isChecklistOpen} onClose={() => setIsChecklistOpen(false)} onSave={(data) => { if (checklistOS) setWorkOrders(p => p.map(o => o.id === checklistOS.id ? { ...o, checklist: data } : o)); setIsChecklistOpen(false); }} os={checklistOS} />}
        
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
