import { WorkOrder, WorkshopSettings, createEmptyChecklist } from '../types';
import { buildPrintOSHtml } from '../utils/printOS';
import { buildPrintChecklistHtml } from '../utils/printChecklist';
import { buildPrintServiceSummaryHtml } from '../utils/printServiceSummary';
import { buildServiceSummary } from './serviceSummary';
import { SummaryChoice, choiceToOptions } from './serviceSummaryView';
import { sumAdvances } from './osFinanceService';
import { vehicleParts } from '../utils/links';
import { sanitizeFilePart } from '../utils/fileName';

export type DocKind = 'OS' | 'OS_CLIENTE' | 'OS_OFICINA' | 'RESUMO' | 'CHECKLIST' | 'CHECKLIST_RESUMIDO';

export interface DocOptions {
  /** Só para RESUMO: o que incluir da vistoria. Padrão: nada. */
  summaryChoice?: SummaryChoice;
}

export interface BuiltDocument {
  html: string;
  /** Título do documento (nome sugerido na janela de impressão). */
  title: string;
  /** Nome do arquivo PDF, sem extensão. */
  fileStem: string;
  /** Subpasta da OS dentro da pasta de PDFs (ver osFolderName). */
  subfolder: string;
}

const MAX_STEM = 120;

type StemOs = Pick<WorkOrder, 'osNumber' | 'clientName' | 'vehicle'>;

/** Nome do arquivo (sem extensão): só [A-Za-z0-9_-], no máximo 120 caracteres. */
export function docFileStem(kind: DocKind, os: StemOs): string {
  const n = os.osNumber || 'SN';
  const client = sanitizeFilePart(os.clientName || '') || 'Cliente';
  const { model, plate } = vehicleParts(os.vehicle || '');
  const modelPart = sanitizeFilePart(model) || 'Veiculo';
  const platePart = sanitizeFilePart(plate) || 'SemPlaca';

  let stem: string;
  switch (kind) {
    case 'OS': stem = `OS_${n}_${client}_${modelPart}_${platePart}`; break;
    case 'OS_CLIENTE': stem = `OS_${n}_${client}_${modelPart}_${platePart}_ViaCliente`; break;
    case 'OS_OFICINA': stem = `OS_${n}_${client}_${modelPart}_${platePart}_ViaOficina`; break;
    case 'RESUMO': stem = `Resumo_OS_${n}_${client}`; break;
    case 'CHECKLIST': stem = `Checklist_OS_${n}_${client}_${platePart}`; break;
    case 'CHECKLIST_RESUMIDO': stem = `Checklist_OS_${n}_${client}_${platePart}_Resumido`; break;
  }
  const safe = stem.replace(/[^A-Za-z0-9_-]/g, '_');
  return safe.length > MAX_STEM ? safe.slice(0, MAX_STEM).replace(/_+$/, '') : safe;
}

const MAX_FOLDER = 80;
// Proibidos no Windows: < > : " / \ | ? * e caracteres de controle.
const FOLDER_FORBIDDEN = /[<>:"/\\|?*\u0000-\u001F\u007F]/g;
const FOLDER_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

/** Limpa um trecho de nome de pasta: tira o proibido, junta espaços e pontos repetidos, apara as pontas. */
function cleanFolderText(text: string): string {
  return (text ?? '')
    .replace(FOLDER_FORBIDDEN, '')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '');
}

/**
 * Subpasta da OS: "[número] [cliente] [carro]" (ex.: "12 João Silva Gol"). Mantém espaços e acentos.
 * Todos os documentos da mesma OS caem nela. Nunca vazia nem nome reservado do Windows.
 */
export function osFolderName(os: StemOs): string {
  const n = cleanFolderText(String(os.osNumber ?? ''));
  const vehicle = os.vehicle || '';
  const parts = vehicleParts(vehicle);
  const car = parts.model || (parts.plate ? vehicle.replace(parts.plate, '') : vehicle);
  const raw = [n, os.clientName || '', car].map(cleanFolderText).filter(Boolean).join(' ');
  const name = cleanFolderText(raw.slice(0, MAX_FOLDER));
  const base = name.split('.')[0].trim();
  if (!name || FOLDER_RESERVED.test(base)) return `OS ${n || 'SN'}`;
  return name;
}

/** Monta o HTML, o título e o nome do arquivo de qualquer documento da OS. */
export function buildDocument(kind: DocKind, os: WorkOrder, settings: WorkshopSettings, opts: DocOptions = {}): BuiltDocument {
  const fileStem = docFileStem(kind, os);
  const subfolder = osFolderName(os);

  switch (kind) {
    case 'OS':
    case 'OS_CLIENTE':
    case 'OS_OFICINA': {
      // O layout da OS ainda lê advanceAmount: repassa a soma dos adiantamentos (v4).
      const advanced = sumAdvances(os);
      const data = advanced > 0 ? { ...os, advanceAmount: advanced } : os;
      const variant = kind === 'OS_CLIENTE' ? 'CLIENT' : kind === 'OS_OFICINA' ? 'SHOP' : undefined;
      const { printContent, documentTitle } = buildPrintOSHtml(data, settings, variant);
      return { html: printContent, title: documentTitle, fileStem, subfolder };
    }
    case 'RESUMO': {
      const options = choiceToOptions(opts.summaryChoice ?? { includeInspection: false, includeGeneralNote: false });
      const { printContent, documentTitle } = buildPrintServiceSummaryHtml(buildServiceSummary(os, settings, options));
      return { html: printContent, title: documentTitle, fileStem, subfolder };
    }
    case 'CHECKLIST':
    case 'CHECKLIST_RESUMIDO': {
      const checklist = os.checklist ?? createEmptyChecklist(os.mileage);
      const { printContent, docTitle } = buildPrintChecklistHtml(os, checklist, settings, {
        mode: kind === 'CHECKLIST_RESUMIDO' ? 'summary' : 'full',
      });
      return { html: printContent, title: docTitle, fileStem, subfolder };
    }
  }
}
