// Regra pura do Tab preso dentro de uma janela: índice do próximo elemento focável (com volta nas pontas).
/** `current` = -1 quando o foco está fora da lista. Sem elementos, devolve -1. */
export const nextFocusIndex = (count: number, current: number, backwards: boolean): number => {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return backwards ? count - 1 : 0;
  return backwards ? (current - 1 + count) % count : (current + 1) % count;
};
