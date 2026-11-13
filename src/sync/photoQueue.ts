import type { KvStore } from './kvStore';
import type { Timers } from './syncEngine';

// Fila de envio das fotos para o Storage (docs/NUVEM-SPEC.md seções 4 e 6, PR 7). Offline-first:
//  - a foto entra na fila (IndexedDB `photoQueue`, com os bytes do original e da miniatura) e aparece na hora,
//    lida do blob local (`readLocal`);
//  - o envio roda em segundo plano, com retentativa e espera crescente; sem internet, espera a volta;
//  - erro de rede, 5xx, 408, 429 e 401 (sessão renovando) = temporário: tenta de novo, para sempre;
//  - duplicado (409, o objeto já existe) = sucesso: o upload é idempotente por caminho;
//  - erro definitivo (403, 413, 415, 400...) = a foto fica `failed` NA FILA (bytes guardados) e `onFailed` avisa uma vez;
//  - só sai da fila depois que os DOIS arquivos subiram.
// A referência da foto (`OSPhoto`) vai para a OS no "Salvar", sem esperar o envio. Outros aparelhos que abrirem a OS
// antes da foto chegar veem "Foto ainda chegando" e tentam de novo sozinhos (PhotoThumb); quem tirou a foto a vê do blob local.
// Lógica com relógio, temporizadores e armazenamento injetados (testável sem rede nem IndexedDB real).

export type PhotoUploadResult =
  | { ok: true }
  | { ok: false; kind: 'transient' | 'definitive'; message: string };

/** Sobe um dos dois arquivos da foto. Duplicado (já existe) já vem como `ok`. Nunca deve lançar (se lançar, conta como temporário). */
export type PhotoUploader = (osId: string, photoId: string, thumb: boolean, bytes: Blob) => Promise<PhotoUploadResult>;

export interface QueuedPhoto {
  /** `<osId>/<photoId>` */
  id: string;
  osId: string;
  photoId: string;
  full: ArrayBuffer;
  thumb: ArrayBuffer;
  fullDone: boolean;
  thumbDone: boolean;
  attempts: number;
  /** Instante (ms) a partir do qual pode tentar de novo. */
  nextAt: number;
  state: 'pending' | 'failed';
  lastError?: string;
  createdAt: string;
}

export const queueKey = (osId: string, photoId: string): string => `${osId}/${photoId}`;

export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

/** Espera antes da tentativa seguinte: 2 s, 4 s, 8 s... até 5 min. */
export const backoffMs = (attempts: number): number =>
  Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));

const asBlob = (buf: ArrayBuffer): Blob => new Blob([buf], { type: 'image/jpeg' });

export interface PhotoQueueOptions {
  store: KvStore<QueuedPhoto>;
  uploader: PhotoUploader;
  now: () => number;
  timers: Timers;
  online?: boolean;
  /** Erro definitivo: a foto não vai subir sem ajuda. Chamado uma vez por foto. */
  onFailed?: (item: QueuedPhoto, message: string) => void;
}

export class PhotoQueue {
  private readonly items = new Map<string, QueuedPhoto>();
  private online: boolean;
  private pumping: Promise<void> | null = null;
  private again = false;
  private timer: unknown = null;
  private stopped = false;

  constructor(private readonly o: PhotoQueueOptions) {
    this.online = o.online ?? true;
  }

  /** Lê a fila gravada (sessão anterior) e retoma o envio. */
  async load(): Promise<void> {
    for (const it of await this.o.store.getAll()) this.items.set(it.id, it);
    this.kick();
  }

  /** Guarda a foto no aparelho (persistido antes de devolver) e começa a enviar. */
  async enqueue(osId: string, photoId: string, full: Blob, thumb: Blob): Promise<void> {
    const [fb, tb] = await Promise.all([full.arrayBuffer(), thumb.arrayBuffer()]);
    const item: QueuedPhoto = {
      id: queueKey(osId, photoId), osId, photoId, full: fb, thumb: tb, fullDone: false, thumbDone: false,
      attempts: 0, nextAt: 0, state: 'pending', createdAt: new Date(this.o.now()).toISOString(),
    };
    await this.o.store.put(item);
    this.items.set(item.id, item);
    this.kick();
  }

  /** Foto ainda no aparelho (subindo ou com erro)? */
  has(osId: string, photoId: string): boolean {
    return this.items.has(queueKey(osId, photoId));
  }

  /** Bytes locais da foto, se ainda estiver na fila (a foto aparece na hora, antes de subir). */
  readLocal(osId: string, photoId: string, thumb: boolean): Blob | null {
    const it = this.items.get(queueKey(osId, photoId));
    return it ? asBlob(thumb ? it.thumb : it.full) : null;
  }

  /** Quantas fotos esperam para subir (inclui as com erro). */
  count(): number { return this.items.size; }
  failedCount(): number { return [...this.items.values()].filter(i => i.state === 'failed').length; }

  /** Erro definitivo: a foto não vai subir sem ajuda. */
  isFailed(osId: string, photoId: string): boolean {
    return this.items.get(queueKey(osId, photoId))?.state === 'failed';
  }

  /** "Tentar de novo" numa foto só. */
  retryOne(osId: string, photoId: string): void {
    const it = this.items.get(queueKey(osId, photoId));
    if (!it || it.state !== 'failed') return;
    it.state = 'pending'; it.attempts = 0; it.nextAt = 0; it.lastError = undefined;
    void this.o.store.put(it);
    this.kick();
  }

  /** A foto saiu da OS antes de subir: tira da fila. `photoId` nulo = todas da OS. Objetos já enviados ficam no Storage. */
  async cancel(osId: string, photoId: string | null): Promise<void> {
    const ids = [...this.items.values()].filter(i => i.osId === osId && (photoId === null || i.photoId === photoId)).map(i => i.id);
    for (const id of ids) this.items.delete(id);
    for (const id of ids) await this.o.store.delete(id);
  }

  setOnline(online: boolean): void {
    this.online = online;
    if (online) {
      // Voltou a internet: não espera o fim do backoff.
      for (const it of this.items.values()) if (it.state === 'pending') it.nextAt = 0;
      this.kick();
    }
  }

  /** "Tentar de novo" nas fotos com erro definitivo. */
  retryFailed(): void {
    for (const it of this.items.values()) {
      if (it.state !== 'failed') continue;
      it.state = 'pending'; it.attempts = 0; it.nextAt = 0; it.lastError = undefined;
      void this.o.store.put(it);
    }
    this.kick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) { this.o.timers.clear(this.timer); this.timer = null; }
  }

  /** Espera o laço atual terminar (testes e desligamento). */
  async settled(): Promise<void> { while (this.pumping) await this.pumping; }

  private kick(): void {
    if (this.stopped) return;
    if (this.pumping) { this.again = true; return; }
    this.pumping = this.pump().finally(() => {
      this.pumping = null;
      if (this.again && !this.stopped) { this.again = false; this.kick(); }
    });
  }

  private async pump(): Promise<void> {
    if (this.timer !== null) { this.o.timers.clear(this.timer); this.timer = null; }
    let nextWake: number | null = null;
    for (const id of [...this.items.keys()]) {
      const it = this.items.get(id);
      if (!it || it.state !== 'pending' || this.stopped) continue;
      if (!this.online) continue;
      if (it.nextAt > this.o.now()) { nextWake = nextWake === null ? it.nextAt : Math.min(nextWake, it.nextAt); continue; }
      const wake = await this.sendOne(it);
      if (wake !== null) nextWake = nextWake === null ? wake : Math.min(nextWake, wake);
    }
    if (nextWake !== null && !this.stopped) {
      this.timer = this.o.timers.set(() => { this.timer = null; this.kick(); }, Math.max(0, nextWake - this.o.now()));
    }
  }

  /** Devolve quando tentar de novo (ms), ou null se não precisa. */
  private async sendOne(it: QueuedPhoto): Promise<number | null> {
    // Miniatura primeiro: é o que os outros aparelhos pedem antes (a lista); o original vem a seguir.
    for (const thumb of [true, false]) {
      if (thumb ? it.thumbDone : it.fullDone) continue;
      let res: PhotoUploadResult;
      try {
        res = await this.o.uploader(it.osId, it.photoId, thumb, asBlob(thumb ? it.thumb : it.full));
      } catch (e) {
        res = { ok: false, kind: 'transient', message: e instanceof Error ? e.message : String(e) };
      }
      if (!this.items.has(it.id)) return null; // cancelada durante o envio: não ressuscita
      if (res.ok) {
        if (thumb) it.thumbDone = true; else it.fullDone = true;
        await this.o.store.put(it);
        continue;
      }
      it.lastError = res.message;
      if (res.kind === 'definitive') {
        it.state = 'failed';
        await this.o.store.put(it);
        this.o.onFailed?.(it, res.message);
        return null;
      }
      it.attempts += 1;
      it.nextAt = this.o.now() + backoffMs(it.attempts);
      await this.o.store.put(it);
      return it.nextAt;
    }
    this.items.delete(it.id);
    await this.o.store.delete(it.id);
    return null;
  }
}
