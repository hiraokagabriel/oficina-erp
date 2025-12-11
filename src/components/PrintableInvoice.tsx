import React from 'react';
import { WorkOrder, WorkshopSettings, STATUS_LABELS } from '../types';

interface PrintableInvoiceProps {
  data: WorkOrder | null;
  settings: WorkshopSettings;
  formatMoney: (val: number) => string;
}

export const PrintableInvoice: React.FC<PrintableInvoiceProps> = ({ data, settings, formatMoney }) => {
  if (!data) return null;

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const subtotalParts = data.parts.reduce((acc, item) => acc + item.price, 0);
  const subtotalServices = data.services.reduce((acc, item) => acc + item.price, 0);

  return (
    <div className="printable-invoice">
      
      {/* CABEÇALHO */}
      <header className="invoice-header">
        <div className="invoice-col supplier-col">
          <h4 className="label-sm">PRESTADOR DE SERVIÇO</h4>
          <h2 className="company-name">{settings.name || "NOME DA OFICINA"}</h2>
          <p>{settings.address || "Endereço não informado"}</p>
          <p>{settings.cnpj || "CNPJ não informado"}</p>
          <p>{settings.technician && `Téc. Resp: ${settings.technician}`}</p>
        </div>

        <div className="invoice-logo-area">
           <div className="invoice-logo-circle">
              {settings.name ? settings.name.charAt(0).toUpperCase() : "O"}
           </div>
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

      {/* DADOS DA OS */}
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
        <div className="meta-item">
          <span className="label-sm">TOTAL A PAGAR</span>
          <span className="meta-value highlight">{formatMoney(data.total)}</span>
        </div>
      </div>

      <hr className="divider" />

      {/* TABELA 1: PEÇAS */}
      <div className="table-section">
        <h3 className="section-title">PEÇAS E MATERIAIS</h3>
        <table className="invoice-table">
          <thead>
            <tr>
              <th style={{ width: '75%', textAlign: 'left' }}>ITEM / DESCRIÇÃO</th>
              <th style={{ width: '25%', textAlign: 'right' }}>VALOR</th>
            </tr>
          </thead>
          <tbody>
            {data.parts.length === 0 ? (
               <tr><td colSpan={2} style={{fontStyle:'italic', color:'#999', padding: '15px'}}>Nenhuma peça utilizada.</td></tr>
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

      {/* TABELA 2: SERVIÇOS */}
      <div className="table-section" style={{ marginTop: '30px' }}>
        <h3 className="section-title">MÃO DE OBRA E SERVIÇOS</h3>
        <table className="invoice-table">
          <thead>
            <tr>
              <th style={{ width: '75%', textAlign: 'left' }}>DESCRIÇÃO DO SERVIÇO</th>
              <th style={{ width: '25%', textAlign: 'right' }}>VALOR</th>
            </tr>
          </thead>
          <tbody>
            {data.services.length === 0 ? (
               <tr><td colSpan={2} style={{fontStyle:'italic', color:'#999', padding: '15px'}}>Nenhum serviço registrado.</td></tr>
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

      {/* TOTAL FINAL */}
      <div className="invoice-footer-total">
         <div className="total-line">
            <span className="label-total">TOTAL GERAL</span>
            <span className="value-total">{formatMoney(data.total)}</span>
         </div>
      </div>

      {/* ÁREA DE ASSINATURAS (ATUALIZADA) */}
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

      {/* MENSAGEM FINAL */}
      <div className="thank-you-msg">
         <p>Declaro ter recebido os serviços e produtos acima descritos em perfeito estado.</p>
         <p style={{ fontWeight: 'bold', marginTop: 10 }}>OBRIGADO PELA PREFERÊNCIA!</p>
      </div>

    </div>
  );
};