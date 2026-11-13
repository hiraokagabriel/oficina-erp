// Edge Function `users`: list, invite, resend_invite, deactivate, reactivate, set_role, unlock_pin. Só o Dono.
import {
  HttpError, asRecord, authenticate, guarded, okResult, requireOwner, reqRole, reqString, reqUuid,
  type Caller, type Deps, type HandlerRequest, type HandlerResult, type MembershipAction, type Role,
} from './core'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function invite(deps: Deps, caller: Caller, b: Record<string, unknown>): Promise<HandlerResult> {
  const email = reqString(b, 'email', 3, 254).toLowerCase()
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'dados_invalidos', 'E-mail inválido.')
  const role = reqRole(b)
  const displayName = reqString(b, 'displayName', 1, 80)
  if (!deps.siteUrl) {
    deps.log('error', 'SITE_URL ausente')
    throw new HttpError(500, 'config_ausente', 'O endereço do site não está configurado no servidor.')
  }
  const redirectTo = `${deps.siteUrl.replace(/\/+$/, '')}/convite`

  const existing = await deps.db.userIdByEmail(email)
  if (existing) {
    if (await deps.db.hasMembership(caller.workshopId, existing)) {
      throw new HttpError(409, 'ja_membro', 'Esse e-mail já faz parte da equipe. Se a pessoa está desativada, reative-a na lista.')
    }
    throw new HttpError(409, 'email_ja_cadastrado', 'Esse e-mail já tem cadastro no sistema e não pode ser convidado de novo.')
  }

  const res = await deps.auth.invite(email, redirectTo, displayName)
  if (!res.ok) {
    // o supabase-js esconde o motivo; aqui fica o corpo bruto do GoTrue
    deps.log('error', 'GoTrue recusou o convite', { status: res.status, raw: res.raw })
    if (res.status === 422) {
      throw new HttpError(409, 'email_ja_cadastrado', 'Esse e-mail já tem cadastro no sistema e não pode ser convidado de novo.')
    }
    throw new HttpError(502, 'convite_falhou', 'Não foi possível enviar o e-mail do convite. Confira o envio de e-mails e tente de novo.')
  }
  try {
    await deps.db.insertMembership({ workshopId: caller.workshopId, userId: res.userId, role, displayName })
  } catch (e) {
    deps.log('error', 'membership não gravada; removendo usuário do convite', { error: e instanceof Error ? e.message : String(e) })
    try { await deps.auth.deleteUser(res.userId) } catch { /* já registrado acima */ }
    throw new HttpError(500, 'erro_interno', 'Erro interno. Tente de novo.')
  }
  return okResult({ userId: res.userId })
}

/** Lista da Config: membership + e-mail e "já entrou?" do Auth + PIN bloqueado. */
async function list(deps: Deps, caller: Caller): Promise<HandlerResult> {
  const rows = await deps.db.listMembers(caller.workshopId)
  const locked = new Set(await deps.db.pinLockedUsers(caller.workshopId))
  const people = await Promise.all(rows.map(async (r) => {
    const info = await deps.auth.getUserInfo(r.userId)
    return {
      userId: r.userId,
      displayName: r.displayName,
      email: info?.email ?? null,
      role: r.role,
      active: r.active,
      invitedAt: r.invitedAt,
      // aceitou o convite = confirmou o e-mail ou já entrou; senão nulo (o convite ainda está pendente)
      acceptedAt: info ? (info.emailConfirmedAt ?? info.lastSignInAt) : null,
      pinLocked: locked.has(r.userId),
    }
  }))
  return okResult({ people })
}

async function resendInvite(deps: Deps, caller: Caller, b: Record<string, unknown>): Promise<HandlerResult> {
  const userId = reqUuid(b, 'userId')
  const member = (await deps.db.listMembers(caller.workshopId)).find((m) => m.userId === userId)
  if (!member) throw new HttpError(404, 'pessoa_nao_encontrada', 'Pessoa não encontrada na equipe.')
  if (!member.active) throw new HttpError(409, 'pessoa_desativada', 'Reative a pessoa antes de reenviar o convite.')
  const info = await deps.auth.getUserInfo(userId)
  if (!info?.email) throw new HttpError(404, 'pessoa_nao_encontrada', 'Pessoa não encontrada na equipe.')
  if (info.emailConfirmedAt || info.lastSignInAt) {
    throw new HttpError(409, 'convite_ja_aceito', 'Esta pessoa já entrou no sistema. Não precisa de novo convite.')
  }
  if (!deps.siteUrl) {
    deps.log('error', 'SITE_URL ausente')
    throw new HttpError(500, 'config_ausente', 'O endereço do site não está configurado no servidor.')
  }
  const redirectTo = `${deps.siteUrl.replace(/\/+$/, '')}/convite`
  const res = await deps.auth.invite(info.email, redirectTo, member.displayName || info.email)
  if (!res.ok) {
    deps.log('error', 'GoTrue recusou o reenvio do convite', { status: res.status, raw: res.raw })
    if (res.status === 422) throw new HttpError(409, 'convite_ja_aceito', 'Esta pessoa já entrou no sistema. Não precisa de novo convite.')
    throw new HttpError(502, 'convite_falhou', 'Não foi possível enviar o e-mail do convite. Confira o envio de e-mails e tente de novo.')
  }
  return okResult({ userId, email: info.email })
}

async function unlockPin(deps: Deps, caller: Caller, b: Record<string, unknown>): Promise<HandlerResult> {
  const userId = reqUuid(b, 'userId')
  if (!(await deps.db.pinUnlock(caller.workshopId, userId))) {
    throw new HttpError(404, 'pin_nao_encontrado', 'Esta pessoa ainda não criou um PIN.')
  }
  return okResult({ userId })
}

async function change(
  deps: Deps, caller: Caller, b: Record<string, unknown>, action: MembershipAction, role?: Role,
): Promise<HandlerResult> {
  const userId = reqUuid(b, 'userId')
  const r = await deps.db.membershipApply(caller.workshopId, userId, action, role)
  if (r.status === 'not_found') throw new HttpError(404, 'pessoa_nao_encontrada', 'Pessoa não encontrada na equipe.')
  if (r.status === 'last_owner') {
    throw new HttpError(409, 'ultimo_dono', 'A oficina precisa de pelo menos um Dono ativo. Torne outra pessoa Dono primeiro.')
  }
  if (r.status !== 'ok') throw new HttpError(400, 'dados_invalidos', 'Pedido inválido.')

  // Banimento no Auth: só depois do banco (a RLS já nega na hora). Falha aqui não desfaz a desativação.
  let banOk = true
  if (action === 'deactivate' || action === 'reactivate') {
    try {
      await deps.auth.setBanned(userId, action === 'deactivate')
    } catch (e) {
      banOk = false
      deps.log('error', 'falha ao (des)banir no Auth', { userId, action, error: e instanceof Error ? e.message : String(e) })
    }
  }
  try {
    await deps.db.broadcast(caller.workshopId, 'membership', {
      userId, active: r.active, role: r.role, at: deps.now().toISOString(),
    })
  } catch (e) {
    deps.log('warn', 'broadcast falhou', { error: e instanceof Error ? e.message : String(e) })
  }
  if (!banOk) {
    throw new HttpError(502, 'auth_falhou', 'A alteração foi gravada, mas o bloqueio de login não foi concluído. Tente de novo.')
  }
  return okResult({ userId, role: r.role, active: r.active })
}

export async function handleUsers(deps: Deps, req: HandlerRequest): Promise<HandlerResult> {
  return guarded(deps, async () => {
    const caller = await authenticate(deps, req.authorization)
    const b = asRecord(req.body)
    requireOwner(caller)
    switch (b.action) {
      case 'list': return list(deps, caller)
      case 'invite': return invite(deps, caller, b)
      case 'resend_invite': return resendInvite(deps, caller, b)
      case 'unlock_pin': return unlockPin(deps, caller, b)
      case 'deactivate': return change(deps, caller, b, 'deactivate')
      case 'reactivate': return change(deps, caller, b, 'reactivate')
      case 'set_role': return change(deps, caller, b, 'set_role', reqRole(b))
      default: throw new HttpError(400, 'acao_invalida', 'Ação desconhecida.')
    }
  })
}
