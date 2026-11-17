import { describe, expect, it } from 'vitest';
import { ROLES } from './permissions';
import { buildAccess } from './accessView';
import { DESKTOP_BADGE, PHONE_TABS, desktopOnlyText, initialPhoneTab, isPhoneTab, moreSheetItems } from './mobileNav';

const ids = (role: Parameters<typeof buildAccess>[0]): string[] => moreSheetItems(buildAccess(role)).map(i => i.id);

describe('mobileNav', () => {
  it('barra de baixo: Oficina, Agenda, Clientes', () => {
    expect([...PHONE_TABS]).toEqual(['OFICINA', 'AGENDA', 'CLIENTES']);
    expect(isPhoneTab('AGENDA')).toBe(true);
    expect(isPhoneTab('FINANCEIRO')).toBe(false);
    expect(isPhoneTab('HOJE')).toBe(false);
  });

  it('abre na Oficina', () => {
    expect(initialPhoneTab()).toBe('OFICINA');
  });

  it('Dono vê todos os itens de Mais, na ordem da UX', () => {
    expect(ids('dono')).toEqual(['HOJE', 'PROCESSOS', 'FINANCEIRO', 'PECAS', 'CONFIG']);
  });

  it('Recepção vê Financeiro mas não Configurações', () => {
    expect(ids('recepcao')).toEqual(['HOJE', 'PROCESSOS', 'FINANCEIRO', 'PECAS']);
  });

  it('Mecânico não vê Financeiro nem Configurações', () => {
    expect(ids('mecanico')).toEqual(['HOJE', 'PROCESSOS', 'PECAS']);
  });

  it('modo arquivo (sem papel) libera tudo', () => {
    expect(ids(undefined)).toEqual(['HOJE', 'PROCESSOS', 'FINANCEIRO', 'PECAS', 'CONFIG']);
  });

  it.each(ROLES)('todo item de Mais (%s) leva a etiqueta "No computador" e nenhum repete a barra', (role) => {
    const items = moreSheetItems(buildAccess(role));
    for (const i of items) {
      expect(i.badge).toBe('No computador');
      expect(i.badge).toBe(DESKTOP_BADGE);
      expect(isPhoneTab(i.id)).toBe(false);
    }
  });

  it('rótulos dos itens', () => {
    const labels = moreSheetItems(buildAccess('dono')).map(i => i.label);
    expect(labels).toEqual(['Hoje', 'Processos', 'Financeiro', 'Peças a comprar', 'Configurações']);
  });

  it('texto de "Disponível no computador"', () => {
    const t = desktopOnlyText('FINANCEIRO');
    expect(t.title).toBe('Disponível no computador');
    expect(t.text).toBe('A tela Financeiro precisa de uma tela maior. Abra o OficinaPro no computador da oficina ou num tablet deitado.');
    expect(t.back).toBe('Voltar para a Oficina');
    expect(desktopOnlyText('PECAS').text).toContain('Peças a comprar');
  });
});
