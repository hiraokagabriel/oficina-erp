import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppContent } from '../App';
import { AppTopbar } from '../components/AppTopbar';
import { ToastProvider } from '../context/ToastContext';
import './../styles-auth.css';
import { AuthProvider } from './AuthContext';
import { CloudRoot } from './CloudRoot';
import { parseAuthUrl } from './screens';
import { isTauri } from '../utils/platform';

// Entrada do modo nuvem. O `main.tsx` só chega aqui por `import()` dinâmico atrás de `VITE_CLOUD=1`, então o bundle do
// modo arquivo não carrega o supabase-js nem o IndexedDB.

/** Service worker (abrir sem sinal) e armazenamento persistente (o iPhone apaga o IndexedDB de site não instalado). Só na web. */
function setupWebApp(): void {
  if (isTauri()) return;
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const register = (): void => {
      navigator.serviceWorker.register('/sw.js').catch((e) => console.error('Service worker não registrado:', e));
    };
    // O import dinâmico do boot pode terminar depois do evento `load`: nesse caso registra já.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }
  void navigator.storage?.persist?.().catch(() => undefined);
}

export function bootCloud(rootEl: HTMLElement): void {
  // Lê o caminho e o hash do link do e-mail ANTES de criar o cliente do Supabase (ele limpa o hash ao ler).
  const url = parseAuthUrl(window.location.pathname, window.location.hash, window.location.search);
  setupWebApp();
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
