import { WorkshopSettings } from '../types';

// Segredos do Google: ficam só no localStorage deste computador, nunca no database.json
// (que é compartilhado entre PCs e copiado em backups).
export const SECRET_STORAGE_KEYS = {
  googleApiKey: 'oficina.googleApiKey',
  googleDriveToken: 'oficina.googleDriveToken',
} as const;

export type SecretField = keyof typeof SECRET_STORAGE_KEYS;
export const SECRET_FIELDS = Object.keys(SECRET_STORAGE_KEYS) as SecretField[];

export type Secrets = Partial<Record<SecretField, string>>;

/** Armazenamento mínimo (localStorage ou um falso nos testes). */
export interface SecretStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// localStorage pode lançar (janela privada, dados bloqueados): nunca propaga.
export const localSecretStore: SecretStore = {
  getItem: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
  setItem: (key, value) => { try { localStorage.setItem(key, value); } catch { /* ignora */ } },
  removeItem: (key) => { try { localStorage.removeItem(key); } catch { /* ignora */ } },
};

export function getSecret(field: SecretField, store: SecretStore = localSecretStore): string {
  try { return store.getItem(SECRET_STORAGE_KEYS[field]) || ''; } catch { return ''; }
}

export function setSecret(field: SecretField, value: string, store: SecretStore = localSecretStore): void {
  try {
    if (value) store.setItem(SECRET_STORAGE_KEYS[field], value);
    else store.removeItem(SECRET_STORAGE_KEYS[field]);
  } catch { /* nunca lança */ }
}

/** Cópia sem os campos secretos (o que pode ir para o disco/backup). Não altera a entrada. */
export function stripSecrets<T extends object>(settings: T): Omit<T, SecretField> {
  const copy: Record<string, unknown> = { ...(settings as Record<string, unknown>) };
  for (const f of SECRET_FIELDS) delete copy[f];
  return copy as Omit<T, SecretField>;
}

/** Só os segredos preenchidos (string não vazia) de um settings. */
export function pickSecrets(settings: Partial<WorkshopSettings> | null | undefined): Secrets {
  const out: Secrets = {};
  if (!settings) return out;
  for (const f of SECRET_FIELDS) {
    const v = settings[f];
    if (typeof v === 'string' && v.trim() !== '') out[f] = v;
  }
  return out;
}

export const hasSecrets = (settings: Partial<WorkshopSettings> | null | undefined): boolean =>
  Object.keys(pickSecrets(settings)).length > 0;

/**
 * Copia para o armazenamento local os segredos que vieram do arquivo, SÓ onde o local está vazio
 * (nunca sobrescreve). Devolve o settings sem os valores do arquivo e com os do armazenamento local.
 * Idempotente.
 */
export function adoptSecrets(settings: WorkshopSettings, store: SecretStore = localSecretStore): WorkshopSettings {
  const fromFile = pickSecrets(settings);
  const result: Record<string, unknown> = { ...stripSecrets(settings) };
  for (const f of SECRET_FIELDS) {
    let local = getSecret(f, store);
    if (!local && fromFile[f]) {
      setSecret(f, fromFile[f]!, store);
      local = fromFile[f]!;
    }
    result[f] = local;
  }
  return result as unknown as WorkshopSettings;
}

/** Grava no armazenamento local os segredos do settings (inclusive vazio, quando o usuário limpa o campo). */
export function persistSecrets(settings: WorkshopSettings, store: SecretStore = localSecretStore): void {
  for (const f of SECRET_FIELDS) {
    const v = settings[f] ?? '';
    if (v !== getSecret(f, store)) setSecret(f, v, store);
  }
}

/** Banco sem segredos nas configurações: usado no snapshot, no arquivo gravado e nos backups. */
export function stripDbSecrets<T extends { settings: WorkshopSettings }>(db: T): Omit<T, 'settings'> & { settings: Omit<WorkshopSettings, SecretField> } {
  return { ...db, settings: stripSecrets(db.settings) };
}

