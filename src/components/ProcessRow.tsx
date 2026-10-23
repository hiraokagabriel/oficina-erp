import React from 'react';
import { WorkOrder, OSStatus } from '../types';
import { DeliveryBadge } from '../services/deliveryBadge';
import { Money } from '../utils/helpers';
import { parseDateFlexible } from '../utils/dates';
import { Icon } from './ui/Icon';
import { StatusMenu } from './StatusMenu';

export const ALL_STATUSES: readonly OSStatus[] = ['ORCAMENTO', 'APROVADO', 'EM_SERVICO', 'AGUARDANDO_PAGAMENTO', 'FINALIZADO', 'ARQUIVADO'];

export const formatDate = (dateStr: string): string => parseDateFlexible(dateStr).toLocaleDateString('pt-BR');

interface ProcessRowProps {
  os: WorkOrder;
  /** Selo de atraso já calculado (ou null). Referência estável entre renders. */
  late: DeliveryBadge | null;
  canOpen: boolean;
  onOpen: (os: WorkOrder) => void;
  onUpdateStatus: (id: string, status: OSStatus) => void;
}

const PaymentCell: React.FC<{ os: WorkOrder }> = ({ os }) => {
  if (os.paymentDate) {
    return (
      <span className="pr-paid">
        <Icon name="check" size={14} />
        Pago em {formatDate(os.paymentDate)}
      </span>
    );
  }
  if (os.status === 'ORCAMENTO' || (os.status === 'ARQUIVADO' && !os.financialId)) {
    const why = os.status === 'ORCAMENTO' ? 'o orçamento ainda não foi aprovado' : 'a OS foi arquivada sem cobrança';
    return (
      <span className="cell-secondary" title={`Sem cobrança: ${why}`}>
        —<span className="pr-sr"> Sem cobrança</span>
      </span>
    );
  }
  return <span className="cell-secondary">A receber</span>;
};

const ProcessRowImpl: React.FC<ProcessRowProps> = ({ os, late, canOpen, onOpen, onUpdateStatus }) => (
  <tr
    className={`pr-row${canOpen ? ' is-openable' : ''}`}
    onClick={canOpen ? (e) => {
      if ((e.target as HTMLElement).closest('button, a')) return;
      onOpen(os);
    } : undefined}
  >
    <td className="pr-c-os">
      {canOpen ? (
        <button
          type="button"
          className="pr-open"
          aria-label={`Abrir OS #${os.osNumber}, ${os.clientName}`}
          onClick={() => onOpen(os)}
        >
          #{os.osNumber}
        </button>
      ) : (
        <span className="pr-os">#{os.osNumber}</span>
      )}
    </td>
    <td className="pr-c-client">
      <div className="cell-primary">{os.clientName}</div>
      <div className="cell-secondary">{os.vehicle}</div>
      {late && <span className={`delivery-badge delivery-badge--${late.kind} pr-late-inline`}>{late.label}</span>}
    </td>
    <td className="pr-c-opt cell-secondary">{formatDate(os.createdAt)}</td>
    <td className="pr-c-opt"><PaymentCell os={os} /></td>
    <td className="pr-c-opt">
      {os.expectedDate ? (
        <div className="process-expected">
          <span className="cell-secondary">{formatDate(os.expectedDate)}</span>
          {late && <span className={`delivery-badge delivery-badge--${late.kind}`}>{late.label}</span>}
        </div>
      ) : (
        <span className="cell-secondary">Sem previsão</span>
      )}
    </td>
    <td className="pr-c-total"><span className="pr-money">{Money.format(os.total)}</span></td>
    <td className="pr-c-status">
      <StatusMenu id={os.id} osNumber={os.osNumber} current={os.status} statuses={ALL_STATUSES} onSelect={onUpdateStatus} />
    </td>
  </tr>
);

export const ProcessRow = React.memo(ProcessRowImpl);
