import { STATUS_LABELS, PART_CATEGORY_META } from '../types';
import type { WorkshopSettings } from '../types';
import { escapeHtml } from './html';
import { printHtml } from './documentOutput';
import type { PartsToBuyPlan, PartsOSGroup, PartRow, RepeatedPart } from '../services/partsToBuy';

// Impressão de "Peças a comprar": lista A4 preto e branco para o balcão e o fornecedor.
// Sem cor, gradiente, sombra ou emoji. Todo texto digitado passa por escapeHtml e nada digitado entra no <style>.

const pad2 = (n: number): string => String(n).padStart(2, '0');

const BOX = '<svg class="box" viewBox="0 0 12 12" aria-hidden="true"><rect x="0.5" y="0.5" width="11" height="11" fill="none" stroke="#000000" stroke-width="1"/></svg>';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

const categoryLabel = (r: { category?: PartRow['category'] }): string =>
  r.category && PART_CATEGORY_META[r.category] ? PART_CATEGORY_META[r.category].label : '';

function rowHtml(r: PartRow): string {
  const cat = categoryLabel(r);
  return `<tr>
    <td class="c-box">${BOX}</td>
    <td class="c-desc">${escapeHtml(r.description)}${cat ? `<div class="cat">${escapeHtml(cat)}</div>` : ''}</td>
    <td class="c-qty num">${r.quantity}</td>
    <td class="c-obs"></td>
  </tr>`;
}

function osSubtitle(g: PartsOSGroup): string {
  const client = g.clientName || 'Cliente não informado';
  return `<span class="os-n">OS ${g.osNumber}</span><span class="sep"> &middot; </span><span class="os-client">${escapeHtml(client)}</span><span class="sep"> &middot; </span><span class="os-car">${escapeHtml(g.vehicle.label)}</span>`;
}

function osTableHtml(g: PartsOSGroup): string {
  return `<table class="os">
    <colgroup><col class="k-box"><col><col class="k-qty"><col class="k-obs"></colgroup>
    <thead>
      <tr><th colspan="4" class="os-head">${osSubtitle(g)}</th></tr>
      <tr class="cols"><th></th><th>Peça</th><th class="num">Qtd</th><th>Observação (preço / fornecedor)</th></tr>
    </thead>
    <tbody>${g.rows.map(rowHtml).join('')}</tbody>
  </table>`;
}

function repeatedHtml(list: RepeatedPart[]): string {
  if (list.length === 0) return '';
  const rows = list.map(p => {
    const cat = categoryLabel(p);
    const orders = p.orders.map(o => `OS ${o.osNumber}${o.clientName ? ` ${escapeHtml(o.clientName)}` : ''}`).join(' &middot; ');
    return `<tr>
      <td class="c-box">${BOX}</td>
      <td class="c-desc">${escapeHtml(p.description)}${cat ? `<div class="cat">${escapeHtml(cat)}</div>` : ''}<div class="cat">${escapeHtml(p.vehicle.label)}</div></td>
      <td class="c-qty num">${p.quantity}</td>
      <td class="c-obs2">${orders}</td>
    </tr>`;
  }).join('');
  return `<section class="repeated">
    <div class="band"><span>Para comprar junto (mesma peça, mesmo carro)</span><span class="band-n">${plural(list.length, 'item', 'itens')}</span></div>
    <table class="os">
      <colgroup><col class="k-box"><col><col class="k-qty"><col class="k-obs2"></colgroup>
      <thead><tr class="cols"><th></th><th>Peça e carro</th><th class="num">Total</th><th>Ordens de serviço</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

/** Monta o HTML e o título do documento (sem imprimir): separado para poder ser testado. */
export function buildPartsToBuyHtml(
  plan: PartsToBuyPlan,
  settings: Pick<WorkshopSettings, 'name'>,
  opts: { now?: Date } = {},
): { printContent: string; docTitle: string } {
  const now = opts.now ?? new Date();
  const dateText = now.toLocaleDateString('pt-BR');
  const docTitle = `Pecas_a_comprar_${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const { distinct, units, orders } = plan.totals;
  const summary = `${plural(distinct, 'item', 'itens')} &middot; ${plural(units, 'unidade', 'unidades')} &middot; ${plural(orders, 'OS', 'OS')}`;

  const sectionsHtml = plan.sections.length > 0
    ? plan.sections.map(sec => `<section class="status">
        <div class="band"><span>${escapeHtml(STATUS_LABELS[sec.status] ?? sec.status)}</span><span class="band-n">${plural(sec.itemCount, 'item', 'itens')} &middot; ${plural(sec.unitCount, 'unidade', 'unidades')}</span></div>
        ${sec.groups.map(osTableHtml).join('')}
      </section>`).join('')
    : '<p class="empty">Nenhuma peça selecionada.</p>';

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
          margin: 14mm 14mm 18mm 14mm;
          @bottom-left {
            content: "Peças a comprar";
            font-family: 'Inter', Arial, sans-serif;
            font-size: 8pt;
            color: #444444;
          }
          @bottom-right {
            content: "Página " counter(page) " de " counter(pages);
            font-family: 'Inter', Arial, sans-serif;
            font-size: 8pt;
            color: #444444;
          }
        }

        body {
          font-family: 'Inter', Arial, sans-serif;
          background: #ffffff;
          color: #111111;
          font-size: 10.5pt;
          line-height: 1.35;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .num { font-variant-numeric: tabular-nums; }

        /* ---- Cabeçalho ---- */
        .doc-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm; padding-bottom: 2.5mm; border-bottom: 1.5pt solid #000000; }
        .doc-title { font-size: 20pt; font-weight: 700; color: #000000; line-height: 1.1; }
        .doc-meta { text-align: right; font-size: 10pt; color: #333333; }
        .shop-name { font-size: 12pt; font-weight: 700; color: #000000; }
        .summary { margin: 3mm 0 6mm; font-size: 10.5pt; color: #111111; }
        .empty { margin: 8mm 0; font-size: 11pt; color: #333333; }

        /* ---- Faixa de situação ---- */
        section.status, section.repeated { margin-bottom: 7mm; }
        .band {
          display: flex; justify-content: space-between; align-items: baseline;
          background: #e6e6e6; border-top: 1.5pt solid #000000; border-bottom: 0.5pt solid #000000;
          padding: 1.6mm 3mm; margin-bottom: 3mm;
          font-size: 12pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #000000;
          break-after: avoid; page-break-after: avoid;
        }
        .band-n { font-size: 9.5pt; font-weight: 400; text-transform: none; letter-spacing: 0; color: #222222; }

        /* ---- Tabela por OS ---- */
        table.os { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 5mm; }
        table.os col.k-box { width: 10mm; }
        table.os col.k-qty { width: 17mm; }
        table.os col.k-obs { width: 62mm; }
        table.os col.k-obs2 { width: 62mm; }
        thead { display: table-header-group; }
        thead tr { break-after: avoid; page-break-after: avoid; }
        tr { break-inside: avoid; page-break-inside: avoid; }
        th.os-head { text-align: left; padding: 0 0 1.2mm 0; font-size: 11pt; font-weight: 400; color: #111111; overflow-wrap: anywhere; }
        .os-n { font-weight: 700; color: #000000; }
        .os-car { font-weight: 700; color: #000000; }
        .sep { color: #444444; }
        tr.cols th {
          border-top: 0.75pt solid #000000; border-bottom: 0.75pt solid #000000;
          padding: 1mm 1.5mm; font-size: 8.5pt; font-weight: 700; text-align: left; text-transform: uppercase; color: #000000;
        }
        tr.cols th.num { text-align: center; }
        td { border-bottom: 0.5pt solid #8c8c8c; padding: 2.4mm 1.5mm; vertical-align: middle; }
        td.c-box { text-align: center; padding-left: 0; padding-right: 0; }
        svg.box { width: 5mm; height: 5mm; display: inline-block; vertical-align: middle; }
        td.c-desc { font-size: 11pt; overflow-wrap: anywhere; }
        .cat { font-size: 9pt; color: #444444; }
        td.c-qty { text-align: center; font-size: 14pt; font-weight: 700; color: #000000; }
        td.c-obs { border-left: 0.5pt solid #8c8c8c; }
        td.c-obs2 { border-left: 0.5pt solid #8c8c8c; font-size: 9.5pt; color: #222222; overflow-wrap: anywhere; }
      </style>
    </head>
    <body>

      <div class="doc-head">
        <div class="doc-title">Peças a comprar</div>
        <div class="doc-meta">
          <div class="shop-name">${escapeHtml(settings.name || 'OFICINA')}</div>
          <div>Emitido em <span class="num">${escapeHtml(dateText)}</span></div>
        </div>
      </div>
      <p class="summary">${summary}</p>

      ${sectionsHtml}
      ${repeatedHtml(plan.repeated)}

    </body>
    </html>
  `;

  return { printContent, docTitle };
}

export function printPartsToBuy(plan: PartsToBuyPlan, settings: Pick<WorkshopSettings, 'name'>): void {
  const { printContent, docTitle } = buildPartsToBuyHtml(plan, settings);
  printHtml(printContent, docTitle);
}
