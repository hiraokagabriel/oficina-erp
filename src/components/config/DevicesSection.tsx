import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { AuthApiError } from '../../auth/api';
import { IDLE_OPTIONS } from '../../auth/idle';
import type { IdleMinutes } from '../../auth/idle';
import { useToast } from '../../context/ToastContext';
import { ConfirmationModal } from '../../modals/ConfirmationModal';
import {
  IDLE_CHOICES, IDLE_NEVER_WARNING, REVOKE_TEXT, authorizedLine, authorizedToast, deviceLine, idleToast, otherDevices,
  parseDeviceRows, revokeTitle,
} from '../../utils/cloudDevices';
import type { DeviceRow } from '../../utils/cloudDevices';
import { NEEDS_INTERNET, adminErrorMessage } from '../../utils/cloudUsers';
import { Icon } from '../ui/Icon';

// Config > Aparelhos (docs/NUVEM-UX.md 5.2). Só PC compartilhado se autoriza (decisão 4 do dono: aparelho pessoal não se registra).
// A leitura de `devices` usa só as colunas liberadas (sem `secret_hash`).

export const DevicesSection: React.FC = () => {
  const { supabase, api, workshopId, device, deviceBlock, online, registerThisDevice, setIdleMinutes, forgetThisDevice } = useAuth();
  const { addToast } = useToast();
  const [rows, setRows] = useState<DeviceRow[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [nameError, setNameError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<DeviceRow | null>(null);
  const [forgetting, setForgetting] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!workshopId) return;
    const [d, m] = await Promise.all([
      supabase.from('devices').select('id, name, kind, idle_lock_minutes, authorized_by, authorized_at, revoked_at').eq('workshop_id', workshopId),
      supabase.from('memberships').select('user_id, display_name').eq('workshop_id', workshopId),
    ]);
    if (d.error) { setFailed(true); return; }
    setFailed(false);
    setRows(parseDeviceRows(d.data));
    const map: Record<string, string> = {};
    for (const r of (Array.isArray(m.data) ? m.data : []) as { user_id?: unknown; display_name?: unknown }[]) {
      if (typeof r.user_id === 'string' && typeof r.display_name === 'string') map[r.user_id] = r.display_name;
    }
    setNames(map);
  }, [supabase, workshopId]);

  useEffect(() => { void load(); }, [load, online, device?.id]);

  const needNet = (): boolean => {
    if (online) return false;
    addToast(NEEDS_INTERNET, 'info');
    return true;
  };

  const authorize = async (): Promise<void> => {
    if (needNet() || busy) return;
    const n = draftName.trim();
    if (!n) { setNameError('Dê um nome ao aparelho.'); return; }
    setNameError(''); setBusy(true);
    const r = await registerThisDevice(n);
    setBusy(false);
    if (r.ok) { addToast(authorizedToast(n), 'success'); setDraftName(''); void load(); } else setNameError(r.message);
  };

  const changeIdle = async (m: IdleMinutes): Promise<void> => {
    if (needNet()) return;
    const r = await setIdleMinutes(m);
    if (r.ok) { addToast(idleToast(m), 'success'); void load(); } else addToast(r.message, 'error');
  };

  const changeOtherIdle = async (d: DeviceRow, m: IdleMinutes): Promise<void> => {
    if (needNet()) return;
    try { await api.device.setIdle(d.id, m); addToast(idleToast(m), 'success'); } catch (e) {
      addToast(e instanceof AuthApiError ? adminErrorMessage(e.error, e.message) : adminErrorMessage('sem_internet'), 'error');
    }
    await load();
  };

  const revoke = async (d: DeviceRow): Promise<void> => {
    try { await api.device.revoke(d.id); addToast(`${d.name} foi revogado.`, 'success'); } catch (e) {
      addToast(e instanceof AuthApiError ? adminErrorMessage(e.error, e.message) : adminErrorMessage('sem_internet'), 'error');
    }
    await load();
  };

  const forgetThis = async (): Promise<void> => {
    if (needNet()) return;
    const r = await forgetThisDevice();
    if (r.ok) { addToast('Este computador deixou de ser compartilhado. Agora cada pessoa entra com e-mail e senha.', 'success'); void load(); } else addToast(r.message, 'error');
  };

  const mine = rows?.find(r => r.id === device?.id) ?? null;
  const others = rows ? otherDevices(rows, device?.id ?? null) : [];

  return (
    <section className="card cfg-card" aria-labelledby="cfg-devices">
      <h3 id="cfg-devices" className="cfg-title"><Icon name="computador" size={20} /> Aparelhos</h3>
      <p className="cfg-help">Computadores em que várias pessoas entram com o PIN.</p>

      {failed && (
        <div className="cfg-block">
          <p className="cfg-bad" role="alert"><Icon name="alerta" size={16} /> Não foi possível carregar os aparelhos.</p>
          <button type="button" className="btn-secondary" onClick={() => void load()}>Tentar de novo</button>
        </div>
      )}

      <div className="cfg-block">
        <h4 className="cfg-subtitle"><Icon name="computador" size={18} /> Este computador</h4>
        {device ? (
          <>
            <p className="cfg-device-line"><strong>{authorizedLine(
              { name: device.name, authorizedAt: mine?.authorizedAt ?? '' }, mine?.authorizedBy ? names[mine.authorizedBy] ?? null : null,
            )}</strong></p>
            <div className="today-home" role="group" aria-labelledby="cfg-idle-label">
              <span id="cfg-idle-label" className="form-label">Bloquear quando ficar sem uso por</span>
              <div className="segmented">
                {IDLE_OPTIONS.map(m => (
                  <button key={String(m)} type="button" aria-pressed={device.idleMinutes === m} onClick={() => void changeIdle(m)}>
                    {IDLE_CHOICES.find(c => c.value === m)?.label}
                  </button>
                ))}
              </div>
              <p className="cfg-help">Depois desse tempo parado, a tela volta para "Quem está usando agora?" e pede o PIN.</p>
              {device.idleMinutes === null && <p className="cfg-warn"><Icon name="alerta" size={18} /> {IDLE_NEVER_WARNING}</p>}
            </div>
            <div className="cfg-row cfg-row--start">
              <button type="button" className="btn-secondary btn-sm" aria-disabled={!online} onClick={() => { if (!needNet()) setForgetting(true); }}>
                Deixar de usar este computador como compartilhado
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="cfg-help">
              {deviceBlock === 'revoked'
                ? 'A autorização deste computador foi revogada. Autorize de novo para voltar a usar o PIN aqui.'
                : 'Este computador ainda não está autorizado. Autorize para várias pessoas entrarem aqui com o PIN.'}
            </p>
            <div className="form-group cfg-narrow">
              <label className="form-label" htmlFor="cfg-device-name">Nome do aparelho</label>
              <input id="cfg-device-name" className="form-input" value={draftName} placeholder="PC da recepção" autoComplete="off"
                aria-invalid={nameError ? true : undefined} aria-describedby={nameError ? 'cfg-device-name-err' : undefined}
                onChange={e => setDraftName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void authorize(); }} />
              {nameError && <span id="cfg-device-name-err" className="field-error" role="alert">{nameError}</span>}
            </div>
            <p className="cfg-help">Compartilhado: várias pessoas usam; cada uma entra tocando no nome e digitando o PIN.</p>
            <div className="cfg-row cfg-row--start">
              <button type="button" className="btn" aria-disabled={!online} aria-busy={busy} onClick={() => void authorize()}>
                {busy ? 'Autorizando...' : 'Autorizar este computador'}
              </button>
              {!online && <span className="cfg-help">{NEEDS_INTERNET}</span>}
            </div>
          </>
        )}
      </div>

      <div className="cfg-block">
        <h4 className="cfg-subtitle">Outros aparelhos</h4>
        {rows === null && !failed && <div className="person-row person-row--skeleton" aria-busy="true" />}
        {rows && others.length === 0 && (
          <p className="cfg-help">Nenhum outro aparelho ainda. Os celulares aparecem aqui quando a pessoa entra neles pela primeira vez.</p>
        )}
        <ul className="cfg-people">
          {others.map(d => (
            <li key={d.id} className={`person-row${d.revokedAt ? ' is-inactive' : ''}`}>
              <div className="person-id">
                <span className="person-avatar" aria-hidden="true"><Icon name={d.kind === 'pessoal' ? 'celular' : 'computador'} size={16} /></span>
                <div className="person-name"><strong>{d.name}</strong><span className="cfg-help">{deviceLine(d)}</span></div>
              </div>
              {!d.revokedAt && (
                <div className="person-actions">
                  {d.kind === 'pc_compartilhado' && (
                    <>
                      <label className="sr-only" htmlFor={`idle-${d.id}`}>Bloqueio de {d.name}</label>
                      <select id={`idle-${d.id}`} className="form-input person-select" value={String(d.idleMinutes)}
                        onChange={e => void changeOtherIdle(d, e.target.value === 'null' ? null : (Number(e.target.value) as IdleMinutes))}>
                        {IDLE_CHOICES.map(c => <option key={String(c.value)} value={String(c.value)}>{c.label}</option>)}
                      </select>
                    </>
                  )}
                  <button type="button" className="btn-secondary btn-sm" aria-disabled={!online}
                    onClick={() => { if (!needNet()) setRevoking(d); }}>Revogar</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {forgetting && (
        <ConfirmationModal
          isOpen onClose={() => setForgetting(false)} onConfirm={() => void forgetThis()}
          title="Deixar de usar este computador como compartilhado?"
          message="Ninguém mais entra com PIN aqui: este computador é revogado e a tela 'Quem está usando agora?' some. Cada pessoa passa a entrar com e-mail e senha. Para voltar, será preciso autorizar de novo."
          confirmText="Deixar de usar" confirmColor="danger"
        />
      )}

      {revoking && (
        <ConfirmationModal
          isOpen onClose={() => setRevoking(null)} onConfirm={() => void revoke(revoking)}
          title={revokeTitle(revoking.name)} message={REVOKE_TEXT} confirmText="Revogar" confirmColor="danger"
        />
      )}
    </section>
  );
};
