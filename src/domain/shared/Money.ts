export type Cents = number; 

export const Money = {
  fromFloat: (amount: number): Cents => Math.floor(amount * 100),
  toFloat: (cents: Cents): number => cents / 100,
  add: (a: Cents, b: Cents): Cents => a + b,
  format: (cents: Cents): string => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
};