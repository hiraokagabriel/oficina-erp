// Bloqueio por inatividade (docs/NUVEM-UX.md 4.3). Lógica pura do relógio; o componente `IdleLock` só liga os eventos.

export type IdleMinutes = 5 | 15 | 30 | null;
export const IDLE_OPTIONS: readonly IdleMinutes[] = [5, 15, 30, null];
export const DEFAULT_IDLE_MINUTES: IdleMinutes = 15;
/** Aviso 60 s antes de bloquear. */
export const IDLE_WARNING_SECONDS = 60;

export type IdleState =
  | { kind: 'active' }
  | { kind: 'warning'; secondsLeft: number }
  | { kind: 'locked' };

export function computeIdle(lastActivityMs: number, nowMs: number, minutes: IdleMinutes): IdleState {
  if (minutes === null) return { kind: 'active' };
  const limit = minutes * 60_000;
  const idle = Math.max(0, nowMs - lastActivityMs);
  if (idle >= limit) return { kind: 'locked' };
  const left = limit - idle;
  if (left <= IDLE_WARNING_SECONDS * 1000) return { kind: 'warning', secondsLeft: Math.ceil(left / 1000) };
  return { kind: 'active' };
}

export const idleWarningText = (minutes: Exclude<IdleMinutes, null>): string =>
  `Sem uso há ${minutes * 60 - IDLE_WARNING_SECONDS >= 60 ? `${minutes - 1} minutos` : 'um tempo'}. Este computador vai bloquear em`;

/** Lê o valor guardado (aceita só 5, 15, 30 ou "nunca"). */
export function parseIdleMinutes(raw: unknown): IdleMinutes {
  return raw === 5 || raw === 15 || raw === 30 ? raw : raw === null ? null : DEFAULT_IDLE_MINUTES;
}
