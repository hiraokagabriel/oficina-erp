import type { WorkOrder } from '../types';

// Módulo-folha (só tipos): soma de adiantamentos e restante da OS. Reexportado por osFinanceService e advances.

// Soma dos adiantamentos da OS (schema v4). OS legada sem `advances`: 0 (use getRemainingAmount para a regra antiga).
export const sumAdvances = (os: Pick<WorkOrder, 'advances'>): number =>
  (os.advances ?? []).reduce((acc, a) => acc + a.amount, 0);

// Valor ainda a receber da OS. Com `advances` (v4): max(total - soma, 0).
// OS legada sem `advances`: total - adiantamento só quando o adiantamento está no caixa (advanceEntryId);
// advanceAmount sem advanceEntryId usa o total cheio (D3).
export const getRemainingAmount = (os: WorkOrder): number => {
  if (os.advances) return Math.max(os.total - sumAdvances(os), 0);
  return os.advanceEntryId ? Math.max(os.total - (os.advanceAmount || 0), 0) : os.total;
};
