import React, { useEffect, useRef, useState } from 'react';
import { centsToMoneyText, MONEY_INVALID_MESSAGE, MoneyFieldKind, parseMoneyField, parseMoneyText, sanitizeMoneyText } from '../services/osModalView';

interface MoneyFieldProps {
  /** Obrigatório: serve para o foco e para a mensagem de erro (`${id}-error`). */
  id: string;
  /** Valor em centavos (undefined = vazio). */
  value: number | undefined;
  /** price: vazio = 0; cost: vazio = sem custo; optional: vazio = sem valor. */
  kind: MoneyFieldKind;
  /** Só é chamado com texto válido: texto inválido nunca muda o valor gravado. */
  onChange: (cents: number | undefined) => void;
  /** Avisa quando o texto passa a ser (ou deixa de ser) inválido; false ao sair da tela. */
  onInvalidChange?: (id: string, invalid: boolean) => void;
  /** Mostra o erro mesmo sem ter saído do campo (tentativa de salvar). */
  showError?: boolean;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  title?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

/**
 * Campo de dinheiro em texto (formato pt-BR "1.234,50", teclado decimal no celular).
 * Guarda o texto digitado ("12," não vira "12" no meio da digitação), só reescreve quando o valor muda por fora
 * e normaliza o texto ao sair do campo. Texto inválido: aria-invalid + mensagem, e o valor salvo não muda.
 */
export const MoneyField: React.FC<MoneyFieldProps> = ({
  id, value, kind, onChange, onInvalidChange, showError, 'aria-describedby': describedBy, ...rest
}) => {
  const [text, setText] = useState(() => (value === undefined ? '' : centsToMoneyText(value)));
  const [touched, setTouched] = useState(false);
  const kindRef = useRef(kind);
  kindRef.current = kind;
  const notifyRef = useRef(onInvalidChange);
  notifyRef.current = onInvalidChange;

  useEffect(() => {
    setText(prev => {
      const r = parseMoneyField(kindRef.current, prev);
      return r.ok && r.value === value ? prev : value === undefined ? '' : centsToMoneyText(value);
    });
  }, [value]);

  const invalid = !parseMoneyField(kind, text).ok;
  useEffect(() => { notifyRef.current?.(id, invalid); }, [id, invalid]);
  useEffect(() => () => notifyRef.current?.(id, false), [id]);

  const shown = invalid && (touched || !!showError);
  const errId = `${id}-error`;
  return (
    <>
      <input
        {...rest}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        aria-invalid={shown ? true : undefined}
        aria-describedby={shown ? (describedBy ? `${describedBy} ${errId}` : errId) : describedBy}
        onChange={e => {
          const t = sanitizeMoneyText(e.target.value);
          setText(t);
          const r = parseMoneyField(kind, t);
          if (r.ok) onChange(r.value);
        }}
        onBlur={() => {
          setTouched(true);
          const p = parseMoneyText(text);
          if (p.status === 'ok') setText(centsToMoneyText(p.cents));
        }}
      />
      {shown && <p id={errId} className="field-error" role="alert" style={{ flex: '1 1 100%' }}>{MONEY_INVALID_MESSAGE}</p>}
    </>
  );
};
