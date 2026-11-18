import { describe, expect, it } from 'vitest';
import { parseDatabase } from '../context/DatabaseContext';
import type { DatabaseSchema } from '../types';
import { CURRENT_SCHEMA_VERSION, migrate } from '../utils/migrations';
import { FakeImportServer } from './importFake';
import { SEALED_SCHEMA_VERSION, createImportRunner, inspectFile } from './importRunner';
import type { ImportDeps, SaveOutcome } from './importRunner';
import type { PhotoFileInfo } from './importCheck';
import { fixture } from './testKit';
import { emptyTotals } from './importCheck';
import { pullAllRows } from './fullPull';
import type { PulledRow } from './syncEngine';
import type { CloudTable } from './types';

const SETTINGS = { name: '', cnpj: '', address: '', exportPath: '' };
const WS = 'ws-1';

interface Disk { content: string; revision: string | null; saved: { content: string; expected: string | null }[]; saveResult: SaveOutcome }

function dbWithPhotos(): DatabaseSchema {
  const db = fixture(5);
  db.workOrders[0].photos = [
    { id: 'ph1', createdAt: '2025-01-10T15:00:00.000Z' },
    { id: 'ph2', createdAt: '2025-01-10T15:00:00.000Z' },
    { id: 'ph3', createdAt: '2025-01-10T15:00:00.000Z' },
  ];
  return db;
}

function setup(db: DatabaseSchema = fixture(5), inv: PhotoFileInfo[] = []) {
  const server = new FakeImportServer();
  const disk: Disk = { content: JSON.stringify(db), revision: 'r', saved: [], saveResult: { status: 'ok' } };
  const uploads: string[] = [];
  const listed: Record<string, string[]> = {};
  const unreadable = new Set<string>();
  let idSeq = 0;
  const deps: ImportDeps = {
    workshopId: WS,
    dbPath: 'C:\\x\\database.json',
    readDatabase: async () => disk.content,
    readMeta: async () => ({ status: 'ok', revision: disk.revision }),
    backupPreCloud: async () => 'C:\\backups\\pre-nuvem.json',
    photoInventory: async () => inv,
    parseDatabase: c => parseDatabase(c, SETTINGS),
    importRows: (ws, rows) => server.importRows(ws, rows),
    importFinish: (ws, c, e) => server.importFinish(ws, c, e),
    importReset: ws => server.importReset(ws),
    transport: server.transport(),
    listPhotoObjects: async osId => listed[osId] ?? [],
    readPhoto: async (osId, photoId, thumb) => (unreadable.has(`${osId}/${photoId}`) ? null : new Blob([`${photoId}${thumb ? 't' : ''}`])),
    uploadPhoto: async (osId, photoId, thumb) => { uploads.push(`${osId}/${photoId}${thumb ? '.t' : ''}`); return { ok: true }; },
    saveDatabase: async (_p, content, expected) => { disk.saved.push({ content, expected }); return disk.saveResult; },
    now: () => '2026-11-17T15:00:00.000Z',
    newId: () => `id-${++idSeq}`,
  };
  return { server, disk, deps, uploads, listed, unreadable, runner: () => createImportRunner(deps) };
}

const disk3 = (os: string, id: string, thumb = true): PhotoFileInfo => ({ osId: os, photoId: id, bytes: 1000, hasThumb: thumb });

describe('importRunner: caminho feliz', () => {
  it('envia, confere e fica pronto; relatório sem diferenças', async () => {
    const { runner, server, disk } = setup();
    const r = await runner().run();
    expect(r.status).toBe('pronto');
    if (r.status !== 'pronto') return;
    expect(r.report.ok).toBe(true);
    expect(r.report.differences).toEqual([]);
    expect(r.report.roundTrip).toEqual([]);
    expect(r.report.lines.every(l => l.same)).toBe(true);
    expect(r.report.backupPath).toContain('pre-nuvem');
    expect(server.state).toBe('importando');
    expect(server.finishCalls).toEqual([false]);
    expect(disk.saved).toEqual([]); // nada lacrado antes do commit
  });

  it('commit conclui na nuvem e lacra com a revision esperada', async () => {
    const { runner, server, disk } = setup();
    const rn = runner();
    const r = await rn.run();
    if (r.status !== 'pronto') throw new Error('esperava pronto');
    const c = await rn.commit(r.session);
    expect(c.status).toBe('concluido');
    expect(server.state).toBe('concluido');
    expect(server.finishCalls).toEqual([false, true]);
    expect(disk.saved).toHaveLength(1);
    expect(disk.saved[0].expected).toBe('r');
    const sealed = JSON.parse(disk.saved[0].content) as { meta: { schemaVersion: number; revision: string; history: string[]; cloud: { workshopId: string; at: string } } };
    expect(sealed.meta.schemaVersion).toBe(SEALED_SCHEMA_VERSION);
    expect(sealed.meta.cloud).toEqual({ workshopId: WS, at: '2026-11-17T15:00:00.000Z' });
    expect(sealed.meta.history[0]).toBe('r');
    expect(sealed.meta.revision).not.toBe('r');
  });

  it('o lacrado abre só para leitura na versão antiga e é recusado na importação', async () => {
    const { runner, disk, deps } = setup();
    const rn = runner();
    const r = await rn.run();
    if (r.status !== 'pronto') throw new Error('esperava pronto');
    await rn.commit(r.session);
    const sealed = disk.saved[0].content;
    // versão antiga: parseDatabase + migrate devolvem intacto (versão futura = só leitura)
    const parsed = parseDatabase(sealed, SETTINGS);
    expect(parsed.meta?.schemaVersion).toBe(SEALED_SCHEMA_VERSION);
    expect(SEALED_SCHEMA_VERSION).toBeGreaterThan(CURRENT_SCHEMA_VERSION);
    const m = migrate(parsed);
    expect(m.changed).toBe(false);
    expect(m.from).toBeGreaterThan(CURRENT_SCHEMA_VERSION);
    // dados preservados
    expect(parsed.workOrders).toHaveLength(3);
    // importação recusa
    expect(inspectFile(sealed)).toMatchObject({ kind: 'refused', reason: 'lacrado' });
    const fresh = new FakeImportServer();
    const again = await createImportRunner({ ...deps, readDatabase: async () => sealed, importRows: (w, rows) => fresh.importRows(w, rows) }).run();
    expect(again).toMatchObject({ status: 'recusado', reason: 'lacrado' });
    expect(fresh.rowsCalls).toBe(0);
  });

  it('versão futura comum e arquivo ilegível são recusados', async () => {
    const future = JSON.stringify({ ledger: [], meta: { schemaVersion: 6, revision: 'x', history: [], savedAt: '', savedBy: '' } });
    expect(inspectFile(future)).toMatchObject({ kind: 'refused', reason: 'versao_futura' });
    expect(inspectFile('{nao json')).toMatchObject({ kind: 'refused', reason: 'ilegivel' });
    expect(inspectFile(JSON.stringify(fixture(5)))).toEqual({ kind: 'ok' });
  });

  it('banco antigo (v3) é migrado antes de enviar', async () => {
    const { runner } = setup(fixture(3));
    const r = await runner().run();
    expect(r.status).toBe('pronto');
  });
});

describe('importRunner: dados problemáticos', () => {
  it('bloqueia antes de enviar qualquer linha, mas depois da cópia', async () => {
    const db = fixture(5);
    db.ledger[0].amount = 12.5;
    const { runner, server } = setup(db);
    const r = await runner().run();
    expect(r.status).toBe('bloqueado');
    if (r.status !== 'bloqueado') return;
    expect(r.problems.length).toBeGreaterThan(0);
    expect(r.backupPath).toContain('pre-nuvem');
    expect(server.rowsCalls).toBe(0);
  });

  it('cópia pre-nuvem falhou: não envia nada', async () => {
    const { runner, server, deps } = setup();
    deps.backupPreCloud = async () => { throw new Error('disco cheio'); };
    const r = await runner().run();
    expect(r).toMatchObject({ status: 'erro', phase: 'copia' });
    expect(server.rowsCalls).toBe(0);
  });
});

describe('importRunner: lotes, queda e 57014', () => {
  it('queda no lote k e reenvio dão os mesmos totais', async () => {
    const small = { maxRows: 2, maxBytes: 1_000_000 };
    const ref = setup();
    ref.deps.batchLimits = small;
    await ref.runner().run();

    const s = setup();
    s.deps.batchLimits = small;
    s.server.failCall = 4;
    const rn = s.runner();
    const first = await rn.run();
    expect(first).toMatchObject({ status: 'erro', phase: 'enviar' });
    expect(s.server.state).toBe('importando');
    const second = await rn.run(); // retomar = reenviar tudo
    expect(second.status).toBe('pronto');
    for (const t of ['work_orders', 'work_order_finance', 'ledger', 'clients', 'settings'] as CloudTable[]) {
      expect(s.server.count(t)).toBe(ref.server.count(t));
    }
    if (second.status === 'pronto') expect(second.report.differences).toEqual([]);
  });

  it('57014 divide o lote ao meio até caber', async () => {
    const s = setup();
    s.server.timeoutOver = 1;
    const r = await s.runner().run();
    expect(r.status).toBe('pronto');
    expect(Math.max(...s.server.accepted)).toBe(1);
    expect(s.server.count('ledger')).toBe(6);
  });

  it('linha única que estoura o tempo vira erro (não fica em laço)', async () => {
    const s = setup();
    s.server.timeoutOver = 0;
    const r = await s.runner().run();
    expect(r).toMatchObject({ status: 'erro', phase: 'enviar' });
  });

  it('importação já concluída recusa o envio', async () => {
    const s = setup();
    s.server.state = 'concluido';
    const r = await s.runner().run();
    expect(r).toMatchObject({ status: 'erro', phase: 'enviar' });
  });
});

describe('importRunner: conferências', () => {
  it('divergência de totais não libera o commit', async () => {
    const s = setup();
    s.server.beforeTotals = () => {
      const row = s.server.get('ledger', 'L1');
      s.server.tamper('ledger', 'L1', { ...(row?.data as object), amount: 999 });
    };
    const rn = s.runner();
    const r = await rn.run();
    expect(r.status).toBe('divergente');
    if (r.status !== 'divergente') return;
    expect(r.report.ok).toBe(false);
    expect(r.report.differences.length).toBeGreaterThan(0);
    // sem sessão pronta, não há como concluir; forjar uma sessão também é recusado
    const forged = await rn.commit({ ready: true, report: r.report, db: fixture(5), revision: 'r', expected: emptyTotals() });
    expect(forged.status).toBe('recusado');
    expect(s.server.finishCalls).toEqual([false]);
    expect(s.disk.saved).toEqual([]);
  });

  it('volta com diferença de conteúdo (mesmos totais) também bloqueia', async () => {
    const s = setup();
    const orig = s.deps.transport.pull;
    s.deps.transport = { pull: async (ws, table, req) => {
      const rows = await orig(ws, table, req);
      return table === 'clients' ? rows.map(r => ({ ...r, data: { ...(r.data as object), name: 'Outro' } })) : rows;
    } };
    const r = await s.runner().run();
    expect(r.status).toBe('divergente');
    if (r.status === 'divergente') expect(r.report.roundTrip.some(d => d.collection === 'clients')).toBe(true);
  });

  it('OS que não casa na volta: tenta de novo uma vez e passa se a segunda leitura vem boa', async () => {
    const s = setup();
    const orig = s.deps.transport.pull;
    let passes = 0;
    s.deps.transport = { pull: async (ws, table, req): Promise<PulledRow[]> => {
      if (table === 'work_orders' && req.after === null) passes += 1;
      const rows = await orig(ws, table, req);
      if (passes === 1 && table === 'work_order_finance') return rows.map(r => ({ ...r, data: { ...(r.data as object), prices: {} } }));
      return rows;
    } };
    const r = await s.runner().run();
    expect(passes).toBe(2);
    expect(r.status).toBe('pronto');
  });

  it('OS que continua sem casar vai ao relatório e bloqueia', async () => {
    const s = setup();
    const orig = s.deps.transport.pull;
    s.deps.transport = { pull: async (ws, table, req) => {
      const rows = await orig(ws, table, req);
      return table === 'work_order_finance' ? rows.map(r => ({ ...r, data: { ...(r.data as object), prices: {} } })) : rows;
    } };
    const r = await s.runner().run();
    expect(r.status).toBe('divergente');
    if (r.status === 'divergente') expect(r.report.skippedOrders.length).toBeGreaterThan(0);
  });

  it('revision mudou durante o envio: não conclui', async () => {
    const s = setup();
    s.deps.photoInventory = async () => { s.disk.revision = 'r-outro'; return []; };
    const r = await s.runner().run();
    expect(r.status).toBe('arquivo_mudou');
    expect(s.server.finishCalls).toEqual([false]);
  });

  it('revision mudou entre a conferência e o commit: não conclui', async () => {
    const s = setup();
    const rn = s.runner();
    const r = await rn.run();
    if (r.status !== 'pronto') throw new Error('esperava pronto');
    s.disk.revision = 'r-outro';
    const c = await rn.commit(r.session);
    expect(c.status).toBe('arquivo_mudou');
    expect(s.server.state).toBe('importando');
    expect(s.disk.saved).toEqual([]);
  });

  it('lacre recusado por conflito: nuvem concluída, aviso claro', async () => {
    const s = setup();
    s.disk.saveResult = { status: 'conflict' };
    const rn = s.runner();
    const r = await rn.run();
    if (r.status !== 'pronto') throw new Error('esperava pronto');
    const c = await rn.commit(r.session);
    expect(c.status).toBe('concluido_sem_lacre');
    expect(s.server.state).toBe('concluido');
  });

  it('reset apaga o que foi enviado', async () => {
    const s = setup();
    const rn = s.runner();
    await rn.run();
    expect(await rn.reset()).toEqual({ ok: true });
    expect(s.server.count('ledger')).toBe(0);
    expect(s.server.state).toBe('vazio');
  });
});

describe('importRunner: revisão do PR 9', () => {
  it('A1: commit manda os totais conferidos (expected) ao servidor', async () => {
    const s = setup();
    const seen: unknown[] = [];
    s.deps.importFinish = (ws, c, e) => { seen.push(e); return s.server.importFinish(ws, c, e); };
    const rn = s.runner();
    const r = await rn.run();
    if (r.status !== 'pronto') throw new Error('esperava pronto');
    expect(r.session.expected.counts.work_orders).toBe(3);
    await rn.commit(r.session);
    expect(seen[0]).toBeUndefined();
    expect(seen[1]).toEqual(r.session.expected);
  });

  it('A1: servidor recusa totais diferentes (outro PC mexeu): não lacra e manda reconferir', async () => {
    const s = setup();
    const rn = s.runner();
    const r = await rn.run();
    if (r.status !== 'pronto') throw new Error('esperava pronto');
    await s.server.importRows(WS, [{ table: 'clients', id: 'extra', data: { name: 'Novo' } }]);
    const c = await rn.commit(r.session);
    expect(c.status).toBe('totais_mudaram');
    if (c.status === 'totais_mudaram') expect(c.message).toBe('Os dados na internet mudaram (outro computador mexeu). Confira de novo antes de concluir.');
    expect(s.server.state).toBe('importando');
    expect(s.disk.saved).toEqual([]);
  });

  it('A2: resposta do commit perdida mas servidor concluiu com os mesmos totais: lacra', async () => {
    const s = setup();
    const rn = s.runner();
    const r = await rn.run();
    if (r.status !== 'pronto') throw new Error('esperava pronto');
    s.deps.importFinish = async (ws, c, e) => {
      const out = await s.server.importFinish(ws, c, e);
      if (c) throw new Error('Failed to fetch');
      return out;
    };
    const c = await rn.commit(r.session);
    expect(c.status).toBe('concluido');
    expect(s.disk.saved).toHaveLength(1);
    expect(s.disk.saved[0].expected).toBe('r');
  });

  it('A2: erro no commit e servidor ainda importando: erro, sem lacre', async () => {
    const s = setup();
    const rn = s.runner();
    const r = await rn.run();
    if (r.status !== 'pronto') throw new Error('esperava pronto');
    s.deps.importFinish = async (ws, c, e) => {
      if (c) throw new Error('Failed to fetch');
      return s.server.importFinish(ws, c, e);
    };
    const c = await rn.commit(r.session);
    expect(c.status).toBe('erro');
    expect(s.disk.saved).toEqual([]);
  });

  it('A2: servidor concluído mas com totais diferentes do expected: erro, sem lacre', async () => {
    const s = setup();
    const rn = s.runner();
    const r = await rn.run();
    if (r.status !== 'pronto') throw new Error('esperava pronto');
    s.deps.importFinish = async (ws, c, e) => {
      if (c) { s.server.state = 'concluido'; throw new Error('Failed to fetch'); }
      return { ...(await s.server.importFinish(ws, c, e)), advancesCents: 999 };
    };
    const c = await rn.commit(r.session);
    expect(c.status).toBe('erro');
    expect(s.disk.saved).toEqual([]);
  });

  it('M1: arquivo sem meta/revision é recusado antes de enviar', async () => {
    const s = setup();
    s.deps.readMeta = async () => ({ status: 'no_meta', revision: null });
    const r = await s.runner().run();
    expect(r).toMatchObject({ status: 'recusado', reason: 'ilegivel' });
    if (r.status === 'recusado') expect(r.message).toBe('Abra o banco uma vez no OficinaPro novo e feche, depois tente de novo.');
    expect(s.server.rowsCalls).toBe(0);
  });

  it('B2: o arquivo lacrado não carrega segredos', async () => {
    const db = fixture(5);
    Object.assign(db.settings, { googleDriveToken: 'tok-secreto', googleApiKey: 'chave-secreta' });
    const s = setup(db);
    const rn = s.runner();
    const r = await rn.run();
    if (r.status !== 'pronto') throw new Error('esperava pronto');
    await rn.commit(r.session);
    expect(s.disk.saved[0].content).not.toContain('tok-secreto');
    expect(s.disk.saved[0].content).not.toContain('chave-secreta');
  });

  it('emptyTotals: tudo zero em todas as tabelas', () => {
    const z = emptyTotals();
    expect(Object.values(z.counts).every(n => n === 0)).toBe(true);
    expect(Object.keys(z.counts)).toHaveLength(13);
    expect(z).toMatchObject({ ledgerSignedCents: 0, osTotalCents: 0, paidEntries: 0, advancesCents: 0 });
  });

  it('fake: começar sem dados (zerado) é recusado com linhas no servidor e passa sem linhas', async () => {
    const s = setup();
    await s.server.importRows(WS, [{ table: 'clients', id: 'c', data: {} }]);
    await expect(s.server.importFinish(WS, true, emptyTotals())).rejects.toThrow(/totais_divergentes/);
    s.server.drop('clients', 'c');
    expect((await s.server.importFinish(WS, true, emptyTotals())).state).toBe('concluido');
  });
});

describe('importRunner: fotos', () => {
  const db = (): DatabaseSchema => dbWithPhotos();

  it('envia original e miniatura das que existem; ausente vai ao relatório sem bloquear', async () => {
    const s = setup(db(), [disk3('W1', 'ph1'), disk3('W1', 'ph2', false), disk3('W1', 'extra')]);
    const r = await s.runner().run();
    expect(r.status).toBe('pronto');
    if (r.status !== 'pronto') return;
    const p = r.report.photos;
    expect(p.onDisk).toBe(2);
    expect(p.sent).toBe(2);
    expect(p.missing.map(m => m.photoId)).toEqual(['ph3']);
    expect(p.extras).toBe(1);
    expect(p.withoutThumb).toBe(1);
    expect(s.uploads.sort()).toEqual(['W1/ph1', 'W1/ph1.t', 'W1/ph2']);
  });

  it('pula as já enviadas (storage list) e reenvia só o que falta', async () => {
    const s = setup(db(), [disk3('W1', 'ph1'), disk3('W1', 'ph2')]);
    s.listed.W1 = ['ph1.jpg', 'ph1.t.jpg', 'ph2.jpg'];
    const r = await s.runner().run();
    if (r.status !== 'pronto') throw new Error('esperava pronto');
    expect(r.report.photos.alreadyThere).toBe(1);
    expect(r.report.photos.sent).toBe(1);
    expect(s.uploads).toEqual(['W1/ph2.t']);
  });

  it('foto ilegível na hora do envio vai para ausentes', async () => {
    const s = setup(db(), [disk3('W1', 'ph1')]);
    s.unreadable.add('W1/ph1');
    const r = await s.runner().run();
    if (r.status !== 'pronto') throw new Error('esperava pronto');
    expect(r.report.photos.missing.map(m => m.photoId).sort()).toEqual(['ph1', 'ph2', 'ph3']);
    expect(r.report.photos.sent).toBe(0);
  });

  it('envio de foto que falha bloqueia a conclusão', async () => {
    const s = setup(db(), [disk3('W1', 'ph1')]);
    s.deps.uploadPhoto = async () => ({ ok: false, kind: 'definitive', message: 'sem permissão' });
    const r = await s.runner().run();
    expect(r.status).toBe('divergente');
    if (r.status === 'divergente') expect(r.report.photos.failed).toHaveLength(1);
  });

  it('no máximo 3 envios ao mesmo tempo', async () => {
    const bigDb = dbWithPhotos();
    bigDb.workOrders[0].photos = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, createdAt: 'x' }));
    const s = setup(bigDb, Array.from({ length: 8 }, (_, i) => disk3('W1', `p${i}`, false)));
    let live = 0;
    let peak = 0;
    s.deps.uploadPhoto = async () => {
      live += 1; peak = Math.max(peak, live);
      await new Promise(res => setTimeout(res, 2));
      live -= 1;
      return { ok: true };
    };
    const r = await s.runner().run();
    expect(r.status).toBe('pronto');
    expect(peak).toBe(3);
  });
});

describe('pullAllRows', () => {
  it('pagina até esgotar e ignora apagadas', async () => {
    const s = setup();
    await s.runner().run();
    const rows = await pullAllRows(s.server.transport(), WS, { pageSize: 2 });
    expect(rows.filter(r => r.table === 'ledger')).toHaveLength(6);
    const ledger = rows.find(r => r.table === 'ledger' && r.id === 'L1');
    expect(ledger?.os_id).toBe('W1');
    const base = rows.length;
    const deleted = await pullAllRows({ pull: async (ws, t, q) => (await s.server.transport().pull(ws, t, q)).map(r => ({ ...r, deleted_at: 'x' })) }, WS);
    expect(deleted).toEqual([]);
    expect(base).toBeGreaterThan(6);
  });
});
