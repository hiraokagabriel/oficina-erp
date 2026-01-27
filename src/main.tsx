import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { User } from 'firebase/auth';
import { listenAuthChanges } from './services/authService';
import App from "./App";
import LoginPage from './pages/LoginPage';

// IMPORTAÇÃO DOS ESTILOS
import "./styles.css";
import "./styles-dragdrop-overhaul.css";
import "./styles-crm-timeline.css";
import "./styles-scrollbar.css";
import "./styles/LoginPage.css";

/**
 * AuthWrapper - Gerencia o estado de autenticação
 * Exibe LoginPage se não estiver autenticado
 * Exibe App se estiver autenticado
 */
function AuthWrapper() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('🔑 Iniciando listener de autenticação Firebase...');
    
    // Listener que monitora mudanças no estado de autenticação
    const unsubscribe = listenAuthChanges((currentUser) => {
      if (currentUser) {
        console.log('✅ Usuário autenticado:', currentUser.email);
      } else {
        console.log('❌ Usuário não autenticado');
      }
      setUser(currentUser);
      setLoading(false);
    });

    // Cleanup ao desmontar componente
    return () => {
      console.log('🛡️ Desmontando listener de autenticação');
      unsubscribe();
    };
  }, []);

  // Loading state enquanto verifica autenticação
  if (loading) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-app)',
        color: 'var(--text-main)',
        flexDirection: 'column',
        gap: '24px'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px'
        }}>
          {/* Logo */}
          <div style={{
            width: '80px',
            height: '80px',
            background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            fontWeight: 800,
            color: 'white',
            letterSpacing: '-1px',
            boxShadow: '0 10px 30px rgba(130, 87, 230, 0.4)',
            animation: 'pulse 2s ease-in-out infinite'
          }}>
            AM
          </div>
          
          {/* Spinner */}
          <div className="spinner" style={{
            width: '40px',
            height: '40px',
            border: '4px solid rgba(130, 87, 230, 0.2)',
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }}></div>
          
          <p style={{ 
            fontSize: '1.1rem', 
            fontWeight: 600,
            opacity: 0.8 
          }}>
            Verificando autenticação...
          </p>
        </div>
        
        <style>{`
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
        `}</style>
      </div>
    );
  }

  // Se não estiver logado, mostra tela de login
  if (!user) {
    return <LoginPage onLoginSuccess={setUser} />;
  }

  // Se estiver logado, mostra o app principal
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthWrapper />
  </React.StrictMode>
);