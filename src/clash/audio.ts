/* UNIVERSE CLASH - sound.
   Everything is synthesised: no asset downloads, no loading screen, no
   licensing. The mix is deliberately dry and punchy: short bodies, hard
   transients, a little tape noise under the music. */

export type SfxName =
  | 'ui'
  | 'select'
  | 'deny'
  | 'hit0'
  | 'hit1'
  | 'hit2'
  | 'hit3'
  | 'block'
  | 'parry'
  | 'perfect'
  | 'whoosh'
  | 'jump'
  | 'land'
  | 'dodge'
  | 'ko'
  | 'super'
  | 'throw'
  | 'pickup'
  | 'score'
  | 'coin'
  | 'pack'
  | 'level';

type MusicTheme = 'brass' | 'guqin' | 'chiptune' | 'organ' | 'cartoon' | 'drone' | string;

interface MusicPattern {
  tempo: number;
  /** semitone offsets from the root, one entry per eighth note. */
  lead: (number | null)[];
  bass: (number | null)[];
  wave: OscillatorType;
  root: number;
  /** 0..1, how much noise is mixed under each note. */
  grit: number;
}

const PATTERNS: Record<string, MusicPattern> = {
  brass: {
    tempo: 132, root: 46, wave: 'sawtooth', grit: 0.12,
    lead: [12, null, 15, 12, 17, null, 15, 12, 19, null, 17, 15, 12, null, 10, null],
    bass: [0, null, null, 0, 5, null, null, 5, 3, null, null, 3, 7, null, null, 10],
  },
  guqin: {
    tempo: 84, root: 50, wave: 'triangle', grit: 0.03,
    lead: [0, 3, 7, 12, 10, 7, 3, null, 5, 8, 12, 15, 12, 8, 5, null],
    bass: [0, null, null, null, 5, null, null, null, 3, null, null, null, 7, null, null, null],
  },
  chiptune: {
    tempo: 148, root: 45, wave: 'square', grit: 0.05,
    lead: [0, 7, 12, 7, 15, 12, 7, 12, 3, 10, 15, 10, 17, 15, 10, 15],
    bass: [0, null, 0, null, 5, null, 5, null, 3, null, 3, null, 7, null, 10, null],
  },
  organ: {
    tempo: 72, root: 41, wave: 'sine', grit: 0.08,
    lead: [0, null, 7, null, 3, null, 10, null, 0, null, 8, null, 5, null, 7, null],
    bass: [0, null, null, null, null, null, null, null, 8, null, null, null, null, null, null, null],
  },
  cartoon: {
    tempo: 160, root: 48, wave: 'triangle', grit: 0.04,
    lead: [0, 4, 7, 12, 7, 4, 0, 7, 2, 5, 9, 14, 9, 5, 2, 9],
    bass: [0, null, 7, null, 0, null, 7, null, 5, null, 12, null, 5, null, 12, null],
  },
  drone: {
    tempo: 60, root: 38, wave: 'sawtooth', grit: 0.18,
    lead: [0, null, null, 1, null, null, 10, null, 0, null, null, 6, null, null, 1, null],
    bass: [0, null, null, null, 0, null, null, null, 6, null, null, null, 0, null, null, null],
  },
};

function semis(n: number): number {
  return 440 * Math.pow(2, n / 12);
}

export class ClashAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private volume = 0.7;
  private musicVol = 0.35;
  private theme: string | null = null;
  private timer: number | null = null;
  private step = 0;
  private nextNote = 0;

  /** Must be called from a user gesture the first time. */
  unlock(): void {
    this.ensure();
  }

  setOptions(opts: { muted: boolean; volume: number; music: number }): void {
    this.muted = opts.muted;
    this.volume = Math.max(0, Math.min(1, opts.volume));
    this.musicVol = Math.max(0, Math.min(1, opts.music));
    if (this.master && this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, t, 0.02);
      this.musicBus?.gain.setTargetAtTime(this.musicVol * 0.7, t, 0.05);
    }
    if (this.muted) this.stopMusic();
    else if (this.theme) this.startMusic(this.theme);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    try {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicVol * 0.7;
      this.musicBus.connect(this.master);

      const len = Math.floor(ctx.sampleRate * 1.2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
      return ctx;
    } catch {
      return null;
    }
  }

  private tone(
    freq: number,
    dur: number,
    opts: {
      type?: OscillatorType;
      gain?: number;
      slide?: number;
      delay?: number;
      attack?: number;
      bus?: GainNode | null;
    } = {},
  ): void {
    const ctx = this.ensure();
    const bus = opts.bus ?? this.sfxBus;
    if (!ctx || !bus || this.muted) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type ?? 'square';
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    if (opts.slide && opts.slide !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t + dur);
    }
    const peak = Math.max(0.0001, opts.gain ?? 0.2);
    const attack = Math.max(0.001, opts.attack ?? 0.004);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private burst(dur: number, opts: { gain?: number; low?: number; high?: number; delay?: number; bus?: GainNode | null } = {}): void {
    const ctx = this.ensure();
    const bus = opts.bus ?? this.sfxBus;
    if (!ctx || !bus || !this.noise || this.muted) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = opts.high ?? 1200;
    filter.Q.value = 0.8;
    if (opts.low !== undefined) {
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = opts.low;
      src.connect(low);
      low.connect(filter);
    } else {
      src.connect(filter);
    }
    const gain = ctx.createGain();
    const peak = Math.max(0.0001, opts.gain ?? 0.2);
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    filter.connect(gain);
    gain.connect(bus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  play(name: SfxName): void {
    switch (name) {
      case 'ui':
        this.tone(520, 0.035, { type: 'square', gain: 0.05 });
        break;
      case 'select':
        this.tone(700, 0.05, { type: 'square', gain: 0.06 });
        this.tone(1040, 0.06, { type: 'square', gain: 0.04, delay: 0.035 });
        break;
      case 'deny':
        this.tone(160, 0.12, { type: 'sawtooth', gain: 0.08, slide: 110 });
        break;
      case 'hit0':
        this.burst(0.08, { gain: 0.16, high: 2200 });
        this.tone(150, 0.07, { type: 'square', gain: 0.12, slide: 90 });
        break;
      case 'hit1':
        this.burst(0.12, { gain: 0.26, high: 1400 });
        this.tone(100, 0.12, { type: 'square', gain: 0.2, slide: 60 });
        break;
      case 'hit2':
        this.burst(0.2, { gain: 0.4, high: 900, low: 3200 });
        this.tone(78, 0.22, { type: 'sawtooth', gain: 0.28, slide: 42 });
        break;
      case 'hit3':
        this.burst(0.34, { gain: 0.5, high: 700, low: 2400 });
        this.tone(60, 0.4, { type: 'sawtooth', gain: 0.35, slide: 30 });
        this.tone(1300, 0.16, { type: 'square', gain: 0.1, delay: 0.02, slide: 300 });
        break;
      case 'block':
        this.tone(320, 0.09, { type: 'square', gain: 0.07, slide: 260 });
        this.burst(0.05, { gain: 0.1, high: 3400 });
        break;
      case 'parry':
        this.tone(900, 0.1, { type: 'triangle', gain: 0.12, slide: 1400 });
        this.tone(1350, 0.12, { type: 'sine', gain: 0.09, delay: 0.03 });
        break;
      case 'perfect':
        this.tone(1200, 0.16, { type: 'square', gain: 0.1, slide: 1800 });
        this.tone(1800, 0.2, { type: 'sine', gain: 0.08, delay: 0.04 });
        this.burst(0.12, { gain: 0.12, high: 4200 });
        break;
      case 'whoosh':
        this.burst(0.13, { gain: 0.08, high: 700 });
        break;
      case 'jump':
        this.tone(300, 0.1, { type: 'triangle', gain: 0.06, slide: 620 });
        break;
      case 'land':
        this.burst(0.08, { gain: 0.08, high: 380, low: 900 });
        break;
      case 'dodge':
        this.burst(0.09, { gain: 0.07, high: 900 });
        this.tone(760, 0.07, { type: 'sine', gain: 0.04, slide: 520 });
        break;
      case 'ko':
        this.burst(0.5, { gain: 0.4, high: 500, low: 1800 });
        this.tone(64, 0.55, { type: 'sawtooth', gain: 0.3, slide: 28 });
        this.tone(240, 0.3, { type: 'square', gain: 0.08, delay: 0.08, slide: 90 });
        break;
      case 'super':
        this.tone(110, 0.5, { type: 'sawtooth', gain: 0.18, slide: 55 });
        this.tone(440, 0.3, { type: 'square', gain: 0.1, slide: 880 });
        this.tone(660, 0.4, { type: 'triangle', gain: 0.09, delay: 0.08, slide: 1320 });
        break;
      case 'throw':
        this.burst(0.1, { gain: 0.09, high: 1300 });
        break;
      case 'pickup':
        this.tone(620, 0.05, { type: 'square', gain: 0.07 });
        this.tone(930, 0.07, { type: 'square', gain: 0.05, delay: 0.04 });
        break;
      case 'score':
        this.tone(660, 0.06, { type: 'square', gain: 0.06 });
        this.tone(990, 0.08, { type: 'square', gain: 0.05, delay: 0.06 });
        break;
      case 'coin':
        this.tone(1320, 0.07, { type: 'square', gain: 0.08 });
        this.tone(1760, 0.12, { type: 'square', gain: 0.06, delay: 0.06 });
        break;
      case 'pack':
        this.burst(0.16, { gain: 0.14, high: 1800 });
        this.tone(520, 0.1, { type: 'triangle', gain: 0.08, slide: 780 });
        this.tone(1040, 0.14, { type: 'triangle', gain: 0.07, delay: 0.07 });
        break;
      case 'level':
        [0, 4, 7, 12].forEach((n, i) => {
          this.tone(semis(60 + n), 0.14, { type: 'square', gain: 0.08, delay: i * 0.075 });
        });
        break;
    }
  }

  startMusic(theme: MusicTheme): void {
    const pattern = PATTERNS[theme] ?? PATTERNS.brass;
    if (this.theme === theme && this.timer !== null) return;
    this.stopMusic();
    this.theme = theme;
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    this.step = 0;
    this.nextNote = ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.schedule(pattern), 180);
    this.schedule(pattern);
  }

  stopMusic(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.theme = null;
  }

  private schedule(pattern: MusicPattern): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus || this.muted) return;
    const stepDur = 60 / pattern.tempo / 2;
    while (this.nextNote < ctx.currentTime + 0.45) {
      const i = this.step % pattern.lead.length;
      const lead = pattern.lead[i];
      const bass = pattern.bass[i % pattern.bass.length];
      const t = this.nextNote;
      if (lead !== null) {
        this.musicNote(semis(pattern.root + lead), stepDur * 1.7, pattern.wave, 0.05, t, bus, pattern.grit);
      }
      if (bass !== null) {
        this.musicNote(semis(pattern.root - 12 + bass), stepDur * 2.4, 'sine', 0.12, t, bus, 0);
      }
      if (i % 4 === 0 && pattern.grit > 0.1) {
        this.musicNoise(stepDur * 0.5, t, bus, pattern.grit * 0.05);
      }
      this.step++;
      this.nextNote += stepDur;
    }
  }

  private musicNote(
    freq: number,
    dur: number,
    wave: OscillatorType,
    gainAmt: number,
    at: number,
    bus: GainNode,
    grit: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(gainAmt, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(at);
    osc.stop(at + dur + 0.05);
    if (grit > 0 && this.noise) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 2400;
      const ng = ctx.createGain();
      ng.gain.value = grit * 0.12;
      src.connect(filter);
      filter.connect(ng);
      ng.connect(bus);
      src.start(at);
      src.stop(at + Math.min(0.2, dur));
    }
  }

  private musicNoise(dur: number, at: number, bus: GainNode, amt: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(amt, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    src.start(at);
    src.stop(at + dur + 0.02);
  }
}
