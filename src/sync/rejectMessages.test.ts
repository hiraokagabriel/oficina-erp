import { describe, expect, it } from 'vitest';
import { describeSyncError, recoveryCopyContent, recoveryFileName, rejectionMessage } from './rejectMessages';
import type { OutboxOp } from './outbox';
import { OS_DELETED_MESSAGE, RECORD_DELETED_MESSAGE } from './mergeRecord';

const op: OutboxOp = {
  opId: 'o', actor: 'u', deviceId: 'd', collection: 'clients', recordId: 'C1', kind: 'upsert', base: { id: 'C1', name: 'A' },
  baseVersions: { main: 2 }, value: { id: 'C1', name: 'B' }, createdAt: '2026-01-01T00:00:00.000Z', attempts: 1, state: 'denied', lastError: 'update_negado',
};

describe('rejectMessages', () => {
  it('todo motivo tem texto; exclusão remota distingue OS de outros registros', () => {
    for (const r of ['money_op', 'denied', 'denied_local', 'offline', 'failed', 'server_edited', 'cache_discarded'] as const) expect(rejectionMessage('clients', r).length).toBeGreaterThan(10);
    expect(rejectionMessage('workOrders', 'server_deleted')).toBe(OS_DELETED_MESSAGE);
    expect(rejectionMessage('clients', 'server_deleted')).toBe(RECORD_DELETED_MESSAGE);
  });

  it('cópia de recuperação guarda o valor tentado e a base', () => {
    const j = JSON.parse(recoveryCopyContent(op, '2026-11-12T10:00:00.000Z')) as Record<string, unknown>;
    expect(j.valorTentado).toEqual({ id: 'C1', name: 'B' });
    expect(j.baseDoServidor).toEqual({ id: 'C1', name: 'A' });
    expect(j.motivo).toBe('update_negado');
    expect(recoveryFileName(op, '2026-11-12T10:00:00.000Z')).toBe('recuperacao-clients-20261112100000.json');
  });

  it('recusa local (sem cópia) e do servidor (com cópia) têm textos diferentes', () => {
    const local = rejectionMessage('clients', 'denied_local');
    const remoto = rejectionMessage('clients', 'denied');
    expect(local).not.toBe(remoto);
    expect(local).not.toContain('cópia');
    expect(remoto).toContain('cópia');
  });

  it('describeSyncError: texto simples, nunca o código cru', () => {
    expect(describeSyncError(null)).toBeNull();
    expect(describeSyncError('sem_acesso')).toContain('Entre de novo');
    expect(describeSyncError('Cache local: QuotaExceeded')).toContain('neste aparelho');
    expect(describeSyncError('registro_incompleto')).toContain('incompleto');
    const generic = describeSyncError('XX000 internal error')!;
    expect(generic).not.toContain('XX000');
    expect(generic).toContain('Sem conexão');
  });
});
