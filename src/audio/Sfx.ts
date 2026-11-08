import { AUDIO } from '@/config';

/**
 * Sonido del juego, sintetizado con Web Audio (no hay archivos de audio): pasos
 * según el suelo, acciones, interfaz y ambiente (viento, mar, fuego, lluvia).
 *
 * El navegador no deja sonar nada hasta el primer toque/tecla: el contexto se crea
 * recién ahí (unlock). Hasta entonces, todas las llamadas son mudas sin error.
 * Silencio guardado por jugador en localStorage (toggleMute).
 */

export type Surface = 'sand' | 'wet' | 'pebble' | 'clay' | 'earth' | 'path';
export type Ambience = { wind?: number; sea?: number; fire?: number; rain?: number };

const MUTE_KEY = 'chubut1865_mute';

class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private amb = new Map<keyof Ambience, GainNode>();
  private target: Ambience = {};
  private muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* sin storage: con sonido */
    }
    if (typeof window === 'undefined') return;
    const unlock = () => {
      this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchend', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchend', unlock);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      /* nada */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : AUDIO.master, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  private unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : AUDIO.master;
    this.master.connect(this.ctx.destination);
    // 2 s de ruido blanco: base de pasos, viento, mar, lluvia y fuego
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.buildAmbience();
    this.setAmbience(this.target);
  }

  // ------------------------------------------------------------ primitivas

  private noiseBurst(o: { dur: number; freq: number; q?: number; type?: BiquadFilterType; gain: number; attack?: number; at?: number }): void {
    const c = this.ctx;
    if (!c || !this.noise || !this.master) return;
    const t = c.currentTime + (o.at ?? 0);
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.value = o.freq * (0.9 + Math.random() * 0.2);
    f.Q.value = o.q ?? 1;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.gain, t + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, o.dur + 0.05);
  }

  private tone(o: { freq: number; to?: number; dur: number; type?: OscillatorType; gain: number; at?: number }): void {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t = c.currentTime + (o.at ?? 0);
    const osc = c.createOscillator();
    osc.type = o.type ?? 'square';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + o.dur + 0.02);
  }

  // ------------------------------------------------------------ pasos y acciones

  step(surface: Surface): void {
    const v = AUDIO.steps;
    switch (surface) {
      case 'sand':
        return this.noiseBurst({ dur: 0.09, freq: 900, q: 0.7, gain: 0.5 * v });
      case 'wet':
        return this.noiseBurst({ dur: 0.07, freq: 600, q: 1.2, type: 'lowpass', gain: 0.55 * v });
      case 'pebble':
        this.noiseBurst({ dur: 0.05, freq: 2600, q: 2, gain: 0.45 * v });
        return this.noiseBurst({ dur: 0.04, freq: 3400, q: 3, gain: 0.3 * v, at: 0.025 });
      case 'clay':
        return this.noiseBurst({ dur: 0.08, freq: 350, q: 1, type: 'lowpass', gain: 0.8 * v });
      case 'earth':
        return this.noiseBurst({ dur: 0.08, freq: 500, q: 0.9, gain: 0.6 * v });
      case 'path':
        return this.noiseBurst({ dur: 0.06, freq: 700, q: 1.4, gain: 0.55 * v });
    }
  }

  /** levantar algo (cajón, carga) */
  pickup(): void {
    this.noiseBurst({ dur: 0.12, freq: 220, type: 'lowpass', gain: 0.7 * AUDIO.actions });
    this.tone({ freq: 180, to: 320, dur: 0.12, type: 'triangle', gain: 0.18 * AUDIO.actions, at: 0.04 });
  }

  /** apoyar algo pesado */
  drop(): void {
    this.noiseBurst({ dur: 0.18, freq: 160, type: 'lowpass', gain: 0.9 * AUDIO.actions });
    this.tone({ freq: 90, to: 55, dur: 0.16, type: 'sine', gain: 0.4 * AUDIO.actions });
  }

  /** cortar jarilla */
  chop(): void {
    this.noiseBurst({ dur: 0.05, freq: 3000, q: 4, gain: 0.6 * AUDIO.actions });
    this.noiseBurst({ dur: 0.14, freq: 1400, q: 1.5, gain: 0.4 * AUDIO.actions, at: 0.05 });
  }

  /** apuntalar, golpe de madera */
  knock(): void {
    for (let i = 0; i < 3; i++) this.tone({ freq: 140, to: 90, dur: 0.08, type: 'triangle', gain: 0.35 * AUDIO.actions, at: i * 0.14 });
  }

  /** cargar leña al fuego */
  fireUp(): void {
    this.noiseBurst({ dur: 0.5, freq: 900, q: 0.5, gain: 0.5 * AUDIO.actions, attack: 0.08 });
  }

  /** avanzar una línea de diálogo */
  blip(): void {
    this.tone({ freq: 660, dur: 0.035, type: 'square', gain: 0.06 * AUDIO.ui });
  }

  /** elegir una opción / botón */
  select(): void {
    this.tone({ freq: 520, dur: 0.05, type: 'square', gain: 0.08 * AUDIO.ui });
    this.tone({ freq: 780, dur: 0.07, type: 'square', gain: 0.08 * AUDIO.ui, at: 0.05 });
  }

  /** aviso (toast) */
  chime(): void {
    this.tone({ freq: 880, dur: 0.18, type: 'sine', gain: 0.07 * AUDIO.ui });
    this.tone({ freq: 1320, dur: 0.22, type: 'sine', gain: 0.05 * AUDIO.ui, at: 0.06 });
  }

  /** entrada de una escena ilustrada */
  whoosh(): void {
    const c = this.ctx;
    if (!c || !this.noise || !this.master) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2200, t + 0.45);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.25 * AUDIO.ui, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, 0, 0.6);
  }

  /** trueno lejano (relámpago de la portada) */
  thunder(): void {
    this.noiseBurst({ dur: 2.2, freq: 120, type: 'lowpass', gain: 0.6 * AUDIO.ambience, attack: 0.25, at: 0.3 });
  }

  // ------------------------------------------------------------ ambiente

  private buildAmbience(): void {
    const c = this.ctx!;
    // ruido → filtro → vaivén (LFO alrededor de 1) → nivel (lo que fija setAmbience).
    // Dos etapas: si el LFO actuara sobre el nivel, con la capa "apagada" se
    // seguiría oyendo el vaivén.
    const loop = (filter: BiquadFilterType, freq: number, q: number, lfo?: { hz: number; depth: number }): GainNode => {
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = filter;
      f.frequency.value = freq;
      f.Q.value = q;
      const swell = c.createGain();
      swell.gain.value = 1;
      if (lfo) this.wobble(swell.gain, lfo.hz, lfo.depth);
      const level = c.createGain();
      level.gain.value = 0;
      src.connect(f).connect(swell).connect(level).connect(this.master!);
      src.start();
      return level;
    };
    // viento: ruido grave con un vaivén lento
    this.amb.set('wind', loop('bandpass', 400, 0.6, { hz: 0.08, depth: 0.5 }));
    // mar: ruido más grave con una ola cada ~6 s
    this.amb.set('sea', loop('lowpass', 500, 0.5, { hz: 0.16, depth: 0.8 }));
    // lluvia: ruido agudo y parejo
    this.amb.set('rain', loop('highpass', 2500, 0.4));
    // fuego: crepitar = ruido medio + chasquidos sueltos (ver crackle)
    this.amb.set('fire', loop('bandpass', 1200, 0.8));
    const crackle = () => {
      if (!this.ctx) return;
      const fire = this.target.fire ?? 0;
      if (fire > 0 && !this.muted) this.noiseBurst({ dur: 0.03, freq: 2500 + Math.random() * 2000, q: 5, gain: 0.35 * fire * AUDIO.ambience });
      setTimeout(crackle, 80 + Math.random() * 400);
    };
    crackle();
  }

  /** LFO de volumen: oscila `param` entre 1-depth y 1+depth (depth < 1) */
  private wobble(param: AudioParam, hz: number, depth: number): void {
    const c = this.ctx!;
    const lfo = c.createOscillator();
    lfo.frequency.value = hz;
    const lg = c.createGain();
    lg.gain.value = depth;
    lfo.connect(lg).connect(param);
    lfo.start();
  }

  /** Lleva el ambiente a estos niveles (0..1) con un fundido. Lo que no se pasa, a 0. */
  setAmbience(a: Ambience): void {
    this.target = a;
    const c = this.ctx;
    if (!c) return;
    for (const [k, g] of this.amb) {
      const level = (a[k] ?? 0) * AUDIO.ambience * AMB_SCALE[k];
      g.gain.setTargetAtTime(level, c.currentTime, 0.8);
    }
  }
}

/** cuánto pesa cada capa de ambiente respecto de las otras */
const AMB_SCALE: Record<keyof Ambience, number> = { wind: 0.35, sea: 0.5, rain: 0.25, fire: 0.18 };

export const sfx = new SfxEngine();
