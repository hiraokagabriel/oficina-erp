/**
 * SYNC SERVICE - Sincronização Cloud (Firestore) + Local (IndexedDB)
 * 
 * Funcionalidades:
 * - Sincronização automática no primeiro login
 * - Cache local para offline-first
 * - Backup automático
 * - Reset do banco via autenticação
 * - Migração de dados existentes
 */

import { db } from '../lib/firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  Timestamp,
  onSnapshot
} from 'firebase/firestore';
import { auth } from '../lib/firebase';

// ============================================================================
// TIPOS
// ============================================================================

export interface SyncStatus {
  lastSync: Date | null;
  syncInProgress: boolean;
  itemsSynced: number;
  errors: string[];
}

export interface BackupMetadata {
  createdAt: Date;
  userId: string;
  userEmail: string;
  itemCount: number;
  collections: string[];
}

// ============================================================================
// INDEXEDDB - CACHE LOCAL
// ============================================================================

class LocalDatabase {
  private dbName = 'oficina-erp-local';
  private version = 1;
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        
        // Criar object stores se não existirem
        const stores = ['clientes', 'processos', 'financeiro', 'oficina', 'metadata'];
        stores.forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'id' });
          }
        });
      };
    });
  }

  async saveToStore(storeName: string, data: any[]): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      // Limpar store antes de salvar
      store.clear();
      
      // Adicionar todos os itens
      data.forEach(item => store.add(item));
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getFromStore(storeName: string): Promise<any[]> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveMetadata(key: string, value: any): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['metadata'], 'readwrite');
      const store = transaction.objectStore('metadata');
      
      store.put({ id: key, value, updatedAt: new Date() });
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getMetadata(key: string): Promise<any> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['metadata'], 'readonly');
      const store = transaction.objectStore('metadata');
      const request = store.get(key);
      
      request.onsuccess = () => resolve(request.result?.value);
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll(): Promise<void> {
    if (!this.db) await this.init();
    
    const stores = ['clientes', 'processos', 'financeiro', 'oficina', 'metadata'];
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(stores, 'readwrite');
      
      stores.forEach(storeName => {
        transaction.objectStore(storeName).clear();
      });
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

const localDB = new LocalDatabase();

// ============================================================================
// SINCRONIZAÇÃO COM FIRESTORE
// ============================================================================

export class SyncService {
  private userId: string | null = null;
  private syncListeners: Map<string, () => void> = new Map();

  constructor() {
    // Inicializar IndexedDB
    localDB.init().catch(err => console.error('Erro ao inicializar IndexedDB:', err));
  }

  /**
   * Define o usuário atual para sincronização
   */
  setUser(userId: string) {
    this.userId = userId;
  }

  /**
   * Sincronização inicial - baixa dados da nuvem e salva localmente
   */
  async initialSync(): Promise<SyncStatus> {
    console.log('🔄 Iniciando sincronização inicial...');
    
    const status: SyncStatus = {
      lastSync: null,
      syncInProgress: true,
      itemsSynced: 0,
      errors: []
    };

    if (!this.userId) {
      status.errors.push('Usuário não autenticado');
      status.syncInProgress = false;
      return status;
    }

    try {
      // Verificar se já sincronizou antes
      const lastSyncDate = await localDB.getMetadata('lastSync');
      
      if (lastSyncDate) {
        console.log('✅ Já sincronizado anteriormente em:', lastSyncDate);
        // Se já sincronizou, apenas atualizar
        return await this.syncFromCloud();
      }

      // Primeira sincronização - baixar tudo da nuvem
      const collections = ['clientes', 'processos', 'financeiro', 'oficina'];
      
      for (const collectionName of collections) {
        const data = await this.downloadCollection(collectionName);
        await localDB.saveToStore(collectionName, data);
        status.itemsSynced += data.length;
        console.log(`✅ ${collectionName}: ${data.length} itens sincronizados`);
      }

      // Salvar metadata
      await localDB.saveMetadata('lastSync', new Date());
      await localDB.saveMetadata('userId', this.userId);
      
      status.lastSync = new Date();
      status.syncInProgress = false;
      
      console.log('✅ Sincronização inicial concluída:', status.itemsSynced, 'itens');
      
    } catch (error: any) {
      console.error('❌ Erro na sincronização:', error);
      status.errors.push(error.message);
      status.syncInProgress = false;
    }

    return status;
  }

  /**
   * Baixa uma coleção do Firestore
   */
  private async downloadCollection(collectionName: string): Promise<any[]> {
    const collectionRef = collection(db, `users/${this.userId}/${collectionName}`);
    const snapshot = await getDocs(collectionRef);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  }

  /**
   * Sincroniza dados da nuvem para local
   */
  async syncFromCloud(): Promise<SyncStatus> {
    const status: SyncStatus = {
      lastSync: null,
      syncInProgress: true,
      itemsSynced: 0,
      errors: []
    };

    if (!this.userId) {
      status.errors.push('Usuário não autenticado');
      status.syncInProgress = false;
      return status;
    }

    try {
      const collections = ['clientes', 'processos', 'financeiro', 'oficina'];
      
      for (const collectionName of collections) {
        const data = await this.downloadCollection(collectionName);
        await localDB.saveToStore(collectionName, data);
        status.itemsSynced += data.length;
      }

      await localDB.saveMetadata('lastSync', new Date());
      status.lastSync = new Date();
      status.syncInProgress = false;
      
      console.log('✅ Sincronização concluída:', status.itemsSynced, 'itens');
      
    } catch (error: any) {
      console.error('❌ Erro na sincronização:', error);
      status.errors.push(error.message);
      status.syncInProgress = false;
    }

    return status;
  }

  /**
   * Sincroniza dados locais para a nuvem
   */
  async syncToCloud(): Promise<SyncStatus> {
    const status: SyncStatus = {
      lastSync: null,
      syncInProgress: true,
      itemsSynced: 0,
      errors: []
    };

    if (!this.userId) {
      status.errors.push('Usuário não autenticado');
      status.syncInProgress = false;
      return status;
    }

    try {
      const collections = ['clientes', 'processos', 'financeiro', 'oficina'];
      
      for (const collectionName of collections) {
        const localData = await localDB.getFromStore(collectionName);
        
        // Upload em batch para performance
        const batch = writeBatch(db);
        
        localData.forEach(item => {
          const docRef = doc(db, `users/${this.userId}/${collectionName}`, item.id);
          batch.set(docRef, {
            ...item,
            updatedAt: Timestamp.now()
          });
        });
        
        await batch.commit();
        status.itemsSynced += localData.length;
        
        console.log(`✅ ${collectionName}: ${localData.length} itens enviados`);
      }

      await localDB.saveMetadata('lastSync', new Date());
      status.lastSync = new Date();
      status.syncInProgress = false;
      
      console.log('✅ Upload concluído:', status.itemsSynced, 'itens');
      
    } catch (error: any) {
      console.error('❌ Erro no upload:', error);
      status.errors.push(error.message);
      status.syncInProgress = false;
    }

    return status;
  }

  /**
   * Ativar sincronização em tempo real
   */
  enableRealtimeSync(collectionName: string, callback: (data: any[]) => void) {
    if (!this.userId) {
      console.error('❌ Não é possível ativar sync em tempo real sem usuário');
      return;
    }

    const collectionRef = collection(db, `users/${this.userId}/${collectionName}`);
    
    const unsubscribe = onSnapshot(collectionRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Atualizar cache local
      localDB.saveToStore(collectionName, data);
      
      // Callback com dados atualizados
      callback(data);
      
      console.log(`🔄 ${collectionName} atualizado em tempo real:`, data.length, 'itens');
    });

    this.syncListeners.set(collectionName, unsubscribe);
  }

  /**
   * Desativar sincronização em tempo real
   */
  disableRealtimeSync(collectionName: string) {
    const unsubscribe = this.syncListeners.get(collectionName);
    if (unsubscribe) {
      unsubscribe();
      this.syncListeners.delete(collectionName);
      console.log(`❌ Sync em tempo real desativado para ${collectionName}`);
    }
  }

  /**
   * Criar backup completo
   */
  async createBackup(): Promise<BackupMetadata> {
    if (!this.userId || !auth.currentUser) {
      throw new Error('Usuário não autenticado');
    }

    const collections = ['clientes', 'processos', 'financeiro', 'oficina'];
    const backup: any = {};
    let totalItems = 0;

    for (const collectionName of collections) {
      const data = await localDB.getFromStore(collectionName);
      backup[collectionName] = data;
      totalItems += data.length;
    }

    const metadata: BackupMetadata = {
      createdAt: new Date(),
      userId: this.userId,
      userEmail: auth.currentUser.email || '',
      itemCount: totalItems,
      collections
    };

    // Salvar backup em Firestore
    const backupRef = doc(db, `backups/${this.userId}/snapshots/${Date.now()}`);
    await setDoc(backupRef, {
      ...backup,
      metadata
    });

    // Também salvar localmente como JSON
    const backupData = JSON.stringify({ ...backup, metadata }, null, 2);
    this.downloadBackupFile(backupData, `backup-${Date.now()}.json`);

    console.log('✅ Backup criado:', metadata);
    return metadata;
  }

  /**
   * Download de arquivo de backup
   */
  private downloadBackupFile(content: string, filename: string) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Resetar banco de dados (requer autenticação)
   */
  async resetDatabase(password: string): Promise<boolean> {
    if (!auth.currentUser || !auth.currentUser.email) {
      throw new Error('Usuário não autenticado');
    }

    try {
      // Reautenticar usuário para confirmar senha
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      await signInWithEmailAndPassword(auth, auth.currentUser.email, password);

      console.log('⚠️ Resetando banco de dados...');

      // 1. Limpar IndexedDB local
      await localDB.clearAll();
      console.log('✅ Cache local limpo');

      // 2. Deletar dados do Firestore
      const collections = ['clientes', 'processos', 'financeiro', 'oficina'];
      
      for (const collectionName of collections) {
        const collectionRef = collection(db, `users/${this.userId}/${collectionName}`);
        const snapshot = await getDocs(collectionRef);
        
        const batch = writeBatch(db);
        snapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        
        await batch.commit();
        console.log(`✅ ${collectionName} limpo`);
      }

      console.log('✅ Banco de dados resetado com sucesso');
      return true;
      
    } catch (error: any) {
      console.error('❌ Erro ao resetar banco:', error);
      
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
        throw new Error('Senha incorreta');
      }
      
      throw error;
    }
  }

  /**
   * Obter dados locais (cache)
   */
  async getLocalData(collectionName: string): Promise<any[]> {
    return await localDB.getFromStore(collectionName);
  }

  /**
   * Salvar dados localmente
   */
  async saveLocalData(collectionName: string, data: any[]): Promise<void> {
    await localDB.saveToStore(collectionName, data);
  }

  /**
   * Status da última sincronização
   */
  async getLastSyncStatus(): Promise<{ lastSync: Date | null; userId: string | null }> {
    const lastSync = await localDB.getMetadata('lastSync');
    const userId = await localDB.getMetadata('userId');
    
    return { lastSync, userId };
  }
}

// Export instância singleton
export const syncService = new SyncService();
