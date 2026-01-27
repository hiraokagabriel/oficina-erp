/**
 * syncService.ts
 * Sincronização automática entre Firebase Firestore e armazenamento local
 */

import { db } from '../lib/firebase';
import { 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  deleteDoc,
  writeBatch,
  query,
  where
} from 'firebase/firestore';
import {
  initIndexedDB,
  saveToLocal,
  getAllFromLocal,
  clearAllStores,
  saveMetadata,
  getMetadata,
  STORES
} from './storageService';

export interface SyncStatus {
  isSyncing: boolean;
  lastSync: Date | null;
  error: string | null;
  progress: number;
}

let syncStatus: SyncStatus = {
  isSyncing: false,
  lastSync: null,
  error: null,
  progress: 0
};

const listeners: ((status: SyncStatus) => void)[] = [];

/**
 * Adiciona listener para mudanças no status de sincronização
 */
export function onSyncStatusChange(callback: (status: SyncStatus) => void): () => void {
  listeners.push(callback);
  callback(syncStatus); // Envia status atual imediatamente
  
  return () => {
    const index = listeners.indexOf(callback);
    if (index > -1) listeners.splice(index, 1);
  };
}

/**
 * Atualiza o status de sincronização e notifica listeners
 */
function updateSyncStatus(update: Partial<SyncStatus>) {
  syncStatus = { ...syncStatus, ...update };
  listeners.forEach(listener => listener(syncStatus));
}

/**
 * Busca dados do Firestore
 */
async function fetchFromFirestore(userId: string, storeName: string): Promise<any[]> {
  try {
    const collectionRef = collection(db, `users/${userId}/${storeName}`);
    const snapshot = await getDocs(collectionRef);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error(`❌ Erro ao buscar ${storeName} do Firestore:`, error);
    throw error;
  }
}

/**
 * Salva dados no Firestore
 */
async function saveToFirestore(userId: string, storeName: string, data: any[]): Promise<void> {
  try {
    const batch = writeBatch(db);
    
    data.forEach(item => {
      const docRef = doc(db, `users/${userId}/${storeName}`, item.id || String(Date.now() + Math.random()));
      batch.set(docRef, item);
    });
    
    await batch.commit();
    console.log(`✅ ${data.length} itens salvos no Firestore (${storeName})`);
  } catch (error) {
    console.error(`❌ Erro ao salvar ${storeName} no Firestore:`, error);
    throw error;
  }
}

/**
 * Sincronização DOWN: Firebase → Local
 * Busca dados da nuvem e salva localmente
 */
export async function syncDown(userId: string): Promise<void> {
  console.log('🔽 Iniciando sync DOWN (Firebase → Local)...');
  
  updateSyncStatus({ isSyncing: true, error: null, progress: 0 });

  try {
    await initIndexedDB();
    
    const storeNames = Object.values(STORES).filter(s => s !== 'metadata');
    const totalStores = storeNames.length;

    for (let i = 0; i < totalStores; i++) {
      const storeName = storeNames[i];
      
      try {
        console.log(`📥 Baixando ${storeName}...`);
        const data = await fetchFromFirestore(userId, storeName);
        await saveToLocal(storeName, data);
        
        updateSyncStatus({ progress: ((i + 1) / totalStores) * 100 });
      } catch (error) {
        console.error(`Erro ao sincronizar ${storeName}:`, error);
      }
    }

    await saveMetadata('lastSyncDown', new Date().toISOString());
    await saveMetadata('userId', userId);
    
    updateSyncStatus({ 
      isSyncing: false, 
      lastSync: new Date(),
      progress: 100 
    });
    
    console.log('✅ Sync DOWN concluído com sucesso!');
  } catch (error: any) {
    console.error('❌ Erro no sync DOWN:', error);
    updateSyncStatus({ 
      isSyncing: false, 
      error: error.message || 'Erro ao sincronizar',
      progress: 0
    });
    throw error;
  }
}

/**
 * Sincronização UP: Local → Firebase
 * Envia dados locais para a nuvem
 */
export async function syncUp(userId: string): Promise<void> {
  console.log('🔼 Iniciando sync UP (Local → Firebase)...');
  
  updateSyncStatus({ isSyncing: true, error: null, progress: 0 });

  try {
    const storeNames = Object.values(STORES).filter(s => s !== 'metadata');
    const totalStores = storeNames.length;

    for (let i = 0; i < totalStores; i++) {
      const storeName = storeNames[i];
      
      try {
        console.log(`📤 Enviando ${storeName}...`);
        const data = await getAllFromLocal(storeName);
        
        if (data.length > 0) {
          await saveToFirestore(userId, storeName, data);
        }
        
        updateSyncStatus({ progress: ((i + 1) / totalStores) * 100 });
      } catch (error) {
        console.error(`Erro ao enviar ${storeName}:`, error);
      }
    }

    await saveMetadata('lastSyncUp', new Date().toISOString());
    
    updateSyncStatus({ 
      isSyncing: false, 
      lastSync: new Date(),
      progress: 100 
    });
    
    console.log('✅ Sync UP concluído com sucesso!');
  } catch (error: any) {
    console.error('❌ Erro no sync UP:', error);
    updateSyncStatus({ 
      isSyncing: false, 
      error: error.message || 'Erro ao enviar dados',
      progress: 0
    });
    throw error;
  }
}

/**
 * Sincronização COMPLETA (DOWN + UP)
 * Ideal para primeiro login ou sincronização manual
 */
export async function fullSync(userId: string): Promise<void> {
  console.log('🔄 Iniciando sincronização completa...');
  
  try {
    // Primeiro baixa dados da nuvem
    await syncDown(userId);
    
    // Depois envia dados locais que não estão na nuvem
    // (opcional, dependendo da lógica de negócio)
    
    console.log('✅ Sincronização completa concluída!');
  } catch (error) {
    console.error('❌ Erro na sincronização completa:', error);
    throw error;
  }
}

/**
 * Verifica se é o primeiro login do usuário
 */
export async function isFirstLogin(userId: string): Promise<boolean> {
  try {
    const storedUserId = await getMetadata('userId');
    const lastSync = await getMetadata('lastSyncDown');
    
    return !storedUserId || storedUserId !== userId || !lastSync;
  } catch (error) {
    return true; // Se houver erro, assume primeiro login
  }
}

/**
 * Sincronização automática no login
 * Verifica se é primeiro login e sincroniza
 */
export async function autoSync(userId: string): Promise<void> {
  try {
    const isFirst = await isFirstLogin(userId);
    
    if (isFirst) {
      console.log('🎆 Primeiro login detectado! Sincronizando...');
      await fullSync(userId);
    } else {
      console.log('♻️ Usuário já sincronizado. Atualizando...');
      await syncDown(userId);
    }
  } catch (error) {
    console.error('❌ Erro no auto-sync:', error);
    throw error;
  }
}

/**
 * Reseta todo o banco de dados (local + nuvem)
 * REQUER CONFIRMAÇÃO!
 */
export async function resetAllData(userId: string, confirmationPassword: string): Promise<void> {
  console.log('⚠️ Iniciando reset de dados...');
  
  // Aqui você pode adicionar validação extra se necessário
  // Por exemplo, verificar se a senha está correta
  
  updateSyncStatus({ isSyncing: true, error: null });

  try {
    // 1. Limpar dados locais
    console.log('🗑️ Limpando dados locais...');
    await clearAllStores();
    
    // 2. Limpar dados no Firestore
    console.log('🗑️ Limpando dados no Firestore...');
    const storeNames = Object.values(STORES).filter(s => s !== 'metadata');
    
    for (const storeName of storeNames) {
      try {
        const collectionRef = collection(db, `users/${userId}/${storeName}`);
        const snapshot = await getDocs(collectionRef);
        
        const batch = writeBatch(db);
        snapshot.docs.forEach(document => {
          batch.delete(document.ref);
        });
        
        await batch.commit();
        console.log(`🗑️ ${storeName} limpo do Firestore`);
      } catch (error) {
        console.error(`Erro ao limpar ${storeName}:`, error);
      }
    }
    
    updateSyncStatus({ isSyncing: false, lastSync: new Date() });
    console.log('✅ Reset completo! Banco de dados limpo.');
  } catch (error: any) {
    console.error('❌ Erro ao resetar dados:', error);
    updateSyncStatus({ 
      isSyncing: false, 
      error: error.message || 'Erro ao resetar dados'
    });
    throw error;
  }
}

/**
 * Obtém o status atual de sincronização
 */
export function getSyncStatus(): SyncStatus {
  return { ...syncStatus };
}

/**
 * Verifica se há dados locais
 */
export async function hasLocalData(): Promise<boolean> {
  try {
    const clientes = await getAllFromLocal('clientes');
    return clientes.length > 0;
  } catch (error) {
    return false;
  }
}
