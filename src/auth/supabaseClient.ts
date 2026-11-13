import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Cliente único do Supabase (modo nuvem). URL e chave PUBLICÁVEL vêm de `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
// (a chave publicável é feita para ir no app; quem protege os dados é a RLS). Persistência padrão do supabase-js:
// sessão no `localStorage` do WebView, renovação automática do token. Este módulo só é importado atrás da flag
// `VITE_CLOUD` (import dinâmico no `main.tsx`), então o modo arquivo não carrega o supabase-js.

export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabaseConfigured = (): boolean => SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY.length > 10;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

/** Endereço público do site (links dos e-mails: `<site>/convite` e `<site>/nova-senha`). */
export const siteUrl = (): string => {
  const v: string | undefined = import.meta.env.VITE_SITE_URL;
  return (v && v.length > 0 ? v : window.location.origin).replace(/\/+$/, '');
};
