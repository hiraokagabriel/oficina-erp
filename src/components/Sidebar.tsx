import React from 'react';
import { Icon, IconName } from './ui/Icon';
import { SaveIndicator } from './SaveIndicator';

type TabId = 'FINANCEIRO' | 'OFICINA' | 'AGENDA' | 'PROCESSOS' | 'CLIENTES' | 'PECAS' | 'CONFIG';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: TabId) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

// Ordem pelo caminho do carro: entra (Oficina), marca dia (Agenda), acompanha (Processos), quem é (Clientes), cobra (Financeiro).
const NAV_ITEMS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'OFICINA',    label: 'Oficina',        icon: 'oficina' },
  { id: 'AGENDA',     label: 'Agenda',         icon: 'agenda' },
  { id: 'PROCESSOS',  label: 'Processos',      icon: 'processos' },
  { id: 'CLIENTES',   label: 'Clientes',       icon: 'clientes' },
  { id: 'FINANCEIRO', label: 'Financeiro',     icon: 'financeiro' },
  { id: 'PECAS',      label: 'Peças',          icon: 'pecas' },
  { id: 'CONFIG',     label: 'Configurações',  icon: 'config' },
];

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isCollapsed, onToggleCollapse }) => {
  return (
    <nav className={`sidebar ${isCollapsed ? 'sidebar-collapsed' : ''}`} aria-label="Menu principal">
      <div className="logo-area" style={{ justifyContent: isCollapsed ? 'center' : 'flex-start' }}>
        {isCollapsed ? (
          <div className="logo-text" title="OFICINAPRO">
            <span className="logo-highlight">OP</span>
          </div>
        ) : (
          <div className="logo-text">OFICINA<span className="logo-highlight">PRO</span></div>
        )}
      </div>

      <button
        type="button"
        onClick={onToggleCollapse}
        className="btn-sm side-collapse"
        title={isCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
        aria-label={isCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
        aria-expanded={!isCollapsed}
      >
        <Icon name={isCollapsed ? 'proximo' : 'voltar'} size={18} />
        {!isCollapsed && 'Compactar menu'}
      </button>

      <div className="nav-menu">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            type="button"
            className="side-link"
            aria-current={activeTab === item.id ? 'page' : undefined}
            aria-label={isCollapsed ? item.label : undefined}
            title={item.label}
            onClick={() => setActiveTab(item.id)}
          >
            <Icon name={item.icon} />
            {!isCollapsed && <span>{item.label}</span>}
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        <SaveIndicator compact={isCollapsed} />
      </div>
    </nav>
  );
};
