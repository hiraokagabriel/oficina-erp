import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { LedgerEntry, WorkOrder, Client, CatalogItem, WorkshopSettings, DatabaseSchema } from '../types';
import { auth } from '../config/firebase';
import {
  getAllFromFirestore,
  putInFirestore,
  subscribeToCollection,
  COLLECTIONS
} from '../services/firestoreService';

// Detecta se está rodando em Tauri (desktop) ou navegador (web)
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

interface DatabaseContextData {
  ledger: LedgerEntry[];
  setLedger: React.Dispatch<React.SetStateAction<LedgerEntry[]>>;
  workOrders: WorkOrder[];
  setWorkOrders: React.Dispatch<React.SetStateAction<WorkOrder[]>>;
  clients: Client[];
  setClients: React.Dispatch<React.SetStateAction<Client[]>>;
  catalogParts: CatalogItem[];
  setCatalogParts: React.Dispatch<React.SetStateAction<CatalogItem[]>>;
  catalogServices: CatalogItem[];
  setCatalogServices: React.Dispatch<React.SetStateAction<CatalogItem[]>>;
  settings: WorkshopSettings;
  setSettings: React.Dispatch<React.SetStateAction<WorkshopSettings>>;
  isLoading: boolean;
  isSaving: boolean;
  useFirestore: boolean;
  isOnline: boolean;
}

const DatabaseContext = createContext<DatabaseContextData>({} as DatabaseContextData);

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dbPath] = useState(() => localStorage.getItem("oficina_db_path") || "C:\\OficinaData\\database.json");
  
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [catalogParts, setCatalogParts] = useState<CatalogItem[]>([]);
  const [catalogServices, setCatalogServices] = useState<CatalogItem[]>([]);
  const [settings, setSettings] = useState<WorkshopSettings>({ 
    name: "OFICINA", 
    cnpj: "", 
    address: "", 
    technician: "", 
    exportPath: "", 
    googleDriveToken: "",
    googleApiKey: ""
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [useFirestore, setUseFirestore] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const isInitialLoad = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const unsubscribeFunctions = useRef<(() => void)[]>([]);

  // Monitora status de autenticação e conexão
  useEffect(() => {
    // Verifica se o usuário está autenticado
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      setUseFirestore(!!user && isOnline);
      if (user) {
        console.log(`🔥 Firestore ativado para: ${user.email}`);
      } else {
        console.log('💾 Usando LocalStorage (não autenticado)');
      }
    });

    // Monitora conexão com a internet
    const handleOnline = () => {
      setIsOnline(true);
      if (auth.currentUser) setUseFirestore(true);
      console.log('✅ Conexão online - Firestore ativado');
    };

    const handleOffline = () => {
      setIsOnline(false);
      setUseFirestore(false);
      console.log('⚠️ Conexão offline - Usando cache local');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribeAuth();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isOnline]);

  // Função para carregar dados (Firestore, Tauri ou LocalStorage)
  const loadDatabase = async (): Promise<DatabaseSchema | null> => {
    // PRIORIDADE 1: Firestore (se autenticado)
    if (useFirestore && auth.currentUser) {
      try {
        console.log('🔥 Carregando do Firestore...');
        const [ledgerData, workOrdersData, clientsData, partsData, servicesData] = await Promise.all([
          getAllFromFirestore<LedgerEntry>(COLLECTIONS.financeiro),
          getAllFromFirestore<WorkOrder>(COLLECTIONS.processos),
          getAllFromFirestore<Client>(COLLECTIONS.clientes),
          getAllFromFirestore<CatalogItem>(COLLECTIONS.oficina + '_parts'),
          getAllFromFirestore<CatalogItem>(COLLECTIONS.oficina + '_services')
        ]);

        return {
          ledger: ledgerData,
          workOrders: workOrdersData,
          clients: clientsData,
          catalogParts: partsData,
          catalogServices: servicesData,
          settings
        };
      } catch (e) {
        console.error("❌ Erro ao carregar do Firestore:", e);
        // Fallback para LocalStorage
      }
    }

    // PRIORIDADE 2: Tauri (desktop)
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const data = await invoke<string>('load_database', { filepath: dbPath });
        if (data && data.trim()) {
          console.log('🖥️ Carregado do Tauri');
          return JSON.parse(data);
        }
      } catch (e) {
        console.error("❌ Erro ao carregar banco (Tauri):", e);
      }
    }

    // PRIORIDADE 3: LocalStorage (web)
    try {
      const data = localStorage.getItem('oficina_database');
      if (data) {
        console.log('💾 Carregado do LocalStorage');
        return JSON.parse(data);
      }
    } catch (e) {
      console.error("❌ Erro ao carregar banco (LocalStorage):", e);
    }

    return null;
  };

  // Função para salvar dados (Firestore, Tauri ou LocalStorage)
  const saveDatabase = async (data: DatabaseSchema): Promise<void> => {
    // SEMPRE salva no LocalStorage como backup
    try {
      localStorage.setItem('oficina_database', JSON.stringify(data));
    } catch (e) {
      console.error("❌ Erro ao salvar no LocalStorage:", e);
    }

    // Se estiver usando Firestore, salva lá também
    if (useFirestore && auth.currentUser) {
      try {
        // Salva cada coleção separadamente (mais eficiente)
        await Promise.all([
          ...data.ledger.map(item => putInFirestore(COLLECTIONS.financeiro, item)),
          ...data.workOrders.map(item => putInFirestore(COLLECTIONS.processos, item)),
          ...data.clients.map(item => putInFirestore(COLLECTIONS.clientes, item)),
          ...data.catalogParts.map(item => putInFirestore(COLLECTIONS.oficina + '_parts', item)),
          ...data.catalogServices.map(item => putInFirestore(COLLECTIONS.oficina + '_services', item))
        ]);
        console.log('✅ Sincronizado com Firestore');
      } catch (e) {
        console.error("❌ Erro ao sincronizar com Firestore:", e);
      }
    }

    // Se estiver em Tauri, salva também no arquivo
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('save_database_atomic', { filepath: dbPath, content: JSON.stringify(data) });
        console.log('✅ Salvo no Tauri');
      } catch (e) {
        console.error("❌ Erro ao salvar banco (Tauri):", e);
      }
    }
  };

  // Load Inicial
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      isInitialLoad.current = true;
      
      console.log(`🔄 Carregando banco... (${useFirestore ? 'Firestore' : isTauri ? 'Tauri' : 'LocalStorage'})`);
      
      const parsed = await loadDatabase();
      
      if (parsed) {
        setLedger(parsed.ledger || []);
        setWorkOrders(parsed.workOrders || []);
        setClients(parsed.clients || []);
        setCatalogParts(parsed.catalogParts || []);
        setCatalogServices(parsed.catalogServices || []);
        setSettings(parsed.settings || settings);
        console.log('✅ Banco carregado com sucesso!');
      } else {
        console.log('🆕 Banco vazio - iniciando com dados padrão');
      }
      
      setIsLoading(false);
      
      // Aguarda um pouco antes de permitir saves automáticos
      setTimeout(() => {
        isInitialLoad.current = false;
        console.log('✅ Auto-save habilitado');
      }, 500);
    }
    load();
  }, [useFirestore]);

  // Sincronização em tempo real com Firestore
  useEffect(() => {
    if (!useFirestore || !auth.currentUser) {
      // Limpa listeners anteriores
      unsubscribeFunctions.current.forEach(unsubscribe => unsubscribe());
      unsubscribeFunctions.current = [];
      return;
    }

    console.log('🔄 Ativando sincronização em tempo real...');

    // Cria listeners para cada coleção
    const unsubscribeLedger = subscribeToCollection<LedgerEntry>(
      COLLECTIONS.financeiro,
      (data) => setLedger(data)
    );

    const unsubscribeWorkOrders = subscribeToCollection<WorkOrder>(
      COLLECTIONS.processos,
      (data) => setWorkOrders(data)
    );

    const unsubscribeClients = subscribeToCollection<Client>(
      COLLECTIONS.clientes,
      (data) => setClients(data)
    );

    // Guarda funções de desinscrever
    unsubscribeFunctions.current = [
      unsubscribeLedger,
      unsubscribeWorkOrders,
      unsubscribeClients
    ];

    // Cleanup
    return () => {
      unsubscribeFunctions.current.forEach(unsubscribe => unsubscribe());
      unsubscribeFunctions.current = [];
    };
  }, [useFirestore]);

  // Auto-Save OTIMIZADO com debounce de 3 segundos
  useEffect(() => {
    // Não salva durante o load inicial
    if (isInitialLoad.current || isLoading) return;
    
    // Não salva se não houver dados
    if (workOrders.length === 0 && clients.length === 0 && ledger.length === 0) return;

    // Limpa timeout anterior
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // DEBOUNCE: 3 segundos
    saveTimeoutRef.current = setTimeout(async () => {
      setIsSaving(true);
      const fullDb: DatabaseSchema = { ledger, workOrders, clients, catalogParts, catalogServices, settings };
      await saveDatabase(fullDb);
      setIsSaving(false);
    }, 3000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [ledger, workOrders, clients, catalogParts, catalogServices, settings, useFirestore, isLoading]);

  return (
    <DatabaseContext.Provider value={{
      ledger, setLedger,
      workOrders, setWorkOrders,
      clients, setClients,
      catalogParts, setCatalogParts,
      catalogServices, setCatalogServices,
      settings, setSettings,
      isLoading, isSaving,
      useFirestore,
      isOnline
    }}>
      {children}
    </DatabaseContext.Provider>
  );
};

export const useDatabase = () => useContext(DatabaseContext);
