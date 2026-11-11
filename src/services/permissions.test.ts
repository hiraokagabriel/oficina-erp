import { describe, it, expect } from 'vitest';
import { ACTIONS, accessFor, can, ROLES } from './permissions';
import type { Action, Role } from './permissions';

// Matriz fechada papel x ação. Espelha a RLS e as guardas de supabase/migrations/20261111120000_nuvem_inicial.sql.
const DONO_ONLY: Action[] = [
  'os.seeCosts', 'finance.margin', 'ledger.delete', 'catalog.seeCosts', 'catalog.delete', 'technicians.delete',
  'settings.edit', 'users.manage', 'audit.view', 'data.export',
];
const MECANICO: Action[] = [
  'os.view', 'os.status', 'os.inspect', 'os.photos', 'os.mileage',
  'clients.view', 'clients.create',
  'appointments.view', 'appointments.create', 'appointments.edit',
  'catalog.view', 'technicians.view', 'settings.view',
];
const RECEPCAO: Action[] = [
  ...MECANICO,
  'os.create', 'os.editFields', 'os.editItems', 'os.editClientVehicle', 'os.seePrices',
  'os.receive', 'os.installment', 'os.finalize', 'os.reopen', 'os.delete',
  'finance.view', 'ledger.create', 'ledger.edit', 'ledger.togglePayment',
  'clients.edit', 'clients.delete', 'appointments.delete',
  'catalog.seePrices', 'catalog.create', 'catalog.edit', 'technicians.create', 'technicians.edit',
];

const expected = (role: Role): Set<Action> =>
  role === 'dono' ? new Set(ACTIONS) : role === 'recepcao' ? new Set(RECEPCAO) : new Set(MECANICO);

describe('permissions', () => {
  it('matriz completa papel x ação', () => {
    for (const role of ROLES) {
      const ok = expected(role);
      for (const a of ACTIONS) expect(can(role, a), `${role} ${a}`).toBe(ok.has(a));
    }
  });

  it('dono tem tudo; o que é só do dono não vaza', () => {
    for (const a of ACTIONS) expect(can('dono', a)).toBe(true);
    for (const a of DONO_ONLY) { expect(can('recepcao', a)).toBe(false); expect(can('mecanico', a)).toBe(false); }
  });

  it('mecânico não cria OS nem edita itens, cliente ou veículo; vê agenda completa', () => {
    expect(can('mecanico', 'os.create')).toBe(false);
    expect(can('mecanico', 'os.editItems')).toBe(false);
    expect(can('mecanico', 'os.editClientVehicle')).toBe(false);
    expect(can('mecanico', 'clients.edit')).toBe(false);
    expect(can('mecanico', 'clients.create')).toBe(true);
    expect(can('mecanico', 'appointments.delete')).toBe(false);
  });

  it('accessFor', () => {
    expect(accessFor('dono')).toEqual({ canSeePrices: true, canSeeCosts: true, canEditItems: true });
    expect(accessFor('recepcao')).toEqual({ canSeePrices: true, canSeeCosts: false, canEditItems: true });
    expect(accessFor('mecanico')).toEqual({ canSeePrices: false, canSeeCosts: false, canEditItems: false });
  });
});
