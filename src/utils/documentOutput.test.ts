import { describe, it, expect, afterEach, vi } from 'vitest';
import { savePdf, revealFile, openFolder, revealPdf, folderOfPath, defaultPdfFolder, outputDocument, PDF_ONLY_INSTALLED, InvokeFn } from './documentOutput';

afterEach(() => vi.unstubAllGlobals());

const yes = () => true;
const fakeInvoke = (impl: (cmd: string, args?: Record<string, unknown>) => unknown) => {
  const calls: { cmd: string; args?: Record<string, unknown> }[] = [];
  const invoke = (async (cmd: string, args?: Record<string, unknown>) => {
    calls.push({ cmd, args });
    return impl(cmd, args);
  }) as InvokeFn;
  return { invoke, calls };
};

describe('savePdf', () => {
  it('fora do Tauri devolve a mensagem e não chama invoke', async () => {
    const f = fakeInvoke(() => 'x');
    const r = await savePdf('<p/>', 'OS_1', { invoke: f.invoke, available: () => false });
    expect(r).toEqual({ ok: false, message: PDF_ONLY_INSTALLED });
    expect(f.calls).toHaveLength(0);
  });
  it('ok: chama save_pdf com html, folder e fileStem', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'D:\\PDFs', setItem: () => {}, removeItem: () => {} });
    const f = fakeInvoke(() => ({ success: true, message: 'D:\\PDFs\\OS_1.pdf' }));
    const r = await savePdf('<p>a</p>', 'OS_1', { invoke: f.invoke, available: yes });
    expect(r).toEqual({ ok: true, path: 'D:\\PDFs\\OS_1.pdf', message: 'PDF salvo' });
    expect(f.calls[0]).toEqual({ cmd: 'save_pdf', args: { html: '<p>a</p>', folder: 'D:\\PDFs', fileStem: 'OS_1' } });
  });
  it('texto puro, null ou success diferente de true são erro', async () => {
    for (const res of ['D:\a.pdf', null, undefined, { ok: true, path: 'x' }, { success: 'true', message: 'x' }, { success: false }]) {
      const f = fakeInvoke(() => res);
      const r = await savePdf('<p/>', 'a', { invoke: f.invoke, available: yes });
      expect(r.ok).toBe(false);
      expect(r.path).toBeUndefined();
    }
  });
  it('aceita resposta { success: false }', async () => {
    const f = fakeInvoke(() => ({ success: false, message: 'disco cheio' }));
    expect(await savePdf('<p/>', 'a', { invoke: f.invoke, available: yes })).toEqual({ ok: false, message: 'disco cheio' });
  });
  it('erro lançado vira ok:false com a mensagem', async () => {
    const invoke = (async () => { throw 'falhou'; }) as InvokeFn;
    expect(await savePdf('<p/>', 'a', { invoke, available: yes })).toEqual({ ok: false, message: 'falhou' });
  });
});

describe('revealFile / defaultPdfFolder / outputDocument', () => {
  it('revealFile chama reveal_in_folder', async () => {
    const f = fakeInvoke(() => ({ success: true, message: 'C:\a.pdf' }));
    const r = await revealFile('C:\\a.pdf', { invoke: f.invoke, available: yes });
    expect(r.ok).toBe(true);
    expect(f.calls[0]).toEqual({ cmd: 'reveal_in_folder', args: { path: 'C:\\a.pdf' } });
  });
  it('revealFile e openFolder respeitam { success: false }', async () => {
    const f = fakeInvoke(() => ({ success: false, message: 'Arquivo PDF não encontrado.' }));
    expect(await revealFile('C:\\a.pdf', { invoke: f.invoke, available: yes })).toEqual({ ok: false, path: 'C:\\a.pdf', message: 'Arquivo PDF não encontrado.' });
    expect(await openFolder('C:\\x', { invoke: f.invoke, available: yes })).toEqual({ ok: false, message: 'Arquivo PDF não encontrado.' });
    const vazio = fakeInvoke(() => ({ success: false }));
    expect((await openFolder('C:\\x', { invoke: vazio.invoke, available: yes })).message).toBe('Não foi possível abrir a pasta');
  });
  it('openFolder chama open_folder e fora do Tauri não chama', async () => {
    const f = fakeInvoke(() => ({ success: true, message: 'C:\\x' }));
    expect((await openFolder('C:\\x', { invoke: f.invoke, available: yes })).ok).toBe(true);
    expect(f.calls[0]).toEqual({ cmd: 'open_folder', args: { dir: 'C:\\x' } });
    expect(await openFolder('C:\\x', { invoke: f.invoke, available: () => false })).toEqual({ ok: false, message: PDF_ONLY_INSTALLED });
    expect(f.calls).toHaveLength(1);
  });
  it('revealFile lançando erro vira ok:false', async () => {
    const invoke = (async () => { throw new Error('boom'); }) as InvokeFn;
    expect(await revealFile('C:\\a.pdf', { invoke, available: yes })).toEqual({ ok: false, path: 'C:\\a.pdf', message: 'boom' });
  });
  it('folderOfPath', () => {
    expect(folderOfPath('C:\\Docs\\PDF\\a.pdf')).toBe('C:\\Docs\\PDF');
    expect(folderOfPath('C:\\a.pdf')).toBe('C:\\');
    expect(folderOfPath('/home/x/a.pdf')).toBe('/home/x');
    expect(folderOfPath('a.pdf')).toBe('');
  });
  it('revealPdf cai para a pasta quando o arquivo some', async () => {
    const f = fakeInvoke((cmd) => (cmd === 'reveal_in_folder' ? { success: false, message: 'sumiu' } : { success: true, message: 'ok' }));
    const r = await revealPdf('C:\\Docs\\a.pdf', { invoke: f.invoke, available: yes });
    expect(r.ok).toBe(true);
    expect(f.calls.map(c => c.cmd)).toEqual(['reveal_in_folder', 'open_folder']);
    expect(f.calls[1].args).toEqual({ dir: 'C:\\Docs' });
  });
  it('revealPdf não tenta a pasta se o arquivo abriu', async () => {
    const f = fakeInvoke(() => ({ success: true, message: 'ok' }));
    await revealPdf('C:\\Docs\\a.pdf', { invoke: f.invoke, available: yes });
    expect(f.calls).toHaveLength(1);
  });
  it('defaultPdfFolder chama default_pdf_folder; fora do Tauri devolve vazio', async () => {
    const f = fakeInvoke(() => 'C:\\Docs\\PDF');
    expect(await defaultPdfFolder({ invoke: f.invoke, available: yes })).toBe('C:\\Docs\\PDF');
    expect(f.calls[0].cmd).toBe('default_pdf_folder');
    expect(await defaultPdfFolder({ invoke: f.invoke, available: () => false })).toBe('');
  });
  it('outputDocument em pdf usa o fileStem', async () => {
    const f = fakeInvoke(() => ({ success: true, message: 'p' }));
    await outputDocument({ html: '<p/>', title: 't', fileStem: 'Stem' }, 'pdf', { invoke: f.invoke, available: yes });
    expect(f.calls[0].args?.fileStem).toBe('Stem');
  });
});
