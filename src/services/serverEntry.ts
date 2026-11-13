// Porta de entrada das regras puras para a Edge Function `money` (docs/NUVEM-SPEC.md seção 3, "Deno").
// Reexporta só o que o servidor usa. O teste `serverEntry.imports.test.ts` percorre o grafo de imports a partir
// daqui e falha se entrar arquivo fora da lista, `@tauri-apps`, `react` ou uso de `window`/`document`:
// acrescentar um import novo aqui exige acrescentar o arquivo na lista do teste (de propósito).

export {
  applyInstallmentToOS, buildInstallmentEntries, finalizeOSSingle, getRemainingAmount, restoreFinancial,
  statusChangeEffects, togglePayment,
} from './osFinanceService';
export type { StatusChangeEffect } from './osFinanceService';
export { getOSReceipt, planDeleteOS, planReceiveOS, planReopenOS, removeOSReceipt, settleOpenReceipt } from './osFinanceGuards';
export { findAdvanceOwner, removeAllAdvances, validateAdvance } from './advances';
export { prepareOSSave } from './osSave';
export { mergeOSEdit } from './osEditMerge';
export { formatDateOnly, getDateTimeZone, parseDateOnly, setDateTimeZone } from '../utils/dates';
export { joinWorkOrder, splitWorkOrder } from '../sync/split';
export type { SplitOS, WorkOrderCosts, WorkOrderFinance, WorkOrderMain } from '../sync/split';
export { stable } from './osEditMerge';
export { ensureUniqueItemIds } from '../utils/itemIds';
