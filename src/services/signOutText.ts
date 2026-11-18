import { photosPendingNotice } from './photoPendingView';

/** Texto do diálogo "Sair deste aparelho?" (barra do topo e folha "Mais" do celular). Puro. */
export function signOutMessage(pending: number, hasPendingChanges: boolean, photoCount: number): string {
  const photos = photosPendingNotice(photoCount);
  let base: string;
  if (pending === 1) {
    base = 'Ainda há 1 alteração sua que não foi enviada. Ela continua guardada neste aparelho e só chega aos outros quando você entrar de novo aqui e houver internet.';
  } else if (pending > 1 || hasPendingChanges) {
    const quantas = pending > 1 ? `${pending} alterações suas` : 'alterações suas';
    base = `Ainda há ${quantas} que não foram enviadas. Elas continuam guardadas neste aparelho e só chegam aos outros quando você entrar de novo aqui e houver internet.`;
  } else {
    base = 'Você vai precisar do e-mail e da senha para entrar de novo aqui.';
  }
  return photos ? `${base} ${photos}` : base;
}
