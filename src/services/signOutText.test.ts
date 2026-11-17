import { describe, expect, it } from 'vitest';
import { signOutMessage } from './signOutText';

describe('signOutMessage', () => {
  it('sem pendência pede e-mail e senha', () => {
    expect(signOutMessage(0, false, 0)).toBe('Você vai precisar do e-mail e da senha para entrar de novo aqui.');
  });
  it('conta alterações não enviadas', () => {
    expect(signOutMessage(1, false, 0)).toContain('1 alteração sua que não foi enviada');
    expect(signOutMessage(3, false, 0)).toContain('3 alterações suas que não foram enviadas');
  });
  it('alteração local sem contagem', () => {
    expect(signOutMessage(0, true, 0)).toContain('Ainda há alterações suas');
  });
  it('acrescenta o aviso de fotos', () => {
    expect(signOutMessage(0, false, 2)).toContain('2 fotos ainda não subiram.');
  });
});
