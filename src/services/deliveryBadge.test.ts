import { describe, it, expect } from 'vitest';
import { compareByExpectedDate, getDeliveryBadge } from './deliveryBadge';
import { WorkOrder } from '../types';

const iso = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toISOString();
};
const os = (status: WorkOrder['status'], day?: string) => ({ status, expectedDate: day ? iso(day) : undefined });

describe('getDeliveryBadge', () => {
  const today = '2026-10-16';
  it('atrasada: singular e plural', () => {
    expect(getDeliveryBadge(os('EM_SERVICO', '2026-10-15'), today)?.label).toBe('Atrasada há 1 dia');
    expect(getDeliveryBadge(os('APROVADO', '2026-10-13'), today)).toMatchObject({ kind: 'atrasada', label: 'Atrasada há 3 dias' });
  });
  it('hoje e demais datas', () => {
    expect(getDeliveryBadge(os('EM_SERVICO', today), today)).toMatchObject({ kind: 'hoje', label: 'Entrega hoje' });
    expect(getDeliveryBadge(os('APROVADO', '2026-11-03'), today)).toMatchObject({ kind: 'prazo', label: 'Entrega 03/11' });
  });
  it('nada para status que não conta ou sem previsão', () => {
    expect(getDeliveryBadge(os('ORCAMENTO', '2026-10-01'), today)).toBeNull();
    expect(getDeliveryBadge(os('AGUARDANDO_PAGAMENTO', '2026-10-01'), today)).toBeNull();
    expect(getDeliveryBadge(os('FINALIZADO', '2026-10-01'), today)).toBeNull();
    expect(getDeliveryBadge(os('EM_SERVICO'), today)).toBeNull();
  });
});

describe('compareByExpectedDate', () => {
  const list = [os('APROVADO'), os('APROVADO', '2026-10-20'), os('APROVADO', '2026-10-10')];
  const days = (dir: 'asc' | 'desc') =>
    [...list].sort((a, b) => compareByExpectedDate(a, b, dir)).map(o => (o.expectedDate ? 'x' : '-'));
  it('sem previsão por último nas duas direções', () => {
    expect(days('asc')[2]).toBe('-');
    expect(days('desc')[2]).toBe('-');
  });
  it('ordena pela data', () => {
    const asc = [...list].sort((a, b) => compareByExpectedDate(a, b, 'asc'));
    expect(asc[0].expectedDate).toBe(iso('2026-10-10'));
    const desc = [...list].sort((a, b) => compareByExpectedDate(a, b, 'desc'));
    expect(desc[0].expectedDate).toBe(iso('2026-10-20'));
  });
});
