// Edge Function `device`: register, revoke, set_idle. Só o Dono.
import {
  HttpError, DEVICE_KINDS, asRecord, authenticate, guarded, okResult, requireOwner, reqString, reqUuid, sha256Hex, toHex,
  type Deps, type DeviceKind, type HandlerRequest, type HandlerResult,
} from './core'

const IDLE_OPTIONS = [5, 15, 30]

export async function handleDevice(deps: Deps, req: HandlerRequest): Promise<HandlerResult> {
  return guarded(deps, async () => {
    const caller = await authenticate(deps, req.authorization)
    const b = asRecord(req.body)
    requireOwner(caller)
    switch (b.action) {
      case 'register': {
        const name = reqString(b, 'name', 1, 60)
        const kind = b.kind
        if (typeof kind !== 'string' || !(DEVICE_KINDS as readonly string[]).includes(kind)) {
          throw new HttpError(400, 'dados_invalidos', 'Campo "kind" inválido.')
        }
        // segredo de 32 bytes; o servidor guarda só o sha256 e devolve o segredo UMA vez
        const deviceSecret = toHex(deps.random(32))
        const deviceId = await deps.db.insertDevice({
          workshopId: caller.workshopId, name, kind: kind as DeviceKind,
          secretHash: await sha256Hex(deviceSecret), authorizedBy: caller.userId,
        })
        return okResult({ deviceId, deviceSecret })
      }
      case 'revoke': {
        const id = reqUuid(b, 'deviceId')
        if (!(await deps.db.revokeDevice(caller.workshopId, id))) {
          throw new HttpError(404, 'aparelho_nao_encontrado', 'Aparelho não encontrado.')
        }
        return okResult()
      }
      case 'set_idle': {
        const id = reqUuid(b, 'deviceId')
        const m = b.minutes
        if (m !== null && !(typeof m === 'number' && IDLE_OPTIONS.includes(m))) {
          throw new HttpError(400, 'dados_invalidos', 'O bloqueio por inatividade é 5, 15 ou 30 minutos, ou nunca (null).')
        }
        const cur = await deps.db.device(id)
        if (!cur || cur.workshopId !== caller.workshopId) {
          throw new HttpError(404, 'aparelho_nao_encontrado', 'Aparelho não encontrado.')
        }
        if (cur.revokedAt) throw new HttpError(409, 'aparelho_revogado', 'Este aparelho foi revogado. Autorize um novo aparelho.')
        if (!(await deps.db.setDeviceIdle(caller.workshopId, id, m))) {
          throw new HttpError(404, 'aparelho_nao_encontrado', 'Aparelho não encontrado.')
        }
        return okResult()
      }
      default: throw new HttpError(400, 'acao_invalida', 'Ação desconhecida.')
    }
  })
}
