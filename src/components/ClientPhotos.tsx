import React, { useId, useMemo, useState } from 'react';
import { Icon } from './ui/Icon';
import { PhotoThumb } from './PhotoThumb';
import { PhotoViewerModal, ViewerPhoto } from '../modals/PhotoViewerModal';
import { groupPhotosByVehicle, nameOnlyMatches } from '../services/photos';
import {
  NAME_ONLY_BADGE, NAME_ONLY_BADGE_TITLE, NAME_ONLY_WARNING, groupLabel, limitGroups, nameOnlyOsList, photoAlt, photoOriginLabel,
} from '../services/photosView';
import { PAGE_STEP } from '../services/pagination';
import type { Client, WorkOrder } from '../types';

interface ClientPhotosProps {
  dbPath: string;
  clientId: string;
  clientName: string;
  workOrders: WorkOrder[];
  /** Todos os clientes: serve para achar homônimos. */
  clients?: Client[];
  /** Abre a OS (mesmo handler do histórico do CRM). */
  onOpenOS?: (os: WorkOrder) => void;
}

const ALL = '';

/** Fotos de todas as OS do cliente, por carro, da mais recente para a mais antiga. Clique abre a foto grande. */
export const ClientPhotos: React.FC<ClientPhotosProps> = ({ dbPath, clientId, clientName, workOrders, clients, onOpenOS }) => {
  const filterId = useId();
  const [vehicleKey, setVehicleKey] = useState(ALL);
  const [cap, setCap] = useState(PAGE_STEP);
  const [viewIndex, setViewIndex] = useState<number | null>(null);

  const groups = useMemo(() => groupPhotosByVehicle(workOrders, { clientId, clientName }), [workOrders, clientId, clientName]);
  // OS legadas que só casaram pelo nome com homônimo existente: aviso permanente (não bloqueia nada).
  const byNameOnly = useMemo(
    () => (clients ? nameOnlyMatches(workOrders, clients, { id: clientId, name: clientName }) : []),
    [workOrders, clients, clientId, clientName]
  );
  const nameOnlyIds = useMemo(() => new Set(byNameOnly.map(o => o.id)), [byNameOnly]);
  const nameOnlyList = nameOnlyOsList(byNameOnly.map(o => o.osNumber));
  const total = groups.reduce((n, g) => n + g.photos.length, 0);

  // Filtro que sumiu (cliente trocado ou fotos removidas) volta para "todos".
  const activeKey = groups.some(g => g.key === vehicleKey) ? vehicleKey : ALL;
  const filtered = useMemo(() => (activeKey === ALL ? groups : groups.filter(g => g.key === activeKey)), [groups, activeKey]);
  const shown = useMemo(() => limitGroups(filtered, cap), [filtered, cap]);
  const filteredTotal = filtered.reduce((n, g) => n + g.photos.length, 0);

  // Ordem do visualizador = ordem na tela.
  const items: ViewerPhoto[] = useMemo(
    () => shown.flatMap(g => g.photos.map(({ os, photo }) => ({
      osId: os.id,
      osNumber: os.osNumber,
      position: (os.photos ?? []).findIndex(p => p.id === photo.id) + 1,
      photo,
    }))),
    [shown]
  );

  if (total === 0) {
    return (
      <div className="ph-client-empty">
        <Icon name="camera" size={40} />
        <p className="ph-client-empty-title">Nenhuma foto deste cliente</p>
        <p>As fotos tiradas nas ordens de serviço dele aparecem aqui. Para adicionar, abra uma OS e use "Adicionar fotos".</p>
      </div>
    );
  }

  let offset = 0;
  return (
    <div className="ph-client">
      {byNameOnly.length > 0 && (
        <div className="ph-name-note" role="note">
          <Icon name="info" size={16} />
          <div>
            <p>{NAME_ONLY_WARNING}</p>
            <p className="ph-name-note-list">
              OS:{' '}
              {byNameOnly.slice(0, nameOnlyList.shown.length).map((o, i) => (
                <React.Fragment key={o.id}>
                  {i > 0 && ', '}
                  {onOpenOS
                    ? <button type="button" className="ph-name-note-link" onClick={() => onOpenOS(o)}>#{o.osNumber}</button>
                    : <span>#{o.osNumber}</span>}
                </React.Fragment>
              ))}
              {nameOnlyList.extra > 0 && ` e mais ${nameOnlyList.extra}`}
            </p>
          </div>
        </div>
      )}

      {groups.length > 1 && (
        <div className="ph-client-filter">
          <label className="form-label" htmlFor={filterId}>Mostrar fotos de</label>
          <select id={filterId} className="form-input" value={activeKey} onChange={e => { setVehicleKey(e.target.value); setCap(PAGE_STEP); }}>
            <option value={ALL}>Todos os carros ({total})</option>
            {groups.map(g => <option key={g.key} value={g.key}>{groupLabel(g)} ({g.photos.length})</option>)}
          </select>
        </div>
      )}

      {shown.map(g => {
        const start = offset;
        offset += g.photos.length;
        return (
          <section key={g.key} className="ph-client-group" aria-label={groupLabel(g)}>
            <h4 className="ph-client-car">{groupLabel(g)}</h4>
            <ul className="ph-grid">
              {g.photos.map(({ os, photo }, i) => {
                const position = (os.photos ?? []).findIndex(p => p.id === photo.id) + 1;
                return (
                  <li key={`${os.id}-${photo.id}`} className="ph-cell">
                    <PhotoThumb
                      dbPath={dbPath}
                      osId={os.id}
                      photoId={photo.id}
                      alt={photoAlt(photo, os.osNumber, position)}
                      onOpen={() => setViewIndex(start + i)}
                    />
                    {photo.caption?.trim() && <div className="ph-cell-caption">{photo.caption.trim()}</div>}
                    <div className="ph-cell-origin">{photoOriginLabel(os.osNumber, photo.createdAt)}</div>
                    {nameOnlyIds.has(os.id) && (
                      <span className="ph-name-badge" title={NAME_ONLY_BADGE_TITLE} aria-label={`${NAME_ONLY_BADGE}: ${NAME_ONLY_BADGE_TITLE}`}>{NAME_ONLY_BADGE}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {filteredTotal > cap && (
        <div className="ph-client-more">
          <button type="button" className="btn btn-secondary" onClick={() => setCap(c => c + PAGE_STEP)}>
            Mostrar mais fotos ({filteredTotal - cap} restantes)
          </button>
        </div>
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
