import type { OSPhoto } from '../types';
import { MAX_PHOTOS_PER_OS, isValidPhotoId } from './photos';
import type { VehiclePhotoGroup } from './photos';
import { formatDateOnly } from '../utils/dates';

// Lógica pura da tela de fotos (rascunho do OSModal, textos e galeria do cliente). Sem I/O e sem React.

/** "3 de 20" */
export const photoCountLabel = (n: number, limit: number = MAX_PHOTOS_PER_OS): string => `${n} de ${limit}`;

/** Quantas fotos ainda cabem. */
export const slotsLeft = (count: number, limit: number = MAX_PHOTOS_PER_OS): number => Math.max(0, limit - count);

/** Texto alternativo: a legenda, ou "Foto N da OS #X" (N a partir de 1). */
export const photoAlt = (photo: Pick<OSPhoto, 'caption'>, osNumber: number, position: number): string => {
  const legenda = photo.caption?.trim();
  return legenda ? legenda : `Foto ${position} da OS #${osNumber}`;
};

/** Data local "dd/mm/aaaa" do ISO da foto; vazio se inválida. */
export const photoDateLabel = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const [y, m, day] = formatDateOnly(d).split('-');
  return `${day}/${m}/${y}`;
};

/** "OS #12 · 03/05/2026" (sem data válida, só a OS). */
export const photoOriginLabel = (osNumber: number, iso: string): string => {
  const data = photoDateLabel(iso);
  return data ? `OS #${osNumber} · ${data}` : `OS #${osNumber}`;
};

/** Frase de aviso quando o lote passa do limite. */
export const limitMessage = (accepted: number, requested: number, limit: number = MAX_PHOTOS_PER_OS): string => {
  const sobra = requested - accepted;
  if (accepted <= 0) return `Esta OS já tem ${limit} fotos (o máximo). Remova alguma para adicionar outra.`;
  return `Só couberam ${accepted} ${accepted === 1 ? 'foto' : 'fotos'}: o máximo é ${limit} por OS. ${sobra} ${sobra === 1 ? 'ficou' : 'ficaram'} de fora.`;
};

/** Mensagem de erro de um arquivo, com o nome na frente. */
export const fileErrorLine = (name: string, message: string): string => `${name || 'Arquivo'}: ${message}`;

/** Rascunho diferente do que está salvo (ids, ordem ou legendas)? */
export const photosChanged = (original: readonly OSPhoto[] | undefined, draft: readonly OSPhoto[]): boolean => {
  const a = original ?? [];
  if (a.length !== draft.length) return true;
  return a.some((p, i) => p.id !== draft[i].id || (p.caption ?? '') !== (draft[i].caption ?? ''));
};

/** Fotos que estavam salvas e saíram do rascunho: vão para a lixeira ao salvar. */
export const photosToTrashOnSave = (original: readonly OSPhoto[] | undefined, draft: readonly OSPhoto[] | undefined): string[] => {
  const keep = new Set((draft ?? []).map(p => p.id));
  return (original ?? []).filter(p => !keep.has(p.id)).map(p => p.id);
};

/** Acrescenta ao fim respeitando limite, id válido e id repetido. */
export const appendPhotoMetas = (
  list: readonly OSPhoto[],
  metas: readonly OSPhoto[],
  limit: number = MAX_PHOTOS_PER_OS
): { list: OSPhoto[]; recusadas: OSPhoto[] } => {
  const ids = new Set(list.map(p => p.id));
  const out = [...list];
  const recusadas: OSPhoto[] = [];
  for (const m of metas) {
    if (!isValidPhotoId(m.id) || ids.has(m.id) || out.length >= limit) { recusadas.push(m); continue; }
    ids.add(m.id);
    out.push(m);
  }
  return { list: out, recusadas };
};

export const removeFromList = (list: readonly OSPhoto[], photoId: string): OSPhoto[] => list.filter(p => p.id !== photoId);

/** Troca a legenda como digitada (só espaços apaga; o texto é aparado em trimCaptions ao salvar). Não muta. */
export const setCaptionInList = (list: readonly OSPhoto[], photoId: string, caption: string): OSPhoto[] =>
  list.map(p => {
    if (p.id !== photoId) return p;
    const { caption: _c, ...resto } = p;
    return caption.trim() ? { ...resto, caption } : resto;
  });

/** Apara as legendas (e tira as vazias) antes de gravar na OS. */
export const trimCaptions = (list: readonly OSPhoto[]): OSPhoto[] =>
  list.map(p => {
    const { caption: _c, ...resto } = p;
    const texto = p.caption?.trim();
    return texto ? { ...resto, caption: texto } : resto;
  });

/** Corta os grupos para mostrar no máximo `cap` fotos no total (mantém a ordem); grupos que ficam vazios somem. */
export const limitGroups = (groups: readonly VehiclePhotoGroup[], cap: number): VehiclePhotoGroup[] => {
  let restante = Math.max(0, cap);
  const out: VehiclePhotoGroup[] = [];
  for (const g of groups) {
    if (restante <= 0) break;
    const photos = g.photos.slice(0, restante);
    restante -= photos.length;
    out.push(photos.length === g.photos.length ? g : { ...g, photos });
  }
  return out;
};

export const SEM_CARRO_LABEL = 'Sem veículo informado';
/** Nome do carro no filtro e nos títulos. */
export const groupLabel = (g: Pick<VehiclePhotoGroup, 'label'>): string => g.label.trim() || SEM_CARRO_LABEL;

/** Até `max` números de OS (#n) para o aviso de "ligada pelo nome", e quantas ficaram de fora. */
export const nameOnlyOsList = (osNumbers: number[], max = 5): { shown: number[]; extra: number } => ({
  shown: osNumbers.slice(0, max),
  extra: Math.max(0, osNumbers.length - max),
});

export const NAME_ONLY_WARNING =
  'Algumas fotos vêm de OS antigas ligadas a este cliente só pelo nome. Há outro cliente com o mesmo nome. Para separar, abra a OS e escolha o cliente certo.';
export const NAME_ONLY_BADGE = 'ligada pelo nome';
export const NAME_ONLY_BADGE_TITLE = 'Esta OS está ligada a este cliente só pelo nome. Abra a OS e escolha o cliente certo.';
