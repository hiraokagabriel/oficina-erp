import { describe, it, expect } from 'vitest';
import { canTriggerNewOSShortcut } from './shortcuts';

describe('canTriggerNewOSShortcut', () => {
  it('permite com foco no corpo e sem modal', () => {
    expect(canTriggerNewOSShortcut({ tagName: 'BODY' }, false)).toBe(true);
    expect(canTriggerNewOSShortcut(null, false)).toBe(true);
    expect(canTriggerNewOSShortcut({ tagName: 'BUTTON' }, false)).toBe(true);
  });
  it('bloqueia em campos de texto e editáveis', () => {
    for (const tagName of ['INPUT', 'textarea', 'SELECT']) expect(canTriggerNewOSShortcut({ tagName }, false)).toBe(false);
    expect(canTriggerNewOSShortcut({ tagName: 'DIV', isContentEditable: true }, false)).toBe(false);
  });
  it('bloqueia com modal aberto', () => {
    expect(canTriggerNewOSShortcut({ tagName: 'BODY' }, true)).toBe(false);
  });
});
