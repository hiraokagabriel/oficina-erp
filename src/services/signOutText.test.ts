import { describe, expect, it } from 'vitest';
import { signOutMessage } from './signOutText';

describe('signOutMessage', () => {
  it('sem pendência pede e-mail e senha', () => {
    expect(signOutMessage(0, false, 0)).toBe('Você vai precisar do e-mail e da senha para entrar de novo aqui.');
  });
  it('conta alterações não enviadas', () => {
    expect(signOutMessage(1, false, 0)).toContain('1 alteração sua que não foi enviada. Ela continua guardada');
    expect(signOutMessage(3, false, 0)).toContain('3 alterações suas que não foram enviadas. Elas continuam guardadas');
  });
  it('alteração local sem contagem', () => {
    expect(signOutMessage(0, true, 0)).toContain('Ainda há alterações suas que não foram enviadas. Elas continuam');
  });
  it('acrescenta o aviso de fotos', () => {
    expect(signOutMessage(0, false, 2)).toContain('2 fotos ainda não subiram.');
  });
  it('singular de foto e alteração juntos, sem repetir texto', () => {
    const m = signOutMessage(1, false, 1);
    expect(m).toContain('1 alteração sua');
    expect(m).toContain('1 foto ainda não subiu. Ela sobe');
    expect(m.match(/continua/g)?.length).toBe(1);
  });
  it('plural de fotos e alterações', () => {
    const m = signOutMessage(2, false, 3);
    expect(m).toContain('2 alterações suas');
    expect(m).toContain('3 fotos ainda não subiram. Elas sobem');
  });
});
