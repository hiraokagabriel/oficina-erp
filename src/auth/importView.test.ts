import { describe, expect, it } from 'vitest';
import type { ImportReport } from '../sync/importRunner';
import {
  IMPORT_PHASES, canFinish, confirmsReset, describeImportError, phaseMarks, photoSpaceNote, photoSummary, problemLines, progressCount, progressPercent,
} from './importView';

const photos = (o: Partial<ImportReport['photos']> = {}): ImportReport['photos'] => (
  { onDisk: 3, alreadyThere: 1, sent: 2, failed: [], missing: [], extras: 0, withoutThumb: 0, totalBytes: 0, ...o }
);
const report = (o: Partial<ImportReport> = {}): ImportReport => ({
  ok: true, backupPath: 'x', lines: [], differences: [], roundTrip: [], skippedOrders: [], blockers: [], photos: photos(), ...o,
});

describe('importView', () => {
  it('marca as etapas antes, na e depois da atual', () => {
    const m = phaseMarks('enviar');
    expect(m.map(x => x.mark)).toEqual(['feito', 'feito', 'feito', 'agora', 'espera', 'espera', 'espera', 'espera']);
    expect(phaseMarks(null).every(x => x.mark === 'espera')).toBe(true);
    expect(m.map(x => x.phase)).toEqual([...IMPORT_PHASES]);
  });
  it('contagem e porcentagem', () => {
    expect(progressCount(1200, 3400)).toBe('1.200 de 3.400');
    expect(progressCount(0, 1)).toBe('');
    expect(progressPercent(50, 200)).toBe(25);
    expect(progressPercent(0, 1)).toBeNull();
    expect(progressPercent(300, 200)).toBe(100);
  });
  it('lista de problemas corta em 30', () => {
    const many = Array.from({ length: 35 }, (_, i) => ({ collection: 'clients' as const, id: `c${i}`, reason: 'sem nome' }));
    const r = problemLines(many);
    expect(r.lines).toHaveLength(30);
    expect(r.more).toBe(5);
    expect(r.lines[0]).toContain('c0');
  });
  it('erros viram frases simples', () => {
    expect(describeImportError('totais_divergentes')).toMatch(/mudaram/);
    expect(describeImportError('somente_dono')).toMatch(/Dono/);
    expect(describeImportError('oficina_em_uso')).toMatch(/usando/);
    expect(describeImportError('import_bloqueado')).toMatch(/não aceita/);
    expect(describeImportError('TypeError: Failed to fetch')).toMatch(/internet/);
    expect(describeImportError('algo estranho')).toBe('algo estranho');
  });
  it('aviso de espaço só acima de 80%', () => {
    expect(photoSpaceNote(0)).toBeNull();
    expect(photoSpaceNote(100 * 1024 * 1024)).toBeNull();
    expect(photoSpaceNote(900 * 1024 * 1024)).toMatch(/quase cheio/);
  });
  it('resumo das fotos', () => {
    const s = photoSummary(report({
      photos: photos({
        failed: [{ osId: 'a', osNumber: 7, photoId: 'p', message: 'sem permissão' }],
        missing: [{ osId: 'b', osNumber: 9, photoId: 'q', reason: 'não foi possível ler o arquivo da foto' }],
        extras: 2, withoutThumb: 1,
      }),
    }));
    expect(s.lines.join(' ')).toMatch(/Enviadas agora: 2/);
    expect(s.lines.join(' ')).toMatch(/2 arquivo/);
    expect(s.missing[0]).toContain('OS 9');
    expect(s.failed[0]).toContain('OS 7');
  });
  it('concluir só com tudo igual e sem foto falha', () => {
    expect(canFinish(report())).toBe(true);
    expect(canFinish(report({ ok: false }))).toBe(false);
    expect(canFinish(report({ blockers: ['x'] }))).toBe(false);
    expect(canFinish(report({ photos: photos({ failed: [{ osId: 'a', osNumber: 1, photoId: 'p', message: 'm' }] }) }))).toBe(false);
  });
  it('confirmação forte do reset', () => {
    expect(confirmsReset('apagar')).toBe(true);
    expect(confirmsReset(' APAGAR ')).toBe(true);
    expect(confirmsReset('apaga')).toBe(false);
  });
});
