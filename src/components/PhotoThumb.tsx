import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './ui/Icon';
import { isPhotoStoreAvailable, isPhotoPending, isPhotoFailed, retryPhoto, acquirePhotoUrl, releasePhotoUrl } from '../services/photoStore';

type ThumbState = 'esperando' | 'carregando' | 'pronta' | 'chegando' | 'erro' | 'indisponivel';

interface PhotoThumbProps {
  dbPath: string;
  osId: string;
  photoId: string;
  /** Texto alternativo e nome acessível do botão. */
  alt: string;
  /** Clique na miniatura (abrir a foto grande). */
  onOpen: () => void;
  /** Foto que não subiu: "Descartar" (a tela tira da OS pelo caminho normal). Sem isto, só "Tentar de novo". */
  onDiscard?: () => void;
}

/**
 * Miniatura de uma foto da OS. Só lê o arquivo quando chega perto da tela (listas longas),
 * mostra o estado (carregando, ainda chegando de outro PC, erro) e devolve a URL ao desmontar.
 */
export const PhotoThumb: React.FC<PhotoThumbProps> = ({ dbPath, osId, photoId, alt, onOpen, onDiscard }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  const [state, setState] = useState<ThumbState>(() => (isPhotoStoreAvailable() ? 'esperando' : 'indisponivel'));
  const [url, setUrl] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(() => isPhotoPending(osId, photoId));
  const [failed, setFailed] = useState(() => isPhotoFailed(osId, photoId));

  // Foto guardada só neste aparelho (nuvem): selo "Guardada" até terminar de subir.
  useEffect(() => {
    const sync = (): boolean => { setPending(isPhotoPending(osId, photoId)); setFailed(isPhotoFailed(osId, photoId)); return isPhotoPending(osId, photoId); };
    if (!sync()) return;
    const t = setInterval(() => { if (!sync()) clearInterval(t); }, 3000);
    return () => clearInterval(t);
  }, [osId, photoId, state]);

  // Foto que outro aparelho ainda está enviando: tenta de novo sozinha (a cada 10 s, no máximo 30 vezes).
  useEffect(() => {
    if (state !== 'chegando' || attempt >= 30) return;
    const t = setTimeout(() => setAttempt(n => n + 1), 10000);
    return () => clearTimeout(t);
  }, [state, attempt]);

  useEffect(() => {
    if (near || !boxRef.current || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setNear(true); io.disconnect(); }
    }, { rootMargin: '200px' });
    io.observe(boxRef.current);
    return () => io.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near || !isPhotoStoreAvailable()) return;
    let cancelled = false;
    let loaded: string | null = null;
    setState('carregando');
    acquirePhotoUrl(dbPath, osId, photoId, true)
      .then(u => {
        if (cancelled) { if (u) releasePhotoUrl(u); return; }
        if (u === null) { setUrl(null); setState('chegando'); return; }
        loaded = u;
        setUrl(u);
        setState('pronta');
      })
      .catch(() => { if (!cancelled) { setUrl(null); setState('erro'); } });
    return () => {
      cancelled = true;
      if (loaded) releasePhotoUrl(loaded);
    };
  }, [near, dbPath, osId, photoId, attempt]);

  const retry = () => setAttempt(n => n + 1);

  return (
    <div ref={boxRef} className={`ph-thumb ph-thumb--${state}`}>
      {state === 'pronta' && url ? (
        <button type="button" className="ph-thumb-btn" onClick={onOpen} aria-label={`Ampliar: ${alt}`}>
          <img src={url} alt={alt} loading="lazy" draggable={false} onError={() => { setUrl(null); setState('erro'); }} />
          {pending && !failed && <span className="ph-badge"><Icon name="relogio" size={12} /> Guardada · envia com internet</span>}
          {failed && <span className="ph-badge ph-badge--bad"><Icon name="alerta" size={12} /> Não foi enviada</span>}
        </button>
      ) : (
        <div className="ph-thumb-msg" role="status">
          {(state === 'esperando' || state === 'carregando') && <span>Carregando...</span>}
          {state === 'chegando' && (
            <>
              <span>Foto ainda chegando de outro aparelho.</span>
              <button type="button" className="btn-sm" onClick={retry}>Tentar de novo</button>
            </>
          )}
          {state === 'erro' && (
            <>
              <span>Não foi possível abrir esta foto.</span>
              <button type="button" className="btn-sm" onClick={retry}>Tentar de novo</button>
            </>
          )}
          {state === 'indisponivel' && <span>Fotos só no programa instalado.</span>}
        </div>
      )}
      {failed && (
        <div className="ph-failed">
          <button type="button" className="btn-sm" onClick={() => { retryPhoto(osId, photoId); setFailed(false); setPending(true); }}>Tentar de novo</button>
          {onDiscard && <button type="button" className="btn-sm" onClick={onDiscard}>Descartar</button>}
        </div>
      )}
    </div>
  );
};
