import { useMemo } from 'react';
import { WorkOrder, OSStatus } from '../types';
import { ContextMenu, MenuItem } from './ContextMenu';
import { Icon } from './ui/Icon';

declare global {
  interface Window {
    __TAURI__?: {
      shell: {
        open: (url: string) => Promise<void>;
      };
    };
  }
}

export interface KanbanCardActions {
  onRegress: (id: string) => void;
  onEdit: (os: WorkOrder) => void;
  onChecklist: (os: WorkOrder) => void;
  /** Janela Documentos (imprimir ou salvar PDF). `origin` = botão que abriu o menu, para devolver o foco ao fechar. */
  onDocuments: (os: WorkOrder, origin?: HTMLElement | null) => void;
  /** Resumo do serviço no Modo cliente (tela). */
  onShowClient?: (os: WorkOrder, origin?: HTMLElement | null) => void;
  onDelete: (os: WorkOrder) => void;
  onAdvance: (id: string) => void;
  onArchive?: (os: WorkOrder) => void;
  onRestore?: (os: WorkOrder) => void;
  onQuickFinish?: (id: string) => void;
}

const openWhatsApp = async (os: WorkOrder) => {
  if (!os.clientPhone) return;

  let cleanPhone = os.clientPhone.replace(/\D/g, '');
  if (cleanPhone.startsWith('55')) cleanPhone = cleanPhone.substring(2);

  if (cleanPhone.length < 10) {
    alert(`Telefone inválido: ${os.clientPhone}\n\nPrecisa ter pelo menos 10 dígitos (DDD + número)`);
    return;
  }

  const message = encodeURIComponent(
    `Olá ${os.clientName}, tudo bem?\n\nEstamos entrando em contato da oficina sobre a OS #${os.osNumber} do seu ${os.vehicle}.`
  );

  const whatsappUrl = `https://wa.me/55${cleanPhone}?text=${message}`;

  if (window.__TAURI__?.shell?.open) {
    await window.__TAURI__.shell.open(whatsappUrl);
    return;
  }

  const newWindow = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
    try {
      await navigator.clipboard.writeText(whatsappUrl);
      alert(`Link copiado!\n\nCole no navegador:\n${whatsappUrl}`);
    } catch {
      prompt('Copie este link:', whatsappUrl);
    }
  }
};

const ic = (name: Parameters<typeof Icon>[0]['name']) => <Icon name={name} size={18} />;

interface KanbanCardMenuProps {
  os: WorkOrder;
  status: OSStatus;
  actions: KanbanCardActions;
  x: number;
  y: number;
  onClose: () => void;
}

/** Menu de ações do cartão. Só é montado enquanto está aberto (botão "Mais" ou clique direito). */
export const KanbanCardMenu = ({ os, status, actions, x, y, onClose }: KanbanCardMenuProps) => {
  const items = useMemo(() => {
    const list: MenuItem[] = [
      { icon: ic('editar'), label: 'Editar OS', onClick: () => actions.onEdit(os), variant: 'primary' },
      { icon: ic('prancheta'), label: 'Vistoria (Checklist de Inspeção)', onClick: () => actions.onChecklist(os) },
      { divider: true },
      { icon: ic('imprimir'), label: 'Documentos...', onClick: (origin) => actions.onDocuments(os, origin) },
    ];

    const show = actions.onShowClient;
    if (show) {
      list.push({ divider: true });
      list.push({ icon: ic('clientes'), label: 'Mostrar ao cliente', onClick: (origin) => show(os, origin) });
    }

    if (os.clientPhone) {
      list.push({ divider: true });
      list.push({ icon: ic('whatsapp'), label: 'Enviar WhatsApp', onClick: () => openWhatsApp(os), variant: 'success' });
    }

    list.push({ divider: true });

    if (status !== 'ARQUIVADO' && status !== 'ORCAMENTO') {
      list.push({ icon: ic('voltar'), label: 'Voltar Status', onClick: () => actions.onRegress(os.id) });
    }
    if (status !== 'ARQUIVADO' && status !== 'FINALIZADO') {
      list.push({ icon: ic('proximo'), label: 'Avançar Status', onClick: () => actions.onAdvance(os.id) });
    }

    list.push({ divider: true });

    if (status === 'ARQUIVADO') {
      list.push({ icon: ic('voltar'), label: 'Restaurar OS', onClick: () => actions.onRestore?.(os), variant: 'success' });
    } else {
      list.push({ icon: ic('caixa'), label: 'Arquivar OS', onClick: () => actions.onArchive?.(os) });
    }

    list.push({ icon: ic('excluir'), label: 'Excluir Permanentemente', onClick: () => actions.onDelete(os), variant: 'danger' });

    return list;
  }, [os, status, actions]);

  return <ContextMenu x={x} y={y} items={items} onClose={onClose} />;
};
