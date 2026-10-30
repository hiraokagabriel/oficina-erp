import { describe, it, expect } from 'vitest';
import {
  MAX_PHOTOS_PER_OS, acceptImageFile, addPhotos, fitWithin, groupPhotosByVehicle, isValidPhotoId, nameOnlyMatches,
  photoCount, photosOfClientVehicle, removePhoto, updateCaption,
} from './photos';
import type { OSPhoto, WorkOrder } from '../types';

const os = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'W1', osNumber: 1, status: 'APROVADO', clientName: 'Maria', vehicle: 'Gol - ABC-1D23', createdAt: '2026-01-01T15:00:00.000Z',
  ...over,
} as WorkOrder);
const ph = (id: string, createdAt = '2026-03-01T15:00:00.000Z', caption?: string): OSPhoto =>
  caption === undefined ? { id, createdAt } : { id, createdAt, caption };

describe('fitWithin', () => {
  it('reduz mantendo a proporção', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });
  it('nunca amplia', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });
  it('lado mínimo é 1 e entrada inválida dá 0x0', () => {
    expect(fitWithin(10000, 1, 100)).toEqual({ width: 100, height: 1 });
    expect(fitWithin(0, 10, 100)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(10, 10, 0)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(NaN, 10, 100)).toEqual({ width: 0, height: 0 });
  });
});

describe('isValidPhotoId', () => {
  it('aceita letras, números e hífen até 64', () => {
    expect(isValidPhotoId('abc-123-XYZ')).toBe(true);
    expect(isValidPhotoId('a'.repeat(64))).toBe(true);
  });
  it('recusa vazio, longo, ponto, barra, espaço e não-texto', () => {
    for (const x of ['', 'a'.repeat(65), 'a.b', '../x', 'a/b', 'a\\b', 'a b', 'ação']) expect(isValidPhotoId(x)).toBe(false);
    expect(isValidPhotoId(undefined)).toBe(false);
    expect(isValidPhotoId(12)).toBe(false);
  });
});

describe('addPhotos', () => {
  it('acrescenta sem mutar a entrada', () => {
    const o = os();
    const r = addPhotos(o, [ph('a'), ph('b')]);
    expect(r.os.photos?.map(p => p.id)).toEqual(['a', 'b']);
    expect(r.recusadas).toEqual([]);
    expect(o.photos).toBeUndefined();
  });
  it('respeita o limite e devolve as recusadas', () => {
    const r = addPhotos(os({ photos: [ph('a'), ph('b')] }), [ph('c'), ph('d'), ph('e')], 3);
    expect(r.os.photos?.map(p => p.id)).toEqual(['a', 'b', 'c']);
    expect(r.recusadas.map(p => p.id)).toEqual(['d', 'e']);
  });
  it('limite padrão é 20', () => {
    expect(MAX_PHOTOS_PER_OS).toBe(20);
    const muitas = Array.from({ length: 25 }, (_, i) => ph(`p${i}`));
    const r = addPhotos(os(), muitas);
    expect(photoCount(r.os)).toBe(20);
    expect(r.recusadas).toHaveLength(5);
  });
  it('não duplica id (na OS nem no lote) e recusa id inválido', () => {
    const r = addPhotos(os({ photos: [ph('a')] }), [ph('a'), ph('b'), ph('b'), ph('../x')]);
    expect(r.os.photos?.map(p => p.id)).toEqual(['a', 'b']);
    expect(r.recusadas.map(p => p.id)).toEqual(['a', 'b', '../x']);
  });
  it('nada aceito devolve a mesma OS', () => {
    const o = os({ photos: [ph('a')] });
    expect(addPhotos(o, [ph('a')]).os).toBe(o);
    expect(addPhotos(o, []).os).toBe(o);
  });
});

describe('removePhoto', () => {
  it('remove a foto; última removida tira o campo', () => {
    const o = os({ photos: [ph('a'), ph('b')] });
    const r1 = removePhoto(o, 'a');
    expect(r1.photos?.map(p => p.id)).toEqual(['b']);
    const r2 = removePhoto(r1, 'b');
    expect('photos' in r2).toBe(false);
    expect(o.photos).toHaveLength(2);
  });
  it('id inexistente ou OS sem fotos: mesma OS', () => {
    const o = os({ photos: [ph('a')] });
    expect(removePhoto(o, 'z')).toBe(o);
    const s = os();
    expect(removePhoto(s, 'a')).toBe(s);
  });
});

describe('updateCaption', () => {
  it('grava a legenda sem espaços nas pontas', () => {
    const r = updateCaption(os({ photos: [ph('a'), ph('b')] }), 'a', '  Risco na porta  ');
    expect(r.photos?.[0].caption).toBe('Risco na porta');
    expect(r.photos?.[1]).toEqual(ph('b'));
  });
  it('vazio apaga a legenda', () => {
    const r = updateCaption(os({ photos: [ph('a', '2026-03-01T15:00:00.000Z', 'x')] }), 'a', '   ');
    expect('caption' in r.photos![0]).toBe(false);
  });
  it('id inexistente: mesma OS', () => {
    const o = os({ photos: [ph('a')] });
    expect(updateCaption(o, 'z', 'x')).toBe(o);
  });
});

describe('acceptImageFile', () => {
  const MB = 1024 * 1024;
  it('aceita jpeg, png e webp até 25 MB', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp', 'IMAGE/JPEG']) expect(acceptImageFile(t, 3 * MB)).toEqual({ ok: true });
    expect(acceptImageFile('image/jpeg', 25 * MB)).toEqual({ ok: true });
  });
  it('recusa HEIC/HEIF com a mensagem do iPhone', () => {
    for (const t of ['image/heic', 'image/heif']) {
      expect(acceptImageFile(t, MB)).toEqual({ ok: false, message: 'Formato do iPhone: envie como JPG.' });
    }
  });
  it('recusa acima de 25 MB, vazio e outros tipos', () => {
    expect(acceptImageFile('image/jpeg', 25 * MB + 1).ok).toBe(false);
    expect(acceptImageFile('image/jpeg', 0).ok).toBe(false);
    expect(acceptImageFile('application/pdf', MB).ok).toBe(false);
    expect(acceptImageFile('', MB).ok).toBe(false);
  });
});

describe('photosOfClientVehicle', () => {
  const wos: WorkOrder[] = [
    os({ id: 'A', osNumber: 1, clientId: 'C1', vehicleId: 'V1', photos: [ph('a1', '2026-01-10T15:00:00.000Z')] }),
    os({ id: 'B', osNumber: 2, clientId: 'C1', vehicleId: 'V1', photos: [ph('b1', '2026-03-10T15:00:00.000Z'), ph('b2', '2026-02-10T15:00:00.000Z')] }),
    os({ id: 'C', osNumber: 3, clientId: 'C1', vehicleId: 'V2', vehicle: 'Uno - XYZ-9999', photos: [ph('c1', '2026-04-10T15:00:00.000Z')] }),
    os({ id: 'D', osNumber: 4, clientId: 'C2', vehicleId: 'V3', clientName: 'Maria', photos: [ph('d1', '2026-05-10T15:00:00.000Z')] }), // homônima
    os({ id: 'E', osNumber: 5, clientId: 'C1' }), // sem fotos
  ];
  const ids = (r: ReturnType<typeof photosOfClientVehicle>) => r.map(x => x.photo.id);

  it('liga por id, mais recente primeiro, e separa homônimos com ids diferentes', () => {
    expect(ids(photosOfClientVehicle(wos, { clientId: 'C1', clientName: 'Maria' }))).toEqual(['c1', 'b1', 'b2', 'a1']);
    expect(ids(photosOfClientVehicle(wos, { clientId: 'C2', clientName: 'Maria' }))).toEqual(['d1']);
  });
  it('filtra por veículo (id)', () => {
    expect(ids(photosOfClientVehicle(wos, { clientId: 'C1', vehicleId: 'V1' }))).toEqual(['b1', 'b2', 'a1']);
    expect(ids(photosOfClientVehicle(wos, { clientId: 'C1', vehicleId: 'V2' }))).toEqual(['c1']);
  });
  it('cai no nome do cliente e na placa quando faltam ids', () => {
    const legado: WorkOrder[] = [
      os({ id: 'L1', osNumber: 1, clientName: '  maria  ', vehicle: 'Gol - abc1d23', photos: [ph('l1')] }),
      os({ id: 'L2', osNumber: 2, clientName: 'Maria', vehicle: 'Uno - XYZ-9999', photos: [ph('l2')] }),
      os({ id: 'L3', osNumber: 3, clientName: 'Outro', vehicle: 'Gol - ABC-1D23', photos: [ph('l3')] }),
    ];
    expect(ids(photosOfClientVehicle(legado, { clientName: 'Maria' })).sort()).toEqual(['l1', 'l2']);
    expect(ids(photosOfClientVehicle(legado, { clientName: 'Maria', vehicle: 'Gol - ABC-1D23' }))).toEqual(['l1']);
  });
  it('referência só com nome pega OS com id e sem id', () => {
    expect(ids(photosOfClientVehicle(wos, { clientName: 'maria' })).sort()).toEqual(['a1', 'b1', 'b2', 'c1', 'd1']);
  });
  it('sem placa usa o modelo', () => {
    const l: WorkOrder[] = [
      os({ id: 'M1', clientName: 'Zé', vehicle: 'Gol', photos: [ph('m1')] }),
      os({ id: 'M2', clientName: 'Zé', vehicle: 'Uno', photos: [ph('m2')] }),
    ];
    expect(ids(photosOfClientVehicle(l, { clientName: 'Zé', vehicle: 'gol' }))).toEqual(['m1']);
  });
  it('referência sem cliente devolve vazio', () => {
    expect(photosOfClientVehicle(wos, {})).toEqual([]);
    expect(photosOfClientVehicle(wos, { clientName: '  ' })).toEqual([]);
  });
  it('mesma data: desempata pelo número da OS maior primeiro', () => {
    const d = '2026-01-01T15:00:00.000Z';
    const l = [
      os({ id: 'X', osNumber: 1, clientName: 'Z', photos: [ph('x', d)] }),
      os({ id: 'Y', osNumber: 2, clientName: 'Z', photos: [ph('y', d)] }),
    ];
    expect(ids(photosOfClientVehicle(l, { clientName: 'Z' }))).toEqual(['y', 'x']);
  });
});

describe('groupPhotosByVehicle', () => {
  it('agrupa por carro; OS antiga (só placa) e nova (com id) do mesmo carro ficam juntas', () => {
    const l: WorkOrder[] = [
      os({ id: 'A', osNumber: 1, clientId: 'C1', photos: [ph('a', '2026-01-01T15:00:00.000Z')] }),
      os({ id: 'B', osNumber: 2, clientId: 'C1', vehicleId: 'V1', photos: [ph('b', '2026-02-01T15:00:00.000Z')] }),
      os({ id: 'C', osNumber: 3, clientId: 'C1', vehicleId: 'V2', vehicle: 'Uno - XYZ-9999', photos: [ph('c', '2026-03-01T15:00:00.000Z')] }),
    ];
    const g = groupPhotosByVehicle(l, { clientId: 'C1' });
    expect(g.map(x => x.photos.map(p => p.photo.id))).toEqual([['c'], ['b', 'a']]);
    expect(g[0].label).toBe('Uno - XYZ-9999');
  });
  it('sem fotos: lista vazia', () => {
    expect(groupPhotosByVehicle([os({ clientId: 'C1' })], { clientId: 'C1' })).toEqual([]);
  });
});

describe('nameOnlyMatches', () => {
  const maria1 = { id: 'C1', name: 'Maria' };
  const maria2 = { id: 'C2', name: ' maria ' };
  const legada = (n: number, over: Partial<WorkOrder> = {}) =>
    os({ id: `L${n}`, osNumber: n, clientName: 'Maria', photos: [ph(`p${n}`)], ...over });

  it('OS sem clientId com homônimo existente gera aviso, em ordem de número', () => {
    const r = nameOnlyMatches([legada(7), legada(3)], [maria1, maria2], maria1);
    expect(r.map(o => o.osNumber)).toEqual([3, 7]);
  });
  it('OS com clientId não gera (homônimos com ids diferentes)', () => {
    expect(nameOnlyMatches([legada(1, { clientId: 'C1' }), legada(2, { clientId: 'C2' })], [maria1, maria2], maria1)).toEqual([]);
  });
  it('sem homônimo não gera', () => {
    expect(nameOnlyMatches([legada(1)], [maria1, { id: 'C3', name: 'José' }], maria1)).toEqual([]);
  });
  it('um só cliente com o nome não gera', () => {
    expect(nameOnlyMatches([legada(1)], [maria1], maria1)).toEqual([]);
  });
  it('ignora OS sem foto e de outro nome', () => {
    expect(nameOnlyMatches([legada(1, { photos: undefined }), legada(2, { clientName: 'José' })], [maria1, maria2], maria1)).toEqual([]);
  });
});
