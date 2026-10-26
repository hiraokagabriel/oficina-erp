import React, { useEffect, useRef, useState } from 'react';
import { MoneyField } from './MoneyField';
import { Icon } from './ui/Icon';
import {
  AdvanceRow, advanceRowError, advanceTotals, removeAdvanceRow, upsertAdvanceRow,
} from '../services/advancesDraft';

interface AdvancesListProps {
  rows: AdvanceRow[];
  onChange: (rows: AdvanceRow[]) => void;
  /** Total da OS em centavos (para o restante e o aviso). */
  total: number;
  /** Hoje, 'AAAA-MM-DD' local: data padrão e limite (sem data futura). */
  today: string;
  formatMoney: (val: number) => string;
  /** OS finalizada/travada: só leitura, com aviso. */
  locked?: boolean;
  /** Chamado a cada ação que muda o rascunho. */
  onDirty: () => void;
  /** Avisa se há uma linha em edição ainda não confirmada. */
  onEditingChange?: (editing: boolean) => void;
  /** Muda a cada tentativa de salvar a OS com a linha aberta: mostra o lembrete e foca a linha. */
  attention?: number;
}

const br = (d: string) => d.split('-').reverse().join('/');

interface Editor { key: string; id?: string; date: string; cents: number | undefined; error?: string }

/** Adiantamentos da OS em rascunho local: nada vai ao caixa até salvar a OS. */
export const AdvancesList: React.FC<AdvancesListProps> = ({
  rows, onChange, total, today, formatMoney, locked, onDirty, onEditingChange, attention,
}) => {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [moneyBad, setMoneyBad] = useState(false);
  const [showMoney, setShowMoney] = useState(false);
  const [reminder, setReminder] = useState(false);
  const counter = useRef(0);
  const addRef = useRef<HTMLButtonElement>(null);
  const focusAdd = useRef(false);
  const focusKey = useRef<string | null>(null);

  const totals = advanceTotals(rows, total);

  useEffect(() => { onEditingChange?.(!!editor); }, [editor, onEditingChange]);
  useEffect(() => () => onEditingChange?.(false), [onEditingChange]);

  useEffect(() => {
    if (!attention) return;
    setReminder(true);
    document.getElementById('os-adv-date')?.focus();
  }, [attention]);

  // Foco depois de adicionar, salvar, cancelar ou remover.
  useEffect(() => {
    if (editor) return;
    if (focusKey.current) {
      document.querySelector<HTMLElement>(`[data-adv-edit="${CSS.escape(focusKey.current)}"]`)?.focus();
      focusKey.current = null;
    } else if (focusAdd.current) {
      addRef.current?.focus();
    }
    focusAdd.current = false;
  });

  const openEditor = (row?: AdvanceRow) => {
    setConfirmKey(null); setMoneyBad(false); setShowMoney(false); setReminder(false);
    counter.current += 1;
    setEditor(row
      ? { key: row.key, id: row.id, date: row.date, cents: row.amount }
      : { key: `novo-${counter.current}`, date: today, cents: undefined });
  };

  const cancelEditor = () => {
    const key = editor?.key;
    setEditor(null); setReminder(false);
    if (key && rows.some(r => r.key === key)) focusKey.current = key; else focusAdd.current = true;
  };

  const saveEditor = () => {
    if (!editor) return;
    if (moneyBad) { setShowMoney(true); document.getElementById('os-adv-amount')?.focus(); return; }
    const error = advanceRowError({ date: editor.date, amount: editor.cents }, today);
    if (error) {
      setEditor({ ...editor, error });
      document.getElementById(/data/i.test(error) ? 'os-adv-date' : 'os-adv-amount')?.focus();
      return;
    }
    onDirty();
    onChange(upsertAdvanceRow(rows, { key: editor.key, id: editor.id, date: editor.date, amount: editor.cents as number }));
    setEditor(null); setReminder(false);
    focusKey.current = editor.key;
  };

  const confirmRemove = (key: string) => {
    onDirty();
    onChange(removeAdvanceRow(rows, key));
    setConfirmKey(null);
    focusAdd.current = true;
  };

  const dateErr = editor?.error && /data/i.test(editor.error) ? editor.error : undefined;
  const amountErr = editor?.error && !dateErr ? editor.error : undefined;

  const editorRow = (
    <li key="editor" className="osm-adv-item osm-adv-form" aria-label="Dados do adiantamento">
      <div className="osm-adv-field">
        <label className="form-label" htmlFor="os-adv-date">Data</label>
        <input id="os-adv-date" type="date" className="form-input" value={editor?.date ?? ''} max={today}
          aria-invalid={dateErr ? true : undefined} aria-describedby={dateErr ? 'os-adv-date-error' : undefined}
          onChange={e => { setReminder(false); setEditor(prev => (prev ? { ...prev, date: e.target.value, error: undefined } : prev)); }} />
        {dateErr && <p id="os-adv-date-error" className="field-error" role="alert">{dateErr}</p>}
      </div>
      <div className="osm-adv-field">
        <label className="form-label" htmlFor="os-adv-amount">Valor</label>
        <MoneyField id="os-adv-amount" kind="optional" className="form-input" value={editor?.cents}
          onChange={c => { setReminder(false); setEditor(prev => (prev ? { ...prev, cents: c, error: undefined } : prev)); }}
          onInvalidChange={(_id, bad) => setMoneyBad(bad)} showError={showMoney}
          placeholder="Ex: 200,00" aria-describedby={amountErr ? 'os-adv-amount-error' : undefined}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEditor(); } }} />
        {amountErr && <p id="os-adv-amount-error" className="field-error" role="alert">{amountErr}</p>}
      </div>
      <div className="osm-adv-actions">
        <button type="button" className="btn btn-sm osm-adv-save" onClick={saveEditor}><Icon name="check" size={16} /> Salvar</button>
        <button type="button" className="btn-secondary btn-sm" onClick={cancelEditor}>Cancelar</button>
      </div>
      {reminder && <p className="field-error osm-adv-reminder" role="alert">Salve ou cancele este adiantamento antes de salvar a OS.</p>}
    </li>
  );

  const items: React.ReactNode[] = [];
  let editorShown = false;
  for (const r of rows) {
    if (editor && editor.key === r.key) { items.push(editorRow); editorShown = true; continue; }
    const label = `${br(r.date)}, ${formatMoney(r.amount)}`;
    items.push(
      <li key={r.key} className="osm-adv-item">
        <span className="osm-adv-text"><span className="osm-adv-date">{br(r.date)}</span> · <strong>{formatMoney(r.amount)}</strong></span>
        {!locked && confirmKey === r.key ? (
          <span className="osm-adv-confirm" role="group" aria-label={`Remover o adiantamento de ${label}?`}>
            <span className="osm-adv-ask">Remover este adiantamento?</span>
            <button type="button" className="btn-danger btn-sm" autoFocus onClick={() => confirmRemove(r.key)}>Sim</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => { setConfirmKey(null); focusKey.current = r.key; }}>Não</button>
          </span>
        ) : !locked && (
          <span className="osm-adv-actions">
            <button type="button" className="btn-secondary btn-sm" data-adv-edit={r.key} aria-label={`Editar adiantamento de ${label}`}
              onClick={() => openEditor(r)}><Icon name="editar" size={16} /> Editar</button>
            <button type="button" className="btn-secondary btn-sm osm-adv-del" aria-label={`Remover adiantamento de ${label}`}
              onClick={() => { setEditor(null); setConfirmKey(r.key); }}><Icon name="excluir" size={16} /> Remover</button>
          </span>
        )}
      </li>,
    );
  }
  if (editor && !editorShown) items.push(editorRow);

  return (
    <div className="osm-adv" role="group" aria-labelledby="os-adv-title">
      <div id="os-adv-title" className="form-label">Adiantamentos <span className="osm-opt">(opcional)</span></div>
      {locked && (
        <p className="osm-adv-locked field-hint" role="note"><Icon name="info" size={16} /> Esta OS já foi finalizada. Para mudar, reabra a OS.</p>
      )}
      {rows.length === 0 && !editor && (
        <p className="field-hint">{locked ? 'Nenhum adiantamento nesta OS.' : 'Use só se o cliente já deixou algum valor. Nenhum adiantamento por enquanto.'}</p>
      )}
      {items.length > 0 && <ul className="osm-adv-list">{items}</ul>}
      {!locked && !editor && (
        <button type="button" ref={addRef} className="btn-secondary osm-adv-add" onClick={() => openEditor()}>
          <Icon name="adicionar" size={16} /> Adicionar adiantamento
        </button>
      )}
      <div className="osm-adv-totals" aria-live="polite" aria-atomic="true">
        {rows.length > 0 && (<>
          <div><span className="osm-k">Total adiantado:</span> <strong className="osm-v">{formatMoney(totals.sum)}</strong></div>
          <div><span className="osm-k">Restante a pagar:</span> <strong className="osm-v">{formatMoney(totals.remaining)}</strong></div>
        </>)}
      </div>
      {totals.exceeds && (
        <div className="osm-alert osm-adv-warn" role="status">
          <Icon name="alerta" size={16} /> A soma dos adiantamentos é maior que o total da OS.
        </div>
      )}
    </div>
  );
};
