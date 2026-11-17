import { describe, expect, it } from 'vitest';
import { photosPendingLine, photosPendingNotice } from './photoPendingView';

describe('photoPendingView', () => {
  it('sem fotos pendentes, texto vazio', () => {
    expect(photosPendingLine(0)).toBe('');
    expect(photosPendingNotice(0)).toBe('');
    expect(photosPendingNotice(NaN)).toBe('');
  });
  it('singular e plural', () => {
    expect(photosPendingLine(1)).toBe('1 foto ainda não subiu.');
    expect(photosPendingNotice(3)).toBe('3 fotos ainda não subiram. Elas sobem quando esta pessoa entrar de novo neste aparelho.');
    expect(photosPendingNotice(1)).toBe('1 foto ainda não subiu. Ela sobe quando esta pessoa entrar de novo neste aparelho.');
  });
});
