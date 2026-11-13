import { describe, expect, it } from 'vitest';
import { configSections, driveLabels } from './cloudConfig';

describe('configSections', () => {
  it('modo arquivo: tudo como sempre, sem seções da nuvem', () => {
    const s = configSections({ cloud: false, role: undefined, pdfAvailable: false });
    expect(s.cloudAdmin).toBe(false);
    expect(s.dataLocation).toBe(false);
    expect(s.dbPath && s.restoreFile && s.pdf && s.drive && s.cadastros && s.workshop).toBe(true);
  });
  it('Dono na nuvem: admin, sem pasta do banco nem importar JSON', () => {
    const s = configSections({ cloud: true, role: 'dono', pdfAvailable: true });
    expect(s.cloudAdmin).toBe(true);
    expect(s.dataLocation).toBe(true);
    expect(s.dbPath).toBe(false);
    expect(s.restoreFile).toBe(false);
    expect(s.drive).toBe(true);
    expect(s.pdf).toBe(true);
  });
  it('Dono no navegador: sem pasta de PDF', () => {
    expect(configSections({ cloud: true, role: 'dono', pdfAvailable: false }).pdf).toBe(false);
  });
  it('Recepção não tem seção na Config (Cadastros é pela barra lateral)', () => {
    const s = configSections({ cloud: true, role: 'recepcao', pdfAvailable: true });
    expect(Object.entries(s).filter(([k, v]) => v && k !== 'noAccess')).toEqual([]);
  });
  it('Mecânico e papel desconhecido: sem acesso', () => {
    expect(configSections({ cloud: true, role: 'mecanico', pdfAvailable: true }).noAccess).toBe(true);
    expect(configSections({ cloud: true, role: null, pdfAvailable: true }).cadastros).toBe(false);
  });
  it('rótulos do Drive na nuvem sem "token"', () => {
    expect(driveLabels(true).tokenLabel).toBe('Código de acesso do Google');
    expect(driveLabels(false).tokenLabel).toBe('Token de acesso');
  });
});
