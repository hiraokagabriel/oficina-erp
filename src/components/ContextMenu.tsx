import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

/** Item sem `label` é renderizado como divisória (ver `divider`); por isso icon/label/onClick são opcionais. */
export interface MenuItem {
  icon?: React.ReactNode;
  label?: string;
  /** Recebe o elemento que tinha o foco ao abrir o menu (botão "Mais"), para devolver o foco ao fechar uma janela aberta pela ação. */
  onClick?: (origin: HTMLElement | null) => void;
  variant?: 'default' | 'danger' | 'success' | 'primary';
  divider?: boolean;
  /** Submenu: o item vira um botão que expande/recolhe as opções abaixo dele (não dispara `onClick` nem fecha o menu). */
  children?: MenuItem[];
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  // Só Esc/Tab devolvem o foco ao botão de origem; ao escolher uma ação (que pode abrir outra janela) ou clicar fora, não se disputa o foco.
  const restoreFocusRef = useRef(false);
  // Lido na 1ª renderização (não no efeito): o StrictMode remonta o efeito e o foco já estaria no menu.
  const [origin] = useState(() => document.activeElement as HTMLElement | null);
  // Índice do item com submenu aberto; `focusChildRef` pede foco no 1º filho após abrir por seta direita.
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const focusChildRef = useRef(false);

  useEffect(() => {
    if (openIdx !== null && focusChildRef.current) {
      focusChildRef.current = false;
      menuRef.current?.querySelector<HTMLButtonElement>(`[data-sub-of="${openIdx}"] button`)?.focus();
    }
  }, [openIdx]);

  // Ajusta a posição para o menu inteiro caber na janela. Layout effect: corrige antes de pintar.
  // Roda de novo ao abrir/fechar um submenu (o menu cresce) e se a janela mudar de tamanho.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const MARGIN = 16;
    const fit = () => {
      // offsetWidth/Height ignoram o transform da animação de entrada (scale 0.92), que faria getBoundingClientRect medir menor.
      // maxHeight + overflowY do menu já limitam a altura à janela; aqui só se desloca.
      const nextX = Math.max(MARGIN, Math.min(x, window.innerWidth - el.offsetWidth - MARGIN));
      const nextY = Math.max(MARGIN, Math.min(y, window.innerHeight - el.offsetHeight - MARGIN));
      setPosition(prev => (prev.x === nextX && prev.y === nextY ? prev : { x: nextX, y: nextY }));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [x, y, openIdx, items]);

  // Teclado: o foco entra no primeiro item ao abrir e volta ao botão de origem ao fechar.
  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { if (restoreFocusRef.current && origin?.isConnected) origin.focus?.(); };
  }, [origin]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab') {
        restoreFocusRef.current = true;
        onClose();
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      if (e.key === 'ArrowRight' && active?.dataset.parent !== undefined) {
        // Abre o submenu (se ainda fechado) e leva o foco ao primeiro filho.
        e.preventDefault();
        const idx = Number(active.dataset.parent);
        focusChildRef.current = true;
        setOpenIdx(idx);
        if (active.getAttribute('aria-expanded') === 'true') {
          focusChildRef.current = false;
          menuRef.current?.querySelector<HTMLButtonElement>(`[data-sub-of="${idx}"] button`)?.focus();
        }
        return;
      }
      if (e.key === 'ArrowLeft') {
        // Recolhe o submenu e devolve o foco ao item pai (do filho, ou do próprio pai se estiver aberto).
        const sub = active?.closest<HTMLElement>('[data-sub-of]');
        const idx = sub ? Number(sub.dataset.subOf) : active?.dataset.parent !== undefined && active.getAttribute('aria-expanded') === 'true' ? Number(active.dataset.parent) : null;
        if (idx === null) return;
        e.preventDefault();
        setOpenIdx(null);
        menuRef.current?.querySelector<HTMLButtonElement>(`[data-parent="${idx}"]`)?.focus();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
        if (buttons.length === 0) return;
        e.preventDefault();
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === 'ArrowDown' ? (at + 1) % buttons.length : (at - 1 + buttons.length) % buttons.length;
        buttons[next].focus();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      // Previne menu nativo do browser
      e.preventDefault();
    };

    // Adiciona listeners imediatamente
    document.addEventListener('click', handleClick, { capture: true });
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleClick, { capture: true });
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const getVariantColor = (variant?: string) => {
    switch (variant) {
      case 'danger': return 'var(--text-danger)';
      case 'success': return 'var(--text-success)';
      case 'primary': return 'var(--accent-text)';
      default: return 'var(--text)';
    }
  };

  const getVariantBg = (variant?: string) => {
    switch (variant) {
      case 'danger': return 'color-mix(in srgb, var(--danger-fill) 12%, transparent)';
      case 'success': return 'color-mix(in srgb, var(--success-fill) 12%, transparent)';
      case 'primary': return 'var(--accent-soft)';
      default: return 'var(--accent-soft)';
    }
  };

  const renderButton = (
    item: MenuItem,
    opts: { onActivate: () => void; parentIndex?: number; expanded?: boolean }
  ) => (
    <button
      role="menuitem"
      aria-haspopup={opts.parentIndex !== undefined ? 'menu' : undefined}
      aria-expanded={opts.expanded}
      data-parent={opts.parentIndex}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        opts.onActivate();
      }}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        background: 'transparent',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: '0.9rem',
        fontWeight: 500,
        color: getVariantColor(item.variant),
        transition: 'all 0.15s ease',
        textAlign: 'left',
        outline: 'none'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = getVariantBg(item.variant);
        e.currentTarget.style.transform = 'translateX(4px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.transform = 'translateX(0)';
      }}
    >
      <span
        style={{
          fontSize: '1.2rem',
          width: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        {item.icon}
      </span>
      <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{item.label}</span>
      {opts.parentIndex !== undefined && (
        <span aria-hidden="true" style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>{opts.expanded ? '▾' : '▸'}</span>
      )}
    </button>
  );

  const content = (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        boxSizing: 'border-box',
        minWidth: 240,
        maxWidth: 320,
        maxHeight: 'calc(100vh - 32px)',
        overflowY: 'auto',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: `
          0 0 0 1px rgba(255,255,255,0.1),
          0 8px 16px rgba(0, 0, 0, 0.12),
          0 16px 48px rgba(0, 0, 0, 0.24)
        `,
        backdropFilter: 'blur(20px)',
        padding: 8,
        zIndex: 99999,
        animation: 'contextMenuFadeIn 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        transformOrigin: 'top left'
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, index) => {
        // Renderiza divider
        if (item.divider && !item.label) {
          return (
            <div
              key={`divider-${index}`}
              style={{
                height: 1,
                background: 'var(--border)',
                margin: '8px 8px'
              }}
            />
          );
        }

        // Pula items vazios
        if (!item.label) return null;

        const hasChildren = !!item.children && item.children.length > 0;
        const expanded = hasChildren && openIdx === index;

        return (
          <React.Fragment key={index}>
            {renderButton(item, {
              onActivate: hasChildren
                ? () => setOpenIdx(prev => (prev === index ? null : index))
                : () => { item.onClick?.(origin); onClose(); },
              parentIndex: hasChildren ? index : undefined,
              expanded: hasChildren ? expanded : undefined,
            })}
            {expanded && (
              <div role="group" data-sub-of={index} style={{ marginLeft: 22, borderLeft: '2px solid var(--border)', paddingLeft: 4 }}>
                {item.children!.map((child, ci) => child.label ? (
                  <React.Fragment key={ci}>
                    {renderButton(child, { onActivate: () => { child.onClick?.(origin); onClose(); } })}
                  </React.Fragment>
                ) : null)}
              </div>
            )}
          </React.Fragment>
        );
      })}

    </div>
  );

  // Renderiza no body usando portal
  return ReactDOM.createPortal(content, document.body);
};