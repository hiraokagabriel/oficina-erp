import { Appointment, Client, WorkOrder, LedgerEntry, CatalogItem, OrderItem, Technician, Vehicle } from '../types';
import { normalizeName, resolveVehicleId } from '../utils/links';

// Cascata de renomeações por ID (plano 4.6, passo 4). Funções puras: não mutam as entradas.
// OS sem id (legadas) só são ligadas por nome quando o nome ANTIGO é único; homônimos sem id nunca são tocados.
// O texto gravado na OS (clientName, vehicle, descrição, technician) continua sendo mantido em dia aqui.

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Texto "modelo - PLACA" como o OSModal grava. */
const vehicleText = (v: Pick<Vehicle, 'model' | 'plate'>): string =>
    v.plate ? `${v.model} - ${v.plate.toUpperCase()}` : v.model;

/** Troca TODAS as ocorrências de `OS #<n> - <antigo>` (sem continuar numa palavra: "Mari" não casa "Mariana"). */
const replaceOsClientName = (description: string, osNumber: number, oldName: string, newName: string): string => {
    const re = new RegExp(`(OS #${osNumber} - )${escapeRegExp(oldName)}(?![\\p{L}\\p{N}])`, 'gu');
    return description.replace(re, (_m, prefix: string) => `${prefix}${newName}`);
};

// Atualiza OSs e Financeiro quando Cliente muda.
// `clients` = lista de clientes ANTES da edição (decide se o nome antigo é único para as OS legadas sem clientId).
// `appointments` (schema v3): clientName/clientPhone acompanham por clientId, ou por nome normalizado único quando sem id.
export const updateClientCascading = (
    oldClient: Client | undefined,
    updatedClient: Client,
    workOrders: WorkOrder[],
    ledger: LedgerEntry[],
    clients: Client[] = [],
    appointments: Appointment[] = []
) => {
    if (!oldClient) return { newWorkOrders: [...workOrders], newLedger: [...ledger], newAppointments: [...appointments], hasChanges: false };

    const nameChanged = oldClient.name !== updatedClient.name;
    const phoneChanged = oldClient.phone !== updatedClient.phone;
    const oldVehicles = oldClient.vehicles ?? [];
    const newVehicles = updatedClient.vehicles ?? [];
    const vehiclesChanged = JSON.stringify(oldVehicles) !== JSON.stringify(newVehicles);
    if (!nameChanged && !phoneChanged && !vehiclesChanged) {
        return { newWorkOrders: [...workOrders], newLedger: [...ledger], newAppointments: [...appointments], hasChanges: false };
    }

    const oldNorm = normalizeName(oldClient.name);
    const nameIsUnique = !clients.some(c => c.id !== oldClient.id && normalizeName(c.name) === oldNorm);

    let hasChanges = false;
    const affected: WorkOrder[] = [];

    const newWorkOrders = workOrders.map(os => {
        const linked = os.clientId === oldClient.id;
        const legacy = !os.clientId && !!oldNorm && nameIsUnique && normalizeName(os.clientName) === oldNorm;
        if (!linked && !legacy) return os;

        const next: WorkOrder = { ...os };
        if (legacy) next.clientId = oldClient.id;
        if (nameChanged) next.clientName = updatedClient.name;
        if (phoneChanged) next.clientPhone = updatedClient.phone;
        if (nameChanged && os.installmentConfig?.description) {
            // O parcelamento guarda "OS #N - <cliente>" no próprio config; acompanha a renomeação.
            const instDesc = replaceOsClientName(os.installmentConfig.description, os.osNumber, oldClient.name, updatedClient.name);
            if (instDesc !== os.installmentConfig.description) {
                next.installmentConfig = { ...os.installmentConfig, description: instDesc };
            }
        }

        if (vehiclesChanged) {
            const oldVehId = resolveVehicleId(os, oldClient);
            const oldV = oldVehId ? oldVehicles.find(v => v.id === oldVehId) : undefined;
            const newV = oldVehId ? newVehicles.find(v => v.id === oldVehId) : undefined;
            if (oldV && newV) {
                next.vehicleId = oldVehId;
                if (oldV.model !== newV.model || oldV.plate !== newV.plate) next.vehicle = vehicleText(newV);
            }
            // veículo removido ou não resolvido: texto da OS intacto
        }

        const changed = (Object.keys(next) as (keyof WorkOrder)[]).some(k => next[k] !== os[k]);
        if (!changed) return os;
        hasChanges = true;
        affected.push(os);
        return next;
    });

    let newLedger = [...ledger];
    if (nameChanged && affected.length > 0) {
        const byEntryId = new Map<string, WorkOrder>();
        const byGroup = new Map<string, WorkOrder>();
        affected.forEach(os => {
            if (os.financialId) byEntryId.set(os.financialId, os);
            if (os.advanceEntryId) byEntryId.set(os.advanceEntryId, os);
            os.advances?.forEach(a => byEntryId.set(a.entryId, os));
            if (os.installmentConfig?.groupId) byGroup.set(os.installmentConfig.groupId, os);
        });
        newLedger = ledger.map(entry => {
            const os = byEntryId.get(entry.id) ?? (entry.installmentGroupId ? byGroup.get(entry.installmentGroupId) : undefined);
            if (!os) return entry;
            const description = replaceOsClientName(entry.description, os.osNumber, oldClient.name, updatedClient.name);
            if (description === entry.description) return entry;
            hasChanges = true;
            return { ...entry, description };
        });
    }

    const newAppointments = appointments.map(ap => {
        const linked = ap.clientId === oldClient.id;
        const legacy = !ap.clientId && !!oldNorm && nameIsUnique && normalizeName(ap.clientName) === oldNorm;
        if (!linked && !legacy) return ap;
        const next: Appointment = { ...ap };
        if (legacy) next.clientId = oldClient.id;
        if (nameChanged) next.clientName = updatedClient.name;
        if (phoneChanged) next.clientPhone = updatedClient.phone;
        const changed = (Object.keys(next) as (keyof Appointment)[]).some(k => next[k] !== ap[k]);
        if (!changed) return ap;
        hasChanges = true;
        return next;
    });

    return { newWorkOrders, newLedger, newAppointments, hasChanges };
};

// Atualiza OSs quando Item do Catálogo muda. Só a descrição; o preço da OS nunca muda.
// `catalog` = catálogo do mesmo tipo ANTES da edição (para a descrição antiga ser única nas OS legadas sem catalogItemId).
export const updateCatalogItemCascading = (
    oldItem: CatalogItem | undefined,
    updatedItem: CatalogItem,
    workOrders: WorkOrder[],
    catalog: CatalogItem[] = [],
    kind?: 'part' | 'service'
) => {
    if (!oldItem || oldItem.description === updatedItem.description) {
        return { newWorkOrders: [...workOrders], hasChanges: false };
    }

    const oldNorm = normalizeName(oldItem.description);
    const descIsUnique = !!oldNorm && !catalog.some(c => c.id !== oldItem.id && normalizeName(c.description) === oldNorm);

    const rewrite = (items: OrderItem[], allowLegacy: boolean): OrderItem[] | undefined => {
        let touched = false;
        const out = items.map(it => {
            const linked = it.catalogItemId === oldItem.id;
            const legacy = allowLegacy && !it.catalogItemId && descIsUnique && normalizeName(it.description) === oldNorm;
            if (!linked && !legacy) return it;
            if (linked && it.description === updatedItem.description) return it;
            touched = true;
            return { ...it, catalogItemId: oldItem.id, description: updatedItem.description };
        });
        return touched ? out : undefined;
    };

    let hasChanges = false;
    const newWorkOrders = workOrders.map(os => {
        const parts = rewrite(os.parts, kind !== 'service');
        const services = rewrite(os.services, kind !== 'part');
        if (!parts && !services) return os;
        hasChanges = true;
        return { ...os, parts: parts ?? os.parts, services: services ?? os.services };
    });

    return { newWorkOrders, hasChanges };
};

// Atualiza OSs quando o nome de um Técnico muda. `technicians` = lista ANTES da edição.
export const updateTechnicianCascading = (
    oldTech: Technician | undefined,
    updatedTech: Technician,
    workOrders: WorkOrder[],
    technicians: Technician[] = []
) => {
    if (!oldTech || oldTech.name === updatedTech.name) {
        return { newWorkOrders: [...workOrders], hasChanges: false };
    }

    const oldNorm = normalizeName(oldTech.name);
    const nameIsUnique = !!oldNorm && !technicians.some(t => t.id !== oldTech.id && normalizeName(t.name) === oldNorm);

    let hasChanges = false;
    const newWorkOrders = workOrders.map(os => {
        const linked = os.technicianId === oldTech.id;
        const legacy = !os.technicianId && nameIsUnique && normalizeName(os.technician) === oldNorm;
        if (!linked && !legacy) return os;
        hasChanges = true;
        return { ...os, technician: updatedTech.name, technicianId: oldTech.id };
    });

    return { newWorkOrders, hasChanges };
};
