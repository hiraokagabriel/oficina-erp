import type { SupabaseClient } from '@supabase/supabase-js';
import type { PushGroup, PushGroupResult } from './outbox';
import { TransportError } from './syncEngine';
import type { PullRequest, PulledRow, Transport } from './syncEngine';
import type { CloudTable } from './types';

// Transporte do motor com supabase-js. Fino: sem regra de negócio, só RPC, select e canal Realtime, mais a
// tradução dos erros em `TransportError` (o motor decide o que fazer com cada tipo).

const COLUMNS = 'id, version, data, deleted_at, updated_at';
const IDS_PER_CALL = 200;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Erro do PostgREST/supabase-js (ou exceção de fetch) em erro tipado. Sem `code` de servidor = sem resposta (rede). */
export function toTransportError(err: unknown, status?: number): TransportError {
  const e = isObj(err) ? err : {};
  const message = typeof e.message === 'string' && e.message !== '' ? e.message : String(err);
  const code = typeof e.code === 'string' && e.code !== '' ? e.code : undefined;
  if (status === 401 || status === 403 || code === '42501' || (code !== undefined && /^PGRST30[123]$/.test(code)) || /jwt/i.test(message)) {
    return new TransportError(message, 'auth', code);
  }
  if (code === '57014') return new TransportError(message, 'timeout', code);
  if (code !== undefined) return new TransportError(message, 'server', code);
  return new TransportError(message, 'network');
}

function toRow(table: CloudTable, raw: unknown): PulledRow {
  if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.updated_at !== 'string') throw new TransportError(`Linha inválida em ${table}`, 'server');
  const row: PulledRow = {
    table, id: raw.id, version: Number(raw.version), data: raw.data,
    deleted_at: typeof raw.deleted_at === 'string' ? raw.deleted_at : null, updated_at: raw.updated_at,
  };
  if (table === 'ledger') row.os_id = typeof raw.os_id === 'string' ? raw.os_id : null;
  return row;
}

const cols = (table: CloudTable): string => (table === 'ledger' ? `${COLUMNS}, os_id` : COLUMNS);

/** Valor entre aspas para o filtro `or` do PostgREST (o id pode ter vírgula ou parêntese). */
const quoted = (v: string): string => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

let channelSeq = 0;

export function createSupabaseTransport(supabase: SupabaseClient): Transport {
  return {
    async push(ws: string, groups: PushGroup[]): Promise<PushGroupResult[]> {
      let res;
      try {
        res = await supabase.rpc('sync_push', { ws, groups });
      } catch (e) {
        throw toTransportError(e);
      }
      if (res.error) throw toTransportError(res.error, res.status);
      if (!Array.isArray(res.data)) throw new TransportError('Resposta inesperada do servidor (sync_push)', 'server');
      return res.data as PushGroupResult[];
    },

    async pull(ws: string, table: CloudTable, req: PullRequest): Promise<PulledRow[]> {
      let q = supabase.from(table).select(cols(table)).eq('workshop_id', ws);
      if (req.after) {
        // Keyset: depois de (updated_at, id), sem depender de `max_rows` nem de microssegundos.
        const ts = req.after.updated_at;
        q = q.or(`updated_at.gt.${ts},and(updated_at.eq.${ts},id.gt.${quoted(req.after.id)})`);
      } else if (req.since !== null) {
        q = q.gte('updated_at', req.since);
      }
      const res = await q.order('updated_at', { ascending: true }).order('id', { ascending: true }).limit(req.limit);
      if (res.error) throw toTransportError(res.error, res.status);
      return ((res.data ?? []) as unknown[]).map(r => toRow(table, r));
    },

    async fetchByIds(ws: string, table: CloudTable, ids: string[]): Promise<PulledRow[]> {
      const out: PulledRow[] = [];
      for (let i = 0; i < ids.length; i += IDS_PER_CALL) {
        const res = await supabase.from(table).select(cols(table)).eq('workshop_id', ws).in('id', ids.slice(i, i + IDS_PER_CALL));
        if (res.error) throw toTransportError(res.error, res.status);
        for (const r of (res.data ?? []) as unknown[]) out.push(toRow(table, r));
      }
      return out;
    },

    subscribe(ws: string, tables: CloudTable[], onSignal: (table: CloudTable | 'all') => void): () => void {
      // Tópico único por montagem: duas montagens (StrictMode, troca de pessoa) não podem dividir o mesmo canal.
      const channel = supabase.channel(`sync:${ws}:${++channelSeq}:${Math.random().toString(36).slice(2, 8)}`);
      for (const t of tables) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `workshop_id=eq.${ws}` }, () => onSignal(t));
      }
      // Todo SUBSCRIBED (o primeiro também) puxa tudo: entre o pull inicial e a assinatura pode ter passado mudança.
      channel.subscribe(status => { if (status === 'SUBSCRIBED') onSignal('all'); });
      return () => { void supabase.removeChannel(channel); };
    },
  };
}
