/** Dá tempo de o navegador começar o download antes de soltar o arquivo da memória. */
export const REVOKE_AFTER_MS = 60_000;

/** Entrega um arquivo como download do navegador. A URL é revogada depois de 60 s. */
export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

/** Entrega um texto como arquivo (CSV, JSON...). Quem chama põe o BOM, se o formato pedir. */
export function downloadTextFile(name: string, content: string, mime: string): void {
  downloadBlob(name, new Blob([content], { type: mime }));
}
