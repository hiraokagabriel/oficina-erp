import React, { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../components/ui/Icon';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useTopmostEscape } from '../hooks/useTopmostEscape';
import { isPhotoStoreAvailable, acquirePhotoUrl, releasePhotoUrl } from '../services/photoStore';
import { photoAlt, photoOriginLabel } from '../services/photosView';
import type { OSPhoto } from '../types';

export interface ViewerPhoto {
  osId: string;
  osNumber: number;
  /** Posição da foto dentro da própria OS, a partir de 1 (para o texto alternativo). */
  position: number;
  photo: OSPhoto;
}

interface PhotoViewerModalProps {
  dbPath: string;
  items: ViewerPhoto[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

type ViewState = 'carregando' | 'pronta' | 'chegando' | 'erro' | 'indisponivel';

/** Foto cheia em tela grande: setas do teclado e botões, Esc fecha só esta janela, foco preso e devolvido. */
export const PhotoViewerModal: React.FC<PhotoViewerModalProps> = ({ dbPath, items, index, onIndexChange, onClose }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [state, setState] = useState<ViewState>(() => (isPhotoStoreAvailable() ? 'carregando' : 'indisponivel'));
  const [url, setUrl] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useFocusTrap(true, dialogRef);
  useTopmostEscape(true, onClose);
  useEffect(() => { closeRef.current?.focus(); }, []);

  const total = items.length;
  const current = items[index];
  const hasPrev = index > 0;
  const hasNext = index < total - 1;

  const goPrev = () => { if (hasPrev) onIndexChange(index - 1); };
  const goNext = () => { if (hasNext) onIndexChange(index + 1); };

  // Setas: não mexe quando o foco está num campo de texto.
  const navRef = useRef({ goPrev, goNext });
  navRef.current = { goPrev, goNext };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      e.preventDefault();
      if (e.key === 'ArrowLeft') navRef.current.goPrev(); else navRef.current.goNext();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const osId = current?.osId;
  const photoId = current?.photo.id;
  useEffect(() => {
    if (!osId || !photoId) return;
    if (!isPhotoStoreAvailable()) { setState('indisponivel'); return; }
    let cancelled = false;
    let loaded: string | null = null;
    setState('carregando');
    setUrl(null);
    acquirePhotoUrl(dbPath, osId, photoId, false)
      .then(u => {
        if (cancelled) { if (u) releasePhotoUrl(u); return; }
        if (u === null) { setState('chegando'); return; }
        loaded = u;
        setUrl(u);
        setState('pronta');
      })
      .catch(() => { if (!cancelled) setState('erro'); });
    return () => {
      cancelled = true;
      if (loaded) releasePhotoUrl(loaded);
    };
  }, [dbPath, osId, photoId, attempt]);

  // A lista pode encolher com o viewer aberto: fecha em vez de quebrar.
  useEffect(() => { if (!current) onClose(); }, [current, onClose]);
  if (!current) return null;

  const alt = photoAlt(current.photo, current.osNumber, current.position);
  const origem = photoOriginLabel(current.osNumber, current.photo.createdAt);

  return (
    <div className="modal-overlay ph-viewer-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="ph-viewer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="ph-viewer-head">
          <h2 id={titleId} className="ph-viewer-title">Foto {index + 1} de {total}</h2>
          <button ref={closeRef} type="button" className="btn-secondary ph-viewer-close" onClick={onClose}>
            <Icon name="fechar" size={18} /> Fechar
          </button>
        </div>

        <div className="ph-viewer-stage">
          <button type="button" className="btn-secondary ph-viewer-nav" onClick={goPrev} disabled={!hasPrev} aria-label="Foto anterior">
            <Icon name="voltar" size={22} />
          </button>
          <div className="ph-viewer-img" aria-live="polite">
            {state === 'pronta' && url && <img src={url} alt={alt} draggable={false} onError={() => setState('erro')} />}
            {state === 'carregando' && <p className="ph-viewer-msg">Carregando a foto...</p>}
            {state === 'indisponivel' && <p className="ph-viewer-msg">Fotos só no programa instalado.</p>}
            {state === 'chegando' && (
              <div className="ph-viewer-msg">
                <p>Foto ainda chegando de outro computador.</p>
                <button type="button" className="btn-secondary" onClick={() => setAttempt(n => n + 1)}>Tentar de novo</button>
              </div>
            )}
            {state === 'erro' && (
              <div className="ph-viewer-msg">
                <p>Não foi possível abrir esta foto.</p>
                <button type="button" className="btn-secondary" onClick={() => setAttempt(n => n + 1)}>Tentar de novo</button>
              </div>
            )}
          </div>
          <button type="button" className="btn-secondary ph-viewer-nav" onClick={goNext} disabled={!hasNext} aria-label="Próxima foto">
            <Icon name="proximo" size={22} />
          </button>
        </div>

        <div className="ph-viewer-foot">
          {current.photo.caption?.trim() && <p className="ph-viewer-caption">{current.photo.caption.trim()}</p>}
          <p className="ph-viewer-origin">{origem}</p>
          <p className="ph-viewer-hint">Use as setas do teclado para trocar de foto e Esc para fechar.</p>
        </div>
      </div>
    </div>
  );
};
