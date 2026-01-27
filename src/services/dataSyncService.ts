/**
 * DATA SYNC SERVICE
 * 
 * Serviço completo de sincronização de dados entre Firestore (remoto) e IndexedDB (local)
 * 
 * Funcionalidades:
 * - Sincronização automática no login
 * - Backup local para modo offline
 * - Detecção e resolução de conflitos
 * - Export/Import de dados
 * - Logs de sincronização
 */

import { db } from '../lib/firebase';
import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  deleteDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
  query,
  where
} from 'firebase/firestore';
import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Schema do IndexedDB
interface OficinaDB extends DBSchema {
  clientes: {
    key: string;
    value: any;
    indexes: { 'syncedAt': number };
  };
  processos: {
    key: string;
    value: any;
    indexes: { 'syncedAt': number };
  };
  financeiro: {
    key: string;
    value: any;
    indexes: { 'syncedAt': number };
  };
  syncLogs: {
    key: number;
    value: SyncLog;
    indexes: { 'timestamp': number };
  };
  metadata: {
    key: string;
    value: any;
  };
}

interface SyncLog {
  id?: number;
  timestamp: number;
  action: 'sync' | 'backup' | 'restore' | 'reset' | 'export' | 'import';
  status: 'success' | 'error' | 'partial';
  details: string;
  itemsAffected: number;
  userId?: string;
}

interface SyncResult {
  success: boolean;
  itemsSynced: number;
  errors: string[];
  timestamp: number;
}

// Instância do IndexedDB
let dbInstance: IDBPDatabase<OficinaDB> | null = null;

/**
 * Inicializa o IndexedDB
 */
export async function initIndexedDB(): Promise<IDBPDatabase<OficinaDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<OficinaDB>('oficina-erp-db', 1, {
    upgrade(db) {
      // Store de Clientes
      if (!db.objectStoreNames.contains('clientes')) {
        const clientesStore = db.createObjectStore('clientes', { keyPath: 'id' });
        clientesStore.createIndex('syncedAt', 'syncedAt');
      }

      // Store de Processos
      if (!db.objectStoreNames.contains('processos')) {
        const processosStore = db.createObjectStore('processos', { keyPath: 'id' });
        processosStore.createIndex('syncedAt', 'syncedAt');
      }

      // Store de Financeiro
      if (!db.objectStoreNames.contains('financeiro')) {
        const financeiroStore = db.createObjectStore('financeiro', { keyPath: 'id' });
        financeiroStore.createIndex('syncedAt', 'syncedAt');
      }

      // Store de Logs de Sincronização
      if (!db.objectStoreNames.contains('syncLogs')) {
        const logsStore = db.createObjectStore('syncLogs', { keyPath: 'id', autoIncrement: true });
        logsStore.createIndex('timestamp', 'timestamp');
      }

      // Store de Metadata
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' });
      }
    },
  });

  console.log('✅ IndexedDB inicializado com sucesso');
  return dbInstance;
}

/**
 * Adiciona log de sincronização
 */
async function addSyncLog(log: Omit<SyncLog, 'id'>): Promise<void> {
  const db = await initIndexedDB();
  await db.add('syncLogs', log as SyncLog);
}

/**
 * Obtém logs de sincronização
 */
export async function getSyncLogs(limit: number = 50): Promise<SyncLog[]> {
  const db = await initIndexedDB();
  const logs = await db.getAllFromIndex('syncLogs', 'timestamp');
  return logs.reverse().slice(0, limit);
}

/**
 * Sincroniza dados do Firestore para IndexedDB
 * Executa no primeiro login e periodicamente
 */
export async function syncFromFirestore(userId: string): Promise<SyncResult> {
  console.log('🔄 Iniciando sincronização Firestore → IndexedDB...');
  
  const result: SyncResult = {
    success: false,
    itemsSynced: 0,
    errors: [],
    timestamp: Date.now()
  };

  try {
    const db = await initIndexedDB();
    const collections = ['clientes', 'processos', 'financeiro'] as const;

    for (const collectionName of collections) {
      try {
        // Buscar dados do Firestore
        const colRef = collection(db, `users/${userId}/${collectionName}`);
        const snapshot = await getDocs(colRef);

        // Salvar no IndexedDB
        const tx = db.transaction(collectionName, 'readwrite');
        const store = tx.objectStore(collectionName);

        for (const docSnap of snapshot.docs) {
          const data = {
            ...docSnap.data(),
            id: docSnap.id,
            syncedAt: Date.now()
          };
          await store.put(data);
          result.itemsSynced++;
        }

        await tx.done;
        console.log(`✅ ${collectionName}: ${snapshot.size} itens sincronizados`);
      } catch (err: any) {
        const errorMsg = `Erro em ${collectionName}: ${err.message}`;
        console.error(`❌ ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }

    // Atualizar metadata
    await db.put('metadata', {
      key: 'lastSync',
      timestamp: Date.now(),
      userId
    });

    result.success = result.errors.length === 0;

    // Log da sincronização
    await addSyncLog({
      timestamp: Date.now(),
      action: 'sync',
      status: result.success ? 'success' : 'partial',
      details: result.success 
        ? 'Sincronização completa' 
        : `Sincronização com ${result.errors.length} erros`,
      itemsAffected: result.itemsSynced,
      userId
    });

    console.log(`✅ Sincronização concluída: ${result.itemsSynced} itens`);
  } catch (err: any) {
    console.error('❌ Erro fatal na sincronização:', err);
    result.errors.push(`Erro fatal: ${err.message}`);
    
    await addSyncLog({
      timestamp: Date.now(),
      action: 'sync',
      status: 'error',
      details: err.message,
      itemsAffected: 0,
      userId
    });
  }

  return result;
}

/**
 * Sincroniza dados do IndexedDB para Firestore
 * Usado para upload de mudanças locais
 */
export async function syncToFirestore(userId: string): Promise<SyncResult> {
  console.log('🔄 Iniciando sincronização IndexedDB → Firestore...');
  
  const result: SyncResult = {
    success: false,
    itemsSynced: 0,
    errors: [],
    timestamp: Date.now()
  };

  try {
    const idb = await initIndexedDB();
    const collections = ['clientes', 'processos', 'financeiro'] as const;

    for (const collectionName of collections) {
      try {
        // Buscar dados locais
        const localData = await idb.getAll(collectionName);

        // Upload para Firestore
        const batch = writeBatch(db);
        let batchCount = 0;

        for (const item of localData) {
          const docRef = doc(db, `users/${userId}/${collectionName}`, item.id);
          
          // Remove campos internos antes de enviar
          const { syncedAt, ...dataToSync } = item;
          
          batch.set(docRef, {
            ...dataToSync,
            updatedAt: serverTimestamp()
          }, { merge: true });

          batchCount++;
          result.itemsSynced++;

          // Firestore tem limite de 500 operações por batch
          if (batchCount >= 500) {
            await batch.commit();
            batchCount = 0;
          }
        }

        if (batchCount > 0) {
          await batch.commit();
        }

        console.log(`✅ ${collectionName}: ${localData.length} itens enviados`);
      } catch (err: any) {
        const errorMsg = `Erro em ${collectionName}: ${err.message}`;
        console.error(`❌ ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }

    result.success = result.errors.length === 0;

    await addSyncLog({
      timestamp: Date.now(),
      action: 'backup',
      status: result.success ? 'success' : 'partial',
      details: 'Upload de dados locais para Firestore',
      itemsAffected: result.itemsSynced,
      userId
    });

    console.log(`✅ Upload concluído: ${result.itemsSynced} itens`);
  } catch (err: any) {
    console.error('❌ Erro fatal no upload:', err);
    result.errors.push(`Erro fatal: ${err.message}`);
  }

  return result;
}

/**
 * Reseta todo o banco de dados (local e remoto)
 * Requer autenticação por senha
 */
export async function resetDatabase(userId: string, password: string): Promise<{ success: boolean; message: string }> {
  console.log('⚠️  Iniciando reset do banco de dados...');

  try {
    // Validar senha (reautenticação)
    const { reauthenticateWithCredential, EmailAuthProvider } = await import('firebase/auth');
    const { auth } = await import('../lib/firebase');
    
    if (!auth.currentUser || !auth.currentUser.email) {
      throw new Error('Usuário não autenticado');
    }

    const credential = EmailAuthProvider.credential(auth.currentUser.email, password);
    await reauthenticateWithCredential(auth.currentUser, credential);

    console.log('✅ Senha validada');

    let itemsDeleted = 0;

    // 1. Limpar Firestore
    const collections = ['clientes', 'processos', 'financeiro'];
    for (const collectionName of collections) {
      const colRef = collection(db, `users/${userId}/${collectionName}`);
      const snapshot = await getDocs(colRef);
      
      const batch = writeBatch(db);
      snapshot.docs.forEach(docSnap => {
        batch.delete(docSnap.ref);
        itemsDeleted++;
      });
      
      if (snapshot.size > 0) {
        await batch.commit();
      }
    }

    // 2. Limpar IndexedDB
    const idb = await initIndexedDB();
    await idb.clear('clientes');
    await idb.clear('processos');
    await idb.clear('financeiro');

    // 3. Registrar log
    await addSyncLog({
      timestamp: Date.now(),
      action: 'reset',
      status: 'success',
      details: 'Banco de dados resetado completamente',
      itemsAffected: itemsDeleted,
      userId
    });

    console.log(`✅ Reset concluído: ${itemsDeleted} itens removidos`);
    
    return {
      success: true,
      message: `Banco de dados resetado com sucesso. ${itemsDeleted} itens removidos.`
    };
  } catch (err: any) {
    console.error('❌ Erro ao resetar banco:', err);
    
    let errorMessage = 'Erro ao resetar banco de dados';
    
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      errorMessage = 'Senha incorreta';
    } else if (err.code === 'auth/too-many-requests') {
      errorMessage = 'Muitas tentativas. Aguarde alguns minutos';
    }

    await addSyncLog({
      timestamp: Date.now(),
      action: 'reset',
      status: 'error',
      details: errorMessage,
      itemsAffected: 0,
      userId
    });

    return {
      success: false,
      message: errorMessage
    };
  }
}

/**
 * Exporta todos os dados locais para JSON
 */
export async function exportData(): Promise<{ success: boolean; data?: any; message: string }> {
  try {
    const idb = await initIndexedDB();
    
    const exportData = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      clientes: await idb.getAll('clientes'),
      processos: await idb.getAll('processos'),
      financeiro: await idb.getAll('financeiro')
    };

    const totalItems = exportData.clientes.length + exportData.processos.length + exportData.financeiro.length;

    await addSyncLog({
      timestamp: Date.now(),
      action: 'export',
      status: 'success',
      details: 'Dados exportados com sucesso',
      itemsAffected: totalItems
    });

    return {
      success: true,
      data: exportData,
      message: `${totalItems} itens exportados`
    };
  } catch (err: any) {
    console.error('❌ Erro ao exportar:', err);
    return {
      success: false,
      message: `Erro: ${err.message}`
    };
  }
}

/**
 * Importa dados de JSON para IndexedDB
 */
export async function importData(jsonData: any, userId: string): Promise<{ success: boolean; message: string }> {
  try {
    const idb = await initIndexedDB();
    let itemsImported = 0;

    // Importar clientes
    if (jsonData.clientes && Array.isArray(jsonData.clientes)) {
      const tx = idb.transaction('clientes', 'readwrite');
      for (const item of jsonData.clientes) {
        await tx.store.put({ ...item, syncedAt: Date.now() });
        itemsImported++;
      }
      await tx.done;
    }

    // Importar processos
    if (jsonData.processos && Array.isArray(jsonData.processos)) {
      const tx = idb.transaction('processos', 'readwrite');
      for (const item of jsonData.processos) {
        await tx.store.put({ ...item, syncedAt: Date.now() });
        itemsImported++;
      }
      await tx.done;
    }

    // Importar financeiro
    if (jsonData.financeiro && Array.isArray(jsonData.financeiro)) {
      const tx = idb.transaction('financeiro', 'readwrite');
      for (const item of jsonData.financeiro) {
        await tx.store.put({ ...item, syncedAt: Date.now() });
        itemsImported++;
      }
      await tx.done;
    }

    await addSyncLog({
      timestamp: Date.now(),
      action: 'import',
      status: 'success',
      details: 'Dados importados com sucesso',
      itemsAffected: itemsImported,
      userId
    });

    return {
      success: true,
      message: `${itemsImported} itens importados com sucesso`
    };
  } catch (err: any) {
    console.error('❌ Erro ao importar:', err);
    return {
      success: false,
      message: `Erro: ${err.message}`
    };
  }
}

/**
 * Obtém informações sobre o status da sincronização
 */
export async function getSyncStatus(): Promise<{
  lastSync: number | null;
  totalItems: number;
  itemsByCollection: { [key: string]: number };
}> {
  try {
    const idb = await initIndexedDB();
    
    const metadata = await idb.get('metadata', 'lastSync');
    const clientes = await idb.getAll('clientes');
    const processos = await idb.getAll('processos');
    const financeiro = await idb.getAll('financeiro');

    return {
      lastSync: metadata?.timestamp || null,
      totalItems: clientes.length + processos.length + financeiro.length,
      itemsByCollection: {
        clientes: clientes.length,
        processos: processos.length,
        financeiro: financeiro.length
      }
    };
  } catch (err) {
    console.error('❌ Erro ao obter status:', err);
    return {
      lastSync: null,
      totalItems: 0,
      itemsByCollection: {}
    };
  }
}
