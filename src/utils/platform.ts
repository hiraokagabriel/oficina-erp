/** Está dentro do programa instalado (Tauri)? Fora dele (navegador, modo nuvem na web) é falso. */
export const isTauri = (): boolean =>
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
