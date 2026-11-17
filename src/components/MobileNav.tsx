import React, { useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useAuth } from '../auth/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import { useAccess } from '../hooks/useAccess';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useTheme } from '../hooks/useTheme';
import { useTopmostEscape } from '../hooks/useTopmostEscape';
import { ConfirmationModal } from '../modals/ConfirmationModal';
import { PHONE_TABS, PHONE_TAB_LABEL, moreSheetItems, type PhoneTab } from '../services/mobileNav';
import type { NavId } from '../services/accessView';
import { pendingPhotoCount } from '../services/photoStore';
import { signOutMessage } from '../services/signOutText';
import { Icon, type IconName } from './ui/Icon';

// Barra de baixo e folha "Mais" do celular (docs/NUVEM-UX.md 8.1). Só o `src/auth/boot.tsx` a importa (lazy): o modo arquivo nunca a carrega.

interface MobileNavProps { activeTab: NavId; setActiveTab: (tab: NavId) => void }

const TAB_ICON: Record<PhoneTab, IconName> = { OFICINA: 'oficina', AGENDA: 'agenda', CLIENTES: 'clientes' };
const MORE_ICON: Record<NavId, IconName> = {
  HOJE: 'bandeira', OFICINA: 'oficina', AGENDA: 'agenda', PROCESSOS: 'processos', CLIENTES: 'clientes',
  FINANCEIRO: 'financeiro', PECAS: 'pecas', CONFIG: 'config',
};

const MoreSheet: React.FC<{ onClose: () => void; onPick: (tab: NavId) => void; onSignOut: () => void }> = ({ onClose, onPick, onSignOut }) => {
  const access = useAccess();
  const { sharedDevice } = useAuth();
  const [theme, setTheme] = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(true, ref);
  useTopmostEscape(true, onClose);
  const items = moreSheetItems(access);
  return ReactDOM.createPortal(
    <div className="mobile-sheet-overlay" onClick={onClose}>
      <div ref={ref} className="mobile-sheet" role="dialog" aria-modal="true" aria-label="Mais opções" onClick={(e) => e.stopPropagation()}>
        <div className="mobile-sheet-grip" aria-hidden="true" />
        {items.map(item => (
          <button key={item.id} type="button" className="mobile-sheet-item" onClick={() => onPick(item.id)}>
            <Icon name={MORE_ICON[item.id]} size={20} />
            <span className="mobile-sheet-label">{item.label}</span>
            <span className="mobile-sheet-badge">{item.badge}</span>
          </button>
        ))}
        <div className="mobile-sheet-group" role="group" aria-label="Aparência">
          <span className="mobile-sheet-title">Aparência</span>
          <div className="segmented">
            <button type="button" className="segmented-btn" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>Escuro</button>
            <button type="button" className="segmented-btn" aria-pressed={theme === 'pastel'} onClick={() => setTheme('pastel')}>Pastel</button>
          </div>
        </div>
        {!sharedDevice && (
          <button type="button" className="mobile-sheet-item" onClick={onSignOut}>
            <Icon name="sair" size={20} />
            <span className="mobile-sheet-label">Sair deste aparelho</span>
          </button>
        )}
        <button type="button" className="btn-secondary mobile-sheet-close" onClick={onClose}>Fechar</button>
      </div>
    </div>,
    document.body,
  );
};

export const MobileNav: React.FC<MobileNavProps> = ({ activeTab, setActiveTab }) => {
  const auth = useAuth();
  const { cloud, hasPendingChanges } = useDatabase();
  const [sheet, setSheet] = useState(false);
  const [signOutAsk, setSignOutAsk] = useState(false);
  const onPhoneTab = (PHONE_TABS as readonly NavId[]).includes(activeTab);
  // "Mais" fica marcado quando a tela aberta não é uma das três da barra (ex.: Disponível no computador).
  const moreActive = sheet || !onPhoneTab;

  return (
    <>
      <nav className="mobile-nav" aria-label="Menu principal">
        {PHONE_TABS.map(id => (
          <button key={id} type="button" className="mobile-nav-item" aria-current={activeTab === id ? 'page' : undefined} onClick={() => setActiveTab(id)}>
            <Icon name={TAB_ICON[id]} size={22} />
            <span>{PHONE_TAB_LABEL[id]}</span>
          </button>
        ))}
        <button
          type="button" className="mobile-nav-item" aria-haspopup="dialog" aria-expanded={sheet}
          aria-current={moreActive && !sheet ? 'page' : undefined} onClick={() => setSheet(true)}
        >
          <Icon name="processos" size={22} />
          <span>Mais</span>
        </button>
      </nav>
      {sheet && (
        <MoreSheet
          onClose={() => setSheet(false)}
          onPick={(tab) => { setSheet(false); setActiveTab(tab); }}
          onSignOut={() => { setSheet(false); setSignOutAsk(true); }}
        />
      )}
      {signOutAsk && ReactDOM.createPortal(
        <ConfirmationModal
          isOpen onClose={() => setSignOutAsk(false)} onConfirm={() => { setSignOutAsk(false); void auth.signOut(); }}
          title="Sair deste aparelho?" message={signOutMessage(cloud?.pending ?? 0, hasPendingChanges, pendingPhotoCount())}
          confirmText="Sair" confirmColor="danger"
        />,
        document.body,
      )}
    </>
  );
};

