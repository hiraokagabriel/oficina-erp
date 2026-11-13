import { describe, expect, it } from 'vitest';
import { AuthApiError, createApi } from './api';

interface Seen { url: string; headers: Record<string, string>; body: Record<string, unknown> }

function fakeFetch(status: number, payload: unknown, seen: Seen[]): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    seen.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) as Record<string, unknown> });
    return new Response(JSON.stringify(payload), { status });
  }) as unknown as typeof fetch;
}

const mk = (status: number, payload: unknown, token: string | null = 'JWT') => {
  const seen: Seen[] = [];
  const api = createApi({ baseUrl: 'https://x.supabase.co', anonKey: 'ANON-KEY-123', getToken: async () => token, fetchFn: fakeFetch(status, payload, seen) });
  return { api, seen };
};

describe('api das funções', () => {
  it('autenticado: apikey, Bearer, corpo com action', async () => {
    const { api, seen } = mk(200, { ok: true, userId: 'u1' });
    await expect(api.users.invite({ email: 'a@b.co', role: 'recepcao', displayName: 'Ana' })).resolves.toMatchObject({ userId: 'u1' });
    expect(seen[0].url).toBe('https://x.supabase.co/functions/v1/users');
    expect(seen[0].headers).toMatchObject({ apikey: 'ANON-KEY-123', Authorization: 'Bearer JWT' });
    expect(seen[0].body).toEqual({ action: 'invite', email: 'a@b.co', role: 'recepcao', displayName: 'Ana' });
  });
  it('roster e unlock vão sem Bearer', async () => {
    const { api, seen } = mk(200, { ok: true, people: [] });
    await api.pin.roster('d1', 's1');
    expect(seen[0].headers.Authorization).toBeUndefined();
    expect(seen[0].body).toEqual({ action: 'roster', deviceId: 'd1', secret: 's1' });
  });
  it('erro do servidor vira AuthApiError com código, mensagem e extras', async () => {
    const { api } = mk(401, { ok: false, error: 'pin_incorreto', message: 'PIN incorreto.', restantes: 3 });
    const e = await api.pin.verify('135790').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AuthApiError);
    const err = e as AuthApiError;
    expect([err.status, err.error, err.message, err.restantes]).toEqual([401, 'pin_incorreto', 'PIN incorreto.', 3]);
  });
  it('sem token: nao_autenticado sem chamar a rede; sem rede: sem_internet', async () => {
    const { api, seen } = mk(200, { ok: true }, null);
    await expect(api.pin.set('135790')).rejects.toMatchObject({ error: 'nao_autenticado' });
    expect(seen).toHaveLength(0);
    const off = createApi({ baseUrl: 'u', anonKey: 'k', getToken: async () => 'T', fetchFn: (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch });
    await expect(off.device.revoke('d')).rejects.toMatchObject({ error: 'sem_internet', status: 0 });
  });
  it('corpo que não é JSON vira erro genérico', async () => {
    const api = createApi({ baseUrl: 'u', anonKey: 'k', getToken: async () => 'T', fetchFn: (async () => new Response('oops', { status: 502 })) as unknown as typeof fetch });
    await expect(api.device.setIdle('d', 15)).rejects.toMatchObject({ status: 502, error: 'erro_interno' });
  });
});
