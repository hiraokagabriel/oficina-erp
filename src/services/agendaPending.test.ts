import { describe, expect, it } from 'vitest';
import { Appointment } from '../types';
import { countPastPending, listPastPending } from './agendaPending';

const ap = (id: string, day: string, extra: Partial<Appointment> = {}): Appointment => ({
  id,
  date: `${day}T12:00:00`,
  clientName: `Cliente ${id}`,
  vehicle: 'Gol - ABC1D23',
  status: 'AGENDADO',
  createdAt: '2026-01-01T10:00:00.000Z',
  ...extra,
});

describe('agendaPending', () => {
  const today = '2026-10-21';

  it('conta só AGENDADO sem OS de dias anteriores', () => {
    const list = [
      ap('a', '2026-10-19'),
      ap('b', '2026-10-20', { status: 'COMPARECEU' }),
      ap('c', '2026-10-20', { status: 'FALTOU' }),
      ap('d', '2026-10-20', { status: 'CANCELADO' }),
      ap('e', '2026-10-20', { workOrderId: 'os1' }),
      ap('f', '2026-10-20'),
    ];
    expect(listPastPending(list, today).map(a => a.id)).toEqual(['a', 'f']);
    expect(countPastPending(list, today)).toBe(2);
  });

  it('hoje e futuros não contam', () => {
    expect(countPastPending([ap('a', today), ap('b', '2026-10-22')], today)).toBe(0);
  });

  it('respeita a janela de 30 dias (inclusive)', () => {
    const list = [ap('limite', '2026-09-21'), ap('fora', '2026-09-20')];
    expect(listPastPending(list, today).map(a => a.id)).toEqual(['limite']);
  });

  it('ordena do mais antigo para o mais novo e por hora', () => {
    const list = [ap('x', '2026-10-20', { time: '14:00' }), ap('y', '2026-10-20', { time: '09:00' }), ap('z', '2026-10-18')];
    expect(listPastPending(list, today).map(a => a.id)).toEqual(['z', 'y', 'x']);
  });

  it('ignora data inválida', () => {
    expect(countPastPending([ap('a', 'xx')], today)).toBe(0);
  });
});
