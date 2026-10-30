import { describe, it, expect } from 'vitest';
import type { OSPhoto, WorkOrder } from '../types';
import type { VehiclePhotoGroup } from './photos';
import {
  appendPhotoMetas, groupLabel, limitGroups, limitMessage, photoAlt, photoCountLabel, photoDateLabel, photoOriginLabel,
  photosChanged, photosToTrashOnSave, removeFromList, setCaptionInList, slotsLeft, trimCaptions,
} from './photosView';

const ph = (id: string, caption?: string): OSPhoto => ({ id, createdAt: '2026-05-03T15:00:00.000Z', ...(caption ? { caption } : {}) });

describe('textos', () => {
  it('contador e vagas', () => {
    expect(photoCountLabel(3)).toBe('3 de 20');
    expect(slotsLeft(18)).toBe(2);
    expect(slotsLeft(25)).toBe(0);
  });
  it('alt usa a legenda ou o número', () => {
    expect(photoAlt(ph('a', ' Frente '), 12, 1)).toBe('Frente');
    expect(photoAlt(ph('a'), 12, 2)).toBe('Foto 2 da OS #12');
  });
  it('data local e origem', () => {
    expect(photoDateLabel('2026-05-03T15:00:00.000Z')).toBe('03/05/2026');
    expect(photoDateLabel('lixo')).toBe('');
    expect(photoOriginLabel(7, 'lixo')).toBe('OS #7');
    expect(photoOriginLabel(7, '2026-05-03T15:00:00.000Z')).toBe('OS #7 · 03/05/2026');
  });
  it('mensagem de limite', () => {
    expect(limitMessage(0, 3)).toContain('máximo');
    expect(limitMessage(1, 3)).toBe('Só couberam 1 foto: o máximo é 20 por OS. 2 ficaram de fora.');
    expect(limitMessage(2, 3)).toContain('1 ficou de fora');
  });
});

describe('rascunho de fotos', () => {
  it('detecta mudança por id, ordem e legenda', () => {
    expect(photosChanged(undefined, [])).toBe(false);
    expect(photosChanged([ph('a')], [ph('a')])).toBe(false);
    expect(photosChanged([ph('a')], [])).toBe(true);
    expect(photosChanged([ph('a'), ph('b')], [ph('b'), ph('a')])).toBe(true);
    expect(photosChanged([ph('a')], [ph('a', 'x')])).toBe(true);
  });
  it('lixeira ao salvar: só o que saiu', () => {
    expect(photosToTrashOnSave([ph('a'), ph('b')], [ph('b'), ph('c')])).toEqual(['a']);
    expect(photosToTrashOnSave(undefined, [ph('c')])).toEqual([]);
    expect(photosToTrashOnSave([ph('a')], undefined)).toEqual(['a']);
  });
  it('append respeita limite, id inválido e repetido', () => {
    const r = appendPhotoMetas([ph('a')], [ph('a'), ph('b/../x'), ph('c'), ph('d')], 3);
    expect(r.list.map(p => p.id)).toEqual(['a', 'c', 'd']);
    expect(r.recusadas.map(p => p.id)).toEqual(['a', 'b/../x']);
    expect(appendPhotoMetas([ph('a'), ph('b')], [ph('c')], 2).recusadas).toHaveLength(1);
  });
  it('remove e legenda não mutam', () => {
    const l = [ph('a', 'x'), ph('b')];
    expect(removeFromList(l, 'a').map(p => p.id)).toEqual(['b']);
    expect(setCaptionInList(l, 'a', '  ')[0].caption).toBeUndefined();
    expect(setCaptionInList(l, 'b', 'Lado ')[1].caption).toBe('Lado ');
    expect(trimCaptions([ph('a', '  Lado  '), { ...ph('b'), caption: '  ' }])).toEqual([ph('a', 'Lado'), ph('b')]);
    expect(l[0].caption).toBe('x');
  });
});

describe('galeria', () => {
  const os = { id: 'o', osNumber: 1 } as WorkOrder;
  const grupo = (key: string, n: number, label = key): VehiclePhotoGroup => ({
    key, label, photos: Array.from({ length: n }, (_, i) => ({ os, photo: ph(`${key}${i}`) })),
  });
  it('limitGroups corta no total e remove grupos vazios', () => {
    const g = [grupo('a', 3), grupo('b', 3), grupo('c', 2)];
    const r = limitGroups(g, 4);
    expect(r.map(x => x.photos.length)).toEqual([3, 1]);
    expect(r[0]).toBe(g[0]);
    expect(limitGroups(g, 0)).toEqual([]);
    expect(limitGroups(g, 99)).toHaveLength(3);
  });
  it('groupLabel cai no texto padrão', () => {
    expect(groupLabel({ label: '' })).toBe('Sem veículo informado');
    expect(groupLabel({ label: 'Gol - ABC1D23' })).toBe('Gol - ABC1D23');
  });
});
