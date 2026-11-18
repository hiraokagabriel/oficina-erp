import { describe, expect, it } from 'vitest';
import { firstPullMessage, firstPullOutcome, needsFirstPull } from './firstPull';

describe('needsFirstPull', () => {
  it('cache sem nenhum pull concluído (primeira abertura neste aparelho): precisa esperar', () => {
    expect(needsFirstPull(null)).toBe(true);
  });
  it('cache que já puxou alguma vez: abre na hora', () => {
    expect(needsFirstPull('2026-11-01T12:00:00.000Z')).toBe(false);
  });
});

describe('firstPullOutcome', () => {
  const base = { hasPulled: false, online: true, lastError: null as string | null };
  it('pull concluído: ok', () => {
    expect(firstPullOutcome({ ...base, hasPulled: true })).toBe('ok');
  });
  it('sem pull e sem internet: offline', () => {
    expect(firstPullOutcome({ ...base, online: false })).toBe('offline');
  });
  it('sem pull, online, com erro de rede/servidor: erro', () => {
    expect(firstPullOutcome({ ...base, lastError: 'Failed to fetch' })).toBe('erro');
  });
  it('sem pull e sem erro nem offline (rodada que não rodou): erro, nunca "ok"', () => {
    expect(firstPullOutcome(base)).toBe('erro');
  });
  it('sem acesso: deixa as telas de acesso do app assumirem', () => {
    expect(firstPullOutcome({ ...base, lastError: 'sem_acesso' })).toBe('ok');
  });
  it('pull concluído vence um erro de envio antigo', () => {
    expect(firstPullOutcome({ ...base, hasPulled: true, lastError: 'x' })).toBe('ok');
  });
});

describe('firstPullMessage', () => {
  it('offline e erro têm textos simples e distintos', () => {
    expect(firstPullMessage('offline')).toMatch(/internet/i);
    expect(firstPullMessage('erro')).toMatch(/Tentar de novo|tentar de novo/);
    expect(firstPullMessage('offline')).not.toBe(firstPullMessage('erro'));
  });
});
