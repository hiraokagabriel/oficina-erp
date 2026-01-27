/**
 * useDatabaseSync.ts
 * 
 * Hook React para gerenciar sincronização do banco de dados
 * - Auto-inicialização no login
 * - Fornece funções de sincronização
 * - Monitora status em tempo real
 */

import { useEffect, useState, useCallback } from 'react';
import { syncService, SyncStatus } from '../services/syncService';
import { DatabaseSchema } from '../types';
import { auth } from '../lib/firebase';

export function useDatabaseSync() {
  const [status, setStatus] = useState<SyncStatus>(syncService.getStatus());
  const [isInitialized, setIsInitialized] = useState(false);

  // Inicializa sincronização quando usuário faz login
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          await syncService.initialize(user.uid);
          setIsInitialized(true);
        } catch (error) {
          console.error('Erro ao inicializar sincronização:', error);
        }
      } else {
        syncService.cleanup();
        setIsInitialized(false);
      }
    });

    return unsubscribe;
  }, []);

  // Monitora status de sincronização
  useEffect(() => {
    const unsubscribe = syncService.onStatusChange(setStatus);
    return unsubscribe;
  }, []);

  // Função para sincronizar manualmente
  const syncNow = useCallback(async () => {
    try {
      await syncService.syncFromFirestore();
    } catch (error) {
      console.error('Erro ao sincronizar:', error);
      throw error;
    }
  }, []);

  // Função para fazer upload de dados
  const uploadData = useCallback(async (data: DatabaseSchema) => {
    try {
      await syncService.syncToFirestore(data);
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      throw error;
    }
  }, []);

  // Função para criar backup
  const createBackup = useCallback(async () => {
    try {
      await syncService.createBackup();
    } catch (error) {
      console.error('Erro ao criar backup:', error);
      throw error;
    }
  }, []);

  return {
    status,
    isInitialized,
    syncNow,
    uploadData,
    createBackup
  };
}
