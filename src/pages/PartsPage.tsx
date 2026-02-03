import React, { useState, useMemo } from 'react';
import { WorkOrder, OSStatus } from '../types';
import { Money } from '../utils/helpers';

interface PartsPageProps {
  workOrders: WorkOrder[];
  isLoading: boolean;
}

interface PartWithMetadata {
  description: string;
  quantity: number;
  osNumbers: number[];
  statuses: OSStatus[];
  clients: string[];
  checked: boolean;
  supplier: string;
}

export const PartsPage: React.FC<PartsPageProps> = ({ workOrders, isLoading }) => {
  const [partsData, setPartsData] = useState<Map<string, PartWithMetadata>>(new Map());
  const [isPrinting, setIsPrinting] = useState(false);

  // Agrupa peças de OSs com status ORCAMENTO e APROVADO
  const consolidatedParts = useMemo(() => {
    const relevantOrders = workOrders.filter(os => 
      os.status === 'ORCAMENTO' || os.status === 'APROVADO'
    );

    const partsMap = new Map<string, PartWithMetadata>();

    relevantOrders.forEach(os => {
      os.parts.forEach(part => {
        const existing = partsMap.get(part.description);
        
        if (existing) {
          existing.quantity += 1;
          if (!existing.osNumbers.includes(os.osNumber)) {
            existing.osNumbers.push(os.osNumber);
          }
          if (!existing.statuses.includes(os.status)) {
            existing.statuses.push(os.status);
          }
          if (!existing.clients.includes(os.clientName)) {
            existing.clients.push(os.clientName);
          }
        } else {
          partsMap.set(part.description, {
            description: part.description,
            quantity: 1,
            osNumbers: [os.osNumber],
            statuses: [os.status],
            clients: [os.clientName],
            checked: partsData.get(part.description)?.checked || false,
            supplier: partsData.get(part.description)?.supplier || ''
          });
        }
      });
    });

    // Ordena por descrição
    return Array.from(partsMap.values()).sort((a, b) => 
      a.description.localeCompare(b.description)
    );
  }, [workOrders, partsData]);

  const handleCheckToggle = (description: string) => {
    setPartsData(prev => {
      const newMap = new Map(prev);
      const existing = consolidatedParts.find(p => p.description === description);
      if (existing) {
        newMap.set(description, {
          ...existing,
          checked: !existing.checked
        });
      }
      return newMap;
    });
  };

  const handleSupplierChange = (description: string, supplier: string) => {
    setPartsData(prev => {
      const newMap = new Map(prev);
      const existing = consolidatedParts.find(p => p.description === description);
      if (existing) {
        newMap.set(description, {
          ...existing,
          supplier
        });
      }
      return newMap;
    });
  };

  const handlePrint = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 100);
  };

  if (isLoading) {
    return (
      <div className="page-container">
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div className="spinner"></div>
          <p>Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`page-container ${isPrinting ? 'printing' : ''}`}>
        <div className="page-header">
          <div>
            <h1>📦 Resumo de Peças</h1>
            <p className="subtitle">Peças de OSs em Orçamento e Aprovadas</p>
          </div>
          <button 
            className="btn-primary" 
            onClick={handlePrint}
            disabled={consolidatedParts.length === 0}
          >
            🖨️ Gerar PDF
          </button>
        </div>

        {consolidatedParts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3>Nenhuma peça encontrada</h3>
            <p>Não há peças em OSs com status Orçamento ou Aprovado</p>
          </div>
        ) : (
          <div className="parts-table-container">
            <table className="parts-summary-table">
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>✓</th>
                  <th style={{ width: '40%' }}>Peça</th>
                  <th style={{ width: '80px' }}>Qtd</th>
                  <th style={{ width: '120px' }}>OS</th>
                  <th style={{ width: '120px' }}>Status</th>
                  <th style={{ width: '25%' }}>Fornecedor</th>
                </tr>
              </thead>
              <tbody>
                {consolidatedParts.map((part, index) => (
                  <tr key={index}>
                    <td className="checkbox-cell">
                      <input 
                        type="checkbox" 
                        checked={part.checked}
                        onChange={() => handleCheckToggle(part.description)}
                        className="part-checkbox"
                      />
                    </td>
                    <td className="part-name">{part.description}</td>
                    <td className="quantity-cell">{part.quantity}</td>
                    <td className="os-cell">
                      {part.osNumbers.map(num => (
                        <span key={num} className="os-badge">#{num}</span>
                      ))}
                    </td>
                    <td className="status-cell">
                      {part.statuses.map((status, i) => (
                        <span 
                          key={i} 
                          className={`status-tag status-${status.toLowerCase()}`}
                        >
                          {status === 'ORCAMENTO' ? '📋' : '✅'}
                        </span>
                      ))}
                    </td>
                    <td className="supplier-cell">
                      <input 
                        type="text" 
                        value={part.supplier}
                        onChange={(e) => handleSupplierChange(part.description, e.target.value)}
                        placeholder="Digite o fornecedor"
                        className="supplier-input"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="parts-summary-footer">
          <div className="summary-stats">
            <div className="stat-card">
              <span className="stat-label">Total de Peças Distintas</span>
              <span className="stat-value">{consolidatedParts.length}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Quantidade Total</span>
              <span className="stat-value">{consolidatedParts.reduce((sum, p) => sum + p.quantity, 0)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">OSs Relacionadas</span>
              <span className="stat-value">
                {new Set(consolidatedParts.flatMap(p => p.osNumbers)).size}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Área de impressão */}
      {isPrinting && (
        <div className="print-only parts-print-view">
          <div className="print-header">
            <h1>📦 Resumo de Peças para Pedido</h1>
            <p className="print-date">Data: {new Date().toLocaleDateString('pt-BR')}</p>
          </div>

          <div className="print-info">
            <p><strong>Status incluídos:</strong> Orçamento e Aprovado</p>
            <p><strong>Total de peças distintas:</strong> {consolidatedParts.length}</p>
            <p><strong>Quantidade total:</strong> {consolidatedParts.reduce((sum, p) => sum + p.quantity, 0)}</p>
          </div>

          <table className="print-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>☐</th>
                <th style={{ width: '40%' }}>Peça</th>
                <th style={{ width: '60px' }}>Qtd</th>
                <th style={{ width: '15%' }}>OS / Status</th>
                <th style={{ width: '30%' }}>Fornecedor</th>
              </tr>
            </thead>
            <tbody>
              {consolidatedParts.map((part, index) => (
                <tr key={index}>
                  <td className="print-checkbox">☐</td>
                  <td className="print-part-name">{part.description}</td>
                  <td className="print-quantity">{part.quantity}</td>
                  <td className="print-os-status">
                    {part.osNumbers.map((num, i) => (
                      <div key={i} className="print-os-line">
                        <span>#{num}</span>
                        <span className="print-status-indicator">
                          {part.statuses[i] === 'ORCAMENTO' ? '(Orç)' : '(Apr)'}
                        </span>
                      </div>
                    ))}
                  </td>
                  <td className="print-supplier">
                    {part.supplier || '_______________________________'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="print-footer">
            <p><strong>Observações:</strong></p>
            <div className="print-notes-area">
              _______________________________________________________________________________
              <br/>
              _______________________________________________________________________________
              <br/>
              _______________________________________________________________________________
            </div>
            <p className="print-signature">
              <strong>Responsável:</strong> _____________________________ <strong>Data:</strong> ____/____/________
            </p>
          </div>
        </div>
      )}
    </>
  );
};