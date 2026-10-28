/** Lista de clientes (CRM e Gerenciador): busca, resumo de cada linha e textos de exclusão. Funções puras. */
import { Client, Technician, WorkOrder } from '../types';
import { normalizeName, osBelongsToClient } from '../utils/links';

/** Busca por nome, telefone, modelo ou placa (sem diferenciar maiúsculas). Termo vazio devolve a mesma lista. */
export const filterClients = (clients: Client[], term: string): Client[] => {
  const t = term.trim().toLowerCase();
  if (!t) return clients;
  return clients.filter(c =>
    c.name.toLowerCase().includes(t) ||
    (c.phone ?? '').toLowerCase().includes(t) ||
    c.vehicles.some(v => v.model.toLowerCase().includes(t) || (v.plate ?? '').toLowerCase().includes(t)),
  );
};

/** Segunda linha do item da lista: telefone e primeiro veículo, para distinguir homônimos. */
export const clientSummaryLine = (c: Client): { phone: string; vehicle: string } => {
  const first = c.vehicles[0];
  const extra = c.vehicles.length - 1;
  const model = first ? first.model.trim() : '';
  const plate = first?.plate?.trim() ?? '';
  const base = [model, plate].filter(Boolean).join(' ');
  return {
    phone: c.phone?.trim() || 'Sem telefone',
    vehicle: !first ? 'Sem veículo' : `${base || 'Veículo sem modelo'}${extra > 0 ? ` (+${extra})` : ''}`,
  };
};

export const clientCountLabel = (total: number, all: number, searching: boolean): string => {
  if (searching) return `${total} de ${all} ${all === 1 ? 'cliente' : 'clientes'}`;
  return `${all} ${all === 1 ? 'cliente' : 'clientes'}`;
};

/** "nenhuma ordem de serviço", "1 ordem de serviço", "3 ordens de serviço". */
export const ordersPhrase = (n: number): string =>
  n === 0 ? 'nenhuma ordem de serviço' : n === 1 ? '1 ordem de serviço' : `${n} ordens de serviço`;

export const countClientOrders = (workOrders: WorkOrder[], client: Client, clients: Client[]): number =>
  workOrders.reduce((n, os) => n + (osBelongsToClient(os, client, clients) ? 1 : 0), 0);

export const countTechnicianOrders = (workOrders: WorkOrder[], tech: Technician): number => {
  const key = normalizeName(tech.name);
  return workOrders.reduce((n, os) => {
    const same = os.technicianId ? os.technicianId === tech.id : normalizeName(os.technician) === key;
    return n + (same ? 1 : 0);
  }, 0);
};

const deleteTail = (orders: number): string =>
  `${orders > 0 ? 'Elas continuam salvas com o nome dele, mas o cadastro' : 'O cadastro'} será apagado e não dá para desfazer.`;

export const deleteClientMessage = (name: string, orders: number): string =>
  `Excluir o cadastro de "${name}"?\n${orders === 0 ? 'Ele não tem ordem de serviço.' : `Ele tem ${ordersPhrase(orders)}.`} ${deleteTail(orders)}`;

export const deleteTechnicianMessage = (name: string, orders: number): string =>
  `Excluir o técnico "${name}"?\n${orders === 0 ? 'Ele não aparece em nenhuma ordem de serviço.' : `Ele aparece em ${ordersPhrase(orders)}.`} ${deleteTail(orders)}`;

export const deleteCatalogMessage = (kind: 'peça' | 'serviço', name: string): string =>
  `Excluir ${kind === 'peça' ? 'a' : 'o'} ${kind} "${name}" do cadastro?\nAs ordens de serviço já feitas não mudam. Não dá para desfazer.`;

export const noVehicleMessage = (name: string): string =>
  `Nenhum veículo foi preenchido para "${name}". Você pode adicionar depois.\nSalvar mesmo assim?`;
