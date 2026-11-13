import { describe, expect, it } from 'vitest';
import { applyFieldSave } from './fieldOSSave';
import type { OSPhoto, WorkOrder } from '../types';

const photo = (id: string): OSPhoto => ({ id, createdAt: '2026-03-01T12:00:00.000Z' });
const os = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'os1', osNumber: 7, vehicle: 'Gol - AAA-0001', clientName: 'Cliente Teste', clientPhone: '1', mileage: 100,
  clientId: 'c1', vehicleId: 'v1', technicianId: 't1', technician: 'Zé',
  status: 'EM_SERVICO', parts: [{ id: 'p1', description: 'Filtro', price: 5000, cost: 2000 }],
  services: [{ id: 's1', description: 'Troca', price: 10000 }], total: 15000, totalCost: 2000,
  createdAt: '2026-01-10T12:00:00.000Z', publicNotes: 'nota', financialId: 'f1',
  advances: [{ id: 'a1', amount: 3000, date: '2026-03-01T12:00:00.000Z', entryId: 'e1' }], ...over,
});

describe('applyFieldSave', () => {
  it('muda só a quilometragem; o resto fica idêntico', () => {
    const cur = os();
    const out = applyFieldSave(cur, { mileage: 250 });
    expect(out.mileage).toBe(250);
    expect({ ...out, mileage: 100 }).toEqual(cur);
    expect(out.parts).toBe(cur.parts);
    expect(out.services).toBe(cur.services);
    expect(out.advances).toBe(cur.advances);
    expect(out.total).toBe(15000);
  });
  it('não altera o objeto de entrada', () => {
    const cur = os();
    const snapshot = JSON.stringify(cur);
    applyFieldSave(cur, { mileage: 1, photos: [photo('f1')] });
    expect(JSON.stringify(cur)).toBe(snapshot);
  });
  it('fotos do rascunho substituem as da OS; lista vazia remove o campo', () => {
    const cur = os({ photos: [photo('f1'), photo('f2')] });
    expect(applyFieldSave(cur, { mileage: 100, photos: [photo('f1'), photo('f3')] }).photos?.map(p => p.id)).toEqual(['f1', 'f3']);
    expect('photos' in applyFieldSave(cur, { mileage: 100, photos: [] })).toBe(false);
  });
  it('sem lista de fotos mantém as da OS', () => {
    const cur = os({ photos: [photo('f1')] });
    expect(applyFieldSave(cur, { mileage: 100 }).photos).toEqual([photo('f1')]);
  });
  it('limita a 20 fotos', () => {
    const many = Array.from({ length: 25 }, (_, i) => photo(`f${i}`));
    expect(applyFieldSave(os(), { mileage: 1, photos: many }).photos).toHaveLength(20);
  });
  it('km inválida (NaN, negativa) mantém a da OS; fracionária arredonda para baixo', () => {
    expect(applyFieldSave(os(), { mileage: Number.NaN }).mileage).toBe(100);
    expect(applyFieldSave(os(), { mileage: -5 }).mileage).toBe(100);
    expect(applyFieldSave(os(), { mileage: 10.9 }).mileage).toBe(10);
  });
  it('status e vistoria de outro PC ficam como estão no banco', () => {
    const cur = os({ status: 'AGUARDANDO_PAGAMENTO' });
    expect(applyFieldSave(cur, { mileage: 5 }).status).toBe('AGUARDANDO_PAGAMENTO');
  });
});
