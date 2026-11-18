import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushBeforeReload, registerBeforeReload, resetBeforeReload } from './beforeReload';

afterEach(() => { resetBeforeReload(); vi.useRealTimers(); });

describe('flushBeforeReload', () => {
  it('chama todos os descarregadores registrados e espera os assíncronos', async () => {
    const order: string[] = [];
    registerBeforeReload(() => { order.push('a'); });
    registerBeforeReload(async () => { await Promise.resolve(); order.push('b'); });
    await flushBeforeReload();
    expect(order).toEqual(['a', 'b']);
  });
  it('quem se desregistrou não é chamado', async () => {
    const f = vi.fn();
    const off = registerBeforeReload(f);
    off();
    await flushBeforeReload();
    expect(f).not.toHaveBeenCalled();
  });
  it('um descarregador que falha não impede os outros nem a recarga', async () => {
    const ok = vi.fn();
    registerBeforeReload(() => { throw new Error('boom'); });
    registerBeforeReload(async () => { throw new Error('boom2'); });
    registerBeforeReload(ok);
    await expect(flushBeforeReload()).resolves.toBeUndefined();
    expect(ok).toHaveBeenCalled();
  });
  it('um descarregador que nunca termina é abandonado depois do limite', async () => {
    vi.useFakeTimers();
    registerBeforeReload(() => new Promise<void>(() => {}));
    const p = flushBeforeReload(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toBeUndefined();
  });
  it('sem nenhum registrado: resolve na hora', async () => {
    await expect(flushBeforeReload()).resolves.toBeUndefined();
  });
});
