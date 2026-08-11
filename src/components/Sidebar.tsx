import React from 'react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: 'FINANCEIRO' | 'OFICINA' | 'PROCESSOS' | 'CLIENTES' | 'PECAS' | 'CONFIG') => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const NAV_ITEMS: { id: 'FINANCEIRO' | 'OFICINA' | 'PROCESSOS' | 'CLIENTES' | 'PECAS' | 'CONFIG'; label: string; icon: string }[] = [
  { id: 'FINANCEIRO', label: 'Financeiro',      icon: '📊' },
  { id: 'PROCESSOS',  label: 'Processos',       icon: '📋' },
  { id: 'CLIENTES',   label: 'Clientes (CRM)',  icon: '👥' },
  { id: 'OFICINA',    label: 'Oficina',         icon: '🔧' },
  { id: 'PECAS',      label: 'Peças',           icon: '📦' },
  { id: 'CONFIG',     label: 'Config',          icon: '⚙️' },
];

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isCollapsed, onToggleCollapse }) => {
  return (
    <nav className={`sidebar ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
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
        className="btn-sm"
        style={{
          width: '100%',
          marginBottom: 16,
          justifyContent: 'center',
          background: 'transparent',
        }}
        title={isCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
      >
        {isCollapsed ? '➕ Menu completo' : '➖ Compactar menu'}
      </button>

      <div className="nav-menu">
        {NAV_ITEMS.map(item => (
          <div
            key={item.id}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
            title={item.label}
            style={{ justifyContent: isCollapsed ? 'center' : 'flex-start' }}
          >
            <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
            {!isCollapsed && <span>{item.label}</span>}
          </div>
        ))}
      </div>
    </nav>
  );
};
