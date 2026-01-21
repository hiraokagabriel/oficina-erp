import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { LedgerEntry, WorkOrder, Client, CatalogItem, WorkshopSettings, DatabaseSchema } from '../types';

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
    googleApiKey: "" // 🆕 ADICIONADO
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // NOVO: Referência para evitar saves desnecessários durante o load
  const isInitialLoad = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load Inicial
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      isInitialLoad.current = true;
      
      try {
        const data = await invoke<string>('load_database', { filepath: dbPath });
        if (data && data.trim()) {
          const parsed = JSON.parse(data);
          setLedger(parsed.ledger || []);
          setWorkOrders(parsed.workOrders || []);
          setClients(parsed.clients || []);
          setCatalogParts(parsed.catalogParts || []);
          setCatalogServices(parsed.catalogServices || []);
          setSettings(parsed.settings || settings);
        }
      } catch (e) {
        console.error("Erro ao carregar banco:", e);
      } finally {
        setIsLoading(false);
        // Aguarda um pouco antes de permitir saves automáticos
        setTimeout(() => {
          isInitialLoad.current = false;
        }, 500);
      }
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

    // NOVO DEBOUNCE: 3 segundos (ao invés de 1.5s)
    saveTimeoutRef.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        const fullDb: DatabaseSchema = { ledger, workOrders, clients, catalogParts, catalogServices, settings };
        await invoke('save_database_atomic', { filepath: dbPath, content: JSON.stringify(fullDb) });
      } catch (e) {
        console.error("Erro ao salvar:", e);
      } finally {
        setIsSaving(false);
      }
    }, 3000); // Aumentado de 1500ms para 3000ms

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