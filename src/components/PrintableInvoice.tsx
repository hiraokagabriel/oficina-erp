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
      <div className="terms-page">
        <div className="terms-header">
          <div className="terms-logo-area">
            <div className="invoice-logo-circle" style={{ margin: '0 auto 12px auto' }}>AM</div>
            <h1 className="terms-main-title">{settings.name || 'OFICINA MECÂNICA'}</h1>
            <p className="terms-subtitle">TERMOS E CONDIÇÕES DE SERVIÇO</p>
          </div>
        </div>

        <hr className="divider" />

        <div className="terms-body">
          <div className="terms-clause">
            <h3>1. AUTORIZAÇÃO DE SERVIÇO</h3>
            <p>O cliente autoriza a execução dos serviços descritos nesta Ordem de Serviço, tendo sido previamente informado sobre os procedimentos, peças a serem utilizadas e valores estimados. A assinatura desta OS representa ciência e aceite integral dos termos aqui descritos.</p>
          </div>

          <div className="terms-clause">
            <h3>2. ORÇAMENTO E APROVAÇÃO</h3>
            <p>O orçamento aprovado pelo cliente é válido por 5 (cinco) dias úteis. A elaboração do orçamento técnico tem custo de <strong>R$ 150,00</strong>, referente à mão de obra de diagnóstico e avaliação. Este valor será <strong>integralmente abatido</strong> do valor final caso o cliente aprove e execute o serviço na oficina. Em caso de não aprovação, o valor será cobrado na íntegra. Caso durante a execução do serviço sejam identificados problemas adicionais, o cliente será consultado antes de qualquer serviço extra ser realizado. Serviços não autorizados não serão cobrados.</p>
          </div>

          <div className="terms-clause">
            <h3>3. PRAZO DE ENTREGA</h3>
            <p>O prazo de entrega informado é estimado e pode sofrer alterações em razão de disponibilidade de peças, complexidade do serviço ou fatores externos. O cliente será notificado prontamente em caso de alteração no prazo.</p>
          </div>

          <div className="terms-clause">
            <h3>4. GARANTIA DOS SERVIÇOS</h3>
            <p>Os serviços prestados possuem garantia de <strong>90 (noventa) dias</strong> a partir da data de entrega do veículo, conforme o Código de Defesa do Consumidor (Lei nº 8.078/1990). A garantia cobre exclusivamente os serviços executados e peças fornecidas pela oficina, ficando excluídos danos causados por mau uso, acidentes, modificações externas ou falta de manutenção pelo cliente.</p>
          </div>

          <div className="terms-clause">
            <h3>5. PEÇAS E MATERIAIS</h3>
            <p>As peças fornecidas pela oficina são originais ou de qualidade equivalente, devidamente documentadas. O cliente poderá optar por fornecer suas próprias peças, desde que em conformidade técnica, sendo a garantia do serviço limitada neste caso. Caso o cliente opte por fornecer suas próprias peças, será cobrada uma taxa de <strong>R$ 15,00 por dia</strong> referente ao período em que o veículo permanecer na oficina aguardando a entrega das peças pelo cliente. Peças substituídas ficarão à disposição do cliente por até 24 horas após a entrega.</p>
          </div>

          <div className="terms-clause">
            <h3>6. RESPONSABILIDADE SOBRE O VEÍCULO</h3>
            <p>A oficina não se responsabiliza por objetos pessoais deixados no interior do veículo, danos pré-existentes não documentados na entrada ou problemas decorrentes de desgaste natural não relacionado ao serviço contratado.</p>
          </div>

          <div className="terms-clause">
            <h3>7. ARMAZENAGEM</h3>
            <p>Após a conclusão do serviço e notificação ao cliente, o veículo poderá ser armazenado por até <strong>3 (três) dias úteis</strong> sem custo adicional. Após esse prazo, poderá ser cobrada taxa de armazenagem de R$ 50,00 por dia.</p>
          </div>

          <div className="terms-clause">
            <h3>8. PAGAMENTO</h3>
            <p>O pagamento deverá ser efetuado na retirada do veículo, nas condições acordadas no orçamento. O veículo somente será liberado após a quitação integral dos serviços prestados, conforme art. 578 do Código Civil (direito de retenção).</p>
          </div>

          <div className="terms-clause">
            <h3>9. DADOS PESSOAIS (LGPD)</h3>
            <p>Os dados pessoais coletados são utilizados exclusivamente para fins de prestação de serviço, emissão de documentos fiscais e comunicação com o cliente, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).</p>
          </div>

          <div className="terms-clause">
            <h3>10. FORO</h3>
            <p>Fica eleito o foro da comarca de <strong>São Paulo – SP</strong> para dirimir quaisquer controvérsias decorrentes desta relação de consumo.</p>
          </div>
        </div>

        <hr className="divider" style={{ marginTop: 24 }} />

        <div className="terms-footer">
          <p style={{ fontSize: '8pt', color: '#666', textAlign: 'center' }}>
            {settings.name} &nbsp;|&nbsp; {settings.address} &nbsp;|&nbsp; {settings.cnpj}
          </p>
        </div>
      </div>

      <table className="invoice-layout-table">
        <tbody>
          <tr>
            <td className="invoice-content-cell">
              <header className="invoice-header">
                <div className="invoice-col supplier-col">
                  <h4 className="label-sm">PRESTADOR DE SERVIÇO</h4>
                  <h2 className="company-name">{settings.name || "NOME DA OFICINA"}</h2>
                  <p>{settings.address || "Endereço não informado"}</p>
                  <p>{settings.cnpj || "CNPJ não informado"}</p>
                </div>

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

              <table className="invoice-category-table">
                <thead>
                  <tr>
                    <th colSpan={2} className="category-title-cell">
                      PEÇAS E MATERIAIS
                    </th>
                  </tr>
                  <tr className="category-col-header">
                    <th style={{ width: '75%', textAlign: 'left' }}>ITEM / DESCRIÇÃO</th>
                    <th style={{ width: '25%', textAlign: 'right' }}>VALOR</th>
                  </tr>
                </thead>
                <tbody>
                  {data.parts.length === 0 ? (
                    <tr>
                      <td colSpan={2} style={{ fontStyle: 'italic', color: '#999', padding: '15px 0' }}>
                        Nenhuma peça utilizada.
                      </td>
                    </tr>
                  ) : (
                    data.parts.map((item, index) => (
                      <tr key={index}>
                        <td>{item.description}</td>
                        <td className="text-right">{formatMoney(item.price)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="category-subtotal-row">
                    <td>Subtotal Peças:</td>
                    <td className="text-right subtotal-value">{formatMoney(subtotalParts)}</td>
                  </tr>
                </tfoot>
              </table>

              <table className="invoice-category-table" style={{ marginTop: '20px' }}>
                <thead>
                  <tr>
                    <th colSpan={2} className="category-title-cell">
                      MÃO DE OBRA E SERVIÇOS
                    </th>
                  </tr>
                  <tr className="category-col-header">
                    <th style={{ width: '75%', textAlign: 'left' }}>DESCRIÇÃO DO SERVIÇO</th>
                    <th style={{ width: '25%', textAlign: 'right' }}>VALOR</th>
                  </tr>
                </thead>
                <tbody>
                  {data.services.length === 0 ? (
                    <tr>
                      <td colSpan={2} style={{ fontStyle: 'italic', color: '#999', padding: '15px 0' }}>
                        Nenhum serviço registrado.
                      </td>
                    </tr>
                  ) : (
                    data.services.map((item, index) => (
                      <tr key={index}>
                        <td>{item.description}</td>
                        <td className="text-right">{formatMoney(item.price)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="category-subtotal-row">
                    <td>Subtotal Serviços:</td>
                    <td className="text-right subtotal-value">{formatMoney(subtotalServices)}</td>
                  </tr>
                </tfoot>
              </table>

              <div className="invoice-total-block">
                 <div className="total-line">
                    <span className="label-total">TOTAL GERAL</span>
                    <span className="value-total">{formatMoney(data.total)}</span>
                 </div>
              </div>

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

        <tfoot>
          <tr>
            <td className="footer-space-cell">
              <div className="footer-space"></div>
            </td>
          </tr>
        </tfoot>
      </table>

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
