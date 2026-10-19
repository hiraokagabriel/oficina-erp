import { describe, it, expect } from 'vitest';
import { nextFocusIndex } from './focusTrap';

describe('nextFocusIndex', () => {
  it('avança e volta ao primeiro no fim', () => {
    expect(nextFocusIndex(3, 0, false)).toBe(1);
    expect(nextFocusIndex(3, 2, false)).toBe(0);
  });
  it('Shift+Tab volta e vai ao último no início', () => {
    expect(nextFocusIndex(3, 1, true)).toBe(0);
    expect(nextFocusIndex(3, 0, true)).toBe(2);
  });
  it('foco fora da lista entra pelo começo ou pelo fim', () => {
    expect(nextFocusIndex(3, -1, false)).toBe(0);
    expect(nextFocusIndex(3, -1, true)).toBe(2);
  });
  it('lista vazia', () => { expect(nextFocusIndex(0, -1, false)).toBe(-1); });
});
