import React, { useState, useRef, useEffect } from 'react';

interface MenuItem {
  icon: string;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'success' | 'primary';
  divider?: boolean;
}

interface ActionMenuProps {
  items: MenuItem[];
  buttonSize?: number;
}

export const ActionMenu: React.FC<ActionMenuProps> = ({ items, buttonSize = 32 }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 10);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

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
    <div 
      style={{ 
        position: 'relative', 
        display: 'inline-block',
        // ✅ FIX: Impede que o menu interfira no drag
        pointerEvents: 'auto'
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
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
          fontSize: '1.1rem',
          fontWeight: 'bold',
          lineHeight: 1
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

      {isOpen && (
        <div
          ref={menuRef}
          className="action-dropdown"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 8,
            minWidth: 200,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255,255,255,0.1)',
            backdropFilter: 'blur(20px)',
            padding: '8px',
            zIndex: 10000,
            animation: 'dropdownFadeIn 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            transformOrigin: 'top right'
          }}
        >
          {items.map((item, index) => {
            // ✅ FIX: Renderiza dividers corretamente
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
            
            // Pula items vazios
            if (!item.label) return null;

            return (
              <button
                key={index}
                onClick={(e) => {
                  e.stopPropagation();
                  item.onClick();
                  setIsOpen(false);
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
                  fontSize: '0.85rem',
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
                <span style={{ fontSize: '1rem', width: 18, textAlign: 'center' }}>
                  {item.icon}
                </span>
                <span style={{ flex: 1 }}>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes dropdownFadeIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
};