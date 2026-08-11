import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { LedgerEntry, WorkOrder, Client, CatalogItem, Technician, WorkshopSettings, DatabaseSchema } from '../types';

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
  catalogTechnicians: Technician[];
  setCatalogTechnicians: React.Dispatch<React.SetStateAction<Technician[]>>;
  settings: WorkshopSettings;
  setSettings: React.Dispatch<React.SetStateAction<WorkshopSettings>>;
  isLoading: boolean;
  isSaving: boolean;
  dbPath: string;
  setDbPath: React.Dispatch<React.SetStateAction<string>>;
}

const DatabaseContext = createContext<DatabaseContextData>({} as DatabaseContextData);

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dbPath, setDbPath] = useState(() => localStorage.getItem("oficina_db_path") || "C:\\OficinaData\\database.json");
  
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [catalogParts, setCatalogParts] = useState<CatalogItem[]>([]);
  const [catalogServices, setCatalogServices] = useState<CatalogItem[]>([]);
  const [catalogTechnicians, setCatalogTechnicians] = useState<Technician[]>([]);
  const [settings, setSettings] = useState<WorkshopSettings>({ 
    name: "OFICINA", 
    cnpj: "", 
    address: "", 
    exportPath: "", 
    googleDriveToken: "",
    googleApiKey: ""
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const isInitialLoad = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("oficina_db_path", dbPath);
    } catch (e) {
      console.error("Erro ao salvar dbPath no localStorage:", e);
    }
  }, [dbPath]);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      isInitialLoad.current = true;
      
      try {
        const data = await invoke<string>('load_database', { filepath: dbPath });
        if (data && data.trim()) {
          const parsed: DatabaseSchema = JSON.parse(data);
          setLedger(parsed.ledger || []);
          setWorkOrders(parsed.workOrders || []);
          setClients(parsed.clients || []);
          setCatalogParts(parsed.catalogParts || []);
          setCatalogServices(parsed.catalogServices || []);
          setCatalogTechnicians(parsed.catalogTechnicians || []);
          setSettings(parsed.settings || settings);
        }
      } catch (e) {
        console.error("Erro ao carregar banco:", e);
      } finally {
        setIsLoading(false);
        setTimeout(() => {
          isInitialLoad.current = false;
        }, 500);
      }
    }
    load();
  }, [dbPath]);

  useEffect(() => {
    if (isInitialLoad.current || isLoading) return;
    if (workOrders.length === 0 && clients.length === 0 && ledger.length === 0) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        const fullDb: DatabaseSchema = { 
          ledger, 
          workOrders, 
          clients, 
          catalogParts, 
          catalogServices, 
          catalogTechnicians, 
          settings 
        };
        await invoke('save_database_atomic', { filepath: dbPath, content: JSON.stringify(fullDb) });
      } catch (e) {
        console.error("Erro ao salvar:", e);
      } finally {
        setIsSaving(false);
      }
    }, 3000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [ledger, workOrders, clients, catalogParts, catalogServices, catalogTechnicians, settings, dbPath, isLoading]);

  return (
    <DatabaseContext.Provider value={{
      ledger, setLedger,
      workOrders, setWorkOrders,
      clients, setClients,
      catalogParts, setCatalogParts,
      catalogServices, setCatalogServices,
      catalogTechnicians, setCatalogTechnicians,
      settings, setSettings,
      isLoading, isSaving,
      dbPath, setDbPath,
    }}>
      {children}
    </DatabaseContext.Provider>
  );
};

export const useDatabase = () => useContext(DatabaseContext);
