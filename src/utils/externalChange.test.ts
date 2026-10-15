import { describe, it, expect } from 'vitest';
import { decideExternalChange, DiskMetaInfo } from './externalChange';

// Fixtures sintéticas.
const ok = (revision: string, history: string[] = []): DiskMetaInfo => ({ status: 'ok', revision, history, savedBy: 'PC-B', savedAt: '2026-10-15T14:30:00.000Z' });

describe('decideExternalChange', () => {
  it('revision igual: nada', () => {
    expect(decideExternalChange({ myRevision: 'r1', disk: ok('r1', ['r0']), hasPendingEdits: false })).toBe('none');
  });

  it('revision igual com edição pendente: nada', () => {
    expect(decideExternalChange({ myRevision: 'r1', disk: ok('r1'), hasPendingEdits: true })).toBe('none');
  });

  it('disco diferente com edição pendente: skip (conflito fica para o salvamento)', () => {
    expect(decideExternalChange({ myRevision: 'r1', disk: ok('r2', ['r1']), hasPendingEdits: true })).toBe('skip');
    expect(decideExternalChange({ myRevision: 'r1', disk: ok('rX', []), hasPendingEdits: true })).toBe('skip');
  });

  it('disco descende de mim e sem edição pendente: reload', () => {
    expect(decideExternalChange({ myRevision: 'r1', disk: ok('r3', ['r2', 'r1', 'r0']), hasPendingEdits: false })).toBe('reload');
  });

  it('minha revision fora do history: diverged', () => {
    expect(decideExternalChange({ myRevision: 'r1', disk: ok('rX', ['rY', 'rZ']), hasPendingEdits: false })).toBe('diverged');
    expect(decideExternalChange({ myRevision: 'r1', disk: ok('rX'), hasPendingEdits: false })).toBe('diverged');
  });

  it('meta sumiu no disco (banco v0): diverged', () => {
    expect(decideExternalChange({ myRevision: 'r1', disk: { status: 'no_meta' }, hasPendingEdits: false })).toBe('diverged');
  });

  it('eu sem revision e disco com revision: diverged; ambos sem revision: nada', () => {
    expect(decideExternalChange({ myRevision: null, disk: ok('r1'), hasPendingEdits: false })).toBe('diverged');
    expect(decideExternalChange({ myRevision: null, disk: { status: 'no_meta' }, hasPendingEdits: false })).toBe('none');
  });

  it('arquivo ausente ou ilegível: skip, mesmo sem edição pendente', () => {
    for (const status of ['not_found', 'unreadable'] as const) {
      expect(decideExternalChange({ myRevision: 'r1', disk: { status }, hasPendingEdits: false })).toBe('skip');
      expect(decideExternalChange({ myRevision: 'r1', disk: { status }, hasPendingEdits: true })).toBe('skip');
    }
  });

  it('history ausente é tratado como vazio', () => {
    expect(decideExternalChange({ myRevision: 'r1', disk: { status: 'ok', revision: 'r2' }, hasPendingEdits: false })).toBe('diverged');
  });
});
