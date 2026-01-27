/**
 * useDataSync Hook
 * 
 * Hook personalizado para gerenciar sincronização de dados
 * Executa sync automaticamente no login e fornece funções de controle
 */

import { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import {
  initIndexedDB,
  syncFromFirestore,
  syncToFirestore,
  getSyncStatus,
  exportData,
  importData,
  resetDatabase,
  getSyncLogs
} from '../services/dataSyncService';

interface SyncState {
  isInitialized: boolean;
  isSyncing: boolean;
  lastSync: number | null;
  totalItems: number;
  itemsByCollection: { [key: string]: number };
  error: string | null;
}

interface UseDa taSyncReturn {
  // Estado
  syncState: SyncState;
  
  // Funções
  initialize: () => Promise<void>;
  syncDown: () => Promise<void>; // Firestore → Local
  syncUp: () => Promise<void>;   // Local → Firestore
  fullSync: () => Promise<void>; // Bidirecional
  exportToFile: () => Promise<void>;
  importFromFile: (file: File) => Promise<void>;
  resetAll: (password: string) => Promise<{ success: boolean; message: string }>;
  refreshStatus: () => Promise<void>;
  getLogs: () => Promise<any[]>;
}

export function useDataSync(user: User | null): UseDataSyncReturn {
  const [syncState, setSyncState] = useState<SyncState>({
    isInitialized: false,
    isSyncing: false,
    lastSync: null,
    totalItems: 0,
    itemsByCollection: {},
    error: null
  });

  /**
   * Inicializa IndexedDB
   */
  const initialize = useCallback(async () => {
    try {
      await initIndexedDB();
      setSyncState(prev => ({ ...prev, isInitialized: true }));
      console.log('✅ useDataSync: IndexedDB inicializado');
    } catch (err: any) {
      console.error('❌ useDataSync: Erro ao inicializar', err);
      setSyncState(prev => ({ ...prev, error: err.message }));
    }
  }, []);

  /**
   * Atualiza status da sincronização
   */
  const refreshStatus = useCallback(async () => {
    try {
      const status = await getSyncStatus();
      setSyncState(prev => ({
        ...prev,
        lastSync: status.lastSync,
        totalItems: status.totalItems,
        itemsByCollection: status.itemsByCollection
      }));
    } catch (err: any) {
      console.error('❌ Erro ao atualizar status:', err);
    }
  }, []);

  /**
   * Sincroniza Firestore → IndexedDB (Download)
   */
  const syncDown = useCallback(async () => {
    if (!user) {
      console.warn('⚠️  Usuário não autenticado');
      return;
    }

    setSyncState(prev => ({ ...prev, isSyncing: true, error: null }));

    try {
      console.log('🔽 Sincronizando Firestore → Local...');
      const result = await syncFromFirestore(user.uid);

      if (!result.success) {
        throw new Error(result.errors.join(', '));
      }

      await refreshStatus();
      console.log(`✅ ${result.itemsSynced} itens sincronizados`);
    } catch (err: any) {
      console.error('❌ Erro na sincronização:', err);
      setSyncState(prev => ({ ...prev, error: err.message }));
    } finally {
      setSyncState(prev => ({ ...prev, isSyncing: false }));
    }
  }, [user, refreshStatus]);

  /**
   * Sincroniza IndexedDB → Firestore (Upload)
   */
  const syncUp = useCallback(async () => {
    if (!user) {
      console.warn('⚠️  Usuário não autenticado');
      return;
    }

    setSyncState(prev => ({ ...prev, isSyncing: true, error: null }));

    try {
      console.log('🔼 Sincronizando Local → Firestore...');
      const result = await syncToFirestore(user.uid);

      if (!result.success) {
        throw new Error(result.errors.join(', '));
      }

      console.log(`✅ ${result.itemsSynced} itens enviados`);
    } catch (err: any) {
      console.error('❌ Erro no upload:', err);
      setSyncState(prev => ({ ...prev, error: err.message }));
    } finally {
      setSyncState(prev => ({ ...prev, isSyncing: false }));
    }
  }, [user]);

  /**
   * Sincronização completa (bidirecional)
   */
  const fullSync = useCallback(async () => {
    await syncDown();
    await syncUp();
  }, [syncDown, syncUp]);

  /**
   * Exporta dados para arquivo JSON
   */
  const exportToFile = useCallback(async () => {
    try {
      const result = await exportData();
      
      if (!result.success || !result.data) {
        throw new Error(result.message);
      }

      // Criar arquivo para download
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `oficina-erp-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log('✅ Dados exportados com sucesso');
    } catch (err: any) {
      console.error('❌ Erro ao exportar:', err);
      setSyncState(prev => ({ ...prev, error: err.message }));
    }
  }, []);

  /**
   * Importa dados de arquivo JSON
   */
  const importFromFile = useCallback(async (file: File) => {
    if (!user) {
      console.warn('⚠️  Usuário não autenticado');
      return;
    }

    setSyncState(prev => ({ ...prev, isSyncing: true, error: null }));

    try {
      const text = await file.text();
      const jsonData = JSON.parse(text);

      const result = await importData(jsonData, user.uid);
      
      if (!result.success) {
        throw new Error(result.message);
      }

      await refreshStatus();
      console.log('✅ Dados importados com sucesso');
    } catch (err: any) {
      console.error('❌ Erro ao importar:', err);
      setSyncState(prev => ({ ...prev, error: err.message }));
    } finally {
      setSyncState(prev => ({ ...prev, isSyncing: false }));
    }
  }, [user, refreshStatus]);

  /**
   * Reseta todo o banco de dados
   */
  const resetAll = useCallback(async (password: string): Promise<{ success: boolean; message: string }> => {
    if (!user) {
      return { success: false, message: 'Usuário não autenticado' };
    }

    setSyncState(prev => ({ ...prev, isSyncing: true, error: null }));

    try {
      const result = await resetDatabase(user.uid, password);
      
      if (result.success) {
        await refreshStatus();
      }

      return result;
    } catch (err: any) {
      console.error('❌ Erro ao resetar:', err);
      return { success: false, message: err.message };
    } finally {
      setSyncState(prev => ({ ...prev, isSyncing: false }));
    }
  }, [user, refreshStatus]);

  /**
   * Obtém logs de sincronização
   */
  const getLogs = useCallback(async (): Promise<any[]> => {
    try {
      return await getSyncLogs(50);
    } catch (err) {
      console.error('❌ Erro ao buscar logs:', err);
      return [];
    }
  }, []);

  /**
   * Inicializa automaticamente quando componente monta
   */
  useEffect(() => {
    initialize();
  }, [initialize]);

  /**
   * Sincroniza automaticamente no login (primeira vez)
   */
  useEffect(() => {
    if (user && syncState.isInitialized && !syncState.lastSync) {
      console.log('🆕 Primeiro login detectado, sincronizando...');
      syncDown();
    }
  }, [user, syncState.isInitialized, syncState.lastSync, syncDown]);

  /**
   * Atualiza status periodicamente (a cada 30s)
   */
  useEffect(() => {
    if (!syncState.isInitialized) return;

    refreshStatus();
    const interval = setInterval(refreshStatus, 30000);

    return () => clearInterval(interval);
  }, [syncState.isInitialized, refreshStatus]);

  return {
    syncState,
    initialize,
    syncDown,
    syncUp,
    fullSync,
    exportToFile,
    importFromFile,
    resetAll,
    refreshStatus,
    getLogs
  };
}
