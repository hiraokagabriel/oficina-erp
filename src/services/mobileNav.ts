import { canSeeTab, type AccessView, type NavId } from './accessView';

// Navegação do celular (docs/NUVEM-UX.md seção 8). Puro: a barra de baixo e a folha "Mais" só desenham o que sai daqui.

/** Telas de campo, na barra de baixo (o quarto botão é "Mais"). */
export const PHONE_TABS = ['OFICINA', 'AGENDA', 'CLIENTES'] as const satisfies readonly NavId[];
export type PhoneTab = typeof PHONE_TABS[number];

/** Abaixo de 800 px (mesmo limite do CSS em styles-mobile.css). */
export const PHONE_MAX_WIDTH = 799;

export const isPhoneTab = (tab: NavId): tab is PhoneTab => (PHONE_TABS as readonly NavId[]).includes(tab);

export const PHONE_TAB_LABEL: Record<PhoneTab, string> = { OFICINA: 'Oficina', AGENDA: 'Agenda', CLIENTES: 'Clientes' };

const SCREEN_LABEL: Record<NavId, string> = {
  HOJE: 'Hoje', OFICINA: 'Oficina', AGENDA: 'Agenda', PROCESSOS: 'Processos', CLIENTES: 'Clientes',
  FINANCEIRO: 'Financeiro', PECAS: 'Peças a comprar', CONFIG: 'Configurações',
};

export interface MoreItem { id: NavId; label: string; /** Etiqueta "No computador" (tela fora do celular). */ badge: string }

export const DESKTOP_BADGE = 'No computador';

// Ordem da seção 8.1: Hoje, Processos, Financeiro, Peças a comprar, Configurações.
const MORE_ORDER: readonly NavId[] = ['HOJE', 'PROCESSOS', 'FINANCEIRO', 'PECAS', 'CONFIG'];

/** Itens da folha "Mais" que o papel enxerga (Financeiro por `finance.view`, Configurações só o Dono). */
export function moreSheetItems(access: AccessView): MoreItem[] {
  return MORE_ORDER.filter(id => canSeeTab(access, id)).map(id => ({ id, label: SCREEN_LABEL[id], badge: DESKTOP_BADGE }));
}

/** Aba aberta ao entrar no celular. */
export const initialPhoneTab = (): PhoneTab => 'OFICINA';

/** Texto da tela "Disponível no computador" (seção 8.2). */
export function desktopOnlyText(tab: NavId): { title: string; text: string; back: string } {
  return {
    title: 'Disponível no computador',
    text: `A tela ${SCREEN_LABEL[tab]} precisa de uma tela maior. Abra o OficinaPro no computador da oficina ou num tablet deitado.`,
    back: 'Voltar para a Oficina',
  };
}
