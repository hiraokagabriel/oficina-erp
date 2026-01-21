import { LedgerEntry } from '../types';

export const Money = {
  format: (centavos: number): string => {
    const reais = centavos / 100;
    return reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },
  parse: (valor: string): number => {
    const num = parseFloat(valor.replace(/[^\d,-]/g, '').replace(',', '.'));
    return isNaN(num) ? 0 : Math.round(num * 100);
  }
};

export function generateUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function getNormalizedMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function getEndOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function isSameMonth(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();
}

export function toDateInputValue(date: Date): string {
  const offset = date.getTimezoneOffset();
  const adjusted = new Date(date.getTime() - offset * 60 * 1000);
  return adjusted.toISOString().slice(0, 10);
}

export function fromDateInputValue(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function createLedgerEntry(
  description: string,
  amount: number,
  type: 'CREDIT' | 'DEBIT',
  effectiveDate: string,
  options: Partial<LedgerEntry> = {}
): LedgerEntry {
  return {
    id: generateUniqueId(),
    description,
    amount,
    type,
    effectiveDate,
    createdAt: new Date().toISOString(),
    history: [],
    ...options
  };
}

export function updateLedgerEntry(
  entry: LedgerEntry,
  updates: Partial<Omit<LedgerEntry, 'id' | 'createdAt'>>,
  user?: string
): LedgerEntry {
  const newHistory = [...(entry.history || [])];
  newHistory.push({
    date: new Date().toISOString(),
    timestamp: new Date().toISOString(), // ✅ ADICIONADO para compatibilidade
    action: `Atualizado: ${Object.keys(updates).join(', ')}`,
    user
  });

  return {
    ...entry,
    ...updates,
    history: newHistory
  };
}