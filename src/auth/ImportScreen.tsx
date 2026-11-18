import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/ui/Icon';
import { useToast } from '../context/ToastContext';
import { createImportRunner } from '../sync/importRunner';
import type { ImportPhase, ImportProgress, ImportReport, ImportSession } from '../sync/importRunner';
import type { ImportProblem } from '../sync/importCheck';
import { isTauri } from '../utils/platform';
import { useAuth } from './AuthContext';
import { AuthShell, AuthStatusIcon, FieldError, Spinner } from './AuthShell';
import { createImportDeps, finishWithoutData } from './importWiring';
import {
  DEFAULT_DB_PATH, PHASE_LABEL, canFinish, confirmsReset, describeImportError, phaseMarks, photoSpaceNote, photoSummary,
  problemLines, progressCount, progressPercent,
} from './importView';

// Tela de bloqueio "Trazer os dados para a internet" (docs/NUVEM-PR9.md, docs/NUVEM-UX.md seção 9). O app não monta
// enquanto a importação não termina. Só o Dono chega aqui (`pickScreen`); o envio de verdade só existe no programa
// instalado. As regras estão em `importRunner.ts`/`importView.ts`; aqui só estado de tela.

type View =
  | { kind: 'inicio' }
  | { kind: 'rodando'; phase: ImportPhase | null; done: number; total: number }
  | { kind: 'bloqueado'; problems: ImportProblem[]; backupPath: string; message: string }
  | { kind: 'erro'; message: string; canRetry: boolean }
  | { kind: 'refazer'; message: string; report: ImportReport | null }
  | { kind: 'pronto'; report: ImportReport; session: ImportSession }
  | { kind: 'concluindo' }
  | { kind: 'concluido_sem_lacre'; message: string };

const readSavedPath = (): string => {
  try { return localStorage.getItem('oficina_db_path') || DEFAULT_DB_PATH; } catch { return DEFAULT_DB_PATH; }
};

const ReportTable: React.FC<{ report: ImportReport }> = ({ report }) => (
  <table className="import-table">
    <caption className="sr-only">Arquivo e internet lado a lado</caption>
    <thead><tr><th scope="col">Item</th><th scope="col">Arquivo</th><th scope="col">Internet</th><th scope="col"><span className="sr-only">Situação</span></th></tr></thead>
    <tbody>
      {report.lines.map(l => (
        <tr key={l.label} className={l.same ? undefined : 'import-diff'}>
          <th scope="row">{l.label}</th>
          <td>{l.file}</td>
          <td>{l.cloud}</td>
          <td>{l.same ? <Icon name="check" size={16} title="Igual" /> : <Icon name="alerta" size={16} title="Diferente" />}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const PhotoNotes: React.FC<{ report: ImportReport }> = ({ report }) => {
  const s = photoSummary(report);
  const space = photoSpaceNote(report.photos.totalBytes);
  return (
    <div className="import-photos">
      {s.lines.map(l => <p key={l} className="auth-text">{l}</p>)}
      {space && <p className="import-warn" role="alert"><Icon name="alerta" size={16} /> {space}</p>}
      {s.missing.length > 0 && (
        <>
          <p className="auth-text">Estas fotos aparecem na OS, mas o arquivo não está no computador. Dá para concluir assim; elas ficam sem imagem.</p>
          <ul className="import-list">{s.missing.map(m => <li key={m}>{m}</li>)}</ul>
        </>
      )}
      {s.failed.length > 0 && (
        <>
          <p className="field-error" role="alert">Estas fotos não subiram. Toque em "Tentar de novo".</p>
          <ul className="import-list">{s.failed.map(m => <li key={m}>{m}</li>)}</ul>
        </>
      )}
    </div>
  );
};

export const ImportScreen: React.FC = () => {
  const { supabase, workshopId, importState, reloadMembership, signOut, online } = useAuth();
  const { addToast } = useToast();
  const tauri = isTauri();
  const [path, setPath] = useState(readSavedPath);
  const [view, setView] = useState<View>({ kind: 'inicio' });
  const [confirm, setConfirm] = useState<null | 'vazio' | 'apagar'>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const runnerRef = useRef<ReturnType<typeof createImportRunner> | null>(null);

  const interrupted = importState === 'importando';

  const makeRunner = useCallback((): ReturnType<typeof createImportRunner> | null => {
    if (!workshopId) return null;
    const onProgress = (p: ImportProgress): void => setView({ kind: 'rodando', phase: p.phase, done: p.done, total: p.total });
    const r = createImportRunner(createImportDeps({ supabase, workshopId, dbPath: path.trim(), onProgress }));
    runnerRef.current = r;
    return r;
  }, [supabase, workshopId, path]);

  const start = useCallback(async (): Promise<void> => {
    setProblem(null);
    if (!path.trim()) { setProblem('Escreva o caminho do arquivo do banco.'); return; }
    const runner = makeRunner();
    if (!runner) return;
    setView({ kind: 'rodando', phase: null, done: 0, total: 0 });
    const res = await runner.run();
    switch (res.status) {
      case 'recusado': setView({ kind: 'erro', message: res.message, canRetry: true }); break;
      case 'bloqueado': setView({ kind: 'bloqueado', problems: res.problems, backupPath: res.backupPath, message: res.message }); break;
      case 'erro': setView({ kind: 'erro', message: describeImportError(res.message), canRetry: true }); break;
      case 'arquivo_mudou': setView({ kind: 'refazer', message: res.message, report: null }); break;
      case 'divergente': setView({ kind: 'refazer', message: res.message, report: res.report }); break;
      case 'pronto': setView({ kind: 'pronto', report: res.report, session: res.session }); break;
    }
    void reloadMembership();
  }, [makeRunner, path, reloadMembership]);

  const conclude = useCallback(async (session: ImportSession): Promise<void> => {
    const runner = runnerRef.current ?? makeRunner();
    if (!runner) return;
    setView({ kind: 'concluindo' });
    const res = await runner.commit(session);
    if (res.status === 'concluido') {
      addToast('Pronto! Os dados foram para a internet e o arquivo antigo foi lacrado.', 'success');
      await reloadMembership();
    } else if (res.status === 'concluido_sem_lacre') {
      setView({ kind: 'concluido_sem_lacre', message: res.message });
    } else if (res.status === 'erro') {
      setView({ kind: 'erro', message: describeImportError(res.message), canRetry: false });
    } else {
      setView({ kind: 'refazer', message: res.message, report: session.report });
    }
  }, [makeRunner, addToast, reloadMembership]);

  const resetAll = useCallback(async (): Promise<void> => {
    const runner = runnerRef.current ?? makeRunner();
    if (!runner) return;
    setBusy(true);
    const res = await runner.reset();
    setBusy(false);
    if (!res.ok) { setProblem(describeImportError(res.message)); return; }
    setConfirm(null); setTyped(''); setView({ kind: 'inicio' });
    addToast('O que foi enviado foi apagado. Você pode começar de novo.', 'info');
    await reloadMembership();
  }, [makeRunner, addToast, reloadMembership]);

  const startEmpty = useCallback(async (): Promise<void> => {
    if (!workshopId) return;
    setBusy(true); setProblem(null);
    try {
      await finishWithoutData(supabase, workshopId);
      addToast('Oficina pronta. Você começou sem dados.', 'success');
      await reloadMembership();
    } catch (e) {
      setProblem(describeImportError(e instanceof Error ? e.message : String(e)));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }, [supabase, workshopId, addToast, reloadMembership]);

  const marks = useMemo(() => (view.kind === 'rodando' ? phaseMarks(view.phase) : []), [view]);

  // ---------- telas ----------
  if (view.kind === 'rodando') {
    const pct = progressPercent(view.done, view.total);
    return (
      <AuthShell wide>
        <AuthStatusIcon name="nuvem" />
        <h1 className="auth-title">Enviando os dados</h1>
        <p className="auth-text">Isso pode levar alguns minutos. Não feche o programa nem desligue o computador.</p>
        <ol className="import-steps">
          {marks.map(m => (
            <li key={m.phase} className={`import-step import-step--${m.mark}`} aria-current={m.mark === 'agora' ? 'step' : undefined}>
              {m.mark === 'feito' ? <Icon name="check" size={16} /> : m.mark === 'agora' ? <Spinner /> : <span className="import-dot" aria-hidden="true" />}
              <span>{PHASE_LABEL[m.phase]}</span>
              {m.mark === 'agora' && <span className="import-count">{progressCount(view.done, view.total)}</span>}
            </li>
          ))}
        </ol>
        <div className="auth-progress" role="progressbar" aria-label="Andamento do envio" aria-busy="true" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
          <span style={pct === null ? undefined : { width: `${pct}%`, marginLeft: 0, animation: 'none' }} />
        </div>
      </AuthShell>
    );
  }

  if (view.kind === 'concluindo') {
    return (
      <AuthShell>
        <AuthStatusIcon name="nuvem" />
        <h1 className="auth-title">Finalizando</h1>
        <p className="auth-text"><Spinner /> Concluindo o envio e lacrando o arquivo antigo...</p>
      </AuthShell>
    );
  }

  if (view.kind === 'concluido_sem_lacre') {
    return (
      <AuthShell>
        <AuthStatusIcon name="alerta" tone="warning" />
        <h1 className="auth-title">Os dados já estão na internet</h1>
        <p className="auth-text">{view.message}</p>
        <div className="auth-actions"><button type="button" className="btn" onClick={() => { void reloadMembership(); }}>Abrir o OficinaPro</button></div>
      </AuthShell>
    );
  }

  if (view.kind === 'bloqueado') {
    const p = problemLines(view.problems);
    return (
      <AuthShell wide>
        <AuthStatusIcon name="alerta" tone="warning" />
        <h1 className="auth-title">Há dados para consertar antes de enviar</h1>
        <p className="auth-text">{view.message} O arquivo do computador não foi mexido e uma cópia de segurança foi guardada. Conserte estes itens no programa antigo e tente de novo.</p>
        <ul className="import-list" aria-label="Dados com problema">
          {p.lines.map(l => <li key={l}>{l}</li>)}
          {p.more > 0 && <li>... e mais {p.more}.</li>}
        </ul>
        <div className="auth-actions"><button type="button" className="btn" onClick={() => setView({ kind: 'inicio' })}>Tentar de novo</button></div>
      </AuthShell>
    );
  }

  if (view.kind === 'erro') {
    return (
      <AuthShell>
        <AuthStatusIcon name="alerta" tone="danger" />
        <h1 className="auth-title">O envio parou</h1>
        <FieldError>{view.message}</FieldError>
        <p className="auth-text">Nada foi perdido. Enviar de novo é seguro.</p>
        <div className="auth-actions">
          {view.canRetry && <button type="button" className="btn" onClick={() => { void start(); }} disabled={!online}>Tentar de novo</button>}
          <button type="button" className="btn btn-secondary" onClick={() => setView({ kind: 'inicio' })}>Voltar</button>
        </div>
      </AuthShell>
    );
  }

  if (view.kind === 'refazer') {
    return (
      <AuthShell wide>
        <AuthStatusIcon name="alerta" tone="danger" />
        <h1 className="auth-title">Os números não bateram</h1>
        <FieldError>{view.message}</FieldError>
        {view.report && <ReportTable report={view.report} />}
        {view.report && view.report.blockers.length > 0 && <ul className="import-list">{view.report.blockers.map(b => <li key={b}>{b}</li>)}</ul>}
        <p className="auth-text">Nada foi apagado do computador. Você pode tentar de novo ou apagar o que foi enviado e recomeçar.</p>
        {problem && <FieldError>{problem}</FieldError>}
        <div className="auth-actions">
          <button type="button" className="btn" onClick={() => { void start(); }} disabled={!online || busy}>Tentar de novo</button>
          <button type="button" className="btn btn-secondary" onClick={() => setConfirm('apagar')} disabled={busy}>Apagar e recomeçar</button>
        </div>
        {confirm === 'apagar' && <ResetConfirm typed={typed} setTyped={setTyped} busy={busy} onCancel={() => { setConfirm(null); setTyped(''); }} onConfirm={() => { void resetAll(); }} />}
      </AuthShell>
    );
  }

  if (view.kind === 'pronto') {
    const ok = canFinish(view.report);
    return (
      <AuthShell wide>
        <AuthStatusIcon name="check" tone="success" />
        <h1 className="auth-title">Conferência pronta</h1>
        <p className="auth-text">{ok ? 'Tudo igual ao arquivo. Toque em "Concluir" para terminar. O arquivo antigo será lacrado e passa a servir só de cópia.' : 'Há diferenças. Não conclua.'}</p>
        <ReportTable report={view.report} />
        <PhotoNotes report={view.report} />
        <div className="auth-actions">
          <button type="button" className="btn" disabled={!ok || !online} onClick={() => { void conclude(view.session); }}>Concluir</button>
        </div>
      </AuthShell>
    );
  }

  // ---------- início ----------
  return (
    <AuthShell wide>
      <AuthStatusIcon name="nuvem" />
      <h1 className="auth-title">Falta trazer os dados da oficina</h1>
      {interrupted ? (
        <p className="auth-text">Um envio anterior não terminou. Você pode continuar de onde parou ou apagar o que já foi enviado e recomeçar.</p>
      ) : (
        <p className="auth-text">A oficina ainda não tem dados na internet. Envie uma vez o arquivo de dados do computador da oficina. Depois disso, todos passam a usar os dados da internet.</p>
      )}

      {tauri ? (
        <div className="form-group">
          <label className="form-label" htmlFor="import-path">Arquivo do banco neste computador</label>
          <input id="import-path" className="form-input" value={path} onChange={e => setPath(e.target.value)} spellCheck={false} autoComplete="off" />
          <p className="field-hint">O padrão é C:\OficinaData\database.json. Só mude se os dados ficam em outra pasta.</p>
        </div>
      ) : (
        <p className="import-warn" role="note"><Icon name="computador" size={16} /> Enviar o banco só funciona no computador da oficina, com o OficinaPro instalado. Abra o programa lá e entre com a sua conta.</p>
      )}
      {!online && <p className="field-hint">Sem internet no momento.</p>}
      {problem && <FieldError>{problem}</FieldError>}

      <div className="auth-actions">
        {tauri && !interrupted && <button type="button" className="btn" disabled={!online || busy} onClick={() => { void start(); }}>Enviar banco para a nuvem</button>}
        {tauri && interrupted && <button type="button" className="btn" disabled={!online || busy} onClick={() => { void start(); }}>Continuar envio</button>}
        {interrupted && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setConfirm('apagar'); setProblem(null); }}>Apagar e recomeçar</button>}
        {!interrupted && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setConfirm('vazio'); setProblem(null); }}>Começar sem dados</button>}
      </div>

      {confirm === 'apagar' && <ResetConfirm typed={typed} setTyped={setTyped} busy={busy} onCancel={() => { setConfirm(null); setTyped(''); }} onConfirm={() => { void resetAll(); }} />}
      {confirm === 'vazio' && (
        <div className="import-confirm" role="alertdialog" aria-label="Começar sem dados">
          <p className="auth-text"><strong>Começar a oficina sem nenhum dado?</strong> Depois disso não dá mais para trazer o arquivo antigo para a internet.</p>
          <div className="auth-actions">
            <button type="button" className="btn" disabled={busy || !online} onClick={() => { void startEmpty(); }}>{busy ? <><Spinner /> Aguarde...</> : 'Sim, começar sem dados'}</button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirm(null)}>Voltar</button>
          </div>
        </div>
      )}

      <div className="auth-foot">
        <button type="button" className="btn-ghost btn-sm" onClick={() => { void signOut(); }}>Sair deste aparelho</button>
      </div>
    </AuthShell>
  );
};

const ResetConfirm: React.FC<{
  typed: string; setTyped: (v: string) => void; busy: boolean; onCancel: () => void; onConfirm: () => void;
}> = ({ typed, setTyped, busy, onCancel, onConfirm }) => (
  <div className="import-confirm" role="alertdialog" aria-label="Apagar e recomeçar">
    <p className="auth-text"><strong>Isso apaga tudo que já foi enviado para a internet por esta importação.</strong> O arquivo deste computador não é mexido. Para confirmar, escreva APAGAR.</p>
    <input className="form-input" aria-label="Escreva APAGAR para confirmar" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" />
    <div className="auth-actions">
      <button type="button" className="btn btn-danger" disabled={busy || !confirmsReset(typed)} onClick={onConfirm}>{busy ? <><Spinner /> Apagando...</> : 'Apagar e recomeçar'}</button>
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>Voltar</button>
    </div>
  </div>
);

/** Tela para quem não é Dono enquanto o Dono traz os dados (docs/NUVEM-PR9.md). */
export const PreparingScreen: React.FC = () => {
  const { reloadMembership, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const reload = async (): Promise<void> => { setBusy(true); try { await reloadMembership(); } finally { setBusy(false); } };
  return (
    <AuthShell>
      <AuthStatusIcon name="nuvem" />
      <h1 className="auth-title">Preparando os dados</h1>
      <p className="auth-text">O Dono está trazendo os dados para a nuvem. Aguarde.</p>
      <div className="auth-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => { void reload(); }}>{busy ? <><Spinner /> Verificando...</> : 'Recarregar'}</button>
      </div>
      <div className="auth-foot"><button type="button" className="btn-ghost btn-sm" onClick={() => { void signOut(); }}>Sair deste aparelho</button></div>
    </AuthShell>
  );
};
