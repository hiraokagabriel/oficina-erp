import {
  WorkOrder,
  WorkshopSettings,
  ChecklistSchema,
  InspectionCategory,
  InspectionStatus,
  INSPECTION_STATUS_META,
} from '../types';
import { escapeHtml } from './html';
import { vehicleParts } from './links';
import { sanitizeFilePart } from './fileName';
import { printHtml } from './documentOutput';

// Reexporta para não quebrar imports existentes (a função mora em links.ts).
export { vehicleParts };

// Impressão do checklist de vistoria: formulário preto e branco para marcar à mão (impressora ou PDF).
// Sem cor, fundo, sombra ou canto arredondado: o estado é dado pela coluna marcada com X, nunca por cor.

export type ChecklistPrintMode = 'full' | 'summary';

export interface ChecklistPrintOptions {
  /** 'full' (padrão): todos os itens com caixas para marcar. 'summary': só os itens já marcados. */
  mode?: ChecklistPrintMode;
  /** Data usada quando a vistoria não tem `inspectedAt` (injetável nos testes). */
  now?: Date;
}

export interface ChecklistPrintSelection {
  categories: InspectionCategory[];
  /** Total de itens do checklist inteiro (independe do modo). */
  total: number;
  /** Itens com estado diferente de 'pending' (independe do modo). */
  inspected: number;
  counts: Record<InspectionStatus, number>;
}

/** Colunas de marcação, na ordem impressa. */
const STATUS_COLUMNS = ['ok', 'attention', 'urgent'] as const;

/** Escolhe o que imprimir: completo ou só os itens já marcados. Nunca devolve categoria sem itens. */
export function selectChecklistForPrint(cl: ChecklistSchema, mode: ChecklistPrintMode): ChecklistPrintSelection {
  const counts: Record<InspectionStatus, number> = { pending: 0, ok: 0, attention: 0, urgent: 0 };
  let total = 0;
  for (const cat of cl.categories) {
    for (const item of cat.items) {
      counts[item.status] += 1;
      total += 1;
    }
  }
  const inspected = total - counts.pending;

  const categories = cl.categories
    .map(cat => ({
      ...cat,
      items: mode === 'summary' ? cat.items.filter(i => i.status !== 'pending') : cat.items,
    }))
    .filter(cat => cat.items.length > 0);

  return { categories, total, inspected, counts };
}

const PLATE_RE = /[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}/i;

/** Placa para o rodapé (vai para dentro do <style>): só letras, números e hífen. */
function footerPlate(plate: string): string {
  const valid = plate.match(PLATE_RE);
  if (valid) return valid[0].toUpperCase();
  return plate.replace(/[^A-Z0-9-]/gi, '').slice(0, 8);
}

/** 85100 vira "85.100". Sem Intl: o resultado não depende do ICU do ambiente. */
function formatKm(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const BOX_EMPTY = '<rect x="0.5" y="0.5" width="11" height="11" fill="none" stroke="#000000" stroke-width="1"/>';
const BOX_X = '<path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="#000000" stroke-width="1.6"/>';
const svgBox = (marked: boolean) =>
  `<svg class="box" viewBox="0 0 12 12" aria-hidden="true">${BOX_EMPTY}${marked ? BOX_X : ''}</svg>`;

const STATUS_CLASS: Record<(typeof STATUS_COLUMNS)[number], string> = {
  ok: 'st-ok',
  attention: 'st-attention',
  urgent: 'st-urgent',
};

function itemRowHtml(item: InspectionCategory['items'][number]): string {
  const note = (item.note ?? '').trim();
  const cells = STATUS_COLUMNS.map(s => {
    const marked = item.status === s;
    return `<td class="st ${STATUS_CLASS[s]}${marked ? ' is-marked' : ''}">${svgBox(marked)}</td>`;
  }).join('');
  const noteHtml = note ? `<div class="item-note">Observação: ${escapeHtml(note)}</div>` : '';
  return `<tr><td class="lbl${item.status === 'urgent' ? ' is-urgent' : ''}">${escapeHtml(item.label)}${noteHtml}</td>${cells}</tr>`;
}

function categoryHtml(cat: InspectionCategory): string {
  const heads = STATUS_COLUMNS.map(s => `<th class="colh">${escapeHtml(INSPECTION_STATUS_META[s].label)}</th>`).join('');
  return `<table class="cat${cat.items.length <= 12 ? ' cat-small' : ''}">
    <colgroup><col><col class="c-st"><col class="c-st"><col class="c-st"></colgroup>
    <thead><tr><th class="cat-name">${escapeHtml(cat.label.toUpperCase())}</th>${heads}</tr></thead>
    <tbody>${cat.items.map(itemRowHtml).join('')}</tbody>
  </table>`;
}

/** Monta o HTML e o título do checklist (sem imprimir): separado para poder ser testado. */
export function buildPrintChecklistHtml(
  os: WorkOrder,
  checklist: ChecklistSchema,
  settings: WorkshopSettings,
  opts: ChecklistPrintOptions = {},
): { printContent: string; docTitle: string } {
  const mode: ChecklistPrintMode = opts.mode ?? 'full';
  const isSummary = mode === 'summary';
  const { categories, total, inspected, counts } = selectChecklistForPrint(checklist, mode);

  const docTitle = `Checklist_OS${os.osNumber}_${sanitizeFilePart(os.vehicle, 50)}${isSummary ? '_Resumido' : ''}`;

  const dateText = (checklist.inspectedAt ? new Date(checklist.inspectedAt) : (opts.now ?? new Date())).toLocaleDateString('pt-BR');
  const { model, plate } = vehicleParts(os.vehicle);

  const kmValue = checklist.mileageIn ?? os.mileage;
  const kmHtml = typeof kmValue === 'number' && kmValue > 0
    ? `<span class="mono">${formatKm(kmValue)} km</span>`
    : '<span class="mono">________ km</span>';

  const field = (label: string, value: string, cls = '', span = 12) =>
    `<td colspan="${span}" class="fld ${cls}"><div class="fld-l">${label}</div><div class="fld-v">${value}</div></td>`;

  const osNumberText = escapeHtml(String(os.osNumber));
  const techName = os.technician || settings.name || '';

  // ---- Linha de resumo ----
  const labelOf = (s: InspectionStatus) => escapeHtml(INSPECTION_STATUS_META[s].label);
  const countParts = STATUS_COLUMNS.map(s => {
    const text = `${labelOf(s)}: ${counts[s]}`;
    return s === 'urgent' && counts.urgent > 0 ? `<strong>${text}</strong>` : text;
  });
  const summaryLine = `Inspecionados: ${inspected} de ${total} &middot; ${countParts.join(' &middot; ')}`;
  const hintLine = !isSummary
    ? 'Marque com X a coluna do estado. Três caixas vazias = item não inspecionado.'
    : inspected > 0
      ? (inspected === 1
        ? `Mostrando só o item inspecionado, de ${total}.`
        : `Mostrando só os ${inspected} itens inspecionados de ${total}.`)
      : '';

  // ---- Itens ----
  const itemsHtml = categories.length > 0
    ? `<div class="items">${categories.map(categoryHtml).join('')}</div>`
    : '<p class="empty">Nenhum item foi inspecionado ainda.</p>';

  // ---- Observações gerais ----
  const notes = checklist.notes ?? '';
  const hasNotes = notes.trim() !== '';
  const notesHtml = (!isSummary || hasNotes)
    ? `<section class="notes">
        <div class="sec-title">Observações gerais</div>
        ${hasNotes ? `<div class="notes-text">${escapeHtml(notes)}</div>` : ''}
        ${!isSummary ? '<div class="rule"></div><div class="rule"></div><div class="rule"></div>' : ''}
      </section>`
    : '';

  // ---- Rodapé de página (margin boxes): só número da OS e placa filtrada entram no CSS ----
  const footOs = String(Number(os.osNumber) || 'SN');
  const footPlate = footerPlate(plate);
  const footLeft = `Checklist de vistoria \\00B7 OS ${footOs}${footPlate ? ` \\00B7 ${footPlate}` : ''}`;

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
          margin: 12mm 12mm 16mm 12mm;
          @bottom-left {
            content: "${footLeft}";
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
          font-size: 9pt;
          line-height: 1.3;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .mono {
          font-family: "Cascadia Mono", Consolas, monospace;
          font-variant-numeric: tabular-nums;
        }

        /* ---- Barra de título ---- */
        .title-bar {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 8mm;
          padding-bottom: 2mm;
          border-bottom: 1.5pt solid #000000;
          margin-bottom: 3mm;
        }
        .shop-name { font-size: 13pt; font-weight: 700; color: #000000; }
        .shop-sub { font-size: 8.5pt; color: #444444; }
        .title-right { text-align: right; }
        .doc-title { font-size: 11pt; font-weight: 700; text-transform: uppercase; color: #000000; }
        .doc-os { font-size: 14pt; font-weight: 700; color: #000000; }
        .doc-mode { font-size: 9pt; color: #333333; }

        /* ---- Grade de campos ---- */
        table.fields { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 3mm; }
        td.fld { border: 0.5pt solid #000000; padding: 1mm 2mm; height: 12mm; vertical-align: top; }
        .fld-l { font-size: 8pt; text-transform: uppercase; color: #444444; }
        .fld-v { font-size: 10pt; color: #111111; overflow-wrap: anywhere; }

        /* ---- Resumo ---- */
        .summary-line { font-size: 9pt; color: #111111; }
        .hint-line { font-size: 9pt; color: #333333; margin-bottom: 3mm; }
        .summary-line { margin-bottom: 0.5mm; }
        .empty { font-size: 9pt; color: #333333; margin: 4mm 0; }

        /* ---- Itens em duas colunas ---- */
        .items { columns: 2; column-gap: 8mm; margin-bottom: 4mm; }
        table.cat { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 3mm; }
        table.cat col.c-st { width: 13mm; }
        table.cat-small { break-inside: avoid; page-break-inside: avoid; }
        thead { display: table-header-group; }
        thead tr { break-after: avoid; page-break-after: avoid; }
        tr { break-inside: avoid; page-break-inside: avoid; }
        th.cat-name {
          border-top: 1pt solid #000000;
          border-bottom: 0.5pt solid #000000;
          padding: 1mm 1mm 0.5mm 0;
          font-size: 9pt;
          font-weight: 700;
          text-align: left;
          vertical-align: bottom;
          color: #000000;
        }
        th.colh {
          border-top: 1pt solid #000000;
          border-bottom: 0.5pt solid #000000;
          padding: 1mm 0.3mm 0.5mm 0.3mm;
          font-size: 8pt;
          font-weight: 700;
          line-height: 1.15;
          text-align: center;
          vertical-align: bottom;
          color: #000000;
        }
        td.lbl { padding: 0.8mm 1mm 0.8mm 0; border-bottom: 0.5pt solid #8c8c8c; font-size: 9pt; vertical-align: middle; overflow-wrap: anywhere; }
        td.lbl.is-urgent { font-weight: 700; }
        .item-note { font-size: 8.5pt; color: #333333; white-space: pre-wrap; margin-top: 0.3mm; font-weight: 400; }
        td.st { border-bottom: 0.5pt solid #8c8c8c; text-align: center; vertical-align: middle; padding: 0.8mm 0; }
        svg.box { width: 3.6mm; height: 3.6mm; display: inline-block; vertical-align: middle; }

        /* ---- Bloco de notas ---- */
        .notes { break-inside: avoid; page-break-inside: avoid; margin-bottom: 4mm; }
        .sec-title {
          border-top: 1pt solid #000000;
          padding-top: 1mm;
          margin-bottom: 1.5mm;
          font-size: 9pt;
          font-weight: 700;
          text-transform: uppercase;
          color: #000000;
        }
        .notes-text { font-size: 9pt; color: #111111; white-space: pre-wrap; overflow-wrap: anywhere; }
        .rule { height: 7mm; border-bottom: 0.5pt solid #8c8c8c; }

        /* ---- Assinaturas ---- */
        .sign-block { break-inside: avoid; page-break-inside: avoid; break-before: avoid-page; page-break-before: avoid; margin-top: 4mm; }
        .signatures { display: flex; gap: 10mm; }
        .signature { flex: 1; }
        .sign-line { height: 15mm; border-bottom: 0.75pt solid #000000; }
        .sign-name { font-size: 10pt; color: #111111; margin-top: 1mm; overflow-wrap: anywhere; }
        .sign-label { font-size: 8pt; text-transform: uppercase; color: #444444; }
        .place-date { font-size: 9pt; margin-top: 4mm; color: #111111; }
        .declaration { font-size: 9pt; margin-top: 4mm; color: #111111; }
        .thanks { font-size: 9pt; font-weight: 700; margin-top: 1mm; color: #000000; }
      </style>
    </head>
    <body>

      <div class="title-bar">
        <div>
          <div class="shop-name">${escapeHtml(settings.name || 'OFICINA')}</div>
          ${settings.address ? `<div class="shop-sub">${escapeHtml(settings.address)}</div>` : ''}
          ${settings.cnpj ? `<div class="shop-sub">CNPJ: ${escapeHtml(settings.cnpj)}</div>` : ''}
        </div>
        <div class="title-right">
          <div class="doc-title">Checklist de vistoria do veículo</div>
          <div class="doc-os mono">OS Nº ${osNumberText}</div>
          ${isSummary ? '<div class="doc-mode">Resumido: só itens inspecionados</div>' : ''}
        </div>
      </div>

      <table class="fields">
        <tr>${field('Cliente', escapeHtml(os.clientName || ''), '', 8)}${field('Telefone', escapeHtml(os.clientPhone || ''), '', 4)}</tr>
        <tr>${field('Veículo (modelo)', escapeHtml(model), '', 6)}${field('Placa', `<span class="mono">${escapeHtml(plate)}</span>`, '', 3)}${field('KM de entrada', kmHtml, '', 3)}</tr>
        <tr>${field('Responsável técnico', escapeHtml(os.technician || ''), '', 8)}${field('Data da vistoria', escapeHtml(dateText), '', 4)}</tr>
      </table>

      <p class="summary-line">${summaryLine}</p>
      ${hintLine ? `<p class="hint-line">${hintLine}</p>` : ''}

      ${itemsHtml}

      ${notesHtml}

      <div class="sign-block">
        <div class="signatures">
          <div class="signature">
            <div class="sign-line"></div>
            ${techName ? `<div class="sign-name">${escapeHtml(techName)}</div>` : ''}
            <div class="sign-label">Responsável técnico</div>
          </div>
          <div class="signature">
            <div class="sign-line"></div>
            ${os.clientName ? `<div class="sign-name">${escapeHtml(os.clientName)}</div>` : ''}
            <div class="sign-label">Cliente</div>
          </div>
        </div>
        <p class="place-date">Local e data: ____________________, ___/___/______</p>
        <p class="declaration">Declaro que o veículo foi recebido e inspecionado conforme os itens acima.</p>
        <p class="thanks">Obrigado pela preferência!</p>
      </div>

    </body>
    </html>
  `;

  return { printContent, docTitle };
}

export function printChecklist(
  os: WorkOrder,
  checklist: ChecklistSchema,
  settings: WorkshopSettings,
  opts: ChecklistPrintOptions = {},
) {
  if (!os || !checklist) {
    console.error('Dados insuficientes para imprimir o checklist');
    return;
  }
  const { printContent, docTitle } = buildPrintChecklistHtml(os, checklist, settings, opts);

  printHtml(printContent, docTitle);
}
