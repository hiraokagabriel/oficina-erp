import { describe, expect, it } from 'vitest';
import { classifyAccess, isBannedError, parseAuthUrl, pickScreen } from './screens';
import type { ScreenInput } from './screens';

const base: ScreenInput = {
  configured: true, loading: false, route: 'app', linkError: false, hasSession: false, membership: 'unknown',
  mfaPending: false, sharedDevice: false, gateClosed: false,
};
const pick = (o: Partial<ScreenInput>) => pickScreen({ ...base, ...o });

describe('pickScreen', () => {
  it('sem configuração, carregando e entrar', () => {
    expect(pick({ configured: false })).toBe('notConfigured');
    expect(pick({ loading: true })).toBe('loading');
    expect(pick({})).toBe('login');
  });
  it('com sessão: espera a membership, entra no app, desativado, 2 etapas', () => {
    expect(pick({ hasSession: true })).toBe('loading');
    expect(pick({ hasSession: true, membership: 'active' })).toBe('app');
    expect(pick({ hasSession: true, membership: 'none' })).toBe('deactivated');
    expect(pick({ hasSession: true, membership: 'active', mfaPending: true })).toBe('mfa');
  });
  it('rotas de convite e nova senha', () => {
    expect(pick({ route: 'convite', hasSession: true, membership: 'active' })).toBe('invite');
    expect(pick({ route: 'convite' })).toBe('inviteLinkError');
    expect(pick({ route: 'convite', hasSession: true, linkError: true })).toBe('inviteLinkError');
    expect(pick({ route: 'nova-senha', hasSession: true })).toBe('resetPassword');
    expect(pick({ route: 'nova-senha', linkError: true })).toBe('resetLinkError');
  });
  it('PC compartilhado: sem sessão vai a "Quem está usando"; fechado cobre o app; aberto é o app', () => {
    expect(pick({ sharedDevice: true })).toBe('who');
    expect(pick({ sharedDevice: true, hasSession: true, membership: 'active', gateClosed: true })).toBe('lockedApp');
    expect(pick({ sharedDevice: true, hasSession: true, membership: 'active' })).toBe('app');
  });
  it('desativado vale mesmo em PC compartilhado', () => {
    expect(pick({ sharedDevice: true, hasSession: true, membership: 'none', gateClosed: true })).toBe('deactivated');
  });
});

describe('parseAuthUrl', () => {
  it('rotas e erro do link', () => {
    expect(parseAuthUrl('/', '')).toEqual({ route: 'app', linkError: false });
    expect(parseAuthUrl('/convite', '#access_token=a&type=invite')).toEqual({ route: 'convite', linkError: false });
    expect(parseAuthUrl('/nova-senha/', '#error=access_denied&error_code=otp_expired')).toEqual({ route: 'nova-senha', linkError: true });
    expect(parseAuthUrl('/x/convite', '', '?error=1').linkError).toBe(true);
  });
});

describe('isBannedError (erro real do GoTrue para usuário banido)', () => {
  it('reconhece o código e a mensagem medidos', () => {
    expect(isBannedError({ code: 'user_banned', message: 'Invalid Refresh Token: User Banned' })).toBe(true);
    expect(isBannedError({ message: 'Invalid Refresh Token: User Banned' })).toBe(true);
    expect(isBannedError({ message: 'User is banned' })).toBe(false);
  });
  it('outros erros de refresh não contam', () => {
    expect(isBannedError({ code: 'refresh_token_not_found', message: 'Invalid Refresh Token: Refresh Token Not Found' })).toBe(false);
    expect(isBannedError(null)).toBe(false);
    expect(isBannedError(undefined)).toBe(false);
  });
});

describe('classifyAccess', () => {
  it('separa desativado, entrar de novo e papel mudou', () => {
    expect(classifyAccess({ sessionValid: false, membership: null, currentRole: 'recepcao' })).toBe('reauth');
    expect(classifyAccess({ sessionValid: false, userBanned: true, membership: null, currentRole: 'recepcao' })).toBe('deactivated');
    expect(classifyAccess({ sessionValid: false, userBanned: false, membership: null, currentRole: 'recepcao' })).toBe('reauth');
    expect(classifyAccess({ sessionValid: true, membership: null, currentRole: 'recepcao' })).toBe('deactivated');
    expect(classifyAccess({ sessionValid: true, membership: { active: false, role: 'recepcao' }, currentRole: 'recepcao' })).toBe('deactivated');
    expect(classifyAccess({ sessionValid: true, membership: { active: true, role: 'mecanico' }, currentRole: 'recepcao' })).toBe('roleChanged');
    expect(classifyAccess({ sessionValid: true, membership: { active: true, role: 'recepcao' }, currentRole: 'recepcao' })).toBe('ok');
  });
});
