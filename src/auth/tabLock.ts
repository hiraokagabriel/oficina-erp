import { useCallback, useEffect, useRef, useState } from 'react';

// Duas abas da MESMA pessoa na mesma oficina: só uma sincroniza (Web Locks). A outra mostra um aviso com o botão
// "Usar esta janela", que toma o lugar (`steal`) e faz a primeira mostrar o aviso. Sem `navigator.locks` (WebView
// antigo), vale sempre `held`.

export type TabLockState = 'checking' | 'held' | 'busy';

export function useTabLock(name: string | null): { state: TabLockState; takeOver: () => void } {
  const [state, setState] = useState<TabLockState>('checking');
  const takeRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    if (!name || !locks) { setState(name ? 'held' : 'checking'); return; }
    let alive = true;
    let release: (() => void) | null = null;
    const hold = (): Promise<void> => new Promise<void>(res => { release = res; });
    const onBusy = () => { if (alive) setState('busy'); };

    setState('checking');
    const ac = new AbortController();
    // Espera até 400 ms: cobre o StrictMode (soltar e pegar de novo) sem demorar para avisar de verdade.
    const timer = window.setTimeout(() => ac.abort(), 400);
    void locks.request(name, { signal: ac.signal }, () => {
      window.clearTimeout(timer);
      if (alive) setState('held');
      return hold();
    }).catch(onBusy);

    takeRef.current = () => {
      void locks.request(name, { steal: true }, () => {
        if (alive) setState('held');
        return hold();
      }).catch(onBusy);
    };

    return () => {
      alive = false;
      window.clearTimeout(timer);
      ac.abort();
      release?.();
    };
  }, [name]);

  const takeOver = useCallback(() => takeRef.current(), []);
  return { state, takeOver };
}
