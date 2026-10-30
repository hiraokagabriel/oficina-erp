import React, { useState, useEffect, useRef } from 'react';
import {
  WorkOrder,
  WorkshopSettings,
  ChecklistSchema,
  InspectionStatus,
  INSPECTION_STATUS_META,
  NEXT_INSPECTION_STATUS,
  createEmptyChecklist,
  migrateChecklist,
} from '../types';
import { printChecklist, selectChecklistForPrint, ChecklistPrintMode } from '../utils/printChecklist';
import { ChecklistPrintChoiceModal } from './ChecklistPrintChoiceModal';
import { useDirtyGuard } from '../hooks/useDirtyGuard';
import { Icon } from '../components/ui/Icon';

interface ChecklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ChecklistSchema) => void;
  os: WorkOrder | null;
  settings?: WorkshopSettings;
}

// Luz de status de cada estado da vistoria (mesmos tokens do Kanban: cor + palavra, nunca só cor).
const STATE_LIGHT: Record<InspectionStatus, string> = {
  pending: 'status-light--arquivado',
  ok: 'status-light--finalizado',
  attention: 'status-light--em-servico',
  urgent: 'status-light--atrasado',
};

export const ChecklistModal: React.FC<ChecklistModalProps> = ({ isOpen, onClose, onSave, os, settings }) => {
  const [checklist, setChecklist] = useState<ChecklistSchema>(createEmptyChecklist());
  const [addingItemTo, setAddingItemTo] = useState<string | null>(null);
  const [newItemLabel, setNewItemLabel] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [printChoiceOpen, setPrintChoiceOpen] = useState(false);
  const newItemInputRef = useRef<HTMLInputElement>(null);
  const newCatInputRef  = useRef<HTMLInputElement>(null);
  // Vistoria como foi carregada: clicar em estado de item não dispara evento de campo, então compara o objeto.
  const baselineRef = useRef<ChecklistSchema | null>(null);

  useEffect(() => {
    if (isOpen && os) {
      const loaded = migrateChecklist(os.checklist);
      baselineRef.current = loaded;
      setChecklist(loaded);
      setAddingItemTo(null);
      setAddingCategory(false);
      setNewItemLabel('');
      setNewCategoryLabel('');
      setPrintChoiceOpen(false);
    }
  }, [isOpen, os]);

  useEffect(() => { if (addingItemTo)   newItemInputRef.current?.focus(); }, [addingItemTo]);
  useEffect(() => { if (addingCategory) newCatInputRef.current?.focus();  }, [addingCategory]);

  // Esc, Cancelar e fechar: perguntam antes de descartar. Salvar Vistoria fecha direto (handleSave).
  const guard = useDirtyGuard({
    active: isOpen,
    onClose,
    isDirty: () => baselineRef.current !== null && checklist !== baselineRef.current,
  });

  if (!isOpen || !os) return null;

  // ---- handlers ----

  const cycleStatus = (catId: string, itemId: string) => {
    setChecklist(prev => ({
      ...prev,
      categories: prev.categories.map(cat =>
        cat.id !== catId ? cat : {
          ...cat,
          items: cat.items.map(item =>
            item.id !== itemId ? item : { ...item, status: NEXT_INSPECTION_STATUS[item.status] }
          ),
        }
      ),
    }));
  };

  const addItem = (catId: string) => {
    const label = newItemLabel.trim();
    if (!label) return;
    setChecklist(prev => ({
      ...prev,
      categories: prev.categories.map(cat =>
        cat.id !== catId ? cat : {
          ...cat,
          items: [...cat.items, { id: `custom-${crypto.randomUUID()}`, label, status: 'pending', custom: true }],
        }
      ),
    }));
    setNewItemLabel('');
    setAddingItemTo(null);
  };

  const removeItem = (catId: string, itemId: string) => {
    setChecklist(prev => ({
      ...prev,
      categories: prev.categories.map(cat =>
        cat.id !== catId ? cat : { ...cat, items: cat.items.filter(i => i.id !== itemId) }
      ),
    }));
  };

  const addCategory = () => {
    const label = newCategoryLabel.trim();
    if (!label) return;
    setChecklist(prev => ({
      ...prev,
      categories: [
        ...prev.categories,
        { id: `custom-cat-${crypto.randomUUID()}`, label, items: [], custom: true },
      ],
    }));
    setNewCategoryLabel('');
    setAddingCategory(false);
  };

  const removeCategory = (catId: string) => {
    setChecklist(prev => ({ ...prev, categories: prev.categories.filter(c => c.id !== catId) }));
  };

  const handleSave = () => {
    onSave({ ...checklist, inspectedAt: new Date().toISOString() });
    onClose();
  };

  const handlePrint = () => {
    if (settings) {
      setPrintChoiceOpen(true);
    } else {
      window.print();
    }
  };

  const confirmPrint = (mode: ChecklistPrintMode) => {
    if (settings) printChecklist(os, checklist, settings, { mode });
    setPrintChoiceOpen(false);
  };

  const printSelection = selectChecklistForPrint(checklist, 'full');

  // Conta itens por status para o resumo do topo
  const counts = checklist.categories
    .flatMap(c => c.items)
    .reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, {} as Record<InspectionStatus, number>);

  return (
    <>
    <div className="modal-overlay checklist-modal-overlay" ref={guard.overlayRef}>
      <div className="modal-content checklist-modal">

        {/* ====== HEADER ====== */}
        <div className="checklist-header">
          <div className="checklist-header-info">
            <h2 className="checklist-title">Vistoria do veículo</h2>
            <span className="checklist-subtitle">{os.vehicle} &mdash; {os.clientName}</span>
          </div>

          <div className="checklist-header-km">
            <label className="checklist-km-label" htmlFor="checklist-km">KM de entrada</label>
            <input
              id="checklist-km"
              type="number"
              className="form-input checklist-km-input"
              value={checklist.mileageIn ?? os.mileage}
              onChange={e => setChecklist(prev => ({ ...prev, mileageIn: parseInt(e.target.value, 10) || 0 }))}
            />
          </div>

          <button type="button" className="btn-icon" onClick={guard.requestClose} title="Fechar" aria-label="Fechar"><Icon name="fechar" size={20} /></button>
        </div>

        {/* ====== LEGENDA + RESUMO ====== */}
        <div className="checklist-legend">
          {(Object.entries(INSPECTION_STATUS_META) as [InspectionStatus, { label: string; color: string; emoji: string }][]).map(([key, meta]) => (
            <span key={key} className={`legend-item status-light ${STATE_LIGHT[key]}`}>
              <span>{meta.label}</span>
              {counts[key] ? <strong>({counts[key]})</strong> : null}
            </span>
          ))}
          <span className="legend-hint">Toque no estado de um item para mudar: Não inspecionado, OK, Necessita trocar, Urgente.</span>
        </div>

        {/* ====== GRID DE CATEGORIAS ====== */}
        <div className="checklist-grid">
          {checklist.categories.map(cat => (
            <div key={cat.id} className="checklist-category">

              <div className="checklist-category-header">
                <span>{cat.label}</span>
                {cat.custom && (
                  <button
                    type="button"
                    className="btn-icon danger"
                    title="Remover categoria"
                    aria-label={`Remover categoria ${cat.label}`}
                    onClick={() => removeCategory(cat.id)}
                  ><Icon name="excluir" size={18} /></button>
                )}
              </div>

              <ul className="checklist-items">
                {cat.items.map(item => {
                  const meta = INSPECTION_STATUS_META[item.status];
                  const next = INSPECTION_STATUS_META[NEXT_INSPECTION_STATUS[item.status]];
                  return (
                    <li key={item.id} className={`checklist-item status-${item.status}`}>
                      <span className="item-label">{item.label}</span>
                      <button
                        type="button"
                        className={`item-state status-light ${STATE_LIGHT[item.status]}`}
                        onClick={() => cycleStatus(cat.id, item.id)}
                        aria-label={`${item.label}: ${meta.label}. Ativar para mudar para ${next.label}`}
                        title={`Mudar para: ${next.label}`}
                      >
                        {meta.label}
                      </button>
                      {item.custom && (
                        <button
                          type="button"
                          className="item-delete btn-icon danger"
                          title="Remover item"
                          aria-label={`Remover item ${item.label}`}
                          onClick={() => removeItem(cat.id, item.id)}
                        ><Icon name="excluir" size={16} /></button>
                      )}
                    </li>
                  );
                })}

                {cat.items.length === 0 && (
                  <li className="checklist-empty-cat">Nenhum item ainda</li>
                )}
              </ul>

              {addingItemTo === cat.id ? (
                <div className="add-item-row">
                  <input
                    ref={newItemInputRef}
                    className="form-input"
                    placeholder="Nome do item..."
                    aria-label={`Nome do novo item em ${cat.label}`}
                    value={newItemLabel}
                    onChange={e => setNewItemLabel(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') addItem(cat.id);
                      // Esc aqui só sai do campo: não fecha a vistoria inteira.
                      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAddingItemTo(null); setNewItemLabel(''); }
                    }}
                  />
                  <button type="button" className="btn-sm" onClick={() => addItem(cat.id)}><Icon name="check" size={16} /> Adicionar</button>
                  <button type="button" className="btn-sm btn-secondary" onClick={() => { setAddingItemTo(null); setNewItemLabel(''); }}>Cancelar</button>
                </div>
              ) : (
                <button
                  className="add-item-btn"
                  onClick={() => { setAddingItemTo(cat.id); setNewItemLabel(''); }}
                >
                  <Icon name="adicionar" size={16} /> Novo item
                </button>
              )}
            </div>
          ))}
        </div>

        {/* ====== NOVA CATEGORIA ====== */}
        <div className="checklist-add-category">
          {addingCategory ? (
            <div className="add-item-row">
              <input
                ref={newCatInputRef}
                className="form-input"
                placeholder="Nome da categoria..."
                aria-label="Nome da nova categoria"
                value={newCategoryLabel}
                onChange={e => setNewCategoryLabel(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addCategory();
                  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAddingCategory(false); setNewCategoryLabel(''); }
                }}
              />
              <button type="button" className="btn-sm" onClick={addCategory}><Icon name="check" size={16} /> Adicionar</button>
              <button type="button" className="btn-sm btn-secondary" onClick={() => { setAddingCategory(false); setNewCategoryLabel(''); }}>Cancelar</button>
            </div>
          ) : (
            <button type="button" className="btn-ghost" onClick={() => setAddingCategory(true)}><Icon name="adicionar" size={16} /> Nova categoria</button>
          )}
        </div>

        {/* ====== OBSERVAÇÕES ====== */}
        <div className="checklist-notes-section">
          <label className="form-label" htmlFor="checklist-notes">Observações</label>
          <textarea
            id="checklist-notes"
            className="form-input form-textarea"
            placeholder="Riscos, amassados, observações adicionais..."
            value={checklist.notes}
            onChange={e => setChecklist(prev => ({ ...prev, notes: e.target.value }))}
            rows={2}
          />
        </div>

        {/* ====== AÇÕES ====== */}
        <div className="modal-actions checklist-actions">
          <button type="button" className="btn-ghost checklist-print-btn" onClick={handlePrint} title="Imprimir vistoria">
            <Icon name="imprimir" size={18} /> Imprimir
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn-secondary" onClick={guard.requestClose}>Cancelar</button>
          <button type="button" className="btn" onClick={handleSave}><Icon name="salvar" size={18} /> Salvar vistoria</button>
        </div>

      </div>
    </div>
    {guard.dialog}
    <ChecklistPrintChoiceModal
      isOpen={printChoiceOpen}
      total={printSelection.total}
      inspected={printSelection.inspected}
      onClose={() => setPrintChoiceOpen(false)}
      onConfirm={confirmPrint}
    />
    </>
  );
};
