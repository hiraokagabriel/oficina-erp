import { afterEach, describe, expect, it } from 'vitest';
import { applyInertToBody, isAppLocked, setAppLocked, subscribeAppLock } from './appLock';
import type { InertTarget } from './appLock';

afterEach(() => setAppLocked(false));

describe('appLock', () => {
  it('liga, desliga e avisa só quando muda', () => {
    const seen: boolean[] = [];
    const off = subscribeAppLock(l => seen.push(l));
    setAppLocked(true); setAppLocked(true); setAppLocked(false);
    off(); setAppLocked(true);
    expect(seen).toEqual([true, false]);
    expect(isAppLocked()).toBe(true);
  });
  it('começa desligado (modo arquivo nunca liga)', () => {
    expect(isAppLocked()).toBe(false);
  });
});

describe('applyInertToBody', () => {
  const el = (id: string, tagName = 'DIV'): InertTarget => ({ id, tagName, inert: false });
  it('deixa a raiz e scripts de fora e marca o resto; ao liberar tira só o que marcou', () => {
    const root = el('root'); const menu = el('menu'); const script = el('s', 'SCRIPT');
    const already = { ...el('x'), inert: true };
    const body = { children: [root, menu, script, already] };
    applyInertToBody(body, true);
    expect([root.inert, menu.inert, script.inert, already.inert]).toEqual([false, true, false, true]);
    applyInertToBody(body, false);
    expect([menu.inert, already.inert]).toEqual([false, true]);
  });
});
