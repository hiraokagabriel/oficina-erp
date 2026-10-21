// Texto do indicador "Salvo" do menu lateral. Lógica pura: o componente só desenha.

export type SaveStatusKind = 'readonly' | 'conflict' | 'error' | 'saving' | 'pending' | 'saved';

export interface SaveStatusInput {
  isSaving: boolean;
  saveError: string | null;
  readOnly: boolean;
  /** Há alteração ainda não gravada (debounce de 3 s ou gravação em andamento/retentativa). */
  hasPendingChanges?: boolean;
  /** O diálogo de conflito está aberto: nada é gravado até recarregar. */
  hasConflict?: boolean;
  /** ISO do último salvamento concluído nesta sessão (null = ainda não salvou). */
  lastSavedAt: string | null;
}

export interface SaveStatusView { kind: SaveStatusKind; text: string }

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "14:32" no horário local; vazio se a data for inválida. */
export const formatClock = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/** Prioridade: somente leitura, conflito, salvando, erro/retentativa, pendente, salvo. */
export const describeSaveStatus = ({ isSaving, saveError, readOnly, hasPendingChanges = false, hasConflict = false, lastSavedAt }: SaveStatusInput): SaveStatusView => {
  if (readOnly) return { kind: 'readonly', text: 'Somente leitura' };
  if (hasConflict) return { kind: 'conflict', text: 'Conflito, não salvo' };
  if (isSaving) return { kind: 'saving', text: 'Salvando...' };
  if (saveError) return { kind: 'error', text: 'Não salvo, tentando de novo' };
  if (hasPendingChanges) return { kind: 'pending', text: 'Alterações pendentes' };
  const clock = formatClock(lastSavedAt);
  return { kind: 'saved', text: clock ? `Salvo às ${clock}` : 'Salvo' };
};
