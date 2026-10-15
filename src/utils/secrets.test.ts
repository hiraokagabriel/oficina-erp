import { describe, it, expect } from 'vitest';
import {
  SECRET_STORAGE_KEYS, SecretStore, adoptSecrets, getSecret, hasSecrets, persistSecrets, pickSecrets,
  setSecret, stripDbSecrets, stripSecrets,
} from './secrets';
import type { WorkshopSettings } from '../types';

// Fixtures sintéticas: tokens falsos.
const memStore = (initial: Record<string, string> = {}): SecretStore & { data: Record<string, string> } => {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
};
const throwingStore: SecretStore = {
  getItem: () => { throw new Error('bloqueado'); },
  setItem: () => { throw new Error('bloqueado'); },
  removeItem: () => { throw new Error('bloqueado'); },
};

const settings = (over: Partial<WorkshopSettings> = {}): WorkshopSettings => ({
  name: 'OFICINA TESTE', cnpj: '', address: '', exportPath: '', googleApiKey: 'FAKE-KEY', googleDriveToken: 'FAKE-TOKEN', ...over,
});

describe('stripSecrets / pickSecrets', () => {
  it('stripSecrets remove os dois campos e não altera a entrada', () => {
    const s = settings();
    const out = stripSecrets(s) as Record<string, unknown>;
    expect('googleApiKey' in out).toBe(false);
    expect('googleDriveToken' in out).toBe(false);
    expect(out.name).toBe('OFICINA TESTE');
    expect(s.googleApiKey).toBe('FAKE-KEY');
  });

  it('pickSecrets devolve só os preenchidos', () => {
    expect(pickSecrets(settings())).toEqual({ googleApiKey: 'FAKE-KEY', googleDriveToken: 'FAKE-TOKEN' });
    expect(pickSecrets(settings({ googleApiKey: '', googleDriveToken: '  ' }))).toEqual({});
    expect(pickSecrets(settings({ googleApiKey: undefined }))).toEqual({ googleDriveToken: 'FAKE-TOKEN' });
    expect(pickSecrets(null)).toEqual({});
    expect(hasSecrets(settings({ googleApiKey: '', googleDriveToken: '' }))).toBe(false);
    expect(hasSecrets(settings())).toBe(true);
  });

  it('stripDbSecrets tira os segredos só de settings', () => {
    const db = { ledger: [{ id: 'L1' }], settings: settings() };
    const out = stripDbSecrets(db);
    expect(JSON.stringify(out)).not.toContain('FAKE-');
    expect(out.ledger).toEqual([{ id: 'L1' }]);
  });
});

describe('adoptSecrets (copia só se o local estiver vazio)', () => {
  it('local vazio: copia do arquivo e devolve preenchido', () => {
    const store = memStore();
    const out = adoptSecrets(settings(), store);
    expect(store.data[SECRET_STORAGE_KEYS.googleApiKey]).toBe('FAKE-KEY');
    expect(store.data[SECRET_STORAGE_KEYS.googleDriveToken]).toBe('FAKE-TOKEN');
    expect(out.googleApiKey).toBe('FAKE-KEY');
    expect(out.googleDriveToken).toBe('FAKE-TOKEN');
  });

  it('local existente nunca é sobrescrito', () => {
    const store = memStore({ [SECRET_STORAGE_KEYS.googleApiKey]: 'LOCAL-KEY' });
    const out = adoptSecrets(settings(), store);
    expect(store.data[SECRET_STORAGE_KEYS.googleApiKey]).toBe('LOCAL-KEY');
    expect(out.googleApiKey).toBe('LOCAL-KEY');
    expect(store.data[SECRET_STORAGE_KEYS.googleDriveToken]).toBe('FAKE-TOKEN'); // este estava vazio
  });

  it('arquivo sem segredos: usa o local; sem nenhum: string vazia', () => {
    const store = memStore({ [SECRET_STORAGE_KEYS.googleDriveToken]: 'LOCAL-TOKEN' });
    const out = adoptSecrets(settings({ googleApiKey: undefined, googleDriveToken: undefined }), store);
    expect(out.googleDriveToken).toBe('LOCAL-TOKEN');
    expect(out.googleApiKey).toBe('');
    expect(Object.keys(store.data)).toEqual([SECRET_STORAGE_KEYS.googleDriveToken]);
  });

  it('é idempotente', () => {
    const store = memStore();
    const a = adoptSecrets(settings(), store);
    const b = adoptSecrets(a, store);
    expect(b).toEqual(a);
  });

  it('localStorage que lança nunca propaga', () => {
    expect(() => adoptSecrets(settings(), throwingStore)).not.toThrow();
    expect(getSecret('googleApiKey', throwingStore)).toBe('');
    expect(() => setSecret('googleApiKey', 'x', throwingStore)).not.toThrow();
    expect(() => persistSecrets(settings(), throwingStore)).not.toThrow();
  });
});

describe('persistSecrets', () => {
  it('grava os valores e remove quando o campo é limpo', () => {
    const store = memStore();
    persistSecrets(settings(), store);
    expect(store.data[SECRET_STORAGE_KEYS.googleApiKey]).toBe('FAKE-KEY');
    persistSecrets(settings({ googleApiKey: '' }), store);
    expect(SECRET_STORAGE_KEYS.googleApiKey in store.data).toBe(false);
    expect(store.data[SECRET_STORAGE_KEYS.googleDriveToken]).toBe('FAKE-TOKEN');
  });
});
