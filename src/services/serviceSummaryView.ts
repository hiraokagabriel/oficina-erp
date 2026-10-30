import { WorkOrder, migrateChecklist } from '../types';
import { ServiceSummaryInspectionItem, ServiceSummaryItem, ServiceSummaryOptions } from './serviceSummary';
import { Money } from '../utils/helpers';

// Textos e escolhas do "Resumo do serviço": puro, usado pela impressão e pelo Modo cliente.

/** Escolhas da janela "Gerar resumo". */
export interface SummaryChoice {
  includeInspection: boolean;
  includeGeneralNote: boolean;
}

export const DEFAULT_SUMMARY_CHOICE: SummaryChoice = {
  includeInspection: false,
  includeGeneralNote: false,
};

/** A nota geral só vale junto com os itens da vistoria. */
export const choiceToOptions = (choice: SummaryChoice): ServiceSummaryOptions => ({
  includeInspection: choice.includeInspection,
  includeGeneralNote: choice.includeInspection && choice.includeGeneralNote,
});

/** Quantos itens do checklist foram inspecionados (status diferente de 'pending'). */
export const countInspectedItems = (os: Pick<WorkOrder, 'checklist'>): number => {
  let n = 0;
  for (const cat of migrateChecklist(os.checklist).categories) {
    for (const item of cat.items) if (item.status !== 'pending') n++;
  }
  return n;
};

/** A janela de escolha só aparece quando há ao menos um item marcado; senão gera direto, sem vistoria. */
export const needsSummaryChoice = (os: Pick<WorkOrder, 'checklist'>): boolean => countInspectedItems(os) > 0;

/** Texto de um item da vistoria: "Item (Categoria)". */
export const inspectionItemText = (item: ServiceSummaryInspectionItem): string =>
  item.category ? `${item.label} (${item.category})` : item.label;

/** Soma dos itens em centavos. */
export const sumItems = (items: ServiceSummaryItem[]): number => items.reduce((acc, i) => acc + i.price, 0);

/** Texto do detalhe de um item expandido no Modo cliente. */
export const itemDetailText = (item: ServiceSummaryItem, warrantyDays: number): string =>
  item.price > 0
    ? `Valor: ${Money.format(item.price)}. Garantia de ${warrantyDays} dias.`
    : 'Sem cobrança neste item, por isso sem garantia.';

/** Rótulo do restante: "Restante a pagar" ou, quando quitado, "Nada a pagar". */
export const remainingLabel = (remaining: number): string => (remaining > 0 ? 'Restante a pagar' : 'Nada a pagar');
