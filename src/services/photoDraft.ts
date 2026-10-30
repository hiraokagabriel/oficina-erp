import type { OSPhoto } from '../types';

/**
 * Fotos que a OS salva deve ter. O rascunho do modal manda (`draft`); sem rascunho (undefined)
 * mantém as que a OS já tinha (`kept`). Lista vazia vira `undefined`: o campo some do objeto.
 */
export const resolveSavedPhotos = (
  kept: readonly OSPhoto[] | undefined,
  draft: readonly OSPhoto[] | undefined
): OSPhoto[] | undefined => {
  const list = draft ?? kept;
  return list && list.length > 0 ? [...list] : undefined;
};
