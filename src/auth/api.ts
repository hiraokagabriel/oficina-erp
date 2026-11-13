import type { Role } from '../services/permissions';
import type { DeviceKind, RosterPerson } from './deviceStore';
import type { IdleMinutes } from './idle';

// Chamadas tipadas às Edge Functions `users`, `pin` e `device` (contrato em `src/server/*`).
// POST `{SUPABASE_URL}/functions/v1/<nome>`, cabeçalho `apikey` (chave publicável), `Authorization: Bearer <jwt>` quando
// autenticado, corpo `{action, ...}`. Resposta `{ok:true,...}` ou `{ok:false,error,message,...}`.
// Uso pelos outros agentes: `import { api } from '../auth/api'` ou, dentro de um componente, `useAuth().api`
// (já com o token da sessão atual).

/** Erro do servidor (ou de rede, com `error: 'sem_internet'`). `message` já está em pt-BR e pode ir para a tela. */
export class AuthApiError extends Error {
  constructor(
    readonly status: number,
    /** Código estável: `pin_incorreto`, `pin_bloqueado`, `aparelho_suspenso`, `aparelho_invalido`, `ultimo_dono`, `ja_membro`... */
    readonly error: string,
    message: string,
    /** Campos extras da resposta (ex.: `restantes` em `pin_incorreto`). */
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
  get restantes(): number | undefined {
    return typeof this.extra.restantes === 'number' ? this.extra.restantes : undefined;
  }
}

export const NO_INTERNET_MESSAGE = 'Sem internet. Conecte o aparelho e tente de novo.';
export const isAuthApiError = (e: unknown): e is AuthApiError => e instanceof AuthApiError;

/** Pessoa da lista da Config (`users.list`). `acceptedAt` nulo = o convite ainda não foi aceito. */
export interface PersonRow {
  userId: string;
  displayName: string | null;
  email: string | null;
  role: Role;
  active: boolean;
  invitedAt: string;
  acceptedAt: string | null;
  pinLocked: boolean;
}

export interface ApiDeps {
  baseUrl: string;
  anonKey: string;
  /** JWT da sessão atual, ou `null` (funções `pin.roster`/`pin.unlock` não usam). */
  getToken: () => Promise<string | null>;
  fetchFn?: typeof fetch;
  /** Chamado quando uma chamada falha por rede (a tela confere de verdade se o servidor responde). */
  onNetworkError?: () => void;
}

type Json = Record<string, unknown>;

export function createApi(deps: ApiDeps) {
  const doFetch: typeof fetch = deps.fetchFn ?? ((...a) => fetch(...a));

  async function call<T extends Json>(name: 'users' | 'pin' | 'device', body: Json, authed: boolean): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: deps.anonKey };
    if (authed) {
      const t = await deps.getToken();
      if (!t) throw new AuthApiError(401, 'nao_autenticado', 'Entre novamente.');
      headers.Authorization = `Bearer ${t}`;
    }
    let res: Response;
    try {
      res = await doFetch(`${deps.baseUrl}/functions/v1/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
    } catch {
      deps.onNetworkError?.();
      throw new AuthApiError(0, 'sem_internet', NO_INTERNET_MESSAGE);
    }
    let data: Json | null = null;
    try { data = (await res.json()) as Json; } catch { /* corpo não JSON */ }
    if (data && data.ok === true) return data as T;
    const { ok: _ok, error, message, ...extra } = data ?? {};
    void _ok;
    throw new AuthApiError(
      res.status,
      typeof error === 'string' ? error : 'erro_interno',
      typeof message === 'string' ? message : 'Não foi possível concluir agora. Tente de novo em instantes.',
      extra,
    );
  }

  return {
    users: {
      list: () => call<{ ok: true; people: PersonRow[] }>('users', { action: 'list' }, true),
      resendInvite: (userId: string) => call<{ ok: true; userId: string; email: string }>('users', { action: 'resend_invite', userId }, true),
      unlockPin: (userId: string) => call<{ ok: true; userId: string }>('users', { action: 'unlock_pin', userId }, true),
      invite: (a: { email: string; role: Role; displayName: string }) => call<{ ok: true; userId: string }>('users', { action: 'invite', ...a }, true),
      deactivate: (userId: string) => call<{ ok: true; userId: string; role: Role; active: boolean }>('users', { action: 'deactivate', userId }, true),
      reactivate: (userId: string) => call<{ ok: true; userId: string; role: Role; active: boolean }>('users', { action: 'reactivate', userId }, true),
      setRole: (userId: string, role: Role) => call<{ ok: true; userId: string; role: Role; active: boolean }>('users', { action: 'set_role', userId, role }, true),
    },
    pin: {
      /** Define ou troca o PIN da pessoa logada. */
      set: (pin: string) => call<{ ok: true }>('pin', { action: 'set', pin }, true),
      /** Confere o PIN da pessoa logada (desbloqueio da própria pessoa). */
      verify: (pin: string) => call<{ ok: true }>('pin', { action: 'verify', pin }, true),
      /** Cartões do "Quem está usando" (só aparelho compartilhado autorizado). */
      roster: (deviceId: string, secret: string) => call<{ ok: true; people: RosterPerson[] }>('pin', { action: 'roster', deviceId, secret }, false),
      /** Confere o PIN de qualquer pessoa do cartão; devolve `tokenHash` para `verifyOtp({type:'magiclink', token_hash})`. */
      unlock: (deviceId: string, secret: string, userId: string, pin: string) =>
        call<{ ok: true; tokenHash: string; type: 'magiclink' }>('pin', { action: 'unlock', deviceId, secret, userId, pin }, false),
    },
    device: {
      register: (a: { name: string; kind: DeviceKind }) => call<{ ok: true; deviceId: string; deviceSecret: string }>('device', { action: 'register', ...a }, true),
      revoke: (deviceId: string) => call<{ ok: true }>('device', { action: 'revoke', deviceId }, true),
      setIdle: (deviceId: string, minutes: IdleMinutes) => call<{ ok: true }>('device', { action: 'set_idle', deviceId, minutes }, true),
    },
  };
}

export type AuthApi = ReturnType<typeof createApi>;
