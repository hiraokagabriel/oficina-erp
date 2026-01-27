/**
 * storageService.ts
 * Gerenciamento de armazenamento local usando IndexedDB
 * Backup offline dos dados do usuário
 */

const DB_NAME = 'OficinaERP_DB';
const DB_VERSION = 1;
const STORES = {
  clientes: 'clientes',
  processos: 'processos',
  financeiro: 'financeiro',
  oficina: 'oficina',
  config: 'config',
  metadata: 'metadata'
};

let db: IDBDatabase | null = null;

/**
 * Inicializa o banco de dados IndexedDB
 */
export async function initIndexedDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('❌ Erro ao abrir IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log('✅ IndexedDB inicializado com sucesso');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Criar object stores se não existirem
      Object.values(STORES).forEach(storeName => {
        if (!database.objectStoreNames.contains(storeName)) {
          const objectStore = database.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
          
          // Criar índices
          if (storeName === 'clientes') {
            objectStore.createIndex('email', 'email', { unique: false });
            objectStore.createIndex('cpf', 'cpf', { unique: false });
          }
          
          if (storeName === 'metadata') {
            objectStore.createIndex('key', 'key', { unique: true });
          }

          console.log(`📦 Object store criado: ${storeName}`);
        }
      });
    };
  });
}

/**
 * Salva dados em um store específico
 */
export async function saveToLocal<T>(storeName: string, data: T[]): Promise<void> {
  const database = await initIndexedDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readwrite');
    const objectStore = transaction.objectStore(storeName);

    // Limpar store antes de adicionar novos dados
    objectStore.clear();

    // Adicionar todos os dados
    data.forEach(item => objectStore.add(item));

    transaction.oncomplete = () => {
      console.log(`✅ ${data.length} itens salvos em ${storeName}`);
      resolve();
    };

    transaction.onerror = () => {
      console.error(`❌ Erro ao salvar em ${storeName}:`, transaction.error);
      reject(transaction.error);
    };
  });
}

/**
 * Busca todos os dados de um store
 */
export async function getAllFromLocal<T>(storeName: string): Promise<T[]> {
  const database = await initIndexedDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readonly');
    const objectStore = transaction.objectStore(storeName);
    const request = objectStore.getAll();

    request.onsuccess = () => {
      resolve(request.result as T[]);
    };

    request.onerror = () => {
      console.error(`❌ Erro ao buscar de ${storeName}:`, request.error);
      reject(request.error);
    };
  });
}

/**
 * Adiciona ou atualiza um item em um store
 */
export async function putInLocal<T extends { id?: any }>(storeName: string, item: T): Promise<void> {
  const database = await initIndexedDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readwrite');
    const objectStore = transaction.objectStore(storeName);
    const request = objectStore.put(item);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Remove um item de um store
 */
export async function deleteFromLocal(storeName: string, id: any): Promise<void> {
  const database = await initIndexedDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readwrite');
    const objectStore = transaction.objectStore(storeName);
    const request = objectStore.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Limpa todos os dados de um store
 */
export async function clearStore(storeName: string): Promise<void> {
  const database = await initIndexedDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readwrite');
    const objectStore = transaction.objectStore(storeName);
    const request = objectStore.clear();

    request.onsuccess = () => {
      console.log(`🗑️ Store limpo: ${storeName}`);
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Limpa TODOS os stores (reset completo)
 */
export async function clearAllStores(): Promise<void> {
  const promises = Object.values(STORES).map(store => clearStore(store));
  await Promise.all(promises);
  console.log('🗑️ Todos os stores foram limpos');
}

/**
 * Salva metadados (como última sincronização)
 */
export async function saveMetadata(key: string, value: any): Promise<void> {
  await putInLocal('metadata', { key, value, timestamp: Date.now() });
}

/**
 * Busca metadados
 */
export async function getMetadata(key: string): Promise<any> {
  const database = await initIndexedDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['metadata'], 'readonly');
    const objectStore = transaction.objectStore('metadata');
    const index = objectStore.index('key');
    const request = index.get(key);

    request.onsuccess = () => {
      resolve(request.result?.value || null);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Exporta todos os dados para JSON (backup)
 */
export async function exportAllData(): Promise<string> {
  const allData: Record<string, any[]> = {};

  for (const storeName of Object.values(STORES)) {
    try {
      allData[storeName] = await getAllFromLocal(storeName);
    } catch (error) {
      console.error(`Erro ao exportar ${storeName}:`, error);
      allData[storeName] = [];
    }
  }

  return JSON.stringify({
    version: DB_VERSION,
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

    // Limpar todos os stores
    await clearAllStores();

    // Importar dados
    for (const [storeName, data] of Object.entries(backup.data)) {
      if (Array.isArray(data) && Object.values(STORES).includes(storeName)) {
        await saveToLocal(storeName, data);
      }
    }

    console.log('✅ Dados importados com sucesso');
  } catch (error) {
    console.error('❌ Erro ao importar dados:', error);
    throw error;
  }
}

export { STORES };
