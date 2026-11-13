import { useMemo } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { buildAccess, type AccessView } from '../services/accessView';

/**
 * Fonte única do controle por papel nas telas. Sem `cloud` (modo arquivo) devolve tudo liberado.
 * O objeto muda só quando o papel muda: dá para passar `access.can(...)` calculado como booleano aos filhos memoizados.
 */
export function useAccess(): AccessView {
  const role = useDatabase().cloud?.role;
  return useMemo(() => buildAccess(role), [role]);
}
