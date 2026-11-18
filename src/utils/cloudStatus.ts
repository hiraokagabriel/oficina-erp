import { describeSyncError, syncErrorAdvice } from '../sync/rejectMessages';
import type { IconName } from '../components/ui/Icon';
import { formatClock } from './saveStatus';

// Selo de nuvem do topo (docs/NUVEM-UX.md 6.1). Lógica pura: o componente só desenha. Mesma ideia de `saveStatus.ts`.

export type CloudBadgeKind = 'salvo' | 'enviando' | 'offline' | 'erro';
/** Cor do texto: sempre uma variante `--text-*` (contraste garantido nos dois temas). */
export type CloudTone = 'success' | 'neutral' | 'warning' | 'danger';

export interface CloudStatusInput {
  /** `syncState` do motor (`CloudInfo`). */
  syncState: CloudBadgeKind;
  /** Alterações da pessoa ainda não confirmadas (`CloudInfo.pending`). */
  pending: number;
  /** `lastError` do motor (`CloudInfo.lastError`). */
  lastError: string | null;
  /** ISO da última vez que a fila esvaziou (`lastSavedAt` do contexto). */
  lastSavedAt: string | null;
}

export interface CloudBadgeView {
  kind: CloudBadgeKind;
  /** Ícones do selo, na ordem (o `check` vem depois da nuvem). */
  icons: IconName[];
  /** Texto do selo no PC. */
  text: string;
  /** Texto curto (celular). */
  shortText: string;
  tone: CloudTone;
  /** Borda: `--border`, `--warning` ou `--danger`. */
  border: 'default' | 'warning' | 'danger';
  /** `offline` e `erro` anunciam ao leitor de tela; `enviando` nunca (ver `shouldAnnounceChange`). */
  announce: boolean;
  /** Parágrafos do painel de detalhes. */
  detail: string[];
  /** "O que fazer" no painel (erro). */
  advice: string | null;
  /** Mostra o botão "Tentar enviar agora". */
  canRetry: boolean;
}

const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;

export const OFFLINE_CAN_DO =
  'Você pode continuar abrindo OS, mudando status, fazendo vistoria, tirando fotos, agendando e cadastrando clientes.';
export const OFFLINE_CANNOT_DO =
  'Receber, parcelar, finalizar com pagamento, reabrir, excluir OS e lançamentos do Financeiro.';
export const OFFLINE_KEEP_WARNING =
  'Não desinstale o programa nem limpe os dados do navegador enquanto houver alterações guardadas.';
/** Toast de quem clica num botão de dinheiro sem internet (6.2). */
export const MONEY_OFFLINE_TOAST =
  'Sem internet. Receber, parcelar, finalizar, reabrir e excluir só funcionam com internet, para o caixa não ficar errado. O resto continua funcionando.';

/** `sem_acesso` não vira selo: vai para a tela "Sem acesso" (6.3). */
export const isAccessProblem = (lastError: string | null): boolean => lastError === 'sem_acesso';

export function describeCloudStatus(i: CloudStatusInput): CloudBadgeView {
  const n = Math.max(0, i.pending);
  const clock = formatClock(i.lastSavedAt);
  switch (i.syncState) {
    case 'erro':
      return {
        kind: 'erro', icons: ['alerta'], text: 'Não enviado · ver o que fazer', shortText: 'Não enviado', tone: 'danger', border: 'danger',
        announce: true,
        detail: [describeSyncError(i.lastError) ?? 'Não deu para enviar agora. Suas alterações estão guardadas neste aparelho.'],
        advice: syncErrorAdvice(i.lastError), canRetry: !isAccessProblem(i.lastError),
      };
    case 'offline':
      return {
        kind: 'offline', icons: ['sem-internet'],
        text: n === 0 ? 'Sem internet · tudo guardado aqui' : `Sem internet · ${n} ${n === 1 ? 'guardada' : 'guardadas'} aqui`,
        shortText: n === 0 ? 'Sem internet' : `Sem internet (${n})`, tone: 'warning', border: 'warning', announce: true,
        detail: [
          `Sem internet. ${OFFLINE_CAN_DO}${n > 0 ? ` ${n === 1 ? 'A alteração fica guardada' : `As ${n} alterações ficam guardadas`} neste aparelho e ${n === 1 ? 'é enviada' : 'são enviadas'} sozinhas quando a internet voltar.` : ''}`,
          `Não funciona sem internet: ${OFFLINE_CANNOT_DO}`,
          OFFLINE_KEEP_WARNING,
        ],
        advice: null, canRetry: false,
      };
    case 'enviando':
      return {
        kind: 'enviando', icons: ['relogio'], text: `Enviando ${plural(n, 'alteração', 'alterações')}...`,
        shortText: `Enviando ${n}`, tone: 'neutral', border: 'default', announce: false,
        detail: [`Enviando ${plural(n, 'alteração', 'alterações')}. Pode continuar trabalhando.`], advice: null, canRetry: false,
      };
    case 'salvo':
      return {
        kind: 'salvo', icons: ['nuvem', 'check'], text: clock ? `Salvo às ${clock}` : 'Salvo', shortText: 'Salvo', tone: 'success', border: 'default',
        announce: false,
        detail: [`Tudo o que foi feito neste aparelho já está salvo na internet.${clock ? ` Última vez: ${clock}.` : ''}`], advice: null, canRetry: false,
      };
  }
}

/** Anuncia para o leitor de tela só ao entrar em `offline`/`erro` e ao voltar a `salvo` depois de um deles. */
export function shouldAnnounceChange(prev: CloudBadgeKind | null, next: CloudBadgeKind): boolean {
  if (prev === next) return false;
  if (next === 'offline' || next === 'erro') return true;
  return next === 'salvo' && (prev === 'offline' || prev === 'erro');
}

/** Etapas de "Preparando este aparelho" (o motor não expõe contagem: só em que etapa está). */
export type LoadStage = 'cache' | 'fotos' | 'dados';

/** Texto da etapa atual. Sem internet, a etapa de dados espera a conexão. */
export function loadStageText(stage: LoadStage, online: boolean): string {
  switch (stage) {
    case 'cache': return 'Etapa 1 de 3: abrindo o armazenamento deste aparelho...';
    case 'fotos': return 'Etapa 2 de 3: preparando as fotos...';
    case 'dados': return online
      ? 'Etapa 3 de 3: baixando os dados da oficina...'
      : 'Etapa 3 de 3: sem internet. Os dados baixam assim que a conexão voltar.';
  }
}
