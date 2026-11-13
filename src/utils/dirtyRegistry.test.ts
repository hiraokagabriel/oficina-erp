import { describe, expect, it } from 'vitest';
import { anyDirty, dirtyLabels, joinLabels, leftOpenTitle, registerDirty } from './dirtyRegistry';

describe('dirtyRegistry', () => {
  it('só conta janela suja e some ao desregistrar', () => {
    let dirty = false;
    const off = registerDirty({ isDirty: () => dirty, label: 'a OS 7' });
    expect(anyDirty()).toBe(false);
    dirty = true;
    expect(dirtyLabels()).toEqual(['a OS 7']);
    off();
    expect(anyDirty()).toBe(false);
  });
  it('não repete rótulo e junta vários', () => {
    const offs = [
      registerDirty({ isDirty: () => true, label: 'a OS 7' }),
      registerDirty({ isDirty: () => true, label: 'a OS 7' }),
      registerDirty({ isDirty: () => true, label: 'um lançamento' }),
    ];
    expect(joinLabels(dirtyLabels())).toBe('a OS 7 e um lançamento');
    offs.forEach(o => o());
  });
  it('título da confirmação', () => {
    expect(leftOpenTitle('Ana', ['a OS 1234'])).toBe('Ana deixou a OS 1234 aberta sem salvar');
    expect(joinLabels([])).toBe('uma janela');
  });
});
