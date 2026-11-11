import type { CloudRole } from '../sync/types';

// Permissões por papel (docs/NUVEM.md Q2/Q16 e Q3/Q17; docs/NUVEM-SPEC.md seção 2 e decisão 3 da seção 8).
// Puro. Espelha as policies de RLS e as guardas (`guard_work_orders`, `guard_finance`, `guard_ledger`,
// `guard_softdelete`) de supabase/migrations/20261111120000_nuvem_inicial.sql: mudou lá, mude aqui e no teste.
// Ações de dinheiro (`os.receive` etc.) valem só ONLINE, pela função `money`; aqui só dizem se o papel pode pedir.

export type Role = CloudRole;

export const ROLES: readonly Role[] = ['dono', 'recepcao', 'mecanico'];

/** Lista fechada de ações. Acrescentar ação nova exige acrescentar a linha em `ALLOWED` (o compilador cobra). */
export const ACTIONS = [
  // Ordem de serviço
  'os.view', 'os.create', 'os.editFields', 'os.editItems', 'os.editClientVehicle',
  'os.seePrices', 'os.seeCosts',
  'os.status', 'os.inspect', 'os.photos', 'os.mileage',
  'os.receive', 'os.installment', 'os.finalize', 'os.reopen', 'os.delete',
  // Financeiro
  'finance.view', 'finance.margin',
  'ledger.create', 'ledger.edit', 'ledger.togglePayment', 'ledger.delete',
  // Clientes
  'clients.view', 'clients.create', 'clients.edit', 'clients.delete',
  // Agenda
  'appointments.view', 'appointments.create', 'appointments.edit', 'appointments.delete',
  // Catálogo e técnicos
  'catalog.view', 'catalog.seePrices', 'catalog.seeCosts', 'catalog.create', 'catalog.edit', 'catalog.delete',
  'technicians.view', 'technicians.create', 'technicians.edit', 'technicians.delete',
  // Administração
  'settings.view', 'settings.edit', 'users.manage', 'audit.view', 'data.export',
] as const;

export type Action = typeof ACTIONS[number];

const DONO: readonly Role[] = ['dono'];
const GESTAO: readonly Role[] = ['dono', 'recepcao'];
const TODOS: readonly Role[] = ['dono', 'recepcao', 'mecanico'];

const ALLOWED: Record<Action, readonly Role[]> = {
  'os.view': TODOS,
  'os.create': GESTAO,                  // work_orders insert: dono, recepcao
  'os.editFields': GESTAO,              // Mecânico só muda status, checklist, photos, mileage (guard_work_orders)
  'os.editItems': GESTAO,
  'os.editClientVehicle': GESTAO,
  'os.seePrices': GESTAO,               // work_order_finance
  'os.seeCosts': DONO,                  // work_order_costs
  'os.status': TODOS,                   // sem dinheiro; FINALIZADO/reabrir passam por os.finalize/os.reopen
  'os.inspect': TODOS,
  'os.photos': TODOS,
  'os.mileage': TODOS,
  'os.receive': GESTAO,
  'os.installment': GESTAO,
  'os.finalize': GESTAO,
  'os.reopen': GESTAO,
  'os.delete': GESTAO,                  // money kind os.delete: Edge exige dono ou recepcao
  'finance.view': GESTAO,               // ledger select, "A receber"
  'finance.margin': DONO,
  'ledger.create': GESTAO,              // lançamento manual (os_id is null), só online
  'ledger.edit': GESTAO,
  'ledger.togglePayment': GESTAO,
  'ledger.delete': DONO,                // guard_ledger: só dono, só manual
  'clients.view': TODOS,
  'clients.create': TODOS,
  'clients.edit': GESTAO,               // editar dispara cascata em OS e caixa
  'clients.delete': GESTAO,
  'appointments.view': TODOS,
  'appointments.create': TODOS,
  'appointments.edit': TODOS,
  'appointments.delete': GESTAO,
  'catalog.view': TODOS,
  'catalog.seePrices': GESTAO,
  'catalog.seeCosts': DONO,
  'catalog.create': GESTAO,
  'catalog.edit': GESTAO,
  'catalog.delete': DONO,
  'technicians.view': TODOS,
  'technicians.create': GESTAO,
  'technicians.edit': GESTAO,
  'technicians.delete': DONO,
  'settings.view': TODOS,
  'settings.edit': DONO,
  'users.manage': DONO,
  'audit.view': DONO,
  'data.export': DONO,
};

export function can(role: Role, action: Action): boolean {
  return ALLOWED[action].includes(role);
}

export interface OSAccess {
  canSeePrices: boolean;
  canSeeCosts: boolean;
  canEditItems: boolean;
}

/** Visão da OS por papel (spec seção 4, "Visão por papel"). */
export function accessFor(role: Role): OSAccess {
  return {
    canSeePrices: can(role, 'os.seePrices'),
    canSeeCosts: can(role, 'os.seeCosts'),
    canEditItems: can(role, 'os.editItems'),
  };
}
