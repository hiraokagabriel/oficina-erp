import { describe, expect, it } from 'vitest';
import { effectiveOnline, probeReach } from './reach';

describe('probeReach', () => {
  it('resposta HTTP, mesmo 503, conta como alcançado', async () => {
    const f = (async () => new Response('x', { status: 503 })) as typeof fetch;
    expect(await probeReach('https://x.test/', 'k', f)).toBe(true);
  });
  it('falha de rede = não alcançado', async () => {
    const f = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
    expect(await probeReach('https://x.test', 'k', f)).toBe(false);
  });
  it('estourou o tempo = não alcançado', async () => {
    const f = ((_u: unknown, init?: RequestInit) => new Promise((_res, rej) => {
      init?.signal?.addEventListener('abort', () => rej(new DOMException('abort', 'AbortError')));
    })) as typeof fetch;
    expect(await probeReach('https://x.test', 'k', f, 20)).toBe(false);
  });
  it('chama /auth/v1/health com a chave publicável', async () => {
    let url = ''; let key = '';
    const f = (async (u: string, init?: RequestInit) => { url = u; key = (init?.headers as Record<string, string>).apikey; return new Response('{}'); }) as unknown as typeof fetch;
    await probeReach('https://x.test/', 'pub', f);
    expect(url).toBe('https://x.test/auth/v1/health');
    expect(key).toBe('pub');
  });
  it('effectiveOnline exige as duas coisas', () => {
    expect(effectiveOnline(true, true)).toBe(true);
    expect(effectiveOnline(true, false)).toBe(false);
    expect(effectiveOnline(false, true)).toBe(false);
  });
});
