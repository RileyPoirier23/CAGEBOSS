/* UNIVERSE CLASH - the app shell.
   Owns screens, input, save data and the real-time loop. The fight itself lives
   in ./clash/sim.ts and knows nothing about the DOM. */

import { charDef } from './characters';
import { STAGES, stageById } from './stages';
import { ClashSession } from './session';
import { ClashRenderer } from './render';
import { ClashAudio } from './audio';
import { drawPortrait, type ArtOpts } from './art';
import type { CharId, InputFrame, MatchConfig, MatchEvent, PoseName, Slot } from './types';
import { CHAR_IDS, emptyInput } from './types';
import {
  DEFAULT_OPTIONS,
  addScars,
  awardArcade,
  buyDirect,
  defaultProfile,
  equipGear,
  loadProfile,
  openPack,
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
  fmtClock,
  hudHtml,
  optionsHtml,
  packResultHtml,
  pauseHtml,
  resultsHtml,
  rosterHtml,
  selectHtml,
  stocksHtml,
  titleHtml,
  vaultHtml,
} from './ui';

const TICK = 1 / 60;
const RESULT_DELAY_MS = 1700;
const SUPER_SHOW_MS = 1150;

type ScreenName = 'title' | 'select' | 'fight' | 'results' | 'roster' | 'vault' | 'options';
type FightMode = MatchConfig['mode'];

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
}

interface HudSideEls {
  name: HTMLElement;
  tag: HTMLElement;
  hp: HTMLElement;
  chip: HTMLElement;
  stocks: HTMLElement;
  drive: HTMLElement;
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
  private fightCfg: MatchConfig | null = null;
  private spectator = false;

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

  private superUntil = 0;
  private moveUntil = 0;
  private lastCount = '';

  private readonly keys = new Set<string>();
  private readonly hits = new Set<string>();

  private hudEls: [HudSideEls, HudSideEls] | null = null;
  private hudCombo: [HTMLElement, HTMLElement] | null = null;
  private clockEl: HTMLElement | null = null;
  private calloutEl: HTMLElement | null = null;
  private toastMoveEl: HTMLElement | null = null;
  private superEl: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private lastStocks: [number, number] = [3, 3];
  private lastStockMax = 3;

  private saveTimer: number | null = null;
  private toastTimer: number | null = null;
  private modalEl: HTMLElement | null = null;

  private raf = 0;
  private lastDraw = 0;
  private now = 0;
  private fps = 60;
  private fpsFrames = 0;
  private fpsAt = 0;
  private showPerf = false;

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

    this.renderer = new ClashRenderer(this.canvas);
    this.applyOptions();
    this.bind();
    this.showTitle();

    this.fpsAt = performance.now();
    this.raf = requestAnimationFrame(this.frame);
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
    });
    this.renderer.resize();
    this.audio.setOptions({ muted: o.muted, volume: o.volume, music: o.music });
  }

  private setOption(field: string, value: string): void {
    const o = this.profile.options as unknown as Record<string, number | boolean>;
    if (field === 'muted' || field === 'vsync' || field === 'modern') {
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
    this.hudEl.innerHTML = '';
    this.hudEls = null;
    this.hudCombo = null;
    this.clockEl = null;
    this.calloutEl = null;
    this.toastMoveEl = null;
    this.superEl = null;
    this.countEl = null;
  }

  private showTitle(): void {
    this.screen = 'title';
    this.paused = false;
    this.session = null;
    this.fightCfg = null;
    this.spectator = false;
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
    this.screenEl.innerHTML = vaultHtml({
      profile: this.profile,
      tab: this.vaultTab,
      char: this.vaultChar,
    });
  }

  private showOptions(from: 'title' | 'pause'): void {
    this.optionsFrom = from;
    this.screen = 'options';
    this.closeModal();
    this.hideHud();
    this.screenEl.className = 'screen options-screen';
    this.ensureAttract('menu:options');
    this.screenEl.innerHTML = optionsHtml({ options: this.profile.options, fromPause: from === 'pause' });
    this.saveSoon();
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

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
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
      this.renderer.render(this.session.match, this.alpha, now);
      this.updateHud();
      if (!this.paused) this.watchEnd(now);
    } else {
      this.stepAttract(dt);
      if (this.attract) this.renderer.render(this.attract.match, this.menuAlpha, now);
    }
  };

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
    if (!this.showPerf) {
      this.perfEl.classList.add('hidden');
      return;
    }
    const m = this.session?.match ?? this.attract?.match;
    const tick = m?.tick ?? 0;
    const phase = m?.phase ?? 'menu';
    this.perfEl.classList.remove('hidden');
    this.perfEl.textContent = `${this.fps} FPS  |  TICK ${tick}  |  ${phase.toUpperCase()}\n` +
      `SIM 60 HZ  |  ALPHA ${this.alpha.toFixed(2)}  |  ${this.screen.toUpperCase()}\n` +
      `ROLLBACK READY  |  CAP ${this.profile.options.fpsCap || 'OFF'}`;
  }

  /* ----------------------------------------------------------------- input -- */

  private bind(): void {
    this.screenEl.addEventListener('click', this.onClick);
    this.screenEl.addEventListener('input', this.onInput);
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

  private onInput = (ev: Event): void => {
    const input = ev.target as HTMLInputElement;
    const field = input.dataset?.optRange;
    if (!field) return;
    this.setOption(field, input.value);
    const out = this.screenEl.querySelector<HTMLElement>(`[data-opt-out="${field}"]`);
    if (out) out.textContent = `${Math.round(Number(input.value) * 100)}%`;
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
    if (code === 'F3') {
      ev.preventDefault();
      this.showPerf = !this.showPerf;
      this.updatePerf();
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
    if (GAME_CODES.has(code)) {
      ev.preventDefault();
      if (!this.keys.has(code)) this.hits.add(code);
      this.keys.add(code);
    }
  };

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
        this.rematch();
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
      case 'reset-options':
        this.profile.options = { ...DEFAULT_OPTIONS };
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
    this.profile.mode = mode;
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
    const mode = this.fightMode;
    const cfg = this.buildConfig(mode, this.profile.selected, this.selectCpu);
    this.startFight(cfg);
  }

  private buildConfig(mode: FightMode, player: CharId, cpu: CharId): MatchConfig {
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
    };
  }

  /* ----------------------------------------------------------------- vault -- */

  private doBuyPack(packId: string): void {
    const pack = openPack(this.profile, packId, Math.random);
    if (!pack) {
      this.audio.play('deny');
      this.toast('NOT ENOUGH COINS. THE HOUSE IS SORRY.');
      return;
    }
    this.audio.play('pack');
    this.saveSoon();
    this.showVault();
    this.showPackResult(pack, packId);
  }

  private showPackResult(result: PackOpenResult, packId: string): void {
    this.closeModal();
    const overlay = document.createElement('div');
    overlay.className = 'screen results-screen';
    overlay.innerHTML = packResultHtml(result, packId.toUpperCase());
    overlay.dataset.modal = '1';
    this.root.appendChild(overlay);
    this.modalEl = overlay;
    this.paintPortraits(overlay);
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
    if (!window.confirm('Wipe the profile? Levels, gear, scars and rival memory all go. This cannot be undone.')) return;
    wipeProfile();
    this.profile = defaultProfile();
    this.fightMode = 'casual';
    this.applyOptions();
    this.saveNow();
    this.showTitle();
    this.toast('PROFILE WIPED. A CLEAN PAGE.');
  }

  /* ---------------------------------------------------------------- fight -- */

  private startFight(cfg: MatchConfig): void {
    this.spectator = false;
    this.fightCfg = cfg;
    this.session = new ClashSession(cfg, {
      localSide: 0,
      cpu: cfg.mode !== 'local',
      cpuLevel: cfg.cpuLevel,
      seed: cfg.seed,
      read: this.profile.rivals[cfg.cpuChar]?.dodge ?? 0.2,
    });
    this.beginFightScreen();
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
    this.lastDraw = performance.now();
    this.closeModal();
    this.hideHud();
    this.renderer.reset();
    this.renderer.setScars(this.profile.scars[stage.id] ?? []);
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
      local: cfg.mode === 'local',
      p1: cfg.playerChar,
      p2: cfg.cpuChar,
    });
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
    this.lastStockMax = cfg.mode === 'training' ? 1 : cfg.stocks;
    this.lastStocks = [cfg.stocks, cfg.stocks];
  }

  private stepFight(dt: number): void {
    if (!this.session || !this.fightCfg) return;
    if (this.session.over) return;
    this.accum = Math.min(0.16, this.accum + dt);
    let ticks = 0;
    while (this.accum >= TICK && ticks < 5) {
      const match = this.session.match;
      if (this.fightCfg.mode === 'local') this.session.setP2(this.buildInput(1));
      const input = this.buildInput(0);
      const events = this.session.step(input);
      for (const e of events) {
        this.renderer.addEvent(e, match);
        this.onEvent(e);
      }
      this.renderer.tickImpacts();
      this.hits.clear();
      this.accum -= TICK;
      ticks++;
      if (match.phase === 'over') break;
    }
    this.alpha = Math.min(1, this.accum / TICK);
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
    for (const side of [0, 1] as const) {
      const f = m.fighters[side];
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
      els.tag.textContent = this.spectator
        ? `CPU // ${charDef(f.char).universeShort}`
        : side === 0
          ? `P1 // ${charDef(f.char).universeShort}`
          : m.mode === 'local'
            ? `P2 // ${charDef(f.char).universeShort}`
            : `CPU LV${this.fightCfg?.cpuLevel ?? this.profile.cpuLevel} // ${charDef(f.char).universeShort}`;
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
    if (this.session.match.phase !== 'over') return;
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
    this.screenEl.innerHTML = pauseHtml({
      training: !!this.fightCfg?.training,
      arcade: !!this.arcade,
      spectator: this.spectator,
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
      this.resumeFight();
      this.toast('LAB RESET. THE DUMMY FORGIVES.');
      return;
    }
    this.startFight({ ...this.fightCfg, seed: randomSeed() });
  }

  private rematch(): void {
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
      mode: cfg.mode,
      stageName: stageById(cfg.stageId).name,
      winningSide: m.winner,
      local: cfg.mode === 'local',
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
    if (!this.spectator) {
      reward = recordMatch(
        this.profile,
        m,
        0,
        cfg.playerChar,
        cfg.cpuChar,
        cfg.mode,
        won,
      );
      const fresh = this.renderer.getScars().slice(this.startScarCount);
      if (fresh.length) addScars(this.profile, cfg.stageId, fresh);
      if (reward.levelUps > 0) this.audio.play('level');
    }
    this.saveNow();
    return { won, draw, reward, arcadeNext, arcadeDone };
  }

  /* ------------------------------------------------------------------ input -- */

  private buildInput(side: 0 | 1): InputFrame {
    const input = emptyInput();
    if (this.spectator) return input;
    const k = (...codes: string[]): boolean => codes.some((c) => this.keys.has(c));
    const p = (...codes: string[]): boolean => codes.some((c) => this.hits.has(c));
    if (side === 0) {
      const local = this.fightCfg?.mode === 'local';
      const modern = this.profile.options.modern;
      input.left = k('KeyA') || (!local && k('ArrowLeft'));
      input.right = k('KeyD') || (!local && k('ArrowRight'));
      input.up = k('KeyW', 'Space') || (!local && k('ArrowUp'));
      input.down = k('KeyS') || (!local && k('ArrowDown'));
      input.jump = input.up;
      input.jumpPressed = p('KeyW', 'Space') || (!local && p('ArrowUp'));
      input.light = k('KeyJ');
      input.lightPressed = p('KeyJ');
      input.heavy = k('KeyK');
      input.heavyPressed = p('KeyK');
      input.dodge = k('KeyL') || (modern && k('ShiftLeft', 'ShiftRight'));
      input.dodgePressed = p('KeyL') || (modern && p('ShiftLeft', 'ShiftRight'));
      input.throw = k('KeyE') || (modern && k('KeyU'));
      input.throwPressed = p('KeyE') || (modern && p('KeyU'));
      input.super = k('KeyI') || (modern && k('KeyO'));
      input.superPressed = p('KeyI') || (modern && p('KeyO'));
      input.drive = k('KeyQ') || (modern && k('KeyP'));
      input.drivePressed = p('KeyQ') || (modern && p('KeyP'));
    } else {
      input.left = k('ArrowLeft');
      input.right = k('ArrowRight');
      input.up = k('ArrowUp');
      input.down = k('ArrowDown');
      input.jump = input.up;
      input.jumpPressed = p('ArrowUp');
      input.light = k('Numpad1', 'Comma');
      input.lightPressed = p('Numpad1', 'Comma');
      input.heavy = k('Numpad2', 'Period');
      input.heavyPressed = p('Numpad2', 'Period');
      input.dodge = k('Numpad3', 'Slash');
      input.dodgePressed = p('Numpad3', 'Slash');
      input.throw = k('Numpad0');
      input.throwPressed = p('Numpad0');
      input.super = k('Numpad5', 'NumpadAdd');
      input.superPressed = p('Numpad5', 'NumpadAdd');
      input.drive = k('Numpad6', 'NumpadSubtract');
      input.drivePressed = p('Numpad6', 'NumpadSubtract');
    }
    return input;
  }
}

const GAME_CODES = new Set([
  'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyJ', 'KeyK', 'KeyL', 'KeyE', 'KeyI', 'KeyQ',
  'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Numpad0', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad5', 'Numpad6',
  'NumpadDecimal', 'NumpadAdd', 'NumpadSubtract',
  'ShiftLeft', 'ShiftRight', 'KeyU', 'KeyO', 'KeyP', 'Comma', 'Period', 'Slash',
]);
