import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTauri } from './platform';

afterEach(() => { vi.unstubAllGlobals(); });

describe('isTauri', () => {
  it('false sem window', () => {
    vi.stubGlobal('window', undefined);
    expect(isTauri()).toBe(false);
  });
  it('false em navegador comum', () => {
    vi.stubGlobal('window', {});
    expect(isTauri()).toBe(false);
  });
  it('true com __TAURI_INTERNALS__', () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    expect(isTauri()).toBe(true);
  });
  it('true com __TAURI__', () => {
    vi.stubGlobal('window', { __TAURI__: {} });
    expect(isTauri()).toBe(true);
  });
});
