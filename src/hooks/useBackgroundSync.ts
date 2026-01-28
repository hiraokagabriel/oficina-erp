/**
 * useBackgroundSync.ts
 * Hook React para sincronização em background usando Web Worker
 * 
 * USO:
 * const { sync, isWorking, progress } = useBackgroundSync();
 * await sync.incremental(lastSyncTime);
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface SyncProgress {
  current: number;
  total: number;
  message: string;
}

interface BackgroundSyncState {
  isWorking: boolean;
  progress: SyncProgress | null;
  error: string | null;
}

interface BackgroundSyncAPI {
  incremental: (lastSync: string) => Promise<any>;
  full: () => Promise<any>;
  uploadBatch: (collectionName: string, data: any[]) => Promise<any>;
  terminate: () => void;
}

export function useBackgroundSync(): BackgroundSyncState & { sync: BackgroundSyncAPI } {
  const [isWorking, setIsWorking] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const workerRef = useRef<Worker | null>(null);
  const resolveRef = useRef<((value: any) => void) | null>(null);
  const rejectRef = useRef<((error: any) => void) | null>(null);

  /**
   * Inicializa o worker
   */
  useEffect(() => {
    // Criar worker
    try {
      // Nota: O caminho pode precisar ser ajustado dependendo da configuração do Vite
      workerRef.current = new Worker(
        new URL('../workers/syncWorker.ts', import.meta.url),
        { type: 'module' }
      );

      // Handler de mensagens do worker
      workerRef.current.onmessage = (e) => {
        const { type, ...payload } = e.data;

        switch (type) {
          case 'INIT_SUCCESS':
            console.log('✅ Worker inicializado');
            break;

          case 'INIT_ERROR':
            console.error('❌ Erro ao inicializar worker:', payload.error);
            setError(payload.error);
            break;

          case 'SYNC_PROGRESS':
            setProgress({
              current: payload.progress,
              total: payload.total,
              message: payload.message
            });
            break;

          case 'SYNC_COMPLETE':
            setIsWorking(false);
            setProgress(null);
            if (resolveRef.current) {
              resolveRef.current(payload.data);
              resolveRef.current = null;
            }
            console.log('✅ Sync completo:', payload.data);
            break;

          case 'SYNC_ERROR':
            setIsWorking(false);
            setProgress(null);
            setError(payload.error);
            if (rejectRef.current) {
              rejectRef.current(new Error(payload.error));
              rejectRef.current = null;
            }
            console.error('❌ Erro no sync:', payload.error);
            break;
        }
      };

      // Handler de erros do worker
      workerRef.current.onerror = (error) => {
        console.error('❌ Erro no worker:', error);
        setError(error.message);
        setIsWorking(false);
      };

      // Inicializar worker com configuração Firebase
      const firebaseConfig = {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID
      };

      // Pegar userId do auth atual (assumindo que já está logado)
      const userId = localStorage.getItem('oficina-erp-user-id'); // Ajustar conforme sua implementação

      if (userId) {
        workerRef.current.postMessage({
          type: 'INIT',
          payload: { firebaseConfig, userId }
        });
      } else {
        console.warn('⚠️ UserId não encontrado, worker não inicializado');
      }

    } catch (error: any) {
      console.error('❌ Erro ao criar worker:', error);
      setError(error.message);
    }

    // Cleanup
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  /**
   * Envia mensagem para o worker e retorna Promise
   */
  const sendMessage = useCallback((message: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker não inicializado'));
        return;
      }

      resolveRef.current = resolve;
      rejectRef.current = reject;
      setIsWorking(true);
      setError(null);
      setProgress(null);

      workerRef.current.postMessage(message);
    });
  }, []);

  /**
   * API pública
   */
  const sync: BackgroundSyncAPI = {
    incremental: useCallback(async (lastSync: string) => {
      console.log('🔄 Iniciando sync incremental em background...');
      return sendMessage({
        type: 'SYNC_INCREMENTAL',
        payload: { lastSync }
      });
    }, [sendMessage]),

    full: useCallback(async () => {
      console.log('🔄 Iniciando sync completo em background...');
      return sendMessage({
        type: 'SYNC_FULL',
        payload: {}
      });
    }, [sendMessage]),

    uploadBatch: useCallback(async (collectionName: string, data: any[]) => {
      console.log(`📤 Enviando ${data.length} itens de ${collectionName} em background...`);
      return sendMessage({
        type: 'UPLOAD_BATCH',
        payload: { collectionName, data }
      });
    }, [sendMessage]),

    terminate: useCallback(() => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
        setIsWorking(false);
        setProgress(null);
        console.log('🛑 Worker terminado');
      }
    }, [])
  };

  return {
    isWorking,
    progress,
    error,
    sync
  };
}

/**
 * Hook simplificado para sincronização automática
 */
export function useAutoBackgroundSync(intervalMs: number = 5 * 60 * 1000) {
  const { sync, isWorking, progress, error } = useBackgroundSync();
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    // Carregar último timestamp de sync
    const stored = localStorage.getItem('oficina-erp-last-sync');
    if (stored) {
      setLastSync(stored);
    }
  }, []);

  useEffect(() => {
    if (!lastSync || isWorking) return;

    // Sync inicial
    sync.incremental(lastSync)
      .then(result => {
        const newTimestamp = result.timestamp || new Date().toISOString();
        setLastSync(newTimestamp);
        localStorage.setItem('oficina-erp-last-sync', newTimestamp);
      })
      .catch(err => {
        console.error('❌ Erro no auto-sync:', err);
      });

    // Sync periódico
    const interval = setInterval(() => {
      if (!isWorking) {
        sync.incremental(lastSync)
          .then(result => {
            const newTimestamp = result.timestamp || new Date().toISOString();
            setLastSync(newTimestamp);
            localStorage.setItem('oficina-erp-last-sync', newTimestamp);
          })
          .catch(err => {
            console.error('❌ Erro no auto-sync:', err);
          });
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [lastSync, isWorking, sync, intervalMs]);

  return { isWorking, progress, error, lastSync };
}
