import React from 'react';
import { desktopOnlyText } from '../services/mobileNav';
import type { NavId } from '../services/accessView';
import { Icon } from './ui/Icon';

/** Tela de qualquer item fora do celular (docs/NUVEM-UX.md 8.2). Só o modo nuvem a carrega (lazy). */
export const DesktopOnly: React.FC<{ tab: NavId; onBack: () => void }> = ({ tab, onBack }) => {
  const t = desktopOnlyText(tab);
  return (
    <div className="empty-state desktop-only" role="status">
      <Icon name="computador" size={40} />
      <h2 className="empty-state-title">{t.title}</h2>
      <p className="empty-state-text">{t.text}</p>
      <button type="button" className="btn" onClick={onBack}>{t.back}</button>
    </div>
  );
};
