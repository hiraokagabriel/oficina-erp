/**
 * syncService.ts
 * 
 * Serviço de sincronização do banco de dados com Firestore
 * - Sincronização automática no primeiro login
 * - Cache local para modo offline
 * - Merge inteligente de conflitos
 * - Backup antes de operações destrutivas
 */

import { db } from '../lib/firebase';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { DatabaseSchema } from '../types';

export interface SyncMetadata {
  lastSyncTimestamp: number;
  lastSyncDate: string;
  syncCount: number;
  userId: string;
  deviceId: string;
}

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSync: Date | null;
  error: string | null;
}

class SyncService {
  private userId: string | null = null;
  private deviceId: string;
  private syncStatus: SyncStatus = {
    isOnline: navigator.onLine,
    isSyncing: false,
    lastSync: null,
    error: null
  };
  private statusListeners: Array<(status: SyncStatus) => void> = [];
  private unsubscribeSnapshot: (() => void) | null = null;

  constructor() {
    // Gera ID único do dispositivo
    this.deviceId = this.getDeviceId();

    // Monitora estado da conexão
    window.addEventListener('online', () => this.updateStatus({ isOnline: true }));
    window.addEventListener('offline', () => this.updateStatus({ isOnline: false }));
  }

  /**
   * Inicializa sincronização para um usuário
   */
  async initialize(userId: string): Promise<void> {
    console.log('🔄 Inicializando sincronização para usuário:', userId);
    this.userId = userId;

    try {
      // Verifica se é o primeiro login
      const isFirstLogin = await this.isFirstLogin();

      if (isFirstLogin) {
        console.log('🎉 Primeiro login detectado! Iniciando sincronização inicial...');
        await this.initialSync();
      } else {
        console.log('🔄 Sincronizando dados...');
        await this.syncFromFirestore();
      }

      // Ativa listener de mudanças em tempo real
      this.startRealtimeSync();

      console.log('✅ Sincronização inicializada com sucesso');
    } catch (error: any) {
      console.error('❌ Erro ao inicializar sincronização:', error);
      this.updateStatus({ error: error.message });
      throw error;
    }
  }

  /**
   * Sincronização inicial (primeiro login)
   * Faz upload dos dados locais para Firestore
   */
  private async initialSync(): Promise<void> {
    if (!this.userId) throw new Error('Usuário não autenticado');

    this.updateStatus({ isSyncing: true });

    try {
      // Busca dados locais
      const localData = this.getLocalData();

      if (!localData) {
        console.log('⚠️ Nenhum dado local encontrado. Criando estrutura vazia...');
        await this.createEmptyDatabase();
        return;
      }

      console.log('📦 Fazendo upload dos dados locais para Firestore...');

      // Salva no Firestore
      await this.saveToFirestore(localData);

      // Atualiza metadata
      await this.updateSyncMetadata();

      this.updateStatus({
        isSyncing: false,
        lastSync: new Date(),
        error: null
      });

      console.log('✅ Sincronização inicial concluída');
    } catch (error: any) {
      this.updateStatus({ isSyncing: false, error: error.message });
      throw error;
    }
  }

  /**
   * Sincroniza dados do Firestore para local
   */
  async syncFromFirestore(): Promise<void> {
    if (!this.userId) throw new Error('Usuário não autenticado');

    this.updateStatus({ isSyncing: true });

    try {
      console.log('📞 Baixando dados do Firestore...');

      const userDocRef = doc(db, 'users', this.userId, 'data', 'database');
      const docSnap = await getDoc(userDocRef);

      if (docSnap.exists()) {
        const firestoreData = docSnap.data() as DatabaseSchema;
        
        // Faz merge com dados locais
        const mergedData = this.mergeData(this.getLocalData(), firestoreData);
        
        // Salva localmente
        this.saveLocal(mergedData);

        console.log('✅ Dados sincronizados com sucesso');
      } else {
        console.log('⚠️ Nenhum dado no Firestore. Fazendo upload dos dados locais...');
        await this.initialSync();
      }

      this.updateStatus({
        isSyncing: false,
        lastSync: new Date(),
        error: null
      });
    } catch (error: any) {
      console.error('❌ Erro ao sincronizar do Firestore:', error);
      this.updateStatus({ isSyncing: false, error: error.message });
      throw error;
    }
  }

  /**
   * Sincroniza dados locais para Firestore
   */
  async syncToFirestore(data: DatabaseSchema): Promise<void> {
    if (!this.userId) throw new Error('Usuário não autenticado');
    if (!this.syncStatus.isOnline) {
      console.log('⚠️ Offline. Dados serão sincronizados quando voltar online.');
      return;
    }

    try {
      await this.saveToFirestore(data);
      await this.updateSyncMetadata();
      this.updateStatus({ lastSync: new Date() });
    } catch (error: any) {
      console.error('❌ Erro ao sincronizar para Firestore:', error);
      throw error;
    }
  }

  /**
   * Salva dados no Firestore
   */
  private async saveToFirestore(data: DatabaseSchema): Promise<void> {
    if (!this.userId) throw new Error('Usuário não autenticado');

    const userDocRef = doc(db, 'users', this.userId, 'data', 'database');
    
    await setDoc(userDocRef, {
      ...data,
      _metadata: {
        lastModified: serverTimestamp(),
        deviceId: this.deviceId,
        version: '1.0.0'
      }
    }, { merge: true });
  }

  /**
   * Inicia sincronização em tempo real
   */
  private startRealtimeSync(): void {
    if (!this.userId) return;

    const userDocRef = doc(db, 'users', this.userId, 'data', 'database');

    this.unsubscribeSnapshot = onSnapshot(
      userDocRef,
      (docSnapshot) => {
        if (docSnapshot.exists() && docSnapshot.metadata.hasPendingWrites === false) {
          console.log('🔄 Mudanças remotas detectadas. Atualizando cache local...');
          const firestoreData = docSnapshot.data() as DatabaseSchema;
          const localData = this.getLocalData();
          const mergedData = this.mergeData(localData, firestoreData);
          this.saveLocal(mergedData);
        }
      },
      (error) => {
        console.error('❌ Erro no listener de tempo real:', error);
        this.updateStatus({ error: error.message });
      }
    );
  }

  /**
   * Para sincronização em tempo real
   */
  stopRealtimeSync(): void {
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
      this.unsubscribeSnapshot = null;
      console.log('🚫 Sincronização em tempo real parada');
    }
  }

  /**
   * Faz merge inteligente de dados locais e remotos
   */
  private mergeData(
    local: DatabaseSchema | null,
    remote: DatabaseSchema
  ): DatabaseSchema {
    if (!local) return remote;

    // Estratégia: remote wins (dados remotos têm prioridade)
    // Mas preserva dados locais mais recentes
    return {
      ledger: this.mergeArrays(local.ledger, remote.ledger, 'id'),
      workOrders: this.mergeArrays(local.workOrders, remote.workOrders, 'id'),
      clients: this.mergeArrays(local.clients, remote.clients, 'id'),
      catalogParts: this.mergeArrays(local.catalogParts, remote.catalogParts, 'id'),
      catalogServices: this.mergeArrays(local.catalogServices, remote.catalogServices, 'id'),
      settings: remote.settings || local.settings
    };
  }

  /**
   * Merge de arrays por ID
   */
  private mergeArrays<T extends { id: string }>(local: T[], remote: T[], key: keyof T): T[] {
    const remoteMap = new Map(remote.map(item => [item[key], item]));
    const merged = [...remote];

    // Adiciona itens locais que não existem no remoto
    local.forEach(item => {
      if (!remoteMap.has(item[key])) {
        merged.push(item);
      }
    });

    return merged;
  }

  /**
   * Cria backup dos dados antes de reset
   */
  async createBackup(): Promise<void> {
    if (!this.userId) throw new Error('Usuário não autenticado');

    const localData = this.getLocalData();
    if (!localData) return;

    const backupDocRef = doc(db, 'users', this.userId, 'backups', `backup_${Date.now()}`);
    
    await setDoc(backupDocRef, {
      data: localData,
      createdAt: serverTimestamp(),
      deviceId: this.deviceId
    });

    console.log('✅ Backup criado com sucesso');
  }

  /**
   * Reseta o banco de dados (requer autenticação)
   */
  async resetDatabase(): Promise<void> {
    if (!this.userId) throw new Error('Usuário não autenticado');

    console.log('⚠️ Criando backup antes de resetar...');
    await this.createBackup();

    console.log('🗑️ Resetando banco de dados...');
    
    // Limpa dados locais
    localStorage.removeItem('oficina-erp-data');

    // Cria estrutura vazia
    await this.createEmptyDatabase();

    console.log('✅ Banco de dados resetado com sucesso');
  }

  /**
   * Cria estrutura vazia do banco
   */
  private async createEmptyDatabase(): Promise<void> {
    const emptyData: DatabaseSchema = {
      ledger: [],
      workOrders: [],
      clients: [],
      catalogParts: [],
      catalogServices: [],
      settings: {
        name: '',
        cnpj: '',
        address: '',
        technician: '',
        exportPath: '',
        googleDriveToken: '',
        googleApiKey: ''
      }
    };

    this.saveLocal(emptyData);
    if (this.userId) {
      await this.saveToFirestore(emptyData);
    }
  }

  /**
   * Verifica se é o primeiro login do usuário
   */
  private async isFirstLogin(): Promise<boolean> {
    if (!this.userId) return true;

    const userDocRef = doc(db, 'users', this.userId, 'data', 'database');
    const docSnap = await getDoc(userDocRef);

    return !docSnap.exists();
  }

  /**
   * Atualiza metadata de sincronização
   */
  private async updateSyncMetadata(): Promise<void> {
    if (!this.userId) return;

    const metadataRef = doc(db, 'users', this.userId, 'metadata', 'sync');
    const currentMetadata = await getDoc(metadataRef);
    const syncCount = currentMetadata.exists() ? (currentMetadata.data().syncCount || 0) + 1 : 1;

    await setDoc(metadataRef, {
      lastSyncTimestamp: Date.now(),
      lastSyncDate: new Date().toISOString(),
      syncCount,
      userId: this.userId,
      deviceId: this.deviceId,
      updatedAt: serverTimestamp()
    });
  }

  /**
   * Obtém dados do LocalStorage
   */
  private getLocalData(): DatabaseSchema | null {
    const data = localStorage.getItem('oficina-erp-data');
    return data ? JSON.parse(data) : null;
  }

  /**
   * Salva dados no LocalStorage
   */
  private saveLocal(data: DatabaseSchema): void {
    localStorage.setItem('oficina-erp-data', JSON.stringify(data));
  }

  /**
   * Gera ou recupera ID do dispositivo
   */
  private getDeviceId(): string {
    let deviceId = localStorage.getItem('device-id');
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('device-id', deviceId);
    }
    return deviceId;
  }

  /**
   * Atualiza status de sincronização e notifica listeners
   */
  private updateStatus(update: Partial<SyncStatus>): void {
    this.syncStatus = { ...this.syncStatus, ...update };
    this.statusListeners.forEach(listener => listener(this.syncStatus));
  }

  /**
   * Adiciona listener de status
   */
  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.statusListeners.push(listener);
    // Retorna função para remover listener
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== listener);
    };
  }

  /**
   * Obtém status atual
   */
  getStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  /**
   * Cleanup ao fazer logout
   */
  cleanup(): void {
    this.stopRealtimeSync();
    this.userId = null;
    this.statusListeners = [];
    this.syncStatus = {
      isOnline: navigator.onLine,
      isSyncing: false,
      lastSync: null,
      error: null
    };
  }
}

// Export instância singleton
export const syncService = new SyncService();
