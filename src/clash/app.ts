/* UNIVERSE CLASH - the app shell.
   Owns screens, input, save data and the real-time loop. The fight itself lives
   in ./clash/sim.ts and knows nothing about the DOM.

   Modes beyond the original (netplay sim, replays, story, rift, the lab's
   dummy / ghost / trials), the pack reel, key bindings, gamepads, the
   uncapped render loop and the store's fine print were ported from Inkbreak. */

import { CHAR_BY_ID, charDef, moveOf } from './characters';
import { STAGES, stageById } from './stages';
import { ClashSession } from './session';
import { aiInput } from './ai';
import { ClashRenderer, type RenderExtras } from './render';
import { ClashAudio } from './audio';
import { drawPortrait, type ArtOpts } from './art';
import { NetSim, Rollback, packInput, type ReplayFile } from './rollback';
import { NET_PROTOCOL, OnlineMatch, PeerLink, type NetMessage } from './netplay';
import { onlineHtml, type OnlineView } from './screens';
import type { Action, KeyMap } from './profile';
import type { CharId, CustomFinisher, Fighter, InputFrame, MatchConfig, MatchEvent, MatchState, MoveDef, MoveKey, PoseName, Rarity, Slot } from './types';
import { CHAR_IDS, emptyInput } from './types';
import {
  DEFAULT_KEYS,
  DEFAULT_OPTIONS,
  addScars,
  awardArcade,
  buyDirect,
  defaultProfile,
  equipGear,
  levelProgress,
  loadProfile,
  recordMatch,
  saveProfile,
  setFinisher,
  unequipGear,
  upgradeGear,
  wipeProfile,
  type ClashProfile,
  type MatchReward,
  type PackOpenResult,
} from './profile';
import {
  buyCatalog,
  claimWeekly,
  finishersUnlocked,
  openPackWithPity,
  regionById,
  salvage,
} from './economy';
import {
  fmtClock,
  hudHtml,
  optionsHtml,
  pauseHtml,
  resultsHtml,
  rosterHtml,
  selectHtml,
  stocksHtml,
  titleHtml,
  vaultHtml,
} from './ui';
import {
  REEL_LAND,
  REEL_TILE_W,
  builderHtml,
  editorHtml,
  inputDisplayHtml,
  keysHtml,
  netSettingsHtml,
  packReelHtml,
  progressHtml,
  replaysHtml,
  riftHtml,
  riftRungs,
  storeFinePrintHtml,
  storyHtml,
  trainingPanelHtml,
} from './screens';

const TICK = 1 / 60;
const RESULT_DELAY_MS = 1700;
const SUPER_SHOW_MS = 1150;
const GHOST_TICKS = 600;

type ScreenName = 'title' | 'select' | 'fight' | 'results' | 'roster' | 'vault' | 'options' | 'replays' | 'story' | 'rift' | 'builder' | 'editor' | 'progress' | 'online';
type FightMode = MatchConfig['mode'] | 'net' | 'online';

/** The real-netplay handshake: one link, the codes in flight, who is on the other end. */
interface OnlineState {
  link: PeerLink;
  role: 'host' | 'guest';
  invite: string;
  reply: string;
  peerName: string;
  peerChar: CharId | null;
  peerModern: boolean;
  log: string[];
  pendingCfg: MatchConfig | null;
}
type Dummy = 'stand' | 'jump' | 'dodge' | 'cpu';

interface ArcadeRun {
  queue: CharId[];
  index: number;
  wins: number;
  active: boolean;
  cleared: boolean;
  char: CharId;
}

interface ResultData {
  won: boolean;
  draw: boolean;
  reward: MatchReward | null;
  arcadeNext: boolean;
  arcadeDone: boolean;
  extraLine: string;
}

interface HudSideEls {
  name: HTMLElement;
  tag: HTMLElement;
  hp: HTMLElement;
  chip: HTMLElement;
  stocks: HTMLElement;
  drive: HTMLElement;
}

interface Trial {
  seq: string[];
  pos: number;
}

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

function randomSeed(): number {
  return (Math.random() * 0x7fffffff) | 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A seeded generator for the reel's decoys, so a pull looks the same on replay. */
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export class ClashApp {
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly screenEl: HTMLElement;
  private readonly hudEl: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly perfEl: HTMLElement;
  private readonly bootEl: HTMLElement;

  private readonly renderer: ClashRenderer;
  private readonly audio = new ClashAudio();
  private profile: ClashProfile;

  private screen: ScreenName = 'title';
  private session: ClashSession | null = null;
  private net: NetSim | null = null;
  private netP2: 'cpu' | 'keys' = 'cpu';
  private online: OnlineState | null = null;
  private onlineMatch: OnlineMatch | null = null;
  private onlineName = 'CHALLENGER';
  private replay: { file: ReplayFile; cursor: { i: number } } | null = null;
  private fightCfg: MatchConfig | null = null;
  private spectator = false;
  private storyChapter = -1;
  private riftRung = -1;
  private riftDay = '';

  private attract: ClashSession | null = null;
  private attractKey = '';
  private attractOverAt = 0;
  private alpha = 0;
  private accum = 0;
  private menuAlpha = 0;
  private menuAccum = 0;

  private paused = false;
  private resultsAt = 0;
  private lastResult: ResultData | null = null;
  private startScarCount = 0;

  private fightMode: FightMode = 'casual';
  private selectTarget: 0 | 1 = 0;
  private selectCpu: CharId = 'mireille';
  private arcade: ArcadeRun | null = null;
  private arcadePending = false;
  private optionsFrom: 'title' | 'pause' = 'title';
  private vaultTab: 'store' | 'inventory' = 'store';
  private vaultChar: CharId = 'kestrel';
  private rosterChar: CharId = 'kestrel';
  private storeChar: CharId | 'all' = 'all';
  private storeRarity: Rarity | 'all' = 'all';
  private builderChar: CharId = 'kestrel';
  private editorChar: CharId = 'kestrel';
  private editorKey: MoveKey = 'nLight';
  private binding: { side: 0 | 1; action: Action } | null = null;

  /* the lab */
  private dummy: Dummy = 'stand';
  private ghostRing: Fighter[] = [];
  private trial: Trial | null = null;
  private trialIndex = -1;

  private superUntil = 0;
  private moveUntil = 0;
  private lastCount = '';

  private readonly keys = new Set<string>();
  private readonly hits = new Set<string>();
  private readonly padLast: [number, number] = [0, 0];
  private padPauseLast = false;

  private hudEls: [HudSideEls, HudSideEls] | null = null;
  private hudCombo: [HTMLElement, HTMLElement] | null = null;
  private clockEl: HTMLElement | null = null;
  private calloutEl: HTMLElement | null = null;
  private toastMoveEl: HTMLElement | null = null;
  private superEl: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private inputDisplayEl: HTMLElement | null = null;
  private corruptEl: HTMLElement | null = null;
  private lastStocks: [number, number] = [3, 3];
  private lastStockMax = 3;

  private saveTimer: number | null = null;
  private toastTimer: number | null = null;
  private modalEl: HTMLElement | null = null;
  private reelTimers: number[] = [];

  private raf = 0;
  private channel: MessageChannel | null = null;
  private loopMode: 'raf' | 'channel' = 'raf';
  private lastDraw = 0;
  private now = 0;
  private fps = 60;
  private fpsFrames = 0;
  private fpsAt = 0;

  constructor() {
    this.root = must('clash-root');
    this.canvas = must<HTMLCanvasElement>('clash-canvas');
    this.screenEl = must('screen');
    this.hudEl = must('hud');
    this.toastEl = must('toast');
    this.perfEl = must('perf');
    this.bootEl = must('boot');

    this.profile = loadProfile();
    this.fightMode = this.profile.mode === 'training' ? 'training' : this.profile.mode;
    this.selectCpu = CHAR_IDS.find((id) => id !== this.profile.selected) ?? 'mireille';
    this.rosterChar = this.profile.selected;
    this.vaultChar = this.profile.selected;
    this.builderChar = this.profile.selected;
    this.editorChar = this.profile.selected;

    this.renderer = new ClashRenderer(this.canvas);
    this.applyOptions();
    this.bind();
    this.showTitle();

    this.fpsAt = performance.now();
    this.startLoop();
    window.setTimeout(() => {
      this.bootEl.classList.add('gone');
      window.setTimeout(() => this.bootEl.classList.add('hidden'), 340);
    }, 460);
  }

  /* ------------------------------------------------------------- options -- */

  private artOpts(): ArtOpts {
    const o = this.profile.options;
    return {
      outline: o.outline,
      shadow: [0.2, 0.34, 0.5][o.shadowTone] ?? 0.34,
      pattern: o.outline > 0,
      lite: o.resolutionScale < 0.8,
    };
  }

  private applyOptions(): void {
    const o = this.profile.options;
    this.renderer.setOptions({
      outline: o.outline,
      shadow: [0.2, 0.34, 0.5][o.shadowTone] ?? 0.34,
      pattern: o.outline > 0,
      blood: o.blood,
      particles: o.particles,
      impactFrames: o.impactFrames,
      shake: o.shake,
      lite: o.resolutionScale < 0.8,
      resolutionScale: o.resolutionScale,
      persistentScars: o.persistentScars,
    });
    this.renderer.resize();
    this.audio.setOptions({ muted: o.muted, volume: o.volume, music: o.music });
    this.updatePerf();
    this.startLoop();
  }

  private setOption(field: string, value: string): void {
    const o = this.profile.options as unknown as Record<string, number | boolean>;
    if (field === 'muted' || field === 'vsync' || field === 'modern' || field === 'persistentScars' || field === 'perfOverlay') {
      o[field] = value === '1' || value === 'true';
    } else {
      o[field] = Number(value);
    }
    this.applyOptions();
    this.saveSoon();
  }

  /* ----------------------------------------------------------- persistence -- */

  private saveSoon(): void {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      saveProfile(this.profile);
      this.saveTimer = null;
    }, 220);
  }

  private saveNow(): void {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    saveProfile(this.profile);
  }

  private toast(text: string, ms = 2100): void {
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove('show');
      this.toastTimer = null;
    }, ms);
  }

  /* --------------------------------------------------------------- screens -- */

  private hideHud(): void {
    this.hudEl.classList.add('hidden');
    this.hudEl.classList.remove('corrupt');
    this.hudEl.innerHTML = '';
    this.hudEls = null;
    this.hudCombo = null;
    this.clockEl = null;
    this.calloutEl = null;
    this.toastMoveEl = null;
    this.superEl = null;
    this.countEl = null;
    this.inputDisplayEl = null;
    this.corruptEl = null;
  }

  private leaveFight(): void {
    this.session = null;
    this.net = null;
    this.onlineMatch = null;
    this.replay = null;
    this.fightCfg = null;
    this.spectator = false;
    this.storyChapter = -1;
    this.riftRung = -1;
    this.trial = null;
    this.trialIndex = -1;
    this.ghostRing = [];
  }

  private showTitle(): void {
    this.screen = 'title';
    this.paused = false;
    this.leaveFight();
    this.arcade = null;
    this.arcadePending = false;
    this.resultsAt = 0;
    this.lastResult = null;
    this.accum = 0;
    this.closeModal();
    this.hideHud();
    this.audio.stopMusic();
    this.screenEl.className = 'screen title-screen';
    this.ensureAttract(`title:${randomSeed()}`);
    this.screenEl.innerHTML = titleHtml(this.profile);
    this.paintPortraits(this.screenEl);
    this.saveSoon();
  }

  private showSelect(): void {
    this.screen = 'select';
    this.paused = false;
    this.accum = 0;
    this.closeModal();
    this.hideHud();
    this.screenEl.className = 'screen select-screen';
    const stageId = this.profile.selectedStage;
    this.ensureAttract(
      `select:${stageId}:${this.profile.selected}:${this.selectCpu}:${this.fightMode}`,
      stageId,
      this.profile.selected,
      this.selectCpu,
    );
    this.screenEl.innerHTML = selectHtml({
      profile: this.profile,
      mode: this.fightMode,
      target: this.selectTarget,
      cpu: this.selectCpu,
      arcade: this.arcadePending,
      stageId,
      cpuLevel: this.profile.cpuLevel,
      extra: this.fightMode === 'net' ? netSettingsHtml(this.profile.options.net, this.netP2) : '',
    });
    this.paintPortraits(this.screenEl);
  }

  private showRoster(): void {
    this.screen = 'roster';
    this.paused = false;
    this.closeModal();
    this.hideHud();
    this.screenEl.className = 'screen roster-screen';
    this.ensureAttract('menu:roster');
    this.screenEl.innerHTML = rosterHtml({ profile: this.profile, char: this.rosterChar });
    this.paintPortraits(this.screenEl);
  }

  private showVault(): void {
    this.screen = 'vault';
    this.paused = false;
    this.closeModal();
    this.hideHud();
    this.screenEl.className = 'screen vault-screen';
    this.ensureAttract('menu:vault');
    const region = regionById(this.profile.region);
    this.screenEl.innerHTML = vaultHtml({
      profile: this.profile,
      tab: this.vaultTab,
      char: this.vaultChar,
      finePrint: storeFinePrintHtml({ profile: this.profile, filterChar: this.storeChar, filterRarity: this.storeRarity }),
      packsOpen: region.packs && this.profile.ageOk,
    });
  }

  private showOptions(from: 'title' | 'pause'): void {
    this.optionsFrom = from;
    this.screen = 'options';
    this.closeModal();
    this.hideHud();
    this.screenEl.className = 'screen options-screen';
    this.ensureAttract('menu:options');
    this.screenEl.innerHTML = optionsHtml({
      options: this.profile.options,
      fromPause: from === 'pause',
      keys: keysHtml(this.profile.keys, this.binding),
    });
    this.saveSoon();
  }

  private showSimple(name: ScreenName, html: string, cls: string): void {
    this.screen = name;
    this.paused = false;
    this.closeModal();
    this.hideHud();
    this.screenEl.className = `screen ${cls}`;
    this.ensureAttract(`menu:${name}`);
    this.screenEl.innerHTML = html;
    this.paintPortraits(this.screenEl);
  }

  private showReplays(): void {
    this.showSimple('replays', replaysHtml(this.profile), 'roster-screen');
  }

  private showStory(): void {
    this.showSimple('story', storyHtml(this.profile), 'roster-screen');
  }

  private showRift(): void {
    this.riftDay = today();
    this.showSimple('rift', riftHtml(this.profile, this.riftDay), 'roster-screen');
  }

  private showBuilder(): void {
    this.showSimple('builder', builderHtml(this.profile, this.builderChar), 'options-screen');
  }

  private showEditor(): void {
    this.showSimple('editor', editorHtml(this.editorChar, this.editorKey), 'options-screen');
  }

  private showProgress(): void {
    this.showSimple('progress', progressHtml(this.profile), 'roster-screen');
  }

  private paintPortraits(scope: HTMLElement): void {
    requestAnimationFrame(() => {
      scope.querySelectorAll<HTMLCanvasElement>('canvas[data-portrait]').forEach((canvas) => {
        const id = canvas.dataset.portrait as CharId;
        if (!CHAR_IDS.includes(id)) return;
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(24, Math.round(rect.width || canvas.width));
        const h = Math.max(24, Math.round(rect.height || canvas.height));
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawPortrait(
          ctx,
          id,
          w,
          h,
          0,
          this.artOpts(),
          (canvas.dataset.portraitPose as PoseName | undefined) ?? 'idle',
          canvas.dataset.portraitCrop === 'bust' ? 'bust' : 'full',
          canvas.dataset.portraitFace === '-1' ? -1 : 1,
        );
      });
    });
  }

  /* ---------------------------------------------------------------- attract -- */

  private ensureAttract(
    key: string,
    stageId?: string,
    a?: CharId,
    b?: CharId,
  ): void {
    if (this.attractKey === key && this.attract) return;
    const stage = stageId ? stageById(stageId) : STAGES[Math.floor(Math.random() * STAGES.length)];
    const pool = CHAR_IDS.filter((id) => id !== a);
    const p1 = a ?? pool[Math.floor(Math.random() * pool.length)];
    const p2 = b ?? pool.filter((id) => id !== p1)[Math.floor(Math.random() * Math.max(1, pool.length - 1))] ?? 'mireille';
    const seed = randomSeed();
    const cfg: MatchConfig = {
      stageId: stage.id,
      mode: 'casual',
      seed,
      stocks: 2,
      timerTicks: 4 * 60 * 60,
      gearBuffs: false,
      playerChar: p1,
      cpuChar: p2 === p1 ? (p1 === 'kestrel' ? 'null' : 'kestrel') : p2,
      cpuLevel: 4,
      modern: false,
      gear: [{}, {}],
      training: false,
    };
    this.attract = new ClashSession(cfg, { spectator: true, seed, cpuLevel: 4 });
    this.attractKey = key;
    this.attractOverAt = 0;
    this.menuAccum = 0;
    this.menuAlpha = 0;
    this.renderer.reset();
    this.renderer.setScars([]);
    this.renderer.flashNow(0.22);
  }

  private ensureMenuAttract(): void {
    if (!this.attract) this.ensureAttract('menu');
  }

  /* ------------------------------------------------------------------ loop -- */

  /** VSync on: requestAnimationFrame. Off: a MessageChannel loop that runs as fast as the page allows. */
  private startLoop(): void {
    const want: 'raf' | 'channel' = this.profile.options.vsync ? 'raf' : 'channel';
    if (want === this.loopMode && (this.raf || this.channel)) return;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.channel) {
      this.channel.port1.onmessage = null;
      this.channel = null;
    }
    this.loopMode = want;
    if (want === 'raf') {
      this.raf = requestAnimationFrame(this.frame);
    } else {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        if (this.channel !== ch) return;
        this.frame(performance.now());
      };
      this.channel = ch;
      ch.port2.postMessage(0);
    }
  }

  private frame = (now: number): void => {
    if (this.loopMode === 'raf') this.raf = requestAnimationFrame(this.frame);
    else if (this.channel) this.channel.port2.postMessage(0);
    this.now = now;
    const cap = this.profile.options.fpsCap;
    if (cap > 0 && now - this.lastDraw < 1000 / cap - 1.2) return;
    const dt = this.lastDraw ? Math.min(0.05, (now - this.lastDraw) / 1000) : TICK;
    this.lastDraw = now;

    this.fpsFrames++;
    if (now - this.fpsAt >= 500) {
      this.fps = Math.round((this.fpsFrames * 1000) / Math.max(1, now - this.fpsAt));
      this.fpsFrames = 0;
      this.fpsAt = now;
      this.updatePerf();
    }

    if (this.screen === 'fight' && this.session) {
      if (!this.paused) this.stepFight(dt);
      this.renderer.render(this.session.match, this.alpha, now, this.extras());
      this.updateHud();
      if (!this.paused) this.watchEnd(now);
    } else {
      this.stepAttract(dt);
      if (this.attract) this.renderer.render(this.attract.match, this.menuAlpha, now);
    }
  };

  private extras(): RenderExtras {
    const cfg = this.fightCfg;
    const tr = this.profile.options.training;
    const names: [string, string] = [
      this.spectator ? 'CPU' : 'P1',
      this.spectator || (cfg && cfg.mode !== 'local' && this.fightMode !== 'net' && this.fightMode !== 'online') ? 'CPU' : 'P2',
    ];
    return {
      training: cfg?.training ? { hitboxes: tr.hitboxes, frameData: tr.frameData, dodgeViz: tr.dodgeViz } : undefined,
      ghost: cfg?.training && tr.ghost && this.ghostRing.length >= GHOST_TICKS ? this.ghostRing[0] : null,
      names,
      spectator: this.spectator ? 'canvas feed // votes change presentation, never frame data' : null,
    };
  }

  private stepAttract(dt: number): void {
    if (!this.attract) {
      this.ensureMenuAttract();
      return;
    }
    this.menuAccum = Math.min(0.2, this.menuAccum + dt);
    let ticks = 0;
    while (this.menuAccum >= TICK && ticks < 4) {
      const res = this.attract.advance(TICK, emptyInput());
      for (const e of res.events) this.renderer.addEvent(e, this.attract.match);
      this.renderer.tickImpacts();
      this.menuAccum -= TICK;
      ticks++;
    }
    this.menuAlpha = this.menuAccum / TICK;
    if (this.attract.over) {
      if (!this.attractOverAt) this.attractOverAt = this.now + 2600;
      if (this.now >= this.attractOverAt) {
        if (this.screen === 'title') this.ensureAttract(`title:${randomSeed()}`);
        else if (this.screen === 'select') {
          this.ensureAttract(`menu:select:${randomSeed()}`);
        } else {
          this.ensureAttract(`menu:${randomSeed()}`);
        }
      }
    }
  }

  private updatePerf(): void {
    if (!this.profile.options.perfOverlay) {
      this.perfEl.classList.add('hidden');
      return;
    }
    const ses = this.session ?? this.attract;
    const m = ses?.match;
    const tick = m?.tick ?? 0;
    const phase = m?.phase ?? 'menu';
    const net = this.net;
    this.perfEl.classList.remove('hidden');
    this.perfEl.textContent = `${this.fps} FPS  |  TICK ${tick}  |  ${phase.toUpperCase()}\n` +
      `SIM 60 HZ  |  ALPHA ${this.alpha.toFixed(2)}  |  ${this.screen.toUpperCase()}  |  ${this.loopMode === 'raf' ? 'VSYNC' : 'UNCAPPED'} CAP ${this.profile.options.fpsCap || 'OFF'}\n` +
      `ROLLBACKS ${ses?.rollbacks ?? 0}  |  RESIM ${ses?.resimFrames ?? 0}  |  CONFIRMED ${ses?.confirmed ?? 0}  |  DELAY ${ses?.delay ?? 0}\n` +
      (net
        ? `NET PING ${this.profile.options.net.ping}MS JITTER ${this.profile.options.net.jitter}MS  |  PEER2 RB ${net.peers[1].rollbacks}  |  ${net.desync ? `DESYNC @${net.desyncTick}` : 'SYNC OK'}`
        : this.onlineMatch
          ? `ONLINE P${this.onlineMatch.local + 1}  |  PING ${this.onlineMatch.link.rtt}MS  |  THEIRS ${this.onlineMatch.remoteConfirmed}  |  STALLS ${this.onlineMatch.stalled}  |  ${this.onlineMatch.desync ? `DESYNC @${this.onlineMatch.desyncTick}` : 'SYNC OK'}`
          : 'LOCAL');
  }

  /* ----------------------------------------------------------------- input -- */

  private bind(): void {
    this.screenEl.addEventListener('click', this.onClick);
    this.root.addEventListener('click', this.onModalClick);
    this.screenEl.addEventListener('input', this.onInput);
    this.screenEl.addEventListener('change', this.onInput);
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('beforeunload', () => this.saveNow());
    window.addEventListener('pointerdown', () => this.audio.unlock(), { passive: true });
  }

  private onClick = (ev: MouseEvent): void => {
    const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (!action) return;
    ev.preventDefault();
    this.audio.unlock();
    this.audio.play('ui');
    this.handleAction(action, target.dataset);
  };

  private onModalClick = (ev: MouseEvent): void => {
    if (!this.modalEl || !this.modalEl.contains(ev.target as Node)) return;
    const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target?.dataset.action) return;
    ev.preventDefault();
    this.handleAction(target.dataset.action, target.dataset);
  };

  private onInput = (ev: Event): void => {
    const input = ev.target as HTMLInputElement;
    const range = input.dataset?.optRange;
    if (range) {
      this.setOption(range, input.value);
      const out = this.screenEl.querySelector<HTMLElement>(`[data-opt-out="${range}"]`);
      if (out) out.textContent = `${Math.round(Number(input.value) * 100)}%`;
      return;
    }
    const online = input.dataset?.online;
    if (online) {
      if (online === 'name') this.onlineName = input.value.trim().toUpperCase().slice(0, 14) || 'CHALLENGER';
      else if (this.online && (online === 'invite' || online === 'reply')) this.online[online] = input.value;
      return;
    }
    const net = input.dataset?.net;
    if (net === 'delay' || net === 'ping' || net === 'jitter') {
      const v = Number(input.value);
      if (Number.isFinite(v)) this.profile.options.net[net] = Math.max(0, v);
      this.saveSoon();
      return;
    }
    const edit = input.dataset?.edit;
    if (edit && ev.type === 'change') {
      this.editMove(edit, Number(input.value));
      return;
    }
    if (input.dataset?.builderName !== undefined && ev.type === 'change') {
      const cur = this.currentCustom();
      cur.name = input.value.trim() || 'Custom Finisher';
      this.profile.custom[this.builderChar] = cur;
      this.saveSoon();
    }
  };

  private onKeyUp = (ev: KeyboardEvent): void => {
    this.keys.delete(ev.code);
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.hits.clear();
  };

  private onKeyDown = (ev: KeyboardEvent): void => {
    const code = ev.code;
    if (this.binding) {
      ev.preventDefault();
      if (code !== 'Escape') {
        this.profile.keys[this.binding.side][this.binding.action] = code;
        this.saveSoon();
      }
      this.binding = null;
      this.showOptions(this.optionsFrom);
      return;
    }
    if (code === 'F3') {
      ev.preventDefault();
      this.profile.options.perfOverlay = !this.profile.options.perfOverlay;
      this.updatePerf();
      this.saveSoon();
      return;
    }
    if (code === 'Escape') {
      ev.preventDefault();
      this.handleEscape();
      return;
    }
    if (this.screen === 'title' && code === 'Enter' && !this.focusIsField()) {
      ev.preventDefault();
      this.audio.unlock();
      this.handleAction('fight', {});
      return;
    }
    if (this.screen === 'select' && code === 'Enter' && !this.focusIsField()) {
      ev.preventDefault();
      this.handleAction('begin', {});
      return;
    }
    if (this.screen === 'results' && code === 'Enter' && !this.focusIsField()) {
      ev.preventDefault();
      this.handleAction(this.lastResult?.arcadeNext ? 'nextarcade' : 'rematch', {});
      return;
    }
    if (this.screen !== 'fight' || this.paused) return;
    if (this.gameCodes().has(code)) {
      ev.preventDefault();
      if (!this.keys.has(code)) this.hits.add(code);
      this.keys.add(code);
    }
  };

  private gameCodes(): Set<string> {
    const set = new Set<string>();
    for (const map of this.profile.keys) for (const k of Object.values(map)) set.add(k);
    if (this.profile.options.modern) for (const k of ['ShiftLeft', 'ShiftRight', 'KeyU', 'KeyO', 'KeyP']) set.add(k);
    return set;
  }

  private focusIsField(): boolean {
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
  }

  private handleEscape(): void {
    if (this.modalEl) {
      this.closeModal();
      return;
    }
    if (this.screen === 'fight') {
      if (this.paused) this.resumeFight();
      else this.showPause();
      return;
    }
    if (this.screen === 'options') {
      if (this.optionsFrom === 'pause') this.showPause();
      else this.showTitle();
      return;
    }
    if (this.screen !== 'title') this.showTitle();
  }

  private handleAction(action: string, data: DOMStringMap): void {
    switch (action) {
      case 'fight':
        this.fightMode = 'casual';
        this.arcadePending = false;
        this.showSelect();
        break;
      case 'arcade':
        this.fightMode = 'casual';
        this.arcadePending = true;
        this.showSelect();
        break;
      case 'training':
        this.fightMode = 'training';
        this.arcadePending = false;
        this.profile.mode = 'training';
        this.showSelect();
        break;
      case 'netplay':
        this.fightMode = 'net';
        this.arcadePending = false;
        this.showSelect();
        break;
      case 'online':
        this.showOnline();
        break;
      case 'online-host':
        void this.hostOnline();
        break;
      case 'online-join':
        this.joinOnline();
        break;
      case 'online-answer':
        void this.answerOnline();
        break;
      case 'online-accept':
        void this.acceptOnline();
        break;
      case 'online-copy':
        this.copyOnline(data.field ?? 'invite');
        break;
      case 'online-start':
        this.startOnlineHost();
        break;
      case 'online-leave':
        this.leaveOnline();
        break;
      case 'spectate':
        this.startSpectate();
        break;
      case 'roster':
        this.rosterChar = this.profile.selected;
        this.showRoster();
        break;
      case 'vault':
        this.showVault();
        break;
      case 'replays':
        this.showReplays();
        break;
      case 'story-screen':
        this.showStory();
        break;
      case 'rift-screen':
        this.showRift();
        break;
      case 'builder':
        this.showBuilder();
        break;
      case 'editor':
        this.showEditor();
        break;
      case 'progress':
        this.showProgress();
        break;
      case 'options':
        this.showOptions(this.screen === 'fight' ? 'pause' : 'title');
        break;
      case 'pause-options':
        this.showOptions('pause');
        break;
      case 'back':
        this.goBack();
        break;
      case 'title':
        this.showTitle();
        break;
      case 'picktab':
        this.selectTarget = data.side === '1' ? 1 : 0;
        this.showSelect();
        break;
      case 'pick':
        this.pickChar(data.char as CharId);
        break;
      case 'stage':
        if (data.stage) {
          this.profile.selectedStage = data.stage;
          this.saveSoon();
          this.showSelect();
        }
        break;
      case 'mode':
        this.setMode(data.mode as FightMode);
        break;
      case 'cycle':
        this.cycleField(data.field ?? '');
        break;
      case 'toggle':
        if (data.field === 'gearBuffs') {
          this.profile.gearBuffs = !this.profile.gearBuffs;
          this.saveSoon();
          this.showSelect();
        }
        break;
      case 'net-p2':
        this.netP2 = this.netP2 === 'cpu' ? 'keys' : 'cpu';
        this.showSelect();
        break;
      case 'random':
        this.randomizeSelect();
        break;
      case 'begin':
        this.beginMatch();
        break;
      case 'resume':
        this.resumeFight();
        break;
      case 'restart':
        this.restartMatch();
        break;
      case 'quit':
        this.showTitle();
        break;
      case 'end-training':
        this.endTraining();
        break;
      case 'rematch':
        if (this.fightMode === 'online') this.showOnline();
        else this.rematch();
        break;
      case 'select':
        this.showSelect();
        break;
      case 'nextarcade':
        this.nextArcadeFight();
        break;
      case 'rosterpick':
        this.rosterChar = (data.char as CharId) ?? this.profile.selected;
        this.showRoster();
        break;
      case 'finisher': {
        const id = data.id ?? null;
        const current = this.profile.finishers[this.rosterChar] ?? null;
        setFinisher(this.profile, this.rosterChar, current === id ? null : id);
        this.saveSoon();
        this.audio.play('select');
        this.showRoster();
        break;
      }
      case 'vaulttab':
        this.vaultTab = data.tab === 'inventory' ? 'inventory' : 'store';
        this.showVault();
        break;
      case 'vault-char':
        this.vaultChar = (data.char as CharId) ?? this.profile.selected;
        this.showVault();
        break;
      case 'buy-pack':
        this.doBuyPack(data.pack ?? '');
        break;
      case 'buy-direct':
        this.doBuyDirect(data.uid ?? '');
        break;
      case 'buy-catalog':
        this.doBuyCatalog(data.id ?? '');
        break;
      case 'salvage':
        this.doSalvage(data.uid ?? '');
        break;
      case 'region':
        this.profile.region = data.region ?? 'global';
        this.profile.ageOk = false;
        this.saveSoon();
        this.showVault();
        break;
      case 'age-ok':
        this.profile.ageOk = true;
        this.saveSoon();
        this.showVault();
        break;
      case 'weekly':
        this.doWeekly();
        break;
      case 'store-char':
        this.storeChar = (data.char as CharId | 'all') ?? 'all';
        this.showVault();
        break;
      case 'store-rarity':
        this.storeRarity = (data.rarity as Rarity | 'all') ?? 'all';
        this.showVault();
        break;
      case 'equip':
        this.doEquip(data.uid ?? '');
        break;
      case 'upgrade':
        this.doUpgrade(data.uid ?? '');
        break;
      case 'unequip':
        this.doUnequip(data.char as CharId, data.slot as Slot);
        break;
      case 'opt':
        this.setOption(data.field ?? '', data.value ?? '0');
        this.audio.play('select');
        this.showOptions(this.optionsFrom);
        break;
      case 'bind':
        this.binding = { side: data.side === '1' ? 1 : 0, action: (data.key as Action) ?? 'light' };
        this.showOptions(this.optionsFrom);
        break;
      case 'reset-options':
        this.profile.options = { ...DEFAULT_OPTIONS, training: { ...DEFAULT_OPTIONS.training }, net: { ...DEFAULT_OPTIONS.net } };
        this.profile.keys = [{ ...DEFAULT_KEYS[0] }, { ...DEFAULT_KEYS[1] }];
        this.applyOptions();
        this.saveSoon();
        this.showOptions(this.optionsFrom);
        break;
      case 'wipe':
        this.wipe();
        break;
      case 'close-modal':
        this.closeModal();
        break;
      case 'reel-skip':
        this.finishReel(true);
        break;
      /* the lab */
      case 'dummy':
        this.dummy = (data.dummy as Dummy) ?? 'stand';
        if (this.session) this.session.cpuEnabled = this.dummy === 'cpu';
        this.showPause();
        break;
      case 'train-toggle': {
        const key = data.key as keyof ClashProfile['options']['training'];
        if (key in this.profile.options.training) {
          this.profile.options.training[key] = !this.profile.options.training[key];
          this.saveSoon();
        }
        this.showPause();
        break;
      }
      case 'trial': {
        const i = Number(data.trial ?? -1);
        const seq = this.fightCfg ? charDef(this.fightCfg.playerChar).trials[i] : undefined;
        if (seq) {
          this.trial = { seq: seq.filter((k) => k !== 'jump' && k !== 'gc'), pos: 0 };
          this.trialIndex = i;
          this.toast(`TRIAL ${i + 1} ARMED: ${seq.join(' > ').toUpperCase()}`);
          this.resumeFight();
        }
        break;
      }
      /* replays, story, rift */
      case 'replay':
        this.startReplay(Number(data.index ?? -1));
        break;
      case 'story':
        this.startStory(Number(data.chapter ?? 0));
        break;
      case 'rift':
        this.startRift(Number(data.rung ?? 0));
        break;
      /* builder */
      case 'builder-char':
        this.builderChar = (data.char as CharId) ?? this.builderChar;
        this.showBuilder();
        break;
      case 'builder-part': {
        const cur = this.currentCustom();
        const part = data.part as keyof CustomFinisher['parts'];
        if (part && data.value) cur.parts[part] = data.value;
        this.profile.custom[this.builderChar] = cur;
        this.saveSoon();
        this.showBuilder();
        break;
      }
      case 'builder-save':
        this.profile.custom[this.builderChar] = this.currentCustom();
        this.saveNow();
        this.toast(`SAVED ${this.currentCustom().name.toUpperCase()} FOR ${charDef(this.builderChar).name.toUpperCase()}`);
        break;
      case 'builder-clear':
        delete this.profile.custom[this.builderChar];
        this.saveSoon();
        this.showBuilder();
        break;
      /* editor */
      case 'editor-char':
        this.editorChar = (data.char as CharId) ?? this.editorChar;
        this.showEditor();
        break;
      case 'editor-move':
        this.editorKey = (data.key as MoveKey) ?? 'nLight';
        this.showEditor();
        break;
      case 'editor-test':
        this.profile.selected = this.editorChar;
        this.profile.options.training.hitboxes = true;
        this.profile.options.training.frameData = true;
        this.fightMode = 'training';
        this.saveSoon();
        this.startFight(this.buildConfig('training', this.editorChar, this.selectCpu === this.editorChar ? 'kestrel' : this.selectCpu));
        break;
      case 'editor-export':
        this.showEditor();
        break;
      case 'editor-import':
        this.importChar();
        break;
      default:
        break;
    }
  }

  private goBack(): void {
    if (this.screen === 'options') {
      if (this.optionsFrom === 'pause') this.showPause();
      else this.showTitle();
      return;
    }
    this.showTitle();
  }

  /* ---------------------------------------------------------------- select -- */

  private pickChar(id: CharId): void {
    if (!id) return;
    if (this.selectTarget === 0) this.profile.selected = id;
    else this.selectCpu = id;
    this.saveSoon();
    this.audio.play('select');
    this.showSelect();
  }

  private setMode(mode: FightMode): void {
    this.arcadePending = false;
    this.fightMode = mode;
    if (mode !== 'net' && mode !== 'online') this.profile.mode = mode;
    if (mode === 'ranked') this.profile.gearBuffs = false;
    this.saveSoon();
    this.showSelect();
  }

  private cycleField(field: string): void {
    if (field === 'cpuLevel') {
      this.profile.cpuLevel = (this.profile.cpuLevel % 5) + 1;
    } else if (field === 'stocks') {
      const opts = [1, 2, 3, 4, 5];
      const i = opts.indexOf(this.profile.stocks);
      this.profile.stocks = opts[(i + 1) % opts.length];
    } else if (field === 'timer') {
      const opts = [2, 3, 4, 5, 6, 8];
      const i = opts.indexOf(this.profile.timer);
      this.profile.timer = opts[(i + 1) % opts.length];
    }
    this.saveSoon();
    this.audio.play('select');
    this.showSelect();
  }

  private randomizeSelect(): void {
    const pool = CHAR_IDS.slice();
    this.profile.selected = pool[Math.floor(Math.random() * pool.length)];
    let other = pool[Math.floor(Math.random() * pool.length)];
    if (other === this.profile.selected) other = pool[(pool.indexOf(other) + 1) % pool.length];
    this.selectCpu = other;
    this.profile.selectedStage = STAGES[Math.floor(Math.random() * STAGES.length)].id;
    this.saveSoon();
    this.audio.play('select');
    this.showSelect();
  }

  private beginMatch(): void {
    if (this.arcadePending) {
      this.startArcade();
      return;
    }
    if (this.fightMode === 'net') {
      this.startNet();
      return;
    }
    if (this.fightMode === 'online') {
      this.showOnline();
      return;
    }
    const mode = this.fightMode;
    const cfg = this.buildConfig(mode, this.profile.selected, this.selectCpu);
    this.startFight(cfg);
  }

  private buildConfig(mode: MatchConfig['mode'], player: CharId, cpu: CharId): MatchConfig {
    return {
      stageId: this.profile.selectedStage,
      mode,
      seed: randomSeed(),
      stocks: mode === 'training' ? 99 : this.profile.stocks,
      timerTicks: mode === 'training' ? 0 : this.profile.timer * 60 * 60,
      gearBuffs: mode === 'ranked' ? false : this.profile.gearBuffs,
      playerChar: player,
      cpuChar: cpu,
      cpuLevel: this.profile.cpuLevel,
      modern: this.profile.options.modern,
      gear: [
        this.profile.loadouts[player] ?? {},
        mode === 'local' ? {} : (this.profile.loadouts[cpu] ?? {}),
      ],
      training: mode === 'training',
      unlocked: [
        finishersUnlocked(levelProgress(this.profile.xp[player]).level),
        finishersUnlocked(levelProgress(this.profile.xp[cpu]).level),
      ],
      custom: [this.profile.custom[player] ?? null, mode === 'local' ? (this.profile.custom[cpu] ?? null) : null],
    };
  }

  /* ----------------------------------------------------------------- vault -- */

  private doBuyPack(packId: string): void {
    const region = regionById(this.profile.region);
    if (!region.packs || !this.profile.ageOk) {
      this.audio.play('deny');
      this.toast('PACKS ARE NOT ON SALE HERE. THE CATALOGUE IS.');
      return;
    }
    const pack = openPackWithPity(this.profile, packId, Math.random);
    if (!pack) {
      this.audio.play('deny');
      this.toast('NOT ENOUGH COINS. THE HOUSE IS SORRY.');
      return;
    }
    this.audio.play('pack');
    this.saveSoon();
    this.showVault();
    this.showPackReel(pack, packId);
  }

  /** The case-opening reel: every card's strip spins past the pool and lands on the pulled piece. */
  private showPackReel(result: PackOpenResult, packId: string): void {
    this.closeModal();
    const overlay = document.createElement('div');
    overlay.className = 'screen results-screen';
    overlay.innerHTML = packReelHtml(result, packId.toUpperCase(), lcg(this.profile.packsOpened * 7919 + result.items.length));
    overlay.dataset.modal = '1';
    this.root.appendChild(overlay);
    this.modalEl = overlay;
    const reels = Array.from(overlay.querySelectorAll<HTMLElement>('.reel'));
    requestAnimationFrame(() => {
      reels.forEach((reel, i) => {
        const win = reel.querySelector<HTMLElement>('.reel-window');
        const track = reel.querySelector<HTMLElement>('.reel-track');
        if (!win || !track) return;
        const width = win.clientWidth;
        const land = 6 + REEL_LAND * REEL_TILE_W + 60;
        const jitter = (lcg(i + 1)() - 0.5) * 70;
        track.style.transform = `translateX(${Math.round(width / 2 - land + jitter)}px)`;
        reel.classList.add('spin');
        this.reelTimers.push(window.setTimeout(() => {
          reel.classList.add('settled');
          const won = reel.querySelector<HTMLElement>('.reel-item.won');
          const rarity = result.items[i]?.rarity ?? 'common';
          this.audio.play(rarity === 'mythic' || rarity === 'legendary' ? 'level' : rarity === 'epic' ? 'coin' : 'select');
          if (won) track.style.transform = `translateX(${Math.round(width / 2 - land)}px)`;
          if (i === reels.length - 1) this.finishReel(false);
        }, 3300 + i * 320));
      });
    });
  }

  private finishReel(skip: boolean): void {
    const overlay = this.modalEl;
    if (!overlay) return;
    for (const t of this.reelTimers) window.clearTimeout(t);
    this.reelTimers = [];
    if (skip) {
      overlay.querySelectorAll<HTMLElement>('.reel').forEach((reel) => {
        const win = reel.querySelector<HTMLElement>('.reel-window');
        const track = reel.querySelector<HTMLElement>('.reel-track');
        if (!win || !track) return;
        reel.classList.remove('spin');
        reel.classList.add('settled');
        track.style.transform = `translateX(${Math.round(win.clientWidth / 2 - (6 + REEL_LAND * REEL_TILE_W + 60))}px)`;
      });
    }
    const summary = overlay.querySelector<HTMLElement>('[data-reel-summary]');
    const list = overlay.querySelector<HTMLElement>('[data-reel-list]');
    const take = overlay.querySelector<HTMLButtonElement>('[data-reel-take]');
    const skipBtn = overlay.querySelector<HTMLElement>('[data-reel-skip]');
    const best = overlay.querySelectorAll('.reel-item.won.rarity-border-mythic').length
      ? 'MYTHIC'
      : overlay.querySelectorAll('.reel-item.won.rarity-border-legendary').length
        ? 'LEGENDARY'
        : overlay.querySelectorAll('.reel-item.won.rarity-border-epic').length ? 'EPIC' : 'RARE OR BELOW';
    if (summary) summary.textContent = `BEST PULL // ${best}`;
    if (list) list.classList.remove('hidden');
    if (take) take.disabled = false;
    if (skipBtn) skipBtn.classList.add('hidden');
  }

  private doBuyDirect(uid: string): void {
    const res = buyDirect(this.profile, uid);
    if (!res.ok) {
      this.audio.play('deny');
      this.toast(res.reason ?? 'NOT AVAILABLE.');
      return;
    }
    this.audio.play('coin');
    this.saveSoon();
    this.showVault();
    this.toast(`${res.item?.name ?? 'ITEM'} ADDED TO THE VAULT.`);
  }

  private doBuyCatalog(id: string): void {
    const res = buyCatalog(this.profile, id);
    if (!res.ok) {
      this.audio.play('deny');
      this.toast(res.reason ?? 'NOT AVAILABLE.');
      return;
    }
    this.audio.play('coin');
    this.saveSoon();
    this.showVault();
    this.toast(`${res.item?.name ?? 'ITEM'} BOUGHT OUTRIGHT. NO DICE.`);
  }

  private doSalvage(uid: string): void {
    const v = salvage(this.profile, uid);
    if (!v) {
      this.audio.play('deny');
      return;
    }
    this.audio.play('coin');
    this.saveSoon();
    if (this.modalEl) this.closeModal();
    this.showVault();
    this.toast(`SALVAGED FOR ${v} COINS.`);
  }

  private doWeekly(): void {
    const items = claimWeekly(this.profile, Math.random);
    if (!items) {
      this.audio.play('deny');
      this.toast('ALREADY CLAIMED THIS WEEK. THE HOUSE IS NOT A CHARITY.');
      return;
    }
    this.audio.play('pack');
    this.saveSoon();
    this.showVault();
    this.showPackReel({ items, coins: 0, rarity: items.reduce((b, it) => (['common', 'rare', 'epic', 'legendary', 'mythic'].indexOf(it.rarity) > ['common', 'rare', 'epic', 'legendary', 'mythic'].indexOf(b) ? it.rarity : b), 'common' as Rarity) }, 'WEEKLY');
  }

  private doEquip(uid: string): void {
    const res = equipGear(this.profile, uid);
    if (!res.ok) {
      this.audio.play('deny');
      this.toast(res.reason ?? 'NOT IN THE VAULT.');
      return;
    }
    this.audio.play('select');
    this.saveSoon();
    this.showVault();
  }

  private doUpgrade(uid: string): void {
    const res = upgradeGear(this.profile, uid);
    if (!res.ok) {
      this.audio.play('deny');
      this.toast(res.reason ?? 'CANNOT UPGRADE.');
      return;
    }
    this.audio.play('level');
    this.saveSoon();
    this.showVault();
    this.toast('GEAR UPGRADED.');
  }

  private doUnequip(char: CharId, slot: Slot): void {
    unequipGear(this.profile, char, slot);
    this.saveSoon();
    this.showVault();
  }

  private wipe(): void {
    if (!window.confirm('Wipe the profile? Levels, gear, scars, tapes and rival memory all go. This cannot be undone.')) return;
    wipeProfile();
    this.profile = defaultProfile();
    this.fightMode = 'casual';
    this.applyOptions();
    this.saveNow();
    this.showTitle();
    this.toast('PROFILE WIPED. A CLEAN PAGE.');
  }

  /* --------------------------------------------------------------- builder -- */

  private currentCustom(): CustomFinisher {
    const cur = this.profile.custom[this.builderChar];
    if (cur) return { name: cur.name, parts: { ...cur.parts } };
    return { name: 'Custom Finisher', parts: { opener: 'lift', beat: 'punches', punchline: 'panel' } };
  }

  /* ---------------------------------------------------------------- editor -- */

  /** Live edit of the character data; the sim reads moves every tick. */
  private editMove(field: string, value: number): void {
    if (!Number.isFinite(value)) return;
    const m = moveOf(this.editorChar, this.editorKey) as MoveDef & Record<string, unknown>;
    if (field.startsWith('hitbox.')) {
      const k = field.slice(7) as keyof MoveDef['hitbox'];
      m.hitbox[k] = value;
    } else if (field === 'startup' || field === 'active' || field === 'recovery') {
      m[field] = Math.max(0, Math.round(value));
    } else if (field === 'damage' || field === 'angle' || field === 'baseKb' || field === 'growthKb') {
      m[field] = value;
    }
    const ta = this.screenEl.querySelector<HTMLTextAreaElement>('[data-editor-json]');
    if (ta) ta.value = JSON.stringify(charDef(this.editorChar), null, 1);
  }

  private importChar(): void {
    const ta = this.screenEl.querySelector<HTMLTextAreaElement>('[data-editor-json]');
    if (!ta) return;
    try {
      const o = JSON.parse(ta.value) as Partial<ReturnType<typeof charDef>>;
      if (!o.id || !o.moves || !o.art) throw new Error('missing id, moves or art');
      const target = CHAR_BY_ID[this.editorChar];
      Object.assign(target, o, { id: this.editorChar });
      this.toast(`IMPORTED ${String(o.name ?? this.editorChar).toUpperCase()} FOR THIS SESSION`);
      this.showEditor();
    } catch (err) {
      this.toast(`INVALID JSON: ${(err as Error).message}`);
    }
  }

  /* ---------------------------------------------------------------- fight -- */

  private startFight(cfg: MatchConfig): void {
    this.net = null;
    this.onlineMatch = null;
    this.replay = null;
    this.spectator = false;
    this.fightCfg = cfg;
    this.session = new ClashSession(cfg, {
      localSide: 0,
      cpu: cfg.mode !== 'local' && !(cfg.training && this.dummy !== 'cpu'),
      cpuLevel: cfg.cpuLevel,
      seed: cfg.seed,
      read: this.profile.rivals[cfg.cpuChar]?.dodge ?? 0.2,
      delay: this.profile.options.latency,
    });
    this.beginFightScreen();
  }

  /* ------------------------------------------------------------- online -- */

  private onlineView(): OnlineView {
    const o = this.online;
    return {
      role: o?.role ?? null,
      status: o?.link.status ?? 'idle',
      detail: o?.link.detail ?? (PeerLink.supported() ? 'Host a match or join one.' : ''),
      invite: o?.invite ?? '',
      reply: o?.reply ?? '',
      open: o?.link.open ?? false,
      rtt: o?.link.rtt ?? 0,
      peerName: o?.peerName ?? '',
      peerChar: o?.peerChar ?? null,
      name: this.onlineName,
      char: this.profile.selected,
      supported: PeerLink.supported(),
      log: o?.log ?? [],
    };
  }

  private showOnline(): void {
    this.onlineMatch = null;
    this.showSimple('online', onlineHtml(this.onlineView()), 'online-screen');
  }

  /** Re-render the online screen without losing what is typed in the paste box. */
  private refreshOnline(): void {
    if (this.screen !== 'online') return;
    const live = this.screenEl.querySelector<HTMLTextAreaElement>('textarea[data-online]:not([readonly])');
    const keep = live ? { field: live.dataset.online ?? '', value: live.value } : null;
    this.showOnline();
    if (keep && keep.value) {
      const again = this.screenEl.querySelector<HTMLTextAreaElement>(`textarea[data-online="${keep.field}"]`);
      if (again) again.value = keep.value;
    }
  }

  private openLink(role: 'host' | 'guest'): PeerLink {
    const link: PeerLink = new PeerLink(role, {
      status: (s, detail) => {
        if (!this.online || this.online.link !== link) return;
        this.online.log.push(`${s.toUpperCase()} ${detail}`.trim());
        if (s === 'open') {
          link.send({ t: 'hello', name: this.onlineName, char: this.profile.selected, modern: this.profile.options.modern, v: NET_PROTOCOL });
          this.audio.play('select');
        }
        if ((s === 'closed' || s === 'failed') && this.onlineMatch) this.onlinePeerLeft(detail);
        else this.refreshOnline();
      },
      message: (msg) => this.onLinkMessage(msg),
    });
    return link;
  }

  private freshOnline(role: 'host' | 'guest'): OnlineState {
    this.leaveOnline(false);
    return { link: this.openLink(role), role, invite: '', reply: '', peerName: '', peerChar: null, peerModern: false, log: [], pendingCfg: null };
  }

  private async hostOnline(): Promise<void> {
    if (!PeerLink.supported()) return;
    const o = this.freshOnline('host');
    this.online = o;
    this.showOnline();
    try {
      const code = await o.link.host();
      if (this.online === o) {
        o.invite = code;
        this.refreshOnline();
      }
    } catch (e) {
      this.onlineError(e);
    }
  }

  private joinOnline(): void {
    if (!PeerLink.supported()) return;
    this.online = this.freshOnline('guest');
    this.showOnline();
  }

  private pasted(field: 'invite' | 'reply'): string {
    const ta = this.screenEl.querySelector<HTMLTextAreaElement>(`textarea[data-online="${field}"]`);
    return (ta?.value ?? this.online?.[field] ?? '').trim();
  }

  private async answerOnline(): Promise<void> {
    const o = this.online;
    if (!o || o.role !== 'guest') return;
    const invite = this.pasted('invite');
    if (!invite) {
      this.toast('PASTE THE INVITE FIRST');
      return;
    }
    o.invite = invite;
    try {
      const reply = await o.link.join(invite);
      if (this.online === o) {
        o.reply = reply;
        this.refreshOnline();
      }
    } catch (e) {
      this.onlineError(e);
    }
  }

  private async acceptOnline(): Promise<void> {
    const o = this.online;
    if (!o || o.role !== 'host') return;
    const reply = this.pasted('reply');
    if (!reply) {
      this.toast('PASTE THE REPLY FIRST');
      return;
    }
    o.reply = reply;
    try {
      await o.link.accept(reply);
      this.refreshOnline();
    } catch (e) {
      this.onlineError(e);
    }
  }

  private onlineError(e: unknown): void {
    const msg = e instanceof Error ? e.message : String(e);
    if (this.online) this.online.log.push(`ERROR ${msg}`);
    this.toast(msg.toUpperCase().slice(0, 48));
    this.refreshOnline();
  }

  private copyOnline(field: string): void {
    const o = this.online;
    if (!o) return;
    const text = field === 'reply' ? o.reply : o.invite;
    if (!text) {
      this.toast('NOTHING TO COPY YET');
      return;
    }
    const clip = navigator.clipboard;
    if (!clip) {
      this.toast('SELECT THE CODE AND COPY IT');
      return;
    }
    clip.writeText(text).then(() => this.toast('COPIED'), () => this.toast('SELECT THE CODE AND COPY IT'));
  }

  private onLinkMessage(msg: NetMessage): void {
    const o = this.online;
    if (!o) return;
    if (msg.t === 'hello') {
      o.peerName = (msg.name || 'PEER').toUpperCase().slice(0, 14);
      o.peerChar = msg.char;
      o.peerModern = !!msg.modern;
      o.log.push(`${o.peerName} IS HERE AS ${charDef(msg.char).name.toUpperCase()}`);
      if (msg.v !== NET_PROTOCOL) o.log.push('VERSION MISMATCH: ONE OF YOU NEEDS THE NEWER BUILD');
      this.refreshOnline();
    } else if (msg.t === 'cfg') {
      if (o.role !== 'guest') return;
      o.pendingCfg = msg.cfg;
      if (msg.name) o.peerName = msg.name;
      o.link.send({ t: 'go' });
      this.startOnline(msg.cfg, 1);
    } else if (msg.t === 'go') {
      if (o.role === 'host' && o.pendingCfg) this.startOnline(o.pendingCfg, 0);
    } else if (msg.t === 'bye') {
      o.log.push(`${o.peerName || 'PEER'} LEFT`);
      if (this.onlineMatch) this.onlinePeerLeft('They left.');
      else this.refreshOnline();
    } else if (this.onlineMatch) {
      this.onlineMatch.onMessage(msg);
    }
  }

  private startOnlineHost(): void {
    const o = this.online;
    if (!o || o.role !== 'host' || !o.link.open) {
      this.toast('NOT CONNECTED YET');
      return;
    }
    if (!o.peerChar) {
      this.toast('WAITING FOR THE GUEST TO CHECK IN');
      return;
    }
    const cfg = this.buildConfig('casual', this.profile.selected, o.peerChar);
    cfg.gearBuffs = false;
    cfg.modern2 = o.peerModern;
    cfg.seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    o.pendingCfg = cfg;
    o.link.send({ t: 'cfg', cfg, name: this.onlineName });
    o.log.push('RULES SENT. WAITING FOR THE GUEST TO LOAD.');
    this.refreshOnline();
  }

  /** Both sides land here: the host on the guest's GO, the guest on the host's rules. */
  private startOnline(cfg: MatchConfig, localSide: 0 | 1): void {
    const o = this.online;
    if (!o) return;
    this.fightMode = 'online';
    this.fightCfg = cfg;
    this.replay = null;
    this.spectator = false;
    this.net = null;
    this.onlineMatch = null;
    this.arcadePending = false;
    const delay = Math.max(1, Math.min(6, this.profile.options.net.delay));
    this.session = new ClashSession(cfg, { localSide, cpu: false, delay });
    this.session.core = new Rollback(this.session.match, { delay, maxRollback: 24 });
    this.onlineMatch = new OnlineMatch(o.link, this.session.core, localSide);
    this.beginFightScreen();
    this.toast(`ONLINE // YOU ARE P${localSide + 1} // PING ${o.link.rtt} MS`);
  }

  /** One tick of a real online match. Null when we are waiting on the other side. */
  private stepOnline(): MatchEvent[] | null {
    const om = this.onlineMatch!;
    const ev = om.tick(this.buildInput(0));
    if (ev) this.session!.events.push(...ev);
    return ev;
  }

  private onlinePeerLeft(detail: string): void {
    this.onlineMatch = null;
    this.toast(`LINK LOST: ${detail.toUpperCase().slice(0, 40)}`, 3200);
    if (this.screen === 'fight' || this.screen === 'results') {
      this.session = null;
      this.fightCfg = null;
      this.showOnline();
    } else {
      this.refreshOnline();
    }
  }

  private leaveOnline(show = true): void {
    const o = this.online;
    this.onlineMatch = null;
    this.online = null;
    if (o) o.link.close();
    if (show) this.showOnline();
  }

  private startNet(): void {
    const cfg = this.buildConfig('casual', this.profile.selected, this.selectCpu);
    cfg.modern2 = this.netP2 === 'keys' ? this.profile.options.modern : false;
    this.fightCfg = cfg;
    this.replay = null;
    this.spectator = false;
    const net = this.profile.options.net;
    this.net = new NetSim(() => new ClashSession(cfg, { localSide: 0, cpu: false }).match, { delay: net.delay, ping: net.ping, jitter: net.jitter });
    // Peer 0 is the local view; the session only drives the CPU brain for peer 2's side.
    this.session = new ClashSession(cfg, { localSide: 1, cpu: this.netP2 === 'cpu', cpuLevel: cfg.cpuLevel, seed: cfg.seed, delay: net.delay });
    this.session.core = this.net.peers[0];
    this.beginFightScreen();
  }

  private startReplay(index: number): void {
    const file = this.profile.replays[index];
    if (!file) return;
    this.net = null;
    this.onlineMatch = null;
    this.spectator = true;
    this.fightCfg = file.cfg;
    this.replay = { file, cursor: { i: 0 } };
    this.session = new ClashSession(file.cfg, { localSide: 0, cpu: false, delay: 0 });
    this.beginFightScreen();
    this.toast('TAPE ROLLING. ESC PAUSES, ANY MENU STOPS IT.');
  }

  private startStory(chapter: number): void {
    const i = clamp(chapter, 0, 7);
    if (i > this.profile.story) return;
    const me = CHAR_IDS[i];
    const foe = CHAR_IDS[(i + 1) % 8];
    const cfg = this.buildConfig('casual', me, foe);
    cfg.stageId = STAGES[(i + 1) % STAGES.length].id;
    cfg.cpuLevel = 2 + Math.floor(i / 3);
    cfg.stocks = 3;
    this.storyChapter = i;
    this.startFight(cfg);
    this.storyChapter = i;
  }

  private startRift(rung: number): void {
    const day = today();
    const wins = this.profile.rift.day === day ? this.profile.rift.wins : 0;
    if (rung !== wins || rung > 2) return;
    const r = riftRungs(day, this.profile.selected)[rung];
    const cfg = this.buildConfig('casual', this.profile.selected, r.foe);
    cfg.stageId = r.stageId;
    cfg.stocks = r.stocks;
    cfg.cpuLevel = r.cpuLevel;
    cfg.mods = r.mods;
    cfg.seed = 1000 + rung;
    this.riftDay = day;
    this.riftRung = rung;
    this.startFight(cfg);
    this.riftRung = rung;
  }

  private startSpectate(): void {
    const stage = STAGES[Math.floor(Math.random() * STAGES.length)];
    const pool = CHAR_IDS.slice();
    const a = pool[Math.floor(Math.random() * pool.length)];
    const b = pool.filter((id) => id !== a)[Math.floor(Math.random() * (pool.length - 1))];
    const cfg: MatchConfig = {
      stageId: stage.id,
      mode: 'casual',
      seed: randomSeed(),
      stocks: 3,
      timerTicks: 4 * 60 * 60,
      gearBuffs: false,
      playerChar: a,
      cpuChar: b,
      cpuLevel: 4,
      modern: this.profile.options.modern,
      gear: [{}, {}],
      training: false,
    };
    this.net = null;
    this.onlineMatch = null;
    this.replay = null;
    this.spectator = true;
    this.fightCfg = cfg;
    this.session = new ClashSession(cfg, { spectator: true, seed: cfg.seed, cpuLevel: 4 });
    this.beginFightScreen();
  }

  private beginFightScreen(): void {
    const cfg = this.fightCfg;
    if (!cfg) return;
    const stage = stageById(cfg.stageId);
    this.screen = 'fight';
    this.paused = false;
    this.accum = 0;
    this.alpha = 0;
    this.resultsAt = 0;
    this.lastResult = null;
    this.lastCount = '';
    this.superUntil = 0;
    this.moveUntil = 0;
    this.ghostRing = [];
    this.trial = null;
    this.trialIndex = -1;
    this.lastDraw = performance.now();
    this.closeModal();
    this.hideHud();
    const keepScars = this.profile.options.persistentScars && this.renderer.getScars().length > 0;
    this.renderer.reset();
    if (!keepScars) this.renderer.setScars(this.profile.scars[stage.id] ?? []);
    this.startScarCount = this.renderer.getScars().length;
    this.buildHud();
    this.screenEl.className = 'screen fight-ui';
    this.screenEl.innerHTML = '';
    this.audio.startMusic(stage.music);
    this.saveNow();
  }

  private buildHud(): void {
    const cfg = this.fightCfg;
    if (!cfg) return;
    const stage = stageById(cfg.stageId);
    this.hudEl.classList.remove('hidden');
    this.hudEl.innerHTML = hudHtml({
      profile: this.profile,
      mode: cfg.mode,
      stageName: stage.name,
      stageSub: stage.subtitle,
      stocks: cfg.mode === 'training' ? 1 : cfg.stocks,
      timerMinutes: cfg.mode === 'training' ? 0 : Math.round(cfg.timerTicks / 3600),
      modern: cfg.modern,
      spectator: this.spectator,
      local: cfg.mode === 'local' || this.net !== null,
      p1: cfg.playerChar,
      p2: cfg.cpuChar,
    }) + (this.replay ? `<div class="input-display">${inputDisplayHtml()}</div>` : '') + '<div class="hud-corrupt-line hidden" data-corrupt></div>';
    const q = (sel: string): HTMLElement => {
      const el = this.hudEl.querySelector<HTMLElement>(sel);
      if (!el) throw new Error(`Missing HUD element ${sel}`);
      return el;
    };
    this.hudEls = [
      {
        name: q('[data-name="0"]'),
        tag: q('[data-tag="0"]'),
        hp: q('[data-hp="0"]'),
        chip: q('[data-chip="0"]'),
        stocks: q('[data-stocks="0"]'),
        drive: q('[data-drive="0"]'),
      },
      {
        name: q('[data-name="1"]'),
        tag: q('[data-tag="1"]'),
        hp: q('[data-hp="1"]'),
        chip: q('[data-chip="1"]'),
        stocks: q('[data-stocks="1"]'),
        drive: q('[data-drive="1"]'),
      },
    ];
    this.hudCombo = [q('[data-combo="0"]'), q('[data-combo="1"]')];
    this.clockEl = q('[data-clock]');
    this.calloutEl = q('[data-callout]');
    this.toastMoveEl = q('[data-movetoast]');
    this.superEl = q('[data-superflash]');
    this.countEl = q('[data-countin]');
    this.inputDisplayEl = this.hudEl.querySelector<HTMLElement>('.input-display');
    this.corruptEl = this.hudEl.querySelector<HTMLElement>('[data-corrupt]');
    this.paintPortraits(this.hudEl);
    this.lastStockMax = cfg.mode === 'training' ? 1 : cfg.stocks;
    this.lastStocks = [cfg.stocks, cfg.stocks];
  }

  private stepFight(dt: number): void {
    if (!this.session || !this.fightCfg) return;
    if (this.session.over) return;
    if (this.replay && this.session.tick >= this.replay.file.ticks) return;
    this.accum = Math.min(0.16, this.accum + dt);
    let ticks = 0;
    while (this.accum >= TICK && ticks < 5) {
      const match = this.session.match;
      const before = this.session.tick;
      let events: MatchEvent[];
      if (this.net) {
        events = this.stepNet();
      } else if (this.onlineMatch) {
        const ev = this.stepOnline();
        if (ev === null) {
          // Waiting on the other side: do not bank the time, or we would burst when it arrives.
          this.accum = 0;
          break;
        }
        events = ev;
      } else if (this.replay) {
        events = this.session.stepReplay(this.replay.file.inputs, this.replay.cursor);
      } else {
        if (this.fightCfg.mode === 'local') this.session.setP2(this.buildInput(1));
        else if (this.fightCfg.training && this.dummy !== 'cpu') this.session.setP2(this.dummyInput(match));
        events = this.session.step(this.buildInput(0));
      }
      for (const e of events) {
        this.renderer.addEvent(e, this.session.match);
        this.onEvent(e);
      }
      if (this.session.tick > before) this.renderer.tickImpacts();
      this.afterTick(this.session.match, events);
      this.hits.clear();
      this.accum -= TICK;
      ticks++;
      if (this.session.match.phase === 'over') break;
    }
    this.alpha = Math.min(1, this.accum / TICK);
  }

  /** One tick of the netplay sim: both peers stamp their own side and the wire carries it across. */
  private stepNet(): MatchEvent[] {
    const net = this.net!;
    const now = performance.now();
    const p1 = this.buildInput(0);
    // Peer 2's CPU reads peer 2's own view of the match, so its inputs really do arrive late at peer 1.
    const p2 = this.netP2 === 'keys' ? this.buildInput(1) : aiInput(this.session!.brains[1], net.peers[1].state);
    net.localInput(0, p1, now);
    net.localInput(1, p2, now);
    net.deliver(now);
    const before = net.peers[0].tick;
    net.advance();
    const ev = net.peers[0].tick > before ? net.peers[0].eventsAt(net.peers[0].tick) : [];
    this.session!.events.push(...ev);
    return ev;
  }

  /** The training dummy's input when it is not the CPU brain. */
  private dummyInput(m: MatchState): InputFrame {
    const i = emptyInput();
    if (this.dummy === 'jump') {
      if (m.tick % 60 < 2) { i.jump = true; i.jumpPressed = m.tick % 60 === 0; }
    } else if (this.dummy === 'dodge') {
      const me = m.fighters[0];
      if (me.state === 'attack' && me.moveFrame < 3) { i.dodge = true; i.dodgePressed = true; }
    }
    return i;
  }

  /** Ghost ring, combo trials, the replay input display. */
  private afterTick(m: MatchState, events: MatchEvent[]): void {
    if (this.fightCfg?.training) {
      this.ghostRing.push(structuredClone(m.fighters[0]));
      if (this.ghostRing.length > GHOST_TICKS) this.ghostRing.shift();
      if (this.trial) this.checkTrial(m, events);
    }
    if (this.inputDisplayEl) this.updateInputDisplay(m);
  }

  private checkTrial(m: MatchState, events: MatchEvent[]): void {
    const tr = this.trial;
    if (!tr) return;
    for (const e of events) {
      if (e.type !== 'hit' || e.side !== 0 || !e.move) continue;
      const hitKey = m.fighters[0].move ?? '';
      const want = tr.seq[tr.pos];
      if (hitKey === want) {
        tr.pos++;
        if (tr.pos >= tr.seq.length) {
          this.toast(`TRIAL ${this.trialIndex + 1} COMPLETE: ${tr.seq.join(' > ').toUpperCase()}`);
          this.audio.play('level');
          this.trial = null;
          return;
        }
      } else if (hitKey === tr.seq[0]) {
        tr.pos = 1;
      } else {
        tr.pos = 0;
      }
    }
    if (tr.pos > 0 && m.combo[0].hits === 0 && m.fighters[1].state !== 'hitstun') tr.pos = 0;
  }

  private updateInputDisplay(m: MatchState): void {
    if (!this.inputDisplayEl || !this.session) return;
    const t = m.tick + 1;
    for (const side of [0, 1] as const) {
      const row = this.inputDisplayEl.querySelector<HTMLElement>(`[data-inputs="${side}"]`);
      if (!row) continue;
      const packed = this.replay ? this.replayInputAt(side, t) : 0;
      row.querySelectorAll('span').forEach((s, i) => s.classList.toggle('on', (packed & (1 << i)) !== 0));
    }
  }

  private replayInputAt(side: 0 | 1, tick: number): number {
    const log = this.replay?.file.inputs ?? [];
    for (let i = Math.min(log.length - 1, this.replay?.cursor.i ?? 0); i >= 0; i--) {
      if (log[i][0] <= tick && log[i][1] === side) return log[i][2];
    }
    return 0;
  }

  private onEvent(e: MatchEvent): void {
    const tier = e.tier ?? 0;
    switch (e.type) {
      case 'hit':
        if (tier >= 3) this.audio.play('hit3');
        else if (tier === 2) this.audio.play('hit2');
        else if (tier === 1) this.audio.play('hit1');
        else this.audio.play('hit0');
        if (e.move) this.showMove(e.move);
        break;
      case 'block':
      case 'shield':
      case 'clash':
        this.audio.play('block');
        break;
      case 'parry':
        this.audio.play('parry');
        break;
      case 'perfect':
        this.audio.play('perfect');
        break;
      case 'dodge':
      case 'gc':
      case 'chase':
        this.audio.play('dodge');
        break;
      case 'ko':
      case 'ringout':
        this.audio.play('ko');
        break;
      case 'super':
      case 'comeback': {
        this.audio.play('super');
        const side = e.side ?? 0;
        const f = this.session?.match.fighters[side];
        if (f) this.showSuper(charDef(f.char).superName, charDef(f.char).name);
        break;
      }
      case 'finisher': {
        this.audio.play('super');
        this.audio.play('hit3');
        const side = e.side ?? 0;
        const f = this.session?.match.fighters[side];
        this.showSuper(e.text ?? 'FINISHER', f ? charDef(f.char).name : 'UNIVERSE CLASH');
        break;
      }
      case 'throw':
        this.audio.play('throw');
        break;
      case 'pickup':
        this.audio.play('pickup');
        break;
      case 'item':
        this.audio.play('score');
        break;
      case 'land':
        this.audio.play('land');
        break;
      case 'whiff':
        this.audio.play('whoosh');
        break;
      case 'burnout':
      case 'burst':
        this.audio.play('hit1');
        break;
      default:
        break;
    }
  }

  private showSuper(name: string, who: string): void {
    if (!this.superEl) return;
    const nameEl = this.superEl.querySelector<HTMLElement>('.name');
    const whoEl = this.superEl.querySelector<HTMLElement>('.who');
    if (nameEl) nameEl.textContent = name;
    if (whoEl) whoEl.textContent = who;
    this.superEl.classList.remove('hidden');
    this.superUntil = this.now + SUPER_SHOW_MS;
  }

  private showMove(name: string): void {
    if (!this.toastMoveEl) return;
    this.toastMoveEl.textContent = name;
    this.toastMoveEl.classList.add('show');
    this.moveUntil = this.now + 900;
  }

  private updateHud(): void {
    if (!this.session || !this.hudEls || !this.hudCombo) return;
    const m = this.session.match;
    // Null's super: the HP bars change places and the HUD shakes until it clears.
    const corrupt = m.uiCorrupt > 0;
    this.hudEl.classList.toggle('corrupt', corrupt);
    if (this.corruptEl) {
      this.corruptEl.classList.toggle('hidden', !corrupt);
      if (corrupt) this.corruptEl.textContent = `UI CORRUPTED // HP BARS SWAPPED ${(m.uiCorrupt / 60).toFixed(1)}S`;
    }
    for (const side of [0, 1] as const) {
      const f = m.fighters[corrupt ? (side === 0 ? 1 : 0) : side];
      const els = this.hudEls[side];
      const ratio = clamp(f.hp / Math.max(1, f.hpMax), 0, 1);
      els.hp.style.transform = `scaleX(${ratio})`;
      els.chip.style.transform = `scaleX(${ratio})`;
      const max = m.training ? 1 : this.lastStockMax;
      const stockKey = `${f.stocks}/${max}`;
      if (els.stocks.dataset.key !== stockKey) {
        els.stocks.dataset.key = stockKey;
        els.stocks.innerHTML = stocksHtml(f.stocks, max);
      }
      const pips = Math.floor(f.drive + 0.001);
      els.drive.querySelectorAll<HTMLElement>('i').forEach((pip, i) => {
        pip.classList.toggle('on', i < pips);
        pip.classList.toggle('lit', i < pips && f.superFree);
      });
      els.drive.classList.toggle('burnout', f.burnout > 0);
      const own = m.fighters[side];
      els.tag.textContent = this.spectator
        ? `${this.replay ? 'TAPE' : 'CPU'} // ${charDef(own.char).universeShort}`
        : side === 0
          ? `P1 // ${charDef(own.char).universeShort}${own.modern ? ' // MODERN' : ''}`
          : m.mode === 'local' || (this.net && this.netP2 === 'keys')
            ? `P2 // ${charDef(own.char).universeShort}`
            : `CPU LV${this.fightCfg?.cpuLevel ?? this.profile.cpuLevel} // ${charDef(own.char).universeShort}`;
      this.lastStocks[side] = f.stocks;
    }

    if (this.clockEl) {
      this.clockEl.textContent = m.training ? '∞' : fmtClock(m.timer);
      this.clockEl.classList.toggle('low', !m.training && m.timer <= 30 * 60);
    }

    for (const side of [0, 1] as const) {
      const tally = m.combo[side];
      const el = this.hudCombo[side];
      const show = tally.hits > 1 && m.tick - tally.lastTick < 70 && m.phase === 'fight';
      el.classList.toggle('show', show);
      const b = el.querySelector('b');
      if (b) b.textContent = String(tally.hits);
    }

    if (this.calloutEl) {
      const big = this.calloutEl.querySelector<HTMLElement>('.big');
      const small = this.calloutEl.querySelector<HTMLElement>('.small');
      if (m.dramatic > 0 && m.dramaticText) {
        if (big) big.textContent = m.dramaticText.toUpperCase();
        if (small) small.textContent = m.dramaticSub.toUpperCase();
        this.calloutEl.classList.add('show');
        this.calloutEl.classList.toggle('red', /K\.O\.|BURNOUT|BREAKER/.test(m.dramaticText));
        this.calloutEl.classList.toggle('gold', /SUPER|FINISH|PERFECT/.test(m.dramaticText));
        this.calloutEl.classList.toggle('cyan', /PARRY|CLASH|DRIVE/.test(m.dramaticText));
      } else {
        this.calloutEl.classList.remove('show');
      }
    }

    if (this.countEl) {
      const span = this.countEl.querySelector<HTMLElement>('span');
      let text = '';
      let go = false;
      if (m.phase === 'intro') {
        text = m.phaseTicks > 80 ? '3' : m.phaseTicks > 40 ? '2' : m.phaseTicks > 6 ? '1' : 'CLASH';
        go = text === 'CLASH';
      }
      if (text !== this.lastCount) {
        this.lastCount = text;
        if (span) {
          span.textContent = text;
          span.className = go ? 'go' : '';
        }
      }
    }

    if (this.superEl) {
      this.superEl.classList.toggle('hidden', this.now > this.superUntil);
    }
    if (this.toastMoveEl) {
      this.toastMoveEl.classList.toggle('show', this.now <= this.moveUntil);
    }
  }

  private watchEnd(now: number): void {
    if (!this.session || this.screen !== 'fight') return;
    const tapeDone = this.replay !== null && this.session.tick >= this.replay.file.ticks;
    if (this.session.match.phase !== 'over' && !tapeDone) return;
    if (!this.resultsAt) this.resultsAt = now + RESULT_DELAY_MS;
    if (this.resultsAt && now >= this.resultsAt) {
      this.resultsAt = 0;
      this.showResults();
    }
  }

  private showPause(): void {
    if (!this.session) return;
    this.paused = true;
    this.hits.clear();
    this.screen = 'fight';
    this.screenEl.className = 'screen results-screen';
    const cfg = this.fightCfg;
    this.screenEl.innerHTML = pauseHtml({
      training: !!cfg?.training,
      arcade: !!this.arcade,
      spectator: this.spectator,
      lab: cfg?.training
        ? trainingPanelHtml({ char: cfg.playerChar, dummy: this.dummy, options: this.profile.options.training, armed: this.trialIndex })
        : undefined,
    });
  }

  private resumeFight(): void {
    if (!this.session) return;
    this.screen = 'fight';
    this.paused = false;
    this.accum = 0;
    this.lastDraw = performance.now();
    this.screenEl.className = 'screen fight-ui';
    this.screenEl.innerHTML = '';
    this.hudEl.classList.remove('hidden');
  }

  private restartMatch(): void {
    if (!this.fightCfg) return;
    if (this.fightCfg.training) {
      this.session?.restart(this.fightCfg.cpuLevel);
      this.renderer.reset();
      this.renderer.setScars(this.profile.scars[this.fightCfg.stageId] ?? []);
      this.startScarCount = this.renderer.getScars().length;
      this.ghostRing = [];
      this.resumeFight();
      this.toast('LAB RESET. THE DUMMY FORGIVES.');
      return;
    }
    if (this.net) {
      this.startNet();
      return;
    }
    this.startFight({ ...this.fightCfg, seed: randomSeed() });
  }

  private rematch(): void {
    if (this.replay) {
      this.showReplays();
      return;
    }
    if (this.spectator) {
      this.startSpectate();
      return;
    }
    if (this.arcade?.active) {
      this.startArcadeFight();
      return;
    }
    if (!this.fightCfg) {
      this.showTitle();
      return;
    }
    if (this.net) {
      this.startNet();
      return;
    }
    if (this.storyChapter >= 0) {
      this.startStory(this.storyChapter);
      return;
    }
    if (this.riftRung >= 0) {
      this.showRift();
      return;
    }
    this.startFight({ ...this.fightCfg, seed: randomSeed() });
  }

  private endTraining(): void {
    if (!this.fightCfg?.training) return;
    this.paused = false;
    this.showResults();
  }

  /* ----------------------------------------------------------------- arcade -- */

  private startArcade(): void {
    const pool = CHAR_IDS.filter((id) => id !== this.profile.selected);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.arcade = {
      queue: pool,
      index: 0,
      wins: 0,
      active: true,
      cleared: false,
      char: this.profile.selected,
    };
    this.arcadePending = false;
    this.saveSoon();
    this.startArcadeFight();
  }

  private startArcadeFight(): void {
    const run = this.arcade;
    if (!run) return;
    if (run.index >= run.queue.length) {
      run.cleared = true;
      run.active = false;
      awardArcade(this.profile, run.wins);
      this.saveSoon();
      this.showTitle();
      return;
    }
    const opp = run.queue[run.index];
    const stage = STAGES.find((s) => s.universe === charDef(opp).universe) ?? stageById(this.profile.selectedStage);
    const cfg = this.buildConfig('casual', run.char, opp);
    cfg.stageId = stage.id;
    cfg.stocks = 2;
    cfg.timerTicks = 4 * 60 * 60;
    cfg.cpuLevel = Math.min(5, 2 + Math.floor(run.index / 2));
    cfg.gearBuffs = this.profile.gearBuffs;
    this.startFight(cfg);
  }

  private nextArcadeFight(): void {
    if (!this.arcade?.active) {
      this.showTitle();
      return;
    }
    this.startArcadeFight();
  }

  private closeModal(): void {
    for (const t of this.reelTimers) window.clearTimeout(t);
    this.reelTimers = [];
    if (this.modalEl) {
      this.modalEl.remove();
      this.modalEl = null;
    }
  }

  /* --------------------------------------------------------------- results -- */

  private showResults(): void {
    if (!this.session || !this.fightCfg || this.screen !== 'fight') return;
    this.screen = 'results';
    this.paused = false;
    this.audio.stopMusic();
    this.audio.play('score');
    if (!this.lastResult) this.lastResult = this.computeResult();
    const m = this.session.match;
    const cfg = this.fightCfg;
    const data = this.lastResult;
    this.hideHud();
    this.screenEl.className = 'screen results-screen';
    this.screenEl.innerHTML = resultsHtml({
      profile: this.profile,
      char: cfg.playerChar,
      rival: cfg.cpuChar,
      mode: this.net ? 'netplay sim' : this.replay ? 'replay' : cfg.mode,
      stageName: stageById(cfg.stageId).name,
      winningSide: m.winner,
      local: cfg.mode === 'local' || (this.net !== null && this.netP2 === 'keys'),
      spectator: this.spectator,
      training: !!cfg.training,
      stocks: [m.fighters[0].stocks, m.fighters[1].stocks],
      stats: m.stats,
      reward: data.reward,
      arcade: this.arcade
        ? {
            wins: this.arcade.wins,
            index: this.arcade.index,
            total: this.arcade.queue.length,
            cleared: this.arcade.cleared,
          }
        : null,
      arcadeNext: data.arcadeNext,
      extraLine: data.extraLine,
    });
    this.saveSoon();
  }

  private computeResult(): ResultData {
    const m = this.session!.match;
    const cfg = this.fightCfg!;
    const winner = m.winner;
    const won = winner === 0;
    const draw = winner === -1;
    let arcadeNext = false;
    let arcadeDone = false;
    const lines: string[] = [];
    if (m.finisher) lines.push(`FINISHER // ${m.finisher.name.toUpperCase()}`);

    if (this.arcade?.active) {
      if (won) {
        this.arcade.wins++;
        this.arcade.index++;
        if (this.arcade.index >= this.arcade.queue.length) {
          this.arcade.cleared = true;
          this.arcade.active = false;
          arcadeDone = true;
          awardArcade(this.profile, this.arcade.wins);
        } else {
          arcadeNext = true;
        }
      } else {
        this.arcade.active = false;
        arcadeDone = true;
        awardArcade(this.profile, this.arcade.wins);
      }
    }

    let reward: MatchReward | null = null;
    const counts = !this.spectator && !this.replay;
    if (counts) {
      const mode = this.net ? 'casual' : cfg.mode;
      reward = recordMatch(this.profile, m, 0, cfg.playerChar, cfg.cpuChar, mode, won);
      const fresh = this.renderer.getScars().slice(this.startScarCount);
      if (fresh.length) addScars(this.profile, cfg.stageId, fresh);
      if (reward.levelUps > 0) this.audio.play('level');
      if (cfg.mode === 'ranked') lines.push(`RANKED // MMR ${this.profile.ranked.mmr} (${this.profile.ranked.w}W ${this.profile.ranked.l}L)`);
      if (this.storyChapter >= 0 && won) {
        this.profile.story = Math.max(this.profile.story, this.storyChapter + 1);
        lines.push(`CHAPTER ${this.storyChapter + 1} CLEARED // ${this.profile.story >= 8 ? 'THE TEAR IS CLOSED' : `CHAPTER ${this.profile.story + 1} UNLOCKED`}`);
      }
      if (this.riftRung >= 0) {
        if (this.profile.rift.day !== this.riftDay) this.profile.rift = { day: this.riftDay, wins: 0 };
        if (won) {
          this.profile.rift.wins = Math.max(this.profile.rift.wins, this.riftRung + 1);
          this.profile.coins += 120;
          lines.push(`RIFT RUNG ${this.riftRung + 1} CLEARED // +120 COINS${this.profile.rift.wins >= 3 ? ' // LADDER DONE FOR TODAY' : ''}`);
        } else {
          lines.push(`RIFT RUNG ${this.riftRung + 1} // THE LADDER HOLDS`);
        }
      }
      if (!cfg.training && !this.net) {
        const rep = this.session!.exportReplay();
        rep.when = new Date().toISOString();
        this.profile.replays.unshift(rep);
        this.profile.replays = this.profile.replays.slice(0, 5);
      }
    }
    if (this.net) lines.push(`NETPLAY SIM // ${this.net.peers[0].rollbacks + this.net.peers[1].rollbacks} ROLLBACKS // ${this.net.desync ? `DESYNC AT TICK ${this.net.desyncTick}` : 'CHECKSUMS AGREED'}`);
    this.saveNow();
    return { won, draw, reward, arcadeNext, arcadeDone, extraLine: lines.join(' // ') };
  }

  /* ------------------------------------------------------------------ input -- */

  private buildInput(side: 0 | 1): InputFrame {
    const input = emptyInput();
    if (this.spectator) return input;
    const map: KeyMap = this.profile.keys[side];
    const held = (a: Action): boolean => this.keys.has(map[a]);
    const tapped = (a: Action): boolean => this.hits.has(map[a]);
    const modern = side === 0 && this.profile.options.modern;
    const k = (...codes: string[]): boolean => codes.some((c) => this.keys.has(c));
    const p = (...codes: string[]): boolean => codes.some((c) => this.hits.has(c));
    input.left = held('left');
    input.right = held('right');
    input.up = held('up') || held('jump');
    input.down = held('down');
    input.jump = held('jump') || held('up');
    input.jumpPressed = tapped('jump') || tapped('up');
    input.light = held('light');
    input.lightPressed = tapped('light');
    input.heavy = held('heavy');
    input.heavyPressed = tapped('heavy');
    input.dodge = held('dodge') || (modern && k('ShiftLeft', 'ShiftRight'));
    input.dodgePressed = tapped('dodge') || (modern && p('ShiftLeft', 'ShiftRight'));
    input.throw = held('throw') || (modern && k('KeyU'));
    input.throwPressed = tapped('throw') || (modern && p('KeyU'));
    input.super = held('super') || (modern && k('KeyO'));
    input.superPressed = tapped('super') || (modern && p('KeyO'));
    input.drive = held('drive') || (modern && k('KeyP'));
    input.drivePressed = tapped('drive') || (modern && p('KeyP'));
    this.mergePad(side, input);
    return input;
  }

  /** Gamepads: stick or d-pad, A jump, X light, Y heavy, B/RB dodge, LB throw, triggers super, Start pauses. */
  private mergePad(side: 0 | 1, input: InputFrame): void {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const pad = pads && pads[side];
    if (!pad) return;
    const b = (i: number): boolean => !!pad.buttons[i]?.pressed;
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    const cur = packInput({
      ...emptyInput(),
      left: ax < -0.5 || b(14),
      right: ax > 0.5 || b(15),
      up: ay < -0.5 || b(12),
      down: ay > 0.5 || b(13),
      jump: b(0),
      light: b(2),
      heavy: b(3),
      dodge: b(1) || b(5),
      throw: b(4),
      super: b(6) || b(7),
      drive: b(10),
    });
    const last = this.padLast[side];
    const fresh = cur & ~last;
    this.padLast[side] = cur;
    const bit = (i: number): boolean => (cur & (1 << i)) !== 0;
    const edge = (i: number): boolean => (fresh & (1 << i)) !== 0;
    input.left = input.left || bit(0);
    input.right = input.right || bit(1);
    input.up = input.up || bit(2) || bit(7);
    input.down = input.down || bit(3);
    input.light = input.light || bit(4);
    input.heavy = input.heavy || bit(5);
    input.dodge = input.dodge || bit(6);
    input.jump = input.jump || bit(7) || bit(2);
    input.throw = input.throw || bit(8);
    input.super = input.super || bit(9);
    input.drive = input.drive || bit(10);
    input.lightPressed = input.lightPressed || edge(4);
    input.heavyPressed = input.heavyPressed || edge(5);
    input.dodgePressed = input.dodgePressed || edge(6);
    input.jumpPressed = input.jumpPressed || edge(7) || edge(2);
    input.throwPressed = input.throwPressed || edge(8);
    input.superPressed = input.superPressed || edge(9);
    input.drivePressed = input.drivePressed || edge(10);
    if (side === 0) {
      const start = b(9);
      if (start && !this.padPauseLast && this.screen === 'fight') {
        if (this.paused) this.resumeFight();
        else this.showPause();
      }
      this.padPauseLast = start;
    }
  }
}
