import React, { useMemo, useState } from 'react';
import { WorkOrder, OSStatus } from '../types';
import '../styles-parts.css';

interface PartsPageProps {
  workOrders: WorkOrder[];
  isLoading: boolean;
}

type OSPartRef = { osNumber: number; status: OSStatus; clientName: string };

interface PartWithMetadata {
  description: string;
  quantity: number;
  refs: OSPartRef[];
  selected: boolean;
}

export const PartsPage: React.FC<PartsPageProps> = ({ workOrders, isLoading }) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ORCAMENTO' | 'APROVADO'>('ALL');
  const [selectedParts, setSelectedParts] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  const consolidatedParts = useMemo(() => {
    const relevantOrders = workOrders.filter(os => {
      if (statusFilter === 'ALL') return os.status === 'ORCAMENTO' || os.status === 'APROVADO';
      return os.status === statusFilter;
    });

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

    const partsToDisplay = consolidatedParts.filter(p => p.selected);
    const totalQty = partsToDisplay.reduce((sum, p) => sum + p.quantity, 0);
    const uniqueOSCount = new Set(partsToDisplay.flatMap(p => p.refs.map(r => r.osNumber))).size;

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Resumo de Peças</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            background: white;
            color: black;
          }
          
          .print-header {
            text-align: center;
            margin-bottom: 25px;
            border-bottom: 3px solid #000;
            padding-bottom: 12px;
          }
          
          .print-header h1 {
            font-size: 22pt;
            font-weight: bold;
            margin-bottom: 10px;
            text-transform: uppercase;
          }
          
          .print-date {
            font-size: 11pt;
          }
          
          .print-info {
            margin-bottom: 20px;
            padding: 10px;
            background: #f5f5f5;
            border: 1px solid #ccc;
            border-radius: 4px;
          }
          
          .print-info div {
            margin: 4px 0;
            font-size: 10pt;
          }
          
          .print-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 25px;
            font-size: 9pt;
          }
          
          .print-table th {
            background: #e0e0e0;
            border: 2px solid #000;
            padding: 10px 8px;
            text-align: left;
            font-weight: bold;
            font-size: 10pt;
            text-transform: uppercase;
          }
          
          .print-table td {
            border: 1px solid #666;
            padding: 8px 6px;
            vertical-align: top;
          }
          
          .print-checkbox {
            text-align: center;
            font-size: 16pt;
            font-weight: bold;
          }
          
          .print-qty {
            text-align: center;
            font-weight: bold;
          }
          
          .print-footer {
            margin-top: 30px;
            page-break-inside: avoid;
          }
          
          .print-notes {
            margin-bottom: 20px;
          }
          
          .print-notes strong {
            font-size: 11pt;
            display: block;
            margin-bottom: 10px;
            text-transform: uppercase;
          }
          
          .print-line {
            margin: 6px 0;
            border-bottom: 1px solid #000;
            padding-bottom: 2px;
          }
          
          .print-signature {
            display: flex;
            justify-content: space-between;
            gap: 30px;
            margin-top: 20px;
            border-top: 2px solid #000;
            padding-top: 15px;
          }
          
          .print-sig-line {
            flex: 1;
            font-size: 10pt;
            padding: 8px 0;
          }
          
          @page {
            size: A4;
            margin: 15mm;
          }
        </style>
      </head>
      <body>
        <div class="print-header">
          <h1>📦 RESUMO DE PEÇAS PARA PEDIDO</h1>
          <div class="print-date">
            <strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </div>
        </div>

        <div class="print-info">
          <div><strong>Total de peças:</strong> ${partsToDisplay.length} distintas (${totalQty} unidades)</div>
          <div><strong>OSs relacionadas:</strong> ${uniqueOSCount}</div>
          <div><strong>Status:</strong> ${statusFilter === 'ALL' ? 'Orçamento + Aprovado' : statusFilter === 'ORCAMENTO' ? 'Orçamento' : 'Aprovado'}</div>
        </div>

        <table class="print-table">
          <thead>
            <tr>
              <th style="width: 5%">☐</th>
              <th style="width: 35%">PEÇA</th>
              <th style="width: 8%">QTD</th>
              <th style="width: 22%">CLIENTE</th>
              <th style="width: 10%">OS</th>
              <th style="width: 20%">FORNECEDOR</th>
            </tr>
          </thead>
          <tbody>
            ${partsToDisplay.map(part => `
              <tr>
                <td class="print-checkbox">☐</td>
                <td>${part.description}</td>
                <td class="print-qty">${part.quantity}</td>
                <td>${Array.from(new Set(part.refs.map(r => r.clientName))).join(', ')}</td>
                <td>${part.refs.map(r => `#${r.osNumber}`).join(', ')}</td>
                <td>__________________</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="print-footer">
          <div class="print-notes">
            <strong>OBSERVAÇÕES:</strong>
            <div class="print-line">_________________________________________________________________________________</div>
            <div class="print-line">_________________________________________________________________________________</div>
            <div class="print-line">_________________________________________________________________________________</div>
            <div class="print-line">_________________________________________________________________________________</div>
          </div>
          
          <div class="print-signature">
            <div class="print-sig-line">
              <strong>RESPONSÁVEL:</strong> _________________________________
            </div>
            <div class="print-sig-line">
              <strong>DATA PEDIDO:</strong> ____/____/________ <strong>PREVISÃO ENTREGA:</strong> ____/____/________
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Criar iframe invisível
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    // Escrever conteúdo no iframe
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(printContent);
      doc.close();

      // Aguardar carregar e imprimir
      iframe.contentWindow?.focus();
      setTimeout(() => {
        iframe.contentWindow?.print();
        // Remover iframe após impressão
        setTimeout(() => document.body.removeChild(iframe), 100);
      }, 250);
    }
  };

  const partsToDisplay = consolidatedParts.filter(p => selectedParts.size === 0 || p.selected);
  const totalQty = partsToDisplay.reduce((sum, p) => sum + p.quantity, 0);
  const uniqueOSCount = new Set(partsToDisplay.flatMap(p => p.refs.map(r => r.osNumber))).size;

  if (isLoading) {
    return (
      <div className="parts-page-container">
        <div className="parts-loading">
          <div className="spinner"></div>
          <p>Carregando peças...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="parts-page-container">
      {/* Header */}
      <div className="parts-header">
        <div className="parts-header-left">
          <h1 className="parts-title">📦 Resumo de Peças</h1>
          <p className="parts-subtitle">Gerencie e imprima peças para pedido</p>
        </div>
        <div className="parts-header-right">
          <button 
            className="parts-btn-print" 
            onClick={handlePrint}
            disabled={selectedParts.size === 0}
          >
            🖨️ Imprimir Selecionadas ({selectedParts.size})
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="parts-filters">
        <div className="parts-filter-group">
          <label className="parts-filter-label">Filtrar por Status:</label>
          <div className="parts-filter-buttons">
            <button 
              className={`parts-filter-btn ${statusFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setStatusFilter('ALL')}
            >
              Todos
            </button>
            <button 
              className={`parts-filter-btn ${statusFilter === 'ORCAMENTO' ? 'active' : ''}`}
              onClick={() => setStatusFilter('ORCAMENTO')}
            >
              📋 Orçamento
            </button>
            <button 
              className={`parts-filter-btn ${statusFilter === 'APROVADO' ? 'active' : ''}`}
              onClick={() => setStatusFilter('APROVADO')}
            >
              ✅ Aprovado
            </button>
          </div>
        </div>

        <div className="parts-filter-group">
          <button 
            className="parts-select-all-btn"
            onClick={handleSelectAll}
          >
            {selectAll ? '❌ Desmarcar Todas' : '✓ Selecionar Todas'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="parts-stats">
        <div className="parts-stat-card">
          <div className="parts-stat-icon">📦</div>
          <div className="parts-stat-content">
            <div className="parts-stat-value">{consolidatedParts.length}</div>
            <div className="parts-stat-label">Peças Distintas</div>
          </div>
        </div>
        <div className="parts-stat-card">
          <div className="parts-stat-icon">🔢</div>
          <div className="parts-stat-content">
            <div className="parts-stat-value">{consolidatedParts.reduce((s, p) => s + p.quantity, 0)}</div>
            <div className="parts-stat-label">Quantidade Total</div>
          </div>
        </div>
        <div className="parts-stat-card">
          <div className="parts-stat-icon">📋</div>
          <div className="parts-stat-content">
            <div className="parts-stat-value">{new Set(consolidatedParts.flatMap(p => p.refs.map(r => r.osNumber))).size}</div>
            <div className="parts-stat-label">OSs Relacionadas</div>
          </div>
        </div>
        <div className="parts-stat-card highlight">
          <div className="parts-stat-icon">✓</div>
          <div className="parts-stat-content">
            <div className="parts-stat-value">{selectedParts.size}</div>
            <div className="parts-stat-label">Selecionadas</div>
          </div>
        </div>
      </div>

      {/* Table */}
      {consolidatedParts.length === 0 ? (
        <div className="parts-empty-state">
          <div className="parts-empty-icon">📦</div>
          <h3>Nenhuma peça encontrada</h3>
          <p>Não há peças em OSs com os filtros selecionados</p>
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
                  />
                </th>
                <th className="parts-th-name">Peça</th>
                <th className="parts-th-qty">Qtd</th>
                <th className="parts-th-client">Cliente</th>
                <th className="parts-th-os">OS</th>
                <th className="parts-th-status">Status</th>
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
                    {Array.from(new Set(part.refs.map(r => r.status))).map((status, idx) => (
                      <span 
                        key={idx} 
                        className={`parts-status-badge ${status.toLowerCase()}`}
                      >
                        {status === 'ORCAMENTO' ? '📋 Orçamento' : '✅ Aprovado'}
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
