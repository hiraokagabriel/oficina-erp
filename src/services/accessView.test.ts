import { describe, expect, it } from 'vitest';
import { ACTIONS, can, ROLES } from './permissions';
import { allActionsAllowed, buildAccess, canMoveToStatus, canSeeTab, safeTab } from './accessView';

describe('buildAccess', () => {
  it('sem papel (modo arquivo) libera tudo', () => {
    const a = buildAccess(undefined);
    expect(a.restricted).toBe(false);
    expect(allActionsAllowed(a)).toBe(true);
    expect(a.os).toEqual({ canSeePrices: true, canSeeCosts: true, canEditItems: true });
  });

  it.each(ROLES)('com papel %s repete permissions.ts', (role) => {
    const a = buildAccess(role);
    expect(a.restricted).toBe(true);
    for (const act of ACTIONS) expect(a.can(act)).toBe(can(role, act));
  });

  it('mecânico não vê preço nem custo; recepção vê preço sem custo', () => {
    expect(buildAccess('mecanico').os.canSeePrices).toBe(false);
    expect(buildAccess('recepcao').os).toEqual({ canSeePrices: true, canSeeCosts: false, canEditItems: true });
    expect(buildAccess('dono').os.canSeeCosts).toBe(true);
  });
});

describe('abas', () => {
  it('Financeiro some para mecânico; Config só do dono', () => {
    expect(canSeeTab(buildAccess('mecanico'), 'FINANCEIRO')).toBe(false);
    expect(canSeeTab(buildAccess('recepcao'), 'FINANCEIRO')).toBe(true);
    expect(canSeeTab(buildAccess('recepcao'), 'CONFIG')).toBe(false);
    expect(canSeeTab(buildAccess('dono'), 'CONFIG')).toBe(true);
    expect(canSeeTab(buildAccess(undefined), 'CONFIG')).toBe(true);
  });
  it('aba guardada proibida abre Oficina', () => {
    expect(safeTab(buildAccess('mecanico'), 'FINANCEIRO')).toBe('OFICINA');
    expect(safeTab(buildAccess('mecanico'), 'AGENDA')).toBe('AGENDA');
  });
});

describe('canMoveToStatus', () => {
  it('mecânico não entra nem sai de Finalizado', () => {
    const m = buildAccess('mecanico');
    expect(canMoveToStatus(m, 'FINALIZADO', 'AGUARDANDO_PAGAMENTO')).toBe(false);
    expect(canMoveToStatus(m, 'EM_SERVICO', 'FINALIZADO')).toBe(false);
    expect(canMoveToStatus(m, 'EM_SERVICO', 'APROVADO')).toBe(true);
  });
  it('recepção e modo arquivo movem tudo', () => {
    expect(canMoveToStatus(buildAccess('recepcao'), 'FINALIZADO', 'EM_SERVICO')).toBe(true);
    expect(canMoveToStatus(buildAccess(undefined), 'EM_SERVICO', 'FINALIZADO')).toBe(true);
  });
});
