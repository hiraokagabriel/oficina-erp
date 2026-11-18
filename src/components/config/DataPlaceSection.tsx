import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { exportNow, readExportFolder } from '../../auth/exportNow';
import { exportOutcome, exportToastForConfig, lastExportText } from '../../auth/exportView';
import { useToast } from '../../context/ToastContext';
import { exportWarning } from '../../sync/dailyExport';
import { openFolder } from '../../utils/documentOutput';
import { isTauri } from '../../utils/platform';
import { Icon } from '../ui/Icon';

// Config > Onde ficam os dados (só o Dono, nuvem; docs/NUVEM-UX.md seção 9 e docs/NUVEM-PR9.md): última cópia diária,
// aviso depois de 2 dias, "Fazer cópia agora" e "Abrir pasta das cópias". A cópia só existe no programa instalado.

export const DataPlaceSection: React.FC = () => {
  const { supabase, workshopId, deviceName, role, lastExportAt, reloadMembership, online } = useAuth();
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);
  const tauri = isTauri();
  const owner = role === 'dono';
  const now = new Date();
  const warning = tauri && owner ? exportWarning(lastExportAt, now) : null;
  const folder = readExportFolder();

  const run = async (): Promise<void> => {
    if (!workshopId) return;
    setBusy(true);
    try {
      const res = await exportNow({ supabase, workshopId, deviceName });
      const out = exportToastForConfig(exportOutcome(res, false), warning !== null);
      if (out) addToast(out.message, out.type);
      await reloadMembership();
    } finally {
      setBusy(false);
    }
  };

  const open = async (): Promise<void> => {
    const r = await openFolder(folder);
    if (!r.ok) addToast(r.message, 'error');
  };

  return (
    <section className="card cfg-card" aria-labelledby="cfg-where">
      <h3 id="cfg-where" className="cfg-title"><Icon name="nuvem" size={20} /> Onde ficam os dados</h3>
      <p className="cfg-help">Os dados da oficina ficam guardados na internet. Cada aparelho guarda uma cópia para continuar funcionando sem internet.</p>
      {tauri ? (
        <>
          <p className="cfg-help"><strong>Cópia de segurança diária:</strong> todo dia este computador guarda uma cópia completa dos dados nele mesmo.</p>
          <p className="cfg-help" aria-live="polite">{lastExportText(lastExportAt, now)}</p>
          {warning && <div className="cfg-warn" role="alert"><Icon name="alerta" size={20} /> <span>{warning}</span></div>}
          {owner && (
            <div className="cfg-row cfg-row--start">
              <button type="button" className="btn" onClick={() => { void run(); }} disabled={busy || !online} aria-busy={busy}>
                {busy ? 'Fazendo a cópia...' : 'Fazer cópia agora'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { void open(); }} disabled={!folder}
                title={folder ? undefined : 'Faça uma cópia primeiro: a pasta só aparece depois da primeira cópia neste computador.'}>
                Abrir pasta das cópias
              </button>
            </div>
          )}
          {owner && !online && <p className="cfg-help">Sem internet: a cópia precisa baixar os dados.</p>}
        </>
      ) : (
        <>
          <p className="cfg-help">A cópia diária é feita pelo computador do Dono, com o programa instalado.</p>
          <p className="cfg-help" aria-live="polite">{lastExportText(lastExportAt, now)}</p>
        </>
      )}
    </section>
  );
};
