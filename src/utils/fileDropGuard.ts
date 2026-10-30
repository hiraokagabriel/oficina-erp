// Com `dragDropEnabled: false` (tauri.conf.json) o WebView2 deixa o HTML receber arquivos arrastados,
// mas soltar fora de uma área que trate o evento faria o WebView navegar até o arquivo (e perderia o rascunho da OS).

/** Classe da única área que aceita arquivos soltos (seção de fotos da OS). */
export const FILE_DROP_ZONE_CLASS = 'ph-box';

/** O arrasto traz arquivos do sistema? */
export const dragHasFiles = (types: ArrayLike<string> | null | undefined): boolean =>
  !!types && Array.from(types).includes('Files');

/** Deve cancelar o evento? Só quando há arquivos e o alvo está fora da área de fotos. */
export const shouldBlockFileDrop = (types: ArrayLike<string> | null | undefined, insideDropZone: boolean): boolean =>
  dragHasFiles(types) && !insideDropZone;

const isInsideDropZone = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(`.${FILE_DROP_ZONE_CLASS}`) !== null;

/** Instala a guarda global em `dragover` e `drop`. Devolve a função que remove. */
export const installFileDropGuard = (win: Window = window): (() => void) => {
  const onEvent = (e: Event) => {
    const dt = (e as DragEvent).dataTransfer;
    if (shouldBlockFileDrop(dt?.types, isInsideDropZone(e.target))) e.preventDefault();
  };
  win.addEventListener('dragover', onEvent);
  win.addEventListener('drop', onEvent);
  return () => {
    win.removeEventListener('dragover', onEvent);
    win.removeEventListener('drop', onEvent);
  };
};
