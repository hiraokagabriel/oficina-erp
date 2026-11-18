import { describe, expect, it } from 'vitest';
import { parseWorkshopRow, pickActiveMembership, toImportState } from './membership';

const row = (o: Partial<{ workshop_id: string; role: string; active: boolean; invited_at: string }>) =>
  ({ workshop_id: 'w1', role: 'recepcao', display_name: 'Ana', active: true, invited_at: '2026-01-02', ...o });

describe('pickActiveMembership', () => {
  it('ignora inativas e papéis desconhecidos; pega a mais antiga', () => {
    expect(pickActiveMembership([])).toBeNull();
    expect(pickActiveMembership([row({ active: false })])).toBeNull();
    expect(pickActiveMembership([row({ role: 'chefe' })])).toBeNull();
    const r = pickActiveMembership([row({ workshop_id: 'novo', invited_at: '2026-03-01' }), row({ workshop_id: 'velho', invited_at: '2026-01-01' })]);
    expect(r?.workshop_id).toBe('velho');
  });
});

describe('parseWorkshopRow / toImportState', () => {
  it('lê nome, estado da importação e última cópia', () => {
    expect(parseWorkshopRow({ name: 'Auto X', import_state: 'importando', last_export_at: '2026-11-17T10:00:00Z' }))
      .toEqual({ name: 'Auto X', importState: 'importando', lastExportAt: '2026-11-17T10:00:00Z' });
    expect(parseWorkshopRow({ name: 'A', import_state: 'vazio', last_export_at: null }).importState).toBe('vazio');
  });
  it('falha de leitura ou valor estranho nunca tranca o app: vira concluido', () => {
    expect(parseWorkshopRow(null)).toEqual({ name: 'Oficina', importState: 'concluido', lastExportAt: null });
    expect(parseWorkshopRow({ name: '', import_state: 'x', last_export_at: '' })).toEqual({ name: 'Oficina', importState: 'concluido', lastExportAt: null });
    expect(toImportState(undefined)).toBe('concluido');
    expect(toImportState('concluido')).toBe('concluido');
  });
});
