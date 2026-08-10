import React from 'react';
import { logout } from '../services/authService';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: 'FINANCEIRO' | 'OFICINA' | 'PROCESSOS' | 'CLIENTES' | 'PECAS' | 'CONFIG') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const handleLogout = async () => {
    if (window.confirm('🚪 Deseja realmente sair do sistema?')) {
      try {
        await logout();
        console.log('✅ Logout realizado com sucesso');
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
        <div className={`nav-item ${activeTab === 'PECAS' ? 'active' : ''}`} onClick={() => setActiveTab('PECAS')}>📦 Peças</div>
        <div className={`nav-item ${activeTab === 'CONFIG' ? 'active' : ''}`} onClick={() => setActiveTab('CONFIG')}>⚙️ Config</div>
      </div>
      
      {/* Botão de Logout */}
      <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
        <button 
          onClick={handleLogout}
          className="btn-secondary"
          style={{ 
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '12px',
            fontSize: '0.9rem'
          }}
        >
          <span>🚪</span>
          <span>Sair</span>
        </button>
      </div>
    </nav>
  );
};
