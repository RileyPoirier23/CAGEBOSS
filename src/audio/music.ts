/**
 * The CAGE BOSS soundtrack: tracks by local artists (SANDO, RUIN143, F.O.K.,
 * Hope Nikku, prod. Miler), played from public/music with HTMLAudio.
 *
 * Contexts pick what plays:
 *   title      - "Champion" to open the game
 *   office     - the whole soundtrack on shuffle, at background level
 *   fightnight - hype tracks, louder
 *   walkout    - a fighter's walkout song from the top, full volume
 *   fight      - ducked under the crowd while the fight is on
 */

export interface Track {
  id: string;
  title: string;
  artist: string;
  file: string;
  hype: boolean; // suitable for fight nights / walkouts
}

export const TRACKS: Track[] = [
  { id: 'champion', title: 'Champion', artist: 'SANDO', file: 'champion-sando.m4a', hype: true },
  { id: 'doin_shit', title: 'Doin Shit', artist: 'SANDO x RUIN', file: 'doin-shit-sando-x-ruin.m4a', hype: true },
  { id: 'bag', title: 'BAG', artist: 'F.O.K. ft. Hope Nikku (prod. Miler)', file: 'bag-fok-ft-hope-nikku.mp3', hype: true },
  { id: 'fu2', title: 'fu2', artist: 'SANDO', file: 'fu2-sando.mp3', hype: false },
  { id: 'ossa', title: 'ossa', artist: 'RUIN143', file: 'ossa-ruin143.mp3', hype: false },
  { id: 'your_mom', title: 'Your Mom Hates Me', artist: 'SANDO', file: 'your-mom-hates-me-sando.mp3', hype: true },
  { id: 'bloodhound', title: 'Bloodhound for You', artist: 'RUIN143', file: 'bloodhound-for-you-ruin143.mp3', hype: true },
  { id: 'come_closer', title: 'Come Closer', artist: 'RUIN143 feat. SANDO', file: 'come-closer-ruin143-ft-sando.mp3', hype: false },
  { id: 'gen_apathy', title: 'Gen Apathy', artist: 'EYE-V', file: 'gen-apathy-eye-v.mp3', hype: false },
  { id: 'all_hustle', title: 'All Hustle', artist: 'Zuddha', file: 'all-hustle-zuddha.mp3', hype: true },
  { id: 'moment_grace', title: 'A Moment w/ Grace', artist: 'Zuddha ft. FTB VON', file: 'a-moment-w-grace-zuddha-ft-ftb-von.mp3', hype: false },
  { id: 'open_to_you', title: 'Open to You', artist: 'Zuddha', file: 'open-to-you-zuddha.mp3', hype: false },
  { id: 'some_interlude', title: 'some interlude', artist: 'Zuddha', file: 'some-interlude-zuddha.mp3', hype: false },
];

export type MusicContext = 'title' | 'office' | 'fightnight' | 'walkout' | 'fight' | 'off';

const LEVEL: Record<MusicContext, number> = { title: 0.8, office: 0.45, fightnight: 0.75, walkout: 1, fight: 0.22, off: 0 };

let enabled = true;
let muted = false;
let volume = 0.6;
let context: MusicContext = 'off';
let current: { track: Track; el: HTMLAudioElement } | null = null;
let fading: { el: HTMLAudioElement; from: number; t: number }[] = [];
let queue: string[] = [];
let unlocked = false;
let onChange: ((t: Track) => void) | null = null;
let raf = 0;

const base = (): string => {
  const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
  return (env?.BASE_URL ?? './') + 'music/';
};

function targetVolume(): number {
  return enabled && !muted ? volume * LEVEL[context] : 0;
}

function tick(): void {
  raf = 0;
  let busy = false;
  const dt = 1 / 60;
  if (current) {
    const want = targetVolume();
    const v = current.el.volume;
    const nv = Math.abs(want - v) < 0.02 ? want : v + Math.sign(want - v) * dt * 0.9;
    current.el.volume = Math.max(0, Math.min(1, nv));
    if (nv !== want) busy = true;
  }
  fading = fading.filter((f) => {
    f.t -= dt;
    f.el.volume = Math.max(0, f.from * (f.t / 1.2));
    if (f.t <= 0) {
      f.el.pause();
      f.el.src = '';
      return false;
    }
    busy = true;
    return true;
  });
  if (busy && typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(tick);
}

function kick(): void {
  if (!raf && typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(tick);
}

function nextFromQueue(hypeOnly: boolean): Track {
  const pool = TRACKS.filter((t) => !hypeOnly || t.hype);
  if (!queue.length || !queue.every((id) => pool.some((t) => t.id === id))) {
    queue = pool.map((t) => t.id).sort(() => Math.random() - 0.5);
    if (current && queue[0] === current.track.id && queue.length > 1) queue.push(queue.shift()!);
  }
  const id = queue.shift()!;
  return TRACKS.find((t) => t.id === id) ?? pool[0];
}

/** Start a track, crossfading from whatever is playing. */
export function playTrack(track: Track, fromStart = true): void {
  if (typeof Audio === 'undefined') return;
  if (current && current.track.id === track.id && !fromStart) return;
  if (current) fading.push({ el: current.el, from: current.el.volume, t: 1.2 });
  const el = new Audio(base() + track.file);
  el.preload = 'auto';
  el.volume = 0;
  el.loop = false;
  el.addEventListener('ended', () => {
    if (current?.el !== el) return;
    playTrack(nextFromQueue(context === 'fightnight' || context === 'walkout'));
  });
  current = { track, el };
  if (unlocked && enabled && !muted) el.play().catch(() => {});
  onChange?.(track);
  kick();
}

/** Switch musical context; only changes the song when the context calls for it. */
export function setMusicContext(ctx: MusicContext, walkoutTrack?: Track): void {
  const prev = context;
  context = ctx;
  if (!enabled || ctx === 'off') return kick();
  if (ctx === 'title') {
    if (!current || current.track.id !== 'champion') playTrack(TRACKS[0]);
  } else if (ctx === 'walkout') {
    playTrack(walkoutTrack ?? nextFromQueue(true));
  } else if (ctx === 'fightnight') {
    if (!current || (!current.track.hype && prev !== 'fight')) playTrack(nextFromQueue(true));
  } else if (ctx === 'office') {
    if (!current || prev === 'title' || prev === 'walkout') {
      if (!current || prev !== 'title') playTrack(nextFromQueue(false));
    }
  }
  kick();
}

/** A fighter's walkout song (stable per fighter). */
export function walkoutFor(fighterId: string): Track {
  const hype = TRACKS.filter((t) => t.hype);
  let h = 0;
  for (const c of fighterId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return hype[h % hype.length];
}

export function skipTrack(): void {
  playTrack(nextFromQueue(context === 'fightnight' || context === 'walkout'));
}

export function nowPlaying(): Track | null {
  return current?.track ?? null;
}

export function onTrackChange(fn: (t: Track) => void): void {
  onChange = fn;
}

/** Browsers block audio until the first click/key; call this from that handler. */
export function unlockMusic(): void {
  if (unlocked) return;
  unlocked = true;
  if (current && enabled && !muted) current.el.play().catch(() => {});
}

export function configureMusic(opts: { enabled: boolean; muted: boolean; volume: number }): void {
  const wasOn = enabled && !muted;
  enabled = opts.enabled;
  muted = opts.muted;
  volume = opts.volume;
  const on = enabled && !muted;
  if (current) {
    if (on && !wasOn && unlocked) current.el.play().catch(() => {});
    if (!on) current.el.pause();
  } else if (on && context !== 'off') setMusicContext(context);
  kick();
}
