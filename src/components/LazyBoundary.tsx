import React from 'react';
import { lazyErrorMessage } from '../utils/lazyError';
import { flushBeforeReload } from '../utils/beforeReload';

// Rede de segurança dos `React.lazy`: sem internet o pedaço não carrega e, sem isto, a tela fica preta. O `lazy` guarda a
// promessa recusada para sempre, então "Tentar de novo" recarrega a janela (a nuvem guarda o que foi digitado no aparelho).
// Antes de recarregar descarrega o salvamento pendente (`flushBeforeReload`: no modo arquivo o debounce de 3 s não
// descarrega sozinho num reload). Limite conhecido e aceito: a boundary não se reinicia ao trocar de aba; só o botão recarrega.

interface Props {
  children: React.ReactNode;
  /** `float`: aviso fixo no alto (modais, que não têm lugar na página). Padrão: ocupa o lugar do conteúdo. */
  variant?: 'page' | 'float';
}

interface State { error: unknown; failed: boolean }

export class LazyBoundary extends React.Component<Props, State> {
  state: State = { error: null, failed: false };

  static getDerivedStateFromError(error: unknown): State {
    return { error, failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error('Falha ao abrir uma parte do programa:', error);
  }

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className={`lazy-error${this.props.variant === 'float' ? ' lazy-error--float' : ''}`} role="alert">
        <p className="lazy-error-text">{lazyErrorMessage(this.state.error)}</p>
        <button type="button" className="btn" onClick={() => { void flushBeforeReload().finally(() => window.location.reload()); }}>Tentar de novo</button>
      </div>
    );
  }
}
