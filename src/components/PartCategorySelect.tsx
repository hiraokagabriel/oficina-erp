import React, { useState, useRef, useEffect } from 'react';
import { PartCategory, PART_CATEGORY_META } from '../types';

interface PartCategorySelectProps {
  value: PartCategory | '';
  onChange: (val: PartCategory | '') => void;
  placeholder?: string;
  style?: React.CSSProperties;
}

export const PartCategorySelect: React.FC<PartCategorySelectProps> = ({
  value,
  onChange,
  placeholder = 'Categoria...',
  style,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const selected = value ? PART_CATEGORY_META[value as PartCategory] : null;

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          height: '100%',
          padding: '7px 10px',
          borderRadius: 'var(--radius-lg)',
          border: `1px solid ${
            selected ? `${selected.color}55` : 'var(--border-color)'
          }`,
          borderLeft: `3px solid ${
            selected ? selected.color : 'var(--border-color)'
          }`,
          background: selected ? `${selected.color}12` : 'var(--bg-elevated)',
          color: selected ? selected.color : 'var(--text-muted)',
          fontSize: '0.76rem',
          fontWeight: selected ? 600 : 400,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          transition: 'all var(--transition-fast)',
          boxShadow: 'var(--shadow-sm)',
          whiteSpace: 'nowrap',
          outline: 'none',
        }}
      >
        {selected && (
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: selected.color,
              flexShrink: 0,
            }}
          />
        )}
        <span
          style={{
            flex: 1,
            textAlign: 'left',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {selected ? selected.label : placeholder}
        </span>
        <span
          style={{
            fontSize: '0.55rem',
            opacity: 0.5,
            flexShrink: 0,
            display: 'inline-block',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform var(--transition-fast)',
          }}
        >
          ▼
        </span>
      </button>

      {/* Floating dropdown panel com glassmorphism */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 9999,
            minWidth: '160px',
            width: '100%',
            /* 🎀 Glassmorphism: usa as variáveis do design system */
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
            borderRadius: 'var(--radius-lg)',
            /* Sombra reforçada para destacar do conteúdo atrás */
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(168, 85, 247, 0.08)',
            overflow: 'hidden',
            animation: 'scaleUp 120ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            transformOrigin: 'top center',
          }}
        >
          {/* Linha de brilho no topo (igual ao modal-content::before do design system) */}
          <div style={{
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.35), transparent)',
            flexShrink: 0,
          }} />

          {/* Clear / sem categoria */}
          <DropdownOption
            isActive={value === ''}
            color="var(--text-muted)"
            label="— Sem categoria"
            onClick={() => { onChange(''); setOpen(false); }}
            hasBorderBottom
          />

          {/* Category options */}
          {(Object.keys(PART_CATEGORY_META) as PartCategory[]).map(cat => (
            <DropdownOption
              key={cat}
              isActive={value === cat}
              color={PART_CATEGORY_META[cat].color}
              label={PART_CATEGORY_META[cat].label}
              showDot
              onClick={() => { onChange(cat); setOpen(false); }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/* ---- Sub-componente interno de opção ---- */

interface DropdownOptionProps {
  isActive: boolean;
  color: string;
  label: string;
  onClick: () => void;
  showDot?: boolean;
  hasBorderBottom?: boolean;
}

const DropdownOption: React.FC<DropdownOptionProps> = ({
  isActive,
  color,
  label,
  onClick,
  showDot,
  hasBorderBottom,
}) => {
  const [hovered, setHovered] = useState(false);

  const highlighted = hovered || isActive;

  const bg = highlighted
    ? showDot
      ? `${color}1a`
      : 'rgba(168, 85, 247, 0.12)'
    : 'transparent';

  const textColor = highlighted
    ? showDot
      ? color
      : 'var(--color-primary-400)'
    : 'var(--text-secondary)';

  const borderLeftColor =
    showDot && highlighted ? color : 'transparent';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '7px 12px',
        cursor: 'pointer',
        fontSize: '0.78rem',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderLeft: `3px solid ${borderLeftColor}`,
        borderBottom: hasBorderBottom
          ? '1px solid var(--glass-border)'
          : undefined,
        background: bg,
        color: textColor,
        fontWeight: isActive ? 600 : 400,
        transition: 'all var(--transition-fast)',
      }}
    >
      {showDot && (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
          }}
        />
      )}
      <span style={{ flex: 1 }}>{label}</span>
      {isActive && (
        <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>✓</span>
      )}
    </div>
  );
};
