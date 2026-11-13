import { DEFAULT_IDLE_MINUTES, parseIdleMinutes } from './idle';
import type { IdleMinutes } from './idle';
import { EMPTY_FAILS, parseVerifier } from './pinLogic';
import type { FailState, PinVerifier } from './pinLogic';

// Estado do APARELHO guardado neste aparelho (docs/NUVEM-SPEC.md seção 5).
//
// Onde fica: `localStorage` do WebView (Tauri: pasta de dados do app, por PC; navegador: por origem). O segredo do
// aparelho (32 bytes em hex, devolvido uma vez por `device.register`) NÃO é segredo forte contra quem tem o disco:
// vale o mesmo raciocínio do refresh token do supabase-js, que também fica no `localStorage`. O servidor guarda só o
// sha256 e limita os erros de PIN por aparelho. Nada aqui contém PIN: só o verificador PBKDF2 da pessoa atual.
//
// Aparelho PESSOAL (celular) não é registrado (decisão 4 do dono): só tem `localId`, para o motor de envio.

export type DeviceKind = 'pc_compartilhado' | 'pessoal';

export interface RegisteredDevice {
  id: string;
  name: string;
  kind: 'pc_compartilhado';
  secret: string;
  idleMinutes: IdleMinutes;
  /** Quem autorizou e quando (só para exibir). */
  authorizedAt: string;
}

export interface RosterPerson { userId: string; displayName: string | null; role: 'dono' | 'recepcao' | 'mecanico'; locked: boolean }

const K_DEVICE = 'oficina.device';
const K_LOCAL_ID = 'oficina.deviceLocalId';
const K_ROSTER = 'oficina.roster';
const K_LAST_USER = 'oficina.lastUser';
const K_VERIFIER = 'oficina.pinVerifier.';
const K_FAILS = 'oficina.pinFails.';

const store = (s?: Storage): Storage | null => {
  try { return s ?? (typeof localStorage === 'undefined' ? null : localStorage); } catch { return null; }
};

function readJson<T>(key: string, s?: Storage): T | null {
  try {
    const raw = store(s)?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}
function writeJson(key: string, value: unknown, s?: Storage): void {
  try { store(s)?.setItem(key, JSON.stringify(value)); } catch { /* sem armazenamento: segue sem guardar */ }
}
function remove(key: string, s?: Storage): void {
  try { store(s)?.removeItem(key); } catch { /* idem */ }
}

export function readDevice(s?: Storage): RegisteredDevice | null {
  const d = readJson<Partial<RegisteredDevice>>(K_DEVICE, s);
  if (!d || typeof d.id !== 'string' || typeof d.secret !== 'string' || d.kind !== 'pc_compartilhado') return null;
  return {
    id: d.id, name: typeof d.name === 'string' ? d.name : 'Este computador', kind: 'pc_compartilhado', secret: d.secret,
    idleMinutes: d.idleMinutes === undefined ? DEFAULT_IDLE_MINUTES : parseIdleMinutes(d.idleMinutes),
    authorizedAt: typeof d.authorizedAt === 'string' ? d.authorizedAt : '',
  };
}
export const writeDevice = (d: RegisteredDevice, s?: Storage): void => writeJson(K_DEVICE, d, s);
export const clearDevice = (s?: Storage): void => remove(K_DEVICE, s);

/** Identificador estável deste aparelho para o motor de envio (`deviceId`), mesmo sem registro no servidor. */
export function localDeviceId(s?: Storage): string {
  const st = store(s);
  try {
    const cur = st?.getItem(K_LOCAL_ID);
    if (cur) return cur;
  } catch { /* segue */ }
  const id = crypto.randomUUID();
  try { st?.setItem(K_LOCAL_ID, id); } catch { /* sem armazenamento: id vale só nesta abertura */ }
  return id;
}

// ---------- cartões em cache ----------
interface RosterCache { savedAt: string; people: RosterPerson[] }
export const readRoster = (s?: Storage): RosterCache | null => readJson<RosterCache>(K_ROSTER, s);
export const writeRoster = (people: RosterPerson[], savedAt: string, s?: Storage): void => writeJson(K_ROSTER, { savedAt, people }, s);
export const clearRoster = (s?: Storage): void => remove(K_ROSTER, s);

// ---------- quem usou por último ----------
export const readLastUser = (s?: Storage): string | null => {
  try { return store(s)?.getItem(K_LAST_USER) ?? null; } catch { return null; }
};
export const writeLastUser = (userId: string, s?: Storage): void => {
  try { store(s)?.setItem(K_LAST_USER, userId); } catch { /* idem */ }
};

// ---------- verificador local do PIN (por pessoa) ----------
export const readVerifier = (userId: string, s?: Storage): PinVerifier | null => {
  try { return parseVerifier(store(s)?.getItem(K_VERIFIER + userId) ?? null); } catch { return null; }
};
export const writeVerifier = (userId: string, v: PinVerifier, s?: Storage): void => writeJson(K_VERIFIER + userId, v, s);
export const clearVerifier = (userId: string, s?: Storage): void => remove(K_VERIFIER + userId, s);
/** Só o verificador da pessoa que está entrada fica neste aparelho: ao entrar outra pessoa, apaga o de todas as demais. */
export function clearOtherVerifiers(keepUserId: string, s?: Storage): void {
  const st = store(s);
  if (!st) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < st.length; i++) {
      const k = st.key(i);
      if (k && k.startsWith(K_VERIFIER) && k !== K_VERIFIER + keepUserId) keys.push(k);
    }
    for (const k of keys) st.removeItem(k);
  } catch { /* sem armazenamento */ }
}

// ---------- contagem local de erros por pessoa ----------
export function readFails(userId: string, s?: Storage): FailState {
  const f = readJson<Partial<FailState>>(K_FAILS + userId, s);
  return f && typeof f.failed === 'number' ? { failed: f.failed, blocked: f.blocked === true } : EMPTY_FAILS;
}
export const writeFails = (userId: string, f: FailState, s?: Storage): void => writeJson(K_FAILS + userId, f, s);
export const clearFails = (userId: string, s?: Storage): void => remove(K_FAILS + userId, s);

/** Esquece tudo o que é de uma pessoa neste aparelho (desativada ou removida). */
export function forgetPerson(userId: string, s?: Storage): void {
  clearVerifier(userId, s);
  clearFails(userId, s);
  if (readLastUser(s) === userId) remove(K_LAST_USER, s);
  const r = readRoster(s);
  if (r) writeRoster(r.people.filter(p => p.userId !== userId), r.savedAt, s);
}
