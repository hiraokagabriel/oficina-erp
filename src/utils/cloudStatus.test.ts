import { describe, expect, it } from 'vitest';
import { describeCloudStatus, isAccessProblem, loadStageText, shouldAnnounceChange } from './cloudStatus';

const base = { syncState: 'salvo' as const, pending: 0, lastError: null, lastSavedAt: null };
const iso = (h: number, m: number): string => new Date(2026, 10, 12, h, m).toISOString();

describe('cloudStatus', () => {
  it('salvo: hora local, ícones nuvem + check, sem anúncio', () => {
    const v = describeCloudStatus({ ...base, lastSavedAt: iso(14, 32) });
    expect(v).toMatchObject({ kind: 'salvo', text: 'Salvo às 14:32', shortText: 'Salvo', tone: 'success', icons: ['nuvem', 'check'], announce: false });
    expect(describeCloudStatus(base).text).toBe('Salvo');
  });

  it('enviando: singular e plural, sem anúncio', () => {
    expect(describeCloudStatus({ ...base, syncState: 'enviando', pending: 3 })).toMatchObject({ text: 'Enviando 3 alterações...', shortText: 'Enviando 3', announce: false });
    expect(describeCloudStatus({ ...base, syncState: 'enviando', pending: 1 }).text).toBe('Enviando 1 alteração...');
  });

  it('sem internet: com e sem alterações guardadas', () => {
    const zero = describeCloudStatus({ ...base, syncState: 'offline' });
    expect(zero).toMatchObject({ text: 'Sem internet · tudo guardado aqui', shortText: 'Sem internet', tone: 'warning', border: 'warning', icons: ['sem-internet'], announce: true });
    const tres = describeCloudStatus({ ...base, syncState: 'offline', pending: 3 });
    expect(tres.text).toBe('Sem internet · 3 guardadas aqui');
    expect(tres.shortText).toBe('Sem internet (3)');
    expect(tres.detail.join(' ')).toContain('As 3 alterações ficam guardadas');
    expect(describeCloudStatus({ ...base, syncState: 'offline', pending: 1 }).text).toBe('Sem internet · 1 guardada aqui');
  });

  it('erro: texto sem jargão, ação e botão de tentar de novo', () => {
    const v = describeCloudStatus({ ...base, syncState: 'erro', lastError: 'boom' });
    expect(v).toMatchObject({ kind: 'erro', text: 'Não enviado · ver o que fazer', shortText: 'Não enviado', tone: 'danger', border: 'danger', canRetry: true, announce: true });
    expect(v.detail[0]).toBe('Não deu para enviar agora. Suas alterações estão guardadas neste aparelho.');
    expect(v.advice).toContain('Tentar enviar agora');
    const cache = describeCloudStatus({ ...base, syncState: 'erro', lastError: 'Cache local: x' });
    expect(cache.detail[0]).toBe('Este aparelho não conseguiu guardar os dados.');
    const inc = describeCloudStatus({ ...base, syncState: 'erro', lastError: 'registro_incompleto' });
    expect(inc.advice).toBeNull();
  });

  it('sem_acesso é problema de acesso (tela 6.3) e não oferece "tentar enviar"', () => {
    expect(isAccessProblem('sem_acesso')).toBe(true);
    expect(isAccessProblem('boom')).toBe(false);
    expect(describeCloudStatus({ ...base, syncState: 'erro', lastError: 'sem_acesso' }).canRetry).toBe(false);
  });

  it('nenhum texto do selo usa jargão proibido', () => {
    for (const s of ['salvo', 'enviando', 'offline', 'erro'] as const) {
      const v = describeCloudStatus({ ...base, syncState: s, pending: 2, lastError: s === 'erro' ? 'x' : null });
      expect([v.text, v.shortText, ...v.detail, v.advice ?? ''].join(' ')).not.toMatch(/sincroniz|offline|online|servidor|token|cache/i);
    }
  });

  it('anúncio: só offline, erro e volta ao salvo depois deles', () => {
    expect(shouldAnnounceChange('salvo', 'offline')).toBe(true);
    expect(shouldAnnounceChange('enviando', 'erro')).toBe(true);
    expect(shouldAnnounceChange('offline', 'salvo')).toBe(true);
    expect(shouldAnnounceChange('erro', 'salvo')).toBe(true);
    expect(shouldAnnounceChange('enviando', 'salvo')).toBe(false);
    expect(shouldAnnounceChange('salvo', 'enviando')).toBe(false);
    expect(shouldAnnounceChange(null, 'salvo')).toBe(false);
    expect(shouldAnnounceChange('offline', 'offline')).toBe(false);
  });
});

describe('loadStageText', () => {
  it('uma frase por etapa; sem internet avisa na etapa dos dados', () => {
    expect(loadStageText('cache', true)).toContain('Etapa 1 de 3');
    expect(loadStageText('fotos', true)).toContain('Etapa 2 de 3');
    expect(loadStageText('dados', true)).toContain('baixando');
    expect(loadStageText('dados', false)).toContain('sem internet');
  });
});
