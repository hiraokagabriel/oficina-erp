import type { Role } from '../services/permissions';
import { ROLES } from '../services/permissions';

// Lista de pessoas da Config (docs/NUVEM-UX.md 5.1). Puro: leitura das linhas de `memberships`, ordem, textos.
// A lista vem da função `users.list` (e-mail e convite aceito vêm do Auth; PIN bloqueado vem do servidor).

export const ROLE_LABEL: Record<Role, string> = { dono: 'Dono', recepcao: 'Recepção', mecanico: 'Mecânico' };

export const ROLE_DESCRIPTION: Record<Role, string> = {
  dono: 'Vê e faz tudo: preços, custos, margem, Financeiro, Configurações, pessoas e aparelhos.',
  recepcao: 'Abre e edita OS com preços, recebe e parcela pagamentos e vê o que falta receber. Não vê custo nem margem, não apaga lançamentos e não entra em Configurações.',
  mecanico: 'Vê o quadro e as OS sem nenhum valor em R$. Muda o status, faz a vistoria, tira fotos, anota a quilometragem e usa a agenda. Não cria OS.',
};

export interface MemberRow {
  userId: string;
  displayName: string;
  role: Role;
  active: boolean;
  invitedAt: string;
  email: string;
  /** Convite ainda não aceito (a pessoa nunca entrou). */
  invitePending: boolean;
  pinLocked: boolean;
}

const isRole = (r: unknown): r is Role => typeof r === 'string' && (ROLES as readonly string[]).includes(r);

/** Lê o resultado cru do Supabase; linha fora do formato é ignorada. */
export function parseMemberRows(raw: unknown): MemberRow[] {
  if (!Array.isArray(raw)) return [];
  const out: MemberRow[] = [];
  for (const r of raw as unknown[]) {
    if (typeof r !== 'object' || r === null) continue;
    const o = r as Record<string, unknown>;
    if (typeof o.user_id !== 'string' || !isRole(o.role)) continue;
    out.push({
      userId: o.user_id,
      displayName: typeof o.display_name === 'string' ? o.display_name.trim() : '',
      role: o.role,
      active: o.active !== false,
      invitedAt: typeof o.invited_at === 'string' ? o.invited_at : '',
      email: '',
      invitePending: false,
      pinLocked: false,
    });
  }
  return out;
}

/** Lê a resposta de `users.list`; linha fora do formato é ignorada. */
export function parsePeople(raw: unknown): MemberRow[] {
  if (!Array.isArray(raw)) return [];
  const out: MemberRow[] = [];
  for (const r of raw as unknown[]) {
    if (typeof r !== 'object' || r === null) continue;
    const o = r as Record<string, unknown>;
    if (typeof o.userId !== 'string' || !isRole(o.role)) continue;
    out.push({
      userId: o.userId,
      displayName: typeof o.displayName === 'string' ? o.displayName.trim() : '',
      role: o.role,
      active: o.active !== false,
      invitedAt: typeof o.invitedAt === 'string' ? o.invitedAt : '',
      email: typeof o.email === 'string' ? o.email : '',
      invitePending: o.acceptedAt === null || o.acceptedAt === undefined,
      pinLocked: o.pinLocked === true,
    });
  }
  return out;
}

export const PIN_LOCKED_TEXT = 'PIN bloqueado por tentativas';
export const inviteSentText = (day: string): string => `Convite enviado em ${day}`;
export const resendToast = (email: string): string => `Convite reenviado para ${email}. Pode cair no Spam.`;

/** Nome para mostrar (sem nome, "Sem nome"). */
export const memberName = (m: Pick<MemberRow, 'displayName'>): string => m.displayName || 'Sem nome';

/** Ativos, depois convites pendentes, depois desativados; em cada grupo, por nome. */
export function sortMembers(rows: readonly MemberRow[]): MemberRow[] {
  const rank = (m: MemberRow): number => (!m.active ? 2 : m.invitePending ? 1 : 0);
  return [...rows].sort((a, b) =>
    rank(a) - rank(b) || memberName(a).localeCompare(memberName(b), 'pt-BR', { sensitivity: 'base' }));
}

/** Duas letras do nome ("Ana Lima" -> "AL"; "Ana" -> "AN"). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return letters.toLocaleUpperCase('pt-BR');
}

/** dd/mm/aaaa no fuso do aparelho; vazio se a data não vale. */
export function formatDay(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Esta pessoa é o único Dono ativo? (o servidor também recusa: `ultimo_dono`). */
export function isOnlyActiveOwner(rows: readonly MemberRow[], userId: string): boolean {
  const owners = rows.filter(r => r.role === 'dono' && r.active);
  return owners.length === 1 && owners[0].userId === userId;
}

export const LAST_OWNER_TEXT = 'É o único Dono. Antes, dê o papel de Dono a outra pessoa.';

export function roleChangeTitle(name: string, to: Role): string {
  return `Mudar o papel de ${name} para ${ROLE_LABEL[to]}?`;
}

export function roleChangeText(name: string, to: Role): string {
  switch (to) {
    case 'mecanico': return `${name} deixa de ver valores em R$, o Financeiro e não cria mais OS. Vale na hora, em todos os aparelhos.`;
    case 'recepcao': return `${name} passa a ver preços e a receber pagamentos, sem custo nem margem. Vale na hora.`;
    case 'dono': return `${name} passa a ver e fazer tudo, inclusive custos, margem, pessoas e aparelhos. Vale na hora.`;
  }
}

export const deactivateTitle = (name: string): string => `Desativar ${name}?`;
export const deactivateText = (name: string): string =>
  `${name} sai do OficinaPro na hora, em todos os aparelhos, e o PIN é apagado. O que já foi feito continua salvo. Você pode reativar depois.`;
export const reactivateTitle = (name: string): string => `Reativar ${name}?`;
export const reactivateText = (name: string): string =>
  `${name} volta a entrar com e-mail e senha e cria um PIN novo no primeiro acesso.`;

export const OFFLINE_ADMIN_NOTE = 'Sem internet: a lista pode estar desatualizada e não dá para convidar nem mudar nada agora.';
/** Fotos presas de uma pessoa: "3 fotos de Ana" (nome da lista de pessoas) ou, sem nome, "3 fotos da pessoa que saiu deste aparelho". */
export function stuckPhotosText(count: number, name?: string | null): string {
  const n = `${count} ${count === 1 ? 'foto' : 'fotos'}`;
  const who = name && name.trim() ? name.trim() : '';
  return who ? `${n} de ${who}` : `${n} da pessoa que saiu deste aparelho`;
}

/** Nome da pessoa pelo `userId` na lista de pessoas (vazio se não achar ou sem nome). */
export function personNameById(rows: readonly Pick<MemberRow, 'userId' | 'displayName'>[], userId: string): string {
  return rows.find(r => r.userId === userId)?.displayName?.trim() ?? '';
}

export const NEEDS_INTERNET = 'Precisa de internet';

/** Erro do servidor (`AuthApiError.error`) em texto simples. `fallback` é a mensagem que o servidor já mandou. */
export function adminErrorMessage(code: string, fallback?: string): string {
  switch (code) {
    case 'ultimo_dono': return LAST_OWNER_TEXT;
    case 'ja_membro': return 'Este e-mail já tem acesso a esta oficina. Se a pessoa está desativada, reative-a na lista.';
    case 'email_ja_cadastrado': return 'Este e-mail já tem cadastro no sistema e não pode ser convidado de novo. Fale com quem configurou o sistema.';
    case 'convite_ja_aceito': return 'Esta pessoa já entrou no sistema. Não precisa de novo convite.';
    case 'pessoa_desativada': return 'Reative a pessoa antes de reenviar o convite.';
    case 'pin_nao_encontrado': return 'Esta pessoa ainda não criou um PIN.';
    case 'convite_falhou': return 'Não foi possível enviar o e-mail do convite agora. Tente de novo em alguns minutos.';
    case 'exige_mfa': return 'Confirme o código do aplicativo autenticador para continuar.';
    case 'auth_indisponivel': return 'O serviço de entrada está fora do ar agora. Tente de novo em alguns minutos.';
    case 'sem_internet': return 'Sem internet. Conecte para continuar.';
    case 'nao_autenticado': return 'Entre de novo para continuar.';
    default: return fallback && fallback.trim() ? fallback : 'Não foi possível concluir agora. Tente de novo em instantes.';
  }
}

export interface InviteDraft { name: string; email: string; role: Role | null }
export interface InviteErrors { name?: string; email?: string; role?: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Erros do formulário de convite; objeto vazio = pode enviar. */
export function validateInvite(d: InviteDraft): InviteErrors {
  const e: InviteErrors = {};
  if (!d.name.trim()) e.name = 'Digite o nome.';
  if (!EMAIL_RE.test(d.email.trim())) e.email = 'Digite um e-mail válido.';
  if (!d.role) e.role = 'Escolha o papel.';
  return e;
}

export const INVITE_NAME_MAX = 30;
