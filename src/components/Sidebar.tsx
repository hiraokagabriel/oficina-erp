import React from 'react';
import { logout } from '../services/authService';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: 'FINANCEIRO' | 'OFICINA' | 'PROCESSOS' | 'CLIENTES' | 'CONFIG') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const handleLogout = async () => {
    if (confirm('🚪 Deseja realmente fazer logout?')) {
      try {
        await logout();
        window.location.reload();
      } catch (error) {
        console.error('❌ Erro ao fazer logout:', error);
        alert('Erro ao fazer logout. Tente novamente.');
      }
    }
  };

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
        <div className={`nav-item ${activeTab === 'CONFIG' ? 'active' : ''}`} onClick={() => setActiveTab('CONFIG')}>⚙️ Config</div>
      </div>
      
      {/* Botão de Logout */}
      <div className="sidebar-footer">
        <div className="nav-item logout-btn" onClick={handleLogout}>
          <span>🚪</span>
          <span>Sair</span>
        </div>
      </div>
    </nav>
  );
};
