import { describe, expect, it } from 'vitest';
import { computeIdle, idleWarningText, parseIdleMinutes } from './idle';

const MIN = 60_000;

describe('idle', () => {
  it('ativo, aviso e bloqueado', () => {
    expect(computeIdle(0, 10 * MIN, 15)).toEqual({ kind: 'active' });
    expect(computeIdle(0, 14 * MIN, 15)).toEqual({ kind: 'warning', secondsLeft: 60 });
    expect(computeIdle(0, 14 * MIN + 30_000, 15)).toEqual({ kind: 'warning', secondsLeft: 30 });
    expect(computeIdle(0, 15 * MIN, 15)).toEqual({ kind: 'locked' });
    expect(computeIdle(0, 99 * MIN, 5)).toEqual({ kind: 'locked' });
  });
  it('nunca não avisa nem bloqueia', () => {
    expect(computeIdle(0, 10_000 * MIN, null)).toEqual({ kind: 'active' });
  });
  it('relógio que volta atrás não bloqueia', () => {
    expect(computeIdle(1000 * MIN, 0, 5)).toEqual({ kind: 'active' });
  });
  it('texto do aviso e leitura do valor guardado', () => {
    expect(idleWarningText(15)).toContain('14 minutos');
    expect(parseIdleMinutes(30)).toBe(30);
    expect(parseIdleMinutes(null)).toBeNull();
    expect(parseIdleMinutes(7)).toBe(15);
    expect(parseIdleMinutes(undefined)).toBe(15);
  });
});
