import { describe, it, expect } from 'vitest';
import { decideClose, decideEscape, isNoDirtyTarget } from './dirtyGuard';

describe('decideClose', () => {
  it('suja pede confirmação, limpa fecha', () => {
    expect(decideClose(true)).toBe('confirm');
    expect(decideClose(false)).toBe('close');
  });
});

describe('decideEscape', () => {
  const base = { defaultPrevented: false, isComposing: false, confirmOpen: false };
  it('Esc normal pede para fechar', () => expect(decideEscape(base)).toBe('request-close'));
  it('com o diálogo aberto, Esc só o dispensa (continua editando)', () => {
    expect(decideEscape({ ...base, confirmOpen: true })).toBe('dismiss-confirm');
  });
  it('Esc já tratado por outro campo é ignorado', () => {
    expect(decideEscape({ ...base, defaultPrevented: true })).toBe('ignore');
    expect(decideEscape({ ...base, defaultPrevented: true, confirmOpen: true })).toBe('ignore');
  });
  it('Esc durante composição de texto é ignorado', () => {
    expect(decideEscape({ ...base, isComposing: true })).toBe('ignore');
  });
});

describe('isNoDirtyTarget', () => {
  const comMarca = { closest: (sel: string) => (sel === '[data-no-dirty]' ? {} : null) };
  const semMarca = { closest: () => null };
  it('ignora controle marcado com data-no-dirty (ou dentro de um)', () => {
    expect(isNoDirtyTarget(comMarca)).toBe(true);
  });
  it('campo comum e alvos sem closest contam como alteração', () => {
    expect(isNoDirtyTarget(semMarca)).toBe(false);
    expect(isNoDirtyTarget(null)).toBe(false);
    expect(isNoDirtyTarget({})).toBe(false);
  });
});
