import { describe, it, expect, afterEach, vi } from 'vitest';
import { getShowCosts, setShowCosts, getShowCostColumn, setShowCostColumn } from './uiPrefs';

const mem = () => {
  const d: Record<string, string> = {};
  return {
    d,
    getItem: (k: string) => (k in d ? d[k] : null),
    setItem: (k: string, v: string) => { d[k] = v; },
    removeItem: (k: string) => { delete d[k]; },
  };
};

const broken = {
  getItem: () => { throw new Error('bloqueado'); },
  setItem: () => { throw new Error('bloqueado'); },
  removeItem: () => { throw new Error('bloqueado'); },
};

afterEach(() => vi.unstubAllGlobals());

describe('uiPrefs: getShowCosts / setShowCosts', () => {
  it('valor ausente = false (recolhido)', () => {
    vi.stubGlobal('localStorage', mem());
    expect(getShowCosts()).toBe(false);
  });

  it('grava e lê true e false com a chave oficina_os_show_costs', () => {
    const s = mem();
    vi.stubGlobal('localStorage', s);
    expect(setShowCosts(true)).toBe(true);
    expect(s.d['oficina_os_show_costs']).toBe('1');
    expect(getShowCosts()).toBe(true);
    expect(setShowCosts(false)).toBe(true);
    expect(getShowCosts()).toBe(false);
  });

  it('valor estranho = false', () => {
    const s = mem();
    s.d['oficina_os_show_costs'] = 'talvez';
    vi.stubGlobal('localStorage', s);
    expect(getShowCosts()).toBe(false);
  });

  it('localStorage lançando exceção: get = false, set = false, sem lançar', () => {
    vi.stubGlobal('localStorage', broken);
    expect(getShowCosts()).toBe(false);
    expect(setShowCosts(true)).toBe(false);
  });
});

describe('uiPrefs: getShowCostColumn / setShowCostColumn', () => {
  it('valor ausente = true (ligada)', () => {
    vi.stubGlobal('localStorage', mem());
    expect(getShowCostColumn()).toBe(true);
  });

  it('grava e lê false e true com a chave oficina_os_show_cost_column', () => {
    const s = mem();
    vi.stubGlobal('localStorage', s);
    expect(setShowCostColumn(false)).toBe(true);
    expect(s.d['oficina_os_show_cost_column']).toBe('0');
    expect(getShowCostColumn()).toBe(false);
    expect(setShowCostColumn(true)).toBe(true);
    expect(s.d['oficina_os_show_cost_column']).toBe('1');
    expect(getShowCostColumn()).toBe(true);
  });

  it('valor estranho = true', () => {
    const s = mem();
    s.d['oficina_os_show_cost_column'] = 'talvez';
    vi.stubGlobal('localStorage', s);
    expect(getShowCostColumn()).toBe(true);
  });

  it('não interfere na chave de lucro e margem', () => {
    const s = mem();
    vi.stubGlobal('localStorage', s);
    setShowCostColumn(false);
    expect(getShowCosts()).toBe(false);
    expect('oficina_os_show_costs' in s.d).toBe(false);
  });

  it('localStorage lançando exceção: get = true, set = false, sem lançar', () => {
    vi.stubGlobal('localStorage', broken);
    expect(getShowCostColumn()).toBe(true);
    expect(setShowCostColumn(false)).toBe(false);
  });
});
