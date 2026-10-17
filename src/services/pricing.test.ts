import { describe, it, expect } from 'vitest';
import { median, suggestHistoricalPrice } from './pricing';
import { OrderItem, OSStatus, WorkOrder } from '../types';

const iso = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toISOString();
};
const item = (price: number, o: Partial<OrderItem> = {}): OrderItem => ({ id: `i${price}`, description: 'Troca de óleo', price, ...o });
const os = (day: string, parts: OrderItem[], services: OrderItem[] = [], status: OSStatus = 'FINALIZADO'): WorkOrder => ({
  id: `o${day}${parts.length}${services.length}`, osNumber: 1, vehicle: 'Gol - AAA1A11', clientName: 'Maria', clientPhone: '',
  mileage: 0, status, parts, services, total: 0, createdAt: iso(day),
});

const today = '2026-10-16';

describe('median', () => {
  it('vazio = null', () => expect(median([])).toBeNull());
  it('ímpar', () => expect(median([300, 100, 200])).toBe(200));
  it('par: média dos centrais arredondada em centavos', () => {
    expect(median([100, 200, 300, 400])).toBe(250);
    expect(median([100, 101])).toBe(101);
    expect(median([1, 2, 3, 6])).toBe(3);
  });
  it('não altera a entrada', () => {
    const a = [3, 1, 2];
    median(a);
    expect(a).toEqual([3, 1, 2]);
  });
});

describe('suggestHistoricalPrice', () => {
  const target = { kind: 'PART' as const, catalogItemId: 'c1', description: 'Filtro' };
  const withId = (price: number) => item(price, { catalogItemId: 'c1', description: 'Filtro' });

  it('mínimo de 3 amostras', () => {
    const wos = [os('2026-09-01', [withId(100)]), os('2026-09-02', [withId(200)])];
    expect(suggestHistoricalPrice(target, wos, today)).toBeNull();
    wos.push(os('2026-09-03', [withId(300)]));
    expect(suggestHistoricalPrice(target, wos, today)).toEqual({ price: 200, samples: 3, min: 100, max: 300 });
  });
  it('minSamples configurável', () => {
    const wos = [os('2026-09-01', [withId(100)])];
    expect(suggestHistoricalPrice(target, wos, today, { minSamples: 1 })?.price).toBe(100);
  });
  it('janela: 11 meses e 29 dias dentro; 12 meses e 1 dia fora', () => {
    const base = [os('2026-09-01', [withId(100)]), os('2026-09-02', [withId(200)])];
    const dentro = suggestHistoricalPrice(target, [...base, os('2025-10-18', [withId(300)])], today);
    expect(dentro?.samples).toBe(3);
    const fora = suggestHistoricalPrice(target, [...base, os('2025-10-15', [withId(300)])], today);
    expect(fora).toBeNull();
  });
  it('exatamente 12 meses ainda conta', () => {
    const wos = [os('2025-10-16', [withId(100)]), os('2026-09-02', [withId(200)]), os('2026-09-03', [withId(300)])];
    expect(suggestHistoricalPrice(target, wos, today)?.samples).toBe(3);
  });
  it('só OS finalizadas', () => {
    const statuses: OSStatus[] = ['ORCAMENTO', 'APROVADO', 'EM_SERVICO', 'AGUARDANDO_PAGAMENTO', 'ARQUIVADO'];
    const wos = statuses.map(s => os('2026-09-01', [withId(100)], [], s));
    expect(suggestHistoricalPrice(target, wos, today, { minSamples: 1 })).toBeNull();
  });
  it('kind escolhe peças ou serviços', () => {
    const wos = [1, 2, 3].map(n => os(`2026-09-0${n}`, [withId(500)], [withId(100)]));
    expect(suggestHistoricalPrice({ ...target, kind: 'SERVICE' }, wos, today)?.price).toBe(100);
    expect(suggestHistoricalPrice(target, wos, today)?.price).toBe(500);
  });
  it('catalogItemId diferente não mistura', () => {
    const wos = [1, 2, 3].map(n => os(`2026-09-0${n}`, [item(100, { catalogItemId: 'c2', description: 'Filtro' })]));
    expect(suggestHistoricalPrice(target, wos, today)).toBeNull();
  });
  it('reserva: descrição normalizada quando falta o id', () => {
    const t = { kind: 'SERVICE' as const, description: '  troca DE  óleo ' };
    const wos = [100, 200, 400].map((p, i) => os(`2026-09-0${i + 1}`, [], [item(p, { description: 'Troca de óleo' })]));
    expect(suggestHistoricalPrice(t, wos, today)).toEqual({ price: 200, samples: 3, min: 100, max: 400 });
  });
  it('descrição vazia nunca casa por reserva', () => {
    const wos = [1, 2, 3].map(n => os(`2026-09-0${n}`, [item(100, { description: '' })]));
    expect(suggestHistoricalPrice({ kind: 'PART', description: '' }, wos, today)).toBeNull();
  });
  it('mediana par arredondada', () => {
    const wos = [100, 101, 200, 300].map((p, i) => os(`2026-09-0${i + 1}`, [withId(p)]));
    expect(suggestHistoricalPrice(target, wos, today)?.price).toBe(151);
  });
});
