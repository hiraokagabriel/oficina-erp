/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" liga o modo nuvem (login, Supabase). Ausente = modo arquivo, como sempre foi. */
  readonly VITE_CLOUD?: string;
  readonly VITE_SUPABASE_URL?: string;
  /** Chave publicável (anon). Nunca a chave de serviço. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Endereço público do site, usado nos links dos e-mails de convite e de senha. */
  readonly VITE_SITE_URL?: string;
}
