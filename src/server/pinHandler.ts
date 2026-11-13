// Edge Function `pin`: set, verify (com JWT) e roster, unlock (com deviceId + segredo, antes do login).
import {
  HttpError, asRecord, authenticate, guarded, okResult, reqPin, reqString, reqUuid, requireRecentPassword, sha256Hex, timingSafeEqual,
  type Deps, type DeviceRow, type HandlerRequest, type HandlerResult, type PinAttempt,
} from './core'

const GENERIC_DEVICE = () => new HttpError(401, 'aparelho_invalido', 'Este aparelho não está autorizado. Peça ao Dono para autorizar de novo.')

/** Aparelho existe, não revogado, é compartilhado e o segredo confere (tempo constante). */
async function checkDevice(deps: Deps, b: Record<string, unknown>): Promise<DeviceRow> {
  let id: string
  let secret: string
  try {
    id = reqUuid(b, 'deviceId')
    secret = reqString(b, 'secret', 1, 256)
  } catch {
    throw GENERIC_DEVICE()
  }
  const d = await deps.db.device(id)
  const hash = await sha256Hex(secret)
  // compara mesmo sem aparelho, para não revelar a existência pelo tempo
  const same = timingSafeEqual(hash, d?.secretHash ?? '0'.repeat(64))
  if (!d || !same || d.revokedAt || d.kind !== 'pc_compartilhado') throw GENERIC_DEVICE()
  return d
}

function failure(r: PinAttempt, own: boolean): HttpError {
  if (r.status === 'suspended') {
    return new HttpError(403, 'aparelho_suspenso', 'Muitos erros neste aparelho. Peça ao Dono para autorizá-lo de novo.')
  }
  if (r.status === 'locked') {
    return new HttpError(423, 'pin_bloqueado', 'PIN bloqueado. Entre com e-mail e senha.')
  }
  return new HttpError(401, 'pin_incorreto', 'PIN incorreto.', own ? { restantes: Math.max(0, 5 - r.failed) } : undefined)
}

export async function handlePin(deps: Deps, req: HandlerRequest): Promise<HandlerResult> {
  return guarded(deps, async () => {
    const b = asRecord(req.body)
    switch (b.action) {
      case 'set': {
        const c = await authenticate(deps, req.authorization)
        requireRecentPassword(c, deps.now())
        await deps.db.pinSet(c.workshopId, c.userId, reqPin(b))
        return okResult()
      }
      case 'verify': {
        const c = await authenticate(deps, req.authorization)
        const r = await deps.db.pinAttempt(c.workshopId, c.userId, reqPin(b), null)
        if (r.status !== 'ok') throw failure(r, true)
        return okResult()
      }
      case 'roster': {
        const d = await checkDevice(deps, b)
        return okResult({ people: await deps.db.roster(d.workshopId), idleLockMinutes: d.idleLockMinutes })
      }
      case 'unlock': {
        const d = await checkDevice(deps, b)
        const userId = reqUuid(b, 'userId')
        const pin = reqPin(b)
        const r = await deps.db.pinAttempt(d.workshopId, userId, pin, d.id)
        if (r.status !== 'ok') throw failure(r, false)
        // PIN certo implica membership ativa (a função SQL exige). Mensagem única para qualquer falha daqui em diante.
        const info = await deps.auth.getUserInfo(userId)
        if (!info?.email) throw failure({ status: 'wrong', failed: 0 }, false)
        // Dono com MFA (TOTP) nunca entra só por PIN: o cliente manda para e-mail + senha + código.
        const m = await deps.db.activeMembership(userId)
        if (m?.role === 'dono' && info.verifiedTotp) {
          throw new HttpError(403, 'exige_senha', 'Esta conta usa verificação em duas etapas. Entre com e-mail, senha e código.')
        }
        const tokenHash = await deps.auth.magicLinkToken(info.email)
        return okResult({ tokenHash, type: 'magiclink' })
      }
      default: throw new HttpError(400, 'acao_invalida', 'Ação desconhecida.')
    }
  })
}
