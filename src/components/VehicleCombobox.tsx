import React, { useCallback, useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Client, Vehicle, WorkOrder } from '../types';
import type { VehicleCatalog } from '../services/vehicleCatalog';
import type { VehicleSuggestion } from '../services/vehicleSearch';
import { buildVehicleSuggestions, collectShopVehicles, type ShopVehicle } from '../services/vehicleSearch';
import { getVehicleIndex, loadVehicleIndex } from '../services/vehicleIndex';
import {
  decideEnter, flattenOptions, highlightParts, limitGroups, queryOf, resolvePick, suggestionWithYear, valueAfterPick,
} from '../services/vehicleField';

/** Veículos já usados na oficina (cadastro e OS), calculado uma vez por tela. */
export const useShopVehicles = (clients: ReadonlyArray<Pick<Client, 'vehicles'>>, workOrders?: ReadonlyArray<Pick<WorkOrder, 'vehicle'>>): ShopVehicle[] =>
  useMemo(() => collectShopVehicles(clients, workOrders ?? []), [clients, workOrders]);

const MAX_VISIBLE = 14;

interface VehicleComboboxProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Veículos do cliente escolhido; aparecem primeiro. */
  clientVehicles?: ReadonlyArray<Pick<Vehicle, 'model' | 'plate'>>;
  shopVehicles?: ReadonlyArray<ShopVehicle>;
  /** Campo "modelo - PLACA" em um só texto: a busca usa só o modelo e a placa é preservada ao escolher. */
  plateAware?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
}

const Highlighted: React.FC<{ text: string; query: string }> = ({ text, query }) => (
  <>
    {highlightParts(text, query).map((p, i) => (p.match ? <mark key={i} className="vcb-mark">{p.text}</mark> : <React.Fragment key={i}>{p.text}</React.Fragment>))}
  </>
);

export const VehicleCombobox: React.FC<VehicleComboboxProps> = ({
  id, value, onChange, clientVehicles, shopVehicles, plateAware = false, placeholder, ariaLabel, className = 'form-input', style, onFocus,
}) => {
  const uid = useId();
  const listId = `${uid}-list`;
  const optId = (i: number) => `${uid}-opt-${i}`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [index, setIndex] = useState<VehicleCatalog | null>(getVehicleIndex);
  const mounted = useRef(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const lastPointer = useRef('');
  // Segundo passo: anos da versão escolhida. `yearActive` 0..years.length; o último item é "Sem ano".
  const [step, setStep] = useState<{ suggestion: VehicleSuggestion; years: number[] } | null>(null);
  const [yearActive, setYearActive] = useState(0);
  const [pos, setPos] = useState<React.CSSProperties>({});

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const ensureIndex = useCallback(() => {
    if (index) return;
    void loadVehicleIndex().then(i => { if (i && mounted.current) setIndex(i); });
  }, [index]);

  const knownPlates = useMemo(() => (clientVehicles ?? []).map(v => v.plate), [clientVehicles]);
  const query = queryOf(value, plateAware);
  const deferredQuery = useDeferredValue(query);

  const groups = useMemo(() => limitGroups(
    buildVehicleSuggestions({ query: deferredQuery, clientVehicles, shopVehicles, index }), MAX_VISIBLE
  ), [deferredQuery, clientVehicles, shopVehicles, index]);
  const options = useMemo(() => flattenOptions(groups), [groups]);

  // Lista nova: nada destacado até o usuário navegar.
  useEffect(() => { setActive(-1); }, [groups]);

  useEffect(() => {
    if (active < 0) return;
    document.getElementById(`${uid}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, uid]);

  const finish = (s: VehicleSuggestion) => {
    onChange(valueAfterPick(value, s, plateAware, knownPlates));
    setStep(null);
    setOpen(false);
    setActive(-1);
  };

  // Versão da base sem ano abre o seletor de anos; o resto preenche direto.
  const choose = (s: VehicleSuggestion) => {
    const r = resolvePick(s);
    if (r.kind === 'direct') { finish(r.suggestion); return; }
    setStep({ suggestion: r.suggestion, years: r.years });
    setYearActive(0);
  };

  const pick = (i: number) => {
    const o = options[i];
    if (o) choose(o.suggestion);
  };

  const pickYear = (i: number) => {
    if (!step) return;
    finish(suggestionWithYear(step.suggestion, step.years[i]));
  };

  const backToModels = () => setStep(null);

  useEffect(() => {
    if (!step) return;
    document.getElementById(`${uid}-year-${yearActive}`)?.scrollIntoView({ block: 'nearest' });
  }, [step, yearActive, uid]);

  const handleStepKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, st: { suggestion: VehicleSuggestion; years: number[] }) => {
    const n = st.years.length + 1; // anos + "Sem ano"
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setYearActive(a => (a + 1) % n); break;
      case 'ArrowUp': e.preventDefault(); setYearActive(a => (a <= 0 ? n - 1 : a - 1)); break;
      case 'Home': e.preventDefault(); setYearActive(0); break;
      case 'End': e.preventDefault(); setYearActive(n - 1); break;
      case 'Enter': e.preventDefault(); pickYear(yearActive); break;
      case 'ArrowLeft':
      case 'Backspace':
        e.preventDefault(); backToModels(); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); backToModels(); break;
      case 'Tab': setStep(null); setOpen(false); break;
      default:
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (step) { handleStepKeyDown(e, step); return; }
    const n = options.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        ensureIndex();
        if (!open) { setOpen(true); return; }
        if (n) setActive(a => (a + 1) % n);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) { setOpen(true); return; }
        if (n) setActive(a => (a <= 0 ? n - 1 : a - 1));
        break;
      case 'Home':
        if (open && active >= 0 && n) { e.preventDefault(); setActive(0); }
        break;
      case 'End':
        if (open && active >= 0 && n) { e.preventDefault(); setActive(n - 1); }
        break;
      case 'Enter': {
        if (!open) return; // lista fechada: Enter segue o comportamento normal do formulário
        e.preventDefault();
        const d = decideEnter(options, active, query, index);
        if (d.kind === 'pick') { choose(d.suggestion); return; }
        setOpen(false);
        setActive(-1);
        break;
      }
      case 'Escape':
        if (open) {
          e.preventDefault();
          e.stopPropagation(); // fecha só a lista, não a janela em volta
          setOpen(false);
          setActive(-1);
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
    }
  };

  const total = options.length;
  const showList = open && (step !== null || total > 0 || query.trim().length > 0);

  // Lista com position: fixed para não ser cortada por áreas com rolagem; vira para cima se faltar espaço embaixo.
  useLayoutEffect(() => {
    if (!showList) return;
    const place = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      const up = below < 180 && above > below;
      const maxHeight = Math.max(120, Math.min(320, up ? above : below));
      setPos(up
        ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4, maxHeight }
        : { left: r.left, width: r.width, top: r.bottom + 4, maxHeight });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [showList, total, step]);

  return (
    <div className="vcb" ref={wrapRef}>
      <input
        id={id}
        className={className}
        style={style}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? (step ? `${uid}-year-${yearActive}` : active >= 0 ? optId(active) : undefined) : undefined}
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setStep(null); setOpen(true); ensureIndex(); }}
        onFocus={e => { setOpen(true); ensureIndex(); onFocus?.(e); }}
        onBlur={() => { setOpen(false); setActive(-1); setStep(null); }}
        onKeyDown={handleKeyDown}
      />
      {showList && step && (
        <div className="vcb-list" style={pos} onMouseDown={e => e.preventDefault()}>
          <button type="button" tabIndex={-1} className="vcb-back" onClick={backToModels}>
            <span aria-hidden="true">‹</span> {step.suggestion.label} — escolha o ano
          </button>
          <div id={listId} role="listbox" aria-label={`Anos de ${step.suggestion.label}`} className="vcb-years">
            {[...step.years, null].map((y, i) => (
              <div
                key={y ?? 'sem-ano'}
                id={`${uid}-year-${i}`}
                role="option"
                aria-selected={i === yearActive}
                className={`vcb-opt vcb-year${i === yearActive ? ' is-active' : ''}${y === null ? ' vcb-noyear' : ''}`}
                onMouseMove={e => {
                  const at = `${e.clientX},${e.clientY}`;
                  if (at === lastPointer.current) return;
                  lastPointer.current = at;
                  setYearActive(i);
                }}
                onClick={() => pickYear(i)}
              >
                {y ?? 'Sem ano'}
              </div>
            ))}
          </div>
        </div>
      )}
      {showList && !step && (
        // mousedown não pode tirar o foco do campo, ou a lista fecharia antes do clique.
        <div id={listId} role="listbox" aria-label="Sugestões de veículo" className="vcb-list" style={pos} onMouseDown={e => e.preventDefault()}>
          {groups.map(g => (
            <div key={g.id} role="group" aria-labelledby={`${uid}-g-${g.id}`}>
              <div id={`${uid}-g-${g.id}`} className="vcb-group" role="presentation">{g.title}</div>
              {g.options.map(o => (
                <div
                  key={o.index}
                  id={optId(o.index)}
                  role="option"
                  aria-selected={o.index === active}
                  className={`vcb-opt${o.index === active ? ' is-active' : ''}`}
                  onMouseMove={e => {
                    // Só o mouse de verdade destaca: rolar a lista com o teclado move itens sob o ponteiro parado.
                    const at = `${e.clientX},${e.clientY}`;
                    if (at === lastPointer.current) return;
                    lastPointer.current = at;
                    setActive(o.index);
                  }}
                  onClick={() => pick(o.index)}
                >
                  <span className="vcb-label"><Highlighted text={o.suggestion.label} query={deferredQuery} /></span>
                  {o.suggestion.source === 'oficina' && (o.suggestion.count ?? 0) > 1 && (
                    <span className="vcb-meta">{o.suggestion.count}x</span>
                  )}
                  {o.suggestion.source === 'base' && o.suggestion.years && o.suggestion.years.length > 0 && (
                    <span className="vcb-meta">{o.suggestion.years[0]}–{o.suggestion.years[o.suggestion.years.length - 1]}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
          {total === 0 && <div className="vcb-empty">Nenhuma sugestão. O texto digitado será usado como veículo novo.</div>}
        </div>
      )}
      <span className="vcb-sr" role="status" aria-live="polite">{showList ? (step ? `${step.years.length} anos disponíveis` : total ? `${total} sugestões` : 'Nenhuma sugestão') : ''}</span>
    </div>
  );
};
