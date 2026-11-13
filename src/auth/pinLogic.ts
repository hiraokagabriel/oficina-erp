// Lógica pura do PIN (docs/NUVEM-UX.md seções 2 e 3; docs/NUVEM-SPEC.md seção 5). Sem React nem rede.

export const PIN_LENGTH = 6;
export const MAX_PIN_FAILS = 5;
/** 600 mil iterações (decisão da spec). O teste usa menos para não demorar. */
export const PBKDF2_ITERATIONS = 600_000;
/** Verificador guardado com menos iterações que isso é recusado (alguém trocou o valor para facilitar força bruta). */
export const MIN_VERIFIER_ITERATIONS = 600_000;

export type PinFormatError = 'tamanho' | 'so_numeros' | 'fraco';

export const PIN_FORMAT_MESSAGES: Record<PinFormatError, string> = {
  tamanho: 'O PIN precisa ter 6 números.',
  so_numeros: 'Use só números no PIN.',
  fraco: 'Esse PIN é fácil demais de adivinhar. Escolha outro, sem números repetidos ou em sequência.',
};

/** Todos iguais, sequência crescente ou decrescente (123456, 654321, 111111). */
export function isWeakPin(pin: string): boolean {
  if (pin.length < 2) return false;
  const d = [...pin].map(Number);
  if (d.some(Number.isNaN)) return false;
  if (d.every(x => x === d[0])) return true;
  const up = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  const down = d.every((x, i) => i === 0 || x === d[i - 1] - 1);
  return up || down;
}

/** `null` = PIN aceito. Ordem: só números, tamanho, fraco. */
export function validateNewPin(pin: string): PinFormatError | null {
  if (!/^[0-9]*$/.test(pin)) return 'so_numeros';
  if (pin.length !== PIN_LENGTH) return 'tamanho';
  if (isWeakPin(pin)) return 'fraco';
  return null;
}

/** Mantém só dígitos e corta no tamanho do PIN (campo, colagem, teclado numérico). */
export const sanitizePinInput = (raw: string): string => raw.replace(/\D/g, '').slice(0, PIN_LENGTH);

// ---------- contagem de erros ----------

/** Contagem local de erros de uma pessoa neste aparelho (espelha a do servidor, que só devolve `restantes` no `verify`). */
export interface FailState { failed: number; blocked: boolean }
export const EMPTY_FAILS: FailState = { failed: 0, blocked: false };

export function registerFail(s: FailState, max = MAX_PIN_FAILS): FailState {
  const failed = s.failed + 1;
  return { failed, blocked: failed >= max };
}

export const remainingTries = (s: FailState, max = MAX_PIN_FAILS): number => Math.max(0, max - s.failed);

export function wrongPinMessage(restantes: number): string {
  if (restantes <= 0) return PIN_BLOCKED_MESSAGE;
  return `PIN errado. ${restantes === 1 ? 'Resta 1 tentativa.' : `Restam ${restantes} tentativas.`}`;
}

export const PIN_BLOCKED_MESSAGE = 'Seu PIN foi bloqueado depois de 5 erros. Entre com seu e-mail e senha e crie um PIN novo, ou peça ao Dono para liberar.';
export const PIN_OFFLINE_BLOCKED_MESSAGE = 'Muitas tentativas erradas. Espere a internet voltar para tentar de novo.';
export const DEVICE_SUSPENDED_MESSAGE =
  'Este computador foi bloqueado por muitas tentativas de PIN erradas. Peça ao Dono para liberar em Configurações > Aparelhos. Enquanto isso, entre com e-mail e senha.';
export const DEVICE_REVOKED_MESSAGE = 'Este computador não está mais autorizado. Entre com e-mail e senha.';
/** Dono com verificação em 2 etapas: o servidor recusa o PIN (403 `exige_senha`) e pede e-mail, senha e código. */
export const NEEDS_PASSWORD_MESSAGE = 'Para entrar, use seu e-mail e senha. O código de verificação será pedido em seguida.';
/** `pin.set` recusado (403 `exige_senha_recente`): o PIN só muda logo depois de entrar com a senha. */
export const RECENT_PASSWORD_MESSAGE = 'Por segurança, entre de novo com seu e-mail e senha e então troque o PIN.';
export const PIN_NETWORK_MESSAGE = 'Não deu para conferir o PIN. Confira a internet e tente de novo.';

export type PinFailureKind = 'wrong' | 'blocked' | 'device_suspended' | 'device_revoked' | 'needs_password' | 'network' | 'other';

export interface PinFailure { kind: PinFailureKind; message: string; restantes?: number }

/** Traduz o erro das funções `pin` (código estável + `restantes` opcional) para a tela. `localRemaining` vale quando o servidor não manda. */
export function interpretPinError(code: string, restantes: number | undefined, localRemaining: number): PinFailure {
  switch (code) {
    case 'pin_incorreto': {
      const r = typeof restantes === 'number' ? restantes : localRemaining;
      return r <= 0 ? { kind: 'blocked', message: PIN_BLOCKED_MESSAGE, restantes: 0 } : { kind: 'wrong', message: wrongPinMessage(r), restantes: r };
    }
    case 'pin_bloqueado': return { kind: 'blocked', message: PIN_BLOCKED_MESSAGE, restantes: 0 };
    case 'aparelho_suspenso': return { kind: 'device_suspended', message: DEVICE_SUSPENDED_MESSAGE };
    case 'aparelho_invalido': return { kind: 'device_revoked', message: DEVICE_REVOKED_MESSAGE };
    case 'exige_senha': return { kind: 'needs_password', message: NEEDS_PASSWORD_MESSAGE };
    case 'sem_internet': return { kind: 'network', message: PIN_NETWORK_MESSAGE };
    default: return { kind: 'network', message: PIN_NETWORK_MESSAGE };
  }
}

// ---------- verificador local (PBKDF2-SHA256) ----------

export interface PinVerifier { v: 1; iterations: number; salt: string; hash: string }

const toB64 = (b: Uint8Array): string => btoa(String.fromCharCode(...b));
const fromB64 = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function makeVerifier(pin: string, iterations = PBKDF2_ITERATIONS): Promise<PinVerifier> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  return { v: 1, iterations, salt: toB64(salt), hash: toB64(await derive(pin, salt, iterations)) };
}

export async function checkVerifier(pin: string, ver: PinVerifier): Promise<boolean> {
  const got = await derive(pin, fromB64(ver.salt), ver.iterations);
  const want = fromB64(ver.hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

export function parseVerifier(raw: string | null): PinVerifier | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<PinVerifier>;
    if (o.v === 1 && typeof o.iterations === 'number' && typeof o.salt === 'string' && typeof o.hash === 'string' && o.iterations >= MIN_VERIFIER_ITERATIONS) return o as PinVerifier;
  } catch { /* guardado corrompido: sem verificador */ }
  return null;
}
