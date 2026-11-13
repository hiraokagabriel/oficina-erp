import React, { useMemo } from 'react';
import { useDatabase } from '../../context/DatabaseContext';
import { PHOTO_SPACE_WARNING, formatBytes, photoSpaceUsage } from '../../services/photoSpace';
import { Icon } from '../ui/Icon';

// Config > Espaço das fotos (docs/NUVEM-UX.md 5.3, só o Dono na nuvem). Valor estimado pelas fotos das OS (ver `photoSpace.ts`).

export const PhotoSpaceSection: React.FC = () => {
  const { workOrders } = useDatabase();
  const usage = useMemo(() => photoSpaceUsage(workOrders), [workOrders]);
  const pct = Math.min(100, usage.percent);
  return (
    <section className="card cfg-card" aria-labelledby="cfg-photo-space">
      <h3 id="cfg-photo-space" className="cfg-title"><Icon name="camera" size={20} /> Espaço das fotos</h3>
      <p className="cfg-help">
        Usado: cerca de {formatBytes(usage.usedBytes)} de {formatBytes(usage.limitBytes)} ({usage.percent}%). {usage.photos} {usage.photos === 1 ? 'foto' : 'fotos'} nas OS.
      </p>
      <div className="cfg-meter" role="meter" aria-label="Espaço das fotos usado" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className={`cfg-meter-fill${usage.warn ? ' cfg-meter-fill--warn' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      {usage.warn && (
        <div className="cfg-warn" role="alert"><Icon name="alerta" size={20} /> <span>{PHOTO_SPACE_WARNING}</span></div>
      )}
      <p className="cfg-help">Valor aproximado: fotos tiradas de OS já excluídas ou removidas também ocupam espaço e não entram na conta.</p>
    </section>
  );
};
