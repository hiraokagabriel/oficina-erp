import { useEffect, useState } from 'react';

const isPhone = (): boolean => typeof document !== 'undefined' && document.documentElement.getAttribute('data-layout') === 'phone';

/**
 * Só LÊ se o layout de celular está ativo (o atributo `data-layout="phone"` que `usePhoneLayout` põe no <html>).
 * Sem efeito no DOM, então qualquer janela pode usar sem desligar o layout ao desmontar. Modo arquivo: sempre falso.
 */
export function useIsPhoneLayout(): boolean {
  const [phone, setPhone] = useState<boolean>(isPhone);
  useEffect(() => {
    const on = (): void => setPhone(isPhone());
    on();
    const mo = new MutationObserver(on);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-layout'] });
    return () => mo.disconnect();
  }, []);
  return phone;
}
