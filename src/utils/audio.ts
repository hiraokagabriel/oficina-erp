export const SoundFX = {
  playTone: (freq: number, type: 'sine' | 'square' | 'triangle', duration: number) => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      
      const ctx = new AudioContext();
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
    } catch (e) { console.error("Audio error", e); }
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