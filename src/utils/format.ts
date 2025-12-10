// Cores e Formatadores
export const COLORS = {
  primary: '#8257e6',
  secondary: '#00bcd4',
  success: '#04d361',
  warning: '#ff9800',
  danger: '#e54c4c',
  grid: '#323238',
  text: '#a8a8b3',
  tooltipBg: '#202024',
  cardBg: '#2b2b3b',
  border: '#3e3e4e',
  info: '#00bcd4'
};

export const Money = {
  format: (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val / 100),
  toFloat: (val: number) => val / 100,
  fromFloat: (val: number) => Math.round(val * 100)
};

export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

// Adicione isso ao final do arquivo existente
import { OSStatus } from './types';

export const STATUS_LABELS: Record<OSStatus, string> = {
  ORCAMENTO: 'Orçamento',
  APROVADO: 'Aprovado',
  EM_SERVICO: 'Em Serviço',
  FINALIZADO: 'Finalizado'
};