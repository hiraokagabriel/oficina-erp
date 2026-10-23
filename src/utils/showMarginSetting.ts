import type { WorkshopSettings } from '../types';

/** Selo de margem no quadro: ligado grava `true`; desligado remove a chave (ausente = desligado, como em bancos antigos). */
export const setShowMarginOnBoard = (settings: WorkshopSettings, on: boolean): WorkshopSettings => {
  if (on) return { ...settings, showMarginOnBoard: true };
  const { showMarginOnBoard: _removed, ...rest } = settings;
  return rest;
};
