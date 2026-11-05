import { describe, expect, it } from 'vitest';
import { mergeOSEdit } from './osEditMerge';
import { prepareOSSave } from './osSave';
import type { LedgerEntry, OrderItem, OSAdvance, WorkOrder } from '../types';

// Fixtures sintéticas.
const TODAY = '2026-03-15';
const item = (id: string, description: string, price: number): OrderItem => ({ id, description, price });
const adv = (id: string, amount: number): OSAdvance => ({ id, amount, date: new Date(2026, 2, 1, 12).toISOString(), entryId: `e-${id}` });
const os = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'os1', osNumber: 7, vehicle: 'Gol - AAA-0001', clientName: 'Cliente Teste', clientPhone: '1', mileage: 100,
  status: 'APROVADO', parts: [item('p1', 'Filtro', 5000)], services: [item('s1', 'Troca', 10000)], total: 15000,
  createdAt: '2026-01-10T12:00:00.000Z', publicNotes: '', ...over,
});
/** Simula o que o formulário produz: a abertura com os campos editados (itens com ids novos, como updateWorkOrderData). */
const edit = (opened: WorkOrder, over: Partial<WorkOrder> = {}): WorkOrder => ({
  ...opened,
  parts: opened.parts.map(p => ({ ...p, id: `novo-${p.id}` })),
  services: opened.services.map(s => ({ ...s, id: `novo-${s.id}` })),
  ...over,
});
const merge = (p: Partial<Parameters<typeof mergeOSEdit>[0]> & { opened: WorkOrder; edited: WorkOrder }) =>
  mergeOSEdit({ current: p.opened, drafts: undefined, today: TODAY, ...p });
const ok = (r: ReturnType<typeof mergeOSEdit>) => {
  if (!r.ok) throw new Error('esperava ok');
  return r;
};

describe('mergeOSEdit: campos', () => {
  it('só o campo editado muda; o resto vem do banco', () => {
    const opened = os();
    const current = os({ status: 'EM_SERVICO', checklist: { items: [] } as never, paymentDate: undefined });
    const r = ok(merge({ opened, current, edited: edit(opened, { clientPhone: '99' }) }));
    expect(r.base.clientPhone).toBe('99');
    expect(r.base.status).toBe('EM_SERVICO');
    expect(r.base.checklist).toBe(current.checklist);
    expect(r.base.parts).toBe(current.parts); // itens não editados: não regrava
    expect(r.conflicts).toEqual([]);
    expect(r.changedElsewhere).toBe(true);
  });

  it('outro PC finalizou e pagou: status, paymentDate, financialId e parcelas ficam', () => {
    const opened = os();
    const current = os({ status: 'FINALIZADO', paymentDate: '2026-03-10T12:00:00.000Z', financialId: 'f1' });
    const r = ok(merge({ opened, current, edited: edit(opened, { mileage: 250 }) }));
    expect(r.base).toMatchObject({ status: 'FINALIZADO', paymentDate: '2026-03-10T12:00:00.000Z', financialId: 'f1', mileage: 250 });
  });

  it('sem edição nenhuma: igual ao banco (salvar não desfaz nada)', () => {
    const opened = os();
    const current = os({ status: 'AGUARDANDO_PAGAMENTO', total: 15000 });
    const r = ok(merge({ opened, current, edited: edit(opened) }));
    expect(r.base).toEqual(current);
  });

  it('mesmo campo editado nos dois: vence o usuário e sinaliza', () => {
    const opened = os();
    const current = os({ clientPhone: 'outro' });
    const r = ok(merge({ opened, current, edited: edit(opened, { clientPhone: 'meu' }) }));
    expect(r.base.clientPhone).toBe('meu');
    expect(r.conflicts).toEqual(['telefone']);
  });

  it('outro PC mudou o mesmo campo para o mesmo valor: sem conflito', () => {
    const opened = os();
    const r = ok(merge({ opened, current: os({ clientPhone: 'x' }), edited: edit(opened, { clientPhone: 'x' }) }));
    expect(r.conflicts).toEqual([]);
  });

  it('usuário apagou a previsão: some mesmo (valor vazio é edição)', () => {
    const opened = os({ expectedDate: '2026-04-01T15:00:00.000Z' });
    const r = ok(merge({ opened, edited: edit(opened, { expectedDate: undefined }) }));
    expect(r.base.expectedDate).toBeUndefined();
  });

  it('data da OS: mesmo dia não conta como edição', () => {
    const opened = os({ createdAt: '2026-01-10T15:23:00.000Z' });
    const current = os({ createdAt: '2026-01-11T12:00:00.000Z' });
    const r = ok(merge({ opened, current, edited: edit(opened, { createdAt: '2026-01-10T12:00:00.000Z' }) }));
    expect(r.base.createdAt).toBe('2026-01-11T12:00:00.000Z');
  });

  it('margem gravada obsoleta não é herdada', () => {
    const opened = os();
    const r = ok(merge({ opened, current: os({ profitMargin: 50 }), edited: edit(opened, { mileage: 1 }) }));
    expect(r.base.profitMargin).toBeUndefined();
  });
});

describe('mergeOSEdit: itens', () => {
  it('usuário editou as peças: total recalculado sobre os serviços ATUAIS', () => {
    const opened = os();
    const current = os({ services: [item('s9', 'Outro serviço', 20000)], total: 25000 });
    const edited = edit(opened, { parts: [item('x', 'Filtro', 7000)] });
    const r = ok(merge({ opened, current, edited }));
    expect(r.base.parts).toEqual([item('x', 'Filtro', 7000)]);
    expect(r.base.services).toBe(current.services);
    expect(r.base.total).toBe(27000);
  });

  it('itens mudados nos dois lados: vence o usuário e sinaliza', () => {
    const opened = os();
    const current = os({ parts: [item('p1', 'Filtro', 6000)], total: 16000 });
    const r = ok(merge({ opened, current, edited: edit(opened, { parts: [item('y', 'Filtro', 7000)] }) }));
    expect(r.base.total).toBe(17000);
    expect(r.conflicts).toEqual(['peças']);
  });

  it('só os ids regerados: não é edição de item', () => {
    const opened = os();
    const current = os({ parts: [item('p1', 'Filtro', 5000), item('p2', 'Óleo', 100)], total: 15100 });
    const r = ok(merge({ opened, current, edited: edit(opened) }));
    expect(r.base.parts).toBe(current.parts);
    expect(r.base.total).toBe(15100);
  });
});

describe('mergeOSEdit: itens (forma canônica)', () => {
  it('custo 0 e catalogItemId divergente não contam como edição: peças do banco prevalecem sem aviso', () => {
    const opened = os({ parts: [{ ...item('p1', 'Filtro', 5000), cost: 0, catalogItemId: 'c1' }] });
    const current = os({ parts: [item('p1', 'Filtro', 5000), item('p2', 'Óleo', 100)], total: 15100 });
    const edited = edit(opened, { parts: [{ id: 'z', description: 'Filtro', price: 5000 }] });
    const r = ok(merge({ opened, current, edited }));
    expect(r.base.parts).toBe(current.parts);
    expect(r.conflicts).toEqual([]);
  });
});

describe('mergeOSEdit: vínculos por id', () => {
  it('outro PC trocou o veículo; este mudou só km: veículo e vehicleId do banco ficam', () => {
    const opened = os({ vehicle: 'Gol - AAA-0001', vehicleId: 'v1', clientId: 'c1' });
    const current = os({ vehicle: 'Uno - BBB-0002', vehicleId: 'v2', clientId: 'c1' });
    const r = ok(merge({ opened, current, edited: edit(opened, { mileage: 900 }) }));
    expect(r.base).toMatchObject({ vehicle: 'Uno - BBB-0002', vehicleId: 'v2', clientId: 'c1', mileage: 900 });
  });
  it('usuário trocou o veículo: vehicleId vem da edição', () => {
    const opened = os({ vehicle: 'Gol - AAA-0001', vehicleId: 'v1' });
    const r = ok(merge({ opened, edited: edit(opened, { vehicle: 'Uno - BBB-0002', vehicleId: 'v2' }) }));
    expect(r.base).toMatchObject({ vehicle: 'Uno - BBB-0002', vehicleId: 'v2' });
  });
});

describe('mergeOSEdit: fotos', () => {
  const ph = (id: string, caption?: string) => ({ id, createdAt: '2026-03-01T12:00:00.000Z', ...(caption ? { caption } : {}) });
  it('outro PC anexou foto e o usuário removeu outra: as duas valem', () => {
    const opened = os({ photos: [ph('a'), ph('b')] });
    const current = os({ photos: [ph('a'), ph('b'), ph('c')] });
    const r = ok(merge({ opened, current, edited: edit(opened, { photos: [ph('a')] }) }));
    expect(r.base.photos?.map(p => p.id)).toEqual(['a', 'c']);
  });
  it('usuário anexou foto: entra junto das do banco', () => {
    const opened = os({ photos: [ph('a')] });
    const current = os({ photos: [ph('a'), ph('c')] });
    const r = ok(merge({ opened, current, edited: edit(opened, { photos: [ph('a'), ph('n')] }) }));
    expect(r.base.photos?.map(p => p.id)).toEqual(['a', 'c', 'n']);
  });
  it('sem mexer nas fotos: as do banco ficam', () => {
    const opened = os({ photos: [ph('a')] });
    const current = os({ photos: [ph('a'), ph('c')] });
    const r = ok(merge({ opened, current, edited: edit(opened) }));
    expect(r.base.photos?.map(p => p.id)).toEqual(['a', 'c']);
  });
  it('foto removida pelo outro PC: não volta; legenda conflitante vale a do usuário', () => {
    const opened = os({ photos: [ph('a', 'x'), ph('b')] });
    const current = os({ photos: [ph('a', 'outra')] });
    const r = ok(merge({ opened, current, edited: edit(opened, { photos: [ph('a', 'minha'), ph('b')] }) }));
    expect(r.base.photos).toEqual([ph('a', 'minha')]);
  });
  it('soma passa de 20: corta e sinaliza', () => {
    const many = (n: number, pre: string) => Array.from({ length: n }, (_, i) => ph(`${pre}${i}`));
    const opened = os({ photos: many(10, 'o') });
    const current = os({ photos: [...many(10, 'o'), ...many(8, 'c')] });
    const r = ok(merge({ opened, current, edited: edit(opened, { photos: [...many(10, 'o'), ...many(5, 'n')] }) }));
    expect(r.base.photos).toHaveLength(20);
    expect(r.photosTrimmed).toBe(true);
  });
  it('removeu todas: o campo some', () => {
    const opened = os({ photos: [ph('a')] });
    const r = ok(merge({ opened, edited: edit(opened, { photos: undefined }) }));
    expect(r.base.photos).toBeUndefined();
  });
});

describe('mergeOSEdit: adiantamentos', () => {
  const draft = (a: OSAdvance) => ({ id: a.id, date: '2026-03-01', amount: a.amount });

  it('outro PC lançou adiantamento e o usuário não mexeu: drafts undefined (nada removido)', () => {
    const opened = os({ advances: [adv('a1', 1000)] });
    const current = os({ advances: [adv('a1', 1000), adv('a2', 500)] });
    const r = ok(merge({ opened, current, edited: edit(opened), drafts: [draft(adv('a1', 1000))] }));
    expect(r.drafts).toBeUndefined();
    const saved = prepareOSSave({ base: r.base, previous: current, drafts: r.drafts, ledger: [], machine: 'PC', today: TODAY });
    expect(saved.ok && saved.os.advances?.map(a => a.id)).toEqual(['a1', 'a2']);
  });

  it('usuário acrescentou um e outro PC lançou outro: ficam os dois + o antigo', () => {
    const opened = os({ advances: [adv('a1', 1000)] });
    const current = os({ advances: [adv('a1', 1000), adv('a2', 500)] });
    const drafts = [draft(adv('a1', 1000)), { date: '2026-03-02', amount: 300 }];
    const r = ok(merge({ opened, current, edited: edit(opened), drafts }));
    expect(r.drafts?.map(d => d.amount)).toEqual([1000, 500, 300]);
    const saved = prepareOSSave({ base: r.base, previous: current, drafts: r.drafts, ledger: [], machine: 'PC', today: TODAY, newId: (() => { let n = 0; return () => `n${++n}`; })() });
    expect(saved.ok && saved.os.advances?.map(a => a.amount)).toEqual([1000, 500, 300]);
  });

  it('usuário removeu um: só ele sai; o que outro PC criou fica', () => {
    const opened = os({ advances: [adv('a1', 1000), adv('a2', 500)] });
    const current = os({ advances: [adv('a1', 1000), adv('a2', 500), adv('a3', 70)] });
    const r = ok(merge({ opened, current, edited: edit(opened), drafts: [draft(adv('a1', 1000))] }));
    expect(r.drafts?.map(d => d.id)).toEqual(['a1', 'a3']);
  });

  it('usuário editou o valor; outro PC editou o mesmo: vence o usuário e sinaliza', () => {
    const opened = os({ advances: [adv('a1', 1000)] });
    const current = os({ advances: [adv('a1', 1200)] });
    const r = ok(merge({ opened, current, edited: edit(opened), drafts: [{ id: 'a1', date: '2026-03-01', amount: 900 }] }));
    expect(r.drafts).toEqual([{ id: 'a1', date: '2026-03-01', amount: 900 }]);
    expect(r.conflicts).toEqual(['adiantamentos']);
  });

  it('OS finalizada em outro PC: edição de adiantamento é ignorada e avisada', () => {
    const opened = os({ advances: [adv('a1', 1000)] });
    const current = os({ advances: [adv('a1', 1000)], status: 'FINALIZADO', financialId: 'f1' });
    const r = ok(merge({ opened, current, edited: edit(opened), drafts: [{ id: 'a1', date: '2026-03-01', amount: 900 }] }));
    expect(r.advancesIgnored).toBe(true);
    const ledger: LedgerEntry[] = [];
    const saved = prepareOSSave({ base: r.base, previous: current, drafts: r.drafts, ledger, machine: 'PC', today: TODAY });
    expect(saved.ok && saved.os.advances).toEqual(current.advances);
  });
});

describe('mergeOSEdit: adiantamentos (abertura sem lista)', () => {
  it('abertura sem advances e sem legado: adiantamento lançado por outro PC não é apagado', () => {
    const opened = os(); // advances undefined
    const current = os({ advances: [adv('a2', 500)] });
    const r = ok(merge({ opened, current, edited: edit(opened), drafts: [{ date: '2026-03-02', amount: 300 }] }));
    expect(r.drafts?.map(d => d.amount)).toEqual([500, 300]);
  });
  it('legado ainda legado no banco: vale a lista do formulário', () => {
    const opened = os({ advanceAmount: 1000, advanceEntryId: 'e1' });
    const drafts = [{ date: '2026-01-10', amount: 1000 }, { date: '2026-03-02', amount: 200 }];
    const r = ok(merge({ opened, current: opened, edited: edit(opened), drafts }));
    expect(r.drafts).toEqual(drafts);
  });
  it('legado convertido em outro PC (que acrescentou mais um): usuário não mexeu na legada, acrescentou outro; nada duplica nem cai', () => {
    const opened = os({ advanceAmount: 1000, advanceEntryId: 'e1' });
    const current = os({ advanceAmount: 1000, advances: [{ id: 'a1', amount: 1000, date: new Date(2026, 0, 10, 12).toISOString(), entryId: 'e1' }, adv('a2', 500)] });
    const drafts = [{ date: '2026-01-10', amount: 1000 }, { date: '2026-03-02', amount: 200 }];
    const r = ok(merge({ opened, current, edited: edit(opened), drafts }));
    expect(r.drafts?.map(d => d.amount)).toEqual([1000, 500, 200]);
    expect(r.drafts?.[0].id).toBe('a1');
  });
});

describe('mergeOSEdit: OS excluída', () => {
  it('não ressuscita: devolve DELETED', () => {
    const opened = os();
    expect(mergeOSEdit({ opened, edited: edit(opened), current: undefined, drafts: undefined })).toEqual({ ok: false, reason: 'DELETED' });
  });
});
