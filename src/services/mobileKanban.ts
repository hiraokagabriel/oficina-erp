import type { Client, OSStatus, WorkOrder } from '../types';
import { STATUS_LABELS } from '../types';
import { normalizePlate } from '../utils/links';

// Kanban por chips no celular (docs/NUVEM-UX.md 8.3). Funções puras; sem arrastar, sem relógio.

/** Chips do celular, na ordem do quadro. Arquivadas ficam de fora. */
export const PHONE_CHIPS: readonly OSStatus[] = ['ORCAMENTO', 'APROVADO', 'EM_SERVICO', 'AGUARDANDO_PAGAMENTO', 'FINALIZADO'];

export const isPhoneChip = (v: unknown): v is OSStatus =>
  typeof v === 'string' && (PHONE_CHIPS as readonly string[]).includes(v);

/** Quantas OS em cada chip (sem ARQUIVADO). */
export function chipCounts(workOrders: readonly WorkOrder[]): Record<OSStatus, number> {
  const out: Record<OSStatus, number> = { ORCAMENTO: 0, APROVADO: 0, EM_SERVICO: 0, AGUARDANDO_PAGAMENTO: 0, FINALIZADO: 0, ARQUIVADO: 0 };
  for (const os of workOrders) if (os.status !== 'ARQUIVADO') out[os.status] += 1;
  return out;
}

/** Chip ao abrir: o último usado (se válido) vence; senão Mecânico em Em serviço e os demais em Orçamento. */
export function initialChip(saved: string | null | undefined, role: string | null | undefined): OSStatus {
  if (isPhoneChip(saved)) return saved;
  return role === 'mecanico' ? 'EM_SERVICO' : 'ORCAMENTO';
}

/** Texto de "vazio" do chip. */
export const emptyChipText = (status: OSStatus): string => `Nenhuma OS em ${STATUS_LABELS[status]}.`;

/** Função que devolve as placas (normalizadas) de uma OS. */
export type PlateOf = (os: WorkOrder) => string[];

/** Placas do veículo da OS: pelo `vehicleId` nos veículos do cliente (por `clientId`). Sem vínculo, lista vazia. */
export function buildPlateOf(clients: readonly Client[]): PlateOf {
  const byId = new Map<string, Client>();
  for (const c of clients) byId.set(c.id, c);
  return (os) => {
    const c = os.clientId ? byId.get(os.clientId) : undefined;
    if (!c || !os.vehicleId) return [];
    return (c.vehicles ?? []).filter((v) => v.id === os.vehicleId).map((v) => normalizePlate(v.plate)).filter(Boolean);
  };
}

/**
 * Filtro de busca do quadro (mesmo comportamento de antes: nome, veículo, nº, telefone e técnico).
 * Com `plateOf`, também acha pela placa (comparada sem hífen e sem caixa).
 */
export function filterWorkOrders(list: readonly WorkOrder[], term: string, plateOf?: PlateOf): WorkOrder[] {
  if (!term) return list as WorkOrder[];
  const t = term.toLowerCase();
  const plateTerm = plateOf ? normalizePlate(term) : '';
  return list.filter(
    (os) =>
      os.clientName.toLowerCase().includes(t) ||
      os.vehicle.toLowerCase().includes(t) ||
      os.osNumber.toString().includes(t) ||
      (!!os.clientPhone && os.clientPhone.includes(t)) ||
      (os.technician || '').toLowerCase().includes(t) ||
      (plateOf !== undefined && plateTerm !== '' && (
        normalizePlate(os.vehicle).includes(plateTerm) ||
        plateOf(os).some((p) => p.includes(plateTerm))
      ))
  );
}
