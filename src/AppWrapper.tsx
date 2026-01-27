import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { listenAuthChanges } from './services/authService';
import LoginPage from './pages/LoginPage';
import App from './App';

/**
 * Wrapper principal que gerencia apenas autenticação
 * Mostra LoginPage quando usuário não está autenticado
 * Mostra App quando autenticado
 */
export default function AppWrapper() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Monitora estado de autenticação
  useEffect(() => {
    const unsubscribe = listenAuthChanges((currentUser) => {
      console.log('🔑 Auth:', currentUser ? `✅ ${currentUser.email}` : '❌ Não autenticado');
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
        <p style={{ fontSize: '1.1rem', fontWeight: '600' }}>Verificando autenticação...</p>
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

  // Usuário autenticado - Mostrar app principal
  return <App />;
}
