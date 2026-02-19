import { WorkOrder, WorkshopSettings, STATUS_LABELS } from '../types';

// Variante de impressão: CLIENT = via do cliente (assina o mecânico), SHOP = via da oficina (assina o cliente)
export type PrintVariant = 'CLIENT' | 'SHOP';

// 🆕 Função auxiliar para sanitizar strings para nomes de arquivo
function sanitizeForFilename(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50);
}

export function printOS(data: WorkOrder, settings: WorkshopSettings, variant?: PrintVariant) {
  if (!data) {
    console.error('Dados da OS não fornecidos para impressão');
    return;
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const formatMoney = (val: number) => {
    const valueInReais = val / 100;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valueInReais);
  };

  const subtotalParts = data.parts.reduce((acc, item) => acc + item.price, 0);
  const subtotalServices = data.services.reduce((acc, item) => acc + item.price, 0);

  const osNumber = data.osNumber || 'SN';
  const clientName = sanitizeForFilename(data.clientName || 'Cliente');
  const vehicleModel = sanitizeForFilename(
    data.vehicle ? data.vehicle.split(' ').slice(0, 2).join(' ') : 'Veiculo'
  );

  let licensePlate = 'SemPlaca';
  if (data.vehicle) {
    const plateMatch = data.vehicle.match(/[A-Z]{3}[-]?[0-9][A-Z0-9][0-9]{2}/i);
    if (plateMatch) {
      licensePlate = sanitizeForFilename(plateMatch[0]);
    }
  }

  // Sufixo no título do documento conforme a via
  const variantSuffix =
    variant === 'CLIENT' ? '_ViaCliente'
    : variant === 'SHOP' ? '_ViaOficina'
    : '';

  const documentTitle = `OS_${osNumber}_${clientName}_${vehicleModel}_${licensePlate}${variantSuffix}`;

  // Rótulo exibido no cabeçalho da OS conforme a via
  const viaLabel =
    variant === 'CLIENT' ? ' — VIA DO CLIENTE'
    : variant === 'SHOP' ? ' — VIA DA OFICINA'
    : '';

  // Bloco de assinatura:
  // CLIENT → só mecânico assina (cliente leva)
  // SHOP   → só cliente assina  (oficina retém)
  // undefined → ambos (comportamento original)
  const signatureBlock = (() => {
    const mechBlock = `
      <div class="signature-block">
        <div class="sign-space"></div>
        <span class="sign-name">${data.technician || settings.name || 'Oficina'}</span>
        <span class="sign-label">Responsável Técnico</span>
      </div>`;

    const clientBlock = `
      <div class="signature-block">
        <div class="sign-space"></div>
        <span class="sign-name">${data.clientName}</span>
        <span class="sign-label">Cliente</span>
      </div>`;

    if (variant === 'CLIENT') return mechBlock;   // Via do cliente: mecânico assina
    if (variant === 'SHOP')   return clientBlock; // Via da oficina: cliente assina
    return mechBlock + clientBlock;               // Padrão: ambos
  })();

  const printContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>${documentTitle}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        @page {
          size: A4;
          margin: 15mm;
        }
        html, body {
          height: 100%;
          margin: 0;
          padding: 0;
        }
        body {
          font-family: 'Inter', Arial, sans-serif;
          background: #FFFFFF;
          color: #111;
          font-size: 11px;
          line-height: 1.5;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .page-container {
          display: table;
          width: 100%;
          height: 100%;
        }
        .page-header  { display: table-header-group; }
        .page-content { display: table-row-group; }
        .page-footer  { display: table-footer-group; page-break-inside: avoid; }

        .invoice-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 25px;
          padding-top: 20px;
        }
        .invoice-col { flex: 1; }
        .client-col  { text-align: right; }
        .label-sm {
          font-size: 0.65rem;
          color: #888;
          letter-spacing: 1px;
          margin-bottom: 4px;
          font-weight: 700;
          text-transform: uppercase;
          display: block;
        }
        .company-name, .client-name {
          font-size: 1.1rem;
          font-weight: 800;
          margin: 0 0 4px 0;
          text-transform: uppercase;
          color: #000;
        }
        .invoice-col p { margin: 2px 0; font-size: 0.8rem; color: #333; }
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
        .via-label {
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #8B5CF6;
          text-align: center;
          margin-top: 2px;
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
        }
        .divider { border: 0; border-top: 1px solid #ddd; margin: 15px 0; }
        .invoice-meta-grid {
          display: flex;
          justify-content: space-between;
          margin-bottom: 25px;
        }
        .meta-item { display: flex; flex-direction: column; }
        .meta-value { font-size: 1rem; font-weight: 600; margin-top: 4px; color: #000; }
        .meta-value.status-print {
          font-size: 0.8rem;
          text-transform: uppercase;
          border: 1px solid #000;
          padding: 2px 6px;
          border-radius: 4px;
        }
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
        .text-right { text-align: right; }
        .subtotal-row {
          text-align: right;
          font-size: 0.85rem;
          font-weight: 600;
          color: #444;
          padding: 8px 0;
          display: flex;
          justify-content: flex-end;
          gap: 20px;
        }
        .subtotal-value { font-weight: 700; color: #000; }
        .invoice-total-block {
          display: flex;
          justify-content: flex-end;
          margin-top: 20px;
          padding-top: 15px;
          border-top: 2px solid #000;
          page-break-inside: avoid;
        }
        .total-line { text-align: right; }
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
        .table-section { margin-top: 30px; page-break-inside: avoid; }
        .invoice-footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px dashed #000;
          page-break-inside: avoid;
        }
        .signature-area {
          display: flex;
          justify-content: space-around;
          gap: 30px;
          margin-bottom: 15px;
        }
        .signature-block { flex: 1; text-align: center; max-width: 240px; }
        .sign-space { height: 17mm; border-bottom: 1px solid #000; margin-bottom: 5px; }
        .sign-name  { display: block; font-size: 0.85rem; font-weight: 700; color: #000; margin-top: 3px; }
        .sign-label { display: block; font-size: 0.6rem; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
        .footer-text-block { text-align: center; border-top: 1px dashed #ddd; padding-top: 8px; }
        .declaration-text { font-size: 0.65rem; color: #333; margin-bottom: 3px; }
        .thank-you-msg {
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #8B5CF6;
        }
        .invoice-header,
        .invoice-meta-grid,
        .invoice-total-block { page-break-inside: avoid; }
      </style>
    </head>
    <body>
      <div class="page-container">
        <div class="page-content">
          <header class="invoice-header">
            <div class="invoice-col supplier-col">
              <h4 class="label-sm">PRESTADOR DE SERVIÇO</h4>
              <h2 class="company-name">${settings.name || 'NOME DA OFICINA'}</h2>
              <p>${settings.address || 'Endereço não informado'}</p>
              <p>${settings.cnpj || 'CNPJ não informado'}</p>
              ${data.technician ? `<p>Téc. Resp: ${data.technician}</p>` : ''}
            </div>
            <div class="invoice-logo-area">
              <h1 class="invoice-main-title">ORDEM DE SERVIÇO</h1>
              ${viaLabel ? `<p class="via-label">${viaLabel}</p>` : ''}
              <div class="invoice-logo-circle">AM</div>
            </div>
            <div class="invoice-col client-col">
              <h4 class="label-sm">CLIENTE</h4>
              <h2 class="client-name">${data.clientName}</h2>
              <p>${data.clientPhone}</p>
              <div style="margin-top: 8px">
                <p><strong>Veículo:</strong> ${data.vehicle}</p>
                <p><strong>KM:</strong> ${data.mileage}</p>
              </div>
            </div>
          </header>
          <hr class="divider" />
          <div class="invoice-meta-grid">
            <div class="meta-item">
              <span class="label-sm">NÚMERO OS</span>
              <span class="meta-value">#${data.osNumber}</span>
            </div>
            <div class="meta-item">
              <span class="label-sm">DATA EMISSÃO</span>
              <span class="meta-value">${formatDate(data.createdAt)}</span>
            </div>
            <div class="meta-item">
              <span class="label-sm">STATUS</span>
              <span class="meta-value status-print">${STATUS_LABELS[data.status]}</span>
            </div>
          </div>
          <hr class="divider" />
          <div class="table-section">
            <h3 class="section-title">PEÇAS E MATERIAIS</h3>
            <table class="invoice-items-table">
              <thead>
                <tr>
                  <th style="width: 75%; text-align: left">ITEM / DESCRIÇÃO</th>
                  <th style="width: 25%; text-align: right">VALOR</th>
                </tr>
              </thead>
              <tbody>
                ${data.parts.length === 0
                  ? '<tr><td colspan="2" style="font-style: italic; color: #999; padding: 15px 0">Nenhuma peça utilizada.</td></tr>'
                  : data.parts.map(item => `
                    <tr>
                      <td>${item.description}</td>
                      <td class="text-right">${formatMoney(item.price)}</td>
                    </tr>
                  `).join('')
                }
              </tbody>
            </table>
            <div class="subtotal-row">
              <span>Subtotal Peças:</span>
              <span class="subtotal-value">${formatMoney(subtotalParts)}</span>
            </div>
          </div>
          <div class="table-section">
            <h3 class="section-title">MÃO DE OBRA E SERVIÇOS</h3>
            <table class="invoice-items-table">
              <thead>
                <tr>
                  <th style="width: 75%; text-align: left">DESCRIÇÃO DO SERVIÇO</th>
                  <th style="width: 25%; text-align: right">VALOR</th>
                </tr>
              </thead>
              <tbody>
                ${data.services.length === 0
                  ? '<tr><td colspan="2" style="font-style: italic; color: #999; padding: 15px 0">Nenhum serviço registrado.</td></tr>'
                  : data.services.map(item => `
                    <tr>
                      <td>${item.description}</td>
                      <td class="text-right">${formatMoney(item.price)}</td>
                    </tr>
                  `).join('')
                }
              </tbody>
            </table>
            <div class="subtotal-row">
              <span>Subtotal Serviços:</span>
              <span class="subtotal-value">${formatMoney(subtotalServices)}</span>
            </div>
          </div>
          <div class="invoice-total-block">
            <div class="total-line">
              <span class="label-total">TOTAL GERAL</span>
              <span class="value-total">${formatMoney(data.total)}</span>
            </div>
          </div>
          ${data.publicNotes && data.publicNotes.trim() !== '' ? `
            <div class="table-section" style="border-top: 1px solid #eee; padding-top: 10px">
              <h3 class="section-title" style="margin-bottom: 5px">OBSERVAÇÕES / GARANTIA</h3>
              <div style="font-size: 10pt; line-height: 1.4; white-space: pre-wrap; color: #333">
                ${data.publicNotes}
              </div>
            </div>
          ` : ''}
        </div>
        <div class="page-footer">
          <div class="invoice-footer">
            <div class="signature-area">
              ${signatureBlock}
            </div>
            <div class="footer-text-block">
              <p class="declaration-text">
                Declaro ter recebido os serviços e produtos acima descritos em perfeito estado.
              </p>
              <p class="thank-you-msg">
                OBRIGADO PELA PREFERÊNCIA!
              </p>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const originalTitle = document.title;
  document.title = documentTitle;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(printContent);
    doc.close();

    iframe.contentWindow?.focus();
    setTimeout(() => {
      try {
        iframe.contentWindow?.print();
        console.log(`🖨️ Imprimindo: ${documentTitle}`);
      } catch (err) {
        console.error('Erro ao imprimir:', err);
        alert('Erro ao abrir janela de impressão.');
      }
      setTimeout(() => {
        document.body.removeChild(iframe);
        document.title = originalTitle;
      }, 500);
    }, 250);
  } else {
    console.error('Não foi possível acessar o documento do iframe');
    document.body.removeChild(iframe);
    document.title = originalTitle;
  }
}
