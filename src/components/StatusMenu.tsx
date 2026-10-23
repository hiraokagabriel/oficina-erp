import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { OSStatus, STATUS_LABELS } from '../types';
import { Icon } from './ui/Icon';

/**
 * Botão "Status: X" que abre um menu de escolha. O menu só existe no DOM quando aberto
 * (nada de um <select> por linha) e trocar de status exige abrir e escolher de propósito:
 * setas ou letras com o botão fechado não mudam nada. Estilos em styles-processos.css.
 */

interface StatusMenuProps {
  id: string;
  osNumber: number;
  current: OSStatus;
  statuses: readonly OSStatus[];
  onSelect: (id: string, status: OSStatus) => void;
}

interface MenuPos { top: number; left: number; minWidth: number }

const GAP = 4;

const StatusMenuImpl: React.FC<StatusMenuProps> = ({ id, osNumber, current, statuses, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) btnRef.current?.focus();
  }, []);

  // Posiciona junto ao botão (fixo, pois a tabela tem rolagem própria) e vira para cima se faltar espaço.
  const place = useCallback(() => {
    if (!btnRef.current || !menuRef.current) return;
    const b = btnRef.current.getBoundingClientRect();
    const m = menuRef.current.getBoundingClientRect();
    let top = b.bottom + GAP;
    if (top + m.height > window.innerHeight - 8) top = Math.max(8, b.top - GAP - m.height);
    const left = Math.max(8, Math.min(b.left, window.innerWidth - m.width - 8));
    setPos({ top, left, minWidth: b.width });
  }, []);
  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  // Foco inicial no item atual
  useEffect(() => {
    if (!open || !pos) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    const idx = statuses.indexOf(current);
    items?.[idx >= 0 ? idx : 0]?.focus();
  }, [open, pos === null]);

  // Fecha ao clicar fora; ao rolar ou redimensionar, acompanha o botão
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener('mousedown', onDown, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, close, place]);

  const choose = (status: OSStatus) => {
    close(true);
    if (status !== current) onSelect(id, status);
  };

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => items[(i + items.length) % items.length]?.focus();
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focusAt(at + 1); break;
      case 'ArrowUp': e.preventDefault(); focusAt(at - 1); break;
      case 'Home': e.preventDefault(); focusAt(0); break;
      case 'End': e.preventDefault(); focusAt(items.length - 1); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); close(true); break;
      case 'Tab': e.preventDefault(); close(true); break;
      default: break;
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="pr-sm-btn"
        data-status-btn={id}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Status da OS #${osNumber}: ${STATUS_LABELS[current]}. Abrir opções`}
        onClick={() => { setPos(null); setOpen(o => !o); }}
      >
        <span className="pr-sm-text">Status: <strong>{STATUS_LABELS[current]}</strong></span>
        <Icon name="proximo" size={14} className="pr-sm-caret" />
      </button>
      {open && ReactDOM.createPortal(
        <div
          ref={menuRef}
          className="pr-sm-menu"
          role="menu"
          aria-label={`Mudar status da OS #${osNumber}`}
          style={pos ? { top: pos.top, left: pos.left, minWidth: pos.minWidth } : { top: 0, left: 0, visibility: 'hidden' }}
          onKeyDown={onMenuKey}
        >
          {statuses.map(s => (
            <button
              key={s}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`pr-sm-item${s === current ? ' is-current' : ''}`}
              onClick={() => choose(s)}
            >
              <span className="pr-sm-check">{s === current && <Icon name="check" size={14} />}</span>
              {STATUS_LABELS[s]}
              {s === current && <span className="pr-sr"> (atual)</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
};

export const StatusMenu = React.memo(StatusMenuImpl);
