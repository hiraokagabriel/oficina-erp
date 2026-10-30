import { describe, it, expect } from 'vitest';
import { pushToast, dropToast, toastDurationMs } from './toastQueue';

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

  describe('ação opcional', () => {
    const action = { label: 'Abrir pasta', onClick: () => {} };
    it('preserva a ação e não cria a chave sem ela', () => {
      const q = pushToast(pushToast([], 'PDF salvo: OS_12.pdf', 'success', '1', action), 'ok', 'info', '2');
      expect(q[0].action).toBe(action);
      expect('action' in q[1]).toBe(false);
    });
    it('duração: 4 s sem ação, 8 s com ação, erro fica até fechar', () => {
      expect(toastDurationMs({ type: 'success' })).toBe(4000);
      expect(toastDurationMs({ type: 'info', action })).toBe(8000);
      expect(toastDurationMs({ type: 'error' })).toBeNull();
      expect(toastDurationMs({ type: 'error', action })).toBeNull();
    });
    it('erro igual com ação continua sem empilhar', () => {
      const a = pushToast([], 'falhou', 'error', '1', action);
      expect(pushToast(a, 'falhou', 'error', '2', action)).toBe(a);
    });
  });
});
