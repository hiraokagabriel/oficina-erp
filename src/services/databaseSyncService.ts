import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  deleteDoc,
  query,
  writeBatch,
  onSnapshot,
  Unsubscribe
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
 * Serviço de sincronização de banco de dados
 * Gerencia sincronização bidirecional entre LocalStorage e Firestore
 */
export class DatabaseSyncService {
  private userId: string;
  private localStorageKey = 'oficina-erp-database';
  private listeners: Unsubscribe[] = [];
  private onStatusChange?: (status: SyncStatus, message?: string) => void;

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
   * Sincroniza dados no primeiro login
   */
  async syncOnFirstLogin(): Promise<void> {
    this.updateStatus('syncing', 'Verificando dados...');
    
    try {
      const localData = this.getLocalData();
      const firestoreData = await this.downloadFromFirestore();

      // Se não há dados no Firestore mas há dados locais, fazer upload
      if (this.isFirestoreEmpty(firestoreData) && this.hasLocalData(localData)) {
        console.log('🔼 Migrando dados locais para Firebase...');
        this.updateStatus('syncing', 'Enviando dados locais para nuvem...');
        await this.uploadToFirestore(localData);
        localData.lastSync = new Date().toISOString();
        this.saveLocalData(localData);
        this.updateStatus('success', 'Dados migrados para nuvem!');
      } 
      // Se há dados no Firestore, fazer download
      else if (!this.isFirestoreEmpty(firestoreData)) {
        console.log('🔽 Baixando dados do Firebase...');
        this.updateStatus('syncing', 'Baixando dados da nuvem...');
        await this.saveFirestoreDataLocally(firestoreData);
        this.updateStatus('success', 'Dados sincronizados!');
      }
      // Se não há dados em lugar nenhum, inicializar vazio
      else {
        console.log('📝 Inicializando banco de dados...');
        this.updateStatus('success', 'Banco de dados inicializado!');
      }

      // Configurar listeners em tempo real
      this.setupRealtimeListeners();
    } catch (error: any) {
      console.error('❌ Erro na sincronização:', error);
      this.updateStatus('error', error.message || 'Erro na sincronização');
      throw error;
    }
  }

  /**
   * Faz upload de dados locais para Firestore
   */
  private async uploadToFirestore(localData: LocalDatabase): Promise<void> {
    const batch = writeBatch(db);
    let count = 0;

    // Upload de clientes
    for (const client of localData.clients || []) {
      const clientRef = doc(db, `users/${this.userId}/clients`, client.id);
      batch.set(clientRef, {
        ...client,
        syncedAt: new Date().toISOString()
      });
      count++;
    }

    // Upload de ordens de serviço
    for (const workOrder of localData.workOrders || []) {
      const workOrderRef = doc(db, `users/${this.userId}/workOrders`, workOrder.id);
      batch.set(workOrderRef, {
        ...workOrder,
        syncedAt: new Date().toISOString()
      });
      count++;
    }

    // Upload de lançamentos financeiros
    for (const entry of localData.ledger || []) {
      const ledgerRef = doc(db, `users/${this.userId}/ledger`, entry.id);
      batch.set(ledgerRef, {
        ...entry,
        syncedAt: new Date().toISOString()
      });
      count++;
    }

    // Upload de peças do catálogo
    for (const part of localData.catalogParts || []) {
      const partRef = doc(db, `users/${this.userId}/catalogParts`, part.id);
      batch.set(partRef, {
        ...part,
        syncedAt: new Date().toISOString()
      });
      count++;
    }

    // Upload de serviços do catálogo
    for (const service of localData.catalogServices || []) {
      const serviceRef = doc(db, `users/${this.userId}/catalogServices`, service.id);
      batch.set(serviceRef, {
        ...service,
        syncedAt: new Date().toISOString()
      });
      count++;
    }

    // Upload de configurações
    if (localData.settings) {
      const settingsRef = doc(db, `users/${this.userId}/settings`, 'preferences');
      batch.set(settingsRef, {
        ...localData.settings,
        syncedAt: new Date().toISOString()
      });
      count++;
    }

    await batch.commit();
    console.log(`✅ ${count} documentos enviados para Firebase`);
  }

  /**
   * Faz download de dados do Firestore
   */
  private async downloadFromFirestore(): Promise<Partial<LocalDatabase>> {
    const data: Partial<LocalDatabase> = {};

    try {
      // Download de clientes
      const clientsSnapshot = await getDocs(
        collection(db, `users/${this.userId}/clients`)
      );
      data.clients = clientsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));

      // Download de ordens de serviço
      const workOrdersSnapshot = await getDocs(
        collection(db, `users/${this.userId}/workOrders`)
      );
      data.workOrders = workOrdersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkOrder));

      // Download de lançamentos financeiros
      const ledgerSnapshot = await getDocs(
        collection(db, `users/${this.userId}/ledger`)
      );
      data.ledger = ledgerSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LedgerEntry));

      // Download de peças do catálogo
      const catalogPartsSnapshot = await getDocs(
        collection(db, `users/${this.userId}/catalogParts`)
      );
      data.catalogParts = catalogPartsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CatalogItem));

      // Download de serviços do catálogo
      const catalogServicesSnapshot = await getDocs(
        collection(db, `users/${this.userId}/catalogServices`)
      );
      data.catalogServices = catalogServicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CatalogItem));

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
   * Configura listeners em tempo real
   */
  private setupRealtimeListeners(): void {
    console.log('👂 Configurando listeners em tempo real...');

    // Listener para clientes
    const clientsListener = onSnapshot(
      collection(db, `users/${this.userId}/clients`),
      (snapshot) => {
        const clients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
        this.updateLocalCollection('clients', clients);
        console.log('🔄 Clientes atualizados:', clients.length);
      },
      (error) => {
        console.error('❌ Erro no listener de clientes:', error);
        this.updateStatus('error', 'Erro na sincronização de clientes');
      }
    );

    // Listener para ordens de serviço
    const workOrdersListener = onSnapshot(
      collection(db, `users/${this.userId}/workOrders`),
      (snapshot) => {
        const workOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkOrder));
        this.updateLocalCollection('workOrders', workOrders);
        console.log('🔄 Ordens de serviço atualizadas:', workOrders.length);
      },
      (error) => {
        console.error('❌ Erro no listener de ordens:', error);
        this.updateStatus('error', 'Erro na sincronização de ordens');
      }
    );

    // Listener para lançamentos financeiros
    const ledgerListener = onSnapshot(
      collection(db, `users/${this.userId}/ledger`),
      (snapshot) => {
        const ledger = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LedgerEntry));
        this.updateLocalCollection('ledger', ledger);
        console.log('🔄 Lançamentos atualizados:', ledger.length);
      },
      (error) => {
        console.error('❌ Erro no listener de lançamentos:', error);
        this.updateStatus('error', 'Erro na sincronização financeira');
      }
    );

    this.listeners.push(clientsListener, workOrdersListener, ledgerListener);
  }

  /**
   * Reseta banco de dados com reautenticação
   */
  async resetDatabase(password: string): Promise<boolean> {
    try {
      this.updateStatus('syncing', 'Validando senha...');

      // Reautenticar usuário
      const user = auth.currentUser;
      if (!user || !user.email) {
        throw new Error('Usuário não autenticado');
      }

      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);

      this.updateStatus('syncing', 'Deletando dados...');

      // Deletar todos os dados do Firestore
      const batch = writeBatch(db);
      let count = 0;

      // Deletar clientes
      const clientsSnapshot = await getDocs(collection(db, `users/${this.userId}/clients`));
      clientsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        count++;
      });

      // Deletar ordens de serviço
      const workOrdersSnapshot = await getDocs(collection(db, `users/${this.userId}/workOrders`));
      workOrdersSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        count++;
      });

      // Deletar lançamentos financeiros
      const ledgerSnapshot = await getDocs(collection(db, `users/${this.userId}/ledger`));
      ledgerSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        count++;
      });

      // Deletar catálogo de peças
      const catalogPartsSnapshot = await getDocs(collection(db, `users/${this.userId}/catalogParts`));
      catalogPartsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        count++;
      });

      // Deletar catálogo de serviços
      const catalogServicesSnapshot = await getDocs(collection(db, `users/${this.userId}/catalogServices`));
      catalogServicesSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        count++;
      });

      await batch.commit();

      // Limpar dados locais
      localStorage.removeItem(this.localStorageKey);

      console.log(`🗑️ ${count} documentos deletados`);
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
   * Limpa listeners ao destruir serviço
   */
  cleanup(): void {
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners = [];
    console.log('🧹 Listeners removidos');
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
