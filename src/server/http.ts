// Camada HTTP fina (Web Request/Response): CORS, método, JSON. Usada pelas entradas Deno.
import type { HandlerRequest, HandlerResult } from './core'

/** Origens fixas do app: WebView2 (Windows), WKWebView e dev. O domínio do Pages entra por variável. */
const TAURI_ORIGINS = ['http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost']

export function allowedOrigins(siteUrl: string | null, extra: string | null): string[] {
  const list = [...TAURI_ORIGINS]
  if (siteUrl) {
    try { list.push(new URL(siteUrl).origin) } catch { /* SITE_URL inválida: ignora */ }
  }
  if (extra) for (const o of extra.split(',')) if (o.trim()) list.push(o.trim().replace(/\/+$/, ''))
  return list
}

export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  if (origin && allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin
  return h
}

export async function serveHandler(
  req: Request, allowed: string[], run: (r: HandlerRequest) => Promise<HandlerResult>,
): Promise<Response> {
  const cors = corsHeaders(req.headers.get('origin'), allowed)
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'metodo_invalido', message: 'Use POST.' })
  if (!/^application\/json\s*(;|$)/i.test(req.headers.get('content-type') ?? '')) {
    return json(415, { ok: false, error: 'tipo_invalido', message: 'Envie o corpo como application/json.' })
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json(400, { ok: false, error: 'dados_invalidos', message: 'Corpo da requisição inválido.' })
  }
  const r = await run({ authorization: req.headers.get('authorization'), body })
  return json(r.status, r.body)
}
