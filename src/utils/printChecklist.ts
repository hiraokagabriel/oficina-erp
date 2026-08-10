import {
  WorkOrder,
  WorkshopSettings,
  ChecklistSchema,
  InspectionStatus,
  INSPECTION_STATUS_META,
} from '../types';

// Cor sólida por status para impressão (sem rgba)
const STATUS_PRINT_COLOR: Record<InspectionStatus, string> = {
  pending:   '#BDBDBD',
  ok:        '#43A047',
  attention: '#FB8C00',
  urgent:    '#E53935',
};

// Cor de fundo suave por status
const STATUS_BG_COLOR: Record<InspectionStatus, string> = {
  pending:   'transparent',
  ok:        '#E8F5E9',
  attention: '#FFF3E0',
  urgent:    '#FFEBEE',
};

function sanitizeForFilename(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50);
}

export function printChecklist(
  os: WorkOrder,
  checklist: ChecklistSchema,
  settings: WorkshopSettings,
) {
  if (!os || !checklist) {
    console.error('Dados insuficientes para imprimir o checklist');
    return;
  }

  const formatDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');

  // Resumo de status para o cabeçalho
  const allItems = checklist.categories.flatMap(c => c.items);
  const counts = allItems.reduce(
    (acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; },
    {} as Record<InspectionStatus, number>
  );

  const totalItems   = allItems.length;
  const inspectedQty = totalItems - (counts.pending || 0);

  // Título do documento (nome do arquivo ao salvar PDF)
  const docTitle = `Checklist_OS${os.osNumber}_${sanitizeForFilename(os.vehicle)}`;

  // ---- Legenda de status ----
  const legendHtml = (Object.entries(INSPECTION_STATUS_META) as [InspectionStatus, { label: string; emoji: string }][]).map(
    ([key, meta]) => `
      <span class="legend-item">
        <span class="legend-dot" style="background:${STATUS_PRINT_COLOR[key]}"></span>
        ${meta.label}
        ${counts[key] ? `<strong>(${counts[key]})</strong>` : ''}
      </span>
    `
  ).join('');

  // ---- Grid de categorias ----
  const categoriesHtml = checklist.categories.map(cat => {
    const itemsHtml = cat.items.map(item => `
      <tr style="background:${STATUS_BG_COLOR[item.status]}">
        <td class="item-dot-cell">
          <span class="item-dot" style="background:${STATUS_PRINT_COLOR[item.status]}"></span>
        </td>
        <td class="item-label-cell">${item.label}</td>
      </tr>
    `).join('');

    return `
      <div class="category-card">
        <div class="category-title">${cat.label.toUpperCase()}</div>
        <table class="items-table">
          <tbody>
            ${itemsHtml}
            ${cat.items.length === 0 ? '<tr><td colspan="2" class="empty-cat">Nenhum item</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    `;
  }).join('');

  const printContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>${docTitle}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        @page {
          size: A4;
          margin: 12mm 14mm;
        }

        body {
          font-family: 'Inter', Arial, sans-serif;
          background: #fff;
          color: #111;
          font-size: 10px;
          line-height: 1.4;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        /* ---- Cabeçalho ---- */
        .doc-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 10px;
          padding-bottom: 10px;
          border-bottom: 2px solid #111;
        }
        .header-shop {
          flex: 1;
        }
        .shop-name {
          font-size: 1.3rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #000;
          margin-bottom: 2px;
        }
        .shop-sub {
          font-size: 0.75rem;
          color: #555;
        }
        .header-center {
          flex: 1;
          text-align: center;
        }
        .doc-title {
          font-size: 1rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #8B5CF6;
          margin-bottom: 2px;
        }
        .doc-os {
          font-size: 0.75rem;
          color: #555;
        }
        .header-vehicle {
          flex: 1;
          text-align: right;
        }
        .vehicle-name {
          font-size: 1rem;
          font-weight: 800;
          color: #000;
          margin-bottom: 2px;
        }
        .header-vehicle p {
          font-size: 0.78rem;
          color: #444;
          margin: 1px 0;
        }

        /* ---- Resumo de inspecção ---- */
        .inspection-summary {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #F5F5F5;
          border-radius: 5px;
          padding: 5px 10px;
          margin-bottom: 8px;
          font-size: 0.78rem;
        }
        .summary-progress {
          font-weight: 700;
          color: #8B5CF6;
        }
        .legend-bar {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .legend-item {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: #333;
          font-size: 0.75rem;
        }
        .legend-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          display: inline-block;
          flex-shrink: 0;
        }

        /* ---- Grid de categorias ---- */
        .categories-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 7px;
          margin-bottom: 10px;
        }

        .category-card {
          border: 1px solid #ddd;
          border-radius: 5px;
          overflow: hidden;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .category-title {
          background: #F0EBFF;
          color: #5B21B6;
          font-size: 0.65rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          padding: 4px 8px;
          border-bottom: 1px solid #DDD6FE;
        }

        /* ---- Tabela de itens ---- */
        .items-table {
          width: 100%;
          border-collapse: collapse;
        }

        .items-table tr {
          border-bottom: 1px solid #F0F0F0;
        }

        .items-table tr:last-child {
          border-bottom: none;
        }

        .item-dot-cell {
          width: 20px;
          padding: 3px 5px;
          vertical-align: middle;
        }

        .item-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
        }

        .item-label-cell {
          padding: 3px 6px 3px 0;
          font-size: 0.82rem;
          color: #222;
        }

        .empty-cat {
          padding: 4px 8px;
          font-style: italic;
          color: #999;
          font-size: 0.75rem;
        }

        /* ---- Observações ---- */
        .obs-section {
          border: 1px solid #ddd;
          border-radius: 5px;
          padding: 7px 10px;
          margin-bottom: 12px;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .obs-title {
          font-size: 0.65rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #8B5CF6;
          margin-bottom: 4px;
        }
        .obs-text {
          font-size: 0.85rem;
          color: #333;
          white-space: pre-wrap;
          min-height: 20px;
        }

        /* ---- Rodapé / assinatura ---- */
        .doc-footer {
          border-top: 1px dashed #aaa;
          padding-top: 10px;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .signature-area {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 8px;
        }
        .signature-block {
          flex: 1;
          text-align: center;
        }
        .sign-line {
          border-bottom: 1px solid #000;
          height: 14mm;
          margin-bottom: 4px;
        }
        .sign-name  { font-size: 0.78rem; font-weight: 700; }
        .sign-label { font-size: 0.6rem; color: #666; text-transform: uppercase; letter-spacing: 0.05em; }
        .footer-center {
          text-align: center;
          border-top: 1px dashed #ddd;
          padding-top: 6px;
          margin-top: 8px;
        }
        .footer-declaration { font-size: 0.65rem; color: #444; margin-bottom: 3px; }
        .footer-thankyou {
          font-size: 0.68rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #8B5CF6;
        }
      </style>
    </head>
    <body>

      <!-- CABEÇALHO -->
      <div class="doc-header">
        <div class="header-shop">
          <div class="shop-name">${settings.name || 'OFICINA'}</div>
          <div class="shop-sub">${settings.address || ''}</div>
          <div class="shop-sub">${settings.cnpj ? `CNPJ: ${settings.cnpj}` : ''}</div>
        </div>

        <div class="header-center">
          <div class="doc-title">Checklist de Inspeção Veicular</div>
          <div class="doc-os">OS #${os.osNumber} &mdash; ${formatDate(checklist.inspectedAt)}</div>
          ${os.technician ? `<div class="doc-os">Téc: ${os.technician}</div>` : ''}
        </div>

        <div class="header-vehicle">
          <div class="vehicle-name">${os.vehicle}</div>
          <p><strong>Cliente:</strong> ${os.clientName}</p>
          <p><strong>Telefone:</strong> ${os.clientPhone || '-'}</p>
          <p><strong>KM entrada:</strong> ${checklist.mileageIn ?? os.mileage ?? '-'}</p>
        </div>
      </div>

      <!-- RESUMO DE INSPECÇÃO -->
      <div class="inspection-summary">
        <span class="summary-progress">
          Itens inspecionados: ${inspectedQty} / ${totalItems}
        </span>
        <div class="legend-bar">${legendHtml}</div>
      </div>

      <!-- GRID DE CATEGORIAS -->
      <div class="categories-grid">
        ${categoriesHtml}
      </div>

      <!-- OBSERVAÇÕES -->
      <div class="obs-section">
        <div class="obs-title">Observações</div>
        <div class="obs-text">${checklist.notes || 'Nenhuma observação.'}</div>
      </div>

      <!-- RODAPÉ -->
      <div class="doc-footer">
        <div class="signature-area">
          <div class="signature-block">
            <div class="sign-line"></div>
            <span class="sign-name">${os.technician || settings.name || 'Responsável'}</span>
            <span class="sign-label">Técnico Responsável</span>
          </div>
          <div class="signature-block">
            <div class="sign-line"></div>
            <span class="sign-name">${os.clientName}</span>
            <span class="sign-label">Cliente</span>
          </div>
          <div class="signature-block">
            <div class="sign-line"></div>
            <span class="sign-name">_____ / _____ / _________</span>
            <span class="sign-label">Data</span>
          </div>
        </div>
        <div class="footer-center">
          <p class="footer-declaration">
            Declaro que o veículo foi recebido e inspecionado conforme os itens acima.
          </p>
          <p class="footer-thankyou">Obrigado pela preferência!</p>
        </div>
      </div>

    </body>
    </html>
  `;

  const originalTitle = document.title;
  document.title = docTitle;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.width    = '0';
  iframe.style.height   = '0';
  iframe.style.border   = 'none';
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
      } catch (err) {
        console.error('Erro ao imprimir checklist:', err);
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
