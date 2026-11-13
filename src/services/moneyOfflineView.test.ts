import { describe, expect, it } from 'vitest';
import type { OSStatus, WorkOrder } from '../types';
import { finalizeColumnHint, itemsLockedOffline, statusMoveNeedsInternet } from './moneyOfflineView';

const os = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'o', osNumber: 1, vehicle: 'v', clientName: 'c', clientPhone: '', mileage: 0, status: 'EM_SERVICO',
  createdAt: '2026-11-01T15:00:00.000Z', parts: [], services: [], total: 0, ...over,
});

describe('moneyOfflineView', () => {
  it('statusMoveNeedsInternet: só o que mexe no caixa', () => {
    const t = (a: OSStatus, b: OSStatus) => statusMoveNeedsInternet(a, b);
    expect(t('EM_SERVICO', 'FINALIZADO')).toBe(true);
    expect(t('AGUARDANDO_PAGAMENTO', 'FINALIZADO')).toBe(true);
    expect(t('FINALIZADO', 'AGUARDANDO_PAGAMENTO')).toBe(true);
    expect(t('AGUARDANDO_PAGAMENTO', 'EM_SERVICO')).toBe(true);
    expect(t('ARQUIVADO', 'ORCAMENTO')).toBe(true);
    expect(t('FINALIZADO', 'ARQUIVADO')).toBe(false);
    expect(t('ORCAMENTO', 'APROVADO')).toBe(false);
    expect(t('EM_SERVICO', 'AGUARDANDO_PAGAMENTO')).toBe(false);
    expect(t('EM_SERVICO', 'EM_SERVICO')).toBe(false);
  });

  it('finalizeColumnHint: parado nada; sem permissão vence; offline só para quem pode', () => {
    expect(finalizeColumnHint({ dragging: false, canFinalize: true, online: false })).toBeNull();
    expect(finalizeColumnHint({ dragging: true, canFinalize: false, online: false })).toBe('denied');
    expect(finalizeColumnHint({ dragging: true, canFinalize: true, online: false })).toBe('offline');
    expect(finalizeColumnHint({ dragging: true, canFinalize: true, online: true })).toBeNull();
  });

  it('itemsLockedOffline: OS finalizada ou com receita sem internet; OS aberta e nova não', () => {
    expect(itemsLockedOffline(false, os({ status: 'FINALIZADO' }))).toBe(true);
    expect(itemsLockedOffline(false, os({ financialId: 'e1', status: 'AGUARDANDO_PAGAMENTO' }))).toBe(true);
    expect(itemsLockedOffline(false, os())).toBe(false);
    expect(itemsLockedOffline(false, null)).toBe(false);
    expect(itemsLockedOffline(true, os({ status: 'FINALIZADO' }))).toBe(false);
  });
});
