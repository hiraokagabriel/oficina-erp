// Pasta escolhida para "Salvar PDF". Fica no localStorage deste PC (como oficina_db_path), fora do banco.
// Vazio = o Rust usa a pasta padrão (default_pdf_folder).

const KEY = 'oficina_pdf_folder';

export function getPdfFolder(): string {
  try {
    return (localStorage.getItem(KEY) ?? '').trim();
  } catch {
    return '';
  }
}

/** Grava a pasta; texto vazio volta ao padrão. Devolve false se o navegador bloqueou o armazenamento. */
export function setPdfFolder(folder: string): boolean {
  try {
    const f = (folder ?? '').trim();
    if (f) localStorage.setItem(KEY, f);
    else localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
