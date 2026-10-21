// Um único AudioContext, criado sob demanda e reaproveitado (um por som nunca era fechado).
let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (sharedCtx && sharedCtx.state !== 'closed') return sharedCtx;
  const Ctor: typeof window.AudioContext | undefined = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  sharedCtx = new Ctor();
  return sharedCtx;
}

export const SoundFX = {
  playTone: (freq: number, type: 'sine' | 'square' | 'triangle', duration: number) => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      // Contexto suspenso (política de autoplay): só agenda o tom depois que ele voltar a rodar,
      // senão os tons ficam presos e tocam todos juntos no primeiro clique.
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => { if (ctx.state === 'running') schedule(ctx); }).catch(() => undefined);
        return;
      }
      schedule(ctx);
    } catch (e) { console.error("Audio error", e); }

    function schedule(ctx: AudioContext) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    }
  },
  
  success: () => {
    SoundFX.playTone(600, 'sine', 0.1);
    setTimeout(() => SoundFX.playTone(800, 'sine', 0.2), 100);
  },
  
  error: () => {
    SoundFX.playTone(150, 'square', 0.3);
  },
  
  pop: () => {
    SoundFX.playTone(400, 'triangle', 0.05);
  }
};