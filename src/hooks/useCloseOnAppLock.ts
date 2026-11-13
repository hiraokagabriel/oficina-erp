import { useEffect, useRef } from 'react';
import { isAppLocked, subscribeAppLock } from '../utils/appLock';

/** Menu ou popover aberto fecha quando o app é bloqueado (e nem abre se já estiver bloqueado). */
export function useCloseOnAppLock(active: boolean, onClose: () => void): void {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return;
    if (isAppLocked()) { ref.current(); return; }
    return subscribeAppLock(l => { if (l) ref.current(); });
  }, [active]);
}
