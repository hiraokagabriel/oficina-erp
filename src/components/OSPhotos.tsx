import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTopmostEscape } from '../hooks/useTopmostEscape';
import { ConfirmationModal } from '../modals/ConfirmationModal';
import { PhotoViewerModal, ViewerPhoto } from '../modals/PhotoViewerModal';
import { Icon } from './ui/Icon';
import { PhotoThumb } from './PhotoThumb';
import { MAX_PHOTOS_PER_OS, acceptImageFile } from '../services/photos';
import { isPhotoStoreAvailable, newPhotoId, savePhoto, trashPhoto } from '../services/photoStore';
import {
  appendPhotoMetas, fileErrorLine, limitMessage, photoAlt, photoCountLabel, removeFromList, setCaptionInList, slotsLeft,
} from '../services/photosView';
import { compressImage } from '../utils/imageCompress';
import type { OSPhoto } from '../types';

interface OSPhotosProps {
  dbPath: string;
  osId: string;
  osNumber: number;
  /** Rascunho das fotos da OS (metadados). Só vai para o banco quando a OS é salva. */
  photos: OSPhoto[];
  setPhotos: React.Dispatch<React.SetStateAction<OSPhoto[]>>;
  /** Ids gravados em disco nesta abertura da janela (vão para a lixeira se a janela for descartada). */
  sessionRef: React.MutableRefObject<Set<string>>;
  /** Banco somente leitura: não grava foto nem manda nada para a lixeira. */
  readOnly?: boolean;
  /** Avisa quantas fotos ainda estão sendo enviadas (a janela bloqueia o Salvar enquanto > 0). */
  onBusyChange?: (busy: number) => void;
}

const ACCEPT = 'image/jpeg,image/png,image/webp';

/** Seção "Fotos do carro" da janela da OS: adicionar (botão, arrastar, colar), legenda, ampliar e remover. */
export const OSPhotos: React.FC<OSPhotosProps> = ({ dbPath, osId, osNumber, photos, setPhotos, sessionRef, readOnly = false, onBusyChange }) => {
  const available = isPhotoStoreAvailable() && !readOnly;
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const inFlight = useRef(0);
  const unmounted = useRef(false);
  const [busy, setBusy] = useState(0);
  const [notes, setNotes] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [toRemove, setToRemove] = useState<OSPhoto | null>(null);
  const [viewIndex, setViewIndex] = useState<number | null>(null);

  const full = photos.length >= MAX_PHOTOS_PER_OS;

  // Janela fechada com envio em andamento: o que terminar depois vai para a lixeira em vez de ficar órfão.
  useEffect(() => {
    unmounted.current = false;
    return () => { unmounted.current = true; };
  }, []);

  const onBusyRef = useRef(onBusyChange);
  onBusyRef.current = onBusyChange;
  useEffect(() => { onBusyRef.current?.(busy); }, [busy]);
  useEffect(() => () => { onBusyRef.current?.(0); }, []);

  useTopmostEscape(toRemove !== null, () => setToRemove(null));

  // Visualizador ou confirmação por cima: colar não deve mexer nas fotos por baixo.
  const overlayOpen = useRef(false);
  overlayOpen.current = toRemove !== null || viewIndex !== null;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  const processFiles = useCallback(async (files: File[]) => {
    if (files.length === 0 || readOnlyRef.current) return;
    if (!isPhotoStoreAvailable()) { setNotes(['Fotos só no programa instalado.']); return; }
    // Reserva síncrona: lotes simultâneos enxergam o que o outro já reservou.
    const free = slotsLeft(photosRef.current.length + inFlight.current);
    const take = files.slice(0, free);
    const msgs: string[] = [];
    if (take.length < files.length) msgs.push(limitMessage(take.length, files.length));
    inFlight.current += take.length;
    setBusy(b => b + take.length);
    for (const file of take) {
      try {
        const ok = acceptImageFile(file.type, file.size);
        if (!ok.ok) throw new Error(ok.message);
        const c = await compressImage(file);
        if (unmounted.current) continue; // janela já fechada: nem grava
        if (photosRef.current.length >= MAX_PHOTOS_PER_OS) throw new Error(limitMessage(0, 1));
        const id = newPhotoId();
        await savePhoto(dbPath, osId, id, c.full, c.thumb);
        if (unmounted.current) {
          trashPhoto(dbPath, osId, id).catch(err => console.warn('Não foi possível mover a foto para a lixeira:', err));
          continue;
        }
        const meta: OSPhoto = { id, createdAt: new Date().toISOString() };
        const next = appendPhotoMetas(photosRef.current, [meta]);
        if (next.recusadas.length > 0) {
          await trashPhoto(dbPath, osId, id).catch(err => console.warn('Não foi possível mover a foto para a lixeira:', err));
          throw new Error(limitMessage(0, 1));
        }
        sessionRef.current.add(id);
        photosRef.current = next.list; // já conta para o próximo envio, antes de redesenhar
        setPhotos(prev => appendPhotoMetas(prev, [meta]).list);
      } catch (e) {
        msgs.push(fileErrorLine(file.name, e instanceof Error ? e.message : 'Não foi possível adicionar esta foto.'));
      } finally {
        inFlight.current -= 1;
        setBusy(b => b - 1);
      }
    }
    setNotes(msgs);
  }, [dbPath, osId, sessionRef, setPhotos]);

  // Colar (Ctrl+V) uma imagem da área de transferência; texto colado em campos segue normal.
  const processRef = useRef(processFiles);
  processRef.current = processFiles;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'));
      if (files.length === 0 || overlayOpen.current) return;
      e.preventDefault();
      void processRef.current(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    void processFiles(files);
  };

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  // Mesmo sem poder receber (somente leitura), cancela o evento: soltar o arquivo aqui não pode abrir a imagem.
  const onDragOver = (e: React.DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); if (available) setDragging(true); };
  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    setDragging(false);
    if (available) void processFiles(Array.from(e.dataTransfer.files));
  };

  const confirmRemove = () => {
    const p = toRemove;
    if (!p || readOnly) return;
    setPhotos(prev => removeFromList(prev, p.id));
    // Foto gravada só nesta sessão: não existe no banco, vai já para a lixeira.
    // Foto que já estava salva: o App manda para a lixeira quando a OS for salva.
    if (sessionRef.current.delete(p.id)) {
      trashPhoto(dbPath, osId, p.id).catch(err => console.warn('Não foi possível mover a foto para a lixeira:', err));
    }
  };

  const items: ViewerPhoto[] = useMemo(
    () => photos.map((photo, i) => ({ osId, osNumber, position: i + 1, photo })),
    [photos, osId, osNumber]
  );

  return (
    <div
      className={`ph-box${dragging ? ' ph-box--drag' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="ph-bar">
        <button
          type="button"
          className="btn ph-add"
          onClick={() => inputRef.current?.click()}
          disabled={!available || full}
          aria-describedby={hintId}
        >
          <Icon name="camera" size={20} /> Adicionar fotos
        </button>
        <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden tabIndex={-1} onChange={onPick} />
        <span className="ph-count" aria-live="polite">{photoCountLabel(photos.length)}</span>
      </div>
      <p id={hintId} className="ph-hint">
        {readOnly
          ? 'Banco somente leitura: não é possível adicionar nem remover fotos.'
          : available
            ? 'Escolha as fotos, arraste para cá ou cole com Ctrl+V. As fotos só ficam na OS depois de clicar em Salvar.'
            : 'Fotos só no programa instalado.'}
      </p>

      {busy > 0 && <p className="ph-status" role="status">Enviando {busy} {busy === 1 ? 'foto' : 'fotos'}...</p>}
      {full && busy === 0 && <p className="ph-status" role="status">Limite de {MAX_PHOTOS_PER_OS} fotos atingido. Remova alguma para adicionar outra.</p>}

      {notes.length > 0 && (
        <div className="ph-errors" role="alert">
          <ul>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          <button type="button" className="btn-sm" onClick={() => setNotes([])}>Entendi</button>
        </div>
      )}

      {photos.length === 0 ? (
        <p className="ph-empty">Nenhuma foto nesta OS ainda.</p>
      ) : (
        <ul className="ph-grid" aria-label="Fotos da OS">
          {photos.map((p, i) => {
            const alt = photoAlt(p, osNumber, i + 1);
            return (
              <li key={p.id} className="ph-cell">
                <PhotoThumb dbPath={dbPath} osId={osId} photoId={p.id} alt={alt} onOpen={() => setViewIndex(i)} />
                <label className="sr-only" htmlFor={`ph-cap-${p.id}`}>Legenda da foto {i + 1}</label>
                <input
                  id={`ph-cap-${p.id}`}
                  className="form-input ph-caption"
                  value={p.caption ?? ''}
                  maxLength={120}
                  placeholder="Legenda (opcional)"
                  onChange={e => {
                    const v = e.target.value;
                    setPhotos(prev => setCaptionInList(prev, p.id, v));
                  }}
                />
                <button type="button" className="btn-sm ph-remove" onClick={() => setToRemove(p)} disabled={readOnly} aria-label={`Remover a foto ${i + 1}`}>
                  <Icon name="excluir" size={16} /> Remover
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {toRemove && (
        <ConfirmationModal
          isOpen
          title="Remover esta foto?"
          message="A foto sai desta OS. Ela vai para a lixeira da pasta de fotos."
          confirmText="Remover"
          cancelText="Manter"
          confirmColor="danger"
          onConfirm={confirmRemove}
          onClose={() => setToRemove(null)}
        />
      )}

      {viewIndex !== null && (
        <PhotoViewerModal
          dbPath={dbPath}
          items={items}
          index={Math.min(viewIndex, items.length - 1)}
          onIndexChange={setViewIndex}
          onClose={() => setViewIndex(null)}
        />
      )}
    </div>
  );
};
