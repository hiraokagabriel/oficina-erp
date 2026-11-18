import type { SupabaseClient } from '@supabase/supabase-js';
import type { Role } from '../services/permissions';

// Leitura da `memberships` ATIVA da própria pessoa (a RLS deixa ler a própria linha) e do nome da oficina.
// O resultado fica em cache no aparelho para abrir o app sem internet.

/** Estado da importação do banco antigo (`workshops.import_state`). Só `concluido` abre o app. */
export type ImportState = 'vazio' | 'importando' | 'concluido';

export interface MembershipInfo {
  workshopId: string;
  workshopName: string;
  role: Role;
  displayName: string;
  importState: ImportState;
  /** `workshops.last_export_at` (ISO) ou null: última cópia diária feita pelo app do Dono. */
  lastExportAt: string | null;
}

export type MembershipResult =
  | { kind: 'ok'; membership: MembershipInfo }
  | { kind: 'none' }
  | { kind: 'unreachable' };

interface Row { workshop_id: string; role: string; display_name: string | null; active: boolean; invited_at: string }

const isRole = (r: string): r is Role => r === 'dono' || r === 'recepcao' || r === 'mecanico';

const isImportState = (v: unknown): v is ImportState => v === 'vazio' || v === 'importando' || v === 'concluido';

/**
 * Estado do CACHE local. Cache antigo, gravado por uma versão do app sem `importState`, vem de uma oficina que já abria
 * normalmente, então ausente vira `concluido` (escolha documentada: não trancar quem já usava). Só vale para o cache;
 * a leitura do servidor NUNCA cai aqui (ver `parseWorkshopRow`).
 */
export function toImportState(v: unknown): ImportState {
  return isImportState(v) ? v : 'concluido';
}

interface WorkshopInfo { name: string; importState: ImportState; lastExportAt: string | null }

/**
 * Lê `name`, `import_state` e `last_export_at` da linha de `workshops` vinda do servidor. Puro (testado).
 * Linha ausente ou `import_state` inválido = `null`: leitura falha não pode virar `concluido` (fail-open abriria o app
 * antes da importação).
 */
export function parseWorkshopRow(data: unknown): WorkshopInfo | null {
  if (typeof data !== 'object' || data === null) return null;
  const o = data as Record<string, unknown>;
  if (!isImportState(o.import_state)) return null;
  return {
    name: typeof o.name === 'string' && o.name !== '' ? o.name : 'Oficina',
    importState: o.import_state,
    lastExportAt: typeof o.last_export_at === 'string' && o.last_export_at !== '' ? o.last_export_at : null,
  };
}

/**
 * Junta a leitura de `workshops` com o que já se sabia (membership em memória ou cache da MESMA oficina).
 * Leitura ruim: mantém o estado anterior; sem anterior, `null` (= sem conexão). Puro (testado).
 */
export function resolveWorkshop(workshopId: string, read: WorkshopInfo | null, previous: MembershipInfo | null): WorkshopInfo | null {
  if (read) return read;
  if (previous && previous.workshopId === workshopId) {
    return { name: previous.workshopName, importState: previous.importState, lastExportAt: previous.lastExportAt };
  }
  return null;
}

/** Escolhe a membership ativa mais antiga. Puro (testado). */
export function pickActiveMembership(rows: readonly Row[]): Row | null {
  const ok = rows.filter(r => r.active && isRole(r.role)).sort((a, b) => a.invited_at.localeCompare(b.invited_at));
  return ok[0] ?? null;
}

export async function fetchMembership(sb: SupabaseClient, userId: string, previous: MembershipInfo | null = null): Promise<MembershipResult> {
  const { data, error } = await sb.from('memberships').select('workshop_id, role, display_name, active, invited_at').eq('user_id', userId);
  if (error) return { kind: 'unreachable' };
  const row = pickActiveMembership((data ?? []) as Row[]);
  if (!row) return { kind: 'none' };
  const w = await sb.from('workshops').select('name, import_state, last_export_at').eq('id', row.workshop_id).maybeSingle();
  const ws = resolveWorkshop(row.workshop_id, w.error ? null : parseWorkshopRow(w.data), previous);
  if (!ws) return { kind: 'unreachable' };
  return {
    kind: 'ok',
    membership: {
      workshopId: row.workshop_id, workshopName: ws.name, role: row.role as Role, displayName: row.display_name ?? '',
      importState: ws.importState, lastExportAt: ws.lastExportAt,
    },
  };
}

const KEY = 'oficina.membership.';
export function readCachedMembership(userId: string): MembershipInfo | null {
  try {
    const raw = localStorage.getItem(KEY + userId);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<MembershipInfo>;
    if (typeof o.workshopId === 'string' && typeof o.role === 'string' && isRole(o.role)) {
      return {
        workshopId: o.workshopId, workshopName: o.workshopName ?? 'Oficina', role: o.role, displayName: o.displayName ?? '',
        importState: toImportState(o.importState), lastExportAt: typeof o.lastExportAt === 'string' ? o.lastExportAt : null,
      };
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
