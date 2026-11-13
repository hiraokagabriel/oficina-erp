// Monta as dependências reais a partir das variáveis de ambiente da Edge (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// SITE_URL, CORS_ORIGINS). Compartilhado pelas três entradas Deno.
import type { Deps, HandlerRequest, HandlerResult } from './core'
import { allowedOrigins, serveHandler } from './http'
import { createAuthAdmin, createDb } from './restAdapters'

export function createRuntime(env: (name: string) => string | undefined): { deps: Deps; allowed: string[] } {
  const url = env('SUPABASE_URL')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente')
  const siteUrl = env('SITE_URL') ?? null
  const cfg = { url, serviceKey }
  const deps: Deps = {
    auth: createAuthAdmin(cfg),
    db: createDb(cfg),
    random: (n) => crypto.getRandomValues(new Uint8Array(n)),
    now: () => new Date(),
    log: (level, message, extra) => console[level === 'info' ? 'log' : level](message, extra ?? ''),
    siteUrl,
  }
  return { deps, allowed: allowedOrigins(siteUrl, env('CORS_ORIGINS') ?? null) }
}

export function makeFetchHandler(
  env: (name: string) => string | undefined,
  handler: (deps: Deps, req: HandlerRequest) => Promise<HandlerResult>,
): (req: Request) => Promise<Response> {
  const rt = createRuntime(env)
  return (req) => serveHandler(req, rt.allowed, (r) => handler(rt.deps, r))
}
