import React, { useMemo, useState } from 'react';
import { WorkOrder, OSStatus } from '../types';

interface PartsPageProps {
  workOrders: WorkOrder[];
  isLoading: boolean;
}

type OSPartRef = { osNumber: number; status: OSStatus; clientName: string };

interface PartWithMetadata {
  description: string;
  quantity: number;
  refs: OSPartRef[];
}

export const PartsPage: React.FC<PartsPageProps> = ({ workOrders, isLoading }) => {
  const [isPrinting, setIsPrinting] = useState(false);

  const consolidatedParts = useMemo(() => {
    const relevantOrders = workOrders.filter(os => os.status === 'ORCAMENTO' || os.status === 'APROVADO');

    const partsMap = new Map<string, PartWithMetadata>();

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
      .sort((a, b) => a.description.localeCompare(b.description));
  }, [workOrders]);

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

  const totalQty = consolidatedParts.reduce((sum, p) => sum + p.quantity, 0);
  const uniqueOSCount = new Set(consolidatedParts.flatMap(p => p.refs.map(r => r.osNumber))).size;

  return (
    <>
      <div className={`page-container ${isPrinting ? 'printing' : ''}`}>
        <div className="page-header">
          <div>
            <h1>📦 Resumo de Peças</h1>
            <p className="subtitle">Peças de OSs em Orçamento e Aprovadas</p>
          </div>
          <button className="btn-primary" onClick={handlePrint} disabled={consolidatedParts.length === 0}>
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
                  <th style={{ width: '35%' }}>Peça</th>
                  <th style={{ width: '80px' }}>Qtd</th>
                  <th style={{ width: '30%' }}>Cliente</th>
                  <th style={{ width: '100px' }}>OS</th>
                </tr>
              </thead>
              <tbody>
                {consolidatedParts.map((part) => (
                  <tr key={part.description}>
                    <td className="part-name">{part.description}</td>
                    <td className="quantity-cell">{part.quantity}</td>
                    <td className="client-cell">
                      {Array.from(new Set(part.refs.map(r => r.clientName))).join(', ')}
                    </td>
                    <td className="os-cell">
                      {part.refs.map((r, idx) => (
                        <span key={`${r.osNumber}-${idx}`} className="os-badge">
                          #{r.osNumber}
                        </span>
                      ))}
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
              <span className="stat-value">{totalQty}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">OSs Relacionadas</span>
              <span className="stat-value">{uniqueOSCount}</span>
            </div>
          </div>
        </div>
      </div>

      {isPrinting && (
        <div className="print-only parts-print-view">
          <div className="print-header">
            <h1>📦 Resumo de Peças para Pedido</h1>
            <p className="print-date">Data: {new Date().toLocaleDateString('pt-BR')}</p>
          </div>

          <div className="print-info">
            <p><strong>Status incluídos:</strong> Orçamento e Aprovado</p>
            <p><strong>Total de peças distintas:</strong> {consolidatedParts.length}</p>
            <p><strong>Quantidade total:</strong> {totalQty}</p>
          </div>

          <table className="print-table">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>Peça</th>
                <th style={{ width: '8%' }}>Qtd</th>
                <th style={{ width: '25%' }}>Cliente</th>
                <th style={{ width: '10%' }}>OS</th>
                <th style={{ width: '27%' }}>Fornecedor</th>
              </tr>
            </thead>
            <tbody>
              {consolidatedParts.map((part) => (
                <tr key={`print-${part.description}`}>
                  <td className="print-part-name">{part.description}</td>
                  <td className="print-quantity">{part.quantity}</td>
                  <td className="print-client">
                    {Array.from(new Set(part.refs.map(r => r.clientName))).join(', ')}
                  </td>
                  <td className="print-os">
                    {part.refs.map(r => `#${r.osNumber}`).join(', ')}
                  </td>
                  <td className="print-supplier">_______________________________</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="print-footer">
            <p><strong>Observações:</strong></p>
            <div className="print-notes-area">
              _______________________________________________________________________________
              <br />
              _______________________________________________________________________________
              <br />
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
