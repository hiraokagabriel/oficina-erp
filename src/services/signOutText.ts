import { photosPendingNotice } from './photoPendingView';

/** Texto do diálogo "Sair deste aparelho?" (barra do topo e folha "Mais" do celular). Puro. */
export function signOutMessage(pending: number, hasPendingChanges: boolean, photoCount: number): string {
  const base = pending > 0 || hasPendingChanges
    ? `Ainda há ${pending > 0 ? `${pending} ${pending === 1 ? 'alteração sua' : 'alterações suas'}` : 'alterações suas'} que não ${pending === 1 ? 'foi enviada' : 'foram enviadas'}. Elas continuam guardadas neste aparelho e só chegam aos outros quando você entrar de novo aqui e houver internet.`
    : 'Você vai precisar do e-mail e da senha para entrar de novo aqui.';
  const notice = photosPendingNotice(photoCount);
  return notice ? `${base} ${notice}` : base;
}
