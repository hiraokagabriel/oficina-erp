import { describe, it, expect } from 'vitest';
import { parseDatabase } from './DatabaseContext';
import type { WorkshopSettings } from '../types';

const fallback: WorkshopSettings = { name: 'X', cnpj: '', address: '', exportPath: '' };
const ap = { id: 'A1', date: '2026-03-10T15:00:00.000Z', clientName: 'Maria', vehicle: 'Gol', status: 'AGENDADO', createdAt: '2026-03-01T15:00:00.000Z' };

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
