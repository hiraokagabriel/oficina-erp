import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

interface MenuItem {
  icon: string;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'success' | 'primary';
  divider?: boolean;
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

  useEffect(() => {
    // Ajusta posição para não sair da tela
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 16;
      }

      if (y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 16;
      }

      setPosition({ x: Math.max(16, adjustedX), y: Math.max(16, adjustedY) });
    }
  }, [x, y]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
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
      case 'danger': return '#e54c54';
      case 'success': return '#04d361';
      case 'primary': return '#8257e6';
      default: return 'var(--text)';
    }
  };

  const getVariantBg = (variant?: string) => {
    switch (variant) {
      case 'danger': return 'rgba(229, 76, 76, 0.1)';
      case 'success': return 'rgba(4, 211, 97, 0.1)';
      case 'primary': return 'rgba(130, 87, 230, 0.1)';
      default: return 'rgba(130, 87, 230, 0.08)';
    }
  };

  const content = (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        minWidth: 240,
        maxWidth: 320,
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

        return (
          <button
            key={index}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              item.onClick();
              onClose();
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
          </button>
        );
      })}

      <style>{`
        @keyframes contextMenuFadeIn {
          from {
            opacity: 0;
            transform: scale(0.92) translateY(-8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );

  // Renderiza no body usando portal
  return ReactDOM.createPortal(content, document.body);
};