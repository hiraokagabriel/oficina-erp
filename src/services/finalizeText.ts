import { Money } from '../utils/helpers';

/** Textos do passo "Finalizar OS": sempre mostram o total e quanto vai de fato para as Receitas. */
export function buildFinalizeLines(total: number, remaining: number): string[] {
  const lines = [`Valor total da OS: ${Money.format(total)}`];
  const advance = total - remaining;
  if (advance > 0) lines.push(`Adiantamento já recebido: ${Money.format(advance)}`);
  lines.push(`Vai entrar nas Receitas: ${Money.format(remaining)}`);
  if (remaining <= 0) lines.push('Nada a lançar: a OS já foi paga pelo adiantamento.');
  return lines;
}

/** Mensagem do "Finalizar OS?". */
export function buildFinalizeMessage(total: number, remaining: number): string {
  return [...buildFinalizeLines(total, remaining), 'No próximo passo você escolhe à vista ou parcelado.'].join('\n');
}

/** Mensagem do "Deseja Parcelar?" (total sempre visível; falta receber só quando há adiantamento). */
export function buildInstallmentMessage(total: number, remaining: number): string {
  const lines = [`Valor total da OS: ${Money.format(total)}`];
  if (remaining !== total) lines.push(`Falta receber (vai para as Receitas): ${Money.format(remaining)}`);
  return `${lines.join('\n')}\n\nEscolha como deseja receber o pagamento`;
}
