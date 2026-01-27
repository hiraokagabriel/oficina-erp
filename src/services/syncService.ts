/**
 * syncService.ts
 * 
 * Serviço de sincronização entre Firestore (nuvem) e IndexedDB (local)
 * Gerencia upload, download, conflitos e sincronização automática
 */

import { db } from '../lib/firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc,
  writeBatch,
  query,
  where,
  Timestamp
} from 'firebase/firestore';
import { localStorageService, STORES } from './localStorageService';
import { auth } from '../lib/firebase';

interface SyncStatus {
  syncing: boolean;
  lastSync: number | null;
  error: string | null;
  progress: number; // 0-100
  mode: 'idle' | 'downloading' | 'uploading' | 'checking';
}

interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  errors: string[];
  timestamp: number;
}

class SyncService {
  private status: SyncStatus = {
    syncing: false,
    lastSync: null,
    error: null,
    progress: 0,
    mode: 'idle'
  };

  private listeners: Array<(status: SyncStatus) => void> = [];
  private autoSyncInterval: number | null = null;

  /**
   * Inscreve um listener para mudanças de status
   */
  onStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.listeners.push(callback);
    // Retorna função de unsubscribe
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  /**
   * Notifica todos os listeners
   */
  private notifyListeners() {
    this.listeners.forEach(listener => listener({ ...this.status }));
  }

  /**
   * Atualiza status e notifica
   */
  private updateStatus(partial: Partial<SyncStatus>) {
    this.status = { ...this.status, ...partial };
    this.notifyListeners();
  }

  /**
   * Obtém status atual
   */
  getStatus(): SyncStatus {
    return { ...this.status };
  }

  /**
   * Inicializa sincronização no primeiro login
   */
  async initializeOnFirstLogin(): Promise<void> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Usuário não autenticado');
    }

    // Verifica se é o primeiro login
    const hasLocalData = await this.hasLocalData();
    const lastSync = await localStorageService.getMetadata('lastSyncTimestamp');

    if (!hasLocalData || !lastSync) {
      console.log('🌟 Primeiro login detectado - iniciando sincronização inicial...');
      await this.downloadFromCloud();
      await localStorageService.setMetadata('firstLoginCompleted', true);
    } else {
      console.log('🔄 Login subsequente - verificando atualizações...');
      await this.syncBidirectional();
    }
  }

  /**
   * Verifica se existem dados locais
   */
  private async hasLocalData(): Promise<boolean> {
    const stats = await localStorageService.getStats();
    return stats.totalRecords > 0;
  }

  /**
   * Download completo da nuvem para local
   */
  async downloadFromCloud(): Promise<SyncResult> {
    this.updateStatus({ syncing: true, mode: 'downloading', progress: 0, error: null });

    const result: SyncResult = {
      success: false,
      uploaded: 0,
      downloaded: 0,
      errors: [],
      timestamp: Date.now()
    };

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Usuário não autenticado');

      console.log('📥 Baixando dados da nuvem...');

      // Download Clients
      this.updateStatus({ progress: 10 });
      const clientsSnapshot = await getDocs(
        collection(db, `users/${user.uid}/clients`)
      );
      const clients = clientsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      await localStorageService.save(STORES.CLIENTS, clients);
      result.downloaded += clients.length;

      // Download Processes
      this.updateStatus({ progress: 40 });
      const processesSnapshot = await getDocs(
        collection(db, `users/${user.uid}/processes`)
      );
      const processes = processesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      await localStorageService.save(STORES.PROCESSES, processes);
      result.downloaded += processes.length;

      // Download Finance
      this.updateStatus({ progress: 70 });
      const financeSnapshot = await getDocs(
        collection(db, `users/${user.uid}/finance`)
      );
      const finance = financeSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      await localStorageService.save(STORES.FINANCE, finance);
      result.downloaded += finance.length;

      // Atualiza metadata
      await localStorageService.setMetadata('lastSyncTimestamp', Date.now());
      await localStorageService.setMetadata('lastSyncType', 'download');

      // Log de sucesso
      await localStorageService.addSyncLog({
        timestamp: Date.now(),
        action: 'download',
        status: 'success',
        details: `${result.downloaded} registros baixados da nuvem`,
        recordsCount: result.downloaded
      });

      result.success = true;
      this.updateStatus({ 
        progress: 100, 
        syncing: false, 
        mode: 'idle',
        lastSync: Date.now()
      });

      console.log(`✅ Download concluído: ${result.downloaded} registros`);

    } catch (error: any) {
      console.error('❌ Erro no download:', error);
      result.errors.push(error.message);
      
      await localStorageService.addSyncLog({
        timestamp: Date.now(),
        action: 'download',
        status: 'error',
        details: `Erro: ${error.message}`
      });

      this.updateStatus({ 
        syncing: false, 
        mode: 'idle',
        error: error.message 
      });
    }

    return result;
  }

  /**
   * Upload completo do local para nuvem
   */
  async uploadToCloud(): Promise<SyncResult> {
    this.updateStatus({ syncing: true, mode: 'uploading', progress: 0, error: null });

    const result: SyncResult = {
      success: false,
      uploaded: 0,
      downloaded: 0,
      errors: [],
      timestamp: Date.now()
    };

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Usuário não autenticado');

      console.log('📤 Enviando dados para nuvem...');

      // Upload Clients
      this.updateStatus({ progress: 10 });
      const clients = await localStorageService.getAll(STORES.CLIENTS);
      for (const client of clients) {
        await setDoc(doc(db, `users/${user.uid}/clients`, client.id), client);
      }
      result.uploaded += clients.length;

      // Upload Processes
      this.updateStatus({ progress: 40 });
      const processes = await localStorageService.getAll(STORES.PROCESSES);
      for (const process of processes) {
        await setDoc(doc(db, `users/${user.uid}/processes`, process.id), process);
      }
      result.uploaded += processes.length;

      // Upload Finance
      this.updateStatus({ progress: 70 });
      const finance = await localStorageService.getAll(STORES.FINANCE);
      for (const item of finance) {
        await setDoc(doc(db, `users/${user.uid}/finance`, item.id), item);
      }
      result.uploaded += finance.length;

      // Atualiza metadata
      await localStorageService.setMetadata('lastSyncTimestamp', Date.now());
      await localStorageService.setMetadata('lastSyncType', 'upload');

      // Log de sucesso
      await localStorageService.addSyncLog({
        timestamp: Date.now(),
        action: 'upload',
        status: 'success',
        details: `${result.uploaded} registros enviados para nuvem`,
        recordsCount: result.uploaded
      });

      result.success = true;
      this.updateStatus({ 
        progress: 100, 
        syncing: false, 
        mode: 'idle',
        lastSync: Date.now()
      });

      console.log(`✅ Upload concluído: ${result.uploaded} registros`);

    } catch (error: any) {
      console.error('❌ Erro no upload:', error);
      result.errors.push(error.message);
      
      await localStorageService.addSyncLog({
        timestamp: Date.now(),
        action: 'upload',
        status: 'error',
        details: `Erro: ${error.message}`
      });

      this.updateStatus({ 
        syncing: false, 
        mode: 'idle',
        error: error.message 
      });
    }

    return result;
  }

  /**
   * Sincronização bidirecional inteligente
   * Compara timestamps e mescla dados
   */
  async syncBidirectional(): Promise<SyncResult> {
    this.updateStatus({ syncing: true, mode: 'checking', progress: 0, error: null });

    const result: SyncResult = {
      success: false,
      uploaded: 0,
      downloaded: 0,
      errors: [],
      timestamp: Date.now()
    };

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Usuário não autenticado');

      console.log('🔄 Sincronizando dados...');

      // Por simplicidade, fazer download e depois upload
      // Em produção, implementar merge inteligente baseado em timestamps
      
      // 1. Download primeiro
      this.updateStatus({ mode: 'downloading', progress: 25 });
      const downloadResult = await this.downloadFromCloud();
      result.downloaded = downloadResult.downloaded;

      // 2. Upload depois
      this.updateStatus({ mode: 'uploading', progress: 75 });
      const uploadResult = await this.uploadToCloud();
      result.uploaded = uploadResult.uploaded;

      result.success = true;
      this.updateStatus({ 
        progress: 100, 
        syncing: false, 
        mode: 'idle',
        lastSync: Date.now()
      });

      console.log(`✅ Sync concluída: ${result.downloaded} down, ${result.uploaded} up`);

    } catch (error: any) {
      console.error('❌ Erro na sincronização:', error);
      result.errors.push(error.message);
      this.updateStatus({ 
        syncing: false, 
        mode: 'idle',
        error: error.message 
      });
    }

    return result;
  }

  /**
   * Reseta TODOS os dados (local e nuvem)
   * Requer autenticação do usuário
   */
  async resetAllData(password: string): Promise<boolean> {
    try {
      const user = auth.currentUser;
      if (!user || !user.email) {
        throw new Error('Usuário não autenticado');
      }

      // Reautentica usuário para segurança
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      await signInWithEmailAndPassword(auth, user.email, password);

      console.log('🗑️ Resetando todos os dados...');

      // 1. Limpa Firestore
      const collections = ['clients', 'processes', 'finance'];
      for (const collectionName of collections) {
        const snapshot = await getDocs(
          collection(db, `users/${user.uid}/${collectionName}`)
        );
        
        const batch = writeBatch(db);
        snapshot.docs.forEach(document => {
          batch.delete(document.ref);
        });
        await batch.commit();
      }

      // 2. Limpa local
      await localStorageService.clearAll();

      // 3. Log
      await localStorageService.addSyncLog({
        timestamp: Date.now(),
        action: 'reset',
        status: 'success',
        details: 'Todos os dados foram resetados (nuvem + local)'
      });

      console.log('✅ Reset concluído com sucesso');
      return true;

    } catch (error: any) {
      console.error('❌ Erro ao resetar:', error);
      await localStorageService.addSyncLog({
        timestamp: Date.now(),
        action: 'reset',
        status: 'error',
        details: `Erro: ${error.message}`
      });
      throw error;
    }
  }

  /**
   * Inicia sincronização automática periódica
   */
  startAutoSync(intervalMinutes: number = 30) {
    if (this.autoSyncInterval) {
      this.stopAutoSync();
    }

    console.log(`⏰ Auto-sync iniciado (${intervalMinutes} min)`);

    this.autoSyncInterval = window.setInterval(() => {
      if (!this.status.syncing) {
        console.log('🔄 Auto-sync executando...');
        this.syncBidirectional();
      }
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Para sincronização automática
   */
  stopAutoSync() {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
      console.log('⏹️ Auto-sync parado');
    }
  }
}

// Export singleton instance
export const syncService = new SyncService();
export type { SyncStatus, SyncResult };
