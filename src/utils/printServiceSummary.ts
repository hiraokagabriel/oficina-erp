import { WorkOrder, WorkshopSettings } from '../types';
import { buildServiceSummary, ServiceSummary, ServiceSummaryItem, ServiceSummaryOptions } from '../services/serviceSummary';
import { inspectionItemText, remainingLabel } from '../services/serviceSummaryView';
import { escapeHtml } from './html';
import { Money } from './helpers';

// Impressão A4/PDF do "Resumo do serviço" para o cliente. Mesmo mecanismo de printOS (iframe + print).
// Todo texto digitado passa por escapeHtml. Fontes >= 9pt; cinzas com contraste >= 4,5:1 no branco.

const sanitizeForFilename = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').substring(0, 50);

const itemRows = (items: ServiceSummaryItem[]): string =>
  items.map(i => `
      <tr>
        <td>${escapeHtml(i.description)}${i.warranty ? '' : ' <span class="tag">sem cobrança</span>'}</td>
        <td class="num">${Money.format(i.price)}</td>
      </tr>`).join('');

const section = (title: string, items: ServiceSummaryItem[]): string =>
  items.length === 0 ? '' : `
    <h2>${title}</h2>
    <table><tbody>${itemRows(items)}</tbody></table>`;

export function buildPrintServiceSummaryHtml(s: ServiceSummary): { printContent: string; documentTitle: string } {
  const documentTitle = `Resumo_OS_${s.osNumber || 'SN'}_${sanitizeForFilename(s.clientName || 'Cliente')}`;

  const groups = s.inspection.groups.map(g => `
    <div class="insp-group">
      <h3>${escapeHtml(g.label)} (${g.items.length})</h3>
      <ul class="recs">${g.items.map(i => `
        <li>${escapeHtml(inspectionItemText(i))}${i.note ? `<div class="note">${escapeHtml(i.note)}</div>` : ''}</li>`).join('')}
      </ul>
    </div>`).join('');
  const generalNote = s.inspection.generalNote
    ? `<div class="insp-group"><h3>Nota geral da vistoria</h3><p class="pre">${escapeHtml(s.inspection.generalNote)}</p></div>` : '';
  const recs = groups || generalNote ? `
    <h2>Itens da vistoria</h2>${groups}${generalNote}` : '';

  const notes = s.publicNotes ? `<h2>Observações</h2><p class="pre">${escapeHtml(s.publicNotes)}</p>` : '';
  const warranty = s.warranty.hasWarrantyItems ? `<p class="warranty">${escapeHtml(s.warranty.text)}</p>` : '';
  const empty = s.items.services.length + s.items.parts.length === 0 ? '<p>Nenhum item lançado.</p>' : '';

  const printContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(documentTitle)}</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 10.5pt; color: #111111; margin: 0; }
  header { border-bottom: 2px solid #111111; padding-bottom: 8px; margin-bottom: 12px; }
  header h1 { font-size: 16pt; margin: 0; }
  header .sub { font-size: 9pt; color: #444444; }
  h2 { font-size: 11pt; margin: 14px 0 4px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #999999; padding-bottom: 2px; break-after: avoid; page-break-after: avoid; }
  .meta { display: flex; flex-wrap: wrap; gap: 4px 24px; font-size: 10pt; }
  .meta span { color: #444444; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 4px; border-bottom: 1px solid #dddddd; vertical-align: top; }
  td.num { text-align: right; white-space: nowrap; width: 28%; }
  .tag { font-size: 9pt; color: #444444; font-style: italic; }
  .totals { margin-top: 14px; margin-left: auto; width: 60%; break-inside: avoid; page-break-inside: avoid; break-before: avoid; page-break-before: avoid; }
  .totals td { border-bottom: none; font-size: 11pt; }
  .totals tr.strong td { font-size: 13pt; font-weight: 700; border-top: 2px solid #111111; }
  h3 { font-size: 10.5pt; margin: 8px 0 2px; break-after: avoid; page-break-after: avoid; }
  .insp-group { break-inside: avoid; page-break-inside: avoid; }
  .recs { margin: 4px 0; padding-left: 18px; }
  .note { font-size: 9.5pt; color: #444444; }
  .warranty { font-size: 9.5pt; color: #333333; margin-top: 12px; border: 1px solid #999999; padding: 6px 8px; }
  .pre { white-space: pre-wrap; margin: 4px 0; }
  footer { margin-top: 18px; font-size: 9pt; color: #444444; }
  tr, li { page-break-inside: avoid; }
</style>
</head>
<body>
  <header>
    <h1>Resumo do serviço - OS ${s.osNumber}</h1>
    <div class="sub">${escapeHtml(s.workshop.name)}${s.workshop.cnpj ? ` - CNPJ ${escapeHtml(s.workshop.cnpj)}` : ''}${s.workshop.address ? ` - ${escapeHtml(s.workshop.address)}` : ''}</div>
  </header>
  <div class="meta">
    <div><span>Cliente:</span> <strong>${escapeHtml(s.clientName)}</strong></div>
    <div><span>Veículo:</span> <strong>${escapeHtml(s.vehicle)}</strong></div>
    ${s.mileage > 0 ? `<div><span>KM:</span> ${s.mileage.toLocaleString('pt-BR')}</div>` : ''}
    <div><span>Data da OS:</span> ${escapeHtml(s.osDate)}</div>
    ${s.expectedDate ? `<div><span>Previsão:</span> ${escapeHtml(s.expectedDate)}</div>` : ''}
    <div><span>Situação:</span> ${escapeHtml(s.statusText)}</div>
  </div>
  ${section('Serviços', s.items.services)}
  ${section('Peças', s.items.parts)}
  ${empty}
  <table class="totals"><tbody>
    <tr><td>Total</td><td class="num">${Money.format(s.totals.total)}</td></tr>
    ${s.totals.hasAdvance ? `<tr><td>Adiantamento recebido</td><td class="num">- ${Money.format(s.totals.advance)}</td></tr>` : ''}
    <tr class="strong"><td>${remainingLabel(s.totals.remaining)}</td><td class="num">${Money.format(s.totals.remaining)}</td></tr>
  </tbody></table>
  ${recs}
  ${notes}
  ${warranty}
  <footer>Resumo gerado em ${escapeHtml(s.generatedAt)}. Este documento não substitui a ordem de serviço.</footer>
</body>
</html>`;

  return { printContent, documentTitle };
}

export function printServiceSummary(os: WorkOrder, settings: WorkshopSettings, options: ServiceSummaryOptions = {}): void {
  const { printContent, documentTitle } = buildPrintServiceSummaryHtml(buildServiceSummary(os, settings, options));

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
  if (!doc) {
    document.body.removeChild(iframe);
    document.title = originalTitle;
    return;
  }
  doc.open();
  doc.write(printContent);
  doc.close();

  iframe.contentWindow?.focus();
  setTimeout(() => {
    try {
      iframe.contentWindow?.print();
    } catch (err) {
      console.error('Erro ao imprimir:', err);
      alert('Erro ao abrir janela de impressão.');
    }
    setTimeout(() => {
      document.body.removeChild(iframe);
      document.title = originalTitle;
    }, 500);
  }, 250);
}
