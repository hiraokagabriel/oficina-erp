import React, { useEffect, useRef, useState } from 'react';
import { isPhotoStoreAvailable, acquirePhotoUrl, releasePhotoUrl } from '../services/photoStore';

type ThumbState = 'esperando' | 'carregando' | 'pronta' | 'chegando' | 'erro' | 'indisponivel';

interface PhotoThumbProps {
  dbPath: string;
  osId: string;
  photoId: string;
  /** Texto alternativo e nome acessível do botão. */
  alt: string;
  /** Clique na miniatura (abrir a foto grande). */
  onOpen: () => void;
}

/**
 * Miniatura de uma foto da OS. Só lê o arquivo quando chega perto da tela (listas longas),
 * mostra o estado (carregando, ainda chegando de outro PC, erro) e devolve a URL ao desmontar.
 */
export const PhotoThumb: React.FC<PhotoThumbProps> = ({ dbPath, osId, photoId, alt, onOpen }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  const [state, setState] = useState<ThumbState>(() => (isPhotoStoreAvailable() ? 'esperando' : 'indisponivel'));
  const [url, setUrl] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

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
        </button>
      ) : (
        <div className="ph-thumb-msg" role="status">
          {(state === 'esperando' || state === 'carregando') && <span>Carregando...</span>}
          {state === 'chegando' && (
            <>
              <span>Foto ainda chegando de outro computador.</span>
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
    </div>
  );
};
