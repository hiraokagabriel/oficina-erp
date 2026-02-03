import { WorkOrder, WorkshopSettings, STATUS_LABELS } from '../types';

export function printOS(data: WorkOrder, settings: WorkshopSettings) {
  if (!data) {
    console.error('Dados da OS não fornecidos para impressão');
    return;
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  // 🔧 CORREÇÃO: O sistema armazena valores como centavos (inteiros)
  // Exemplo: 15000 centavos = R$ 150,00
  const formatMoney = (val: number) => {
    const valueInReais = val / 100; // Converte centavos para reais
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valueInReais);
  };

  const subtotalParts = data.parts.reduce((acc, item) => acc + item.price, 0);
  const subtotalServices = data.services.reduce((acc, item) => acc + item.price, 0);

  const printContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>OS #${data.osNumber} - ${data.clientName}</title>
      <style>
        /* RESET */
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        /* 🖊️ CONFIGURAÇÃO DA PÁGINA COM ESPAÇO PARA RODAPÉ */
        @page {
          size: A4;
          margin: 15mm 15mm 75mm 15mm; /* Margem inferior maior para rodapé fixo */
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
          position: relative;
          padding-bottom: 0; /* Sem padding, o footer é fixo */
        }
        
        /* CONTAINER PRINCIPAL */
        .content-wrapper {
          padding: 0;
          min-height: 100%;
        }
        
        /* HEADER */
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
        
        .company-name, .client-name {
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
        
        /* LOGO AREA */
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
        }
        
        .divider {
          border: 0;
          border-top: 1px solid #ddd;
          margin: 15px 0;
        }
        
        /* META DADOS */
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
        
        .meta-value.status-print {
          font-size: 0.8rem;
          text-transform: uppercase;
          border: 1px solid #000;
          padding: 2px 6px;
          border-radius: 4px;
        }
        
        /* SEÇÕES */
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
        
        /* TABELAS */
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
        
        /* SUBTOTAIS */
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
        
        .subtotal-value {
          font-weight: 700;
          color: #000;
        }
        
        /* TOTAL GERAL */
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
        
        .table-section {
          margin-top: 30px;
          page-break-inside: avoid;
        }
        
        /* 🖊️ RODAPÉ FIXO EM TODAS AS PÁGINAS */
        .invoice-footer {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          width: 100%;
          background: white;
          padding: 15px 15mm 10mm 15mm;
          border-top: 2px solid #000;
          page-break-inside: avoid;
        }
        
        /* ✍️ ÁREA DE ASSINATURA COM ESPAÇO FÍSICO */
        .signature-area {
          display: flex;
          justify-content: space-between;
          gap: 30px;
          margin-bottom: 15px;
        }
        
        .signature-block {
          flex: 1;
          text-align: center;
        }
        
        /* Espaço para assinatura física: ~50mm de altura */
        .sign-space {
          height: 50mm;
          border-bottom: 1px solid #000;
          margin-bottom: 5px;
          position: relative;
        }
        
        .sign-name {
          display: block;
          font-size: 0.85rem;
          font-weight: 700;
          color: #000;
          margin-top: 3px;
        }
        
        .sign-label {
          display: block;
          font-size: 0.6rem;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-top: 2px;
        }
        
        .footer-text-block {
          text-align: center;
          border-top: 1px dashed #ddd;
          padding-top: 8px;
        }
        
        .declaration-text {
          font-size: 0.65rem;
          color: #333;
          margin-bottom: 3px;
        }
        
        .thank-you-msg {
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #8B5CF6;
        }
        
        /* Evita quebra de página em elementos críticos */
        .invoice-header,
        .invoice-meta-grid,
        .invoice-total-block {
          page-break-inside: avoid;
        }
      </style>
    </head>
    <body>
      <div class="content-wrapper">
        <!-- CABEÇALHO -->
        <header class="invoice-header">
          <div class="invoice-col supplier-col">
            <h4 class="label-sm">PRESTADOR DE SERVIÇO</h4>
            <h2 class="company-name">${settings.name || 'NOME DA OFICINA'}</h2>
            <p>${settings.address || 'Endereço não informado'}</p>
            <p>${settings.cnpj || 'CNPJ não informado'}</p>
            ${settings.technician ? `<p>Téc. Resp: ${settings.technician}</p>` : ''}
          </div>

          <div class="invoice-logo-area">
            <h1 class="invoice-main-title">ORDEM DE SERVIÇO</h1>
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

        <!-- DADOS DA OS -->
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

        <!-- PEÇAS -->
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

        <!-- SERVIÇOS -->
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

        <!-- TOTAL GERAL -->
        <div class="invoice-total-block">
          <div class="total-line">
            <span class="label-total">TOTAL GERAL</span>
            <span class="value-total">${formatMoney(data.total)}</span>
          </div>
        </div>

        <!-- OBSERVAÇÕES -->
        ${data.publicNotes && data.publicNotes.trim() !== '' ? `
          <div class="table-section" style="border-top: 1px solid #eee; padding-top: 10px">
            <h3 class="section-title" style="margin-bottom: 5px">OBSERVAÇÕES / GARANTIA</h3>
            <div style="font-size: 10pt; line-height: 1.4; white-space: pre-wrap; color: #333">
              ${data.publicNotes}
            </div>
          </div>
        ` : ''}
      </div>

      <!-- 🖊️ RODAPÉ FIXO - APARECE EM TODAS AS PÁGINAS -->
      <div class="invoice-footer">
        <div class="signature-area">
          <div class="signature-block">
            <div class="sign-space"></div>
            <span class="sign-name">${settings.name || 'Oficina'}</span>
            <span class="sign-label">Responsável Técnico</span>
          </div>
          <div class="signature-block">
            <div class="sign-space"></div>
            <span class="sign-name">${data.clientName}</span>
            <span class="sign-label">Cliente</span>
          </div>
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
    </body>
    </html>
  `;

  // Criar iframe invisível
  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';
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
      try {
        iframe.contentWindow?.print();
      } catch (err) {
        console.error('Erro ao imprimir:', err);
        alert('Erro ao abrir janela de impressão. Tente novamente.');
      }
      // Remover iframe após impressão
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 100);
    }, 250);
  } else {
    console.error('Não foi possível acessar o documento do iframe');
    document.body.removeChild(iframe);
  }
}
