/**
 * firestoreService.ts
 * Gerenciamento de dados usando Firebase Firestore
 * Substitui o IndexedDB com sincronização na nuvem
 * 
 * OTIMIZAÇÕES:
 * - Batches paralelos (até 3 simultâneos)
 * - Chunking inteligente (500 docs por batch)
 * - Progress callbacks
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
  onSnapshot,
  QueryConstraint
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { auth } from '../config/firebase';

// Coleções do Firestore (organizadas por usuário)
export const COLLECTIONS = {
  clientes: 'clientes',
  processos: 'processos',
  financeiro: 'financeiro',
  oficina: 'oficina',
  config: 'config',
  metadata: 'metadata'
};

// 🔥 CONSTANTES DE PERFORMANCE
const BATCH_SIZE = 500; // Limite do Firestore
const MAX_CONCURRENT_BATCHES = 3; // Batches simultâneos

/**
 * Obtém o ID do usuário autenticado
 */
function getUserId(): string {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('❌ Usuário não autenticado. Faça login primeiro.');
  }
  return user.uid;
}

/**
 * Obtém o caminho da coleção do usuário
 */
function getUserCollectionPath(collectionName: string): string {
  const userId = getUserId();
  return `users/${userId}/${collectionName}`;
}

/**
 * 🚀 OTIMIZADO: Salva múltiplos documentos com batches paralelos
 * 
 * PERFORMANCE:
 * - Divide em chunks de 500 (limite do Firestore)
 * - Processa até 3 batches simultaneamente
 * - Callback de progresso opcional
 * 
 * @param collectionName Nome da coleção
 * @param data Array de documentos
 * @param onProgress Callback opcional (current, total)
 */
export async function saveToFirestore<T extends { id?: string }>(
  collectionName: string, 
  data: T[],
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  if (data.length === 0) return;

  try {
    const collectionPath = getUserCollectionPath(collectionName);
    const total = data.length;
    let processed = 0;

    // Dividir em chunks de 500
    const chunks: T[][] = [];
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      chunks.push(data.slice(i, i + BATCH_SIZE));
    }

    console.log(`🚀 Sincronizando ${total} itens em ${chunks.length} batch(es)...`);

    // Processar chunks em paralelo (máximo 3 simultâneos)
    for (let i = 0; i < chunks.length; i += MAX_CONCURRENT_BATCHES) {
      const batchGroup = chunks.slice(i, i + MAX_CONCURRENT_BATCHES);
      
      await Promise.all(
        batchGroup.map(async (chunk) => {
          const batch = writeBatch(db);
          
          chunk.forEach((item) => {
            const id = item.id || doc(collection(db, collectionPath)).id;
            const docRef = doc(db, collectionPath, id);
            batch.set(docRef, {
              ...item,
              id,
              updatedAt: Timestamp.now(),
              userId: getUserId()
            });
          });
          
          await batch.commit();
          processed += chunk.length;
          
          // Callback de progresso
          if (onProgress) {
            onProgress(processed, total);
          }
        })
      );
    }

    console.log(`✅ ${total} itens salvos em ${collectionName}`);
  } catch (error) {
    console.error(`❌ Erro ao salvar em ${collectionName}:`, error);
    throw error;
  }
}

/**
 * 🚀 OTIMIZADO: Sincroniza todas as coleções em paralelo
 */
export async function syncAllCollections(
  collections: { name: string; collection: string; data: any[] }[],
  onProgress?: (collectionName: string, current: number, total: number) => void
): Promise<void> {
  console.log('\n🚀 SINCRONIZAÇÃO PARALELA INICIADA');
  console.log('='.repeat(60));

  const startTime = Date.now();

  // Processa todas as coleções em paralelo
  await Promise.all(
    collections.map(async ({ name, collection, data }) => {
      if (data.length === 0) return;
      
      console.log(`📂 ${name}: ${data.length} itens`);
      
      await saveToFirestore(
        collection,
        data,
        onProgress ? (current, total) => onProgress(name, current, total) : undefined
      );
      
      console.log(`  ✅ ${name} concluído!`);
    })
  );

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const totalItems = collections.reduce((sum, c) => sum + c.data.length, 0);
  
  console.log('='.repeat(60));
  console.log(`✅ SINCRONIZAÇÃO CONCLUÍDA: ${totalItems} itens em ${duration}s`);
  console.log(`   Performance: ${(totalItems / parseFloat(duration)).toFixed(0)} itens/seg\n`);
}

/**
 * Busca todos os documentos de uma coleção
 */
export async function getAllFromFirestore<T>(collectionName: string): Promise<T[]> {
  try {
    const collectionPath = getUserCollectionPath(collectionName);
    const q = query(collection(db, collectionPath));
    const querySnapshot = await getDocs(q);

    const results: T[] = [];
    querySnapshot.forEach((doc) => {
      results.push({ id: doc.id, ...doc.data() } as T);
    });

    return results;
  } catch (error) {
    console.error(`❌ Erro ao buscar de ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Busca um documento específico por ID
 */
export async function getOneFromFirestore<T>(collectionName: string, id: string): Promise<T | null> {
  try {
    const collectionPath = getUserCollectionPath(collectionName);
    const docRef = doc(db, collectionPath, id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as T;
    }
    return null;
  } catch (error) {
    console.error(`❌ Erro ao buscar documento ${id}:`, error);
    throw error;
  }
}

/**
 * Adiciona ou atualiza um documento
 */
export async function putInFirestore<T extends { id?: string }>(collectionName: string, item: T): Promise<void> {
  try {
    const collectionPath = getUserCollectionPath(collectionName);
    const id = item.id || doc(collection(db, collectionPath)).id;
    const docRef = doc(db, collectionPath, id);

    await setDoc(docRef, {
      ...item,
      id,
      updatedAt: Timestamp.now(),
      userId: getUserId()
    }, { merge: true });

    console.log(`✅ Documento salvo: ${id}`);
  } catch (error) {
    console.error(`❌ Erro ao salvar documento:`, error);
    throw error;
  }
}

/**
 * Atualiza campos específicos de um documento
 */
export async function updateInFirestore(collectionName: string, id: string, data: Partial<any>): Promise<void> {
  try {
    const collectionPath = getUserCollectionPath(collectionName);
    const docRef = doc(db, collectionPath, id);

    await updateDoc(docRef, {
      ...data,
      updatedAt: Timestamp.now()
    });

    console.log(`✅ Documento atualizado: ${id}`);
  } catch (error) {
    console.error(`❌ Erro ao atualizar documento:`, error);
    throw error;
  }
}

/**
 * Remove um documento
 */
export async function deleteFromFirestore(collectionName: string, id: string): Promise<void> {
  try {
    const collectionPath = getUserCollectionPath(collectionName);
    const docRef = doc(db, collectionPath, id);
    await deleteDoc(docRef);

    console.log(`🗑️ Documento removido: ${id}`);
  } catch (error) {
    console.error(`❌ Erro ao remover documento:`, error);
    throw error;
  }
}

/**
 * Limpa todos os documentos de uma coleção
 */
export async function clearCollection(collectionName: string): Promise<void> {
  try {
    const collectionPath = getUserCollectionPath(collectionName);
    const querySnapshot = await getDocs(collection(db, collectionPath));
    const batch = writeBatch(db);

    querySnapshot.forEach((document) => {
      batch.delete(document.ref);
    });

    await batch.commit();
    console.log(`🗑️ Coleção limpa: ${collectionName}`);
  } catch (error) {
    console.error(`❌ Erro ao limpar coleção:`, error);
    throw error;
  }
}

/**
 * Limpa TODAS as coleções do usuário
 */
export async function clearAllCollections(): Promise<void> {
  const promises = Object.values(COLLECTIONS).map(col => clearCollection(col));
  await Promise.all(promises);
  console.log('🗑️ Todas as coleções foram limpas');
}

/**
 * Salva metadados (como última sincronização)
 */
export async function saveMetadata(key: string, value: any): Promise<void> {
  await putInFirestore('metadata', {
    id: key,
    key,
    value,
    timestamp: Date.now()
  });
}

/**
 * Busca metadados
 */
export async function getMetadata(key: string): Promise<any> {
  try {
    const metadata = await getOneFromFirestore('metadata', key);
    return metadata ? (metadata as any).value : null;
  } catch (error) {
    console.error(`❌ Erro ao buscar metadata:`, error);
    return null;
  }
}

/**
 * Busca com filtros personalizados
 */
export async function queryFirestore<T>(
  collectionName: string,
  constraints: QueryConstraint[]
): Promise<T[]> {
  try {
    const collectionPath = getUserCollectionPath(collectionName);
    const q = query(collection(db, collectionPath), ...constraints);
    const querySnapshot = await getDocs(q);

    const results: T[] = [];
    querySnapshot.forEach((doc) => {
      results.push({ id: doc.id, ...doc.data() } as T);
    });

    return results;
  } catch (error) {
    console.error(`❌ Erro na query:`, error);
    throw error;
  }
}

/**
 * Listener em tempo real para uma coleção
 */
export function subscribeToCollection<T>(
  collectionName: string,
  callback: (data: T[]) => void,
  constraints: QueryConstraint[] = []
): () => void {
  try {
    const collectionPath = getUserCollectionPath(collectionName);
    const q = query(collection(db, collectionPath), ...constraints);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const results: T[] = [];
      snapshot.forEach((doc) => {
        results.push({ id: doc.id, ...doc.data() } as T);
      });
      callback(results);
    });

    return unsubscribe;
  } catch (error) {
    console.error(`❌ Erro ao criar listener:`, error);
    return () => {};
  }
}

/**
 * Exporta todos os dados para JSON (backup)
 */
export async function exportAllData(): Promise<string> {
  const allData: Record<string, any[]> = {};

  for (const collectionName of Object.values(COLLECTIONS)) {
    try {
      allData[collectionName] = await getAllFromFirestore(collectionName);
    } catch (error) {
      console.error(`Erro ao exportar ${collectionName}:`, error);
      allData[collectionName] = [];
    }
  }

  return JSON.stringify({
    userId: getUserId(),
    exportDate: new Date().toISOString(),
    data: allData
  }, null, 2);
}

/**
 * Importa dados de JSON (restore)
 */
export async function importAllData(jsonString: string): Promise<void> {
  try {
    const backup = JSON.parse(jsonString);

    if (!backup.data) {
      throw new Error('Formato de backup inválido');
    }

    // Limpar todas as coleções
    await clearAllCollections();

    // Importar dados
    for (const [collectionName, data] of Object.entries(backup.data)) {
      if (Array.isArray(data) && Object.values(COLLECTIONS).includes(collectionName)) {
        await saveToFirestore(collectionName, data);
      }
    }

    console.log('✅ Dados importados com sucesso');
  } catch (error) {
    console.error('❌ Erro ao importar dados:', error);
    throw error;
  }
}

export { COLLECTIONS as STORES };
