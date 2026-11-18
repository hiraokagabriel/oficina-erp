import { invoke } from '@tauri-apps/api/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runDailyExport } from '../sync/dailyExport';
import type { DailyExportResult, DriveConfig } from '../sync/dailyExport';
import { createSupabaseTransport } from '../sync/supabaseRepo';
import { generateId } from '../utils/helpers';
import { folderOfPath } from '../utils/documentOutput';
import { getSecret } from '../utils/secrets';

// Liga a cópia diária (`runDailyExport`) ao mundo real: Supabase, comando Tauri e Google Drive deste PC. Sem regra de negócio.

/** Drive só conta se o PC tem o código de acesso e a chave (ficam no localStorage de cada PC, `secrets.ts`). */
export function driveFromSecrets(): DriveConfig | null {
  const accessToken = getSecret('googleDriveToken');
  const apiKey = getSecret('googleApiKey');
  return accessToken && apiKey ? { accessToken, apiKey } : null;
}

const FOLDER_KEY = 'oficina.exportFolder';

/** Pasta onde a última cópia deste PC foi guardada (o Rust escolhe a pasta; só ficamos sabendo ao gravar). */
export function readExportFolder(): string {
  try { return localStorage.getItem(FOLDER_KEY) || ''; } catch { return ''; }
}
function rememberExportFolder(path: string): void {
  const dir = folderOfPath(path);
  if (dir) { try { localStorage.setItem(FOLDER_KEY, dir); } catch { /* sem armazenamento */ } }
}

export interface ExportNowOptions {
  supabase: SupabaseClient;
  workshopId: string;
  /** Nome deste aparelho, gravado em `meta.savedBy`. */
  deviceName: string;
}

export async function exportNow(o: ExportNowOptions): Promise<DailyExportResult> {
  const res = await runDailyExport({
    transport: createSupabaseTransport(o.supabase),
    workshopId: o.workshopId,
    savedBy: o.deviceName,
    now: () => new Date().toISOString(),
    newId: generateId,
    saveDailyExport: content => invoke<string>('save_daily_export', { content }),
    async markExported(at) {
      const { error } = await o.supabase.from('workshops').update({ last_export_at: at }).eq('id', o.workshopId);
      if (error) throw new Error(error.message);
    },
    drive: driveFromSecrets(),
  });
  if (res.status === 'ok') rememberExportFolder(res.path);
  return res;
}
