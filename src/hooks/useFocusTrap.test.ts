import { describe, it, expect } from 'vitest';
import { pickTabbable, TabCandidate } from './useFocusTrap';

const c = (ref: string, extra: Partial<TabCandidate<string>> = {}): TabCandidate<string> => ({ ref, tabbable: true, ...extra });

describe('pickTabbable', () => {
  it('ignora não tabuláveis', () => {
    expect(pickTabbable([c('a'), c('b', { tabbable: false }), c('d')])).toEqual(['a', 'd']);
  });

  it('em grupo de radio mantém só o marcado', () => {
    const list = [
      c('x'),
      c('r1', { radioName: 'g', checked: false }),
      c('r2', { radioName: 'g', checked: true }),
      c('r3', { radioName: 'g', checked: false }),
      c('y'),
    ];
    expect(pickTabbable(list)).toEqual(['x', 'r2', 'y']);
  });

  it('sem radio marcado mantém o primeiro do grupo', () => {
    const list = [c('r1', { radioName: 'g', checked: false }), c('r2', { radioName: 'g', checked: false })];
    expect(pickTabbable(list)).toEqual(['r1']);
  });

  it('grupos distintos são independentes e radio desabilitado não conta', () => {
    const list = [
      c('a1', { radioName: 'a', checked: false, tabbable: false }),
      c('a2', { radioName: 'a', checked: false }),
      c('b1', { radioName: 'b', checked: true }),
    ];
    expect(pickTabbable(list)).toEqual(['a2', 'b1']);
  });

  it('radio sem nome é tabulável por si', () => {
    expect(pickTabbable([c('r1', { radioName: '' }), c('r2', { radioName: '' })])).toEqual(['r1', 'r2']);
  });
});
