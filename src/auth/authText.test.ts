import { describe, expect, it } from 'vitest';
import { MSG, classifyForgotError, classifySignInError, initialsOf, validateEmail, validateNewPassword, validateSignIn } from './authText';

describe('authText', () => {
  it('valida e-mail e senha de entrada', () => {
    expect(validateEmail('')).toBe(MSG.emailEmpty);
    expect(validateEmail('ana')).toBe(MSG.emailBad);
    expect(validateEmail(' ana@x.com ')).toBeNull();
    expect(validateSignIn('ana@x.com', '')).toEqual({ field: 'password', message: MSG.passwordEmpty });
    expect(validateSignIn('', 'x')?.field).toBe('email');
    expect(validateSignIn('ana@x.com', 'x')).toBeNull();
  });
  it('senha nova: mínimo 8 e repetição', () => {
    expect(validateNewPassword('1234567', '1234567')).toBe(MSG.passwordShort);
    expect(validateNewPassword('12345678', '1234567x')).toBe(MSG.passwordMismatch);
    expect(validateNewPassword('carro-azul-2026', 'carro-azul-2026')).toBeNull();
  });
  it('classifica erros de entrada', () => {
    expect(classifySignInError({ code: 'invalid_credentials', status: 400 }, true).kind).toBe('credentials');
    expect(classifySignInError({ code: 'user_banned', status: 400 }, true).kind).toBe('deactivated');
    expect(classifySignInError({ code: 'email_not_confirmed' }, true).kind).toBe('invite');
    expect(classifySignInError({ status: 429 }, true).kind).toBe('rate');
    expect(classifySignInError({ code: 'invalid_credentials' }, false).kind).toBe('offline');
    expect(classifySignInError({ name: 'AuthRetryableFetchError', status: 0 }, true).kind).toBe('offline');
    expect(classifySignInError({ status: 500 }, true).kind).toBe('unknown');
  });
  it('erros do "esqueci a senha"', () => {
    expect(classifyForgotError({ status: 429 }, true)).toBe(MSG.forgotRate);
    expect(classifyForgotError({}, false)).toBe(MSG.offlineForgot);
  });
  it('iniciais', () => {
    expect(initialsOf('Ana')).toBe('AN');
    expect(initialsOf('Ana Maria Souza')).toBe('AS');
    expect(initialsOf(null)).toBe('?');
  });
});
