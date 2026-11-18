// Texto do aviso quando um pedaço carregado sob demanda (React.lazy) falha. Lógica pura: o componente só desenha.

/** Falha de chunk do Vite/webpack (sem internet, deploy novo, cache velho). */
export function isChunkLoadError(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [^ ]+ failed|ChunkLoadError/i.test(msg);
}

export const CHUNK_MESSAGE = 'Não deu para abrir esta parte sem internet. Conecte e toque em Tentar de novo.';
export const GENERIC_MESSAGE = 'Algo deu errado ao abrir esta parte. Toque em Tentar de novo.';

export const lazyErrorMessage = (e: unknown): string => (isChunkLoadError(e) ? CHUNK_MESSAGE : GENERIC_MESSAGE);
