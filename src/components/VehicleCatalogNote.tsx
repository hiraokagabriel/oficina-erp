import React, { useEffect, useState } from 'react';
import type { RawVehicleCatalog } from '../services/vehicleCatalog';
import { describeCatalog } from '../services/vehicleField';
import { loadVehicleIndex } from '../services/vehicleIndex';

/** Atribuição discreta da base de veículos (Configurações). */
export const VehicleCatalogNote: React.FC = () => {
  const [meta, setMeta] = useState<RawVehicleCatalog['meta']>();
  useEffect(() => {
    let alive = true;
    void loadVehicleIndex().then(i => { if (alive && i) setMeta(i.meta); });
    return () => { alive = false; };
  }, []);
  const { details, warning } = describeCatalog(meta);
  return (
    <p className="vehicle-catalog-note" style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
      Base de veículos: Tabela FIPE (Fundação Instituto de Pesquisas Econômicas), obtida pela API pública fipe.parallelum.com.br.
      Uso apenas para sugestão de preenchimento; não é a tabela de preços.
      {details.length > 0 && <> {details.join(' · ')}.</>}
      {warning && <> {warning}</>}
    </p>
  );
};
