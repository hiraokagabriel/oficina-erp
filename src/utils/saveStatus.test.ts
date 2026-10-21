import { describe, it, expect } from 'vitest';
import { describeSaveStatus, formatClock } from './saveStatus';

const base = { isSaving: false, saveError: null, readOnly: false, lastSavedAt: null };
const at = (h: number, m: number) => new Date(2026, 5, 10, h, m, 5).toISOString();

describe('indicador de salvamento', () => {
  it('mostra a hora local do último salvamento', () => {
    expect(describeSaveStatus({ ...base, lastSavedAt: at(14, 32) })).toEqual({ kind: 'saved', text: 'Salvo às 14:32' });
    expect(describeSaveStatus({ ...base, lastSavedAt: at(9, 5) }).text).toBe('Salvo às 09:05');
  });
  it('sem horário conhecido diz só Salvo', () => {
    expect(describeSaveStatus(base)).toEqual({ kind: 'saved', text: 'Salvo' });
    expect(describeSaveStatus({ ...base, lastSavedAt: 'lixo' }).text).toBe('Salvo');
  });
  it('salvando, erro e somente leitura', () => {
    expect(describeSaveStatus({ ...base, isSaving: true })).toEqual({ kind: 'saving', text: 'Salvando...' });
    expect(describeSaveStatus({ ...base, saveError: 'disco cheio' })).toEqual({ kind: 'error', text: 'Não salvo, tentando de novo' });
    expect(describeSaveStatus({ ...base, readOnly: true })).toEqual({ kind: 'readonly', text: 'Somente leitura' });
  });
  it('alterações pendentes não dizem Salvo', () => {
    expect(describeSaveStatus({ ...base, hasPendingChanges: true, lastSavedAt: at(14, 32) })).toEqual({ kind: 'pending', text: 'Alterações pendentes' });
  });
  it('conflito aberto', () => {
    expect(describeSaveStatus({ ...base, hasConflict: true, lastSavedAt: at(14, 32) })).toEqual({ kind: 'conflict', text: 'Conflito, não salvo' });
  });
  it('prioridade: leitura > conflito > salvando > erro > pendente > salvo', () => {
    const all = { ...base, readOnly: true, hasConflict: true, isSaving: true, saveError: 'x', hasPendingChanges: true };
    expect(describeSaveStatus(all).kind).toBe('readonly');
    expect(describeSaveStatus({ ...all, readOnly: false }).kind).toBe('conflict');
    expect(describeSaveStatus({ ...all, readOnly: false, hasConflict: false }).kind).toBe('saving');
    expect(describeSaveStatus({ ...all, readOnly: false, hasConflict: false, isSaving: false }).kind).toBe('error');
    expect(describeSaveStatus({ ...all, readOnly: false, hasConflict: false, isSaving: false, saveError: null }).kind).toBe('pending');
    expect(describeSaveStatus(base).kind).toBe('saved');
  });
  it('formatClock', () => {
    expect(formatClock(null)).toBe('');
    expect(formatClock(at(0, 0))).toBe('00:00');
  });
});
