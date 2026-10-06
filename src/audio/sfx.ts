/**
 * Procedural 8-bit-ish SFX and an optional chiptune loop via WebAudio.
 * Everything is synthesised; no audio assets. Safe to import in node (no-op).
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let muted = false;
let musicOn = false;
let sfxVol = 0.5;
let musicVol = 0.25;
let musicTimer: ReturnType<typeof setInterval> | null = null;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC() as AudioContext;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : sfxVol;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = muted ? 0 : musicVol;
    musicGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/**
 * Call from a user gesture: creates / resumes the AudioContext and plays one silent
 * sample, which is what iOS WebKit needs before Web Audio will make a sound.
 */
export function unlock(): void {
  const c = ac();
  if (!c) return;
  try {
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, 22050);
    src.connect(c.destination);
    src.start(0);
  } catch {
    /* ignore */
  }
}

export function setMuted(m: boolean): void {
  muted = m;
  if (master) master.gain.value = m ? 0 : sfxVol;
  if (musicGain) musicGain.gain.value = m ? 0 : musicVol;
}

export function isMuted(): boolean {
  return muted;
}

export function setVolumes(s: number, m: number): void {
  sfxVol = s;
  musicVol = m;
  setMuted(muted);
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.3, slide = 0, delay = 0, dest?: AudioNode): void {
  const a = ac();
  if (!a || !master) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(dest ?? master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
function noise(dur: number, vol = 0.3, filterFreq = 1200, q = 0.7, delay = 0, attack = 0.005, type: BiquadFilterType = 'lowpass'): void {
  const a = ac();
  if (!a || !master) return;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = a.currentTime + delay;
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterFreq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0, Math.random());
  src.stop(t0 + dur + 0.05);
}

export type Sfx =
  | 'click' | 'stamp' | 'paper' | 'crowd' | 'roar' | 'boo' | 'phone' | 'cash' | 'punch' | 'bell'
  | 'error' | 'citation' | 'type' | 'good' | 'bad' | 'thud' | 'whoosh' | 'kick' | 'snap';

export function sfx(name: Sfx): void {
  if (muted) return;
  switch (name) {
    case 'click':
      tone(880, 0.04, 'square', 0.12);
      break;
    case 'stamp':
      tone(90, 0.18, 'sine', 0.7, -50);
      noise(0.12, 0.5, 600);
      break;
    case 'thud':
      tone(70, 0.15, 'sine', 0.5, -30);
      break;
    case 'paper':
      noise(0.16, 0.25, 3200, 0.5, 0, 0.02, 'highpass');
      noise(0.1, 0.15, 2400, 0.5, 0.08, 0.02, 'highpass');
      break;
    case 'whoosh':
      noise(0.25, 0.2, 900, 2, 0, 0.08, 'bandpass');
      break;
    case 'crowd':
      noise(1.6, 0.25, 700, 0.6, 0, 0.3, 'bandpass');
      break;
    case 'roar':
      noise(2.2, 0.45, 900, 0.5, 0, 0.15, 'bandpass');
      noise(1.8, 0.25, 1800, 0.5, 0.1, 0.2, 'bandpass');
      break;
    case 'boo':
      tone(140, 1.0, 'sawtooth', 0.12, -30);
      tone(150, 1.0, 'sawtooth', 0.1, -40);
      noise(1.0, 0.15, 400, 0.6, 0, 0.2, 'bandpass');
      break;
    case 'phone':
      for (let i = 0; i < 6; i++) {
        tone(1320, 0.05, 'square', 0.12, 0, i * 0.07);
        tone(1100, 0.05, 'square', 0.12, 0, i * 0.07 + 0.035);
      }
      break;
    case 'cash':
      tone(1568, 0.08, 'square', 0.15);
      tone(2093, 0.25, 'square', 0.15, 0, 0.08);
      noise(0.08, 0.2, 5000, 1, 0, 0.005, 'highpass');
      break;
    case 'punch':
      noise(0.09, 0.6, 500);
      tone(110, 0.08, 'sine', 0.5, -60);
      break;
    case 'kick':
      noise(0.12, 0.6, 800);
      tone(80, 0.12, 'sine', 0.6, -40);
      break;
    case 'snap':
      noise(0.05, 0.7, 3000, 1, 0, 0.002, 'highpass');
      tone(300, 0.08, 'square', 0.25, -200);
      break;
    case 'bell':
      tone(1760, 0.8, 'triangle', 0.3);
      tone(2640, 0.6, 'sine', 0.15);
      break;
    case 'error':
      tone(180, 0.12, 'square', 0.15);
      tone(140, 0.15, 'square', 0.15, 0, 0.1);
      break;
    case 'citation':
      tone(220, 0.25, 'sawtooth', 0.15);
      tone(165, 0.35, 'sawtooth', 0.15, 0, 0.2);
      break;
    case 'type':
      noise(0.03, 0.2, 4000, 1, 0, 0.002, 'highpass');
      break;
    case 'good':
      tone(660, 0.08, 'square', 0.12);
      tone(990, 0.12, 'square', 0.12, 0, 0.07);
      break;
    case 'bad':
      tone(330, 0.12, 'square', 0.12);
      tone(247, 0.2, 'square', 0.12, 0, 0.1);
      break;
  }
}

// ---------------------------------------------------------------- chiptune loop

const BASS = [45, 45, 52, 45, 48, 48, 43, 43];
const LEAD = [69, 72, 76, 72, 71, 67, 64, 67, 69, 72, 76, 79, 77, 76, 72, 71];

function midi(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}

export function setMusic(on: boolean): void {
  musicOn = on;
  if (!on) {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
    return;
  }
  const a = ac();
  if (!a || musicTimer) return;
  let step = 0;
  musicTimer = setInterval(() => {
    if (!musicOn || muted || !musicGain) return;
    const bar = Math.floor(step / 8) % BASS.length;
    if (step % 2 === 0) tone(midi(BASS[bar] - 12), 0.22, 'triangle', 0.35, 0, 0, musicGain);
    if (step % 4 === 0) noise(0.05, 0.08, 6000, 1, 0, 0.002, 'highpass');
    const ln = LEAD[step % LEAD.length];
    if (step % 2 === 1 || Math.random() < 0.3) tone(midi(ln - 12 + (bar % 2 ? 0 : 3)), 0.12, 'square', 0.06, 0, 0, musicGain);
    step++;
  }, 180);
}

export function isMusicOn(): boolean {
  return musicOn;
}
