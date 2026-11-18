import { describe, expect, it } from 'vitest';
import type { DailyExportResult } from '../sync/dailyExport';
import { exportOutcome, lastExportText } from './exportView';

const now = new Date(2026, 10, 17, 15, 0, 0);

describe('lastExportText', () => {
  it('sem cópia ou data ruim', () => {
    expect(lastExportText(null, now)).toBe('Última cópia: ainda não foi feita nenhuma.');
    expect(lastExportText('lixo', now)).toBe('Última cópia: ainda não foi feita nenhuma.');
  });
  it('hoje, ontem e dia antigo (dia local)', () => {
    expect(lastExportText(new Date(2026, 10, 17, 8, 12).toISOString(), now)).toMatch(/^Última cópia: hoje às 08:12$/);
    expect(lastExportText(new Date(2026, 10, 16, 23, 5).toISOString(), now)).toMatch(/^Última cópia: ontem às 23:05$/);
    expect(lastExportText(new Date(2026, 10, 10, 9, 0).toISOString(), now)).toMatch(/^Última cópia: 10\/11\/2026 às 09:00$/);
  });
});

const ok = (o: Partial<Extract<DailyExportResult, { status: 'ok' }>> = {}): DailyExportResult => (
  { status: 'ok', path: 'C:\\x.json', at: '2026-11-17T12:00:00.000Z', drive: 'nao_configurado', skippedOrders: [], ...o }
);

describe('exportOutcome', () => {
  it('erro sempre fala', () => {
    expect(exportOutcome({ status: 'erro', message: 'falhou' }, true)).toEqual({ message: 'falhou', type: 'error' });
  });
  it('sucesso: o botão fala, o automático cala', () => {
    expect(exportOutcome(ok(), true)).toBeNull();
    expect(exportOutcome(ok(), false)?.type).toBe('success');
    expect(exportOutcome(ok({ drive: 'enviado' }), false)?.message).toMatch(/Google Drive/);
  });
  it('problemas parciais falam mesmo em silêncio', () => {
    expect(exportOutcome(ok({ drive: 'falhou' }), true)?.type).toBe('error');
    expect(exportOutcome(ok({ skippedOrders: ['a', 'b'] }), true)?.message).toMatch(/2 ordem/);
    expect(exportOutcome(ok({ markError: 'x' }), true)?.type).toBe('info');
  });
});
