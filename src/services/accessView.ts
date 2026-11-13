import { ACTIONS, accessFor, can, type Action, type OSAccess, type Role } from './permissions';

// Visão de acesso das telas (docs/NUVEM-UX.md seção 7). Puro. Sem papel (modo arquivo) tudo é liberado:
// o modo arquivo não pode mudar em nada. Com papel, as regras são só as de permissions.ts (nenhuma duplicada aqui).

export interface AccessView {
  /** Papel da nuvem; undefined no modo arquivo. */
  role: Role | undefined;
  /** Há papel (modo nuvem). */
  restricted: boolean;
  can: (action: Action) => boolean;
  /** Visão da OS por papel (preço, custo, itens). */
  os: OSAccess;
}

const FREE_OS: OSAccess = { canSeePrices: true, canSeeCosts: true, canEditItems: true };

export function buildAccess(role: Role | undefined): AccessView {
  if (!role) {
    return { role: undefined, restricted: false, can: () => true, os: FREE_OS };
  }
  return { role, restricted: true, can: (action) => can(role, action), os: accessFor(role) };
}

export type NavId = 'HOJE' | 'FINANCEIRO' | 'OFICINA' | 'AGENDA' | 'PROCESSOS' | 'CLIENTES' | 'PECAS' | 'CONFIG';

export function canSeeTab(access: AccessView, tab: NavId): boolean {
  switch (tab) {
    case 'FINANCEIRO': return access.can('finance.view');
    case 'CONFIG': return access.can('settings.edit');
    default: return true;
  }
}

/** Aba inicial segura: se a aba guardada não é permitida, abre Oficina (regra 6 da seção 7.1). */
export function safeTab<T extends NavId>(access: AccessView, tab: T): T | 'OFICINA' {
  return canSeeTab(access, tab) ? tab : 'OFICINA';
}

/** Status que o papel pode escolher à mão (select de Processos, arrastar). Finalizar/reabrir envolve pagamento; arquivar e restaurar não são do Mecânico. */
export function canMoveToStatus(access: AccessView, to: string, from?: string): boolean {
  if (to === 'FINALIZADO') return access.can('os.finalize');
  if (from === 'FINALIZADO') return access.can('os.reopen');
  if (to === 'ARQUIVADO' || from === 'ARQUIVADO') return access.can('os.delete');
  return access.can('os.status');
}

/** Todas as ações liberadas? (atalho de teste: modo arquivo). */
export const allActionsAllowed = (access: AccessView): boolean => ACTIONS.every(a => access.can(a));

export const MECANICO_FINALIZE_MESSAGE = 'Só Recepção ou Dono finaliza (envolve pagamento).';
export const NEW_OS_DENIED_MESSAGE = 'Seu papel não cria OS. Peça para a Recepção ou o Dono.';
