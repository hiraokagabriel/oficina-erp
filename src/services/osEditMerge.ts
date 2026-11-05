import type { OrderItem, OSAdvanceDraft, OSPhoto, WorkOrder } from '../types';
import { calculateFinancials } from '../utils/helpers';
import { formatDateOnly, parseDateFlexible } from '../utils/dates';
import { MAX_PHOTOS_PER_OS } from './photos';
import { advanceRowsToPayload, buildAdvanceRows } from './advancesDraft';
import { isAdvanceSyncLocked } from './osFinanceService';

// Salvar a janela da OS sem regravar o que ela não editou (2 PCs no mesmo banco). Função pura.
//
// A janela guarda `opened` (cópia tirada ao abrir). O usuário edita um rascunho; `edited` é a OS que o formulário
// produz (opened + campos do formulário). `current` é a OS no banco AGORA (pode ter mudado em outro PC).
// Merge de 3 vias por campo: só entra no resultado o campo que o usuário de fato mudou (edited != opened);
// o resto vem de `current`. Assim status, paymentDate, financialId, installmentConfig, checklist, advances, fotos
// novas e demais campos que a janela não edita nunca voltam ao valor antigo.
// Mesmo campo mudado nos dois lados: vence o do usuário e o campo é listado em `conflicts`.

export type MergeOSEditResult =
  | { ok: false; reason: 'DELETED' }
  | {
      ok: true;
      /** OS atual do banco com as edições do usuário por cima (ainda sem aplicar adiantamentos). */
      base: WorkOrder;
      /** Lista COMPLETA de adiantamentos a aplicar sobre `current`; undefined = o usuário não mexeu neles. */
      drafts: OSAdvanceDraft[] | undefined;
      /** Rótulos dos campos que o usuário e outro PC mudaram (valeu o do usuário). */
      conflicts: string[];
      /** A OS no banco já era diferente da cópia de abertura (outro PC salvou nesse meio-tempo). */
      changedElsewhere: boolean;
      /** O usuário mexeu nos adiantamentos, mas a OS ficou travada (finalizada/lançada) em outro PC: não aplicados. */
      advancesIgnored: boolean;
      /** A soma das fotos dos dois PCs passou do limite por OS: as últimas ficaram de fora. */
      photosTrimmed: boolean;
    };

export const OS_DELETED_MESSAGE =
  'Esta OS foi excluída em outro PC enquanto a janela estava aberta. Nada foi salvo para não recriá-la. Feche a janela e, se precisar, crie a OS de novo.';

export const conflictsMessage = (labels: string[]): string =>
  `Outro PC também mudou: ${labels.join(', ')}. Ficou o que você digitou.`;

export const CHANGED_ELSEWHERE_MESSAGE =
  'Esta OS foi alterada em outro PC enquanto a janela estava aberta. As mudanças de lá foram mantidas.';

export const ADVANCES_IGNORED_MESSAGE =
  'Os adiantamentos não foram alterados: a OS foi finalizada ou lançada no financeiro em outro PC.';

export const PHOTOS_TRIMMED_MESSAGE =
  `Outro PC também anexou fotos e o limite de ${MAX_PHOTOS_PER_OS} por OS foi passado. As últimas fotos não foram mantidas.`;

const day10 = (iso: string | undefined): string => (iso ?? '').slice(0, 10);
const localDay = (iso: string | undefined): string => (iso ? formatDateOnly(parseDateFlexible(iso)) : '');
// Forma canônica do item: sem id (regerado a cada salvamento) nem catalogItemId (vínculo), custo 0 = não informado.
const itemsKey = (items: OrderItem[]): string =>
  JSON.stringify(items.map(i => [i.description, i.price, i.cost && i.cost > 0 ? i.cost : null, i.category ?? null]));
const photosEq = (a: OSPhoto, b: OSPhoto): boolean => JSON.stringify(a) === JSON.stringify(b);

interface ScalarRule { key: keyof WorkOrder; label?: string; same: (a: WorkOrder, b: WorkOrder) => boolean }
const byValue = (key: keyof WorkOrder, label?: string): ScalarRule => ({
  key, label, same: (a, b) => (a[key] ?? '') === (b[key] ?? ''),
});
const SCALARS: ScalarRule[] = [
  byValue('osNumber', 'número da OS'),
  byValue('vehicle', 'veículo'),
  byValue('clientName', 'cliente'),
  byValue('clientPhone', 'telefone'),
  byValue('mileage', 'km'),
  byValue('publicNotes', 'observações'),
  byValue('technician', 'técnico'),
  { key: 'expectedDate', label: 'previsão de entrega', same: (a, b) => localDay(a.expectedDate) === localDay(b.expectedDate) },
  { key: 'createdAt', label: 'data da OS', same: (a, b) => day10(a.createdAt) === day10(b.createdAt) },
];

const sameDraft = (d: OSAdvanceDraft, o: { date: string; amount: number }): boolean =>
  d.amount === o.amount && localDay(d.date) === localDay(o.date);

export const mergeOSEdit = ({ opened, edited, current, drafts, today = formatDateOnly(new Date()) }: {
  opened: WorkOrder;
  edited: WorkOrder;
  /** OS no banco agora; undefined = foi excluída. */
  current: WorkOrder | undefined;
  /** Lista de adiantamentos do formulário (undefined = janela travada, não editou). */
  drafts: OSAdvanceDraft[] | undefined;
  today?: string;
}): MergeOSEditResult => {
  if (!current) return { ok: false, reason: 'DELETED' };

  const conflicts: string[] = [];
  const { profitMargin: _legacyMargin, ...cur } = current; // margem gravada é obsoleta (igual updateWorkOrderData)
  const base: WorkOrder = { ...cur };
  const assign = <K extends keyof WorkOrder>(k: K, v: WorkOrder[K]): void => { base[k] = v; };

  // Campos simples.
  const assigned = new Set<keyof WorkOrder>();
  for (const rule of SCALARS) {
    if (rule.same(opened, edited)) continue; // o usuário não mexeu: fica o do banco
    assign(rule.key, edited[rule.key]);
    assigned.add(rule.key);
    if (rule.label && !rule.same(current, opened) && !rule.same(current, edited)) conflicts.push(rule.label);
  }

  // Ids de vínculo andam junto do texto que identificam: só vêm da edição se o texto veio (ou se só o id mudou, ex.: homônimo escolhido).
  const linkId = (idKey: 'clientId' | 'vehicleId' | 'technicianId', textKeys: (keyof WorkOrder)[]): void => {
    const textFromEdit = textKeys.some(k => assigned.has(k));
    const idTouched = (opened[idKey] ?? '') !== (edited[idKey] ?? '');
    const sameText = textKeys.every(k => (current[k] ?? '') === (edited[k] ?? ''));
    if (textFromEdit || (idTouched && sameText)) assign(idKey, edited[idKey]);
  };
  linkId('clientId', ['clientName']);
  linkId('vehicleId', ['vehicle', 'clientName']);
  linkId('technicianId', ['technician']);

  // Itens (peças e serviços): comparados sem o id, que é regerado a cada salvamento.
  const partsChanged = itemsKey(opened.parts) !== itemsKey(edited.parts);
  const servicesChanged = itemsKey(opened.services) !== itemsKey(edited.services);
  if (partsChanged || servicesChanged) {
    if (partsChanged) {
      base.parts = edited.parts;
      if (itemsKey(current.parts) !== itemsKey(opened.parts) && itemsKey(current.parts) !== itemsKey(edited.parts)) conflicts.push('peças');
    }
    if (servicesChanged) {
      base.services = edited.services;
      if (itemsKey(current.services) !== itemsKey(opened.services) && itemsKey(current.services) !== itemsKey(edited.services)) conflicts.push('serviços');
    }
    const fin = calculateFinancials(base.parts, base.services);
    base.total = base.parts.reduce((a, b) => a + b.price, 0) + base.services.reduce((a, b) => a + b.price, 0);
    base.totalCost = fin.totalCost;
    base.profit = fin.profit;
  }

  let photosTrimmed = false;
  // Fotos: remoções e acréscimos do usuário sobre a lista ATUAL (fotos que outro PC anexou ficam).
  const op = opened.photos ?? [];
  const ed = edited.photos ?? [];
  const opById = new Map(op.map(p => [p.id, p]));
  const edById = new Map(ed.map(p => [p.id, p]));
  const photosTouched = op.length !== ed.length || ed.some(p => { const o = opById.get(p.id); return !o || !photosEq(o, p); });
  if (photosTouched) {
    const out: OSPhoto[] = [];
    const seen = new Set<string>();
    for (const p of current.photos ?? []) {
      seen.add(p.id);
      if (opById.has(p.id) && !edById.has(p.id)) continue; // o usuário removeu
      const mine = edById.get(p.id);
      const was = opById.get(p.id);
      out.push(mine && was && !photosEq(was, mine) ? mine : p);
    }
    for (const p of ed) if (!seen.has(p.id) && !opById.has(p.id)) out.push(p); // acrescentada pelo usuário
    if (out.length > MAX_PHOTOS_PER_OS) { photosTrimmed = true; out.length = MAX_PHOTOS_PER_OS; } // soma das fotos dos dois PCs passou do limite
    if (out.length > 0) base.photos = out;
    else delete base.photos;
  }

  // Adiantamentos: 3 vias sobre a lista atual.
  let mergedDrafts: OSAdvanceDraft[] | undefined;
  let advancesIgnored = false;
  if (drafts) {
    const openedRows = advanceRowsToPayload(buildAdvanceRows(opened, today));
    const rowKey = (r: OSAdvanceDraft): string => `${r.id ?? ''}|${localDay(r.date)}|${r.amount}`;
    const touched = drafts.length !== openedRows.length
      || drafts.map(rowKey).join(';') !== openedRows.map(rowKey).join(';');
    if (touched) {
      // OS aberta no formato legado (advanceAmount sem lista): a linha legada não tem id.
      const legacy = (opened.advances?.length ?? 0) === 0 && (opened.advanceAmount ?? 0) > 0;
      let openedList = opened.advances ?? [];
      let formDrafts = drafts;
      if (legacy && (current.advances?.length ?? 0) === 0) {
        mergedDrafts = drafts; // continua legada no banco: vale a lista do formulário
      } else {
        if (legacy) {
          // Outro PC já converteu: casa a linha legada com o adiantamento equivalente em `current` (mesmo valor).
          const row = openedRows[0];
          const match = (current.advances ?? []).find(a => a.amount === row.amount && localDay(a.date) === row.date)
            ?? (current.advances ?? []).find(a => a.amount === row.amount);
          if (match) {
            openedList = [{ ...match, date: row.date, amount: row.amount }];
            const idx = drafts.findIndex(d => !d.id && sameDraft(d, row));
            formDrafts = drafts.map((d, i) => (i === idx ? { id: match.id, date: d.date, amount: d.amount } : d));
          } else {
            const idx = drafts.findIndex(d => !d.id && sameDraft(d, row));
            formDrafts = drafts.filter((_, i) => i !== idx); // outro PC tirou a legada e o usuário não mexeu nela
          }
        }
        const openedById = new Map(openedList.map(a => [a.id, a]));
        const draftById = new Map(formDrafts.filter(d => d.id).map(d => [d.id as string, d]));
        const currentList = current.advances ?? [];
        const currentById = new Map(currentList.map(a => [a.id, a]));
        const out: OSAdvanceDraft[] = [];
        let advConflict = false;
        for (const a of currentList) {
          const o = openedById.get(a.id);
          const d = draftById.get(a.id);
          if (o && !d) { // o usuário removeu
            if (!sameDraft({ date: a.date, amount: a.amount }, o)) advConflict = true;
            continue;
          }
          if (o && d && !sameDraft(d, o)) { // o usuário editou
            if (!sameDraft({ date: a.date, amount: a.amount }, o) && !sameDraft(d, a)) advConflict = true;
            out.push({ id: a.id, date: d.date, amount: d.amount });
            continue;
          }
          out.push({ id: a.id, date: localDay(a.date), amount: a.amount });
        }
        for (const d of formDrafts) {
          if (!d.id || !openedById.has(d.id)) { out.push(d.id ? { date: d.date, amount: d.amount } : d); continue; } // novo
          const o = openedById.get(d.id);
          if (!currentById.has(d.id) && o && !sameDraft(d, o)) { // outro PC removeu, o usuário editou: recria com o valor dele
            out.push({ date: d.date, amount: d.amount });
            advConflict = true;
          }
        }
        if (advConflict) conflicts.push('adiantamentos');
        mergedDrafts = out;
      }
      if (isAdvanceSyncLocked(current)) advancesIgnored = true;
    }
  }

  const changedElsewhere = current !== opened && JSON.stringify(current) !== JSON.stringify(opened);
  return { ok: true, base, drafts: mergedDrafts, conflicts, changedElsewhere, advancesIgnored, photosTrimmed };
};
