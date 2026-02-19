import React, { useState, useEffect, useRef } from 'react';
import {
  WorkOrder,
  ChecklistSchema,
  InspectionStatus,
  INSPECTION_STATUS_META,
  NEXT_INSPECTION_STATUS,
  createEmptyChecklist,
  migrateChecklist,
} from '../types';

interface ChecklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ChecklistSchema) => void;
  os: WorkOrder | null;
}

export const ChecklistModal: React.FC<ChecklistModalProps> = ({ isOpen, onClose, onSave, os }) => {
  const [checklist, setChecklist] = useState<ChecklistSchema>(createEmptyChecklist());
  const [addingItemTo, setAddingItemTo] = useState<string | null>(null);
  const [newItemLabel, setNewItemLabel] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const newItemInputRef = useRef<HTMLInputElement>(null);
  const newCatInputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && os) {
      setChecklist(migrateChecklist(os.checklist));
      setAddingItemTo(null);
      setAddingCategory(false);
      setNewItemLabel('');
      setNewCategoryLabel('');
    }
  }, [isOpen, os]);

  useEffect(() => { if (addingItemTo) newItemInputRef.current?.focus(); }, [addingItemTo]);
  useEffect(() => { if (addingCategory) newCatInputRef.current?.focus(); }, [addingCategory]);

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

  // Conta itens por status para o resumo do topo
  const counts = checklist.categories
    .flatMap(c => c.items)
    .reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, {} as Record<InspectionStatus, number>);

  return (
    <div className="modal-overlay checklist-modal-overlay">
      <div className="modal-content checklist-modal">

        {/* ====== HEADER ====== */}
        <div className="checklist-header">
          <div className="checklist-header-info">
            <h2 className="checklist-title">&#128269; Inspeção Veicular</h2>
            <span className="checklist-subtitle">{os.vehicle} &mdash; {os.clientName}</span>
          </div>

          <div className="checklist-header-km">
            <label className="checklist-km-label">KM entrada</label>
            <input
              type="number"
              className="form-input checklist-km-input"
              value={checklist.mileageIn ?? os.mileage}
              onChange={e => setChecklist(prev => ({ ...prev, mileageIn: parseInt(e.target.value) || 0 }))}
            />
          </div>

          <button className="btn-icon" onClick={onClose} title="Fechar">&#10005;</button>
        </div>

        {/* ====== LEGENDA + RESUMO ====== */}
        <div className="checklist-legend">
          {(Object.entries(INSPECTION_STATUS_META) as [InspectionStatus, { label: string; color: string; emoji: string }][]).map(([key, meta]) => (
            <span key={key} className="legend-item">
              <span style={{ color: meta.color, fontSize: '1rem' }}>{meta.emoji}</span>
              <span>{meta.label}</span>
              {counts[key] ? <strong style={{ color: meta.color }}>({counts[key]})</strong> : null}
            </span>
          ))}
          <span className="legend-hint">Clique no item para alternar o status</span>
        </div>

        {/* ====== GRID DE CATEGORIAS ====== */}
        <div className="checklist-grid">
          {checklist.categories.map(cat => (
            <div key={cat.id} className="checklist-category">

              {/* Cabeçalho da categoria */}
              <div className="checklist-category-header">
                <span>{cat.label}</span>
                {cat.custom && (
                  <button
                    className="btn-icon danger"
                    title="Remover categoria"
                    style={{ fontSize: '0.75rem', padding: '0 4px' }}
                    onClick={() => removeCategory(cat.id)}
                  >&#10005;</button>
                )}
              </div>

              {/* Itens */}
              <ul className="checklist-items">
                {cat.items.map(item => {
                  const meta = INSPECTION_STATUS_META[item.status];
                  return (
                    <li
                      key={item.id}
                      className={`checklist-item status-${item.status}`}
                      onClick={() => cycleStatus(cat.id, item.id)}
                      title="Clique para alterar status"
                    >
                      <span className="status-dot" style={{ color: meta.color }}>{meta.emoji}</span>
                      <span className="item-label">{item.label}</span>
                      {item.custom && (
                        <button
                          className="item-delete btn-icon danger"
                          title="Remover item"
                          onClick={e => { e.stopPropagation(); removeItem(cat.id, item.id); }}
                        >&#10005;</button>
                      )}
                    </li>
                  );
                })}

                {cat.items.length === 0 && (
                  <li className="checklist-empty-cat">Nenhum item ainda</li>
                )}
              </ul>

              {/* Adicionar item */}
              {addingItemTo === cat.id ? (
                <div className="add-item-row">
                  <input
                    ref={newItemInputRef}
                    className="form-input"
                    placeholder="Nome do item..."
                    value={newItemLabel}
                    onChange={e => setNewItemLabel(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') addItem(cat.id);
                      if (e.key === 'Escape') { setAddingItemTo(null); setNewItemLabel(''); }
                    }}
                  />
                  <button className="btn-sm" onClick={() => addItem(cat.id)}>&#10003;</button>
                  <button className="btn-sm btn-secondary" onClick={() => { setAddingItemTo(null); setNewItemLabel(''); }}>&#10005;</button>
                </div>
              ) : (
                <button
                  className="add-item-btn"
                  onClick={() => { setAddingItemTo(cat.id); setNewItemLabel(''); }}
                >
                  + Novo item
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
                value={newCategoryLabel}
                onChange={e => setNewCategoryLabel(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addCategory();
                  if (e.key === 'Escape') { setAddingCategory(false); setNewCategoryLabel(''); }
                }}
              />
              <button className="btn-sm" onClick={addCategory}>&#10003;</button>
              <button className="btn-sm btn-secondary" onClick={() => { setAddingCategory(false); setNewCategoryLabel(''); }}>&#10005;</button>
            </div>
          ) : (
            <button className="btn-ghost" onClick={() => setAddingCategory(true)}>+ Nova categoria</button>
          )}
        </div>

        {/* ====== OBSERVAÇÕES ====== */}
        <div className="checklist-notes-section">
          <label className="form-label">&#128221; Observações</label>
          <textarea
            className="form-input form-textarea"
            placeholder="Riscos, amassados, observações adicionais..."
            value={checklist.notes}
            onChange={e => setChecklist(prev => ({ ...prev, notes: e.target.value }))}
            rows={2}
          />
        </div>

        {/* ====== AÇÕES ====== */}
        <div className="modal-actions checklist-actions">
          <button className="btn-ghost checklist-print-btn" onClick={() => window.print()} title="Imprimir vistoria">
            &#128424; Imprimir
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn" onClick={handleSave}>&#128190; Salvar Vistoria</button>
        </div>

      </div>
    </div>
  );
};
