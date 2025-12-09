import { Cents, Money } from '../shared/Money';

export type TransactionType = 'DEBIT' | 'CREDIT';

export interface AuditLog {
  readonly timestamp: string;
  readonly userId: string;
  readonly reason: string;
  readonly oldValue: Cents;
  readonly newValue: Cents;
}

export interface LedgerEntry {
  readonly id: string;
  readonly accountId: string;
  readonly type: TransactionType;
  readonly amount: Cents;
  readonly description: string;
  readonly history: ReadonlyArray<AuditLog>;
}

export const createEntry = (
  description: string,
  amountFloat: number,
  type: TransactionType = 'CREDIT'
): LedgerEntry => ({
  id: crypto.randomUUID(),
  accountId: "CAIXA",
  type,
  amount: Money.fromFloat(amountFloat),
  description,
  history: []
});

export const updateEntryAmount = (
  entry: LedgerEntry,
  newAmountFloat: number,
  userId: string,
  reason: string
): LedgerEntry => {
  const newAmountCents = Money.fromFloat(newAmountFloat);
  
  if (entry.amount === newAmountCents) return entry;

  const log: AuditLog = {
    timestamp: new Date().toISOString(),
    userId,
    reason,
    oldValue: entry.amount,
    newValue: newAmountCents
  };

  return {
    ...entry,
    amount: newAmountCents,
    history: [...entry.history, log]
  };
};