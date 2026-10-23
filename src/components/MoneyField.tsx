import React, { useEffect, useRef, useState } from 'react';
import { centsToMoneyText, sanitizeMoneyText } from '../services/osModalView';

interface MoneyFieldProps {
  id?: string;
  /** Valor em centavos (undefined = vazio). */
  value: number | undefined;
  /** Texto digitado vira centavos (ou undefined = vazio). Mesma regra de antes da troca por campo de texto. */
  parse: (raw: string) => number | undefined;
  onChange: (cents: number | undefined) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  title?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
}

/**
 * Campo de dinheiro em texto (aceita vírgula em qualquer idioma do sistema, teclado decimal no celular).
 * Guarda o texto digitado ("12," não vira "12" no meio da digitação) e só reescreve quando o valor muda por fora.
 */
export const MoneyField: React.FC<MoneyFieldProps> = ({ value, parse, onChange, ...rest }) => {
  const [text, setText] = useState(() => (value === undefined ? '' : centsToMoneyText(value)));
  const parseRef = useRef(parse);
  parseRef.current = parse;
  useEffect(() => {
    setText(prev => (parseRef.current(prev) === value ? prev : value === undefined ? '' : centsToMoneyText(value)));
  }, [value]);
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={e => {
        const t = sanitizeMoneyText(e.target.value);
        setText(t);
        onChange(parse(t));
      }}
    />
  );
};
