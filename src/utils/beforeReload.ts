// Descarrega o que ainda está em debounce antes de recarregar a janela ("Tentar de novo" do LazyBoundary). Sem isto,
// no modo arquivo o salvamento de 3 s do DatabaseContext se perderia no reload. Quem guarda estado pendente registra
// aqui o seu descarregador; o LazyBoundary espera todos (com limite) e só então recarrega.

type Flusher = () => void | Promise<void>;

const flushers = new Set<Flusher>();

/** Registra um descarregador; devolve a função que o remove. */
export function registerBeforeReload(f: Flusher): () => void {
  flushers.add(f);
  return () => { flushers.delete(f); };
}

/** Chama todos e espera, no máximo `limitMs`. Nunca rejeita: falha de um não impede os outros nem a recarga. */
export async function flushBeforeReload(limitMs = 5000): Promise<void> {
  const runs = [...flushers].map(async f => { try { await f(); } catch (e) { console.warn('Falha ao descarregar antes de recarregar:', e); } });
  if (runs.length === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<void>(resolve => { timer = setTimeout(resolve, limitMs); });
  await Promise.race([Promise.all(runs), limit]);
  clearTimeout(timer);
}

/** Só para testes. */
export function resetBeforeReload(): void { flushers.clear(); }
