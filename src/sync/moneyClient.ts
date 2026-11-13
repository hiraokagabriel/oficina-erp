import { stable } from '../services/osEditMerge';
import { MONEY_OFFLINE_TOAST } from '../utils/cloudStatus';

// Cliente da função `money` (docs/NUVEM-SPEC.md seção 4, "Dinheiro offline"; contrato em src/server/moneyHandler.ts).
// Sem React e sem Supabase: a chamada HTTP e o motor entram por `MoneyClientDeps` (testável com falsos).
//
// Fluxo de `run`: 1) offline: recusa na hora; 2) `prepareMoney` envia a op pendente do registro e espera o ack;
// 3) chama a função com as versões conhecidas e um `op_id`; 4) sucesso: puxa as tabelas de dinheiro (`afterMoney`),
// que aplica o resultado no estado sem eco; 409: puxa e pede para repetir.
// `op_id` estável por tentativa: repetir a MESMA operação depois de uma falha de rede reusa o `op_id`, então o servidor
// devolve o resultado gravado em vez de lançar duas vezes.

export type MoneyKind =
  | 'os.finalizeSingle' | 'os.installment' | 'os.status' | 'os.restore' | 'os.delete' | 'os.save' | 'ledger.toggle';

/** O que identifica e parametriza a operação. `osId` para `os.*`; `entryId` para `ledger.toggle`. */
export interface MoneyCall {
  osId?: string;
  entryId?: string;
  payload?: Record<string, unknown>;
}

export type MoneyFailCode =
  | 'offline'      // sem internet: nada foi enviado
  | 'pendente'     // ainda há alteração desta OS sendo enviada
  | 'conflito'     // 409 de versão: os dados foram atualizados, repetir
  | 'mudou'        // o estado mudou em outro aparelho (409/404): os dados foram atualizados
  | 'bloqueado'    // regra de negócio recusou (422): `message` diz o motivo
  | 'sem_permissao'
  | 'sessao'       // precisa entrar de novo ou confirmar o código do autenticador
  | 'rede'         // a internet caiu no meio: o resultado é desconhecido, repetir reusa o mesmo op_id
  | 'erro';        // erro do servidor: repetir reusa o mesmo op_id

export type MoneyOutcome =
  | { ok: true; info: Record<string, unknown>; replay: boolean }
  | { ok: false; code: MoneyFailCode; message: string };

export interface MoneyHttpResult { status: number; body: Record<string, unknown> }

/** Falso/real: devolve `null` se não houve resposta (rede). */
export type MoneyInvoke = (body: Record<string, unknown>) => Promise<MoneyHttpResult | null>;

export interface MoneyEngine {
  prepareMoney(ref: { osId?: string; entryId?: string }): Promise<{ ok: true; known: Record<string, number> } | { ok: false; reason: 'offline' | 'pendente' }>;
  afterMoney(): Promise<void>;
}

export interface MoneyClientDeps {
  invoke: MoneyInvoke;
  engine: () => MoneyEngine | null;
  newId: () => string;
  /** Dia local 'AAAA-MM-DD' deste aparelho (o servidor aceita ±1 dia). */
  today: () => string;
  /** Nome para a trilha de auditoria ("Ana (PC balcão)"). */
  machine: () => string;
  deviceId?: string;
  /** Chaves (`osId` ou `entryId`) com operação de dinheiro na fila ou no ar: o botão certo mostra "Recebendo...". */
  onBusy?: (keys: string[]) => void;
}

export const CONFLICT_MESSAGE = 'Outra pessoa mexeu nesta OS agora há pouco. Os dados foram atualizados. Confira e tente de novo.';
export const PENDING_MESSAGE = 'Ainda estou enviando as alterações desta OS. Espere o selo mostrar "Salvo" e tente de novo.';
export const NETWORK_MESSAGE = 'Não deu para confirmar. Toque em Tentar de novo: o pagamento não será lançado duas vezes.';
export const SERVER_ERROR_MESSAGE = 'Não foi possível concluir agora. Tente de novo em instantes: nada será lançado duas vezes.';
export const SESSION_MESSAGE = 'Entre de novo para continuar.';

const str = (v: unknown, fallback: string): string => (typeof v === 'string' && v !== '' ? v : fallback);

export function createMoneyClient(deps: MoneyClientDeps): { run(kind: MoneyKind, call: MoneyCall): Promise<MoneyOutcome>; isBusy(): boolean } {
  /** `op_id` por operação em andamento ou com resultado desconhecido (rede/5xx). */
  const attempts = new Map<string, string>();
  let queue: Promise<unknown> = Promise.resolve();
  const busyKeys: string[] = [];
  const emitBusy = (): void => deps.onBusy?.([...new Set(busyKeys)]);

  const attemptKey = (kind: MoneyKind, c: MoneyCall): string => stable([kind, c.osId ?? null, c.entryId ?? null, c.payload ?? null]);

  async function exec(kind: MoneyKind, call: MoneyCall): Promise<MoneyOutcome> {
    const engine = deps.engine();
    if (!engine) return { ok: false, code: 'offline', message: MONEY_OFFLINE_TOAST };
    const prep = await engine.prepareMoney({ osId: call.osId, entryId: call.entryId });
    if (!prep.ok) {
      return prep.reason === 'offline'
        ? { ok: false, code: 'offline', message: MONEY_OFFLINE_TOAST }
        : { ok: false, code: 'pendente', message: PENDING_MESSAGE };
    }
    const key = attemptKey(kind, call);
    let opId = attempts.get(key);
    if (!opId) { opId = deps.newId(); attempts.set(key, opId); }

    const res = await deps.invoke({
      opId, kind, today: deps.today(), machine: deps.machine(),
      ...(deps.deviceId ? { deviceId: deps.deviceId } : {}),
      ...(call.osId !== undefined ? { osId: call.osId } : {}),
      ...(call.entryId !== undefined ? { entryId: call.entryId } : {}),
      payload: call.payload ?? {}, known: prep.known,
    });
    if (!res) {
      // Resultado desconhecido: mantém o op_id para a repetição não duplicar.
      return { ok: false, code: 'rede', message: NETWORK_MESSAGE };
    }
    const { status, body } = res;
    if (status >= 200 && status < 300 && body.ok === true) {
      attempts.delete(key);
      await engine.afterMoney();
      return { ok: true, info: (typeof body.info === 'object' && body.info !== null ? body.info : {}) as Record<string, unknown>, replay: body.replay === true };
    }
    if (status >= 500) return { ok: false, code: 'erro', message: SERVER_ERROR_MESSAGE };
    // Resposta definitiva (4xx): esta tentativa acabou; a próxima é outra operação.
    attempts.delete(key);
    const error = str(body.error, '');
    const message = str(body.message, SERVER_ERROR_MESSAGE);
    if (status === 401 || error === 'exige_mfa') return { ok: false, code: 'sessao', message: error === 'exige_mfa' ? message : SESSION_MESSAGE };
    if (status === 403) return { ok: false, code: 'sem_permissao', message };
    if (error === 'conflito_versao') {
      await engine.afterMoney();
      return { ok: false, code: 'conflito', message: CONFLICT_MESSAGE };
    }
    if (status === 409 || status === 404) {
      await engine.afterMoney();
      return { ok: false, code: 'mudou', message };
    }
    return { ok: false, code: 'bloqueado', message };
  }

  return {
    isBusy: () => busyKeys.length > 0,
    // Uma operação de dinheiro por vez: dois cliques não correm um contra o outro.
    run(kind, call) {
      const busyKey = call.osId ?? call.entryId;
      if (busyKey) { busyKeys.push(busyKey); emitBusy(); }
      const p = queue.then(async () => {
        try {
          return await exec(kind, call);
        } catch {
          return { ok: false, code: 'erro', message: SERVER_ERROR_MESSAGE } as MoneyOutcome;
        } finally {
          if (busyKey) { busyKeys.splice(busyKeys.indexOf(busyKey), 1); emitBusy(); }
        }
      });
      queue = p.then(() => undefined, () => undefined);
      return p;
    },
  };
}
