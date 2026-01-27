import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { LedgerEntry, WorkOrder, Client, CatalogItem, WorkshopSettings, DatabaseSchema } from '../types';

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
  
  const isInitialLoad = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Função para carregar dados (Tauri ou LocalStorage)
  const loadDatabase = async (): Promise<DatabaseSchema | null> => {
    if (isTauri) {
      // TAURI: Carrega do sistema de arquivos
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const data = await invoke<string>('load_database', { filepath: dbPath });
        if (data && data.trim()) {
          return JSON.parse(data);
        }
      } catch (e) {
        console.error("❌ Erro ao carregar banco (Tauri):", e);
      }
    } else {
      // WEB: Carrega do LocalStorage
      try {
        const data = localStorage.getItem('oficina_database');
        if (data) {
          return JSON.parse(data);
        }
      } catch (e) {
        console.error("❌ Erro ao carregar banco (LocalStorage):", e);
      }
    }
    return null;
  };

  // Função para salvar dados (Tauri ou LocalStorage)
  const saveDatabase = async (data: DatabaseSchema): Promise<void> => {
    if (isTauri) {
      // TAURI: Salva no sistema de arquivos
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('save_database_atomic', { filepath: dbPath, content: JSON.stringify(data) });
        console.log('✅ Banco salvo (Tauri)');
      } catch (e) {
        console.error("❌ Erro ao salvar banco (Tauri):", e);
      }
    } else {
      // WEB: Salva no LocalStorage
      try {
        localStorage.setItem('oficina_database', JSON.stringify(data));
        console.log('✅ Banco salvo (LocalStorage)');
      } catch (e) {
        console.error("❌ Erro ao salvar banco (LocalStorage):", e);
      }
    }
  };

  // Load Inicial
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      isInitialLoad.current = true;
      
      console.log(`🔄 Carregando banco... (${isTauri ? 'Tauri' : 'Web'})`);
      
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
  }, [dbPath]);

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
  }, [ledger, workOrders, clients, catalogParts, catalogServices, settings, dbPath, isLoading]);

  return (
    <DatabaseContext.Provider value={{
      ledger, setLedger,
      workOrders, setWorkOrders,
      clients, setClients,
      catalogParts, setCatalogParts,
      catalogServices, setCatalogServices,
      settings, setSettings,
      isLoading, isSaving
    }}>
      {children}
    </DatabaseContext.Provider>
  );
};

export const useDatabase = () => useContext(DatabaseContext);
