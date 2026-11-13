import { describe, expect, it } from 'vitest';
import {
  EMPTY_FAILS, checkVerifier, interpretPinError, isWeakPin, makeVerifier, parseVerifier, registerFail, remainingTries,
  sanitizePinInput, validateNewPin, wrongPinMessage,
} from './pinLogic';

describe('pinLogic: formato', () => {
  it('rejeita fraco, tamanho e não numérico', () => {
    expect(validateNewPin('111111')).toBe('fraco');
    expect(validateNewPin('123456')).toBe('fraco');
    expect(validateNewPin('654321')).toBe('fraco');
    expect(validateNewPin('12345')).toBe('tamanho');
    expect(validateNewPin('12a456')).toBe('so_numeros');
    expect(validateNewPin('135790')).toBeNull();
    expect(validateNewPin('120120')).toBeNull();
    expect(isWeakPin('901234')).toBe(false);
  });
  it('sanitiza entrada', () => {
    expect(sanitizePinInput('12 34-5678')).toBe('123456');
    expect(sanitizePinInput('abc')).toBe('');
  });
});

describe('pinLogic: contagem de erros', () => {
  it('5 erros bloqueiam; restantes diminuem', () => {
    let s = EMPTY_FAILS;
    for (let i = 1; i <= 4; i++) {
      s = registerFail(s);
      expect(s.blocked).toBe(false);
      expect(remainingTries(s)).toBe(5 - i);
    }
    s = registerFail(s);
    expect(s.blocked).toBe(true);
    expect(remainingTries(s)).toBe(0);
  });
  it('mensagens de plural', () => {
    expect(wrongPinMessage(3)).toBe('PIN errado. Restam 3 tentativas.');
    expect(wrongPinMessage(1)).toBe('PIN errado. Resta 1 tentativa.');
    expect(wrongPinMessage(0)).toContain('bloqueado');
  });
  it('interpreta os códigos do servidor', () => {
    expect(interpretPinError('pin_incorreto', 3, 9)).toMatchObject({ kind: 'wrong', restantes: 3 });
    expect(interpretPinError('pin_incorreto', undefined, 2)).toMatchObject({ kind: 'wrong', restantes: 2 });
    expect(interpretPinError('pin_incorreto', 0, 2).kind).toBe('blocked');
    expect(interpretPinError('pin_bloqueado', undefined, 5).kind).toBe('blocked');
    expect(interpretPinError('aparelho_suspenso', undefined, 5).kind).toBe('device_suspended');
    expect(interpretPinError('aparelho_invalido', undefined, 5).kind).toBe('device_revoked');
    expect(interpretPinError('exige_senha', undefined, 5).kind).toBe('needs_password');
    expect(interpretPinError('sem_internet', undefined, 5).kind).toBe('network');
  });
});

describe('pinLogic: verificador local PBKDF2', () => {
  it('confere o PIN certo e recusa o errado (iterações reduzidas)', async () => {
    const v = await makeVerifier('135790', 1000);
    expect(v.iterations).toBe(1000);
    expect(await checkVerifier('135790', v)).toBe(true);
    expect(await checkVerifier('135791', v)).toBe(false);
    const v2 = await makeVerifier('135790', 1000);
    expect(v2.salt).not.toBe(v.salt);
  });
  it('parseVerifier tolera lixo', () => {
    expect(parseVerifier(null)).toBeNull();
    expect(parseVerifier('{')).toBeNull();
    expect(parseVerifier('{"v":2}')).toBeNull();
    expect(parseVerifier(JSON.stringify({ v: 1, iterations: 600000, salt: 'a', hash: 'b' }))).not.toBeNull();
    expect(parseVerifier(JSON.stringify({ v: 1, iterations: 5, salt: 'a', hash: 'b' }))).toBeNull();
    expect(parseVerifier(JSON.stringify({ v: 1, iterations: 599999, salt: 'a', hash: 'b' }))).toBeNull();
  });
});
