import React from 'react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: 'FINANCEIRO' | 'OFICINA' | 'PROCESSOS' | 'CLIENTES' | 'PECAS' | 'CONFIG') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  return (
    <nav className="sidebar">
      <div className="logo-area">
        <div className="logo-text">OFICINA<span className="logo-highlight">PRO</span></div>
      </div>
      <div className="nav-menu">
        <div className={`nav-item ${activeTab === 'FINANCEIRO' ? 'active' : ''}`} onClick={() => setActiveTab('FINANCEIRO')}>📊 Financeiro</div>
        <div className={`nav-item ${activeTab === 'PROCESSOS' ? 'active' : ''}`} onClick={() => setActiveTab('PROCESSOS')}>📋 Processos</div>
        <div className={`nav-item ${activeTab === 'CLIENTES' ? 'active' : ''}`} onClick={() => setActiveTab('CLIENTES')}>👥 Clientes (CRM)</div>
        <div className={`nav-item ${activeTab === 'OFICINA' ? 'active' : ''}`} onClick={() => setActiveTab('OFICINA')}>🔧 Oficina</div>
        <div className={`nav-item ${activeTab === 'PECAS' ? 'active' : ''}`} onClick={() => setActiveTab('PECAS')}>📦 Peças</div>
        <div className={`nav-item ${activeTab === 'CONFIG' ? 'active' : ''}`} onClick={() => setActiveTab('CONFIG')}>⚙️ Config</div>
      </div>
    </nav>
  );
};
