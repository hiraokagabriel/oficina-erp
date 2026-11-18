import { describe, expect, it } from 'vitest';
import { assertSupabaseTarget, expectedProjectRef, REAL_PROJECT_REF, TEST_PROJECT_REF } from './buildGuard';

describe('buildGuard', () => {
  it('modo real exige o projeto real', () => {
    expect(() => assertSupabaseTarget('real', `https://${REAL_PROJECT_REF}.supabase.co`)).not.toThrow();
    expect(() => assertSupabaseTarget('real', `https://${TEST_PROJECT_REF}.supabase.co`)).toThrow(/recusado/);
    expect(() => assertSupabaseTarget('real', undefined)).toThrow();
    expect(() => assertSupabaseTarget('real', '')).toThrow();
  });
  it('modo cloud exige o projeto de teste', () => {
    expect(() => assertSupabaseTarget('cloud', `https://${TEST_PROJECT_REF}.supabase.co`)).not.toThrow();
    expect(() => assertSupabaseTarget('cloud', `https://${REAL_PROJECT_REF}.supabase.co`)).toThrow(/recusado/);
  });
  it('outros modos não são conferidos', () => {
    expect(expectedProjectRef('production')).toBeNull();
    expect(() => assertSupabaseTarget('production', undefined)).not.toThrow();
    expect(() => assertSupabaseTarget('development', undefined)).not.toThrow();
  });
});
