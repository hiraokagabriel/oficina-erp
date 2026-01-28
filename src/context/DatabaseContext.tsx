import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { LedgerEntry, WorkOrder, Client, CatalogItem, WorkshopSettings, DatabaseSchema } from '../types';
import { auth } from '../config/firebase';
import {
  getAllFromFirestore,
  saveToFirestore,
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
  const isSyncingFromFirestore = useRef(false);

  // Monitora status de autenticação e conexão
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      const shouldUseFirestore = !!user && isOnline;
      setUseFirestore(shouldUseFirestore);
      
      if (user) {
        console.log(`🔥 Firestore ativo: ${user.email}`);
      } else {
        console.log('💾 LocalStorage ativo (não autenticado)');
      }
    });

    const handleOnline = () => {
      setIsOnline(true);
      if (auth.currentUser) {
        setUseFirestore(true);
        console.log('✅ Online - Firestore ativado');
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setUseFirestore(false);
      console.log('⚠️ Offline - Cache local ativado');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribeAuth();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isOnline]);

  // Função para carregar dados
  const loadDatabase = async (): Promise<DatabaseSchema | null> => {
    // PRIORIDADE 1: Firestore (se autenticado e online)
    if (useFirestore && auth.currentUser && isOnline) {
      try {
        console.log('🔥 Carregando do Firestore...');
        const [ledgerData, workOrdersData, clientsData, partsData, servicesData] = await Promise.all([
          getAllFromFirestore<LedgerEntry>(COLLECTIONS.financeiro),
          getAllFromFirestore<WorkOrder>(COLLECTIONS.processos),
          getAllFromFirestore<Client>(COLLECTIONS.clientes),
          getAllFromFirestore<CatalogItem>(COLLECTIONS.oficina),
          getAllFromFirestore<CatalogItem>(COLLECTIONS.oficina)
        ]);

        // Separa peças e serviços (se vierem juntos)
        const parts = partsData.filter((item: any) => !item.isService);
        const services = servicesData.filter((item: any) => item.isService);

        const firestoreData = {
          ledger: ledgerData,
          workOrders: workOrdersData,
          clients: clientsData,
          catalogParts: parts,
          catalogServices: services,
          settings
        };

        // Salva no cache local para uso offline
        localStorage.setItem('oficina_database', JSON.stringify(firestoreData));
        console.log('✅ Dados carregados do Firestore e cacheados');
        
        return firestoreData;
      } catch (e: any) {
        console.warn("⚠️ Erro ao carregar do Firestore:", e.message);
        console.log('🔄 Tentando cache local...');
        // Fallback para cache local
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
      } catch (e: any) {
        console.warn("⚠️ Erro ao carregar do Tauri:", e.message);
      }
    }

    // PRIORIDADE 3: LocalStorage (web - cache)
    try {
      const data = localStorage.getItem('oficina_database');
      if (data) {
        console.log('💾 Carregado do cache local');
        return JSON.parse(data);
      }
    } catch (e: any) {
      console.error("❌ Erro ao carregar cache:", e.message);
    }

    console.log('🆕 Nenhum dado encontrado');
    return null;
  };

  // Função para salvar dados (OTIMIZADA COM BATCH)
  const saveDatabase = async (data: DatabaseSchema): Promise<void> => {
    // SEMPRE salva no LocalStorage como backup
    try {
      localStorage.setItem('oficina_database', JSON.stringify(data));
    } catch (e: any) {
      console.error("❌ Erro ao salvar cache:", e.message);
    }

    // Se estiver usando Firestore, salva lá também (BATCH)
    if (useFirestore && auth.currentUser && isOnline && !isSyncingFromFirestore.current) {
      try {
        console.log('🔄 Sincronizando com Firestore...');
        
        // Usa função batch otimizada
        await Promise.all([
          saveToFirestore(COLLECTIONS.financeiro, data.ledger),
          saveToFirestore(COLLECTIONS.processos, data.workOrders),
          saveToFirestore(COLLECTIONS.clientes, data.clients),
          saveToFirestore(COLLECTIONS.oficina, [...data.catalogParts, ...data.catalogServices])
        ]);
        
        console.log('✅ Sincronizado com Firestore');
      } catch (e: any) {
        console.error("❌ Erro ao sincronizar:", e.message);
      }
    }

    // Se estiver em Tauri, salva também no arquivo
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('save_database_atomic', { filepath: dbPath, content: JSON.stringify(data) });
        console.log('✅ Salvo no Tauri');
      } catch (e: any) {
        console.error("❌ Erro ao salvar no Tauri:", e.message);
      }
    }
  };

  // Load Inicial
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      isInitialLoad.current = true;
      
      const mode = useFirestore ? 'Firestore' : isTauri ? 'Tauri' : 'Cache Local';
      console.log(`🔄 Carregando banco (${mode})...`);
      
      const parsed = await loadDatabase();
      
      if (parsed) {
        setLedger(parsed.ledger || []);
        setWorkOrders(parsed.workOrders || []);
        setClients(parsed.clients || []);
        setCatalogParts(parsed.catalogParts || []);
        setCatalogServices(parsed.catalogServices || []);
        setSettings(parsed.settings || settings);
        
        const total = (parsed.ledger?.length || 0) + (parsed.workOrders?.length || 0) + (parsed.clients?.length || 0);
        console.log(`✅ Carregados ${total} registros`);
      } else {
        console.log('🆕 Banco vazio - modo inicial');
      }
      
      setIsLoading(false);
      
      // Aguarda antes de permitir saves automáticos
      setTimeout(() => {
        isInitialLoad.current = false;
        console.log('✅ Auto-save habilitado');
      }, 1000);
    }
    load();
  }, [useFirestore]);

  // Sincronização em tempo real com Firestore
  useEffect(() => {
    if (!useFirestore || !auth.currentUser || !isOnline) {
      // Limpa listeners anteriores
      unsubscribeFunctions.current.forEach(unsubscribe => unsubscribe());
      unsubscribeFunctions.current = [];
      return;
    }

    console.log('🔄 Ativando listeners em tempo real...');

    // Listeners para cada coleção
    const unsubscribeLedger = subscribeToCollection<LedgerEntry>(
      COLLECTIONS.financeiro,
      (data) => {
        isSyncingFromFirestore.current = true;
        setLedger(data);
        setTimeout(() => { isSyncingFromFirestore.current = false; }, 100);
      }
    );

    const unsubscribeWorkOrders = subscribeToCollection<WorkOrder>(
      COLLECTIONS.processos,
      (data) => {
        isSyncingFromFirestore.current = true;
        setWorkOrders(data);
        setTimeout(() => { isSyncingFromFirestore.current = false; }, 100);
      }
    );

    const unsubscribeClients = subscribeToCollection<Client>(
      COLLECTIONS.clientes,
      (data) => {
        isSyncingFromFirestore.current = true;
        setClients(data);
        setTimeout(() => { isSyncingFromFirestore.current = false; }, 100);
      }
    );

    const unsubscribeOfficina = subscribeToCollection<CatalogItem>(
      COLLECTIONS.oficina,
      (data) => {
        isSyncingFromFirestore.current = true;
        const parts = data.filter((item: any) => !item.isService);
        const services = data.filter((item: any) => item.isService);
        setCatalogParts(parts);
        setCatalogServices(services);
        setTimeout(() => { isSyncingFromFirestore.current = false; }, 100);
      }
    );

    unsubscribeFunctions.current = [
      unsubscribeLedger,
      unsubscribeWorkOrders,
      unsubscribeClients,
      unsubscribeOfficina
    ];

    return () => {
      unsubscribeFunctions.current.forEach(unsubscribe => unsubscribe());
      unsubscribeFunctions.current = [];
    };
  }, [useFirestore, isOnline]);

  // Auto-Save OTIMIZADO com debounce de 2 segundos
  useEffect(() => {
    // Não salva durante o load inicial ou sincronização
    if (isInitialLoad.current || isLoading || isSyncingFromFirestore.current) return;
    
    // Não salva se não houver dados
    const hasData = workOrders.length > 0 || clients.length > 0 || ledger.length > 0;
    if (!hasData) return;

    // Limpa timeout anterior
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // DEBOUNCE: 2 segundos
    saveTimeoutRef.current = setTimeout(async () => {
      setIsSaving(true);
      const fullDb: DatabaseSchema = { 
        ledger, 
        workOrders, 
        clients, 
        catalogParts, 
        catalogServices, 
        settings 
      };
      await saveDatabase(fullDb);
      setIsSaving(false);
    }, 2000);

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
