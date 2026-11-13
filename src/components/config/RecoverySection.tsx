import React, { useCallback, useEffect, useState } from 'react';
import { deleteRecoveryCopy, downloadRecoveryCopy, listRecoveryCopies } from '../../auth/recoveryStore';
import type { RecoveryCopy } from '../../auth/recoveryStore';
import { ConfirmationModal } from '../../modals/ConfirmationModal';
import { formatDay } from '../../utils/cloudUsers';
import { Icon } from '../ui/Icon';

// Config > Cópias de recuperação (docs/NUVEM-UX.md 6.3): o que uma pessoa não conseguiu enviar fica guardado neste
// navegador; o Dono baixa o arquivo (nunca baixa sozinho). No app instalado as cópias vão para a pasta do programa.

const inApp = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const RecoverySection: React.FC = () => {
  const [copies, setCopies] = useState<RecoveryCopy[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [deleting, setDeleting] = useState<RecoveryCopy | null>(null);
  const app = inApp();

  const load = useCallback(async (): Promise<void> => {
    try { setCopies(await listRecoveryCopies()); setFailed(false); } catch { setFailed(true); }
  }, []);
  useEffect(() => { if (!app) void load(); }, [app, load]);

  return (
    <section className="card cfg-card" aria-labelledby="cfg-recovery">
      <h3 id="cfg-recovery" className="cfg-title"><Icon name="salvar" size={20} /> Cópias de recuperação</h3>
      <p className="cfg-help">
        Quando algo não pôde ser enviado (por exemplo, uma pessoa foi desativada com alterações pendentes), uma cópia fica guardada aqui. Nada é baixado sozinho.
      </p>
      {app && <p className="cfg-help">Neste programa, as cópias ficam na pasta de recuperação do OficinaPro neste computador.</p>}
      {!app && failed && <p className="cfg-bad" role="alert"><Icon name="alerta" size={16} /> Não foi possível ler as cópias deste aparelho.</p>}
      {!app && copies && copies.length === 0 && <p className="cfg-help">Nenhuma cópia guardada neste aparelho.</p>}
      {!app && copies && copies.length > 0 && (
        <ul className="cfg-people">
          {copies.map(c => (
            <li key={c.id} className="person-row">
              <div className="person-id"><div className="person-name"><strong>{c.name}</strong><span className="cfg-help">Guardada em {formatDay(c.savedAt)}</span></div></div>
              <div className="person-actions">
                <button type="button" className="btn-secondary btn-sm" onClick={() => downloadRecoveryCopy(c)}>Baixar</button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setDeleting(c)}>Apagar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {deleting && (
        <ConfirmationModal
          isOpen onClose={() => setDeleting(null)}
          onConfirm={() => { const c = deleting; setDeleting(null); void deleteRecoveryCopy(c.id).then(load); }}
          title="Apagar esta cópia?" message={`A cópia "${deleting.name}" será apagada deste aparelho e não dá para voltar. Baixe antes se ainda precisar dela.`}
          confirmText="Apagar" confirmColor="danger"
        />
      )}
    </section>
  );
};
