/**
 * localStorageService.ts
 * 
 * Serviço de armazenamento local usando IndexedDB para backup offline
 * Suporta armazenamento estruturado de dados com sincronização
 */

const DB_NAME = 'OficinaERP_LocalDB';
const DB_VERSION = 1;

// Stores (tabelas) do IndexedDB
const STORES = {
  CLIENTS: 'clients',
  PROCESSES: 'processes',
  FINANCE: 'finance',
  SYNC_LOG: 'sync_log',
  METADATA: 'metadata'
};

interface SyncLog {
  id: string;
  timestamp: number;
  action: 'upload' | 'download' | 'reset' | 'export' | 'import';
  status: 'success' | 'error';
  details: string;
  recordsCount?: number;
}

interface Metadata {
  key: string;
  value: any;
  updatedAt: number;
}

class LocalStorageService {
  private db: IDBDatabase | null = null;

  /**
   * Inicializa o banco de dados IndexedDB
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('❌ Erro ao abrir IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ IndexedDB inicializado com sucesso');
        resolve();
      };

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;

        // Criar stores se não existirem
        if (!db.objectStoreNames.contains(STORES.CLIENTS)) {
          db.createObjectStore(STORES.CLIENTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.PROCESSES)) {
          db.createObjectStore(STORES.PROCESSES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.FINANCE)) {
          db.createObjectStore(STORES.FINANCE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.SYNC_LOG)) {
          const syncStore = db.createObjectStore(STORES.SYNC_LOG, { keyPath: 'id' });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.METADATA)) {
          db.createObjectStore(STORES.METADATA, { keyPath: 'key' });
        }

        console.log('📦 Stores criadas no IndexedDB');
      };
    });
  }

  /**
   * Garante que o DB está inicializado
   */
  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    return this.db!;
  }

  /**
   * Salva dados em uma store específica
   */
  async save(storeName: string, data: any[]): Promise<void> {
    const db = await this.ensureDB();
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);

    // Limpa dados antigos
    await store.clear();

    // Adiciona novos dados
    for (const item of data) {
      await store.put(item);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log(`✅ ${data.length} registros salvos em ${storeName}`);
        resolve();
      };
      transaction.onerror = () => {
        console.error(`❌ Erro ao salvar em ${storeName}:`, transaction.error);
        reject(transaction.error);
      };
    });
  }

  /**
   * Busca todos os dados de uma store
   */
  async getAll(storeName: string): Promise<any[]> {
    const db = await this.ensureDB();
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = () => {
        console.error(`❌ Erro ao buscar de ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Busca um item específico por ID
   */
  async getById(storeName: string, id: string): Promise<any | null> {
    const db = await this.ensureDB();
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(id);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Adiciona um registro de log de sincronização
   */
  async addSyncLog(log: Omit<SyncLog, 'id'>): Promise<void> {
    const db = await this.ensureDB();
    const transaction = db.transaction([STORES.SYNC_LOG], 'readwrite');
    const store = transaction.objectStore(STORES.SYNC_LOG);

    const fullLog: SyncLog = {
      ...log,
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    store.add(fullLog);

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Busca logs de sincronização (mais recentes primeiro)
   */
  async getSyncLogs(limit: number = 50): Promise<SyncLog[]> {
    const logs = await this.getAll(STORES.SYNC_LOG);
    return logs
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Salva metadados (configurações, timestamp de última sync, etc)
   */
  async setMetadata(key: string, value: any): Promise<void> {
    const db = await this.ensureDB();
    const transaction = db.transaction([STORES.METADATA], 'readwrite');
    const store = transaction.objectStore(STORES.METADATA);

    const metadata: Metadata = {
      key,
      value,
      updatedAt: Date.now()
    };

    store.put(metadata);

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Busca metadados
   */
  async getMetadata(key: string): Promise<any | null> {
    const metadata = await this.getById(STORES.METADATA, key) as Metadata | null;
    return metadata ? metadata.value : null;
  }

  /**
   * Limpa TODOS os dados locais (cuidado!)
   */
  async clearAll(): Promise<void> {
    const db = await this.ensureDB();
    const storeNames = [STORES.CLIENTS, STORES.PROCESSES, STORES.FINANCE];
    
    for (const storeName of storeNames) {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      await store.clear();
    }

    // Registra log de reset
    await this.addSyncLog({
      timestamp: Date.now(),
      action: 'reset',
      status: 'success',
      details: 'Banco de dados local resetado'
    });

    console.log('🗑️ Todos os dados locais foram limpos');
  }

  /**
   * Exporta todos os dados para JSON
   */
  async exportToJSON(): Promise<string> {
    const data = {
      clients: await this.getAll(STORES.CLIENTS),
      processes: await this.getAll(STORES.PROCESSES),
      finance: await this.getAll(STORES.FINANCE),
      metadata: {
        exportedAt: new Date().toISOString(),
        version: DB_VERSION
      }
    };

    await this.addSyncLog({
      timestamp: Date.now(),
      action: 'export',
      status: 'success',
      details: 'Dados exportados para JSON',
      recordsCount: data.clients.length + data.processes.length + data.finance.length
    });

    return JSON.stringify(data, null, 2);
  }

  /**
   * Importa dados de JSON
   */
  async importFromJSON(jsonString: string): Promise<void> {
    try {
      const data = JSON.parse(jsonString);

      // Valida estrutura
      if (!data.clients || !data.processes || !data.finance) {
        throw new Error('Formato de JSON inválido');
      }

      // Salva dados
      await this.save(STORES.CLIENTS, data.clients);
      await this.save(STORES.PROCESSES, data.processes);
      await this.save(STORES.FINANCE, data.finance);

      await this.addSyncLog({
        timestamp: Date.now(),
        action: 'import',
        status: 'success',
        details: 'Dados importados de JSON',
        recordsCount: data.clients.length + data.processes.length + data.finance.length
      });

      console.log('✅ Dados importados com sucesso');
    } catch (error: any) {
      await this.addSyncLog({
        timestamp: Date.now(),
        action: 'import',
        status: 'error',
        details: `Erro ao importar: ${error.message}`
      });
      throw error;
    }
  }

  /**
   * Obtém estatísticas do banco local
   */
  async getStats(): Promise<{
    clients: number;
    processes: number;
    finance: number;
    lastSync: number | null;
    totalRecords: number;
  }> {
    const clients = await this.getAll(STORES.CLIENTS);
    const processes = await this.getAll(STORES.PROCESSES);
    const finance = await this.getAll(STORES.FINANCE);
    const lastSync = await this.getMetadata('lastSyncTimestamp');

    return {
      clients: clients.length,
      processes: processes.length,
      finance: finance.length,
      lastSync: lastSync,
      totalRecords: clients.length + processes.length + finance.length
    };
  }
}

// Export singleton instance
export const localStorageService = new LocalStorageService();
export { STORES };
export type { SyncLog, Metadata };
