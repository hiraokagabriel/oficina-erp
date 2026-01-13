import React, { useState, useEffect } from 'react';
import { WorkshopPage } from './pages/WorkshopPage';
import { FinancialPage } from './pages/FinancialPage';
import { CRMPage } from './pages/CRMPage';
import { ProcessPage } from './pages/ProcessPage';
import { ConfigPage } from './pages/ConfigPage';
import { Button } from './components/ui/PremiumComponents';
import { WorkOrder, Transaction, Client, ProcessDefinition, AppConfig } from './types';

type PageType = 'workshop' | 'financial' | 'crm' | 'process' | 'config';

const navigationItems = [
  { id: 'workshop', label: 'Oficina', icon: '🔧', page: 'workshop' },
  { id: 'financial', label: 'Financeiro', icon: '💰', page: 'financial' },
  { id: 'crm', label: 'Clientes', icon: '👥', page: 'crm' },
  { id: 'process', label: 'Processos', icon: '⚙️', page: 'process' },
  { id: 'config', label: 'Configurações', icon: '🎛️', page: 'config' },
];

const mockWorkOrders: WorkOrder[] = [
  {
    id: '1',
    osNumber: 'OS-001',
    clientName: 'João Silva',
    vehicle: { model: 'Chevrolet Onix', year: 2022 },
    status: 'EM_SERVICO',
    createdAt: new Date().toISOString(),
    total: 1500,
    parts: [],
    services: [],
  },
];

const mockTransactions: Transaction[] = [];
const mockClients: Client[] = [];
const mockProcesses: ProcessDefinition[] = [];
const mockConfig: AppConfig = { companyName: 'Minha Oficina' };

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageType>('workshop');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'light' | 'dark') || 'dark';
  });

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(mockWorkOrders);
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);
  const [clients, setClients] = useState<Client[]>(mockClients);
  const [processes, setProcesses] = useState<ProcessDefinition[]>(mockProcesses);
  const [config, setConfig] = useState<AppConfig>(mockConfig);

  // Update theme on document
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const formatMoney = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
  };

  return (
    <div className="app-container" data-theme={theme}>
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">🏭</span>
            <span className="logo-text">Oficina ERP</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${currentPage === item.page ? 'active' : ''}`}
              onClick={() => setCurrentPage(item.page as PageType)}
              title={item.label}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className="theme-toggle"
            onClick={() => handleThemeChange(theme === 'dark' ? 'light' : 'dark')}
            title="Toggle tema"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <div className="main-inner">
          {currentPage === 'workshop' && (
            <WorkshopPage
              workOrders={workOrders}
              isLoading={false}
              formatMoney={formatMoney}
              onNewOS={() => console.log('New OS')}
              onDragEnd={() => console.log('Drag end')}
              kanbanActions={{
                onRegress: () => {},
                onAdvance: () => {},
                onEdit: () => {},
                onChecklist: () => {},
                onPrint: () => {},
                onDelete: () => {},
                onArchive: () => {},
                onRestore: () => {},
                onQuickFinish: () => {},
              }}
            />
          )}

          {currentPage === 'financial' && (
            <FinancialPage
              transactions={transactions}
              isLoading={false}
              formatMoney={formatMoney}
              onAddTransaction={() => console.log('Add transaction')}
              onEditTransaction={() => console.log('Edit transaction')}
              onDeleteTransaction={() => console.log('Delete transaction')}
            />
          )}

          {currentPage === 'crm' && (
            <CRMPage
              clients={clients}
              isLoading={false}
              onAddClient={() => console.log('Add client')}
              onEditClient={() => console.log('Edit client')}
              onDeleteClient={() => console.log('Delete client')}
              onViewOrders={() => console.log('View orders')}
            />
          )}

          {currentPage === 'process' && (
            <ProcessPage
              processes={processes}
              isLoading={false}
              onAddProcess={() => console.log('Add process')}
              onEditProcess={() => console.log('Edit process')}
              onDeleteProcess={() => console.log('Delete process')}
              onToggleActive={() => console.log('Toggle active')}
            />
          )}

          {currentPage === 'config' && (
            <ConfigPage
              config={config}
              isLoading={false}
              onSaveConfig={(newConfig) => setConfig(newConfig)}
              onResetConfig={() => setConfig(mockConfig)}
              theme={theme}
              onThemeChange={handleThemeChange}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
