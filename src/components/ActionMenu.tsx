import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';

/** Item sem `label` é renderizado como divisória (ver `divider`); por isso icon/label/onClick são opcionais. */
export interface MenuItem {
  icon?: string;
  label?: string;
  onClick?: () => void;
  variant?: 'default' | 'danger' | 'success' | 'primary';
  divider?: boolean;
}

interface ActionMenuProps {
  items: MenuItem[];
  buttonSize?: number;
}

export const ActionMenu: React.FC<ActionMenuProps> = ({ items, buttonSize = 32 }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: buttonRect.bottom + 8,
        right: window.innerWidth - buttonRect.right
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    // Listeners imediatos
    document.addEventListener('click', handleClick, { capture: true });
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleClick, { capture: true });
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

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

  const dropdown = isOpen ? (
    <div
      ref={dropdownRef}
      className="action-menu-dropdown"
      style={{
        position: 'fixed',
        top: dropdownPosition.top,
        right: dropdownPosition.right,
        minWidth: 220,
        maxWidth: 300,
        maxHeight: '80vh', // ✅ Permite scroll se tiver muitos items
        overflowY: 'auto', // ✅ Scroll automático
        overflowX: 'hidden',
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
        animation: 'dropdownFadeIn 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        transformOrigin: 'top right',
        // ✅ Estilização do scrollbar
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--border) transparent'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, index) => {
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

        if (!item.label) return null;

        return (
          <button
            key={index}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              item.onClick?.();
              setIsOpen(false);
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
              fontSize: '0.88rem',
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
                fontSize: '1.1rem',
                width: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              {item.icon}
            </span>
            <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{item.label}</span>
          </button>
        );
      })}

    </div>
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setIsOpen(!isOpen);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        title="Mais ações"
        style={{
          width: buttonSize,
          height: buttonSize,
          padding: 0,
          background: isOpen ? 'var(--primary)' : 'transparent',
          border: isOpen ? '1px solid var(--primary)' : '1px solid var(--border)',
          borderRadius: 8,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
          color: isOpen ? '#fff' : 'var(--text-muted)',
          fontSize: '1.2rem',
          fontWeight: 'bold',
          lineHeight: 1,
          outline: 'none'
        }}
        onMouseEnter={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = 'var(--primary)';
            e.currentTarget.style.color = 'var(--primary)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.color = 'var(--text-muted)';
          }
        }}
      >
        ⋮
      </button>

      {/* ✅ Renderiza dropdown no body usando portal */}
      {dropdown && ReactDOM.createPortal(dropdown, document.body)}
    </>
  );
};