import { describe, it, expect } from 'vitest';
import { pushToast, dropToast } from './toastQueue';

describe('fila de avisos', () => {
  it('erro igual ainda visível não empilha', () => {
    const a = pushToast([], 'falhou', 'error', '1');
    const b = pushToast(a, 'falhou', 'error', '2');
    expect(b).toBe(a);
    expect(b).toHaveLength(1);
  });
  it('erro diferente entra', () => {
    const b = pushToast(pushToast([], 'falhou', 'error', '1'), 'outro', 'error', '2');
    expect(b.map((t) => t.id)).toEqual(['1', '2']);
  });
  it('depois de fechado, o mesmo erro volta a aparecer', () => {
    const a = pushToast([], 'falhou', 'error', '1');
    const fechado = dropToast(a, '1');
    expect(fechado).toEqual([]);
    expect(pushToast(fechado, 'falhou', 'error', '2').map((t) => t.id)).toEqual(['2']);
  });
  it('sucesso e info não são deduplicados (expiram sozinhos) e erro não é confundido com eles', () => {
    let q = pushToast([], 'ok', 'success', '1');
    q = pushToast(q, 'ok', 'success', '2');
    q = pushToast(q, 'ok', 'error', '3');
    expect(q.map((t) => t.id)).toEqual(['1', '2', '3']);
    expect(dropToast(q, '1').map((t) => t.id)).toEqual(['2', '3']);
  });
});
