import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { getPdfFolder } from './pdfFolder';

// Saída dos documentos: imprimir (iframe oculto) ou salvar PDF direto (comando Rust save_pdf).
// `invoke` e `available` entram por parâmetro para os testes usarem falsos.

export type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

const defaultInvoke: InvokeFn = (cmd, args) => tauriInvoke(cmd, args);

/** Só dentro do programa instalado (Tauri) existe o comando de PDF. */
export const isPdfAvailable = (): boolean =>
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

export const PDF_ONLY_INSTALLED = 'Salvar PDF só funciona no programa instalado';

export interface OutputDoc {
  html: string;
  title: string;
  fileStem: string;
}

export interface PdfResult {
  ok: boolean;
  path?: string;
  message: string;
}

export interface OutputDeps {
  invoke?: InvokeFn;
  available?: () => boolean;
}

/** Abre o diálogo de impressão do HTML num iframe oculto. O título do documento vira o nome sugerido do PDF. */
export function printHtml(html: string, title: string): void {
  const originalTitle = document.title;
  document.title = title;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    console.error('Não foi possível acessar o documento do iframe');
    document.body.removeChild(iframe);
    document.title = originalTitle;
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  iframe.contentWindow?.focus();
  setTimeout(() => {
    try {
      iframe.contentWindow?.print();
    } catch (err) {
      console.error('Erro ao imprimir:', err);
      alert('Erro ao abrir janela de impressão.');
    }
    setTimeout(() => {
      document.body.removeChild(iframe);
      document.title = originalTitle;
    }, 500);
  }, 250);
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : typeof e === 'string' ? e : 'Erro desconhecido');

/** Resposta dos comandos Rust de I/O: { success, message }. Só `success === true` conta como sucesso. */
interface IoReply {
  success?: unknown;
  message?: unknown;
}

const asReply = (res: unknown): IoReply => (res && typeof res === 'object' ? (res as IoReply) : {});
const replyText = (r: IoReply, fallback: string): string =>
  typeof r.message === 'string' && r.message ? r.message : fallback;

/**
 * Salva o HTML como PDF na pasta configurada (vazio = padrão do Rust).
 * O Rust responde { success, message }; em sucesso `message` é o caminho do arquivo.
 * Qualquer outra resposta é erro.
 */
export async function savePdf(html: string, fileStem: string, deps: OutputDeps = {}): Promise<PdfResult> {
  const available = deps.available ?? isPdfAvailable;
  if (!available()) return { ok: false, message: PDF_ONLY_INSTALLED };
  const invoke = deps.invoke ?? defaultInvoke;
  try {
    const r = asReply(await invoke<unknown>('save_pdf', { html, folder: getPdfFolder(), fileStem }));
    if (r.success !== true) return { ok: false, message: replyText(r, 'Não foi possível salvar o PDF') };
    return { ok: true, path: typeof r.message === 'string' ? r.message : undefined, message: 'PDF salvo' };
  } catch (e) {
    return { ok: false, message: errText(e) };
  }
}

async function callIo(cmd: string, args: Record<string, unknown>, okMessage: string, failMessage: string, deps: OutputDeps): Promise<PdfResult> {
  const available = deps.available ?? isPdfAvailable;
  if (!available()) return { ok: false, message: PDF_ONLY_INSTALLED };
  const invoke = deps.invoke ?? defaultInvoke;
  try {
    const r = asReply(await invoke<unknown>(cmd, args));
    if (r.success !== true) return { ok: false, message: replyText(r, failMessage) };
    return { ok: true, message: okMessage };
  } catch (e) {
    return { ok: false, message: errText(e) };
  }
}

/** Mostra o arquivo (PDF) no Explorador de Arquivos. */
export async function revealFile(path: string, deps: OutputDeps = {}): Promise<PdfResult> {
  const r = await callIo('reveal_in_folder', { path }, 'Pasta aberta', 'Não foi possível mostrar o arquivo', deps);
  return { ...r, path };
}

/** Abre uma pasta no Explorador de Arquivos. Vazio abre a pasta padrão dos PDFs. */
export async function openFolder(dir: string, deps: OutputDeps = {}): Promise<PdfResult> {
  return callIo('open_folder', { dir }, 'Pasta aberta', 'Não foi possível abrir a pasta', deps);
}

/** Pasta que contém o arquivo (caminho do Windows ou de outro sistema). Vazio se não houver. */
export function folderOfPath(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  if (i <= 0) return '';
  const dir = path.slice(0, i);
  return /^[A-Za-z]:$/.test(dir) ? `${dir}\\` : dir;
}

/** Mostra o PDF salvo; se o arquivo foi movido ou apagado, abre a pasta dele. */
export async function revealPdf(path: string, deps: OutputDeps = {}): Promise<PdfResult> {
  const r = await revealFile(path, deps);
  if (r.ok) return r;
  const dir = folderOfPath(path);
  return dir ? openFolder(dir, deps) : r;
}

/** Pasta padrão dos PDFs, definida no Rust. Vazio se indisponível. */
export async function defaultPdfFolder(deps: OutputDeps = {}): Promise<string> {
  const available = deps.available ?? isPdfAvailable;
  if (!available()) return '';
  const invoke = deps.invoke ?? defaultInvoke;
  try {
    return await invoke<string>('default_pdf_folder');
  } catch {
    return '';
  }
}

/** 'print' abre a impressão; 'pdf' salva direto. */
export async function outputDocument(doc: OutputDoc, mode: 'print' | 'pdf', deps: OutputDeps = {}): Promise<PdfResult> {
  if (mode === 'print') {
    printHtml(doc.html, doc.title);
    return { ok: true, message: 'Impressão aberta' };
  }
  return savePdf(doc.html, doc.fileStem, deps);
}
