/**
 * syncWorker.ts
 * Web Worker para sincronização em background
 * 
 * BENEFÍCIOS:
 * - Não bloqueia a thread principal (UI responsiva)
 * - Processa sincronização em paralelo
 * - Reduz travamentos durante operações pesadas
 */

import { 
  collection, 
  getDocs, 
  query, 
  where,
  writeBatch,
  Timestamp,
  initializeFirestore,
  connectFirestoreEmulator
} from 'firebase/firestore';
import { initializeApp } from 'firebase/app';

// Tipos de mensagens
type WorkerMessage = 
  | { type: 'INIT'; payload: { firebaseConfig: any; userId: string } }
  | { type: 'SYNC_INCREMENTAL'; payload: { lastSync: string } }
  | { type: 'SYNC_FULL'; payload: { data: any } }
  | { type: 'UPLOAD_BATCH'; payload: { collectionName: string; data: any[] } };

type WorkerResponse = 
  | { type: 'INIT_SUCCESS' }
  | { type: 'INIT_ERROR'; error: string }
  | { type: 'SYNC_PROGRESS'; progress: number; total: number; message: string }
  | { type: 'SYNC_COMPLETE'; data: any }
  | { type: 'SYNC_ERROR'; error: string };

let db: any = null;
let userId: string = '';
const BATCH_SIZE = 500;

/**
 * Handler principal de mensagens
 */
self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, payload } = e.data;

  try {
    switch (type) {
      case 'INIT':
        await initializeWorker(payload.firebaseConfig, payload.userId);
        break;

      case 'SYNC_INCREMENTAL':
        await syncIncremental(payload.lastSync);
        break;

      case 'SYNC_FULL':
        await syncFull();
        break;

      case 'UPLOAD_BATCH':
        await uploadBatch(payload.collectionName, payload.data);
        break;

      default:
        postError(`Tipo de mensagem desconhecido: ${type}`);
    }
  } catch (error: any) {
    postError(error.message || 'Erro no worker');
  }
};

/**
 * Inicializa Firebase no worker
 */
async function initializeWorker(firebaseConfig: any, uid: string): Promise<void> {
  try {
    const app = initializeApp(firebaseConfig);
    db = initializeFirestore(app, {
      cacheSizeBytes: 50 * 1024 * 1024 // 50MB cache
    });
    userId = uid;

    postMessage({ type: 'INIT_SUCCESS' });
    console.log('✅ Worker inicializado');
  } catch (error: any) {
    postMessage({ type: 'INIT_ERROR', error: error.message });
  }
}

/**
 * Sincronização incremental
 */
async function syncIncremental(lastSync: string): Promise<void> {
  if (!db) throw new Error('Worker não inicializado');

  const collections = ['clients', 'workOrders', 'ledger', 'catalogParts', 'catalogServices'];
  const updates: Record<string, any[]> = {};
  let totalUpdates = 0;

  postProgress(0, collections.length, 'Verificando mudanças...');

  for (let i = 0; i < collections.length; i++) {
    const collectionName = collections[i];
    
    try {
      const q = query(
        collection(db, `users/${userId}/${collectionName}`),
        where('updatedAt', '>', lastSync)
      );
      
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        updates[collectionName] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        totalUpdates += snapshot.size;
      }

      postProgress(i + 1, collections.length, `${collectionName}: ${snapshot.size} mudanças`);
    } catch (error: any) {
      console.error(`Erro em ${collectionName}:`, error);
    }
  }

  postMessage({ 
    type: 'SYNC_COMPLETE', 
    data: { updates, totalUpdates, timestamp: new Date().toISOString() } 
  });
}

/**
 * Sincronização completa
 */
async function syncFull(): Promise<void> {
  if (!db) throw new Error('Worker não inicializado');

  const collections = ['clients', 'workOrders', 'ledger', 'catalogParts', 'catalogServices'];
  const data: Record<string, any[]> = {};
  let totalItems = 0;

  postProgress(0, collections.length, 'Baixando dados...');

  for (let i = 0; i < collections.length; i++) {
    const collectionName = collections[i];
    
    try {
      const snapshot = await getDocs(
        collection(db, `users/${userId}/${collectionName}`)
      );
      
      data[collectionName] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      totalItems += snapshot.size;

      postProgress(i + 1, collections.length, `${collectionName}: ${snapshot.size} itens`);
    } catch (error: any) {
      console.error(`Erro em ${collectionName}:`, error);
      data[collectionName] = [];
    }
  }

  postMessage({ 
    type: 'SYNC_COMPLETE', 
    data: { ...data, totalItems, timestamp: new Date().toISOString() } 
  });
}

/**
 * Upload em batch
 */
async function uploadBatch(collectionName: string, data: any[]): Promise<void> {
  if (!db) throw new Error('Worker não inicializado');
  if (data.length === 0) return;

  const chunks = chunkArray(data, BATCH_SIZE);
  let processed = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const batch = writeBatch(db);

    chunk.forEach(item => {
      const docRef = collection(db, `users/${userId}/${collectionName}`).doc(item.id);
      batch.set(docRef, {
        ...item,
        updatedAt: Timestamp.now().toDate().toISOString(),
        userId
      });
    });

    await batch.commit();
    processed += chunk.length;

    postProgress(processed, data.length, `Enviando ${collectionName}...`);
  }

  postMessage({ 
    type: 'SYNC_COMPLETE', 
    data: { uploaded: processed, collectionName } 
  });
}

/**
 * Helpers
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function postProgress(current: number, total: number, message: string): void {
  postMessage({ 
    type: 'SYNC_PROGRESS', 
    progress: current, 
    total, 
    message 
  });
}

function postError(error: string): void {
  postMessage({ type: 'SYNC_ERROR', error });
}

export {};
