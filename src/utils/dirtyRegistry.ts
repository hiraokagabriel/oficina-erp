// Registro global das janelas abertas com alteração não salva (alimentado pelo `useDirtyGuard`). Serve para o
// "Trocar de pessoa"/F8 perguntar antes e para a próxima pessoa saber que a anterior deixou algo aberto
// (docs/NUVEM-UX.md 4.2 e 4.3). Puro: nada de React nem DOM.

export interface DirtyEntry { isDirty: () => boolean; /** Como a janela é chamada na frase: "a OS 1234", "um lançamento". */ label: string }

const entries = new Set<DirtyEntry>();

/** Registra a janela aberta; devolve a função que a tira do registro. */
export function registerDirty(entry: DirtyEntry): () => void {
  entries.add(entry);
  return () => { entries.delete(entry); };
}

/** Rótulos (sem repetir) das janelas abertas e sujas. */
export function dirtyLabels(): string[] {
  const out: string[] = [];
  for (const e of entries) if (e.isDirty() && !out.includes(e.label)) out.push(e.label);
  return out;
}

export const anyDirty = (): boolean => dirtyLabels().length > 0;

/** "a OS 1234" / "a OS 1234 e um lançamento". */
export const joinLabels = (labels: readonly string[]): string =>
  labels.length <= 1 ? (labels[0] ?? 'uma janela') : `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;

/** Título da confirmação de quem entra: "Ana deixou a OS 1234 aberta sem salvar". */
export const leftOpenTitle = (name: string, labels: readonly string[]): string => `${name} deixou ${joinLabels(labels)} aberta sem salvar`;
export const LEFT_OPEN_TEXT = 'Se você entrar, o que ela digitou nessa janela se perde. O que já estava salvo continua.';
