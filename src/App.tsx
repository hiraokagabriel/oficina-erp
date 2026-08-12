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
import { Money, createEntry, updateWorkOrderData, learnClientData, learnCatalogItems, learnTechnician, generateId } from './utils/helpers';
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
    isSaving,
    dbPath,
    setDbPath,
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // ...rest of file unchanged...
}

function App() {
  return (
    <DatabaseProvider>
      <AppContent />
    </DatabaseProvider>
  );
}

export default App;
