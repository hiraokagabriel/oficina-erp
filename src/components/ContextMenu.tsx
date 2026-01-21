import React, { useEffect, useRef } from 'react';

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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    // ✅ FIX: Delay maior para não fechar imediatamente no clique direito
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 100);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const adjustedX = x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 10 : x;
      const adjustedY = y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 10 : y;
      
      menuRef.current.style.left = `${adjustedX}px`;
      menuRef.current.style.top = `${adjustedY}px`;
    }
  }, [x, y]);

  const getVariantStyles = (variant?: string) => {
    switch (variant) {
      case 'danger':
        return { color: 'var(--danger)', hoverBg: 'rgba(229, 76, 76, 0.1)' };
      case 'success':
        return { color: 'var(--success)', hoverBg: 'rgba(4, 211, 97, 0.1)' };
      case 'primary':
        return { color: 'var(--primary)', hoverBg: 'rgba(130, 87, 230, 0.1)' };
      default:
        return { color: 'var(--text)', hoverBg: 'var(--bg-hover, rgba(0,0,0,0.05))' };
    }
  };

  return (
    <>
      {/* ✅ Overlay com pointer-events para garantir que capture cliques */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9998,
          background: 'rgba(0, 0, 0, 0.01)' // Quase transparente mas captura eventos
        }}
        onClick={onClose}
      />
      
      <div
        ref={menuRef}
        className="context-menu"
        style={{
          position: 'fixed',
          left: x,
          top: y,
          minWidth: 220,
          maxWidth: 280,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255,255,255,0.1)',
          backdropFilter: 'blur(20px)',
          padding: '8px',
          zIndex: 9999,
          animation: 'contextMenuFadeIn 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
          transformOrigin: 'top left'
        }}
        // ✅ Impede que cliques no menu fechem ele
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
                  margin: '8px 4px'
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
                console.log('✅ Menu item clicado:', item.label);
                item.onClick();
                onClose();
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                background: 'transparent',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 500,
                color: getVariantStyles(item.variant).color,
                transition: 'all 0.15s ease',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = getVariantStyles(item.variant).hoverBg;
                e.currentTarget.style.transform = 'translateX(4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.transform = 'translateX(0)';
              }}
            >
              <span style={{ fontSize: '1.1rem', width: 20, textAlign: 'center' }}>
                {item.icon}
              </span>
              <span style={{ flex: 1 }}>{item.label}</span>
            </button>
          );
        })}
      </div>

      <style>{`
        @keyframes contextMenuFadeIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-5px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </>
  );
};