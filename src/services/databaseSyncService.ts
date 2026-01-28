import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  deleteDoc,
  query,
  where,
  writeBatch,
  onSnapshot,
  Unsubscribe,
  Timestamp
} from 'firebase/firestore';
import { 
  reauthenticateWithCredential, 
  EmailAuthProvider 
} from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { LedgerEntry, WorkOrder, Client, CatalogItem, Settings } from '../types';

/**
 * Interface para dados locais completos
 */
interface LocalDatabase {
  ledger: LedgerEntry[];
  workOrders: WorkOrder[];
  clients: Client[];
  catalogParts: CatalogItem[];
  catalogServices: CatalogItem[];
  settings: Settings;
  lastSync?: string;
}

/**
 * Status de sincronização
 */
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'offline';

/**
 * Constantes de otimização
 */
const BATCH_SIZE = 500; // Limite do Firestore
const DEBOUNCE_DELAY = 3000; // 3 segundos
const SYNC_METADATA_KEY = 'oficina-erp-sync-metadata';

/**
 * 🚀 OTIMIZADO: Serviço de sincronização de banco de dados
 * 
 * MELHORIAS IMPLEMENTADAS:
 * ✅ Sync Incremental: Queries com where('updatedAt', '>', lastSyncTime)
 * ✅ Batching: Chunks de 500 documentos
 * ✅ Debounce: Agrupa mudanças por 3 segundos
 * ✅ Hash: Compara conteúdo antes de gravar
 */
export class DatabaseSyncService {
  private userId: string;
  private localStorageKey = 'oficina-erp-database';
  private listeners: Unsubscribe[] = [];
  private onStatusChange?: (status: SyncStatus, message?: string) => void;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private pendingUpdates: Map<string, any[]> = new Map();

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Define callback para mudanças de status
   */
  setStatusCallback(callback: (status: SyncStatus, message?: string) => void) {
    this.onStatusChange = callback;
  }

  /**
   * Atualiza status e notifica callback
   */
  private updateStatus(status: SyncStatus, message?: string) {
    if (this.onStatusChange) {
      this.onStatusChange(status, message);
    }
  }

  /**
   * 🔧 NOVO: Calcula hash SHA-256 de um objeto
   */
  private async hashObject(obj: any): Promise<string> {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * 🔧 NOVO: Divide array em chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * 🔧 NOVO: Obtém timestamp da última sincronização
   */
  private getLastSyncTimestamp(): string | null {
    try {
      const metadata = localStorage.getItem(SYNC_METADATA_KEY);
      if (metadata) {
        const parsed = JSON.parse(metadata);
        return parsed.lastSync || null;
      }
    } catch (error) {
      console.error('❌ Erro ao ler metadata de sync:', error);
    }
    return null;
  }

  /**
   * 🔧 NOVO: Salva timestamp da última sincronização
   */
  private saveLastSyncTimestamp(): void {
    try {
      const metadata = {
        lastSync: new Date().toISOString(),
        userId: this.userId
      };
      localStorage.setItem(SYNC_METADATA_KEY, JSON.stringify(metadata));
    } catch (error) {
      console.error('❌ Erro ao salvar metadata de sync:', error);
    }
  }

  /**
   * 🚀 OTIMIZADO: Sincroniza dados no primeiro login
   */
  async syncOnFirstLogin(): Promise<void> {
    this.updateStatus('syncing', 'Verificando dados...');
    
    try {
      const localData = this.getLocalData();
      const lastSync = this.getLastSyncTimestamp();

      // Se há timestamp de sync, fazer sincronização incremental
      if (lastSync) {
        console.log('🔄 Sincronização incremental desde:', lastSync);
        await this.incrementalSync(lastSync);
      } else {
        // Primeira sincronização completa
        const firestoreData = await this.downloadFromFirestore();

        if (this.isFirestoreEmpty(firestoreData) && this.hasLocalData(localData)) {
          console.log('🔼 Migrando dados locais para Firebase...');
          this.updateStatus('syncing', 'Enviando dados locais para nuvem...');
          await this.uploadToFirestoreOptimized(localData);
          this.saveLastSyncTimestamp();
          this.updateStatus('success', 'Dados migrados para nuvem!');
        } else if (!this.isFirestoreEmpty(firestoreData)) {
          console.log('🔽 Baixando dados do Firebase...');
          this.updateStatus('syncing', 'Baixando dados da nuvem...');
          await this.saveFirestoreDataLocally(firestoreData);
          this.saveLastSyncTimestamp();
          this.updateStatus('success', 'Dados sincronizados!');
        } else {
          console.log('📝 Inicializando banco de dados...');
          this.saveLastSyncTimestamp();
          this.updateStatus('success', 'Banco de dados inicializado!');
        }
      }

      // Configurar listeners otimizados
      this.setupOptimizedListeners();
    } catch (error: any) {
      console.error('❌ Erro na sincronização:', error);
      this.updateStatus('error', error.message || 'Erro na sincronização');
      throw error;
    }
  }

  /**
   * 🚀 NOVO: Sincronização incremental
   */
  private async incrementalSync(lastSync: string): Promise<void> {
    this.updateStatus('syncing', 'Sincronizando mudanças...');
    
    const collections = [
      { name: 'clients', key: 'clients' as keyof LocalDatabase },
      { name: 'workOrders', key: 'workOrders' as keyof LocalDatabase },
      { name: 'ledger', key: 'ledger' as keyof LocalDatabase },
      { name: 'catalogParts', key: 'catalogParts' as keyof LocalDatabase },
      { name: 'catalogServices', key: 'catalogServices' as keyof LocalDatabase }
    ];

    let totalUpdated = 0;

    for (const { name, key } of collections) {
      try {
        const q = query(
          collection(db, `users/${this.userId}/${name}`),
          where('updatedAt', '>', lastSync)
        );
        
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          const updates = snapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data() 
          }));
          
          console.log(`📥 ${name}: ${updates.length} mudanças detectadas`);
          await this.mergeUpdatesLocally(key, updates);
          totalUpdated += updates.length;
        }
      } catch (error) {
        console.error(`❌ Erro na sync incremental de ${name}:`, error);
      }
    }

    this.saveLastSyncTimestamp();
    
    if (totalUpdated > 0) {
      console.log(`✅ ${totalUpdated} documentos atualizados`);
      this.updateStatus('success', `${totalUpdated} itens atualizados!`);
    } else {
      console.log('✅ Dados já atualizados');
      this.updateStatus('success', 'Dados atualizados!');
    }
  }

  /**
   * 🔧 NOVO: Mescla atualizações localmente
   */
  private async mergeUpdatesLocally<K extends keyof LocalDatabase>(
    collectionKey: K,
    updates: any[]
  ): Promise<void> {
    const localData = this.getLocalData();
    const currentData = localData[collectionKey] as any[];
    
    // Criar mapa por ID para eficiência
    const dataMap = new Map(currentData.map(item => [item.id, item]));
    
    // Aplicar atualizações
    for (const update of updates) {
      dataMap.set(update.id, update);
    }
    
    // Atualizar coleção
    localData[collectionKey] = Array.from(dataMap.values()) as any;
    localData.lastSync = new Date().toISOString();
    
    this.saveLocalData(localData);
  }

  /**
   * 🚀 OTIMIZADO: Upload com batching
   */
  private async uploadToFirestoreOptimized(localData: LocalDatabase): Promise<void> {
    const collections = [
      { name: 'clients', data: localData.clients || [] },
      { name: 'workOrders', data: localData.workOrders || [] },
      { name: 'ledger', data: localData.ledger || [] },
      { name: 'catalogParts', data: localData.catalogParts || [] },
      { name: 'catalogServices', data: localData.catalogServices || [] }
    ];

    let totalUploaded = 0;

    for (const { name, data } of collections) {
      if (data.length === 0) continue;

      console.log(`📤 Enviando ${data.length} ${name}...`);
      
      // Dividir em chunks de 500
      const chunks = this.chunkArray(data, BATCH_SIZE);
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const batch = writeBatch(db);
        
        for (const item of chunk) {
          const docRef = doc(db, `users/${this.userId}/${name}`, item.id);
          batch.set(docRef, {
            ...item,
            updatedAt: Timestamp.now().toDate().toISOString(),
            syncedAt: new Date().toISOString()
          });
        }
        
        await batch.commit();
        totalUploaded += chunk.length;
        
        const progress = Math.round((totalUploaded / data.length) * 100);
        this.updateStatus('syncing', `Enviando ${name}: ${progress}%`);
      }
      
      console.log(`✅ ${data.length} ${name} enviados`);
    }

    // Upload de configurações (único documento)
    if (localData.settings) {
      const settingsRef = doc(db, `users/${this.userId}/settings`, 'preferences');
      await setDoc(settingsRef, {
        ...localData.settings,
        updatedAt: Timestamp.now().toDate().toISOString(),
        syncedAt: new Date().toISOString()
      });
      totalUploaded++;
    }

    console.log(`✅ Total: ${totalUploaded} documentos enviados`);
  }

  /**
   * Faz download de dados do Firestore (mantido para compatibilidade)
   */
  private async downloadFromFirestore(): Promise<Partial<LocalDatabase>> {
    const data: Partial<LocalDatabase> = {};

    try {
      const collections = [
        { name: 'clients', key: 'clients' as keyof LocalDatabase },
        { name: 'workOrders', key: 'workOrders' as keyof LocalDatabase },
        { name: 'ledger', key: 'ledger' as keyof LocalDatabase },
        { name: 'catalogParts', key: 'catalogParts' as keyof LocalDatabase },
        { name: 'catalogServices', key: 'catalogServices' as keyof LocalDatabase }
      ];

      for (const { name, key } of collections) {
        const snapshot = await getDocs(collection(db, `users/${this.userId}/${name}`));
        data[key] = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        })) as any;
      }

      // Download de configurações
      const settingsSnapshot = await getDocs(
        collection(db, `users/${this.userId}/settings`)
      );
      if (!settingsSnapshot.empty) {
        data.settings = settingsSnapshot.docs[0].data() as Settings;
      }

      console.log(`📦 Dados baixados do Firebase:`, {
        clients: data.clients?.length || 0,
        workOrders: data.workOrders?.length || 0,
        ledger: data.ledger?.length || 0,
        catalogParts: data.catalogParts?.length || 0,
        catalogServices: data.catalogServices?.length || 0
      });

      return data;
    } catch (error) {
      console.error('❌ Erro ao baixar do Firebase:', error);
      throw error;
    }
  }

  /**
   * Salva dados do Firestore localmente
   */
  private async saveFirestoreDataLocally(firestoreData: Partial<LocalDatabase>): Promise<void> {
    const localData = this.getLocalData();

    const updatedData: LocalDatabase = {
      ledger: firestoreData.ledger || localData.ledger || [],
      workOrders: firestoreData.workOrders || localData.workOrders || [],
      clients: firestoreData.clients || localData.clients || [],
      catalogParts: firestoreData.catalogParts || localData.catalogParts || [],
      catalogServices: firestoreData.catalogServices || localData.catalogServices || [],
      settings: firestoreData.settings || localData.settings || {} as Settings,
      lastSync: new Date().toISOString()
    };

    this.saveLocalData(updatedData);
    console.log('✅ Backup local atualizado');
  }

  /**
   * 🚀 OTIMIZADO: Listeners com debounce e hash
   */
  private setupOptimizedListeners(): void {
    console.log('👂 Configurando listeners otimizados...');

    const collections = [
      { name: 'clients', key: 'clients' as keyof LocalDatabase },
      { name: 'workOrders', key: 'workOrders' as keyof LocalDatabase },
      { name: 'ledger', key: 'ledger' as keyof LocalDatabase }
    ];

    for (const { name, key } of collections) {
      const listener = onSnapshot(
        collection(db, `users/${this.userId}/${name}`),
        (snapshot) => {
          // Coletar mudanças
          const changes = snapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data() 
          }));
          
          // Adicionar ao buffer de atualizações pendentes
          this.pendingUpdates.set(key, changes);
          
          // Cancelar timer anterior se existir
          if (this.debounceTimers.has(key)) {
            clearTimeout(this.debounceTimers.get(key)!);
          }
          
          // Criar novo timer de debounce
          const timer = setTimeout(async () => {
            const pendingData = this.pendingUpdates.get(key);
            if (pendingData) {
              await this.processUpdatesWithHash(key, pendingData);
              this.pendingUpdates.delete(key);
            }
            this.debounceTimers.delete(key);
          }, DEBOUNCE_DELAY);
          
          this.debounceTimers.set(key, timer);
        },
        (error) => {
          console.error(`❌ Erro no listener de ${name}:`, error);
          this.updateStatus('error', `Erro na sincronização de ${name}`);
        }
      );
      
      this.listeners.push(listener);
    }
  }

  /**
   * 🔧 NOVO: Processa atualizações com verificação de hash
   */
  private async processUpdatesWithHash<K extends keyof LocalDatabase>(
    collectionKey: K,
    newData: any[]
  ): Promise<void> {
    const localData = this.getLocalData();
    const currentData = localData[collectionKey] as any[];
    
    // Calcular hash dos dados atuais
    const currentHash = await this.hashObject(currentData);
    const newHash = await this.hashObject(newData);
    
    // Só atualizar se os dados mudaram
    if (currentHash !== newHash) {
      localData[collectionKey] = newData as any;
      localData.lastSync = new Date().toISOString();
      this.saveLocalData(localData);
      
      console.log(`🔄 ${collectionKey} atualizados: ${newData.length} itens`);
    } else {
      console.log(`⏭️ ${collectionKey} sem mudanças (hash idêntico)`);
    }
  }

  /**
   * 🚀 OTIMIZADO: Reseta banco com batching
   */
  async resetDatabase(password: string): Promise<boolean> {
    try {
      this.updateStatus('syncing', 'Validando senha...');

      const user = auth.currentUser;
      if (!user || !user.email) {
        throw new Error('Usuário não autenticado');
      }

      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);

      this.updateStatus('syncing', 'Deletando dados...');

      const collections = ['clients', 'workOrders', 'ledger', 'catalogParts', 'catalogServices'];
      let totalDeleted = 0;

      for (const collectionName of collections) {
        const snapshot = await getDocs(collection(db, `users/${this.userId}/${collectionName}`));
        
        if (snapshot.empty) continue;
        
        // Dividir em chunks
        const chunks = this.chunkArray(snapshot.docs, BATCH_SIZE);
        
        for (const chunk of chunks) {
          const batch = writeBatch(db);
          chunk.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          totalDeleted += chunk.length;
        }
      }

      // Limpar dados locais e metadata
      localStorage.removeItem(this.localStorageKey);
      localStorage.removeItem(SYNC_METADATA_KEY);

      console.log(`🗑️ ${totalDeleted} documentos deletados`);
      this.updateStatus('success', 'Banco de dados resetado!');
      return true;
    } catch (error: any) {
      console.error('❌ Erro ao resetar banco:', error);
      if (error.code === 'auth/wrong-password') {
        this.updateStatus('error', 'Senha incorreta');
        throw new Error('Senha incorreta');
      }
      this.updateStatus('error', error.message || 'Erro ao resetar banco');
      throw error;
    }
  }

  /**
   * Limpa listeners e timers
   */
  cleanup(): void {
    // Limpar listeners
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners = [];
    
    // Limpar timers de debounce
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    
    // Limpar updates pendentes
    this.pendingUpdates.clear();
    
    console.log('🧹 Recursos liberados');
  }

  // ===== MÉTODOS AUXILIARES =====

  private getLocalData(): LocalDatabase {
    const data = localStorage.getItem(this.localStorageKey);
    if (data) {
      return JSON.parse(data);
    }
    return {
      ledger: [],
      workOrders: [],
      clients: [],
      catalogParts: [],
      catalogServices: [],
      settings: {} as Settings
    };
  }

  private saveLocalData(data: LocalDatabase): void {
    localStorage.setItem(this.localStorageKey, JSON.stringify(data));
  }

  private updateLocalCollection<K extends keyof LocalDatabase>(
    collectionName: K,
    data: LocalDatabase[K]
  ): void {
    const localData = this.getLocalData();
    localData[collectionName] = data;
    localData.lastSync = new Date().toISOString();
    this.saveLocalData(localData);
  }

  private isFirestoreEmpty(data: Partial<LocalDatabase>): boolean {
    return (
      (!data.clients || data.clients.length === 0) &&
      (!data.workOrders || data.workOrders.length === 0) &&
      (!data.ledger || data.ledger.length === 0) &&
      (!data.catalogParts || data.catalogParts.length === 0) &&
      (!data.catalogServices || data.catalogServices.length === 0)
    );
  }

  private hasLocalData(data: LocalDatabase): boolean {
    return (
      (data.clients && data.clients.length > 0) ||
      (data.workOrders && data.workOrders.length > 0) ||
      (data.ledger && data.ledger.length > 0) ||
      (data.catalogParts && data.catalogParts.length > 0) ||
      (data.catalogServices && data.catalogServices.length > 0)
    );
  }
}
