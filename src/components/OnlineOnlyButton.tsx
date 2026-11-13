import React, { useId } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { useToast } from '../context/ToastContext';
import { Icon } from './ui/Icon';
import { MONEY_OFFLINE_TOAST } from '../utils/cloudStatus';

// Botão de dinheiro "Precisa de internet" (docs/NUVEM-UX.md 6.2). Envolve o botão atual: mesmo tamanho e rótulo.
// - Sem internet (modo nuvem): visual cinza com o ícone `sem-internet`, `aria-disabled`, motivo em `title` e no leitor
//   de tela; clicar (ou Enter) NÃO chama `onClick`: mostra o toast com o motivo.
// - Com operação de dinheiro no ar: `aria-busy`, desabilitado e rótulo `busyLabel` ("Recebendo...").
// - Modo arquivo (sem `cloud`): é só o botão, sem nenhuma diferença.

export const ONLINE_ONLY_REASON = 'Precisa de internet';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Rótulo durante a operação ("Recebendo...", "Finalizando...", "Excluindo..."). Sem ele, o rótulo não muda. */
  busyLabel?: string;
  /** `osId` ou `entryId` da operação deste botão: só ele mostra "Recebendo..." (não é global). */
  busyKey?: string;
}

export const OnlineOnlyButton: React.FC<Props> = ({ busyLabel, busyKey, className, onClick, children, title, disabled, ...rest }) => {
  const cloud = useDatabase().cloud;
  const { addToast } = useToast();
  const descId = useId();
  const offline = !!cloud && !cloud.online;
  const busy = !!busyKey && !!cloud?.moneyBusyKeys?.includes(busyKey);

  if (offline) {
    return (
      <>
        <button
          {...rest}
          type={rest.type ?? 'button'}
          className={`${className ?? ''} btn-online-only`.trim()}
          aria-disabled="true"
          aria-describedby={descId}
          title={`${ONLINE_ONLY_REASON}: ${title ?? ''}`.replace(/: $/, '')}
          onClick={e => { e.preventDefault(); e.stopPropagation(); addToast(MONEY_OFFLINE_TOAST, 'info'); }}
        >
          <Icon name="sem-internet" size={16} />
          {children}
        </button>
        <span id={descId} className="sr-only">{ONLINE_ONLY_REASON}</span>
      </>
    );
  }
  return (
    <button
      {...rest}
      type={rest.type ?? 'button'}
      className={className}
      title={title}
      onClick={onClick}
      disabled={disabled || (busy && !!busyLabel)}
      aria-busy={busy && !!busyLabel ? true : undefined}
    >
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
};
