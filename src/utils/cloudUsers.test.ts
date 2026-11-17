import { describe, expect, it } from 'vitest';
import {
  adminErrorMessage, formatDay, initials, isOnlyActiveOwner, parseMemberRows, personNameById, roleChangeTitle, sortMembers, stuckPhotosText, validateInvite,
} from './cloudUsers';

const rows = parseMemberRows([
  { user_id: 'a', display_name: 'Zeca', role: 'dono', active: true, invited_at: '2026-11-01T12:00:00Z' },
  { user_id: 'b', display_name: 'Ana', role: 'recepcao', active: false, invited_at: '2026-11-02T12:00:00Z' },
  { user_id: 'c', display_name: 'Beto', role: 'mecanico', active: true, invited_at: '2026-11-03T12:00:00Z' },
  { user_id: 'd', role: 'invalido' },
  null,
]);

describe('cloudUsers', () => {
  it('lê só linhas válidas', () => { expect(rows.map(r => r.userId)).toEqual(['a', 'b', 'c']); });
  it('ativos antes de desativados, por nome', () => {
    expect(sortMembers(rows).map(r => r.displayName)).toEqual(['Beto', 'Zeca', 'Ana']);
  });
  it('único Dono ativo', () => {
    expect(isOnlyActiveOwner(rows, 'a')).toBe(true);
    expect(isOnlyActiveOwner(rows, 'c')).toBe(false);
  });
  it('iniciais', () => {
    expect(initials('Ana Lima')).toBe('AL');
    expect(initials('ana')).toBe('AN');
    expect(initials('  ')).toBe('?');
  });
  it('mensagens de erro do servidor em texto simples', () => {
    for (const c of ['ultimo_dono', 'ja_membro', 'email_ja_cadastrado', 'exige_mfa', 'auth_indisponivel', 'sem_internet']) {
      expect(adminErrorMessage(c, 'x')).not.toBe('x');
    }
    expect(adminErrorMessage('outro', 'Texto do servidor')).toBe('Texto do servidor');
    expect(adminErrorMessage('outro')).toMatch(/Tente de novo/);
  });
  it('título da troca de papel', () => { expect(roleChangeTitle('Ana', 'mecanico')).toBe('Mudar o papel de Ana para Mecânico?'); });
  it('valida convite', () => {
    expect(Object.keys(validateInvite({ name: '', email: 'x', role: null })).sort()).toEqual(['email', 'name', 'role']);
    expect(validateInvite({ name: 'Ana', email: 'a@b.co', role: 'recepcao' })).toEqual({});
  });
  it('data dd/mm/aaaa', () => {
    expect(formatDay('2026-11-12T12:00:00')).toBe('12/11/2026');
    expect(formatDay('')).toBe('');
  });
});

describe('fotos presas por pessoa', () => {
  it('texto com nome, singular e sem nome', () => {
    expect(stuckPhotosText(3, 'Ana')).toBe('3 fotos de Ana');
    expect(stuckPhotosText(1, ' Ana ')).toBe('1 foto de Ana');
    expect(stuckPhotosText(2)).toBe('2 fotos da pessoa que saiu deste aparelho');
    expect(stuckPhotosText(2, '  ')).toBe('2 fotos da pessoa que saiu deste aparelho');
  });
  it('nome pelo userId; desconhecido vira vazio', () => {
    expect(personNameById(rows, 'c')).toBe('Beto');
    expect(personNameById(rows, 'zz')).toBe('');
  });
});
