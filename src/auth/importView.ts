import { describeProblem } from '../sync/importCheck';
import type { ImportProblem } from '../sync/importCheck';
import type { ImportPhase, ImportReport } from '../sync/importRunner';
import { PHOTO_SPACE_WARN_RATIO, STORAGE_LIMIT_BYTES, formatBytes } from '../services/photoSpace';

// Textos e decisões da tela "Enviar banco para a nuvem" (docs/NUVEM-PR9.md, docs/NUVEM-UX.md seção 9). Puro e testado:
// a tela só desenha. Português simples, sem jargão.

export const IMPORT_PHASES: readonly ImportPhase[] = ['ler', 'copia', 'validar', 'enviar', 'totais', 'fotos', 'volta', 'arquivo'];

export const PHASE_LABEL: Record<ImportPhase, string> = {
  ler: 'Lendo o arquivo do banco',
  copia: 'Guardando uma cópia de segurança',
  validar: 'Conferindo os dados',
  enviar: 'Enviando os registros',
  totais: 'Conferindo os totais na internet',
  fotos: 'Enviando as fotos',
  volta: 'Lendo de volta da internet',
  arquivo: 'Conferindo o arquivo',
};

export type PhaseMark = 'feito' | 'agora' | 'espera';

/** Marca de cada etapa dado a etapa em andamento (a lista é sempre mostrada inteira). */
export function phaseMarks(current: ImportPhase | null): { phase: ImportPhase; mark: PhaseMark }[] {
  const at = current === null ? -1 : IMPORT_PHASES.indexOf(current);
  return IMPORT_PHASES.map((phase, i) => ({ phase, mark: i < at ? 'feito' : i === at ? 'agora' : 'espera' }));
}

/** "1.200 de 3.400" (ou vazio quando a etapa não conta). */
export function progressCount(done: number, total: number): string {
  if (total <= 1) return '';
  return `${done.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`;
}

/** 0 a 100 para a barra; null = sem contagem (barra correndo). */
export function progressPercent(done: number, total: number): number | null {
  if (total <= 1) return null;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

const MAX_PROBLEMS = 30;

/** Linhas da lista de dados com problema; corta em 30 e diz quantos faltam. */
export function problemLines(problems: readonly ImportProblem[]): { lines: string[]; more: number } {
  const lines = problems.slice(0, MAX_PROBLEMS).map(describeProblem);
  return { lines, more: Math.max(0, problems.length - lines.length) };
}

/** Frase para erros do servidor/rede durante a importação. */
export function describeImportError(raw: string): string {
  const m = raw.toLowerCase();
  if (/totais_divergentes/.test(m)) return 'Os dados na internet mudaram (outro computador mexeu). Confira de novo antes de concluir.';
  if (/somente_dono/.test(m)) return 'Só o Dono pode enviar o banco para a internet.';
  if (/oficina_em_uso/.test(m)) return 'Outra pessoa já está usando esta oficina na internet. Peça para ela sair e tente de novo.';
  if (/import_bloqueado/.test(m)) return 'Esta oficina não aceita mais envio de dados. Se achar que é engano, chame o suporte.';
  if (/aal2|mfa|verifica/.test(m)) return 'Entre de novo com o código de verificação do Dono e tente outra vez.';
  if (/failed to fetch|network|fetch|timeout|tempo/.test(m)) return 'Faltou internet ou o servidor demorou. Confira a conexão e toque em "Tentar de novo". O que já foi enviado não se perde.';
  return raw;
}

/** Aviso do espaço das fotos antes de enviar: acima de 80% de 1 GB. Null se cabe folgado. */
export function photoSpaceNote(totalBytes: number): string | null {
  if (totalBytes <= 0) return null;
  const size = `As fotos somam cerca de ${formatBytes(totalBytes)} de ${formatBytes(STORAGE_LIMIT_BYTES)} grátis.`;
  return totalBytes / STORAGE_LIMIT_BYTES >= PHOTO_SPACE_WARN_RATIO
    ? `${size} O espaço grátis vai ficar quase cheio.`
    : null;
}

export interface PhotoSummary { lines: string[]; missing: string[]; failed: string[] }

/** Resumo das fotos para o relatório. */
export function photoSummary(r: ImportReport): PhotoSummary {
  const p = r.photos;
  const lines: string[] = [];
  lines.push(`Fotos no computador: ${p.onDisk}.`);
  if (p.sent > 0) lines.push(`Enviadas agora: ${p.sent}.`);
  if (p.alreadyThere > 0) lines.push(`Já estavam na internet: ${p.alreadyThere}.`);
  if (p.withoutThumb > 0) lines.push(`${p.withoutThumb} foto(s) sem miniatura: subiu só a foto inteira.`);
  if (p.extras > 0) lines.push(`${p.extras} arquivo(s) de foto no computador não pertencem a nenhuma OS e não foram enviados.`);
  return {
    lines,
    missing: p.missing.slice(0, 10).map(m => `OS ${m.osNumber}: ${m.reason}.`),
    failed: p.failed.slice(0, 10).map(f => `OS ${f.osNumber}: ${f.message}`),
  };
}

/** "Concluir" só com tudo igual e sem foto que falhou. */
export const canFinish = (r: ImportReport): boolean => r.ok && r.blockers.length === 0 && r.photos.failed.length === 0;

/** A palavra que o Dono digita para apagar o que já foi enviado. */
export const RESET_WORD = 'APAGAR';
export const confirmsReset = (typed: string): boolean => typed.trim().toUpperCase() === RESET_WORD;

export const DEFAULT_DB_PATH = 'C:\\OficinaData\\database.json';
