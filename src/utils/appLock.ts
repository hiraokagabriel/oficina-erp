// Bloqueio do app (PC compartilhado, "Entre de novo", troca de papel): enquanto algo cobre o app, ele inteiro fica
// `inert` e nenhum atalho global age. O `CloudBridge` (modo nuvem) liga e desliga; no modo arquivo nunca é ligado,
// então tudo aqui é inofensivo. Menus e popovers em portal (que ficam fora do `#root`) são fechados e ficam `inert`.

let locked = false;
const subs = new Set<(locked: boolean) => void>();
/** Elementos do body que este módulo marcou `inert` (só esses são liberados depois). */
const marked = new Set<InertTarget>();

export interface InertTarget { id?: string; tagName?: string; inert?: boolean }
export interface BodyLike { children: ArrayLike<InertTarget> }

/** Tudo no ar? Atalhos e ouvintes globais perguntam aqui antes de agir. */
export const isAppLocked = (): boolean => locked;

/** Avisa quando o bloqueio liga ou desliga. Devolve a função que cancela. */
export function subscribeAppLock(cb: (locked: boolean) => void): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}

/** Põe/tira `inert` nos filhos diretos do body, exceto a raiz do app (`rootId`), scripts e estilos. */
export function applyInertToBody(body: BodyLike, on: boolean, rootId = 'root'): void {
  if (on) {
    for (const el of Array.from(body.children)) {
      const tag = (el.tagName ?? '').toUpperCase();
      if (el.id === rootId || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || el.inert) continue;
      el.inert = true;
      marked.add(el);
    }
  } else {
    for (const el of marked) el.inert = false;
    marked.clear();
  }
}

export function setAppLocked(value: boolean): void {
  if (value === locked) return;
  locked = value;
  if (typeof document !== 'undefined' && document.body) {
    if (value) {
      // primeiro os menus fecham (ouvintes), depois o que sobrou em portal fica inerte
      for (const cb of [...subs]) cb(true);
      applyInertToBody(document.body as unknown as BodyLike, true);
    } else {
      applyInertToBody(document.body as unknown as BodyLike, false);
      for (const cb of [...subs]) cb(false);
    }
  } else {
    for (const cb of [...subs]) cb(value);
  }
}
