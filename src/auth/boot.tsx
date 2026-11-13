import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppContent } from '../App';
import { AppTopbar } from '../components/AppTopbar';
import { ToastProvider } from '../context/ToastContext';
import './../styles-auth.css';
import { AuthProvider } from './AuthContext';
import { CloudRoot } from './CloudRoot';
import { parseAuthUrl } from './screens';

// Entrada do modo nuvem. O `main.tsx` só chega aqui por `import()` dinâmico atrás de `VITE_CLOUD=1`, então o bundle do
// modo arquivo não carrega o supabase-js nem o IndexedDB.

export function bootCloud(rootEl: HTMLElement): void {
  // Lê o caminho e o hash do link do e-mail ANTES de criar o cliente do Supabase (ele limpa o hash ao ler).
  const url = parseAuthUrl(window.location.pathname, window.location.hash, window.location.search);
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ToastProvider>
        <AuthProvider url={url}>
          <CloudRoot app={<AppContent topbar={<AppTopbar />} />} />
        </AuthProvider>
      </ToastProvider>
    </React.StrictMode>,
  );
}
