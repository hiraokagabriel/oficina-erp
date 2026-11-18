import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchMembership, parseWorkshopRow, pickActiveMembership, resolveWorkshop, toImportState } from './membership';
import type { MembershipInfo } from './membership';

const row = (o: Partial<{ workshop_id: string; role: string; active: boolean; invited_at: string }>) =>
  ({ workshop_id: 'w1', role: 'recepcao', display_name: 'Ana', active: true, invited_at: '2026-01-02', ...o });

describe('pickActiveMembership', () => {
  it('ignora inativas e papéis desconhecidos; pega a mais antiga', () => {
    expect(pickActiveMembership([])).toBeNull();
    expect(pickActiveMembership([row({ active: false })])).toBeNull();
    expect(pickActiveMembership([row({ role: 'chefe' })])).toBeNull();
    const r = pickActiveMembership([row({ workshop_id: 'novo', invited_at: '2026-03-01' }), row({ workshop_id: 'velho', invited_at: '2026-01-01' })]);
    expect(r?.workshop_id).toBe('velho');
  });
});

describe('parseWorkshopRow / toImportState', () => {
  it('lê nome, estado da importação e última cópia', () => {
    expect(parseWorkshopRow({ name: 'Auto X', import_state: 'importando', last_export_at: '2026-11-17T10:00:00Z' }))
      .toEqual({ name: 'Auto X', importState: 'importando', lastExportAt: '2026-11-17T10:00:00Z' });
    expect(parseWorkshopRow({ name: 'A', import_state: 'vazio', last_export_at: null })?.importState).toBe('vazio');
  });
  it('M2: leitura falha ou estado inválido NÃO vira concluido (fail-closed)', () => {
    expect(parseWorkshopRow(null)).toBeNull();
    expect(parseWorkshopRow(undefined)).toBeNull();
    expect(parseWorkshopRow({ name: 'A' })).toBeNull();
    expect(parseWorkshopRow({ name: 'A', import_state: 'x' })).toBeNull();
  });
  it('cache antigo sem importState vale concluido (já abria antes)', () => {
    expect(toImportState(undefined)).toBe('concluido');
    expect(toImportState('vazio')).toBe('vazio');
    expect(toImportState('concluido')).toBe('concluido');
  });
});

describe('resolveWorkshop', () => {
  const prev: MembershipInfo = {
    workshopId: 'w1', workshopName: 'Auto X', role: 'dono', displayName: '', importState: 'importando', lastExportAt: null,
  };
  const read = { name: 'Novo', importState: 'concluido' as const, lastExportAt: null };
  it('leitura boa vale', () => { expect(resolveWorkshop('w1', read, prev)).toEqual(read); });
  it('leitura ruim mantém o estado anterior da mesma oficina', () => {
    expect(resolveWorkshop('w1', null, prev)).toEqual({ name: 'Auto X', importState: 'importando', lastExportAt: null });
  });
  it('leitura ruim sem anterior (ou de outra oficina): null = sem conexão', () => {
    expect(resolveWorkshop('w1', null, null)).toBeNull();
    expect(resolveWorkshop('w2', null, prev)).toBeNull();
  });
});

describe('fetchMembership: falha ao ler workshops', () => {
  const sbWith = (workshops: { data: unknown; error: unknown }) => ({
    from: (t: string) => {
      const res = t === 'memberships'
        ? { data: [{ workshop_id: 'w1', role: 'dono', display_name: 'Ana', active: true, invited_at: '2026-01-01' }], error: null }
        : workshops;
      const q = { select: () => q, eq: () => q, maybeSingle: async () => res, then: (f: (v: unknown) => unknown) => Promise.resolve(res).then(f) };
      return q;
    },
  }) as unknown as SupabaseClient;
  const prev: MembershipInfo = {
    workshopId: 'w1', workshopName: 'Auto X', role: 'dono', displayName: 'Ana', importState: 'importando', lastExportAt: null,
  };

  it('sem anterior: unreachable (não concluido)', async () => {
    expect(await fetchMembership(sbWith({ data: null, error: { message: 'rede' } }), 'u')).toEqual({ kind: 'unreachable' });
    expect(await fetchMembership(sbWith({ data: null, error: null }), 'u')).toEqual({ kind: 'unreachable' });
  });
  it('com anterior: mantém o importState anterior', async () => {
    const r = await fetchMembership(sbWith({ data: null, error: { message: 'rede' } }), 'u', prev);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.membership.importState).toBe('importando');
  });
  it('leitura boa traz o estado do servidor', async () => {
    const r = await fetchMembership(sbWith({ data: { name: 'Auto X', import_state: 'concluido', last_export_at: null }, error: null }), 'u', prev);
    if (r.kind === 'ok') expect(r.membership.importState).toBe('concluido');
    else throw new Error('esperava ok');
  });
});
