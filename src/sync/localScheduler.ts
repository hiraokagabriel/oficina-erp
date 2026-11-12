import { stable } from '../services/osEditMerge';
import type { Timers } from './syncEngine';
import type { CollectionKey } from './types';

// Debounce das edições locais do provider da nuvem, fora do React para ser testável. Cada mudança de estado chama
// `schedule(coleção)`; depois de `debounceMs` sem novas mudanças (ou na hora, em `flush`) a coleção vai ao motor.
// O motor chama `flush` antes de aplicar qualquer mudança remota (`beforeRemote`): a edição ainda não vista entra na
// outbox e passa pelo `mergeRecord` em vez de ser sobrescrita pelo patch.

type Item = { id: string };

export interface SchedulerDeps {
  timers: Timers;
  debounceMs: number;
  /** null = motor ainda não abriu (ou já parou): nada é enviado. */
  getEngine: () => { localChange(collection: CollectionKey, current: readonly Item[]): void } | null;
  /** Coleção como está na tela agora. */
  getCurrent: (collection: Exclude<CollectionKey, 'settings'>) => readonly Item[];
  /** Configurações como estão na tela agora, sem segredos e sem `id`. */
  getSettings: () => object;
  /** O papel pode criar as configurações (Dono): vale mesmo que a oficina ainda não tenha linha no servidor. */
  canEditSettings: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

export class LocalScheduler {
  private dirty = new Set<CollectionKey>();
  private timer: unknown = null;
  /** `settings` veio do servidor/cache: o motor tem a linha e pode comparar. */
  private settingsFromServer = false;
  /** JSON das configurações que a tela tinha ao abrir (padrão ou do servidor): igual a isso = ninguém mexeu. */
  private baseline: string | null = null;
  /** Depois da 1ª edição real, toda mudança vai (inclusive voltar ao padrão). */
  private settingsTouched = false;

  constructor(private readonly deps: SchedulerDeps) {}

  /** Configurações iniciais da tela (padrão local) ou vindas do servidor (`fromServer`). */
  setSettingsBaseline(settings: object, fromServer: boolean): void {
    this.baseline = stable(settings);
    if (fromServer) this.settingsFromServer = true;
  }

  schedule(collection: CollectionKey): void {
    if (!this.deps.getEngine()) return;
    this.dirty.add(collection);
    this.deps.onDirtyChange?.(true);
    if (this.timer !== null) this.deps.timers.clear(this.timer);
    this.timer = this.deps.timers.set(() => { this.timer = null; this.flush(); }, this.deps.debounceMs);
  }

  /** Manda agora tudo o que está esperando. */
  flush(): void {
    if (this.timer !== null) { this.deps.timers.clear(this.timer); this.timer = null; }
    const names = [...this.dirty];
    this.dirty.clear();
    this.deps.onDirtyChange?.(false);
    const engine = this.deps.getEngine();
    if (!engine) return;
    for (const c of names) {
      if (c === 'settings') {
        const cur = this.deps.getSettings();
        const allowed = this.settingsFromServer || this.deps.canEditSettings;
        if (!allowed) continue;
        if (!this.settingsTouched && stable(cur) === this.baseline) continue;
        this.settingsTouched = true;
        engine.localChange('settings', [{ ...cur, id: 'main' }]);
      } else {
        engine.localChange(c, this.deps.getCurrent(c));
      }
    }
  }

  /** Troca de oficina, pessoa ou papel: esquece tudo. */
  reset(): void {
    if (this.timer !== null) { this.deps.timers.clear(this.timer); this.timer = null; }
    this.dirty.clear();
    this.settingsFromServer = false;
    this.settingsTouched = false;
    this.baseline = null;
    this.deps.onDirtyChange?.(false);
  }
}
