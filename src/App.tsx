import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import type { ReactNode } from 'react';

import { invoke } from '@tauri-apps/api/core';
import { DatabaseProvider, useDatabase, parseDatabase } from './context/DatabaseContext';
import { adoptSecrets, stripDbSecrets } from './utils/secrets';
import { CURRENT_SCHEMA_VERSION, countUnresolvedLinks, migrate } from './utils/migrations';
import { useFinance } from './hooks/useFinance';
import { useKeyboard } from './hooks/useKeyboard';
import { useAccess } from './hooks/useAccess';
import { NEW_OS_DENIED_MESSAGE, canSeeTab, safeTab } from './services/accessView';
import type { NavId } from './services/accessView';
import { initialPhoneTab, isPhoneTab } from './services/mobileNav';
import { usePhoneLayout } from './hooks/usePhoneLayout';
import { applyFieldSave } from './services/fieldOSSave';
import { canTriggerNewOSShortcut } from './utils/shortcuts';
import { updateClientCascading, updateCatalogItemCascading, updateTechnicianCascading } from './services/cascadeService';
import { uploadToDrive } from './services/googleDrive';
import { Sidebar } from './components/Sidebar';
import { Confetti } from './components/ui/Confetti';
import type { ToastAction, ToastType } from './components/ui/ToastContainer';
import { ToastProvider, useToast } from './context/ToastContext';
import { applyTheme } from './utils/theme';
import { useTheme } from './hooks/useTheme';
import { LoadingSkeleton } from './components/ui/LoadingSkeleton';
import { DocKind, DocOptions, buildDocument } from './services/documents';
import { SavedPdf, fileNameFromPath, isOsDocument, printingMessage } from './services/documentsView';
import { outputDocument, revealPdf } from './utils/documentOutput';
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
const DocumentsModal = lazy(() => import('./modals/DocumentsModal').then(m => ({ default: m.DocumentsModal })));
const SummaryChoiceModal = lazy(() => import('./modals/SummaryChoiceModal').then(m => ({ default: m.SummaryChoiceModal })));

import { SoundFX } from './utils/audio';
import {
  applyInstallmentToOS, buildInstallmentEntries, finalizeOSSingle, markOSFinalized,
  getRemainingAmount, reopenOS, restoreFinancial, statusChangeEffects,
  togglePayment,
} from './services/osFinanceService';
import { Money, updateWorkOrderData, generateId } from './utils/helpers';
import { trashDeletedOSPhotos, trashPhotoIds, trashRemovedPhotos } from './services/photoCleanup';
import { resolveSavedPhotos } from './services/photoDraft';
import { clearPhotoUrlCache } from './services/photoStore';
import { prepareOSSave, ADVANCES_EXCEED_MESSAGE, advanceLockedMessage } from './services/osSave';
import { findAdvanceOwner, removeAllAdvances } from './services/advances';
import { editWarning, findReceiptOwner, parcelas, planDeleteOS, planReopenOS, receiptLockedMessage, removeOSReceipt, settleOpenReceipt } from './services/osFinanceGuards';
import { mergeOSEdit, OS_DELETED_MESSAGE, CHANGED_ELSEWHERE_MESSAGE, ADVANCES_IGNORED_MESSAGE, PHOTOS_TRIMMED_MESSAGE, conflictsMessage } from './services/osEditMerge';
import { buildFinalizeMessage, buildInstallmentMessage } from './services/finalizeText';
import { linkClient, linkCatalogItems, linkTechnician, preferredClientId } from './utils/links';
import { toISOFromDateInput } from './utils/dates';
import { FINALIZE_DENIED_MESSAGE, moneyFailToastType, saveNeedsMoney, statusNeedsMoneyOp } from './services/moneyRoute';
import { MONEY_OFFLINE_TOAST } from './utils/cloudStatus';
import type { MoneyCall, MoneyKind } from './sync/moneyClient';
import { getTargetMargin } from './services/margin';
import { AppointmentAction, AppointmentInput, applyAppointmentAction, linkAppointmentToOS, makeAppointment, updateAppointment } from './services/agenda';
import { appointmentToOSDraft, OSDraftFromAppointment } from './services/schedule';
import type { AppointmentModalMode } from './modals/AppointmentModal';
import type { Appointment } from './types';
import { LedgerEntry, WorkOrder, Client, CatalogItem, OSStatus, Technician, InstallmentConfig, OSModalPayload } from './types';

type PendingAction =
  | { type: 'ARCHIVE_OS' | 'FINISH_OS_FINANCIAL'; data: WorkOrder }
  | { type: 'DELETE_OS'; data: WorkOrder; message: string }
  | { type: 'RESTORE_FINANCIAL'; data: WorkOrder; target: OSStatus; message: string }
  | { type: 'IMPORT_DATA'; content: string };

/** Peças do celular (barra de baixo e "Disponível no computador"), entregues por `src/auth/boot.tsx` (lazy): o App não importa o código de celular. */
export interface PhoneShell {
  nav: (p: { activeTab: NavId; setActiveTab: (tab: NavId) => void }) => ReactNode;
  desktopOnly: (p: { tab: NavId; onBack: () => void }) => ReactNode;
}

/** `topbar` e `phone`: peças do modo nuvem, entregues por `src/auth/boot.tsx`; o modo arquivo não passa nada. */
export function AppContent({ topbar, phone: phoneShell }: { topbar?: ReactNode; phone?: PhoneShell } = {}) {
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
    cloud,
  } = useDatabase();

  const finance = useFinance();
  // Papel da nuvem (docs/NUVEM-UX.md seção 7). No modo arquivo `access` libera tudo e nada muda.
  const access = useAccess();

  // Trocou de banco: as object URLs das fotos do banco anterior não valem mais.
  useEffect(() => () => clearPhotoUrlCache(), [dbPath]);

  // Tema por computador: começa do que está gravado (o index.html já aplicou o atributo antes do primeiro desenho).
  // (hook compartilhado com o menu da pessoa da barra do topo do modo nuvem; mesmo armazenamento de antes)
  const [currentTheme, setCurrentTheme] = useTheme();
  const [activeTab, setActiveTab] = useState<'HOJE' | 'FINANCEIRO' | 'OFICINA' | 'AGENDA' | 'PROCESSOS' | 'CLIENTES' | 'PECAS' | 'CONFIG'>(() => safeTab(access, readHomeTab()));
  // Celular (só nuvem, < 800 px): sem menu lateral; barra de baixo vinda do boot. Ao entrar no celular, tela fora do campo volta para Oficina.
  const phone = usePhoneLayout(!!cloud && !!phoneShell);
  useEffect(() => { if (phone) setActiveTab(t => (isPhoneTab(t) ? t : initialPhoneTab())); }, [phone]);
  // Trocou de papel (ou de pessoa): a aba aberta que o novo papel não vê volta para Oficina, sem aviso.
  useEffect(() => { setActiveTab(t => safeTab(access, t)); }, [access]);
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
  const [summaryChoice, setSummaryChoice] = useState<{ os: WorkOrder } | null>(null);
  // Janela "Documentos": osId vazio = começa pelo seletor de OS.
  const [documentsOpen, setDocumentsOpen] = useState<{ osId: string | null } | null>(null);
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

  const addToast = (message: string, type: ToastType = 'info', action?: ToastAction) => {
    pushToast(message, type, action);
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

  // ---------- Dinheiro no servidor (modo nuvem, PR 6) ----------
  // No modo arquivo `cloud` é indefinido e nenhum desses ramos roda: o fluxo antigo segue igual.
  /** Sem internet não dá para mexer no caixa: avisa e devolve true (o chamador para). */
  const moneyOffline = (): boolean => {
    if (!cloud || cloud.online) return false;
    addToast(MONEY_OFFLINE_TOAST, 'info');
    return true;
  };
  /**
   * Roda a operação no servidor (função `money`). O resultado já entra no estado pelo pull do motor antes de `onOk`.
   * Falha: toast com o motivo; se foi a rede, "Tentar de novo" repete com o MESMO `op_id` (`retryOpId`: não lança duas vezes).
   * Todo clique novo da pessoa gera `op_id` novo (sem `retryOpId`).
   */
  const runMoney = (kind: MoneyKind, call: MoneyCall, onOk: (info: Record<string, unknown>) => void, retryOpId?: string): void => {
    const money = cloud?.money;
    if (!money) return;
    void money(kind, call, retryOpId ? { retryOpId } : undefined).then(out => {
      if (out.ok) { onOk(out.info); return; }
      const retry = (out.code === 'rede' || out.code === 'erro' || out.code === 'offline' || out.code === 'pendente') && out.opId
        ? { label: 'Tentar de novo', onClick: () => runMoney(kind, call, onOk, out.opId) }
        : undefined;
      addToast(out.message, moneyFailToastType(out), retry);
    });
  };

  const handleUpdateStatus = (osId: string, newStatus: OSStatus, onDone?: () => void) => {
    const os = workOrders.find(o => o.id === osId);
    if (!os || os.status === newStatus) return;

    const effect = statusChangeEffects(os, newStatus, new Date().toISOString(), ledger);
    if (effect.kind === 'blocked') {
      addToast(effect.message, 'error');
      return;
    }
    if (cloud && effect.kind !== 'noop') {
      const money = effect.kind === 'ask-finish' || effect.kind === 'ask-restore' || statusNeedsMoneyOp(os, newStatus, effect);
      if (money && !access.can('os.finalize')) { addToast(FINALIZE_DENIED_MESSAGE, 'info'); return; }
      if (money && moneyOffline()) return;
      if (money && effect.kind === 'update') {
        runMoney('os.status', { osId, payload: { newStatus } }, () => { SoundFX.pop(); onDone?.(); });
        return;
      }
    }
    if (effect.kind === 'ask-finish') {
      setPendingAction({ type: 'FINISH_OS_FINANCIAL', data: os });
      return;
    } else if (effect.kind === 'ask-restore') {
      setPendingAction({ type: 'RESTORE_FINANCIAL', data: os, target: effect.target, message: effect.message });
      return;
    }

    if (effect.kind === 'update') {
      setWorkOrders(prev => prev.map(o => o.id === osId ? { ...o, ...effect.updates } : o));
      // OS à vista de volta a Finalizado com a receita aberta: o caixa acompanha (mesma data de recebimento).
      if (effect.settleEntry) setLedger(prev => settleOpenReceipt(prev, effect.settleEntry!.entryId, effect.settleEntry!.paymentDate));
    }

    SoundFX.pop();
    onDone?.();
  };

  const handleSaveOSModal = (data: OSModalPayload) => {
    // Visão de campo (Mecânico, sem `os.editFields`): grava SÓ km e fotos por cima da OS atual do banco.
    // Sem vínculos de cliente/catálogo, sem ledger/auditoria e sem tocar itens, preços ou adiantamentos.
    if (editingOS && !access.can('os.editFields')) {
      const osId = editingOS.id;
      const current = workOrders.find(o => o.id === osId);
      if (!current) {
        addToast(OS_DELETED_MESSAGE, 'error');
        return;
      }
      const field = { mileage: data.mileage, photos: data.photos };
      const next = applyFieldSave(current, field);
      setWorkOrders(prev => prev.map(o => o.id === osId ? applyFieldSave(o, field) : o));
      if (!readOnly) void trashRemovedPhotos(dbPath, osId, editingOS.photos, next.photos);
      addToast('OS atualizada!', 'success');
      setIsModalOpen(false);
      return;
    }

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
    // Na edição, o merge pode manter cliente/veículo/itens/técnico do banco: `relink` ajusta o que `applyLinks` grava.
    let finalClients = linkedClient.clients;
    let finalParts = linkedParts.catalog;
    let finalServices = linkedServices.catalog;
    let finalTechs = linkedTech.technicians;
    let finalTechName = technicianName;
    const applyLinks = () => {
      setClients(finalClients);
      setCatalogParts(finalParts);
      setCatalogServices(finalServices);
      if (finalTechName) setCatalogTechnicians(finalTechs);
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
      // Mescla sobre a OS ATUAL do banco: só vale o que o usuário editou (outro PC pode ter mudado status, pagamento, checklist...).
      const current = workOrders.find(o => o.id === editingOS.id);
      const merged = mergeOSEdit({ opened: editingOS, edited: base, current, drafts: data.advances });
      if (!merged.ok) {
        addToast(OS_DELETED_MESSAGE, 'error');
        return;
      }
      // Links sobre o resultado mesclado: só cadastra o que de fato vai para a OS (o texto do formulário pode ter perdido para o banco).
      const mb = merged.base;
      if (mb.clientName !== data.clientName || mb.vehicle !== data.vehicle || mb.clientPhone !== data.clientPhone) {
        const re = linkClient({ clients, clientName: mb.clientName, clientPhone: mb.clientPhone, clientNotes: data.clientNotes || '', vehicle: mb.vehicle, clientId: mb.clientId, newId: generateId });
        finalClients = re.ambiguous ? clients : re.clients;
      }
      if (mb.parts !== base.parts) finalParts = catalogParts;
      if (mb.services !== base.services) finalServices = catalogServices;
      finalTechName = (mb.technician || '').trim();
      if (finalTechName !== technicianName) finalTechs = linkTechnician(catalogTechnicians, finalTechName, generateId).technicians;
      const warning = editWarning(current ?? editingOS, merged.base);
      if (warning && !confirm(warning)) return;
      const saved = prepareOSSave({ base: merged.base, previous: current, drafts: merged.drafts, ledger, machine });
      if (!saved.ok) {
        addToast(saved.error, 'error');
        return;
      }
      // Nuvem: se a edição mexe no caixa (adiantamentos, preço de OS já lançada, receita), o servidor grava tudo junto.
      // O modal fica aberto até a resposta; com erro, nada foi salvo e a pessoa não perde o que digitou.
      if (cloud && saveNeedsMoney({ role: cloud.role, previous: current, saved, ledger })) {
        if (moneyOffline()) return;
        applyLinks();
        // O servidor refaz o merge de 3 vias (opened/edited/current): manda a OS do FORMULÁRIO (`base`) e a lista de
        // adiantamentos do formulário, não o resultado do merge local (senão o que outro aparelho mudou viraria "edição minha").
        // Os avisos vêm do `info` do servidor (é o merge que de fato gravou); o merge local só decide se passa pelo caixa.
        runMoney('os.save', { osId: editingOS.id, payload: { opened: editingOS, base, drafts: data.advances } }, info => {
          const conflicts = Array.isArray(info.conflicts) ? info.conflicts.filter((x): x is string => typeof x === 'string') : [];
          addToast('OS atualizada!', 'success');
          if (info.changedElsewhere === true) addToast(CHANGED_ELSEWHERE_MESSAGE, 'info');
          if (conflicts.length) addToast(conflictsMessage(conflicts), 'info');
          if (info.advancesIgnored === true) addToast(ADVANCES_IGNORED_MESSAGE, 'info');
          if (info.photosTrimmed === true) addToast(PHOTOS_TRIMMED_MESSAGE, 'info');
          if (info.exceedsTotal === true) addToast(ADVANCES_EXCEED_MESSAGE, 'info');
          // Fotos tiradas da OS e fotos cortadas pelo limite: lixeira (a OS gravada pelo servidor é a verdade; o merge no servidor só acrescenta cortes).
          if (!readOnly) {
            const trimmed = Array.isArray(info.trimmedPhotoIds) ? info.trimmedPhotoIds.filter((x): x is string => typeof x === 'string') : [];
            const trimmedSet = new Set(trimmed);
            void trashRemovedPhotos(dbPath, editingOS.id, editingOS.photos, (base.photos ?? []).filter(p => !trimmedSet.has(p.id)));
            if (trimmed.length) void trashPhotoIds(dbPath, editingOS.id, trimmed);
          }
          setIsModalOpen(false);
        });
        return;
      }
      applyLinks();
      setLedger(saved.ledger);
      if (saved.events.length) setAuditLog(prev => [...prev, ...saved.events]);
      setWorkOrders(prev => prev.map(o => o.id === editingOS.id ? saved.os : o));
      // Modo arquivo: lixeira no disco. Nuvem: o transporte só tira da fila de envio (`queue.cancel`).
      if (!readOnly) {
        void trashRemovedPhotos(dbPath, editingOS.id, editingOS.photos, saved.os.photos);
        if (merged.trimmedPhotoIds.length) void trashPhotoIds(dbPath, editingOS.id, merged.trimmedPhotoIds);
      }
      addToast('OS atualizada!', 'success');
      if (merged.changedElsewhere) addToast(CHANGED_ELSEWHERE_MESSAGE, 'info');
      if (merged.conflicts.length) addToast(conflictsMessage(merged.conflicts), 'info');
      if (merged.advancesIgnored) addToast(ADVANCES_IGNORED_MESSAGE, 'info');
      if (merged.photosTrimmed) addToast(PHOTOS_TRIMMED_MESSAGE, 'info');
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
      // Nuvem: OS nova com adiantamento cria lançamentos no caixa: vai pelo servidor, junto com a OS.
      if (cloud && saveNeedsMoney({ role: cloud.role, previous: undefined, saved, ledger })) {
        if (moneyOffline()) return;
        applyLinks();
        runMoney('os.save', { osId: newOS.id, payload: { isNew: true, base: newOS, drafts: data.advances } }, () => {
          if (osFromAppointment) {
            const originId = osFromAppointment.appointment.id;
            setAppointments(prev => prev.map(a => a.id === originId ? linkAppointmentToOS(a, saved.os) : a));
            setOsFromAppointment(null);
          }
          addToast('Nova OS criada!', 'success');
          if (saved.exceedsTotal) addToast(ADVANCES_EXCEED_MESSAGE, 'info');
          setIsModalOpen(false);
        });
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
    if (moneyOffline()) return; // lançamento do Financeiro só online (nuvem)
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
    const ownEntry = ledger.find(e => e.id === id);
    const linkedOS = ownEntry ? findReceiptOwner(workOrders, ownEntry) : undefined;
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
    if (cloud) {
      if (moneyOffline()) return;
      runMoney('ledger.toggle', { entryId }, info => {
        const eff = info.osEffect as { osNumber: number; kind: 'finalized' | 'reopened' } | undefined;
        if (eff) {
          addToast(
            eff.kind === 'finalized'
              ? `OS #${eff.osNumber} finalizada: todas as parcelas pagas`
              : `OS #${eff.osNumber} voltou a Aguardando Pagamento: há parcela pendente`,
            'info'
          );
        } else {
          addToast(info.paid === true ? '💵 Marcado como pago!' : '⏳ Marcado como pendente', 'info');
        }
        SoundFX.pop();
      });
      return;
    }
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
    if (cloud && !access.can('ledger.delete')) { addToast('Só o Dono exclui lançamentos do Financeiro.', 'info'); return; }
    if (refuseIfAdvance(entry.id)) return;
    // Receita ou parcela de OS: apagar aqui deixaria a OS com vínculo órfão. Só pela OS.
    const receiptOwner = findReceiptOwner(workOrders, entry);
    if (receiptOwner) {
      addToast(receiptLockedMessage(receiptOwner.osNumber), 'error');
      return;
    }
    setDeleteModalInfo({ isOpen: true, entry });
  };

  const confirmDeleteSingle = () => {
    if (moneyOffline()) return;
    if (deleteModalInfo.entry) finance.deleteEntry(deleteModalInfo.entry.id);
    addToast('Excluído.', 'info');
    setDeleteModalInfo({ isOpen: false, entry: null });
  };

  const confirmDeleteGroup = () => {
    if (moneyOffline()) return;
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
    if (cloud) {
      // O servidor refaz a conta (restante, parcelas, datas pelo relógio da oficina); aqui só o pedido.
      const os = installmentOS;
      setIsInstallmentModalOpen(false);
      setInstallmentOS(null);
      if (!os || moneyOffline()) return;
      runMoney('os.installment', {
        osId: os.id,
        payload: { config: { installments: config.installments, firstPaymentDate: config.firstPaymentDate, description: config.description, totalAmount: config.totalAmount } },
      }, () => {
        addToast(`OS #${os.osNumber} aguardando pagamento`, 'success');
        setShowConfetti(true);
        addToast(`Parcelamento criado! ${config.installments}x`, 'success');
      });
      return;
    }
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

  // Caminho único dos documentos (OS, vias, resumo, checklist): imprime ou salva o PDF e avisa.
  const openSavedPdf = (path: string) => {
    void revealPdf(path).then(r => { if (!r.ok) addToast(r.message, 'error'); });
  };

  const generateDocument = async (os: WorkOrder, kind: DocKind, mode: 'print' | 'pdf', opts: DocOptions = {}): Promise<SavedPdf | null> => {
    const doc = buildDocument(kind, os, settings, opts);
    if (mode === 'print') {
      addToast(printingMessage(kind, os.osNumber), 'info');
      if (isOsDocument(kind)) markPrintedOnce();
      await outputDocument(doc, 'print');
      return null;
    }
    const res = await outputDocument(doc, 'pdf');
    if (!res.ok) {
      addToast(res.message, 'error');
      return null;
    }
    const path = res.path;
    const fileName = path ? fileNameFromPath(path) : `${doc.fileStem}.pdf`;
    addToast(
      `PDF salvo: ${fileName}`,
      'success',
      path ? { label: 'Abrir pasta', onClick: () => openSavedPdf(path) } : undefined
    );
    return path ? { path, fileName } : null;
  };

  // Elemento que abriu a escolha/Modo cliente (botão "Mais"): o menu já fechou quando a janela monta,
  // então o useFocusTrap sozinho não saberia para onde devolver o foco.
  const summaryOriginRef = useRef<HTMLElement | null>(null);
  const restoreSummaryFocus = () => {
    const el = summaryOriginRef.current;
    summaryOriginRef.current = null;
    if (el) setTimeout(() => { if (el.isConnected) el.focus(); }, 0);
  };

  // Modo cliente (tela). A impressão e o PDF do resumo vivem na janela Documentos.
  const runSummary = (os: WorkOrder, choice: SummaryChoice) => {
    setClientView({ os, options: choiceToOptions(choice) });
  };

  // Sem recomendações a incluir, pula a pergunta e mostra direto.
  const requestSummary = (os: WorkOrder, origin?: HTMLElement | null) => {
    summaryOriginRef.current = origin ?? null;
    if (needsSummaryChoice(os)) setSummaryChoice({ os });
    else runSummary(os, DEFAULT_SUMMARY_CHOICE);
  };

  // Ações do Kanban estáveis: o quadro não re-renderiza a cada toast/filtro/salvamento.
  // Os callbacks leem sempre a versão mais recente dos handlers/estado via ref.
  // Excluir OS: parcela já recebida bloqueia; senão a confirmação diz o que sai do caixa.
  const requestDeleteOS = (os: WorkOrder) => {
    const plan = planDeleteOS(os, ledger);
    if (!plan.ok) { addToast(plan.message, 'error'); return; }
    if (moneyOffline()) return;
    setPendingAction({ type: 'DELETE_OS', data: os, message: plan.message });
  };

  const kanbanRef = useRef({ workOrders, handleUpdateStatus, requestSummary, requestDeleteOS });
  // Atualizado após o commit do render (um render descartado não deixa handlers de estado não confirmado).
  useLayoutEffect(() => {
    kanbanRef.current = { workOrders, handleUpdateStatus, requestSummary, requestDeleteOS };
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
    onDocuments: (os: WorkOrder, origin?: HTMLElement | null) => {
      summaryOriginRef.current = origin ?? null;
      setDocumentsOpen({ osId: os.id });
    },
    onShowClient: (os: WorkOrder, origin?: HTMLElement | null) => kanbanRef.current.requestSummary(os, origin),
    onDelete: (os: WorkOrder) => kanbanRef.current.requestDeleteOS(os),
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

    if (pendingAction.type === 'DELETE_OS' && cloud) {
      const os = pendingAction.data;
      setPendingAction(null);
      if (moneyOffline()) return;
      runMoney('os.delete', { osId: os.id }, () => {
        // Só depois do servidor confirmar: tira da fila de envio as fotos que ainda não subiram.
        void trashDeletedOSPhotos(dbPath, os);
        addToast('OS excluída.', 'info');
      });
      return;
    }

    if (pendingAction.type === 'RESTORE_FINANCIAL' && cloud) {
      const { data: os, target } = pendingAction;
      setPendingAction(null);
      if (moneyOffline()) return;
      runMoney('os.restore', { osId: os.id, payload: { target } }, info => {
        const n = typeof info.removedCount === 'number' ? info.removedCount : 0;
        if (info.removedGroup === true) addToast(`${parcelas(n)} ${n === 1 ? 'removida' : 'removidas'}.`, 'info');
        else if (n > 0) addToast('Lançamento removido.', 'info');
        addToast('OS reaberta.', 'success');
      });
      return;
    }

    if (pendingAction.type === 'DELETE_OS') {
      const os = pendingAction.data;
      // Refaz a trava com o caixa de agora (o diálogo pode ter ficado aberto enquanto uma parcela foi recebida).
      const recheck = planDeleteOS(os, ledger);
      if (!recheck.ok) { addToast(recheck.message, 'error'); setPendingAction(null); return; }
      setWorkOrders(p => p.filter(i => i.id !== os.id));
      // Receita (à vista e TODAS as parcelas) e adiantamentos saem juntos do caixa.
      const removed = removeAllAdvances({ os, ledger: removeOSReceipt(os, ledger), machine: getMachineName() });
      if (removed.ledger !== ledger) setLedger(removed.ledger);
      if (removed.events.length) setAuditLog(p => [...p, ...removed.events]);
      if (!readOnly && !cloud) void trashDeletedOSPhotos(dbPath, os);
      addToast('OS excluída.', 'info');
    }

    if (pendingAction.type === 'ARCHIVE_OS') {
      const archiveId = pendingAction.data.id;
      // Nuvem: FINALIZADO -> ARQUIVADO não mexe no caixa e vai pelo sync normal (fila de envio, offline-first), sem a função
      // `money`: aí `onDone` roda na hora (aviso imediato, como no resto do app offline-first). Se o servidor recusar depois,
      // o motor desfaz a mudança, guarda uma cópia de recuperação e avisa (`sweepRejected`). Só os casos que exigem a função
      // `money` (ver `statusNeedsMoneyOp`) esperam a resposta; em erro, quem falou foi o toast de erro.
      if (cloud) handleUpdateStatus(archiveId, 'ARQUIVADO', () => addToast('OS Arquivada.', 'info'));
      else {
        handleUpdateStatus(archiveId, 'ARQUIVADO');
        addToast('OS Arquivada.', 'info');
      }
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

      const recheck = planReopenOS(os, ledger, pendingAction.target);
      if (!recheck.ok) { addToast(recheck.message, 'error'); setPendingAction(null); return; }

      const restored = restoreFinancial(ledger, os, pendingAction.target);

      if (restored.removedGroup) {
        setLedger(restored.ledger);
        addToast(`${parcelas(restored.removedCount)} ${restored.removedCount === 1 ? 'removida' : 'removidas'}.`, 'info');
      } else if (restored.removedCount > 0) {
        setLedger(restored.ledger);
        addToast('Lançamento removido.', 'info');
      }

      setWorkOrders(prev => prev.map(o => o.id === os.id ? reopenOS(o, pendingAction.target) : o));

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
    } else if (cloud) {
      const os = pendingInstallmentOS;
      setPendingInstallmentOS(null);
      if (moneyOffline()) return;
      runMoney('os.finalizeSingle', { osId: os.id }, () => {
        addToast('OS Finalizada!', 'success');
        setShowConfetti(true);
      });
      return;
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
    if (phone) return;
    if (!canTriggerNewOSShortcut(e.target as HTMLElement | null, hasOpenModal)) return;
    if (!access.can('os.create')) {
      addToast(NEW_OS_DENIED_MESSAGE, 'info');
      return;
    }
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
        {!phone && <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => (isNarrow ? setNarrowExpanded(prev => !prev) : setIsSidebarCollapsed(prev => !prev))}
          onOpenCadastros={() => setIsDatabaseModalOpen(true)}
        />}

        <main className="main-content">
          {cloud && topbar}
          <Suspense fallback={<LoadingSkeleton type="page" />}>
            {phone && phoneShell && !isPhoneTab(activeTab) && phoneShell.desktopOnly({ tab: activeTab, onBack: () => setActiveTab('OFICINA') })}
            {!(phone && !isPhoneTab(activeTab)) && <>
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
                onGoWorkshop={() => setActiveTab('OFICINA')}
              />
            )}

            {activeTab === 'FINANCEIRO' && canSeeTab(access, 'FINANCEIRO') && (
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
                onReceiveOS={os => handleUpdateStatus(os.id, 'FINALIZADO')}
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
                onDocuments={(origin) => { summaryOriginRef.current = origin ?? null; setDocumentsOpen({ osId: null }); }}
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
                settings={settings}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'CONFIG' && canSeeTab(access, 'CONFIG') && (
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
            </>}
          </Suspense>
        </main>
        {phone && phoneShell?.nav({ activeTab, setActiveTab })}
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
            ledger={ledger}
            onStatusChange={kanbanStatusChange}
            onOpenChecklist={os => { setChecklistOS(os); setIsChecklistOpen(true); }}
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
            mode="show"
            onClose={() => { setSummaryChoice(null); restoreSummaryFocus(); }}
            onConfirm={(choice) => {
              const { os } = summaryChoice;
              setSummaryChoice(null);
              runSummary(os, choice);
            }}
          />
        )}

        {documentsOpen && (
          <DocumentsModal
            isOpen
            osId={documentsOpen.osId}
            workOrders={workOrders}
            onClose={() => { setDocumentsOpen(null); restoreSummaryFocus(); }}
            onGenerate={generateDocument}
            onOpenSaved={openSavedPdf}
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
                ? pendingAction.message
                : pendingAction?.type === 'ARCHIVE_OS'
                ? 'A OS sairá do quadro Kanban.'
                : pendingAction?.type === 'FINISH_OS_FINANCIAL'
                ? buildFinalizeMessage(pendingAction.data?.total || 0, pendingAction.data ? getRemainingAmount(pendingAction.data) : 0)
                : pendingAction?.type === 'RESTORE_FINANCIAL'
                ? pendingAction.message
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
