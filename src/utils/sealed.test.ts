import { describe, expect, it } from 'vitest';
import { SEALED_SCHEMA_VERSION } from '../sync/importRunner';
import { SEALED_VERSION, readSealedInfo, sealedBannerText } from './sealed';

describe('readSealedInfo', () => {
  it('a versão é a mesma do importRunner', () => { expect(SEALED_VERSION).toBe(SEALED_SCHEMA_VERSION); });
  it('arquivo normal, sem meta ou ilegível: null', () => {
    expect(readSealedInfo(JSON.stringify({ meta: { schemaVersion: 5 }, ledger: [] }))).toBeNull();
    expect(readSealedInfo(JSON.stringify({ ledger: [] }))).toBeNull();
    expect(readSealedInfo('{nao json')).toBeNull();
    expect(readSealedInfo('[]')).toBeNull();
  });
  it('meta.cloud ou versão 1000 lacra', () => {
    expect(readSealedInfo(JSON.stringify({ meta: { schemaVersion: 1000, cloud: { workshopId: 'w', at: '2026-11-17T15:00:00.000Z' } } }))).toEqual({ at: '2026-11-17T15:00:00.000Z' });
    expect(readSealedInfo(JSON.stringify({ meta: { schemaVersion: 5, cloud: { workshopId: 'w' } } }))).toEqual({ at: null });
    expect(readSealedInfo(JSON.stringify({ meta: { schemaVersion: 1000 } }))).toEqual({ at: null });
  });
});

describe('sealedBannerText', () => {
  it('traz a data local ou some com ela', () => {
    expect(sealedBannerText({ at: '2026-11-17T15:00:00.000Z' })).toBe('Este banco foi enviado para a nuvem em 17/11/2026. Use o app novo.');
    expect(sealedBannerText({ at: null })).toBe('Este banco foi enviado para a nuvem. Use o app novo.');
    expect(sealedBannerText({ at: 'lixo' })).toBe('Este banco foi enviado para a nuvem. Use o app novo.');
  });
});
