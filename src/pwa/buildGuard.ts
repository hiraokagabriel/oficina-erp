// Guarda contra trocar as chaves: o build `real` só aceita o projeto real e o `cloud` só o de teste.
// Puro: o vite.config.ts chama `assertSupabaseTarget` com o modo e a URL lida do .env.

export const REAL_PROJECT_REF = 'stblagzkkffbjuzltfrt';
export const TEST_PROJECT_REF = 'xtnnayaxufhmyrqcwwnr';

/** Referência do projeto esperada para o modo; `null` = o modo não é conferido (arquivo, dev, analyze). */
export function expectedProjectRef(mode: string): string | null {
  if (mode === 'real') return REAL_PROJECT_REF;
  if (mode === 'cloud') return TEST_PROJECT_REF;
  return null;
}

/** Lança erro se a URL do Supabase não for do projeto esperado para o modo. */
export function assertSupabaseTarget(mode: string, url: string | undefined): void {
  const ref = expectedProjectRef(mode);
  if (ref === null) return;
  if (!url || !url.includes(ref)) {
    throw new Error(
      `Build "${mode}" recusado: VITE_SUPABASE_URL deve conter ${ref}. Confira o .env.${mode}.local (chaves trocadas?).`,
    );
  }
}
