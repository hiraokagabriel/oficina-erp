import React, { useEffect } from 'react';
import { WorkOrder, WorkshopSettings, STATUS_LABELS } from '../types';

interface PrintableInvoiceProps {
  data: WorkOrder | null;
  settings: WorkshopSettings;
  formatMoney: (val: number) => string;
  onPrintComplete?: () => void;
}

export const PrintableInvoice: React.FC<PrintableInvoiceProps> = ({ data, settings, formatMoney, onPrintComplete }) => {
  
  // 🖨️ DISPARA IMPRESSÃO AUTOMATICAMENTE QUANDO DATA ESTIVER DISPONÍVEL
  useEffect(() => {
    if (!data) return;
    
    console.log('📄 PrintableInvoice renderizado, iniciando impressão...');
    
    // Aguarda renderização completa antes de imprimir
    const timer = setTimeout(() => {
      console.log('🖨️ Chamando window.print()...');
      window.print();
      
      // Listener para detectar fim da impressão
      const handleAfterPrint = () => {
        console.log('✅ Impressão concluída!');
        if (onPrintComplete) onPrintComplete();
        window.removeEventListener('afterprint', handleAfterPrint);
      };
      
      window.addEventListener('afterprint', handleAfterPrint);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [data, onPrintComplete]);
  
  if (!data) return null;

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const subtotalParts = data.parts.reduce((acc, item) => acc + item.price, 0);
  const subtotalServices = data.services.reduce((acc, item) => acc + item.price, 0);

  return (
    <div className="printable-invoice">
      
      {/* ESTRUTURA PRINCIPAL: TABELA DE LAYOUT 
          Garante que o rodapé fixo não cubra o conteúdo ao quebrar páginas.
      */}
      <table className="invoice-layout-table">
        
        {/* CORPO DA PÁGINA */}
        <tbody>
          <tr>
            <td className="invoice-content-cell">
              
              {/* --- 1. CABEÇALHO --- */}
              <header className="invoice-header">
                <div className="invoice-col supplier-col">
                  <h4 className="label-sm">PRESTADOR DE SERVIÇO</h4>
                  <h2 className="company-name">{settings.name || "NOME DA OFICINA"}</h2>
                  <p>{settings.address || "Endereço não informado"}</p>
                  <p>{settings.cnpj || "CNPJ não informado"}</p>
                  <p>{settings.technician && `Téc. Resp: ${settings.technician}`}</p>
                </div>

                {/* LOGO AREA - ATUALIZADA PARA "AM" E TÍTULO */}
                <div className="invoice-logo-area">
                   <h1 className="invoice-main-title">ORDEM DE SERVIÇO</h1>
                   <div className="invoice-logo-circle">AM</div>
                </div>

                <div className="invoice-col client-col">
                  <h4 className="label-sm">CLIENTE</h4>
                  <h2 className="client-name">{data.clientName}</h2>
                  <p>{data.clientPhone}</p>
                  <div style={{ marginTop: 8 }}>
                    <p><strong>Veículo:</strong> {data.vehicle}</p>
                    <p><strong>KM:</strong> {data.mileage}</p>
                  </div>
                </div>
              </header>

              <hr className="divider" />

              {/* --- 2. DADOS DA OS --- */}
              <div className="invoice-meta-grid">
                <div className="meta-item">
                  <span className="label-sm">NÚMERO OS</span>
                  <span className="meta-value">#{data.osNumber}</span>
                </div>
                <div className="meta-item">
                  <span className="label-sm">DATA EMISSÃO</span>
                  <span className="meta-value">{formatDate(data.createdAt)}</span>
                </div>
                <div className="meta-item">
                  <span className="label-sm">STATUS</span>
                  <span className="meta-value status-print">{STATUS_LABELS[data.status]}</span>
                </div>
              </div>

              <hr className="divider" />

              {/* --- 3. TABELA DE PEÇAS --- */}
              <div className="table-section">
                <h3 className="section-title">PEÇAS E MATERIAIS</h3>
                <table className="invoice-items-table">
                  <thead>
                    <tr>
                      <th style={{ width: '75%', textAlign: 'left' }}>ITEM / DESCRIÇÃO</th>
                      <th style={{ width: '25%', textAlign: 'right' }}>VALOR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.parts.length === 0 ? (
                       <tr><td colSpan={2} style={{fontStyle:'italic', color:'#999', padding: '15px 0'}}>Nenhuma peça utilizada.</td></tr>
                    ) : (
                        data.parts.map((item, index) => (
                        <tr key={index}>
                            <td>{item.description}</td>
                            <td className="text-right">{formatMoney(item.price)}</td>
                        </tr>
                        ))
                    )}
                  </tbody>
                </table>
                <div className="subtotal-row">
                    <span>Subtotal Peças:</span>
                    <span className="subtotal-value">{formatMoney(subtotalParts)}</span>
                </div>
              </div>

              {/* --- 4. TABELA DE SERVIÇOS --- */}
              <div className="table-section" style={{ marginTop: '30px' }}>
                <h3 className="section-title">MÃO DE OBRA E SERVIÇOS</h3>
                <table className="invoice-items-table">
                  <thead>
                    <tr>
                      <th style={{ width: '75%', textAlign: 'left' }}>DESCRIÇÃO DO SERVIÇO</th>
                      <th style={{ width: '25%', textAlign: 'right' }}>VALOR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.services.length === 0 ? (
                       <tr><td colSpan={2} style={{fontStyle:'italic', color:'#999', padding: '15px 0'}}>Nenhum serviço registrado.</td></tr>
                    ) : (
                        data.services.map((item, index) => (
                        <tr key={index}>
                            <td>{item.description}</td>
                            <td className="text-right">{formatMoney(item.price)}</td>
                        </tr>
                        ))
                    )}
                  </tbody>
                </table>
                <div className="subtotal-row">
                    <span>Subtotal Serviços:</span>
                    <span className="subtotal-value">{formatMoney(subtotalServices)}</span>
                </div>
              </div>

              {/* --- 5. TOTAL GERAL --- */}
              <div className="invoice-total-block">
                 <div className="total-line">
                    <span className="label-total">TOTAL GERAL</span>
                    <span className="value-total">{formatMoney(data.total)}</span>
                 </div>
              </div>

              {/* --- 6. OBSERVAÇÕES (NOVO) --- */}
              {data.publicNotes && data.publicNotes.trim() !== '' && (
                  <div className="table-section" style={{ marginTop: '30px', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                    <h3 className="section-title" style={{ marginBottom: '5px' }}>OBSERVAÇÕES / GARANTIA</h3>
                    <div style={{ fontSize: '10pt', lineHeight: '1.4', whiteSpace: 'pre-wrap', color: '#333' }}>
                        {data.publicNotes}
                    </div>
                  </div>
              )}

            </td>
          </tr>
        </tbody>

        {/* --- RODAPÉ FANTASMA (Reserva Espaço) --- */}
        <tfoot>
          <tr>
            <td className="footer-space-cell">
              <div className="footer-space"></div>
            </td>
          </tr>
        </tfoot>
      </table>

      {/* --- RODAPÉ FIXO REAL --- */}
      <div className="invoice-fixed-footer">
          <div className="signature-area">
             <div className="signature-block">
                <div className="sign-line"></div>
                <span className="sign-name">{settings.name}</span>
                <span className="sign-label">Responsável Técnico</span>
             </div>
             <div className="signature-block">
                <div className="sign-line"></div>
                <span className="sign-name">{data.clientName}</span>
                <span className="sign-label">Cliente</span>
             </div>
          </div>

          <div className="footer-text-block">
             <p className="declaration-text">
                Declaro ter recebido os serviços e produtos acima descritos em perfeito estado.
             </p>
             <p className="thank-you-msg">
                OBRIGADO PELA PREFERÊNCIA!
             </p>
          </div>
      </div>

    </div>
  );
};