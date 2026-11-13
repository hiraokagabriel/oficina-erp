// Textos e validações das telas de acesso (docs/NUVEM-UX.md 1.1 a 2). Puro.

export const MIN_PASSWORD = 8;

export const MSG = {
  emailEmpty: 'Digite seu e-mail.',
  emailBad: 'Este e-mail parece incompleto. Exemplo: nome@gmail.com',
  passwordEmpty: 'Digite sua senha.',
  badCredentials: 'E-mail ou senha não conferem. Confira e tente de novo.',
  deactivated: 'Este acesso foi desativado. Fale com o Dono da oficina.',
  inviteNotAccepted: 'Você ainda não criou sua senha. Abra o e-mail do convite e toque em "Aceitar convite".',
  rateLimit: 'Muitas tentativas seguidas. Espere 1 minuto e tente de novo.',
  offlineSignIn: 'Sem internet. Para entrar neste aparelho é preciso estar com internet.',
  offlineForgot: 'Sem internet. Conecte o aparelho para pedir o link.',
  offlineGeneric: 'Sem internet. Conecte o aparelho e tente de novo.',
  offlineFinish: 'Sem internet. Conecte o aparelho para concluir.',
  unknownSignIn: 'Não foi possível entrar agora. Tente de novo em instantes.',
  forgotRate: 'Já mandamos um link há pouco. Espere 1 minuto para pedir outro.',
  passwordShort: 'A senha precisa ter pelo menos 8 caracteres.',
  passwordMismatch: 'As duas senhas estão diferentes. Digite de novo.',
  pinMismatch: 'Os dois PINs estão diferentes. Digite de novo.',
  mfaWrong: 'Código errado ou vencido. Use o código que está aparecendo agora.',
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FieldCheck = { field: 'email' | 'password'; message: string } | null;

export function validateEmail(email: string): string | null {
  const e = email.trim();
  if (!e) return MSG.emailEmpty;
  if (!EMAIL_RE.test(e)) return MSG.emailBad;
  return null;
}

export function validateSignIn(email: string, password: string): FieldCheck {
  const e = validateEmail(email);
  if (e) return { field: 'email', message: e };
  if (!password) return { field: 'password', message: MSG.passwordEmpty };
  return null;
}

export function validateNewPassword(password: string, repeat: string): string | null {
  if (password.length < MIN_PASSWORD) return MSG.passwordShort;
  if (password !== repeat) return MSG.passwordMismatch;
  return null;
}

/** Forma mínima de um erro do supabase-js (`AuthError`) ou do `fetch`. */
export interface AuthErrorLike { code?: string; status?: number; message?: string; name?: string }

const isNetwork = (e: AuthErrorLike): boolean =>
  e.name === 'AuthRetryableFetchError' || e.status === 0 || /failed to fetch|networkerror|load failed/i.test(e.message ?? '');

export type SignInErrorKind = 'credentials' | 'deactivated' | 'invite' | 'rate' | 'offline' | 'unknown';

export function classifySignInError(e: AuthErrorLike, online: boolean): { kind: SignInErrorKind; message: string } {
  if (!online || isNetwork(e)) return { kind: 'offline', message: MSG.offlineSignIn };
  if (e.code === 'user_banned') return { kind: 'deactivated', message: MSG.deactivated };
  if (e.code === 'email_not_confirmed') return { kind: 'invite', message: MSG.inviteNotAccepted };
  if (e.status === 429 || e.code === 'over_request_rate_limit' || e.code === 'over_email_send_rate_limit') return { kind: 'rate', message: MSG.rateLimit };
  if (e.code === 'invalid_credentials' || e.status === 400) return { kind: 'credentials', message: MSG.badCredentials };
  return { kind: 'unknown', message: MSG.unknownSignIn };
}

export function classifyForgotError(e: AuthErrorLike, online: boolean): string {
  if (!online || isNetwork(e)) return MSG.offlineForgot;
  if (e.status === 429 || e.code === 'over_email_send_rate_limit' || e.code === 'over_request_rate_limit') return MSG.forgotRate;
  return MSG.unknownSignIn;
}

/** Iniciais para o círculo dos cartões ("Ana Maria" -> "AM"; "Ana" -> "AN"). */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const ROLE_LABEL = { dono: 'Dono', recepcao: 'Recepção', mecanico: 'Mecânico' } as const;
export const ROLE_BLURB = {
  dono: 'Vê e faz tudo: preços, custos, margem, Financeiro, Configurações, pessoas e aparelhos.',
  recepcao: 'Abre e edita OS com preços, recebe e parcela pagamentos e vê o que falta receber. Não vê custo nem margem, não apaga lançamentos e não entra em Configurações.',
  mecanico: 'Vê o quadro e as OS sem nenhum valor em R$. Muda o status, faz a vistoria, tira fotos, anota a quilometragem e usa a agenda. Não cria OS.',
} as const;
