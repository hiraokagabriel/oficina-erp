import { describe, expect, it } from 'vitest';
import { authorizedLine, deviceLine, idleToast, otherDevices, parseDeviceRows } from './cloudDevices';

const rows = parseDeviceRows([
  { id: '1', name: 'PC recepção', kind: 'pc_compartilhado', idle_lock_minutes: 15, authorized_at: '2026-11-10T12:00:00', revoked_at: null },
  { id: '2', name: 'PC antigo', kind: 'pc_compartilhado', idle_lock_minutes: null, authorized_at: '2026-11-01T12:00:00', revoked_at: '2026-11-10T12:00:00' },
  { id: '3', name: 'PC oficina', kind: 'pc_compartilhado', idle_lock_minutes: 5, authorized_at: '2026-11-11T12:00:00', revoked_at: null },
  { nome: 'lixo' },
]);

describe('cloudDevices', () => {
  it('lista os outros: ativos novos primeiro, revogado no fim, sem este', () => {
    expect(otherDevices(rows, '1').map(d => d.id)).toEqual(['3', '2']);
  });
  it('textos', () => {
    expect(deviceLine(rows[0])).toBe('Compartilhado · bloqueio 15 min');
    expect(deviceLine(rows[1])).toBe('Compartilhado · revogado em 10/11/2026');
    expect(idleToast(30)).toBe('Bloqueio mudado para 30 minutos.');
    expect(idleToast(null)).toBe('Bloqueio desligado.');
    expect(authorizedLine(rows[0], 'João')).toBe('PC recepção · Compartilhado · autorizado por João em 10/11/2026');
  });
});
