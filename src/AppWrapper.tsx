import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { auth } from './lib/firebase';
import { listenAuthChanges, logout } from './services/authService';
import { useDatabaseSync } from './hooks/useDatabaseSync';
import { SyncStatusIndicator } from './components/SyncStatusIndicator';
import LoginPage from './pages/LoginPage';
import App from './App';

/**
 * Wrapper principal que gerencia autenticação e sincronização
 * Mostra LoginPage quando usuário não está autenticado
 * Mostra loading durante sincronização inicial
 * Mostra App quando tudo estiver pronto
 */
export default function AppWrapper() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const { syncStatus, syncMessage, syncService } = useDatabaseSync();

  // Monitora estado de autenticação
  useEffect(() => {
    const unsubscribe = listenAuthChanges((currentUser) => {
      console.log('🔑 Estado de autenticação:', currentUser ? 'Autenticado' : 'Não autenticado');
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Loading inicial (verificando autenticação)
  if (authLoading) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        background: 'var(--bg-app)',
        color: 'var(--text-main)'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '4px solid rgba(130, 87, 230, 0.3)',
          borderTop: '4px solid var(--primary)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p style={{ fontSize: '1.1rem', fontWeight: '600' }}>Carregando...</p>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Usuário não autenticado - Mostrar tela de login
  if (!user) {
    return <LoginPage onLoginSuccess={setUser} />;
  }

  // Usuário autenticado mas sincronização inicial ainda em andamento
  if (syncStatus === 'syncing' && !syncService) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        background: 'var(--bg-app)',
        color: 'var(--text-main)'
      }}>
        <div style={{
          width: '60px',
          height: '60px',
          border: '4px solid rgba(130, 87, 230, 0.3)',
          borderTop: '4px solid var(--primary)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '1.2rem', fontWeight: '700', margin: '0 0 8px 0' }}>
            Sincronizando dados
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>
            {syncMessage || 'Preparando seu banco de dados...'}
          </p>
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Erro na sincronização
  if (syncStatus === 'error') {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        background: 'var(--bg-app)',
        color: 'var(--text-main)',
        padding: '20px'
      }}>
        <div style={{ fontSize: '4rem' }}>❌</div>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700' }}>
          Erro na Sincronização
        </h2>
        <p style={{ 
          color: 'var(--text-muted)', 
          textAlign: 'center', 
          maxWidth: '500px',
          margin: 0 
        }}>
          {syncMessage || 'Não foi possível sincronizar seus dados. Verifique sua conexão e tente novamente.'}
        </p>
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <button 
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 24px',
              background: 'var(--primary)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '1rem'
            }}
          >
            Tentar Novamente
          </button>
          <button 
            onClick={async () => {
              await logout();
              window.location.reload();
            }}
            style={{
              padding: '12px 24px',
              background: 'transparent',
              color: 'var(--text-main)',
              border: '2px solid var(--border-color)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '1rem'
            }}
          >
            Fazer Logout
          </button>
        </div>
      </div>
    );
  }

  // Tudo pronto - Mostrar app principal com indicador de sincronização
  return (
    <>
      {/* Indicador de status de sincronização (apenas quando há atividade) */}
      {syncStatus !== 'idle' && syncStatus !== 'success' && (
        <SyncStatusIndicator status={syncStatus} message={syncMessage} />
      )}
      
      {/* App principal */}
      <App />
    </>
  );
}
