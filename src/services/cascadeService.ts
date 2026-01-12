import { Client, WorkOrder, LedgerEntry, CatalogItem } from '../types';

// Atualiza OSs e Financeiro quando Cliente muda
export const updateClientCascading = (
    oldClient: Client | undefined,
    updatedClient: Client,
    workOrders: WorkOrder[],
    ledger: LedgerEntry[]
) => {
    let newWorkOrders = [...workOrders];
    let newLedger = [...ledger];
    let hasChanges = false;

    if (oldClient) {
        const nameChanged = oldClient.name !== updatedClient.name;
        const phoneChanged = oldClient.phone !== updatedClient.phone;
        
        const vehicleMap: Record<string, string> = {};
        if (oldClient.vehicles && updatedClient.vehicles) {
             oldClient.vehicles.forEach((oldV, index) => {
                 const newV = updatedClient.vehicles[index];
                 if (newV) {
                     const oldString = `${oldV.model} - ${oldV.plate}`;
                     const newString = `${newV.model} - ${newV.plate}`;
                     if (oldString !== newString) {
                         vehicleMap[oldString] = newString;
                     }
                 }
             });
        }

        if (nameChanged || phoneChanged || Object.keys(vehicleMap).length > 0) {
            hasChanges = true;
            newWorkOrders = newWorkOrders.map(os => {
                if (os.clientName === oldClient.name) {
                    return {
                        ...os,
                        clientName: nameChanged ? updatedClient.name : os.clientName,
                        clientPhone: phoneChanged ? updatedClient.phone : os.clientPhone,
                        vehicle: vehicleMap[os.vehicle] || os.vehicle
                    };
                }
                return os;
            });
            
            if (nameChanged) {
                 newLedger = newLedger.map(entry => {
                     if (entry.description.includes(oldClient.name)) {
                         return { 
                             ...entry, 
                             description: entry.description.replace(oldClient.name, updatedClient.name) 
                         };
                     }
                     return entry;
                 });
            }
        }
    }

    return { newWorkOrders, newLedger, hasChanges };
};

// Atualiza OSs quando Item do Catálogo muda
export const updateCatalogItemCascading = (
    oldItem: CatalogItem | undefined,
    updatedItem: CatalogItem,
    workOrders: WorkOrder[]
) => {
    let newWorkOrders = [...workOrders];
    let hasChanges = false;

    if (oldItem && oldItem.description !== updatedItem.description) {
        newWorkOrders = newWorkOrders.map(os => {
            let changed = false;
            const newParts = os.parts.map(p => {
                if (p.description === oldItem!.description) { 
                    changed = true; 
                    return { ...p, description: updatedItem.description }; 
                }
                return p;
            });
            const newServices = os.services.map(s => {
                if (s.description === oldItem!.description) { 
                    changed = true; 
                    return { ...s, description: updatedItem.description }; 
                }
                return s;
            });
            
            if (changed) {
                hasChanges = true;
                return { ...os, parts: newParts, services: newServices };
            }
            return os;
        });
    }

    return { newWorkOrders, hasChanges };
};