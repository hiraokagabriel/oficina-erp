import { describe, expect, it } from 'vitest';
import { LocalScheduler } from './localScheduler';
import { FakeClock } from './testKit';
import type { CollectionKey } from './types';

// Debounce do provider (500 ms), configurações liberadas só quando seguro, e troca de identidade.

type Call = { collection: CollectionKey; items: readonly { id: string }[] };

function setup(opts: { canEditSettings?: boolean; engine?: boolean } = {}) {
  const clock = new FakeClock();
  const calls: Call[] = [];
  const state = { clients: [{ id: 'C1' }] as { id: string }[], settings: { name: 'OFICINA' } as object, engine: opts.engine ?? true, dirty: false };
  const s = new LocalScheduler({
    timers: clock.timersApi, debounceMs: 500,
    getEngine: () => (state.engine ? { localChange: (collection, items) => { calls.push({ collection, items }); } } : null),
    getCurrent: () => state.clients,
    getSettings: () => state.settings,
    canEditSettings: opts.canEditSettings ?? false,
    onDirtyChange: d => { state.dirty = d; },
  });
  return { clock, calls, state, s };
}

describe('LocalScheduler', () => {
  it('só envia depois de 500 ms sem novas mudanças (o timer reinicia)', () => {
    const { clock, calls, s, state } = setup();
    s.schedule('clients');
    expect(state.dirty).toBe(true);
    clock.advance(400);
    s.schedule('clients'); // reinicia
    clock.advance(400);
    expect(calls).toHaveLength(0);
    clock.advance(100);
    expect(calls).toHaveLength(1);
    expect(state.dirty).toBe(false);
  });

  it('flush manda na hora e cancela o timer', () => {
    const { clock, calls, s } = setup();
    s.schedule('clients');
    s.flush();
    expect(calls).toHaveLength(1);
    clock.advance(1000);
    expect(calls).toHaveLength(1);
  });

  it('sem motor (ainda não abriu ou já parou) nada é agendado nem enviado', () => {
    const { clock, calls, s } = setup({ engine: false });
    s.schedule('clients');
    clock.advance(1000);
    s.flush();
    expect(calls).toHaveLength(0);
  });

  it('settings: padrão intacto não vai; editado vai e, depois, tudo vai (até voltar ao padrão)', () => {
    const { calls, s, state } = setup({ canEditSettings: true });
    s.setSettingsBaseline({ name: 'OFICINA' }, false);
    s.schedule('settings'); s.flush();
    expect(calls).toHaveLength(0);
    state.settings = { name: 'Minha Oficina' };
    s.schedule('settings'); s.flush();
    expect(calls).toHaveLength(1);
    expect(calls[0].items).toEqual([{ name: 'Minha Oficina', id: 'main' }]);
    state.settings = { name: 'OFICINA' };
    s.schedule('settings'); s.flush();
    expect(calls).toHaveLength(2);
  });

  it('settings: quem não pode editar só manda depois que a linha veio do servidor', () => {
    const { calls, s, state } = setup({ canEditSettings: false });
    s.setSettingsBaseline({ name: 'OFICINA' }, false);
    state.settings = { name: 'Qualquer' };
    s.schedule('settings'); s.flush();
    expect(calls).toHaveLength(0);
    s.setSettingsBaseline({ name: 'Do servidor' }, true);
    state.settings = { name: 'Outro' };
    s.schedule('settings'); s.flush();
    expect(calls).toHaveLength(1);
  });

  it('settings vindo do servidor vira a nova base: não gera envio por si só', () => {
    const { calls, s, state } = setup({ canEditSettings: true });
    s.setSettingsBaseline({ name: 'OFICINA' }, false);
    state.settings = { name: 'Do servidor' };
    s.setSettingsBaseline({ name: 'Do servidor' }, true);
    s.schedule('settings'); s.flush();
    expect(calls).toHaveLength(0);
  });

  it('reset (troca de oficina, pessoa ou papel) esquece o pendente e as flags', () => {
    const { clock, calls, s, state } = setup({ canEditSettings: false });
    s.schedule('clients');
    s.setSettingsBaseline({ name: 'X' }, true);
    s.reset();
    expect(state.dirty).toBe(false);
    clock.advance(1000);
    expect(calls).toHaveLength(0);
    // a flag "veio do servidor" foi esquecida: quem não edita não manda settings
    state.settings = { name: 'Y' };
    s.schedule('settings'); s.flush();
    expect(calls).toHaveLength(0);
  });
});
