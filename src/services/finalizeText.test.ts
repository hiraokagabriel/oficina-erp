import { describe, it, expect } from 'vitest';
import { buildFinalizeMessage, buildInstallmentMessage } from './finalizeText';

const norm = (s: string) => s.replace(/\u00a0/g, ' ');

describe('buildFinalizeMessage', () => {
  it('sem adiantamento', () => {
    expect(norm(buildFinalizeMessage(100000, 100000))).toBe(
      'Valor total da OS: R$ 1.000,00\nVai entrar nas Receitas: R$ 1.000,00\nNo próximo passo você escolhe à vista ou parcelado.');
  });
  it('com adiantamento', () => {
    expect(norm(buildFinalizeMessage(100000, 70000))).toBe(
      'Valor total da OS: R$ 1.000,00\nAdiantamento já recebido: R$ 300,00\nVai entrar nas Receitas: R$ 700,00\nNo próximo passo você escolhe à vista ou parcelado.');
  });
  it('adiantamento cobre o total', () => {
    const m = norm(buildFinalizeMessage(100000, 0));
    expect(m).toContain('Vai entrar nas Receitas: R$ 0,00');
    expect(m).toContain('Nada a lançar: a OS já foi paga pelo adiantamento.');
  });
});

describe('buildInstallmentMessage', () => {
  it('sem adiantamento só mostra o total', () => {
    const m = norm(buildInstallmentMessage(100000, 100000));
    expect(m).toContain('Valor total da OS: R$ 1.000,00');
    expect(m).not.toContain('Falta receber');
  });
  it('com adiantamento mostra falta receber', () => {
    expect(norm(buildInstallmentMessage(100000, 70000))).toContain('Falta receber (vai para as Receitas): R$ 700,00');
  });
});
