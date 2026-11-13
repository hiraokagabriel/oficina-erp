import type { IdleMinutes } from '../auth/idle';
import { formatDay } from './cloudUsers';

// Lista de aparelhos da Config (docs/NUVEM-UX.md 5.2). Puro. A leitura de `devices` não traz `secret_hash`.
// Decisão 4 do dono: aparelho pessoal não se registra; só PC compartilhado é autorizado.

export interface DeviceRow {
  id: string;
  name: string;
  kind: 'pc_compartilhado' | 'pessoal';
  idleMinutes: IdleMinutes;
  authorizedBy: string | null;
  authorizedAt: string;
  revokedAt: string | null;
}

export const IDLE_CHOICES: readonly { value: IdleMinutes; label: string }[] = [
  { value: 5, label: '5 min' }, { value: 15, label: '15 min' }, { value: 30, label: '30 min' }, { value: null, label: 'Nunca' },
];

export function parseDeviceRows(raw: unknown): DeviceRow[] {
  if (!Array.isArray(raw)) return [];
  const out: DeviceRow[] = [];
  for (const r of raw as unknown[]) {
    if (typeof r !== 'object' || r === null) continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.name !== 'string') continue;
    const m = o.idle_lock_minutes;
    out.push({
      id: o.id, name: o.name, kind: o.kind === 'pessoal' ? 'pessoal' : 'pc_compartilhado',
      idleMinutes: m === 5 || m === 15 || m === 30 ? m : null,
      authorizedBy: typeof o.authorized_by === 'string' ? o.authorized_by : null,
      authorizedAt: typeof o.authorized_at === 'string' ? o.authorized_at : '',
      revokedAt: typeof o.revoked_at === 'string' ? o.revoked_at : null,
    });
  }
  return out;
}

/** Outros aparelhos: ativos primeiro (mais novos antes), revogados no fim. Tira o deste computador. */
export function otherDevices(rows: readonly DeviceRow[], thisId: string | null): DeviceRow[] {
  return rows
    .filter(r => r.id !== thisId)
    .sort((a, b) => Number(!!a.revokedAt) - Number(!!b.revokedAt) || b.authorizedAt.localeCompare(a.authorizedAt));
}

export const idleLabel = (m: IdleMinutes): string => (m === null ? 'sem bloqueio' : `bloqueio ${m} min`);

export const kindLabel = (k: DeviceRow['kind']): string => (k === 'pessoal' ? 'Pessoal' : 'Compartilhado');

/** Texto de uma linha de "Outros aparelhos". */
export function deviceLine(d: DeviceRow): string {
  if (d.revokedAt) return `${kindLabel(d.kind)} · revogado em ${formatDay(d.revokedAt)}`;
  return d.kind === 'pessoal' ? kindLabel(d.kind) : `${kindLabel(d.kind)} · ${idleLabel(d.idleMinutes)}`;
}

/** Toast depois de mudar o tempo de bloqueio. */
export const idleToast = (m: IdleMinutes): string => (m === null ? 'Bloqueio desligado.' : `Bloqueio mudado para ${m} minutos.`);

export const IDLE_NEVER_WARNING =
  'Com "Nunca", o computador fica aberto com a última pessoa. Use só se ele fica num lugar onde clientes não chegam.';

export const revokeTitle = (name: string): string => `Revogar ${name}?`;
export const REVOKE_TEXT =
  'Ninguém mais entra com PIN nesse computador. Quem estiver usando volta para a tela de e-mail e senha. Para usar de novo, será preciso autorizar outra vez nele.';
export const authorizedToast = (name: string): string =>
  `${name} autorizado. A partir de agora, a tela "Quem está usando agora?" aparece aqui.`;

/** "PC da recepção · Compartilhado · autorizado por João em 12/11/2026" (sem "por" quando o nome não é conhecido). */
export function authorizedLine(d: Pick<DeviceRow, 'name' | 'authorizedAt'>, byName: string | null): string {
  const day = formatDay(d.authorizedAt);
  return `${d.name} · Compartilhado${byName || day ? ' · autorizado' : ''}${byName ? ` por ${byName}` : ''}${day ? ` em ${day}` : ''}`;
}
