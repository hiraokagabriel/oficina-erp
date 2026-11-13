import type { SupabaseClient } from '@supabase/supabase-js';
import type { Role } from '../services/permissions';

// Leitura da `memberships` ATIVA da própria pessoa (a RLS deixa ler a própria linha) e do nome da oficina.
// O resultado fica em cache no aparelho para abrir o app sem internet.

export interface MembershipInfo {
  workshopId: string;
  workshopName: string;
  role: Role;
  displayName: string;
}

export type MembershipResult =
  | { kind: 'ok'; membership: MembershipInfo }
  | { kind: 'none' }
  | { kind: 'unreachable' };

interface Row { workshop_id: string; role: string; display_name: string | null; active: boolean; invited_at: string }

const isRole = (r: string): r is Role => r === 'dono' || r === 'recepcao' || r === 'mecanico';

/** Escolhe a membership ativa mais antiga. Puro (testado). */
export function pickActiveMembership(rows: readonly Row[]): Row | null {
  const ok = rows.filter(r => r.active && isRole(r.role)).sort((a, b) => a.invited_at.localeCompare(b.invited_at));
  return ok[0] ?? null;
}

export async function fetchMembership(sb: SupabaseClient, userId: string): Promise<MembershipResult> {
  const { data, error } = await sb.from('memberships').select('workshop_id, role, display_name, active, invited_at').eq('user_id', userId);
  if (error) return { kind: 'unreachable' };
  const row = pickActiveMembership((data ?? []) as Row[]);
  if (!row) return { kind: 'none' };
  const w = await sb.from('workshops').select('name').eq('id', row.workshop_id).maybeSingle();
  const name = !w.error && w.data && typeof (w.data as { name?: unknown }).name === 'string' ? (w.data as { name: string }).name : 'Oficina';
  return { kind: 'ok', membership: { workshopId: row.workshop_id, workshopName: name, role: row.role as Role, displayName: row.display_name ?? '' } };
}

const KEY = 'oficina.membership.';
export function readCachedMembership(userId: string): MembershipInfo | null {
  try {
    const raw = localStorage.getItem(KEY + userId);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<MembershipInfo>;
    if (typeof o.workshopId === 'string' && typeof o.role === 'string' && isRole(o.role)) {
      return { workshopId: o.workshopId, workshopName: o.workshopName ?? 'Oficina', role: o.role, displayName: o.displayName ?? '' };
    }
  } catch { /* cache ilegível: ignora */ }
  return null;
}
export function writeCachedMembership(userId: string, m: MembershipInfo): void {
  try { localStorage.setItem(KEY + userId, JSON.stringify(m)); } catch { /* sem armazenamento */ }
}
export function clearCachedMembership(userId: string): void {
  try { localStorage.removeItem(KEY + userId); } catch { /* idem */ }
}
