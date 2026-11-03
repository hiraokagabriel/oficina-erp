import React, { useMemo, useState } from 'react';
import { WorkOrder, OSStatus, WorkshopSettings } from '../types';
import { buildPartsToBuy, filterOrdersForParts } from '../services/partsToBuy';
import type { PartsStatusFilter } from '../services/partsToBuy';
import { printPartsToBuy } from '../utils/printPartsToBuy';
import { Icon } from '../components/ui/Icon';
import '../styles-parts.css';

interface PartsPageProps {
  workOrders: WorkOrder[];
  settings: WorkshopSettings;
  isLoading: boolean;
}

type OSPartRef = { osNumber: number; status: OSStatus; clientName: string };

interface PartWithMetadata {
  description: string;
  quantity: number;
  refs: OSPartRef[];
  selected: boolean;
}

export const PartsPage: React.FC<PartsPageProps> = ({ workOrders, settings, isLoading }) => {
  const [statusFilter, setStatusFilter] = useState<PartsStatusFilter>('ALL');
  const [selectedParts, setSelectedParts] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  const consolidatedParts = useMemo(() => {
    const relevantOrders = filterOrdersForParts(workOrders, statusFilter);

    const partsMap = new Map<string, Omit<PartWithMetadata, 'selected'>>();

    relevantOrders.forEach(os => {
      os.parts.forEach(part => {
        const existing = partsMap.get(part.description);
        if (existing) {
          existing.quantity += 1;
          existing.refs.push({ osNumber: os.osNumber, status: os.status, clientName: os.clientName });
        } else {
          partsMap.set(part.description, {
            description: part.description,
            quantity: 1,
            refs: [{ osNumber: os.osNumber, status: os.status, clientName: os.clientName }]
          });
        }
      });
    });

    return Array.from(partsMap.values())
      .map(p => ({
        ...p,
        selected: selectedParts.has(p.description)
      }))
      .sort((a, b) => a.description.localeCompare(b.description));
  }, [workOrders, statusFilter, selectedParts]);

  const handleTogglePart = (description: string) => {
    setSelectedParts(prev => {
      const next = new Set(prev);
      if (next.has(description)) {
        next.delete(description);
      } else {
        next.add(description);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedParts(new Set());
    } else {
      setSelectedParts(new Set(consolidatedParts.map(p => p.description)));
    }
    setSelectAll(!selectAll);
  };

  const handlePrint = () => {
    if (selectedParts.size === 0) {
      alert('Selecione pelo menos uma peça para imprimir');
      return;
    }
    const plan = buildPartsToBuy(filterOrdersForParts(workOrders, statusFilter), selectedParts);
    printPartsToBuy(plan, settings);
  };

  /*const partsToDisplay = consolidatedParts.filter(p => selectedParts.size === 0 || p.selected); */

  if (isLoading) {
    return (
      <div className="parts-page-container">
        <div className="parts-loading" role="status">
          <div className="spinner"></div>
          <p>Carregando peças...</p>
        </div>
      </div>
    );
  }

  const totalQty = consolidatedParts.reduce((s, p) => s + p.quantity, 0);
  const osCount = new Set(consolidatedParts.flatMap(p => p.refs.map(r => r.osNumber))).size;
  const filters: { id: PartsStatusFilter; label: string }[] = [
    { id: 'ALL', label: 'Todas' },
    { id: 'ORCAMENTO', label: 'Em orçamento' },
    { id: 'APROVADO', label: 'Aprovadas' },
  ];

  return (
    <div className="parts-page-container">
      <div className="parts-header">
        <div className="parts-header-left">
          <h1 className="parts-title">Lista de compras (peças das OS em orçamento e aprovadas)</h1>
          <p className="parts-subtitle">Marque o que vai comprar e imprima a lista.</p>
        </div>
        <div className="parts-header-right">
          <button
            type="button"
            className="btn parts-btn-print"
            onClick={handlePrint}
            disabled={selectedParts.size === 0}
            aria-describedby="parts-print-hint"
          >
            <Icon name="imprimir" size={18} /> Imprimir selecionadas ({selectedParts.size})
          </button>
          {selectedParts.size === 0 && (
            <p id="parts-print-hint" className="parts-print-hint">Selecione ao menos uma peça</p>
          )}
        </div>
      </div>
      <div className="parts-filters">
        <div className="parts-filter-group" role="group" aria-label="Filtrar por situação da OS">
          <span className="parts-filter-label">Mostrar:</span>
          <div className="parts-filter-buttons">
            {filters.map(f => (
              <button
                key={f.id}
                type="button"
                className="chip"
                aria-pressed={statusFilter === f.id}
                onClick={() => setStatusFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="parts-filter-group">
          <button type="button" className="btn-secondary parts-select-all-btn" onClick={handleSelectAll}>
            <Icon name={selectAll ? 'fechar' : 'check'} size={18} /> {selectAll ? 'Desmarcar todas' : 'Selecionar todas'}
          </button>
        </div>
      </div>
      <div className="parts-stats">
        <div className="parts-stat-card">
          <Icon name="caixa" size={24} />
          <div className="parts-stat-content">
            <div className="parts-stat-value">{consolidatedParts.length}</div>
            <div className="parts-stat-label">Peças diferentes</div>
          </div>
        </div>
        <div className="parts-stat-card">
          <Icon name="adicionar" size={24} />
          <div className="parts-stat-content">
            <div className="parts-stat-value">{totalQty}</div>
            <div className="parts-stat-label">Quantidade total</div>
          </div>
        </div>
        <div className="parts-stat-card">
          <Icon name="prancheta" size={24} />
          <div className="parts-stat-content">
            <div className="parts-stat-value">{osCount}</div>
            <div className="parts-stat-label">OS envolvidas</div>
          </div>
        </div>
        <div className="parts-stat-card highlight">
          <Icon name="check" size={24} />
          <div className="parts-stat-content">
            <div className="parts-stat-value">{selectedParts.size}</div>
            <div className="parts-stat-label">Selecionadas</div>
          </div>
        </div>
      </div>
      {consolidatedParts.length === 0 ? (
        <div className="parts-empty-state empty-state">
          <Icon name="caixa" size={40} className="empty-state-icon" />
          <h3 className="empty-state-title">Nenhuma peça para comprar</h3>
          <p className="empty-state-text">Não há peças nas OS em orçamento ou aprovadas com este filtro.</p>
        </div>
      ) : (
        <div className="parts-table-wrapper">
          <table className="parts-table">
            <thead>
              <tr>
                <th className="parts-th-checkbox">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleSelectAll}
                    className="parts-checkbox-header"
                    aria-label="Selecionar todas as peças"
                  />
                </th>
                <th className="parts-th-name">Peça</th>
                <th className="parts-th-qty">Qtd</th>
                <th className="parts-th-client">Cliente</th>
                <th className="parts-th-os">OS</th>
                <th className="parts-th-status">Situação</th>
              </tr>
            </thead>
            <tbody>
              {consolidatedParts.map((part) => (
                <tr
                  key={part.description}
                  className={`parts-row ${part.selected ? 'selected' : ''}`}
                  onClick={() => handleTogglePart(part.description)}
                >
                  <td className="parts-td-checkbox">
                    <input
                      type="checkbox"
                      checked={part.selected}
                      onChange={() => handleTogglePart(part.description)}
                      className="parts-checkbox"
                      aria-label={`Selecionar ${part.description}`}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="parts-td-name">{part.description}</td>
                  <td className="parts-td-qty">
                    <span className="parts-qty-badge">{part.quantity}</span>
                  </td>
                  <td className="parts-td-client">
                    {Array.from(new Set(part.refs.map(r => r.clientName))).join(', ')}
                  </td>
                  <td className="parts-td-os">
                    {part.refs.map((r, idx) => (
                      <span key={`${r.osNumber}-${idx}`} className="parts-os-badge">
                        #{r.osNumber}
                      </span>
                    ))}
                  </td>
                  <td className="parts-td-status">
                    {Array.from(new Set(part.refs.map(r => r.status))).map((status) => (
                      <span
                        key={status}
                        className={`status-light status-light--${status === 'ORCAMENTO' ? 'orcamento' : 'aprovado'}`}
                      >
                        {status === 'ORCAMENTO' ? 'Orçamento' : 'Aprovado'}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
