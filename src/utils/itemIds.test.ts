import { describe, expect, it } from 'vitest';
import { ensureUniqueItemIds } from './itemIds';
import type { OrderItem } from '../types';

const it1 = (id: string | undefined, description = 'x'): OrderItem =>
  ({ id, description, price: 1 } as unknown as OrderItem);

describe('ensureUniqueItemIds', () => {
  it('mantém ids válidos e únicos', () => {
    const r = ensureUniqueItemIds('os1', [it1('a'), it1('b')], [it1('c')]);
    expect(r.parts.map(p => p.id)).toEqual(['a', 'b']);
    expect(r.services.map(s => s.id)).toEqual(['c']);
  });

  it('é idempotente', () => {
    const once = ensureUniqueItemIds('os1', [it1('a'), it1('a'), it1(undefined)], [it1('a'), it1('')]);
    expect(ensureUniqueItemIds('os1', once.parts, once.services)).toEqual(once);
  });

  it('não muta a entrada', () => {
    const parts = [it1('a'), it1('a')];
    const services = [it1(undefined)];
    const snap = JSON.stringify({ parts, services });
    const r = ensureUniqueItemIds('os1', parts, services);
    expect(JSON.stringify({ parts, services })).toBe(snap);
    expect(r.parts[0]).not.toBe(parts[0]);
  });

  it('id ausente ou repetido entre peças e serviços vira osId-p{i} / osId-s{i}', () => {
    const r = ensureUniqueItemIds('os1', [it1('dup'), it1(undefined, 'y')], [it1('dup'), it1('ok')]);
    expect(r.parts.map(p => p.id)).toEqual(['dup', 'os1-p1']);
    expect(r.services.map(s => s.id)).toEqual(['os1-s0', 'ok']);
    expect(r.parts[1].description).toBe('y');
  });

  it('colisão com id gerado ganha -x', () => {
    const r = ensureUniqueItemIds('os1', [it1(''), it1('os1-p0')], []);
    expect(r.parts.map(p => p.id)).toEqual(['os1-p0-x', 'os1-p0']);
  });

  it('aceita listas ausentes', () => {
    expect(ensureUniqueItemIds('os1', undefined, undefined)).toEqual({ parts: [], services: [] });
  });
});
