import { MONEY_OFFLINE_TOAST } from '../utils/cloudStatus';

// Cliente da função `money` (docs/NUVEM-SPEC.md seção 4, "Dinheiro offline"; contrato em src/server/moneyHandler.ts).
// Sem React e sem Supabase: a chamada HTTP e o motor entram por `MoneyClientDeps` (testável com falsos).
//
// Fluxo de `run`: 1) offline: recusa na hora; 2) `prepareMoney` envia a op pendente do registro e espera o ack;
// 3) chama a função com as versões conhecidas e um `op_id`; 4) sucesso: puxa as tabelas de dinheiro (`afterMoney`),
// que aplica o resultado no estado sem eco; 409: puxa e pede para repetir.
// `op_id`: cada clique novo gera um `op_id` novo. Só "Tentar de novo" (resultado `rede`/`erro`/`offline`/`pendente`) repete o `op_id` devolvido na
// falha (`retryOpId`), então o servidor devolve o resultado gravado em vez de lançar duas vezes.

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
  | 'rede'         // a internet caiu no meio: o resultado é desconhecido; `opId` vem na falha para repetir sem duplicar
  | 'erro';        // erro do servidor: `opId` vem na falha para repetir sem duplicar

export type MoneyOutcome =
  | { ok: true; info: Record<string, unknown>; replay: boolean }
  | { ok: false; code: MoneyFailCode; message: string; opId?: string };

export interface MoneyRunOptions {
  /** `opId` devolvido por uma falha `rede`/`erro`: repete a MESMA operação (sem lançar duas vezes). */
  retryOpId?: string;
}

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
export const DELETED_ELSEWHERE_MESSAGE = 'Este registro foi excluído em outro aparelho. Os dados já foram atualizados.';
export const SESSION_MESSAGE = 'Entre de novo para continuar.';

const str = (v: unknown, fallback: string): string => (typeof v === 'string' && v !== '' ? v : fallback);

export function createMoneyClient(deps: MoneyClientDeps): { run(kind: MoneyKind, call: MoneyCall, opts?: MoneyRunOptions): Promise<MoneyOutcome>; isBusy(): boolean } {
  let queue: Promise<unknown> = Promise.resolve();
  const busyKeys: string[] = [];
  const emitBusy = (): void => deps.onBusy?.([...new Set(busyKeys)]);

  async function exec(kind: MoneyKind, call: MoneyCall, opts?: MoneyRunOptions): Promise<MoneyOutcome> {
    const engine = deps.engine();
    if (!engine) return { ok: false, code: 'offline', message: MONEY_OFFLINE_TOAST };
    const prep = await engine.prepareMoney({ osId: call.osId, entryId: call.entryId });
    if (!prep.ok) {
      return prep.reason === 'offline'
        ? { ok: false, code: 'offline', message: MONEY_OFFLINE_TOAST, opId: opts?.retryOpId }
        : { ok: false, code: 'pendente', message: PENDING_MESSAGE, opId: opts?.retryOpId };
    }
    // Sem a versão do registro (excluído em outro aparelho) o servidor recusaria com erro técnico: avisa antes. OS nova não tem versão.
    // Exceção: "Tentar de novo" (`retryOpId`). A operação pode já ter sido gravada (a rede caiu na resposta) e o pull já ter
    // marcado o registro como excluído: o servidor confere o `op_id` antes das versões e devolve o resultado gravado. Manda versão 0
    // (nunca existe: começa em 1), então uma op nova com esse `op_id` cairia em conflito de versão, sem aplicar nada.
    const need = call.entryId !== undefined ? `ledger:${call.entryId}`
      : kind === 'os.save' && call.payload?.isNew === true ? null : call.osId !== undefined ? `work_orders:${call.osId}` : null;
    const retryOpId = opts?.retryOpId || undefined;
    const known = need && prep.known[need] === undefined ? (retryOpId ? { ...prep.known, [need]: 0 } : null) : prep.known;
    if (!known) return { ok: false, code: 'mudou', message: DELETED_ELSEWHERE_MESSAGE };
    const opId = retryOpId || deps.newId();

    const res = await deps.invoke({
      opId, kind, today: deps.today(), machine: deps.machine(),
      ...(deps.deviceId ? { deviceId: deps.deviceId } : {}),
      ...(call.osId !== undefined ? { osId: call.osId } : {}),
      ...(call.entryId !== undefined ? { entryId: call.entryId } : {}),
      payload: call.payload ?? {}, known,
    });
    if (!res) {
      // Resultado desconhecido: devolve o op_id para "Tentar de novo" não duplicar.
      return { ok: false, code: 'rede', message: NETWORK_MESSAGE, opId };
    }
    const { status, body } = res;
    if (status >= 200 && status < 300 && body.ok === true) {
      await engine.afterMoney();
      return { ok: true, info: (typeof body.info === 'object' && body.info !== null ? body.info : {}) as Record<string, unknown>, replay: body.replay === true };
    }
    if (status >= 500) return { ok: false, code: 'erro', message: SERVER_ERROR_MESSAGE, opId };
    // Resposta definitiva (4xx): sem op_id para repetir.
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
    run(kind, call, opts) {
      const busyKey = call.osId ?? call.entryId;
      if (busyKey) { busyKeys.push(busyKey); emitBusy(); }
      const p = queue.then(async () => {
        try {
          return await exec(kind, call, opts);
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
