import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { WorkOrder } from '../types';
import { Icon } from '../components/ui/Icon';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useTopmostEscape } from '../hooks/useTopmostEscape';
import { DocKind, DocOptions } from '../services/documents';
import { useToast } from '../context/ToastContext';
import { PICKER_LIMIT, SavedPdf, listPickerOrders, pickerOrderLabel } from '../services/documentsView';
import { DEFAULT_SUMMARY_CHOICE, SummaryChoice, countInspectedItems, needsSummaryChoice } from '../services/serviceSummaryView';
import { isPdfAvailable } from '../utils/documentOutput';

// Janela única de documentos: escolhe a OS (se ainda não veio escolhida), o documento e então imprime ou salva em PDF.

export type DocOutputMode = 'print' | 'pdf';

type DocChoice = 'OS' | 'OS_CLIENTE' | 'OS_OFICINA' | 'RESUMO' | 'CHECKLIST';

const CHOICES: { id: DocChoice; label: string; hint?: string }[] = [
  { id: 'OS', label: 'OS via geral (as duas assinaturas)' },
  { id: 'OS_CLIENTE', label: 'OS via do cliente', hint: 'Assina a oficina' },
  { id: 'OS_OFICINA', label: 'OS via da oficina', hint: 'Assina o cliente' },
  { id: 'RESUMO', label: 'Resumo do serviço' },
  { id: 'CHECKLIST', label: 'Checklist de vistoria' },
];

interface DocumentsModalProps {
  isOpen: boolean;
  /** OS já escolhida (pelo menu do cartão). Vazio: a janela começa pelo seletor de OS. */
  osId: string | null;
  workOrders: WorkOrder[];
  onClose: () => void;
  /** Gera o documento e cuida dos avisos (toasts). Em PDF salvo devolve o arquivo, que a janela mostra com "Abrir pasta". */
  onGenerate: (os: WorkOrder, kind: DocKind, mode: DocOutputMode, opts: DocOptions) => Promise<SavedPdf | null>;
  /** Mostra o PDF salvo no Explorador (cai para a pasta se o arquivo sumiu). */
  onOpenSaved: (path: string) => void;
}

export const DocumentsModal: React.FC<DocumentsModalProps> = ({ isOpen, osId, workOrders, onClose, onGenerate, onOpenSaved }) => {
  const { addToast } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const firstOptionRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(osId);
  const [query, setQuery] = useState('');
  const [choice, setChoice] = useState<DocChoice>('OS');
  const [summaryChoice, setSummaryChoice] = useState<SummaryChoice>(DEFAULT_SUMMARY_CHOICE);
  const [checklistMode, setChecklistMode] = useState<'full' | 'summary'>('full');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<SavedPdf | null>(null);
  const pdfOk = isPdfAvailable();
  useFocusTrap(isOpen, dialogRef);
  useTopmostEscape(isOpen, onClose);

  const os = useMemo(() => workOrders.find(o => o.id === selectedId) ?? null, [workOrders, selectedId]);
  const results = useMemo(() => listPickerOrders(workOrders, query), [workOrders, query]);

  // Ao abrir, volta ao estado inicial.
  useEffect(() => {
    if (!isOpen) return;
    setSelectedId(osId);
    setQuery('');
    setChoice('OS');
    setSummaryChoice(DEFAULT_SUMMARY_CHOICE);
    setChecklistMode('full');
    setBusy(false);
    setSaved(null);
    // Reinicia só ao abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Foco no que importa em cada etapa: busca no seletor, primeira opção na lista de documentos.
  useEffect(() => {
    if (!isOpen) return;
    (os ? firstOptionRef : searchRef).current?.focus();
  }, [isOpen, os?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Outra OS: as escolhas de vistoria dependem dos itens marcados dela.
  const inspected = os ? countInspectedItems(os) : 0;
  const askSummary = os ? needsSummaryChoice(os) : false;
  useEffect(() => {
    if (inspected === 0) setChecklistMode('full');
  }, [inspected, os?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const kind: DocKind = choice === 'CHECKLIST' && checklistMode === 'summary' ? 'CHECKLIST_RESUMIDO' : choice;

  const run = async (mode: DocOutputMode) => {
    if (busy || !os) return;
    setBusy(true);
    setSaved(null);
    try {
      const res = await onGenerate(os, kind, mode, choice === 'RESUMO' ? { summaryChoice } : {});
      if (res) setSaved(res);
      // A impressão abre o diálogo do sistema sem avisar quando termina: segura o botão um instante.
      if (mode === 'print') await new Promise<void>(r => setTimeout(r, 800));
    } catch (e) {
      console.error('Erro ao gerar o documento:', e);
      addToast('Não foi possível montar o documento. Tente de novo.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const canChangeOS = osId === null;

  return (
    <div className="modal-overlay choice-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal-content docm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="docm-head">
          <h2 id={titleId} className="docm-title"><Icon name="imprimir" size={24} /> Documentos</h2>
          <button type="button" className="btn-secondary docm-close" onClick={onClose}>
            <Icon name="fechar" size={18} /> Fechar
          </button>
        </div>

        {!os ? (
          <div className="docm-picker">
            <label className="form-label" htmlFor="docm-search">De qual OS é o documento?</label>
            <input
              id="docm-search"
              ref={searchRef}
              className="form-input"
              type="search"
              autoComplete="off"
              placeholder="Número, cliente, modelo ou placa"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {results.length === 0 ? (
              <p className="docm-empty" role="status">Nenhuma OS encontrada.</p>
            ) : (
              <ul className="docm-list" aria-label="Ordens de serviço">
                {results.slice(0, PICKER_LIMIT).map(o => (
                  <li key={o.id}>
                    <button type="button" className="docm-os" onClick={() => setSelectedId(o.id)}>
                      {pickerOrderLabel(o)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {results.length > PICKER_LIMIT && (
              <p className="cfg-help">Mostrando as {PICKER_LIMIT} mais recentes. Digite na busca para achar outra.</p>
            )}
          </div>
        ) : (
          <>
            <div className="docm-os-line">
              <span className="docm-os-name">{pickerOrderLabel(os)}</span>
              {canChangeOS && (
                <button type="button" className="btn-secondary docm-change" onClick={() => setSelectedId(null)} disabled={busy}>
                  <Icon name="voltar" size={16} /> Trocar OS
                </button>
              )}
            </div>

            <fieldset className="docm-options">
              <legend className="form-label">Qual documento?</legend>
              {CHOICES.map((c, i) => (
                <React.Fragment key={c.id}>
                  <label className="csm-choice-row docm-row">
                    <input
                      ref={i === 0 ? firstOptionRef : undefined}
                      type="radio"
                      name="docm-kind"
                      checked={choice === c.id}
                      onChange={() => setChoice(c.id)}
                    />
                    <span>{c.label}{c.hint ? <span className="docm-hint"> ({c.hint})</span> : null}</span>
                  </label>

                  {c.id === 'RESUMO' && choice === 'RESUMO' && askSummary && (
                    <div className="docm-sub">
                      <label className="csm-choice-row">
                        <input
                          type="checkbox"
                          checked={summaryChoice.includeInspection}
                          onChange={(e) => setSummaryChoice(s => ({ ...s, includeInspection: e.target.checked }))}
                        />
                        <span>Incluir itens da vistoria</span>
                      </label>
                      {summaryChoice.includeInspection && (
                        <label className="csm-choice-row csm-choice-sub">
                          <input
                            type="checkbox"
                            checked={summaryChoice.includeGeneralNote}
                            onChange={(e) => setSummaryChoice(s => ({ ...s, includeGeneralNote: e.target.checked }))}
                          />
                          <span>Incluir também a nota geral da vistoria</span>
                        </label>
                      )}
                    </div>
                  )}

                  {c.id === 'CHECKLIST' && choice === 'CHECKLIST' && (
                    <div className="docm-sub" role="radiogroup" aria-label="Como imprimir a vistoria">
                      <label className="csm-choice-row">
                        <input
                          type="radio"
                          name="docm-checklist"
                          checked={checklistMode === 'full'}
                          onChange={() => setChecklistMode('full')}
                        />
                        <span>Completo (todos os itens, para marcar à mão)</span>
                      </label>
                      <label className={`csm-choice-row${inspected === 0 ? ' docm-disabled' : ''}`}>
                        <input
                          type="radio"
                          name="docm-checklist"
                          checked={checklistMode === 'summary'}
                          disabled={inspected === 0}
                          onChange={() => setChecklistMode('summary')}
                        />
                        <span>Só os marcados{inspected === 0 ? ' (nenhum item marcado ainda)' : ` (${inspected} itens)`}</span>
                      </label>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </fieldset>

            <div className="docm-actions">
              <button
                type="button"
                className="btn btn-secondary choice-btn"
                disabled={busy}
                onClick={(e) => { if (e.detail > 1) return; void run('print'); }}
              >
                <Icon name="imprimir" size={22} />
                <span>Imprimir</span>
              </button>
              <button
                type="button"
                className="btn btn-success choice-btn"
                disabled={busy || !pdfOk}
                aria-describedby={pdfOk ? undefined : 'docm-pdf-note'}
                onClick={(e) => { if (e.detail > 1) return; void run('pdf'); }}
              >
                <Icon name="salvar" size={22} />
                <span>{busy ? 'Aguarde...' : 'Salvar PDF'}</span>
              </button>
            </div>
            {saved && (
              <div className="docm-saved" role="status" aria-live="polite">
                <span className="docm-saved-text">PDF salvo: {saved.fileName}</span>
                <button type="button" className="btn-secondary" onClick={() => onOpenSaved(saved.path)}>
                  <Icon name="arquivo" size={18} /> Abrir pasta
                </button>
              </div>
            )}
            {!pdfOk && <p id="docm-pdf-note" className="cfg-help docm-note">Salvar PDF: só funciona no programa instalado.</p>}
          </>
        )}
      </div>
    </div>
  );
};
