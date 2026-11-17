import { useEffect, useState } from 'react';
import { PHONE_MAX_WIDTH } from '../services/mobileNav';

const QUERY = `(max-width: ${PHONE_MAX_WIDTH}px)`;
const matches = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;

/**
 * Layout de celular: só no modo nuvem (`cloud`) e abaixo de 800 px, reativo. Põe `data-layout="phone"` no <html>
 * (o `styles-mobile.css` só vale com ele). Sem `cloud` (modo arquivo) devolve sempre falso e não toca no DOM.
 */
export function usePhoneLayout(cloud: boolean): boolean {
  const [narrow, setNarrow] = useState<boolean>(matches);
  useEffect(() => {
    if (!cloud || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(QUERY);
    const on = (): void => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [cloud]);
  const phone = cloud && narrow;
  useEffect(() => {
    if (!phone) return;
    const root = document.documentElement;
    root.setAttribute('data-layout', 'phone');
    return () => root.removeAttribute('data-layout');
  }, [phone]);
  return phone;
}
