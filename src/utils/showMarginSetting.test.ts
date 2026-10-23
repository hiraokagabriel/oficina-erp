import { describe, it, expect } from 'vitest';
import { setShowMarginOnBoard } from './showMarginSetting';
import type { WorkshopSettings } from '../types';

const base: WorkshopSettings = { name: 'X', cnpj: '', address: '', exportPath: '', targetMargin: 65 };

describe('setShowMarginOnBoard', () => {
  it('ligar grava true e preserva o resto', () => {
    expect(setShowMarginOnBoard(base, true)).toEqual({ ...base, showMarginOnBoard: true });
  });
  it('desligar remove a chave (não grava false) e preserva o resto', () => {
    const off = setShowMarginOnBoard({ ...base, showMarginOnBoard: true }, false);
    expect('showMarginOnBoard' in off).toBe(false);
    expect(off.targetMargin).toBe(65);
  });
  it('desligar já desligado é idempotente e não muta a entrada', () => {
    const input = { ...base };
    expect(setShowMarginOnBoard(input, false)).toEqual(base);
    expect(input).toEqual(base);
  });
});
