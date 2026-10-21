import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon, ICON_NAMES, ICON_SPRITE, buildSpriteMarkup } from './Icon';

describe('Icon (sprite local)', () => {
  it('todo nome de IconName existe no sprite, com conteúdo', () => {
    for (const n of ICON_NAMES) {
      expect(ICON_SPRITE[n], n).toBeTruthy();
      expect(ICON_SPRITE[n].length, n).toBeGreaterThan(10);
    }
  });

  it('o sprite não tem nomes sobrando nem repetidos', () => {
    expect(Object.keys(ICON_SPRITE).sort()).toEqual([...ICON_NAMES].sort());
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });

  it('o sprite gera um <symbol> por ícone', () => {
    const markup = buildSpriteMarkup();
    for (const n of ICON_NAMES) expect(markup).toContain(`id="oficina-ic-${n}"`);
  });

  it('decorativo vira aria-hidden; com title vira img com aria-label', () => {
    const deco = renderToStaticMarkup(<Icon name="editar" />);
    expect(deco).toContain('aria-hidden="true"');
    expect(deco).toContain('href="#oficina-ic-editar"');
    const labeled = renderToStaticMarkup(<Icon name="alerta" title="OS atrasada" size={24} />);
    expect(labeled).toContain('role="img"');
    expect(labeled).toContain('aria-label="OS atrasada"');
    expect(labeled).not.toContain('aria-hidden');
    expect(labeled).toContain('width="24"');
  });
});
