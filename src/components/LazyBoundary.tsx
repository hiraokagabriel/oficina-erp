import React from 'react';
import { lazyErrorMessage } from '../utils/lazyError';

// Rede de segurança dos `React.lazy`: sem internet o pedaço não carrega e, sem isto, a tela fica preta. O `lazy` guarda a
// promessa recusada para sempre, então "Tentar de novo" recarrega a janela (a nuvem guarda o que foi digitado no aparelho).

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
        <button type="button" className="btn" onClick={() => window.location.reload()}>Tentar de novo</button>
      </div>
    );
  }
}
