import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';

import { invoke } from '@tauri-apps/api/core';
import { DatabaseProvider, useDatabase, parseDatabase } from './context/DatabaseContext';
import { adoptSecrets, stripDbSecrets } from './utils/secrets';
import { CURRENT_SCHEMA_VERSION, countUnresolvedLinks, migrate } from './utils/migrations';
import { useFinance } from './hooks/useFinance';
import { useKeyboard } from './hooks/useKeyboard';
import { canTriggerNewOSShortcut } from './utils/shortcuts';
import { updateClientCascading, updateCatalogItemCascading, updateTechnicianCascading } from './services/cascadeService';
import { uploadToDrive } from './services/googleDrive';
import { Sidebar } from './components/Sidebar';
import { Confetti } from './components/ui/Confetti';
import type { ToastType } from './components/ui/ToastContainer';
import { ToastProvider, useToast } from './context/ToastContext';
import { Theme, applyTheme, readStoredTheme, writeStoredTheme } from './utils/theme';
import { LoadingSkeleton } from './components/ui/LoadingSkeleton';
import { printOS, PrintVariant } from './utils/printOS';
import { printServiceSummary } from './utils/printServiceSummary';
import { choiceToOptions, DEFAULT_SUMMARY_CHOICE, needsSummaryChoice, SummaryChoice } from './services/serviceSummaryView';
import type { ServiceSummaryOptions } from './services/serviceSummary';
import { markPrintedOnce, readHomeTab } from './utils/todayPrefs';

const FinancialPage = lazy(() => import('./pages/FinancialPage').then(m => ({ default: m.FinancialPage })));
const WorkshopPage = lazy(() => import('./pages/WorkshopPage').then(m => ({ default: m.WorkshopPage })));
const TodayPage = lazy(() => import('./pages/TodayPage').then(m => ({ default: m.TodayPage })));
const AgendaPage = lazy(() => import('./pages/AgendaPage').then(m => ({ default: m.AgendaPage })));
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
const ClientSummaryModal = lazy(() => import('./modals/ClientSummaryModal').then(m => ({ default: m.ClientSummaryModal })));
const SummaryChoiceModal = lazy(() => import('./modals/SummaryChoiceModal').then(m => ({ default: m.SummaryChoiceModal })));

import { SoundFX } from './utils/audio';
import {
  applyInstallmentToOS, buildInstallmentEntries, finalizeOSSingle, markOSFinalized,
  getRemainingAmount, reopenOS, restoreFinancial, statusChangeEffects,
  togglePayment,
} from './services/osFinanceService';
import { Money, updateWorkOrderData, generateId } from './utils/helpers';
import { trashDeletedOSPhotos, trashRemovedPhotos } from './services/photoCleanup';
import { resolveSavedPhotos } from './services/photoDraft';
import { clearPhotoUrlCache } from './services/photoStore';
import { prepareOSSave, ADVANCES_EXCEED_MESSAGE, advanceLockedMessage } from './services/osSave';
import { findAdvanceOwner, removeAllAdvances, sumAdvances } from './services/advances';
import { buildFinalizeMessage, buildInstallmentMessage } from './services/finalizeText';
import { linkClient, linkCatalogItems, linkTechnician, preferredClientId } from './utils/links';
import { toISOFromDateInput } from './utils/dates';
import { getTargetMargin } from './services/margin';
import { AppointmentAction, AppointmentInput, applyAppointmentAction, linkAppointmentToOS, makeAppointment, updateAppointment } from './services/agenda';
import { appointmentToOSDraft, OSDraftFromAppointment } from './services/schedule';
import type { AppointmentModalMode } from './modals/AppointmentModal';
import type { Appointment } from './types';
import { LedgerEntry, WorkOrder, Client, CatalogItem, OSStatus, Technician, InstallmentConfig, OSModalPayload } from './types';

type PendingAction =
  | { type: 'DELETE_OS' | 'ARCHIVE_OS' | 'FINISH_OS_FINANCIAL' | 'RESTORE_FINANCIAL'; data: WorkOrder }
  | { type: 'IMPORT_DATA'; content: string };

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
    appointments,
    setAppointments,
    auditLog,
    setAuditLog,
    settings,
    setSettings,
    isLoading,
    isSaving,
    readOnly,
    dbPath,
    setDbPath,
    getMachineName,
  } = useDatabase();

  const finance = useFinance();

  // Trocou de banco: as object URLs das fotos do banco anterior não valem mais.
  useEffect(() => () => clearPhotoUrlCache(), [dbPath]);

  // Tema por computador: começa do que está gravado (o index.html já aplicou o atributo antes do primeiro desenho).
  const [currentTheme, setCurrentThemeState] = useState<Theme>(() => readStoredTheme());
  const setCurrentTheme = useCallback((t: Theme) => { setCurrentThemeState(t); writeStoredTheme(t); }, []);
  const [activeTab, setActiveTab] = useState<'HOJE' | 'FINANCEIRO' | 'OFICINA' | 'AGENDA' | 'PROCESSOS' | 'CLIENTES' | 'PECAS' | 'CONFIG'>(() => readHomeTab());
  // Filtro inicial de Processos quando vindo do painel Hoje (Ver atrasadas).
  const [processOnlyLate, setProcessOnlyLate] = useState(false);
  // Fluxo Agenda -> Criar OS: agendamento de origem e rascunho (objeto estável: o OSModal reinicia o formulário se ele mudar).
  const [osFromAppointment, setOsFromAppointment] = useState<{ appointment: Appointment; draft: OSDraftFromAppointment } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  // Resumo do serviço: escolha pendente (só se a OS tem recomendações) e Modo cliente aberto.
  const [summaryChoice, setSummaryChoice] = useState<{ os: WorkOrder; mode: 'show' | 'print' } | null>(null);
  const [clientView, setClientView] = useState<{ os: WorkOrder; options: ServiceSummaryOptions } | null>(null);
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
  const { addToast: pushToast } = useToast();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  // Janela estreita (< 1100 px): o menu compacta sozinho; o botão alterna só nesta janela, sem mexer na escolha salva.
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1100);
  const [narrowExpanded, setNarrowExpanded] = useState(false);
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 1100);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const sidebarCollapsed = isNarrow ? !narrowExpanded : isSidebarCollapsed;

  useEffect(() => {
    try {
      const raw = localStorage.getItem('oficina.sidebarCollapsed');
      if (raw === 'true') setIsSidebarCollapsed(true);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('oficina.sidebarCollapsed', isSidebarCollapsed ? 'true' : 'false');
    } catch {}
  }, [isSidebarCollapsed]);

  const addToast = (message: string, type: ToastType = 'info') => {
    pushToast(message, type);
    if (type === 'success') SoundFX.success();
    if (type === 'error') SoundFX.error();
  };

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
      const fullDb = { ledger, workOrders, clients, catalogParts, catalogServices, catalogTechnicians, appointments, auditLog, settings };
      const content = JSON.stringify(stripDbSecrets(fullDb), null, 2); // sem token/API key
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
      const filename = `backup_oficina_${timestamp}.json`;

      await uploadToDrive(filename, content, settings.googleDriveToken, settings.googleApiKey);
      setDriveStatus('success');
      addToast('Backup salvo!', 'success');
    } catch (e) {
      setDriveStatus('error');
      addToast((e instanceof Error ? e.message : undefined) || 'Erro no backup.', 'error');
    } finally {
      setIsBackuping(false);
    }
  };

  const handleImportData = (content: string) => setPendingAction({ type: 'IMPORT_DATA', content });

  const handleUpdateStatus = (osId: string, newStatus: OSStatus) => {
    const os = workOrders.find(o => o.id === osId);
    if (!os || os.status === newStatus) return;

    const effect = statusChangeEffects(os, newStatus, new Date().toISOString());
    if (effect.kind === 'ask-finish') {
      setPendingAction({ type: 'FINISH_OS_FINANCIAL', data: os });
      return;
    } else if (effect.kind === 'ask-restore') {
      setPendingAction({ type: 'RESTORE_FINANCIAL', data: os });
      return;
    }

    if (effect.kind === 'update') {
      setWorkOrders(prev => prev.map(o => o.id === osId ? { ...o, ...effect.updates } : o));
    }

    SoundFX.pop();
  };

  const handleSaveOSModal = (data: OSModalPayload) => {
    const duplicate = workOrders.find(o => o.osNumber === data.osNumber && o.id !== editingOS?.id);
    if (duplicate && !confirm(`OS #${data.osNumber} duplicada. Continuar?`)) return;

    // Vínculos por id (plano 4.6): usa o ESTADO do render, como handleSaveClient. Os textos continuam gravados.
    const linkedClient = linkClient({
      clients,
      clientName: data.clientName,
      clientPhone: data.clientPhone,
      clientNotes: data.clientNotes || '',
      vehicle: data.vehicle,
      clientId: preferredClientId(editingOS, data.clientName, data.clientId),
      newId: generateId,
    });
    if (linkedClient.ambiguous) {
      addToast('Há mais de um cliente com esse nome. Escolha qual cliente na OS antes de salvar.', 'error');
      return;
    }
    const linkedParts = linkCatalogItems({ catalog: catalogParts, items: data.parts, newId: generateId });
    const linkedServices = linkCatalogItems({ catalog: catalogServices, items: data.services, newId: generateId });
    const technicianName = (data.technician || '').trim();
    const linkedTech = linkTechnician(catalogTechnicians, technicianName, generateId);
    const clientId = linkedClient.clientId;
    const vehicleId = linkedClient.vehicleId;
    const technicianId = linkedTech.technicianId;
    const osParts = linkedParts.items;
    const osServices = linkedServices.items;

    const machine = getMachineName();
    const applyLinks = () => {
      setClients(linkedClient.clients);
      setCatalogParts(linkedParts.catalog);
      setCatalogServices(linkedServices.catalog);
      if (technicianName) setCatalogTechnicians(linkedTech.technicians);
    };

    if (editingOS) {
      const updatedBase = updateWorkOrderData(
        editingOS,
        data.osNumber,
        data.vehicle,
        data.clientName,
        data.clientPhone,
        data.mileage,
        osParts,
        osServices,
        data.createdAt,
        data.publicNotes,
      );

      // clientId/vehicleId/technicianId/expectedDate sempre regravados (expectedDate vazio limpa a previsão): updateWorkOrderData preserva os campos de `original`.
      // Fotos: a lista do rascunho do modal é a verdade (sem fotos, o campo some). Sem `data.photos` mantém as da OS.
      const { photos: keptPhotos, ...baseSemFotos } = updatedBase;
      const newPhotos = resolveSavedPhotos(keptPhotos, data.photos);
      const base: WorkOrder = { ...baseSemFotos, ...(newPhotos ? { photos: newPhotos } : {}), technician: technicianName || undefined, clientId, vehicleId, technicianId, expectedDate: data.expectedDate };
      // Adiantamentos, lançamentos e auditoria numa só conta pura; com erro nada é gravado (nem vínculos de cliente/catálogo).
      const saved = prepareOSSave({ base, previous: editingOS, drafts: data.advances, ledger, machine });
      if (!saved.ok) {
        addToast(saved.error, 'error');
        return;
      }
      applyLinks();
      setLedger(saved.ledger);
      if (saved.events.length) setAuditLog(prev => [...prev, ...saved.events]);
      setWorkOrders(prev => prev.map(o => o.id === editingOS.id ? saved.os : o));
      if (!readOnly) void trashRemovedPhotos(dbPath, editingOS.id, editingOS.photos, newPhotos);
      addToast('OS atualizada!', 'success');
      if (saved.exceedsTotal) addToast(ADVANCES_EXCEED_MESSAGE, 'info');
    } else {
      const newOSPhotos = resolveSavedPhotos(undefined, data.photos);
      const newOS: WorkOrder = {
        id: data.id ?? generateId(),
        osNumber: data.osNumber,
        vehicle: data.vehicle,
        clientId,
        vehicleId,
        technicianId,
        expectedDate: data.expectedDate,
        clientName: data.clientName,
        clientPhone: data.clientPhone,
        mileage: data.mileage,
        status: 'ORCAMENTO' as OSStatus,
        parts: osParts,
        services: osServices,
        total: osParts.reduce((a, b) => a + b.price, 0) + osServices.reduce((a, b) => a + b.price, 0),
        createdAt: data.createdAt ? toISOFromDateInput(data.createdAt) : new Date().toISOString(),
        publicNotes: data.publicNotes || '',
        technician: technicianName || undefined,
        ...(newOSPhotos ? { photos: newOSPhotos } : {}),
      };
      const saved = prepareOSSave({ base: newOS, drafts: data.advances, ledger, machine });
      if (!saved.ok) {
        addToast(saved.error, 'error');
        return;
      }
      applyLinks();
      setLedger(saved.ledger);
      if (saved.events.length) setAuditLog(prev => [...prev, ...saved.events]);
      setWorkOrders(prev => [...prev, saved.os]);
      if (osFromAppointment) {
        const originId = osFromAppointment.appointment.id;
        setAppointments(prev => prev.map(a => a.id === originId ? linkAppointmentToOS(a, saved.os) : a));
        setOsFromAppointment(null);
      }
      addToast('Nova OS criada!', 'success');
      if (saved.exceedsTotal) addToast(ADVANCES_EXCEED_MESSAGE, 'info');
    }
    setIsModalOpen(false);
  };

  // ---------- Agenda ----------
  const handleSaveAppointment = (input: AppointmentInput, editing: Appointment | null, mode: AppointmentModalMode) => {
    try {
      if (!editing) {
        const created = makeAppointment({ ...input, newId: generateId(), now: new Date() });
        setAppointments(prev => [...prev, created]);
        addToast('Agendamento criado.', 'success');
      } else {
        let updated = updateAppointment(editing, input);
        if (mode === 'REAGENDAR') updated = applyAppointmentAction(updated, 'REAGENDAR', { date: input.date, time: input.time });
        setAppointments(prev => prev.map(a => a.id === editing.id ? updated : a));
        addToast(mode === 'REAGENDAR' ? 'Agendamento reagendado.' : 'Agendamento atualizado.', 'success');
      }
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Não foi possível salvar o agendamento.', 'error');
    }
  };

  const handleAppointmentAction = (id: string, action: Exclude<AppointmentAction, 'REAGENDAR'>) => {
    const current = appointments.find(a => a.id === id);
    if (!current) return;
    try {
      const updated = applyAppointmentAction(current, action);
      setAppointments(prev => prev.map(a => a.id === id ? updated : a));
      addToast(
        action === 'COMPARECEU' ? 'Marcado como compareceu.' : action === 'FALTOU' ? 'Marcado como faltou.' : 'Agendamento cancelado.',
        'info'
      );
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Ação inválida.', 'error');
    }
  };

  const handleDeleteAppointment = (id: string) => {
    setAppointments(prev => prev.filter(a => a.id !== id));
    addToast('Agendamento excluído.', 'info');
  };

  const handleCreateOSFromAppointment = (appointment: Appointment) => {
    setEditingOS(null);
    setOsFromAppointment({ appointment, draft: appointmentToOSDraft(appointment) });
    setIsModalOpen(true);
  };

  const handleSaveEntryModal = (desc: string, val: number, type: 'CREDIT' | 'DEBIT', dateStr: string, recurrence: 'SINGLE' | 'INSTALLMENT' | 'RECURRING', count: number) => {
    const absVal = Math.abs(val);
    if (editingEntry) {
      finance.updateEntry({ ...editingEntry, description: desc, amount: Money.fromFloat(absVal), type, effectiveDate: toISOFromDateInput(dateStr) });
      addToast('Lançamento atualizado.', 'success');
      setEditingEntry(null);
    } else {
      const createdCount = finance.addEntryWithRecurrence(desc, val, type, dateStr, recurrence, count);
      addToast(createdCount > 1 ? `${createdCount} lançamentos gerados!` : 'Lançamento registrado.', 'success');
    }
    setIsEntryModalOpen(false);
  };

  // Lançamento de adiantamento é travado fora da OS (edição só pela janela da OS).
  const refuseIfAdvance = (entryId: string): boolean => {
    const owner = findAdvanceOwner(workOrders, entryId);
    if (!owner) return false;
    addToast(advanceLockedMessage(owner.osNumber), 'error');
    return true;
  };

  const handleEditEntry = (id: string) => {
    if (refuseIfAdvance(id)) return;
    const linkedOS = workOrders.find(o => o.financialId === id);
    if (linkedOS) {
      if (confirm(`Este lançamento pertence à OS #${linkedOS.osNumber}.
Abrir OS?`)) {
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
    if (refuseIfAdvance(entryId)) return;
    const result = togglePayment(ledger, workOrders, entryId, new Date().toISOString());
    if (!result) return;

    setLedger(result.ledger);
    setWorkOrders(result.workOrders);

    if (result.osEffect) {
      addToast(
        result.osEffect.kind === 'finalized'
          ? `OS #${result.osEffect.osNumber} finalizada: todas as parcelas pagas`
          : `OS #${result.osEffect.osNumber} voltou a Aguardando Pagamento: há parcela pendente`,
        'info'
      );
    } else {
      addToast(result.paid ? '💵 Marcado como pago!' : '⏳ Marcado como pendente', 'info');
    }
    SoundFX.pop();
  };

  const handleRequestDeleteEntry = (entry: LedgerEntry) => {
    if (refuseIfAdvance(entry.id)) return;
    setDeleteModalInfo({ isOpen: true, entry });
  };

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
    const { newWorkOrders, newLedger, newAppointments, hasChanges } = updateClientCascading(oldClient, updatedClient, workOrders, ledger, clients, appointments);
    if (hasChanges) {
      setWorkOrders(newWorkOrders);
      setLedger(newLedger);
      setAppointments(newAppointments);
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
    const { newWorkOrders, hasChanges } = updateCatalogItemCascading(oldItem, updatedItem, workOrders, type === 'part' ? catalogParts : catalogServices, type);
    if (hasChanges) {
      setWorkOrders(newWorkOrders);
      addToast('Atualizado em cascata!', 'success');
    } else {
      addToast('Salvo!', 'success');
    }
  };

  const handleSaveTechnician = (tech: Technician) => {
    setCatalogTechnicians(prev =>
      prev.find(t => t.id === tech.id)
        ? prev.map(t => t.id === tech.id ? tech : t)
        : [...prev, tech]
    );
    const oldTech = catalogTechnicians.find(t => t.id === tech.id);
    const { newWorkOrders, hasChanges } = updateTechnicianCascading(oldTech, tech, workOrders, catalogTechnicians);
    if (hasChanges) {
      setWorkOrders(newWorkOrders);
      addToast('Atualizado em cascata!', 'success');
    } else {
      addToast('Técnico salvo!', 'success');
    }
  };

  const handleInstallmentConfirm = (config: InstallmentConfig) => {
    const newEntries = buildInstallmentEntries(config);
    if (newEntries.length === 0) { // restante 0 ou sem parcelas: nada a lançar
      setIsInstallmentModalOpen(false);
      setInstallmentOS(null);
      return;
    }

    setLedger(prev => [...newEntries, ...prev]);

    if (installmentOS) {
      setWorkOrders(prev => prev.map(o =>
        o.id === installmentOS.id
          ? applyInstallmentToOS(o, config, newEntries[0].id)
          : o
      ));

      addToast(`OS #${installmentOS.osNumber} aguardando pagamento`, 'success');
      setShowConfetti(true);
    }

    addToast(`Parcelamento criado! ${config.installments}x`, 'success');
    setIsInstallmentModalOpen(false);
    setInstallmentOS(null);
  };

  const handleOpenOSFromCRM = (os: WorkOrder) => {
    setEditingOS(os);
    setIsModalOpen(true);
  };

  // `variant` ausente = via geral (as duas assinaturas).
  const handlePrintOS = (os: WorkOrder, variant?: PrintVariant) => {
    const viaText = variant === 'CLIENT' ? 'via do cliente - ' : variant === 'SHOP' ? 'via da oficina - ' : '';
    addToast(`Imprimindo ${viaText}OS #${os.osNumber}...`, 'info');
    markPrintedOnce();
    // printOS (outra rodada) ainda lê advanceAmount: repassa a soma dos adiantamentos v4 até a impressão ser atualizada.
    const advanced = sumAdvances(os);
    printOS(advanced > 0 ? { ...os, advanceAmount: advanced } : os, settings, variant);
  };

  // Elemento que abriu a escolha/Modo cliente (botão "Mais"): o menu já fechou quando a janela monta,
  // então o useFocusTrap sozinho não saberia para onde devolver o foco.
  const summaryOriginRef = useRef<HTMLElement | null>(null);
  const restoreSummaryFocus = () => {
    const el = summaryOriginRef.current;
    summaryOriginRef.current = null;
    if (el) setTimeout(() => { if (el.isConnected) el.focus(); }, 0);
  };

  const runSummary = (os: WorkOrder, mode: 'show' | 'print', choice: SummaryChoice) => {
    const options = choiceToOptions(choice);
    if (mode === 'show') {
      setClientView({ os, options });
      return;
    }
    addToast(`Imprimindo resumo da OS #${os.osNumber}...`, 'info');
    printServiceSummary(os, settings, options);
    restoreSummaryFocus();
  };

  // Sem recomendações a incluir, pula a pergunta e gera direto.
  const requestSummary = (os: WorkOrder, mode: 'show' | 'print', origin?: HTMLElement | null) => {
    summaryOriginRef.current = origin ?? null;
    if (needsSummaryChoice(os)) setSummaryChoice({ os, mode });
    else runSummary(os, mode, DEFAULT_SUMMARY_CHOICE);
  };

  // Ações do Kanban estáveis: o quadro não re-renderiza a cada toast/filtro/salvamento.
  // Os callbacks leem sempre a versão mais recente dos handlers/estado via ref.
  const kanbanRef = useRef({ workOrders, handleUpdateStatus, handlePrintOS, requestSummary });
  // Atualizado após o commit do render (um render descartado não deixa handlers de estado não confirmado).
  useLayoutEffect(() => {
    kanbanRef.current = { workOrders, handleUpdateStatus, handlePrintOS, requestSummary };
  });

  const kanbanStatusChange = useCallback(
    (id: string, status: OSStatus) => kanbanRef.current.handleUpdateStatus(id, status),
    []
  );

  const kanbanActions = useMemo(() => ({
    onRegress: (id: string) => {
      const os = kanbanRef.current.workOrders.find(o => o.id === id);
      if (!os) return;
      const nextStatus: OSStatus =
        os.status === 'FINALIZADO'
          ? 'AGUARDANDO_PAGAMENTO'
          : os.status === 'AGUARDANDO_PAGAMENTO'
          ? 'EM_SERVICO'
          : os.status === 'EM_SERVICO'
          ? 'APROVADO'
          : 'ORCAMENTO';
      kanbanRef.current.handleUpdateStatus(id, nextStatus);
    },
    onAdvance: (id: string) => {
      const os = kanbanRef.current.workOrders.find(o => o.id === id);
      if (!os) return;
      const nextStatus: OSStatus =
        os.status === 'ORCAMENTO'
          ? 'APROVADO'
          : os.status === 'APROVADO'
          ? 'EM_SERVICO'
          : os.status === 'EM_SERVICO'
          ? 'AGUARDANDO_PAGAMENTO'
          : 'FINALIZADO';
      kanbanRef.current.handleUpdateStatus(id, nextStatus);
    },
    onEdit: (os: WorkOrder) => {
      setEditingOS(os);
      setIsModalOpen(true);
    },
    onChecklist: (os: WorkOrder) => {
      setChecklistOS(os);
      setIsChecklistOpen(true);
    },
    onPrint: (os: WorkOrder) => kanbanRef.current.handlePrintOS(os),
    onPrintClient: (os: WorkOrder) => kanbanRef.current.handlePrintOS(os, 'CLIENT'),
    onPrintShop: (os: WorkOrder) => kanbanRef.current.handlePrintOS(os, 'SHOP'),
    onShowClient: (os: WorkOrder, origin?: HTMLElement | null) => kanbanRef.current.requestSummary(os, 'show', origin),
    onPrintSummary: (os: WorkOrder, origin?: HTMLElement | null) => kanbanRef.current.requestSummary(os, 'print', origin),
    onDelete: (os: WorkOrder) => setPendingAction({ type: 'DELETE_OS', data: os }),
    onArchive: (os: WorkOrder) => setPendingAction({ type: 'ARCHIVE_OS', data: os }),
    onRestore: (os: WorkOrder) => kanbanRef.current.handleUpdateStatus(os.id, 'ORCAMENTO'),
    onQuickFinish: (id: string) => kanbanRef.current.handleUpdateStatus(id, 'FINALIZADO'),
  }), []);

  // Importa um backup: valida, migra (com backup do arquivo original) e só então troca os dados.
  const importBackup = async (content: string) => {
    if (readOnly) {
      addToast('O banco está aberto somente para leitura. Atualize o OficinaPro para importar.', 'error');
      return;
    }
    let result: ReturnType<typeof migrate>;
    try {
      result = migrate(parseDatabase(content, settings));
    } catch (e) {
      addToast(`Arquivo de backup inválido. Nada foi alterado. ${e instanceof Error ? e.message : ''}`.trim(), 'error');
      return;
    }
    const { db, from, changed } = result;
    if (from > CURRENT_SCHEMA_VERSION) {
      addToast('Este backup foi salvo por uma versão mais nova do OficinaPro. Atualize o app para importá-lo. Nada foi alterado.', 'error');
      return;
    }
    if (changed) {
      try {
        const bk = await invoke<{ success: boolean; message: string }>('backup_pre_migration', { content, fromVersion: from });
        if (!bk?.success) throw new Error(bk?.message || 'sem resposta');
      } catch (e) {
        addToast(`Não foi possível guardar o backup antes de atualizar o formato (${e instanceof Error ? e.message : String(e)}). Nada foi alterado.`, 'error');
        return;
      }
    }
    setLedger(db.ledger);
    setWorkOrders(db.workOrders);
    setClients(db.clients);
    setCatalogParts(db.catalogParts);
    setCatalogServices(db.catalogServices);
    setCatalogTechnicians(db.catalogTechnicians);
    setAppointments(db.appointments);
    setAuditLog(db.auditLog);
    setSettings(adoptSecrets(db.settings)); // segredos do backup só entram se o local estiver vazio
    const semCliente = changed ? countUnresolvedLinks(db).osSemCliente : 0;
    const aviso = semCliente > 0
      ? ` ${semCliente} ${semCliente === 1 ? 'OS ficou sem cliente vinculado e segue' : 'OS ficaram sem cliente vinculado e seguem'} funcionando pelo nome.`
      : '';
    addToast(changed ? `Dados importados e atualizados para o formato v${CURRENT_SCHEMA_VERSION}!${aviso}` : 'Dados importados!', 'success');
  };

  const executePendingAction = () => {
    if (!pendingAction) return;

    if (pendingAction.type === 'DELETE_OS') {
      const os = pendingAction.data;
      setWorkOrders(p => p.filter(i => i.id !== os.id));
      if (os.financialId) setLedger(p => p.filter(e => e.id !== os.financialId));
      const removed = removeAllAdvances({ os, ledger, machine: getMachineName() });
      if (removed.ledger !== ledger) setLedger(p => p.filter(e => removed.ledger.some(r => r.id === e.id)));
      if (removed.events.length) setAuditLog(p => [...p, ...removed.events]);
      if (!readOnly) void trashDeletedOSPhotos(dbPath, os);
      addToast('OS excluída.', 'info');
    }

    if (pendingAction.type === 'ARCHIVE_OS') {
      handleUpdateStatus(pendingAction.data.id, 'ARQUIVADO');
      addToast('OS Arquivada.', 'info');
    }

    if (pendingAction.type === 'FINISH_OS_FINANCIAL') {
      const os = pendingAction.data;

      setPendingInstallmentOS(os);
      setIsInstallmentChoiceOpen(true);
      setPendingAction(null);
      return;
    }

    if (pendingAction.type === 'RESTORE_FINANCIAL') {
      const os = pendingAction.data;

      const restored = restoreFinancial(ledger, os);

      if (restored.removedGroup) {
        setLedger(restored.ledger);
        addToast(`${restored.removedCount} parcelas removidas.`, 'info');
      } else if (restored.removedCount > 0) {
        setLedger(restored.ledger);
        addToast('Lançamento removido.', 'info');
      }

      setWorkOrders(prev => prev.map(o => o.id === os.id ? reopenOS(o) : o));

      addToast('OS reaberta.', 'success');
    }

    if (pendingAction.type === 'IMPORT_DATA') {
      void importBackup(pendingAction.content);
    }

    setPendingAction(null);
  };

  const handleInstallmentChoice = (wantsInstallment: boolean) => {
    if (!pendingInstallmentOS) return;

    if (wantsInstallment) {
      setInstallmentOS(pendingInstallmentOS);
      setIsInstallmentModalOpen(true);
    } else {
      const { entry, os: finalizedOS } = finalizeOSSingle(pendingInstallmentOS);
      if (entry) setLedger(prev => [entry, ...prev]);
      setWorkOrders(prev => prev.map(o =>
        o.id === pendingInstallmentOS.id
          ? markOSFinalized(o, entry?.id, finalizedOS.paymentDate!)
          : o
      ));
      addToast('OS Finalizada!', 'success');
      setShowConfetti(true);
    }

    setPendingInstallmentOS(null);
  };

  useEffect(() => { applyTheme(currentTheme); }, [currentTheme]);
  // Fechar o modal da OS (salvar, cancelar ou Esc) encerra o fluxo Agenda -> Criar OS; cancelar não altera o agendamento.
  useEffect(() => { if (!isModalOpen) setOsFromAppointment(null); }, [isModalOpen]);
  useEffect(() => { if (showConfetti) setTimeout(() => setShowConfetti(false), 3000); }, [showConfetti]);

  // F2: de qualquer aba leva à Oficina e abre Nova OS; ignora campo de texto em foco e janela modal aberta.
  useKeyboard('F2', (e) => {
    const hasOpenModal = isModalOpen || isEntryModalOpen || isExportModalOpen || isChecklistOpen || isDatabaseModalOpen
      || isInstallmentModalOpen || isInstallmentChoiceOpen || deleteModalInfo.isOpen || !!pendingAction
      || document.querySelector('.modal-overlay, [role="alertdialog"], [aria-modal="true"]') !== null;
    if (!canTriggerNewOSShortcut(e.target as HTMLElement | null, hasOpenModal)) return;
    setActiveTab('OFICINA');
    setEditingOS(null);
    setIsModalOpen(true);
    addToast('Nova OS (F2)', 'info');
  });

  useKeyboard('Escape', () => {
    // OSModal, EntryModal, ChecklistModal e DatabaseModal tratam o próprio Esc (useDirtyGuard: perguntam antes de descartar).
    if (isExportModalOpen) setIsExportModalOpen(false);
    if (isInstallmentModalOpen) { setIsInstallmentModalOpen(false); setInstallmentOS(null); }
    if (isInstallmentChoiceOpen) { setIsInstallmentChoiceOpen(false); setPendingInstallmentOS(null); }
    if (deleteModalInfo.isOpen) setDeleteModalInfo({ isOpen: false, entry: null });
    if (pendingAction) setPendingAction(null);
  });

  return (
    <>
      {showConfetti && <Confetti />}

      <div className="app-container">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => (isNarrow ? setNarrowExpanded(prev => !prev) : setIsSidebarCollapsed(prev => !prev))}
        />

        <main className="main-content">
          <Suspense fallback={<LoadingSkeleton type="page" />}>
            {activeTab === 'HOJE' && (
              <TodayPage
                workOrders={workOrders}
                appointments={appointments}
                ledger={ledger}
                clients={clients}
                settings={settings}
                formatMoney={Money.format}
                onNewOS={() => { setEditingOS(null); setIsModalOpen(true); }}
                onSaveAppointment={input => handleSaveAppointment(input, null, 'NOVO')}
                onCreateOSFromAppointment={handleCreateOSFromAppointment}
                onOpenOS={os => { setEditingOS(os); setIsModalOpen(true); }}
                onGoProcesses={(onlyLate) => { setProcessOnlyLate(!!onlyLate); setActiveTab('PROCESSOS'); }}
                onGoAgenda={() => setActiveTab('AGENDA')}
                onGoFinance={() => setActiveTab('FINANCEIRO')}
                onGoConfig={() => setActiveTab('CONFIG')}
                onGoClients={() => setActiveTab('CLIENTES')}
              />
            )}

            {activeTab === 'FINANCEIRO' && (
              <FinancialPage
                isLoading={isLoading}
                kpiData={finance.kpiData}
                chartDataFluxo={finance.chartFluxo}
                chartDataPie={finance.chartPie}
                ledger={finance.filteredLedger}
                allLedger={ledger}
                Money={Money}
                onOpenExport={() => setIsExportModalOpen(true)}
                onOpenEntry={() => {
                  setEditingEntry(null);
                  setIsEntryModalOpen(true);
                }}
                onEditEntry={handleEditEntry}
                onDeleteEntry={handleRequestDeleteEntry}
                onOpenOS={os => { setEditingOS(os); setIsModalOpen(true); }}
                onTogglePayment={handleTogglePayment}
                selectedMonth={finance.selectedMonth}
                onMonthChange={finance.setSelectedMonth}
                viewMode={finance.viewMode}
                setViewMode={finance.setViewMode}
                filterType={finance.filterType}
                setFilterType={finance.setFilterType}
                workOrders={workOrders}
                settings={settings}
                catalogParts={catalogParts}
                catalogServices={catalogServices}
              />
            )}

            {activeTab === 'OFICINA' && (
              <WorkshopPage
                workOrders={workOrders}
                isLoading={isLoading}
                formatMoney={Money.format}
                targetMargin={getTargetMargin(settings)}
                showMargin={settings.showMarginOnBoard === true}
                onNewOS={() => {
                  setEditingOS(null);
                  setIsModalOpen(true);
                }}
                onStatusChange={kanbanStatusChange}
                kanbanActions={kanbanActions}
              />
            )}

            {activeTab === 'AGENDA' && (
              <AgendaPage
                appointments={appointments}
                workOrders={workOrders}
                clients={clients}
                onSave={handleSaveAppointment}
                onAction={handleAppointmentAction}
                onDelete={handleDeleteAppointment}
                onCreateOS={handleCreateOSFromAppointment}
              />
            )}

            {activeTab === 'PROCESSOS' && (
              <ProcessPage
                workOrders={workOrders}
                onOpenNew={() => {
                  setEditingOS(null);
                  setIsModalOpen(true);
                }}
                onUpdateStatus={kanbanStatusChange}
                onEdit={kanbanActions.onEdit}
                initialOnlyLate={processOnlyLate}
              />
            )}

            {activeTab === 'CLIENTES' && (
              <CRMPage
                clients={clients}
                workOrders={workOrders}
                ledger={ledger}
                isLoading={isLoading}
                formatMoney={Money.format}
                onSaveClient={handleSaveClient}
                onOpenOS={handleOpenOSFromCRM}
              />
            )}

            {activeTab === 'PECAS' && (
              <PartsPage
                workOrders={workOrders}
                isLoading={isLoading}
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
                dbPath={dbPath}
                setDbPath={setDbPath}
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
            draft={editingOS ? undefined : osFromAppointment?.draft}
            clients={clients}
            catalogParts={catalogParts}
            catalogServices={catalogServices}
            catalogTechnicians={catalogTechnicians}
            nextOSNumber={
              workOrders.length > 0
                ? Math.max(...workOrders.map(o => o.osNumber)) + 1
                : 1
            }
            isSaving={isSaving}
            formatMoney={Money.format}
            targetMargin={getTargetMargin(settings)}
            workOrders={workOrders}
          />
        )}

        {isEntryModalOpen && (
          <EntryModal
            isOpen={isEntryModalOpen}
            onClose={() => {
              setIsEntryModalOpen(false);
              setEditingEntry(null);
            }}
            onSave={handleSaveEntryModal}
            initialData={editingEntry}
          />
        )}

        {isInstallmentModalOpen && installmentOS && (
          <InstallmentModal
            isOpen={isInstallmentModalOpen}
            onClose={() => {
              setIsInstallmentModalOpen(false);
              setInstallmentOS(null);
            }}
            totalAmount={getRemainingAmount(installmentOS)}
            description={`OS #${installmentOS.osNumber} - ${installmentOS.clientName}`}
            onConfirm={handleInstallmentConfirm}
          />
        )}

        {isDatabaseModalOpen && (
          <DatabaseModal
            isOpen={isDatabaseModalOpen}
            onClose={() => setIsDatabaseModalOpen(false)}
            clients={clients}
            workOrders={workOrders}
            catalogParts={catalogParts}
            catalogServices={catalogServices}
            catalogTechnicians={catalogTechnicians}
            onSaveClient={handleSaveClient}
            onDeleteClient={(id) => setClients(p => p.filter(c => c.id !== id))}
            onSaveCatalogItem={handleSaveCatalogItem}
            onDeleteCatalogItem={(id, type) =>
              type === 'part'
                ? setCatalogParts(p => p.filter(x => x.id !== id))
                : setCatalogServices(p => p.filter(x => x.id !== id))
            }
            onSaveTechnician={handleSaveTechnician}
            onDeleteTechnician={(id) =>
              setCatalogTechnicians(p => p.filter(t => t.id !== id))
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
              success: () => addToast('Sucesso!', 'success'),
              error: () => addToast('Erro', 'error'),
            }}
          />
        )}

        {isChecklistOpen && (
          <ChecklistModal
            isOpen={isChecklistOpen}
            onClose={() => setIsChecklistOpen(false)}
            onSave={(data) => {
              if (checklistOS) {
                setWorkOrders(p =>
                  p.map(o => (o.id === checklistOS.id ? { ...o, checklist: data } : o))
                );
              }
              setIsChecklistOpen(false);
            }}
            os={checklistOS}
            settings={settings}
          />
        )}

        {summaryChoice && (
          <SummaryChoiceModal
            isOpen
            mode={summaryChoice.mode}
            onClose={() => { setSummaryChoice(null); restoreSummaryFocus(); }}
            onConfirm={(choice) => {
              const { os, mode } = summaryChoice;
              setSummaryChoice(null);
              runSummary(os, mode, choice);
            }}
          />
        )}

        {clientView && (
          <ClientSummaryModal
            isOpen
            os={clientView.os}
            settings={settings}
            options={clientView.options}
            onClose={() => { setClientView(null); restoreSummaryFocus(); }}
          />
        )}

        {deleteModalInfo.isOpen && (
          <DeleteConfirmationModal
            isOpen={deleteModalInfo.isOpen}
            onClose={() => setDeleteModalInfo({ isOpen: false, entry: null })}
            onConfirmSingle={confirmDeleteSingle}
            onConfirmGroup={confirmDeleteGroup}
            isGroup={!!deleteModalInfo.entry?.groupId}
          />
        )}

        {isInstallmentChoiceOpen && pendingInstallmentOS && (
          <ChoiceModal
            isOpen={isInstallmentChoiceOpen}
            onClose={() => {
              setIsInstallmentChoiceOpen(false);
              setPendingInstallmentOS(null);
            }}
            onYes={() => handleInstallmentChoice(true)}
            onNo={() => handleInstallmentChoice(false)}
            title="Deseja Parcelar?"
            message={buildInstallmentMessage(pendingInstallmentOS.total, getRemainingAmount(pendingInstallmentOS))}
            yesText="Parcelar"
            noText="Pagamento único"
            yesIcon="receber"
            noIcon="financeiro"
            icon="cifrao"
          />
        )}

        {pendingAction && (
          <ConfirmationModal
            isOpen={!!pendingAction}
            onClose={() => setPendingAction(null)}
            onConfirm={executePendingAction}
            title={
              pendingAction?.type === 'DELETE_OS'
                ? 'Excluir OS?'
                : pendingAction?.type === 'ARCHIVE_OS'
                ? 'Arquivar OS?'
                : pendingAction?.type === 'FINISH_OS_FINANCIAL'
                ? 'Finalizar OS?'
                : pendingAction?.type === 'RESTORE_FINANCIAL'
                ? 'Reabrir OS?'
                : pendingAction?.type === 'IMPORT_DATA'
                ? 'Importar?'
                : 'Confirmar'
            }
            message={
              pendingAction?.type === 'DELETE_OS'
                ? 'Removerá a OS e lançamento financeiro.'
                : pendingAction?.type === 'ARCHIVE_OS'
                ? 'A OS sairá do quadro Kanban.'
                : pendingAction?.type === 'FINISH_OS_FINANCIAL'
                ? buildFinalizeMessage(pendingAction.data?.total || 0, pendingAction.data ? getRemainingAmount(pendingAction.data) : 0)
                : pendingAction?.type === 'RESTORE_FINANCIAL'
                ? 'Removerá o lançamento financeiro.'
                : pendingAction?.type === 'IMPORT_DATA'
                ? 'Substituir todos os dados?'
                : 'Tem certeza?'
            }
            confirmText={
              pendingAction?.type === 'DELETE_OS'
                ? 'Excluir'
                : pendingAction?.type === 'IMPORT_DATA'
                ? 'Substituir'
                : 'Confirmar'
            }
            confirmColor={
              pendingAction?.type === 'DELETE_OS' ||
              pendingAction?.type === 'RESTORE_FINANCIAL'
                ? 'danger'
                : 'primary'
            }
          />
        )}
      </Suspense>
    </>
  );
}

function App() {
  return (
    <ToastProvider>
      <DatabaseProvider>
        <AppContent />
      </DatabaseProvider>
    </ToastProvider>
  );
}

export default App;
