import React from 'react';

/**
 * Ícones do OficinaPro: sprite SVG inline local (sem biblioteca), desenhados em grade 24x24,
 * traço 1,75 e cor herdada (currentColor). O sprite é inserido uma única vez no <body> e cada
 * <Icon /> só aponta para ele com <use>, então listas grandes não multiplicam caminhos no DOM.
 *
 * Uso: <Icon name="editar" /> (decorativo, aria-hidden) ou <Icon name="alerta" title="Atrasada" />
 * (o title vira aria-label e o ícone passa a ser anunciado). Ícone sempre junto de texto ou com title.
 */

export const ICON_NAMES = [
  // menu
  'oficina', 'processos', 'agenda', 'financeiro', 'clientes', 'pecas', 'config',
  // ações
  'adicionar', 'editar', 'excluir', 'salvar', 'imprimir', 'buscar', 'fechar', 'voltar', 'proximo',
  'pagar', 'receber', 'alerta', 'info', 'check', 'relogio', 'calendario', 'telefone', 'whatsapp',
  'filtro', 'arquivo', 'chave', 'cifrao', 'bandeira', 'prancheta', 'caixa', 'camera',
  // pictogramas de serviço
  'motor', 'freio', 'suspensao', 'eletrica', 'pneu', 'oleo',
] as const;

export type IconName = typeof ICON_NAMES[number];

/** Conteúdo de cada símbolo (grade 24x24). O traço e a cor vêm do <svg> que usa o símbolo. */
export const ICON_SPRITE: Record<IconName, string> = {
  // --- menu ---
  oficina: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3.5 17.2a1.9 1.9 0 0 0 2.7 2.7l5.8-5.8a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  processos: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  agenda: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7.5 14h5M7.5 17.5h8"/>',
  financeiro: '<path d="M3 21h18M6 21V11M12 21V4M18 21v-7"/>',
  clientes: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16.5 5.2a3 3 0 0 1 0 5.6M18 14.3c2 .8 3.5 2.800 3.500 5.700"/>',
  pecas: '<circle cx="12" cy="12" r="3"/><path d="M10.300 3h3.400l.5 2.300 1.600.9 2.200-.8 1.700 2.900-1.700 1.600v1.800l1.700 1.600-1.700 2.900-2.200-.8-1.600.9-.5 2.300h-3.400l-.5-2.300-1.600-.9-2.200.8-1.700-2.900 1.700-1.600v-1.800L4.300 8.300 6 5.400l2.200.8 1.600-.9z"/>',
  config: '<path d="M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2"/><circle cx="14" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
  // --- ações ---
  adicionar: '<path d="M12 5v14M5 12h14"/>',
  editar: '<path d="M4 20l1-4L16.500 4.500a2.100 2.100 0 0 1 3 3L8 19z"/><path d="M14 7l3 3"/>',
  excluir: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  salvar: '<path d="M5 3h11l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3M7 21v-7h10v7"/>',
  imprimir: '<path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/>',
  buscar: '<circle cx="11" cy="11" r="6.500"/><path d="M20 20l-4.200-4.200"/>',
  fechar: '<path d="M6 6l12 12M18 6L6 18"/>',
  voltar: '<path d="M15 5l-7 7 7 7"/>',
  proximo: '<path d="M9 5l7 7-7 7"/>',
  pagar: '<path d="M12 15V4M7.500 8.500L12 4l4.500 4.500M4 20h16"/>',
  receber: '<path d="M12 4v11M7.500 10.500L12 15l4.500-4.500M4 20h16"/>',
  alerta: '<path d="M12 3.500l9.500 16.500h-19z"/><path d="M12 10v4.500M12 17.500h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.500M12 7.500h.01"/>',
  check: '<path d="M5 12.500l4.500 4.500L19 7.500"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.500 2"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
  telefone: '<path d="M5 4h4l2 5-2.500 1.500a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  whatsapp: '<path d="M3 21l1.600-4.800A9 9 0 1 1 8 19.500z"/><path d="M9.500 9c.5 2.200 2.300 4 4.500 4.500l1-1.200-1.800-1-.8.800c-.8-.4-1.500-1.100-1.900-1.900l.8-.8-1-1.800z"/>',
  filtro: '<path d="M4 5h16l-6 7.500V19l-4 2v-8.500z"/>',
  arquivo: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>',
  chave: '<circle cx="7.500" cy="16.500" r="3.500"/><path d="M10 14l9.500-9.500M16 8l3 3M13.500 10.500l2 2"/>',
  cifrao: '<path d="M12 3v18"/><path d="M16 7.500c-.8-1.300-2.200-2-4-2-2.200 0-3.800 1.100-3.800 2.800 0 3.900 8 1.800 8 5.800 0 1.700-1.700 2.900-4.200 2.900-1.900 0-3.400-.7-4.200-2"/>',
  bandeira: '<path d="M5 21V3"/><path d="M5 4h14v10H5M10 4v10M15 4v10M5 9h14"/><rect x="5" y="4" width="5" height="5" fill="currentColor" stroke="none"/><rect x="10" y="9" width="5" height="5" fill="currentColor" stroke="none"/><rect x="15" y="4" width="4" height="5" fill="currentColor" stroke="none"/>',
  prancheta: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',
  caixa: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  camera: '<path d="M4 8h3l1.500-2.500h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.500"/>',
  // --- pictogramas de serviço ---
  motor: '<path d="M5 9h2l1-2h6l1 2h3v8H7l-2-2z"/><path d="M10 7V5h4v2M3 11v3M21 11v3"/>',
  freio: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 6.500h.01M12 17.500h.01M6.500 12h.01M17.500 12h.01"/>',
  suspensao: '<path d="M12 3v3M9 6h6M8 8.500l8 1.500-8 1.500 8 1.500-8 1.500 8 1.500M12 17.500V21M9 21h6"/>',
  eletrica: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  pneu: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.500"/><path d="M12 3v4.500M12 16.500V21M3 12h4.500M16.500 12H21M5.600 5.600l3.200 3.200M15.200 15.200l3.200 3.200M18.400 5.600l-3.200 3.200M8.800 15.200l-3.200 3.200"/>',
  oleo: '<path d="M12 3c3.500 4.500 6 7.500 6 10.500a6 6 0 0 1-12 0C6 10.500 8.500 7.500 12 3z"/><path d="M9.500 14.500a2.500 2.500 0 0 0 2.500 2.500"/>',
};

const SPRITE_ID = 'oficina-icon-sprite';
const symbolId = (name: IconName) => `oficina-ic-${name}`;

/** Marcação do sprite (um <symbol> por ícone). Exportada para teste e para montagem manual. */
export const buildSpriteMarkup = (): string =>
  ICON_NAMES.map((n) => `<symbol id="${symbolId(n)}" viewBox="0 0 24 24">${ICON_SPRITE[n]}</symbol>`).join('');

/** Insere o sprite no <body> uma única vez (idempotente; sem efeito fora do navegador). */
const ensureSprite = (): void => {
  if (typeof document === 'undefined' || document.getElementById(SPRITE_ID)) return;
  const holder = document.createElement('div');
  holder.id = SPRITE_ID;
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" focusable="false">${buildSpriteMarkup()}</svg>`;
  document.body.appendChild(holder);
};

export interface IconProps {
  name: IconName;
  /** Lado em px (padrão 20). */
  size?: number;
  /** Texto acessível. Sem title, o ícone é decorativo (aria-hidden). */
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const Icon: React.FC<IconProps> = React.memo(({ name, size = 20, title, className, style }) => {
  ensureSprite();
  const a11y = title ? { role: 'img' as const, 'aria-label': title } : { 'aria-hidden': true as const };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      className={className}
      style={{ flex: 'none', ...style }}
      {...a11y}
    >
      <use href={`#${symbolId(name)}`} />
    </svg>
  );
});
Icon.displayName = 'Icon';
