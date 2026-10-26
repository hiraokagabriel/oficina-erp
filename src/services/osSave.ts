import { AuditEvent, LedgerEntry, OSAdvanceDraft, WorkOrder } from '../types';
import { generateId } from '../utils/helpers';
import { formatDateOnly } from '../utils/dates';
import { migrateLegacyAdvance } from '../utils/migrations';
import { advancesExceedTotal, syncAdvances, validateAdvance } from './advances';
import { isAdvanceSyncLocked, refreshFinishedReceipt } from './osFinanceService';

// Ligação pura do "salvar OS" com adiantamentos v4: o App só chama esta função e aplica o resultado.
// Nada é gravado em estado parcial: com erro, `ok` é false e nenhuma parte do resultado deve ser aplicada.

export type PrepareOSSaveResult =
  | { ok: false; error: string }
  | { ok: true; os: WorkOrder; ledger: LedgerEntry[]; events: AuditEvent[]; exceedsTotal: boolean };

/**
 * @param base OS já com os campos editados (nova ou atualizada), ainda sem aplicar a lista de adiantamentos.
 * @param previous OS como estava antes da edição (undefined = OS nova). O travamento vale pelo estado ANTERIOR.
 * @param drafts lista COMPLETA de adiantamentos do modal. undefined = o modal não mexeu nos adiantamentos (mantém como estão).
 * @param today dia local 'AAAA-MM-DD' (limite da data do adiantamento).
 *
 * Regras:
 * - OS travada (finalizada/com financeiro): drafts ignorados, adiantamentos e seus lançamentos intactos, sem eventos;
 *   o lançamento à vista é atualizado por refreshFinishedReceipt (nunca o de OS parcelada).
 * - OS legada ainda não migrada (advanceAmount + advanceEntryId): vira advances[0] (mesma conversão da migração v3ToV4,
 *   SEM evento de criação) antes de aplicar os drafts.
 * - Draft inválido (valor, data ou data futura): erro e nada é salvo.
 * - Soma dos adiantamentos maior que o total: só sinaliza em `exceedsTotal`.
 */
export const prepareOSSave = ({ base, previous, drafts, ledger, today = formatDateOnly(new Date()), now = new Date().toISOString(), newId = generateId, machine }: {
  base: WorkOrder;
  previous?: WorkOrder;
  drafts?: OSAdvanceDraft[];
  ledger: LedgerEntry[];
  today?: string;
  now?: string;
  newId?: () => string;
  machine: string;
}): PrepareOSSaveResult => {
  if (previous && isAdvanceSyncLocked(previous)) {
    const finished = base.financialId ? refreshFinishedReceipt(base, ledger) : ledger;
    return { ok: true, os: base, ledger: finished, events: [], exceedsTotal: advancesExceedTotal(base) };
  }

  const converted = migrateLegacyAdvance(base, new Map(ledger.map(e => [e.id, e])));
  const wasConverted = converted !== base;
  const effective: OSAdvanceDraft[] = drafts
    ?? (converted.advances ?? []).map(a => ({ id: a.id, date: a.date, amount: a.amount }));

  if (drafts) {
    for (const d of drafts) {
      const v = validateAdvance(d, today);
      if (!v.valid) return { ok: false, error: v.error ?? 'Adiantamento inválido.' };
    }
  }

  const synced = syncAdvances({ os: converted, drafts: effective, ledger, now, newId, machine });
  let os: WorkOrder = { ...converted, advances: synced.advances };
  // Quando os adiantamentos foram tratados (drafts ou conversão), o legado sai da OS.
  if (drafts || wasConverted) {
    const { advanceAmount: _a, advanceEntryId: _e, ...rest } = os;
    os = rest;
  }
  if (!drafts && !wasConverted && !base.advances) os = base; // OS sem adiantamento algum: não inventa `advances: []`.
  return { ok: true, os, ledger: synced.ledger, events: synced.events, exceedsTotal: advancesExceedTotal(os) };
};

/** Mensagem do toast quando a soma dos adiantamentos passa do total (não bloqueia o salvamento). */
export const ADVANCES_EXCEED_MESSAGE = 'A soma dos adiantamentos é maior que o total da OS.';

/** Recusa de edição/exclusão de lançamento de adiantamento fora da OS. */
export const advanceLockedMessage = (osNumber: number): string =>
  `Este lançamento é um adiantamento. Edite pela OS #${osNumber}.`;
