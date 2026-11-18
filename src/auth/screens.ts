// Escolha de tela por estado do acesso (docs/NUVEM-UX.md seções 1 a 4 e 6.3). Puro: o `CloudRoot` só desenha o resultado.
import type { ImportState } from './membership';

export type AuthRoute = 'app' | 'convite' | 'nova-senha';

export interface AuthUrlInfo {
  route: AuthRoute;
  /** O link do e-mail veio com erro (vencido, já usado). */
  linkError: boolean;
}

/** Lê o caminho e o hash da URL de abertura (`/convite`, `/nova-senha`; erro do Supabase em `#error=...`). */
export function parseAuthUrl(pathname: string, hash: string, search = ''): AuthUrlInfo {
  const clean = pathname.replace(/\/+$/, '').toLowerCase();
  const route: AuthRoute = clean.endsWith('/convite') ? 'convite' : clean.endsWith('/nova-senha') ? 'nova-senha' : 'app';
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const linkError = params.has('error') || params.has('error_code') || q.has('error') || q.has('error_code');
  return { route, linkError };
}

export type MembershipState = 'unknown' | 'active' | 'none';

export interface ScreenInput {
  configured: boolean;
  /** Lendo a sessão guardada ou a membership. */
  loading: boolean;
  route: AuthRoute;
  linkError: boolean;
  hasSession: boolean;
  membership: MembershipState;
  /** Falta o código de verificação em 2 etapas do Dono. */
  mfaPending: boolean;
  /** PC compartilhado autorizado e não revogado. */
  sharedDevice: boolean;
  /** Aparelho compartilhado "fechado" (ao abrir, bloqueio por inatividade, "Trocar de pessoa"). */
  gateClosed: boolean;
  /** `workshops.import_state`: enquanto não for `concluido`, o app não abre (docs/NUVEM-PR9.md). */
  importState: ImportState;
  /** Papel da pessoa: só o Dono vê a tela de importar. */
  role: string | null;
}

export type ScreenKind =
  | 'notConfigured' | 'loading' | 'inviteLinkError' | 'invite' | 'resetLinkError' | 'resetPassword' | 'mfa'
  | 'deactivated' | 'who' | 'lockedApp' | 'login' | 'importar' | 'preparando' | 'app';

export function pickScreen(i: ScreenInput): ScreenKind {
  if (!i.configured) return 'notConfigured';
  if (i.loading) return 'loading';
  if (i.route === 'convite') return i.linkError || !i.hasSession ? 'inviteLinkError' : 'invite';
  if (i.route === 'nova-senha') return i.linkError || !i.hasSession ? 'resetLinkError' : 'resetPassword';
  if (i.hasSession && i.membership === 'unknown') return 'loading';
  if (i.hasSession && i.mfaPending) return 'mfa';
  if (i.hasSession && i.membership === 'none') return 'deactivated';
  if (i.sharedDevice) {
    if (!i.hasSession) return 'who';
    return i.gateClosed ? 'lockedApp' : appOrImport(i);
  }
  return i.hasSession ? appOrImport(i) : 'login';
}

/** Com a importação pendente o app não monta: o Dono vê `importar`, os outros `preparando`. */
const appOrImport = (i: ScreenInput): ScreenKind =>
  i.importState === 'concluido' ? 'app' : i.role === 'dono' ? 'importar' : 'preparando';

/**
 * Erro do Auth para usuário banido (a pessoa foi desativada pelo Dono). Medido no projeto de teste: o refresh devolve 400 com
 * `error_code: "user_banned"` e mensagem "Invalid Refresh Token: User Banned".
 */
export const isBannedError = (e: { code?: string; message?: string } | null | undefined): boolean =>
  !!e && (e.code === 'user_banned' || /user[ _]banned/i.test(e.message ?? ''));

/** Tela "Sem acesso" (6.3): qual dos três casos. */
export type AccessCase = 'deactivated' | 'reauth' | 'roleChanged';

export interface AccessProbe {
  /** A sessão ainda se renova (refresh funcionou). */
  sessionValid: boolean;
  /** O refresh foi recusado porque a pessoa foi banida (desativada pelo Dono): não é "entre de novo". */
  userBanned?: boolean;
  /** Linha própria de `memberships` lida com a sessão; `null` = não existe ou RLS negou. */
  membership: { active: boolean; role: string } | null;
  currentRole: string;
}

/** Distingue "pessoa desativada" de "precisa entrar de novo" e de "papel mudou" a partir do que o servidor responde. */
export function classifyAccess(p: AccessProbe): AccessCase | 'ok' {
  if (!p.sessionValid) return p.userBanned ? 'deactivated' : 'reauth';
  if (!p.membership || !p.membership.active) return 'deactivated';
  if (p.membership.role !== p.currentRole) return 'roleChanged';
  return 'ok';
}
