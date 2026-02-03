import { WorkOrder, WorkshopSettings, STATUS_LABELS } from '../types';

/**
 * Função de impressão de OS usando IFRAME (Método testado e funcionando)
 * 
 * Esta implementação usa a mesma técnica do módulo de Peças que FUNCIONA:
 * 1. Cria iframe invisível
 * 2. Escreve HTML completo dentro
 * 3. Imprime do iframe
 * 4. Remove iframe após impressão
 */
export function printWorkOrder(
  workOrder: WorkOrder,
  settings: WorkshopSettings,
  formatMoney: (val: number) => string
): void {
  // Sanitiza nome para PDF
  const sanitize = (str: string) => str
    .replace(/[^a-zA-Z0-9\\s-]/g, '')
    .replace(/\\s+/g, '_')
    .substring(0, 30);

  const clientName = sanitize(workOrder.clientName);
  const vehicle = sanitize(workOrder.vehicle.split(' - ')[0]);
  const pdfTitle = `OS-${workOrder.osNumber}_${clientName}_${vehicle}`;

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const subtotalParts = workOrder.parts.reduce((acc, item) => acc + item.price, 0);
  const subtotalServices = workOrder.services.reduce((acc, item) => acc + item.price, 0);

  // HTML completo com estilos inline
  const printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${pdfTitle}</title>
      <style>
        /* ==========================================================================
           ESTILOS DE IMPRESS\u00c3O - OS
           ========================================================================== */
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Inter', Helvetica, Arial, sans-serif;
          color: #111;
          background: #FFFFFF;
          padding: 15mm;
          font-size: 11px;
          line-height: 1.5;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        /* Layout Table */
        .invoice-layout-table {
          width: 100%;
          border-collapse: collapse;
        }
        
        .invoice-layout-table td {
          padding: 0;
          vertical-align: top;
        }
        
        /* Footer Space */
        .footer-space {
          display: block;
          width: 100%;
          height: 180px;
        }
        
        .invoice-fixed-footer {
          position: fixed;
          bottom: 0;
          left: 0;
          width: 100%;
          padding: 0 15mm 10mm 15mm;
          box-sizing: border-box;
          background-color: #FFFFFF;
          z-index: 9999;
        }
        
        /* Header */
        .invoice-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 25px;
          padding-top: 20px;
        }
        
        .invoice-col {
          flex: 1;
        }
        
        .client-col {
          text-align: right;
        }
        
        .label-sm {
          font-size: 0.65rem;
          color: #888;
          letter-spacing: 1px;
          margin-bottom: 4px;
          font-weight: 700;
          text-transform: uppercase;
          display: block;
        }
        
        .company-name,
        .client-name {
          font-size: 1.1rem;
          font-weight: 800;
          margin: 0 0 4px 0;
          text-transform: uppercase;
          color: #000;
        }
        
        .invoice-col p {
          margin: 2px 0;
          font-size: 0.8rem;
          color: #333;
        }
        
        /* Logo Area */
        .invoice-logo-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          align-items: center;
          gap: 8px;
        }
        
        .invoice-main-title {
          font-size: 0.8rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin: 0;
          color: #000;
          text-align: center;
          line-height: 1;
        }
        
        .invoice-logo-circle {
          width: 50px;
          height: 50px;
          background-color: #222;
          color: #fff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.4rem;
          font-weight: 800;
          letter-spacing: -1px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        .divider {
          border: 0;
          border-top: 1px solid #ddd;
          margin: 15px 0;
        }
        
        /* Meta Grid */
        .invoice-meta-grid {
          display: flex;
          justify-content: space-between;
          margin-bottom: 25px;
        }
        
        .meta-item {
          display: flex;
          flex-direction: column;
        }
        
        .meta-value {
          font-size: 1rem;
          font-weight: 600;
          margin-top: 4px;
          color: #000;
        }
        
        .meta-value.highlight {
          font-weight: 800;
        }
        
        .meta-value.status-print {
          font-size: 0.8rem;
          text-transform: uppercase;
          border: 1px solid #000;
          padding: 2px 6px;
          border-radius: 4px;
        }
        
        /* Section Titles */
        .section-title {
          color: #8B5CF6;
          font-size: 0.7rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin: 0 0 5px 0;
          border-bottom: 2px solid #8B5CF6;
          display: inline-block;
          padding-bottom: 2px;
        }
        
        /* Items Table */
        .invoice-items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 5px;
        }
        
        .invoice-items-table th {
          padding: 6px 0;
          border-bottom: 1px solid #bbb;
          font-size: 0.7rem;
          color: #444;
          text-transform: uppercase;
          font-weight: 700;
        }
        
        .invoice-items-table td {
          padding: 6px 0;
          border-bottom: 1px solid #eee;
          font-size: 0.85rem;
          color: #111;
        }
        
        .text-right {
          text-align: right;
        }
        
        /* Subtotals */
        .subtotal-row {
          text-align: right;
          font-size: 0.85rem;
          font-weight: 600;
          color: #444;
          padding: 8px 0;
          display: flex;
          justify-content: flex-end;
          gap: 20px;
          page-break-inside: avoid;
        }
        
        .subtotal-value {
          font-weight: 700;
          color: #000;
        }
        
        /* Total Block */
        .invoice-total-block {
          display: flex;
          justify-content: flex-end;
          margin-top: 20px;
          padding-top: 15px;
          border-top: 2px solid #000;
          page-break-inside: avoid;
        }
        
        .total-line {
          text-align: right;
        }
        
        .label-total {
          font-size: 0.9rem;
          letter-spacing: 1px;
          color: #8B5CF6;
          font-weight: 700;
          margin-right: 15px;
        }
        
        .value-total {
          font-weight: 900;
          color: #000;
          font-size: 1.8rem;
          line-height: 1;
        }
        
        /* Signatures */
        .signature-area {
          display: flex;
          justify-content: space-between;
          margin-top: 20px;
          margin-bottom: 20px;
          padding: 0 10px;
        }
        
        .signature-block {
          width: 40%;
          text-align: center;
        }
        
        .sign-line {
          border-top: 1px solid #000;
          margin-bottom: 5px;
          height: 1px;
          width: 100%;
        }
        
        .sign-name {
          display: block;
          font-size: 0.85rem;
          font-weight: 700;
          color: #000;
        }
        
        .sign-label {
          display: block;
          font-size: 0.6rem;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-top: 2px;
        }
        
        /* Footer Text */
        .footer-text-block {
          text-align: center;
          border-top: 1px dashed #ddd;
          padding-top: 10px;
        }
        
        .declaration-text {
          font-size: 0.65rem;
          color: #333;
          margin-bottom: 5px;
        }
        
        .thank-you-msg {
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #8B5CF6;
        }
        
        @page {
          margin: 0;
          size: A4;
        }
      </style>
    </head>
    <body>
      <table class="invoice-layout-table">
        <tbody>
          <tr>
            <td>
              <!-- Header -->
              <header class="invoice-header">
                <div class="invoice-col supplier-col">
                  <h4 class="label-sm">PRESTADOR DE SERVI\u00c7O</h4>
                  <h2 class="company-name">${settings.name || "NOME DA OFICINA"}</h2>
                  <p>${settings.address || "Endere\u00e7o n\u00e3o informado"}</p>
                  <p>${settings.cnpj || "CNPJ n\u00e3o informado"}</p>
                  ${settings.technician ? `<p>T\u00e9c. Resp: ${settings.technician}</p>` : ''}
                </div>

                <div class="invoice-logo-area">
                  <h1 class="invoice-main-title">ORDEM DE SERVI\u00c7O</h1>
                  <div class="invoice-logo-circle">AM</div>
                </div>

                <div class="invoice-col client-col">
                  <h4 class="label-sm">CLIENTE</h4>
                  <h2 class="client-name">${workOrder.clientName}</h2>
                  <p>${workOrder.clientPhone}</p>
                  <div style="margin-top: 8px;">
                    <p><strong>Ve\u00edculo:</strong> ${workOrder.vehicle}</p>
                    <p><strong>KM:</strong> ${workOrder.mileage}</p>
                  </div>
                </div>
              </header>

              <hr class="divider" />

              <!-- Meta Data -->
              <div class="invoice-meta-grid">
                <div class="meta-item">
                  <span class="label-sm">N\u00daMERO OS</span>
                  <span class="meta-value">#${workOrder.osNumber}</span>
                </div>
                <div class="meta-item">
                  <span class="label-sm">DATA EMISS\u00c3O</span>
                  <span class="meta-value">${formatDate(workOrder.createdAt)}</span>
                </div>
                <div class="meta-item">
                  <span class="label-sm">STATUS</span>
                  <span class="meta-value status-print">${STATUS_LABELS[workOrder.status]}</span>
                </div>
              </div>

              <hr class="divider" />

              <!-- Parts Table -->
              <div class="table-section">
                <h3 class="section-title">PE\u00c7AS E MATERIAIS</h3>
                <table class="invoice-items-table">
                  <thead>
                    <tr>
                      <th style="width: 75%; text-align: left;">ITEM / DESCRI\u00c7\u00c3O</th>
                      <th style="width: 25%; text-align: right;">VALOR</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${workOrder.parts.length === 0 
                      ? '<tr><td colspan="2" style="font-style: italic; color: #999; padding: 15px 0;">Nenhuma pe\u00e7a utilizada.</td></tr>'
                      : workOrder.parts.map(item => `
                          <tr>
                            <td>${item.description}</td>
                            <td class="text-right">${formatMoney(item.price)}</td>
                          </tr>
                        `).join('')
                    }
                  </tbody>
                </table>
                <div class="subtotal-row">
                  <span>Subtotal Pe\u00e7as:</span>
                  <span class="subtotal-value">${formatMoney(subtotalParts)}</span>
                </div>
              </div>

              <!-- Services Table -->
              <div class="table-section" style="margin-top: 30px;">
                <h3 class="section-title">M\u00c3O DE OBRA E SERVI\u00c7OS</h3>
                <table class="invoice-items-table">
                  <thead>
                    <tr>
                      <th style="width: 75%; text-align: left;">DESCRI\u00c7\u00c3O DO SERVI\u00c7O</th>
                      <th style="width: 25%; text-align: right;">VALOR</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${workOrder.services.length === 0
                      ? '<tr><td colspan="2" style="font-style: italic; color: #999; padding: 15px 0;">Nenhum servi\u00e7o registrado.</td></tr>'
                      : workOrder.services.map(item => `
                          <tr>
                            <td>${item.description}</td>
                            <td class="text-right">${formatMoney(item.price)}</td>
                          </tr>
                        `).join('')
                    }
                  </tbody>
                </table>
                <div class="subtotal-row">
                  <span>Subtotal Servi\u00e7os:</span>
                  <span class="subtotal-value">${formatMoney(subtotalServices)}</span>
                </div>
              </div>

              <!-- Total -->
              <div class="invoice-total-block">
                <div class="total-line">
                  <span class="label-total">TOTAL GERAL</span>
                  <span class="value-total">${formatMoney(workOrder.total)}</span>
                </div>
              </div>

              <!-- Public Notes -->
              ${workOrder.publicNotes && workOrder.publicNotes.trim() !== '' ? `
                <div class="table-section" style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;">
                  <h3 class="section-title" style="margin-bottom: 5px;">OBSERVA\u00c7\u00d5ES / GARANTIA</h3>
                  <div style="font-size: 10pt; line-height: 1.4; white-space: pre-wrap; color: #333;">
                    ${workOrder.publicNotes}
                  </div>
                </div>
              ` : ''}
            </td>
          </tr>
        </tbody>

        <!-- Footer Space -->
        <tfoot>
          <tr>
            <td>
              <div class="footer-space"></div>
            </td>
          </tr>
        </tfoot>
      </table>

      <!-- Fixed Footer -->
      <div class="invoice-fixed-footer">
        <div class="signature-area">
          <div class="signature-block">
            <div class="sign-line"></div>
            <span class="sign-name">${settings.name}</span>
            <span class="sign-label">Respons\u00e1vel T\u00e9cnico</span>
          </div>
          <div class="signature-block">
            <div class="sign-line"></div>
            <span class="sign-name">${workOrder.clientName}</span>
            <span class="sign-label">Cliente</span>
          </div>
        </div>

        <div class="footer-text-block">
          <p class="declaration-text">
            Declaro ter recebido os servi\u00e7os e produtos acima descritos em perfeito estado.
          </p>
          <p class="thank-you-msg">
            OBRIGADO PELA PREFER\u00caNCIA!
          </p>
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
      setTimeout(() => {
        document.body.removeChild(iframe);
        // Restaurar título
        document.title = 'Oficina ERP';
      }, 100);
    }, 250);
  }
}
