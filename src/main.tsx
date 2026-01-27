import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import LoginPage from './pages/LoginPage.tsx';
import './index.css';
import { auth } from './lib/firebase.ts';
import { onAuthStateChanged, User } from 'firebase/auth';
import { autoSync } from './services/syncService.ts';

function AuthWrapper() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      // Auto-sync no login
      if (currentUser && !syncing) {
        try {
          setSyncing(true);
          console.log('🔄 Iniciando sincronização automática...');
          await autoSync(currentUser.uid);
          console.log('✅ Sincronização concluída!');
        } catch (error) {
          console.error('❌ Erro na sincronização:', error);
          // Não bloqueia o login se a sync falhar
        } finally {
          setSyncing(false);
        }
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-app)',
        color: 'var(--text-main)',
        fontSize: '1.2rem',
        fontWeight: '600'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '20px' }}>🔄</div>
          <div>Carregando...</div>
          {syncing && (
            <div style={{ marginTop: '10px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Sincronizando dados...
            </div>
          )}
        </div>
      </div>
    );
  }

  return user ? <App /> : <LoginPage />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthWrapper />
  </React.StrictMode>,
);
