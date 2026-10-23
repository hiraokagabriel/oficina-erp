import { describe, it, expect } from 'vitest';
import { parseDatabase } from './DatabaseContext';
import type { WorkshopSettings } from '../types';
import { setShowMarginOnBoard } from '../utils/showMarginSetting';
import { adoptSecrets, stripDbSecrets, stripSecrets } from '../utils/secrets';

const fallback: WorkshopSettings = { name: 'X', cnpj: '', address: '', exportPath: '' };
const ap = { id: 'A1', date: '2026-03-10T15:00:00.000Z', clientName: 'Maria', vehicle: 'Gol', status: 'AGENDADO', createdAt: '2026-03-01T15:00:00.000Z' };

describe('settings.targetMargin atravessa carga, edição e gravação', () => {
  const withMargin: WorkshopSettings = { ...fallback, targetMargin: 65 };
  it('parseDatabase mantém o campo; banco sem ele continua abrindo', () => {
    expect(parseDatabase(JSON.stringify({ ledger: [], settings: withMargin }), fallback).settings.targetMargin).toBe(65);
    const old = parseDatabase(JSON.stringify({ ledger: [], settings: fallback }), fallback);
    expect(old.settings.targetMargin).toBeUndefined();
    expect(parseDatabase(JSON.stringify({ ledger: [] }), fallback).settings).toEqual(fallback);
  });
  it('adoptSecrets, stripSecrets e stripDbSecrets não descartam o campo', () => {
    const store = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
    expect(adoptSecrets(withMargin, store).targetMargin).toBe(65);
    expect(stripSecrets(withMargin).targetMargin).toBe(65);
    expect(stripDbSecrets({ settings: withMargin }).settings.targetMargin).toBe(65);
  });
  it('edição por spread (ConfigPage) preserva o campo', () => {
    expect({ ...withMargin, name: 'Y' }.targetMargin).toBe(65);
  });
});

describe('settings.showMarginOnBoard (selo de margem do quadro) atravessa carga, edição e gravação', () => {
  const on: WorkshopSettings = { ...fallback, showMarginOnBoard: true };
  it('banco sem o campo = desligado; com o campo, parseDatabase mantém', () => {
    expect(parseDatabase(JSON.stringify({ ledger: [], settings: fallback }), fallback).settings.showMarginOnBoard).toBeUndefined();
    expect(parseDatabase(JSON.stringify({ ledger: [], settings: fallback }), fallback).settings.showMarginOnBoard === true).toBe(false);
    expect(parseDatabase(JSON.stringify({ ledger: [], settings: on }), fallback).settings.showMarginOnBoard).toBe(true);
  });
  it('adoptSecrets, stripSecrets e stripDbSecrets não descartam o campo', () => {
    const store = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
    expect(adoptSecrets(on, store).showMarginOnBoard).toBe(true);
    expect(stripSecrets(on).showMarginOnBoard).toBe(true);
    expect(stripDbSecrets({ settings: on }).settings.showMarginOnBoard).toBe(true);
  });
  it('edição por spread preserva o campo e a margem alvo; desligar remove a chave', () => {
    const both: WorkshopSettings = { ...on, targetMargin: 65 };
    expect({ ...both, name: 'Y' }).toMatchObject({ showMarginOnBoard: true, targetMargin: 65 });
    const off = setShowMarginOnBoard(both, false);
    expect('showMarginOnBoard' in off).toBe(false);
    expect(off.targetMargin).toBe(65);
  });
});

describe('parseDatabase: appointments', () => {
  it('ausente (banco antigo) vira []', () => {
    expect(parseDatabase(JSON.stringify({ ledger: [] }), fallback).appointments).toEqual([]);
  });
  it('null vira []', () => {
    expect(parseDatabase(JSON.stringify({ ledger: [], appointments: null }), fallback).appointments).toEqual([]);
  });
  it('lista é mantida', () => {
    expect(parseDatabase(JSON.stringify({ ledger: [], appointments: [ap] }), fallback).appointments).toEqual([ap]);
  });
  it('malformado (não é lista) é erro, nunca mascarado', () => {
    expect(() => parseDatabase(JSON.stringify({ ledger: [], appointments: {} }), fallback)).toThrow(/appointments/);
    expect(() => parseDatabase(JSON.stringify({ ledger: [], appointments: 'x' }), fallback)).toThrow(/appointments/);
  });
  it('banco só com appointments é reconhecido', () => {
    expect(parseDatabase(JSON.stringify({ appointments: [] }), fallback).appointments).toEqual([]);
  });
});

describe('parseDatabase: auditLog (schema v4)', () => {
  const ev = { id: 'E1', at: '2026-03-10T15:00:00.000Z', machine: 'PC', action: 'ADIANTAMENTO_CRIADO', osId: 'o', osNumber: 1, advanceId: 'a' };
  it('ausente ou null vira []', () => {
    expect(parseDatabase(JSON.stringify({ ledger: [] }), fallback).auditLog).toEqual([]);
    expect(parseDatabase(JSON.stringify({ ledger: [], auditLog: null }), fallback).auditLog).toEqual([]);
  });
  it('lista é mantida; não-lista é erro', () => {
    expect(parseDatabase(JSON.stringify({ ledger: [], auditLog: [ev] }), fallback).auditLog).toEqual([ev]);
    expect(() => parseDatabase(JSON.stringify({ ledger: [], auditLog: {} }), fallback)).toThrow(/auditLog/);
  });
});
