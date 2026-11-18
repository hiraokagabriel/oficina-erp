import { describe, expect, it } from 'vitest';
import { parseDatabase } from '../context/DatabaseContext';
import { migrate } from '../utils/migrations';
import { EXPORT_DUE_HOURS, driveFileName, exportWarning, isExportDue, runDailyExport } from './dailyExport';
import type { DailyExportDeps } from './dailyExport';
import { FakeImportServer } from './importFake';
import { prepareForCloud, splitDatabase } from './split';
import { fixture } from './testKit';

const SETTINGS = { name: '', cnpj: '', address: '', exportPath: '' };
const H = 3_600_000;
const NOW = '2026-11-17T12:00:00.000Z';
const ago = (ms: number): string => new Date(Date.parse(NOW) - ms).toISOString();

describe('isExportDue', () => {
  it('vazio ou ilegível = devida', () => {
    expect(isExportDue(null, NOW)).toBe(true);
    expect(isExportDue(undefined, NOW)).toBe(true);
    expect(isExportDue('', NOW)).toBe(true);
    expect(isExportDue('lixo', NOW)).toBe(true);
  });
  it('limite de 20 h: exatamente 20 h não é devida, 1 ms a mais é', () => {
    expect(EXPORT_DUE_HOURS).toBe(20);
    expect(isExportDue(ago(20 * H), NOW)).toBe(false);
    expect(isExportDue(ago(20 * H + 1), NOW)).toBe(true);
    expect(isExportDue(ago(1 * H), NOW)).toBe(false);
  });
  it('aceita Date', () => {
    expect(isExportDue(new Date(ago(30 * H)), new Date(NOW))).toBe(true);
  });
});

describe('exportWarning', () => {
  it('em dia até 2 dias cravados; depois avisa com os dias', () => {
    expect(exportWarning(ago(47 * H), NOW)).toBeNull();
    expect(exportWarning(ago(48 * H), NOW)).toBeNull();
    expect(exportWarning(ago(48 * H + 1), NOW)).toBe('A última cópia de segurança foi há 2 dias. Faça uma cópia agora.');
    expect(exportWarning(ago(5 * 24 * H), NOW)).toContain('há 5 dias');
  });
  it('sem nenhuma cópia avisa', () => {
    expect(exportWarning(null, NOW)).toContain('Ainda não foi feita');
  });
});

describe('driveFileName', () => {
  it('monta nome estável a partir do relógio', () => {
    expect(driveFileName('2026-11-17T15:04:05.123Z')).toBe('oficinapro-nuvem-20261117-150405.json');
  });
});

async function seeded() {
  const server = new FakeImportServer();
  await server.importRows('ws', splitDatabase(prepareForCloud(fixture(5))));
  const saved: string[] = [];
  const marks: string[] = [];
  let id = 0;
  const deps: DailyExportDeps = {
    transport: server.transport(), workshopId: 'ws', savedBy: 'PC-A', now: () => NOW, newId: () => `rev-${++id}`,
    saveDailyExport: async c => { saved.push(c); return 'C:\\backups\\nuvem\\nuvem-x.json'; },
    markExported: async at => { marks.push(at); },
  };
  return { server, saved, marks, deps };
}

describe('runDailyExport', () => {
  it('gera v5 que passa por parseDatabase + migrate sem mudar, com os dados do servidor', async () => {
    const { deps, saved, marks } = await seeded();
    const r = await runDailyExport(deps);
    expect(r).toMatchObject({ status: 'ok', drive: 'nao_configurado', skippedOrders: [] });
    expect(saved).toHaveLength(1);
    const db = parseDatabase(saved[0], SETTINGS);
    const m = migrate(db);
    expect(m.changed).toBe(false);
    expect(m.db.meta?.schemaVersion).toBe(5);
    expect(db.meta).toMatchObject({ revision: 'rev-1', savedBy: 'PC-A', savedAt: NOW });
    expect(db.workOrders).toHaveLength(3);
    expect(db.ledger).toHaveLength(6);
    expect(db.settings).not.toHaveProperty('googleDriveToken');
    expect(marks).toEqual([NOW]);
  });

  it('Drive configurado: envia o mesmo conteúdo', async () => {
    const { deps, saved } = await seeded();
    const sent: { name: string; content: string; token: string; key: string }[] = [];
    deps.drive = { accessToken: 'tk', apiKey: 'ak', upload: async (name, content, token, key) => { sent.push({ name, content, token, key }); } };
    const r = await runDailyExport(deps);
    expect(r).toMatchObject({ status: 'ok', drive: 'enviado' });
    expect(sent).toHaveLength(1);
    expect(sent[0].content).toBe(saved[0]);
    expect(sent[0]).toMatchObject({ name: 'oficinapro-nuvem-20261117-120000.json', token: 'tk', key: 'ak' });
  });

  it('falha do Drive não falha a cópia e ainda marca a data', async () => {
    const { deps, marks } = await seeded();
    deps.drive = { accessToken: 'tk', apiKey: 'ak', upload: async () => { throw new Error('token vencido'); } };
    const r = await runDailyExport(deps);
    expect(r).toMatchObject({ status: 'ok', drive: 'falhou', driveError: 'token vencido' });
    expect(marks).toEqual([NOW]);
  });

  it('falha ao marcar last_export_at não desfaz a cópia', async () => {
    const { deps } = await seeded();
    deps.markExported = async () => { throw new Error('sem rede'); };
    const r = await runDailyExport(deps);
    expect(r).toMatchObject({ status: 'ok', markError: 'sem rede' });
  });

  it('falha ao gravar no disco: erro, sem Drive nem marca', async () => {
    const { deps, marks } = await seeded();
    let drive = 0;
    deps.drive = { accessToken: 't', apiKey: 'k', upload: async () => { drive += 1; } };
    deps.saveDailyExport = async () => { throw new Error('disco cheio'); };
    const r = await runDailyExport(deps);
    expect(r.status).toBe('erro');
    expect(drive).toBe(0);
    expect(marks).toEqual([]);
  });

  it('falha ao ler a internet: erro, nada gravado', async () => {
    const { deps, saved } = await seeded();
    deps.transport = { pull: async () => { throw new Error('sem rede'); } };
    const r = await runDailyExport(deps);
    expect(r.status).toBe('erro');
    expect(saved).toEqual([]);
  });

  it('OS que não casa sai da cópia e vem listada', async () => {
    const { deps, saved } = await seeded();
    const orig = deps.transport.pull;
    deps.transport = { pull: async (ws, t, q) => {
      const rows = await orig(ws, t, q);
      return t === 'work_order_finance' ? rows.map(x => (x.id === 'W1' ? { ...x, data: { ...(x.data as object), prices: {} } } : x)) : rows;
    } };
    const r = await runDailyExport(deps);
    expect(r).toMatchObject({ status: 'ok', skippedOrders: ['W1'] });
    expect(parseDatabase(saved[0], SETTINGS).workOrders.map(o => o.id)).not.toContain('W1');
  });
});
