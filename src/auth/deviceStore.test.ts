import { describe, expect, it } from 'vitest';
import {
  clearDevice, clearOtherVerifiers, forgetPerson, localDeviceId, readDevice, readFails, readLastUser, readRoster, readVerifier, writeDevice,
  writeFails, writeLastUser, writeRoster, writeVerifier,
} from './deviceStore';

class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length(): number { return this.m.size; }
  clear(): void { this.m.clear(); }
  getItem(k: string): string | null { return this.m.get(k) ?? null; }
  key(i: number): string | null { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string): void { this.m.delete(k); }
  setItem(k: string, v: string): void { this.m.set(k, v); }
}

describe('deviceStore', () => {
  it('registro do aparelho: grava, lê e apaga; lixo vira nulo', () => {
    const s = new MemStorage();
    expect(readDevice(s)).toBeNull();
    writeDevice({ id: 'd1', name: 'PC da recepção', kind: 'pc_compartilhado', secret: 'abc', idleMinutes: 30, authorizedAt: '2026-11-12' }, s);
    expect(readDevice(s)).toMatchObject({ id: 'd1', idleMinutes: 30 });
    s.setItem('oficina.device', '{"id":1}');
    expect(readDevice(s)).toBeNull();
    writeDevice({ id: 'd1', name: 'x', kind: 'pc_compartilhado', secret: 'abc', idleMinutes: null, authorizedAt: '' }, s);
    expect(readDevice(s)?.idleMinutes).toBeNull();
    clearDevice(s);
    expect(readDevice(s)).toBeNull();
  });
  it('id local é estável', () => {
    const s = new MemStorage();
    const a = localDeviceId(s);
    expect(localDeviceId(s)).toBe(a);
  });
  it('clearOtherVerifiers deixa só o verificador da pessoa entrada', () => {
    const s = new MemStorage();
    const v = { v: 1 as const, iterations: 600000, salt: 'a', hash: 'b' };
    writeVerifier('u1', v, s); writeVerifier('u2', v, s); writeVerifier('u3', v, s);
    s.setItem('oficina.outra', 'x');
    clearOtherVerifiers('u2', s);
    expect(readVerifier('u1', s)).toBeNull();
    expect(readVerifier('u3', s)).toBeNull();
    expect(readVerifier('u2', s)).not.toBeNull();
    expect(s.getItem('oficina.outra')).toBe('x');
  });
  it('forgetPerson limpa verificador, erros, último usuário e cartão', () => {
    const s = new MemStorage();
    writeVerifier('u1', { v: 1, iterations: 600000, salt: 'a', hash: 'b' }, s);
    writeFails('u1', { failed: 2, blocked: false }, s);
    writeLastUser('u1', s);
    writeRoster([{ userId: 'u1', displayName: 'Ana', role: 'recepcao', locked: false }, { userId: 'u2', displayName: 'Beto', role: 'dono', locked: false }], 'x', s);
    expect(readFails('u1', s).failed).toBe(2);
    forgetPerson('u1', s);
    expect(readVerifier('u1', s)).toBeNull();
    expect(readFails('u1', s).failed).toBe(0);
    expect(readLastUser(s)).toBeNull();
    expect(readRoster(s)?.people.map(p => p.userId)).toEqual(['u2']);
  });
});
