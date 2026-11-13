// "Tem internet?" de verdade: o `navigator.onLine` só diz que há uma placa de rede. Aqui se tenta falar com o servidor
// (`/auth/v1/health`) com tempo curto. Qualquer resposta HTTP (até 4xx/5xx) prova que o servidor foi alcançado.

export const REACH_TIMEOUT_MS = 4000;

export async function probeReach(
  baseUrl: string, anonKey: string, fetchFn: typeof fetch = (...a) => fetch(...a), timeoutMs = REACH_TIMEOUT_MS,
): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    await fetchFn(`${baseUrl.replace(/\/+$/, '')}/auth/v1/health`, { headers: { apikey: anonKey }, signal: ctl.signal, cache: 'no-store' });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Efetivamente online = a placa de rede diz que sim E o servidor respondeu da última vez. */
export const effectiveOnline = (navigatorOnline: boolean, serverReachable: boolean): boolean => navigatorOnline && serverReachable;
