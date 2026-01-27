/**
 * 🔄 SYNC SERVICE - Sincronização Firestore + Backup Local
 * 
 * Funcionalidades:
 * - Sincronização bidirecional Firestore <-> Local
 * - Backup automático em IndexedDB
 * - Backup em arquivo JSON (Tauri)
 * - Modo offline com cache
 * - Resolução de conflitos (last-write-wins)
 * - Versionamento de dados
 */

import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  writeBatch,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { invoke } from '@tauri-apps/api/core';
import { DatabaseSchema } from '../types';

// ==============================
// TIPOS
// ==============================

export interface SyncMetadata {
  userId: string;
  lastSyncAt: string;
  version: number;
  deviceId: string;
  platform: string;
}

export interface SyncStatus {
  isOnline: boolean;
  lastSync: Date | null;
  isSyncing: boolean;
  error: string | null;
  pendingChanges: number;
}

export interface BackupInfo {
  timestamp: string;
  size: number;
  source: 'firestore' | 'local' | 'manual';
  metadata: SyncMetadata;
}

// ==============================
// CONSTANTES
// ==============================

const COLLECTION_NAME = 'workshops';
const BACKUP_DB_NAME = 'oficina_backup';
const BACKUP_STORE_NAME = 'database_snapshots';
const DEVICE_ID_KEY = 'oficina_device_id';
const MAX_BACKUPS = 10; // Máximo de backups locais

// ==============================
// INDEXEDDB - Backup Local
// ==============================

class LocalBackupDB {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(BACKUP_DB_NAME, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(BACKUP_STORE_NAME)) {
          const store = db.createObjectStore(BACKUP_STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('source', 'source', { unique: false });
        }
      };
    });
  }

  async saveBackup(data: DatabaseSchema, source: 'firestore' | 'local' | 'manual'): Promise<void> {
    if (!this.db) await this.init();

    const backup: BackupInfo & { data: DatabaseSchema } = {
      timestamp: new Date().toISOString(),
      size: JSON.stringify(data).length,
      source,
      metadata: {
        userId: auth.currentUser?.uid || 'anonymous',
        lastSyncAt: new Date().toISOString(),
        version: data.settings?.version || 1,
        deviceId: getDeviceId(),
        platform: navigator.platform
      },
      data
    };

    const transaction = this.db!.transaction([BACKUP_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(BACKUP_STORE_NAME);
    
    await store.add(backup);

    // Limita quantidade de backups
    await this.cleanOldBackups();
  }

  async getLatestBackup(): Promise<(BackupInfo & { data: DatabaseSchema }) | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([BACKUP_STORE_NAME], 'readonly');
      const store = transaction.objectStore(BACKUP_STORE_NAME);
      const index = store.index('timestamp');
      const request = index.openCursor(null, 'prev'); // Mais recente primeiro

      request.onsuccess = () => {
        const cursor = request.result;
        resolve(cursor ? cursor.value : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getAllBackups(): Promise<BackupInfo[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([BACKUP_STORE_NAME], 'readonly');
      const store = transaction.objectStore(BACKUP_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result.map(r => ({
        timestamp: r.timestamp,
        size: r.size,
        source: r.source,
        metadata: r.metadata
      })));
      request.onerror = () => reject(request.error);
    });
  }

  async deleteBackup(timestamp: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([BACKUP_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(BACKUP_STORE_NAME);
      const index = store.index('timestamp');
      const request = index.openCursor(IDBKeyRange.only(timestamp));

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async cleanOldBackups(): Promise<void> {
    const backups = await this.getAllBackups();
    
    if (backups.length > MAX_BACKUPS) {
      const toDelete = backups
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .slice(0, backups.length - MAX_BACKUPS);

      for (const backup of toDelete) {
        await this.deleteBackup(backup.timestamp);
      }
    }
  }

  async clearAll(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([BACKUP_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(BACKUP_STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

const localBackupDB = new LocalBackupDB();

// ==============================
// UTILITÁRIOS
// ==============================

function getDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

function getUserDocPath(): string {
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('❌ Usuário não autenticado');
  return userId;
}

// ==============================
// FIRESTORE - Operações
// ==============================

export async function uploadToFirestore(data: DatabaseSchema): Promise<void> {
  const userId = getUserDocPath();
  const docRef = doc(db, COLLECTION_NAME, userId);

  const metadata: SyncMetadata = {
    userId,
    lastSyncAt: new Date().toISOString(),
    version: (data.settings?.version || 0) + 1,
    deviceId: getDeviceId(),
    platform: navigator.platform
  };

  const dataWithMetadata = {
    ...data,
    _metadata: metadata,
    updatedAt: Timestamp.now()
  };

  await setDoc(docRef, dataWithMetadata, { merge: true });
  console.log('✅ Dados enviados para Firestore');
}

export async function downloadFromFirestore(): Promise<DatabaseSchema | null> {
  const userId = getUserDocPath();
  const docRef = doc(db, COLLECTION_NAME, userId);

  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    const data = docSnap.data();
    const { _metadata, updatedAt, ...cleanData } = data;
    console.log('✅ Dados baixados do Firestore');
    return cleanData as DatabaseSchema;
  }

  console.log('⚠️ Nenhum dado encontrado no Firestore');
  return null;
}

export async function syncWithFirestore(
  localData: DatabaseSchema,
  onProgress?: (message: string, progress: number) => void
): Promise<DatabaseSchema> {
  try {
    onProgress?.('Conectando ao Firestore...', 10);

    // 1. Baixar dados da nuvem
    onProgress?.('Baixando dados da nuvem...', 30);
    const cloudData = await downloadFromFirestore();

    if (!cloudData) {
      // Primeira sincronização - Fazer upload dos dados locais
      onProgress?.('Primeira sincronização - Enviando dados...', 60);
      await uploadToFirestore(localData);
      onProgress?.('Salvando backup local...', 80);
      await localBackupDB.saveBackup(localData, 'firestore');
      onProgress?.('Sincronização concluída!', 100);
      return localData;
    }

    // 2. Resolver conflitos (last-write-wins)
    onProgress?.('Resolvendo conflitos...', 50);
    const mergedData = mergeData(localData, cloudData);

    // 3. Fazer upload dos dados mesclados
    onProgress?.('Enviando dados atualizados...', 70);
    await uploadToFirestore(mergedData);

    // 4. Salvar backup local
    onProgress?.('Salvando backup local...', 90);
    await localBackupDB.saveBackup(mergedData, 'firestore');

    onProgress?.('Sincronização concluída!', 100);
    return mergedData;
  } catch (error) {
    console.error('❌ Erro na sincronização:', error);
    throw error;
  }
}

// ==============================
// MERGE DE DADOS
// ==============================

function mergeData(local: DatabaseSchema, cloud: DatabaseSchema): DatabaseSchema {
  // Estratégia: Last-Write-Wins
  // Compara timestamps e mantém o mais recente

  const localVersion = local.settings?.version || 0;
  const cloudVersion = cloud.settings?.version || 0;

  console.log(`🔄 Mesclando dados: Local v${localVersion} <-> Cloud v${cloudVersion}`);

  // Se versões são iguais, mantém dados locais (usuário acabou de modificar)
  if (localVersion >= cloudVersion) {
    console.log('💾 Dados locais são mais recentes ou iguais');
    return {
      ...local,
      settings: {
        ...local.settings,
        version: localVersion + 1
      }
    };
  }

  // Dados da nuvem são mais recentes
  console.log('☁️ Dados da nuvem são mais recentes');
  return {
    ...cloud,
    settings: {
      ...cloud.settings,
      version: cloudVersion + 1
    }
  };
}

// ==============================
// BACKUP EM ARQUIVO (Tauri)
// ==============================

export async function saveFileBackup(
  data: DatabaseSchema,
  filepath?: string
): Promise<void> {
  const dbPath = filepath || localStorage.getItem('oficina_db_path') || 'C:\\OficinaData\\database.json';
  
  const metadata: SyncMetadata = {
    userId: auth.currentUser?.uid || 'anonymous',
    lastSyncAt: new Date().toISOString(),
    version: data.settings?.version || 1,
    deviceId: getDeviceId(),
    platform: navigator.platform
  };

  const dataWithMetadata = {
    ...data,
    _backup: metadata
  };

  await invoke('save_database_atomic', {
    filepath: dbPath,
    content: JSON.stringify(dataWithMetadata, null, 2)
  });

  console.log('✅ Backup salvo em arquivo:', dbPath);
}

export async function loadFileBackup(filepath?: string): Promise<DatabaseSchema | null> {
  const dbPath = filepath || localStorage.getItem('oficina_db_path') || 'C:\\OficinaData\\database.json';

  try {
    const data = await invoke<string>('load_database', { filepath: dbPath });
    if (data && data.trim()) {
      const parsed = JSON.parse(data);
      const { _backup, ...cleanData } = parsed;
      console.log('✅ Backup carregado de arquivo:', dbPath);
      return cleanData as DatabaseSchema;
    }
  } catch (error) {
    console.error('❌ Erro ao carregar backup:', error);
  }

  return null;
}

// ==============================
// RESET DE BANCO DE DADOS
// ==============================

export async function resetDatabase(password: string): Promise<boolean> {
  // Verifica senha do usuário
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('Usuário não autenticado');
  }

  try {
    // Reautentica para confirmar senha
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    await signInWithEmailAndPassword(auth, user.email, password);

    // Senha correta - Prosseguir com reset
    const userId = getUserDocPath();
    const docRef = doc(db, COLLECTION_NAME, userId);

    // Criar backup antes de deletar
    const currentData = await downloadFromFirestore();
    if (currentData) {
      await localBackupDB.saveBackup(currentData, 'manual');
      console.log('📦 Backup criado antes do reset');
    }

    // Deletar dados do Firestore
    await deleteDoc(docRef);
    console.log('🗑️ Dados removidos do Firestore');

    return true;
  } catch (error: any) {
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      throw new Error('Senha incorreta');
    }
    throw error;
  }
}

// ==============================
// LISTENER EM TEMPO REAL
// ==============================

export function listenToFirestoreChanges(
  onUpdate: (data: DatabaseSchema) => void
): Unsubscribe {
  const userId = getUserDocPath();
  const docRef = doc(db, COLLECTION_NAME, userId);

  return onSnapshot(docRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      const { _metadata, updatedAt, ...cleanData } = data;
      console.log('🔄 Atualização em tempo real recebida');
      onUpdate(cleanData as DatabaseSchema);
    }
  });
}

// ==============================
// STATUS DE SINCRONIZAÇÃO
// ==============================

export async function getSyncStatus(): Promise<SyncStatus> {
  const isOnline = navigator.onLine;
  const latestBackup = await localBackupDB.getLatestBackup();

  return {
    isOnline,
    lastSync: latestBackup ? new Date(latestBackup.timestamp) : null,
    isSyncing: false,
    error: null,
    pendingChanges: 0
  };
}

// ==============================
// EXPORTS
// ==============================

export { localBackupDB };
export default {
  uploadToFirestore,
  downloadFromFirestore,
  syncWithFirestore,
  saveFileBackup,
  loadFileBackup,
  resetDatabase,
  listenToFirestoreChanges,
  getSyncStatus,
  localBackupDB
};
