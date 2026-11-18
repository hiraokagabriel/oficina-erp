import type { DailyExportResult } from '../sync/dailyExport';
import { formatDateOnly } from '../utils/dates';

// Textos da cópia diária (Config > Onde ficam os dados e o aviso ao abrir). Puro e testado.

const MS_DAY = 86_400_000;

/** "Última cópia: hoje às 08:12", "ontem às 08:12", "17/11/2026 às 08:12" (dia e hora locais) ou "Ainda não há cópia". */
export function lastExportText(lastExportAt: string | null, now: Date): string {
  if (!lastExportAt) return 'Última cópia: ainda não foi feita nenhuma.';
  const d = new Date(lastExportAt);
  if (Number.isNaN(d.getTime())) return 'Última cópia: ainda não foi feita nenhuma.';
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const day = formatDateOnly(d);
  const today = formatDateOnly(now);
  const yesterday = formatDateOnly(new Date(now.getTime() - MS_DAY));
  const when = day === today ? 'hoje' : day === yesterday ? 'ontem' : d.toLocaleDateString('pt-BR');
  return `Última cópia: ${when} às ${time}`;
}

/**
 * Toast depois de uma cópia feita pelo botão de Config. Se a falha já está no cartão de aviso da tela
 * ("cópia atrasada"), não repete: só o cartão fica, para não aparecer duas vezes.
 */
export function exportToastForConfig(out: { message: string; type: 'success' | 'error' | 'info' } | null, warningCardVisible: boolean): { message: string; type: 'success' | 'error' | 'info' } | null {
  if (out && out.type === 'error' && warningCardVisible) return null;
  return out;
}

/** Aviso (e tipo do toast) depois de uma cópia. `quiet` = cópia automática ao abrir: só fala se algo deu errado. */
export function exportOutcome(res: DailyExportResult, quiet: boolean): { message: string; type: 'success' | 'error' | 'info' } | null {
  if (res.status === 'erro') return { message: res.message, type: 'error' };
  if (res.skippedOrders.length > 0) {
    return { message: `A cópia foi feita, mas ${res.skippedOrders.length} ordem(ns) de serviço não vieram completas. Tente de novo mais tarde.`, type: 'error' };
  }
  if (res.drive === 'falhou') return { message: 'A cópia foi guardada neste computador, mas não subiu para o Google Drive.', type: 'error' };
  if (res.markError) return { message: 'A cópia foi guardada, mas não deu para anotar o dia dela na internet.', type: 'info' };
  if (quiet) return null;
  return {
    message: res.drive === 'enviado' ? 'Cópia de segurança feita neste computador e no Google Drive.' : 'Cópia de segurança feita neste computador.',
    type: 'success',
  };
}
