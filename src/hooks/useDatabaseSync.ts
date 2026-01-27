import { useEffect, useState } from 'react';
import { auth } from '../lib/firebase';
import { DatabaseSyncService, SyncStatus } from '../services/databaseSyncService';

/**
 * Hook para gerenciar sincronização de banco de dados
 * Retorna status de sincronização e instância do serviço
 */
export function useDatabaseSync() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncMessage, setSyncMessage] = useState<string>('');
  const [syncService, setSyncService] = useState<DatabaseSyncService | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        console.log('👤 Usuário autenticado:', user.uid);
        setSyncStatus('syncing');
        
        try {
          const service = new DatabaseSyncService(user.uid);
          
          // Configurar callback de status
          service.setStatusCallback((status, message) => {
            setSyncStatus(status);
            setSyncMessage(message || '');
          });
          
          // Sincronizar no primeiro login
          await service.syncOnFirstLogin();
          
          setSyncService(service);
        } catch (error: any) {
          console.error('❌ Erro na sincronização:', error);
          setSyncStatus('error');
          setSyncMessage(error.message || 'Erro na sincronização');
        }
      } else {
        console.log('👤 Usuário não autenticado');
        setSyncService(null);
        setSyncStatus('idle');
      }
    });

    // Cleanup ao desmontar
    return () => {
      unsubscribe();
      if (syncService) {
        syncService.cleanup();
      }
    };
  }, []);

  return { 
    syncStatus, 
    syncMessage, 
    syncService 
  };
}
