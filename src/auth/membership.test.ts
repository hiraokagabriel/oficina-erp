import { describe, expect, it } from 'vitest';
import { pickActiveMembership } from './membership';

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
