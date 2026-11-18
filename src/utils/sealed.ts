// Banco "lacrado": depois da importação para a nuvem o `database.json` ganha `meta.cloud` e `schemaVersion = 1000`
// (docs/NUVEM-PR9.md, D4). Leitura pura do JSON cru: `parseDatabase` descarta `meta.cloud`.
// Fica fora do `importRunner` para o modo arquivo não puxar o código da nuvem.

/** Versão gravada no arquivo lacrado (igual a `SEALED_SCHEMA_VERSION` do `importRunner`; um teste confere). */
export const SEALED_VERSION = 1000;

export interface SealedInfo {
  /** Quando foi enviado (ISO) ou null se o arquivo não diz. */
  at: string | null;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** null = arquivo normal. Texto ilegível também dá null (quem carrega trata o erro). */
export function readSealedInfo(content: string): SealedInfo | null {
  let raw: unknown;
  try { raw = JSON.parse(content); } catch { return null; }
  const meta = isRec(raw) && isRec(raw.meta) ? raw.meta : null;
  if (!meta) return null;
  const cloud = isRec(meta.cloud) ? meta.cloud : null;
  const version = typeof meta.schemaVersion === 'number' ? meta.schemaVersion : 0;
  if (!cloud && version < SEALED_VERSION) return null;
  const at = cloud && typeof cloud.at === 'string' ? cloud.at : null;
  return { at };
}

/** "Este banco foi enviado para a nuvem em 17/11/2026. Use o app novo." (a data é local; sem data, a frase sem ela). */
export function sealedBannerText(info: SealedInfo): string {
  const d = info.at ? new Date(info.at) : null;
  const when = d && !Number.isNaN(d.getTime()) ? ` em ${d.toLocaleDateString('pt-BR')}` : '';
  return `Este banco foi enviado para a nuvem${when}. Use o app novo.`;
}
