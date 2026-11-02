import {
  CHARACTERS,
  charDef,
  moveOf,
} from './characters';
import { stageById } from './stages';
import type {
  CharId,
  Fighter,
  FinisherDef,
  GearLook,
  GearStats,
  ImpactTier,
  InputFrame,
  MatchConfig,
  MatchEvent,
  MatchState,
  MoveDef,
  MoveKey,
  Platform,
  Projectile,
  Rect,
  Slot,
  Trap,
  WorldItem,
} from './types';
import { SLOTS, customFinisherTicks, emptyInput, fighterCount, teamsFor } from './types';

export const TICK_RATE = 60;
export const DEFAULT_STOCKS = 3;
export const DEFAULT_TIMER = 60 * 60 * 4;

const GRAVITY = 0.68;
const MAX_FALL = 17;
const RUN_SPEED = 5.8;
const AIR_SPEED = 5.2;
const GROUND_ACCEL = 1.15;
const AIR_ACCEL = 0.55;
const JUMP_SPEED = 16.0;
const AIR_JUMP_SPEED = 14.4;
/** Knockback bleeds off fast in the air so a hit at low damage sends you a
    third of the stage, not the whole way to the blast zone. Brawlhalla rule:
    kills come from damage, not from the first signature that lands. */
const AIR_DRAG = 0.99;
const TUMBLE_DRAG = 0.972;
/** Half a meter at the bell. A super costs two pips, so the first one has to be earned. */
const DRIVE_START = 3;
const FAST_FALL = 12;
const DODGE_COOLDOWN = 105;
const BURNOUT_TICKS = 300;
const CHARGE_MAX = 45;
const DRIVE_MAX = 6;

const TAU = Math.PI * 2;
const rad = (deg: number) => (deg * Math.PI) / 180;

/* Deterministic trig. Math.sin/cos are not guaranteed to round the same way
   on every engine; a polynomial built from +,-,*,/ is (IEEE 754). Reduced to
   [-pi/2, pi/2], the Taylor tail is under 1e-7, plenty for knockback angles. */
function fsin(x: number): number {
  x = x % TAU;
  if (x < 0) x += TAU;
  if (x > Math.PI) x -= TAU;
  if (x > Math.PI / 2) x = Math.PI - x;
  else if (x < -Math.PI / 2) x = -Math.PI - x;
  const x2 = x * x;
  return x * (1 - (x2 / 6) * (1 - (x2 / 20) * (1 - (x2 / 42) * (1 - (x2 / 72) * (1 - x2 / 110)))));
}
function fcos(x: number): number {
  return fsin(x + Math.PI / 2);
}
function hyp(a: number, b: number): number {
  return Math.sqrt(a * a + b * b);
}

/** A cheap hash of everything that matters for sync. Two peers that agree here agree on the match. */
export function checksumMatch(m: MatchState): number {
  let h = 2166136261 | 0;
  const mix = (n: number): void => {
    h ^= (n * 256) | 0;
    h = Math.imul(h, 16777619);
  };
  mix(m.tick); mix(m.rng); mix(m.hitstop); mix(m.timer); mix(m.phase.length);
  for (const f of m.fighters) {
    mix(f.x); mix(f.y); mix(f.vx); mix(f.vy); mix(f.hp); mix(f.stocks); mix(f.drive);
    mix(f.moveFrame); mix(f.stateTicks); mix(f.state.length); mix(f.facing); mix(f.invuln); mix(f.hitstun);
  }
  for (const p of m.projectiles) { mix(p.x); mix(p.y); mix(p.life); }
  for (const t of m.traps) { mix(t.x); mix(t.life); }
  for (const p of m.platforms) mix(p.off ?? 0);
  return h >>> 0;
}

export function emptyEvent(type: MatchEvent['type']): MatchEvent {
  return { type, tick: 0 };
}

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

function rng(m: MatchState): number {
  let x = m.rng || 0x9e3779b9;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  m.rng = x >>> 0;
  return m.rng / 0x100000000;
}

function emit(m: MatchState, e: Omit<MatchEvent, 'tick'>): void {
  m.events.push({ ...e, tick: m.tick });
}

/* ------------------------------------------------------------------ teams -- */

/** Everyone on another team. KO'd fighters are included; callers filter. */
export function foesOf(m: MatchState, f: Fighter): Fighter[] {
  const out: Fighter[] = [];
  for (const o of m.fighters) if (o.team !== f.team) out.push(o);
  return out;
}

/** The closest living foe, by horizontal distance. Falls back to any foe so 1v1 always has one. */
export function nearestFoe(m: MatchState, f: Fighter): Fighter {
  let best: Fighter | null = null;
  let bestD = Infinity;
  for (const o of m.fighters) {
    if (o.team === f.team) continue;
    const alive = o.stocks > 0 && o.state !== 'ko';
    const d = Math.abs(o.x - f.x) + Math.abs(o.y - f.y) * 0.5 + (alive ? 0 : 1e6);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best ?? m.fighters[f.side === 0 ? 1 : 0];
}

/** Teams that still have a stock on the board. */
function aliveTeams(m: MatchState): number[] {
  const out: number[] = [];
  for (const f of m.fighters) if (f.stocks > 0 && !out.includes(f.team)) out.push(f.team);
  return out;
}

function teamStocks(m: MatchState, team: number): number {
  let n = 0;
  for (const f of m.fighters) if (f.team === team) n += f.stocks;
  return n;
}

function teamHp(m: MatchState, team: number): number {
  let n = 0;
  for (const f of m.fighters) if (f.team === team) n += f.hp;
  return n;
}

/** Would losing this fighter's last stock end the match? Finishers only play on the final KO. */
function wouldEnd(m: MatchState, def: Fighter): boolean {
  for (const f of m.fighters) {
    if (f === def) continue;
    if (f.team === def.team && f.stocks > 0) return false;
  }
  return true;
}

function allTeams(m: MatchState): number[] {
  const out: number[] = [];
  for (const f of m.fighters) if (!out.includes(f.team)) out.push(f.team);
  return out;
}

/** The team ahead on stocks, then on health; -1 for a dead heat. */
function leadingTeam(m: MatchState): number {
  let best = -1;
  let bestStocks = -1;
  let bestHp = -1;
  let tie = false;
  for (const t of allTeams(m)) {
    const s = teamStocks(m, t);
    const h = teamHp(m, t);
    if (s > bestStocks || (s === bestStocks && h > bestHp)) {
      best = t;
      bestStocks = s;
      bestHp = h;
      tie = false;
    } else if (s === bestStocks && h === bestHp) {
      tie = true;
    }
  }
  return tie ? -1 : best;
}

function anyOnTeam(m: MatchState, team: number): Fighter {
  for (const f of m.fighters) if (f.team === team) return f;
  return m.fighters[0];
}

/* ------------------------------------------------------------------ gear -- */

export function sumGear(look: GearLook): GearStats {
  const total: GearStats = { strength: 0, guard: 0, drive: 0, vigor: 0 };
  for (const slot of SLOTS as readonly Slot[]) {
    const item = look[slot];
    if (!item) continue;
    const scale = 1 + item.level / 100;
    for (const key of Object.keys(item.stats) as (keyof GearStats)[]) {
      total[key] += (item.stats[key] ?? 0) * scale;
    }
  }
  return total;
}

function buffFor(look: GearLook, enabled: boolean): Fighter['buff'] {
  if (!enabled) return { damage: 1, guard: 1, drive: 1, hp: 1 };
  const s = sumGear(look);
  return {
    damage: 1 + s.strength * 0.01,
    guard: 1 - s.guard * 0.008,
    drive: 1 + s.drive * 0.01,
    hp: 1 + s.vigor * 0.01,
  };
}

/* ------------------------------------------------------------------ match -- */

function makeFighter(
  char: CharId,
  side: number,
  team: number,
  spawn: { x: number; y: number },
  gear: GearLook,
  buff: Fighter['buff'],
): Fighter {
  const hpMax = Math.round(100 * buff.hp);
  return {
    side,
    team,
    char,
    x: spawn.x,
    y: spawn.y,
    px: spawn.x,
    py: spawn.y,
    vx: 0,
    vy: 0,
    facing: side === 0 ? 1 : -1,
    grounded: false,
    platform: -1,
    jumps: 2,
    dropTicks: 0,
    hpMax,
    hp: hpMax,
    stocks: DEFAULT_STOCKS,
    drive: DRIVE_START,
    burnout: 0,
    superFree: false,
    comebackUsed: false,
    state: 'idle',
    stateTicks: 0,
    move: null,
    moveFrame: 0,
    moveHit: false,
    moveHits: 0,
    hitCooldown: 0,
    charge: 0,
    charging: false,
    ex: false,
    attackDir: 0,
    hitstun: 0,
    invuln: 90,
    dodgeCooldown: 0,
    airDodged: false,
    gcWindow: 0,
    chaseWindow: 0,
    combo: 0,
    comboTimer: 0,
    parryTicks: 0,
    armorStock: 0,
    confuse: 0,
    lastHitBy: -1,
    lastHitMove: '',
    hitMask: 0,
    grabTarget: -1,
    perfectParry: 0,
    gear,
    buff,
    passives: {},
    landingLag: 0,
    jumpHeld: false,
    throwHeld: 0,
    flash: 0,
    taunt: 0,
    finalStand: false,
    modern: false,
    last: null,
  };
}

function itemKindFor(theme: string): string {
  switch (theme) {
    case 'scroll':
      return 'inkstone';
    case 'cabinet':
      return 'token';
    case 'crypt':
      return 'censer';
    case 'soundstage':
      return 'anvil';
    case 'hangar':
      return 'crate';
    default:
      return 'chair';
  }
}

function spawnItem(m: MatchState, kind: string, x: number, y: number): void {
  const id = m.nextEntity++;
  m.items.push({
    id,
    kind,
    x,
    y,
    px: x,
    py: y,
    vx: 0,
    vy: 0,
    grounded: true,
    life: 2600,
    heldBy: -1,
    thrower: -1,
    spin: 0,
  });
}

export function createMatch(config: MatchConfig): MatchState {
  const stage = stageById(config.stageId);
  const gearBuffs = config.gearBuffs && config.mode !== 'ranked';
  const format = config.format ?? '1v1';
  const n = fighterCount(format);
  const teams = teamsFor(format);
  const chars: CharId[] = [config.playerChar, config.cpuChar];
  for (let i = 2; i < n; i++) chars.push(config.chars?.[i] ?? config.cpuChar);
  const stocks = config.training ? 99 : config.stocks;
  const platforms: Platform[] = stage.platforms.map((p) => ({ ...p }));
  const main = platforms[0];
  const fighters: Fighter[] = [];
  for (let i = 0; i < n; i++) {
    const gear = config.gear[i] ?? {};
    const spawn = stage.spawns[i] ?? { x: main.x + (main.w * (i + 1)) / (n + 1), y: 320 };
    const f = makeFighter(chars[i], i, teams[i], spawn, gear, buffFor(gear, gearBuffs));
    f.stocks = stocks;
    f.modern = i === 0 ? !!config.modern : i === 1 ? !!config.modern2 : false;
    f.facing = spawn.x < 800 ? 1 : -1;
    fighters.push(f);
  }
  const zeros = (): number[] => fighters.map(() => 0);
  const state: MatchState = {
    tick: 0,
    phase: 'intro',
    phaseTicks: 120,
    timer: config.training ? 0 : config.timerTicks,
    introTicks: 120,
    hitstop: 0,
    dramatic: 0,
    dramaticSide: -1,
    dramaticText: '',
    dramaticSub: '',
    stageId: stage.id,
    mode: config.mode,
    format,
    platforms,
    fighters,
    projectiles: [],
    traps: [],
    items: [],
    events: [],
    nextEntity: 1,
    rng: config.seed || 0x51ed270b,
    stats: {
      damage: zeros(),
      hits: zeros(),
      maxCombo: zeros(),
      ringouts: zeros(),
      perfectParries: zeros(),
      driveSpent: zeros(),
      moveHits: fighters.map(() => ({})),
      dodgeAttempts: zeros(),
      dodgeReads: zeros(),
      supers: zeros(),
      finisher: false,
    },
    combo: fighters.map((f) => ({ side: f.side, hits: 0, damage: 0, max: 0, lastTick: -999, move: '' })),
    finisher: null,
    winner: -1,
    slowmo: 0,
    training: !!config.training,
    gearBuffs,
    seed: config.seed || 0x51ed270b,
    uiCorrupt: 0,
    unlocked: fighters.map((_, i) => config.unlocked?.[i] ?? 3),
    custom: fighters.map((_, i) => config.custom?.[i] ?? null),
    mods: { ...(config.mods ?? {}) },
  };

  spawnItem(state, itemKindFor(stage.theme), 800, main.y);
  // The training dummy starts opposite the player and never turns around.
  return state;
}

export function cloneMatch(m: MatchState): MatchState {
  return structuredClone(m);
}

/* --------------------------------------------------------------- messages -- */

function announce(m: MatchState, text: string, sub = '', side = -1): void {
  emit(m, { type: 'announce', text, sub, side: side === -1 ? undefined : side });
  m.dramaticSide = side;
  m.dramaticText = text;
  m.dramaticSub = sub;
}

function spendDrive(m: MatchState, f: Fighter, amount: number): boolean {
  if (f.burnout > 0) return false;
  if (f.drive + 0.0001 < amount) return false;
  f.drive = clamp(f.drive - amount, 0, DRIVE_MAX);
  m.stats.driveSpent[f.side] += amount;
  if (f.drive <= 0.0001) {
    f.drive = 0;
    f.burnout = BURNOUT_TICKS;
    emit(m, { type: 'burnout', side: f.side, text: 'BURNOUT', x: f.x, y: f.y - 120 });
    announce(m, 'BURNOUT', `${charDef(f.char).name} is out of Drive`, f.side);
  }
  return true;
}

/* ------------------------------------------------------------------ input -- */

function dirX(input: InputFrame, f: Fighter): number {
  return (input.right ? 1 : 0) - (input.left ? 1 : 0);
}

function dirY(input: InputFrame): number {
  return (input.down ? 1 : 0) - (input.up ? 1 : 0);
}

function faceOpponent(m: MatchState, f: Fighter): void {
  const o = nearestFoe(m, f);
  if (o.x > f.x + 3) f.facing = 1;
  else if (o.x < f.x - 3) f.facing = -1;
}

/* --------------------------------------------------------------- movement -- */

function hurtbox(f: Fighter): Rect {
  const s = charDef(f.char).art.scale;
  const w = 62 * s;
  const h = 144 * s;
  return { x: f.x - w / 2, y: f.y - h, w, h };
}

function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function platformUnder(m: MatchState, x: number, y: number): Platform | null {
  let best: Platform | null = null;
  for (const p of m.platforms) {
    if (p.off && p.off > 0) continue;
    if (x < p.x - 24 || x > p.x + p.w + 24) continue;
    if (p.y + 2 < y) continue;
    if (!best || p.y < best.y) best = p;
  }
  return best;
}

function land(m: MatchState, f: Fighter, p: Platform, index: number): void {
  f.y = p.y;
  f.vy = 0;
  f.grounded = true;
  f.platform = index;
  f.jumps = 2;
  f.airDodged = false;
  f.dropTicks = 0;
  if (f.state === 'jump' || f.state === 'fall') {
    f.state = 'land';
    f.stateTicks = 0;
    f.landingLag = 4;
  }
  if (f.state === 'respawn') {
    f.state = 'idle';
    f.stateTicks = 0;
  }
  if (f.state === 'dodge') {
    f.state = 'idle';
    f.stateTicks = 0;
    f.dodgeCooldown = Math.max(f.dodgeCooldown, 60);
  }
  if (f.state === 'attack' && f.move === 'pound') {
    const md = moveOf(f.char, 'pound');
    spawnShockwave(m, f, md, 0.8);
  } else if (f.state === 'attack' || f.state === 'super') {
    const md = f.move ? moveOf(f.char, f.move) : null;
    if (md?.effect === 'slam') {
      spawnShockwave(m, f, md, 0.9);
    }
  }
  emit(m, { type: 'land', side: f.side, x: f.x, y: f.y, seed: (m.rng + f.x) | 0 });
}

function physics(m: MatchState, f: Fighter): void {
  if (f.grounded) {
    const p = m.platforms[f.platform];
    const still = p && !(p.off && p.off > 0) && f.x > p.x - 30 && f.x < p.x + p.w + 30;
    if (!still) {
      f.grounded = false;
      f.platform = -1;
    }
  }

  if (!f.grounded) {
    f.vy = Math.min(f.vy + GRAVITY, MAX_FALL);
  }

  const prevY = f.y;
  f.x += f.vx;
  f.y += f.vy;

  if (f.dropTicks > 0) f.dropTicks--;

  if (!f.grounded && f.state !== 'ko') {
    for (let i = 0; i < m.platforms.length; i++) {
      const p = m.platforms[i];
      if (p.off && p.off > 0) continue;
      if (m.phase === 'intro' && p.soft) continue;
      if (p.soft && f.dropTicks > 0) continue;
      if (f.x < p.x - 30 || f.x > p.x + p.w + 30) continue;
      if (f.vy >= 0 && prevY <= p.y + 4 && f.y >= p.y) {
        land(m, f, p, i);
        break;
      }
    }
  }

  if (f.grounded) {
    if (f.state === 'idle' || f.state === 'run') {
      f.vx *= 0.78;
      if (Math.abs(f.vx) < 0.08) f.vx = 0;
    } else if (f.state === 'hitstun' || f.state === 'land') {
      f.vx *= 0.86;
    }
  } else {
    f.vx *= f.state === 'hitstun' ? TUMBLE_DRAG : AIR_DRAG;
  }

  if (!m.training) {
    const stage = stageById(m.stageId);
    const b = stage.blast;
    if (f.x < b.left || f.x > b.right || f.y > b.bottom) {
      ringOut(m, f);
    }
  } else if (f.x < -200 || f.x > 1800 || f.y > 1000) {
    const stage = stageById(m.stageId);
    f.x = stage.spawns[f.side].x;
    f.y = 260;
    f.vx = 0;
    f.vy = 0;
    f.state = 'respawn';
    f.hp = f.hpMax;
  }
}

/* --------------------------------------------------------------- attacks -- */

function hitboxOf(f: Fighter, md: MoveDef): Rect {
  const hb = md.hitbox;
  return {
    x: f.x + f.facing * hb.x - hb.w / 2,
    y: f.y + hb.y - hb.h / 2,
    w: hb.w,
    h: hb.h,
  };
}

function chooseLight(input: InputFrame, f: Fighter): MoveKey {
  const x = dirX(input, f);
  if (input.down && !f.grounded) return 'dAir';
  if (input.down) return 'dLight';
  if (x !== 0 && !f.grounded) return 'sAir';
  if (x !== 0) return 'sLight';
  return f.grounded ? 'nLight' : 'nAir';
}

function chooseHeavy(input: InputFrame, f: Fighter): MoveKey {
  if (!f.grounded) {
    if (input.up) return 'recovery';
    if (input.down) return 'pound';
    return 'airSig';
  }
  const x = dirX(input, f);
  if (input.down) return 'dSig';
  if (x !== 0) return 'sSig';
  return 'nSig';
}

function startMove(m: MatchState, f: Fighter, key: MoveKey, ex: boolean, charge: boolean): void {
  const md = moveOf(f.char, key);
  f.state = key === 'super' ? 'super' : 'attack';
  f.move = key;
  f.moveFrame = 0;
  f.moveHit = false;
  f.moveHits = 0;
  f.hitMask = 0;
  f.hitCooldown = 0;
  f.charging = !!(md.chargeable && charge);
  // Modern layout auto-charges: every signature starts a quarter charged.
  f.charge = f.charging && f.modern ? 12 : 0;
  f.ex = ex;
  f.stateTicks = 0;
  f.attackDir = key === 'sLight' || key === 'sSig' || key === 'sAir' ? f.facing : 0;
  if (md.motion) {
    f.vx += md.motion.x * f.facing;
    f.vy += md.motion.y;
    if (md.motion.y < 0) f.grounded = false;
    if (Math.abs(md.motion.x) > 2) f.facing = md.motion.x > 0 ? 1 : -1;
  }
  if (md.effect) {
    // effects that happen at the start of the active window are queued by
    // runMoveEffect; teleports and wings need to happen now to sell the dash.
    if (md.effect === 'teleportBehind' || md.effect === 'wings') {
      runMoveEffect(m, f, md, true);
    }
  }
  emit(m, {
    type: 'announce',
    side: f.side,
    text: ex ? `EX ${md.name}` : md.name,
    sub: ex ? 'DRIVE BURN' : '',
    x: f.x,
    y: f.y - 150,
  });
}

function canSpendForSuper(f: Fighter): boolean {
  return f.superFree || (f.drive >= 2 && f.burnout <= 0);
}

/* --------------------------------------------------------------- effects -- */

function spawnProjectile(
  m: MatchState,
  f: Fighter | null,
  char: CharId,
  owner: number,
  kind: string,
  x: number,
  y: number,
  vx: number,
  vy: number,
  gravity: number,
  life: number,
  radius: number,
  damage: number,
  angle: number,
  baseKb: number,
  growthKb: number,
  source: string,
  explode = 0,
): Projectile {
  const id = m.nextEntity++;
  const p: Projectile = {
    id,
    owner,
    char,
    kind,
    x,
    y,
    px: x,
    py: y,
    vx,
    vy,
    gravity,
    life,
    radius,
    damage,
    angle,
    baseKb,
    growthKb,
    pierce: false,
    explode,
    source,
    hit: false,
  };
  m.projectiles.push(p);
  return p;
}

function spawnTrap(
  m: MatchState,
  f: Fighter,
  kind: string,
  x: number,
  y: number,
  life: number,
  arm: number,
  radius: number,
  damage: number,
  angle: number,
  baseKb: number,
  growthKb: number,
  meta = 0,
): Trap {
  const haloBonus = charDef(f.char).universe === 'chapel' &&
    charDef(nearestFoe(m, f).char).universe !== 'chapel';
  const id = m.nextEntity++;
  const t: Trap = {
    id,
    owner: f.side,
    char: f.char,
    kind,
    x,
    y,
    px: x,
    py: y,
    life: Math.round(life * (haloBonus ? 1.5 : 1)),
    arm,
    radius,
    damage: damage + (haloBonus ? 2 : 0),
    angle,
    baseKb,
    growthKb,
    meta,
  };
  m.traps.push(t);
  emit(m, { type: 'spawn', side: f.side, x, y, text: kind, seed: (m.rng + x * 7) | 0 });
  return t;
}

function spawnShockwave(m: MatchState, f: Fighter, md: MoveDef, scale = 1): void {
  const x = f.x;
  const y = platformUnder(m, x, f.y - 10)?.y ?? f.y;
  spawnProjectile(
    m, f, f.char, f.side, 'shockwave', x, y - 12, 0, 0, 0, 22, 64,
    8 * scale, 72, 5.4 * scale, 0.9, md.key, 0,
  );
  const left = spawnProjectile(
    m, f, f.char, f.side, 'shockwave', x, y - 12, -5.6, 0, 0, 20, 42,
    6 * scale, 66, 4.8 * scale, 0.85, md.key, 0,
  );
  const right = spawnProjectile(
    m, f, f.char, f.side, 'shockwave', x, y - 12, 5.6, 0, 0, 20, 42,
    6 * scale, 66, 4.8 * scale, 0.85, md.key, 0,
  );
  left.kind = 'shockwave';
  right.kind = 'shockwave';
}

function runMoveEffect(m: MatchState, f: Fighter, md: MoveDef, immediate: boolean): void {
  const ground = platformUnder(m, f.x + f.facing * 90, f.y - 8);
  const gy = ground ? ground.y : f.y;
  switch (md.effect) {
    case 'teleportBehind': {
      if (!immediate) break;
      const o = nearestFoe(m, f);
      f.x = o.x - f.facing * 58;
      f.y = o.y;
      f.grounded = o.grounded;
      f.vx = 0;
      f.vy = 0;
      f.facing = o.x >= f.x ? 1 : -1;
      emit(m, { type: 'dodge', side: f.side, x: f.x, y: f.y, text: 'BEHIND', seed: (m.rng + f.x) | 0 });
      break;
    }
    case 'wings': {
      if (!immediate) break;
      f.vy = Math.min(f.vy, -1.5);
      break;
    }
    case 'sigil': {
      spawnTrap(m, f, 'sigil', f.x + f.facing * 105, gy - 4, 420, 18, 58, 12, 74, 5.4, 0.9);
      break;
    }
    case 'pillar': {
      spawnTrap(m, f, 'pillar', f.x + f.facing * 132, f.y - 74, 80, 9, 58, 15, 86, 7, 1.2, 8);
      break;
    }
    case 'egg': {
      spawnTrap(m, f, 'egg', f.x + f.facing * 72, gy - 8, 520, 20, 44, 9, 82, 5.2, 0.8);
      break;
    }
    case 'turret': {
      spawnTrap(m, f, 'turret', f.x + f.facing * 92, gy - 6, 420, 10, 44, 6, 38, 3.4, 0.45);
      break;
    }
    case 'airstrike': {
      const o = nearestFoe(m, f);
      spawnTrap(m, f, 'airstrike', o.x, gy - 4, 170, 42, 104, 17, 74, 7.4, 1.15);
      break;
    }
    case 'swarm': {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + (rng(m) - 0.5) * 0.4;
        spawnProjectile(
          m, f, f.char, f.side, 'swarm',
          f.x + fcos(a) * 60, f.y - 80 + fsin(a) * 40,
          fcos(a) * (2.2 + rng(m) * 1.8), fsin(a) * 2 - 1,
          0.02, 100, 14, 5, 55, 2.4, 0.35, 'super', 0,
        );
      }
      break;
    }
    case 'shockwave': {
      spawnShockwave(m, f, md, 1);
      break;
    }
    case 'slam': {
      f.vy = 13.5;
      f.vx = f.facing * 2.4;
      f.grounded = false;
      break;
    }
    case 'deletePlatform': {
      const o = nearestFoe(m, f);
      let best = -1;
      let bestD = 1e9;
      for (let i = 1; i < m.platforms.length; i++) {
        const p = m.platforms[i];
        if (!p.soft) continue;
        const d = Math.abs(p.x + p.w / 2 - o.x) + Math.abs(p.y - o.y);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best >= 0) {
        m.platforms[best].off = 120;
        emit(m, { type: 'spawn', side: f.side, x: m.platforms[best].x, y: m.platforms[best].y, text: 'PLATFORM DELETED', seed: (m.rng + best) | 0 });
      }
      break;
    }
    case 'heal': {
      f.hp = Math.min(f.hpMax, f.hp + 8);
      break;
    }
    case 'stealMeter': {
      const o = nearestFoe(m, f);
      const taken = Math.min(2, o.drive);
      o.drive = Math.max(0, o.drive - taken);
      f.drive = Math.min(DRIVE_MAX, f.drive + taken);
      break;
    }
    default:
      break;
  }
}

/* --------------------------------------------------------------- hits ----- */

interface HitOpts {
  damage: number;
  angle: number;
  baseKb: number;
  growthKb: number;
  name: string;
  key: MoveKey | null;
  kind: MoveDef['kind'] | 'projectile' | 'trap' | 'item';
  charge?: number;
  ex?: boolean;
  source?: string;
  tier?: ImpactTier;
  char?: CharId;
}

function isForeign(a: CharId, b: CharId): boolean {
  return charDef(a).universe !== charDef(b).universe;
}

function tierFor(m: MatchState, atk: Fighter, def: Fighter, md: MoveDef, opts: HitOpts): ImpactTier {
  if (md.kind === 'super') return 3;
  if (atk.perfectParry > 0 && md.kind === 'sig') return 2;
  if (md.chargeable && (opts.charge ?? 0) >= CHARGE_MAX) return 1;
  if (md.kind === 'impact' && (def.state === 'attack' || def.state === 'super')) return 1;
  if (def.hp - opts.damage <= 0 && def.stocks <= 1) return 2;
  if (opts.key === 'pound' || md.effect === 'slam') return 1;
  return 0;
}

function applyHit(
  m: MatchState,
  atk: Fighter,
  def: Fighter,
  opts: HitOpts,
  x: number,
  y: number,
): boolean {
  if (def.state === 'ko' || def.stocks <= 0) return false;
  if (def.invuln > 0 || def.state === 'respawn') return false;
  if (def.state === 'dodge' && def.stateTicks < 12) {
    emit(m, { type: 'dodge', side: def.side, x, y, text: 'DODGE', seed: (m.rng + x) | 0 });
    return false;
  }
  if (def.state === 'grabbed') return false;

  // Perfect parry: the first six ticks are sacred.
  if (def.state === 'parry' && def.parryTicks <= 6) {
    const refund = charDef(def.char).universe === 'oldink' && isForeign(def.char, atk.char) ? 2 : 1;
    def.drive = Math.min(DRIVE_MAX, def.drive + refund);
    def.perfectParry = 120;
    def.parryTicks = 99;
    def.invuln = Math.max(def.invuln, 12);
    m.stats.perfectParries[def.side]++;
    atk.state = 'hitstun';
    atk.hitstun = 42;
    atk.stateTicks = 0;
    atk.move = null;
    atk.vx = -atk.facing * 3;
    atk.vy = -2;
    atk.grounded = false;
    m.hitstop = Math.max(m.hitstop, 12);
    emit(m, { type: 'perfect', side: def.side, other: atk.side, x, y, text: 'PERFECT PARRY', value: refund, seed: (m.rng + x) | 0 });
    return false;
  }

  // Drive Impact clash: two armoured shoulders cancel.
  if (
    opts.kind === 'impact' &&
    atk.move === 'impact' &&
    def.state === 'attack' &&
    def.move === 'impact' &&
    def.moveFrame >= moveOf(def.char, 'impact').startup
  ) {
    atk.state = 'hitstun';
    atk.hitstun = 20;
    def.state = 'hitstun';
    def.hitstun = 20;
    m.hitstop = Math.max(m.hitstop, 10);
    emit(m, { type: 'clash', side: atk.side, other: def.side, x, y, text: 'CLASH', seed: (m.rng + x) | 0 });
    return false;
  }

  // Universal brick armour, only against a foreign universe.
  if (
    def.char === 'brickhouse' &&
    isForeign(def.char, atk.char) &&
    def.armorStock > 0 &&
    def.state !== 'hitstun'
  ) {
    def.armorStock--;
    def.invuln = Math.max(def.invuln, 6);
    m.hitstop = Math.max(m.hitstop, 8);
    emit(m, { type: 'shield', side: def.side, x, y, text: 'PIXEL ARMOUR', seed: (m.rng + x) | 0 });
    return false;
  }

  // Drive Impact armour.
  if (def.state === 'attack' && def.move === 'impact') {
    const md = moveOf(def.char, 'impact');
    if (def.moveFrame >= md.startup && def.moveFrame < md.startup + md.active) {
      m.hitstop = Math.max(m.hitstop, 6);
      emit(m, { type: 'shield', side: def.side, x, y, text: 'ARMOUR', seed: (m.rng + x) | 0 });
      return false;
    }
  }

  // Signature armour: a light bounces off for half damage, a heavy breaks it (Crack).
  let armorBroke = false;
  if (def.state === 'attack' && def.move && def.move !== 'impact') {
    const dm = moveOf(def.char, def.move);
    if (dm.armor && def.moveFrame < dm.startup + dm.active) {
      if (opts.kind === 'light' || opts.kind === 'air' || opts.kind === 'projectile') {
        def.hp = Math.max(0, def.hp - Math.max(1, Math.round(opts.damage / 2)));
        m.hitstop = Math.max(m.hitstop, 6);
        emit(m, { type: 'shield', side: def.side, x, y, text: 'ARMOUR', seed: (m.rng + x) | 0 });
        if (def.hp <= 0) koFighter(m, def, atk, opts.name);
        return false;
      }
      armorBroke = true;
    }
  }

  let damage = opts.damage;
  if (opts.ex) damage *= 1.32;
  if (atk.modern) damage *= 0.9;
  if (m.mods.damage) damage *= m.mods.damage / 100;
  const charge = opts.charge ?? 0;
  if (charge > 0) damage *= 1 + (charge / CHARGE_MAX) * 0.55;
  if (m.gearBuffs) damage *= atk.buff.damage;
  if (atk.char === 'kestrel' && isForeign(atk.char, def.char) && !atk.grounded) damage *= 1.12;
  if (atk.char === 'oyelaran' && opts.kind === 'projectile' && isForeign(atk.char, def.char)) damage *= 1.15;
  if (atk.state === 'super' && atk.ex) damage *= 1.2;
  damage = Math.max(1, Math.round(damage));

  const lethal = def.hp - damage <= 0;
  const tier = Math.max(opts.tier ?? 0, armorBroke ? 1 : 0, tierFor(m, atk, def, moveOf(atk.char, opts.key || 'nLight'), opts)) as ImpactTier;

  // What this hit looked like, for the finisher conditions and the rival memory.
  def.last = {
    key: opts.key,
    charge: (opts.charge ?? 0) >= CHARGE_MAX,
    ranged: opts.kind === 'projectile',
    trap: opts.kind === 'trap',
    parry: atk.perfectParry > 0,
    air: !def.grounded,
    burnout: def.burnout > 0,
    confused: def.confuse > 0,
  };
  if (atk.char === 'null' && opts.kind === 'super') m.uiCorrupt = 300;

  def.hp = Math.max(0, def.hp - damage);
  m.stats.damage[atk.side] += damage;
  m.stats.hits[atk.side]++;
  m.stats.moveHits[atk.side][opts.name] = (m.stats.moveHits[atk.side][opts.name] ?? 0) + 1;

  const tally = m.combo[atk.side];
  if (m.tick - tally.lastTick <= 58) {
    tally.hits++;
    tally.damage += damage;
  } else {
    tally.hits = 1;
    tally.damage = damage;
  }
  tally.lastTick = m.tick;
  tally.move = opts.name;
  tally.max = Math.max(tally.max, tally.hits);
  m.stats.maxCombo[atk.side] = Math.max(m.stats.maxCombo[atk.side], tally.hits);
  m.combo[def.side].hits = 0;

  def.lastHitBy = atk.side;
  def.lastHitMove = opts.name;
  def.flash = 8;
  def.airDodged = false;

  // An opponent who was mid-move loses it unless they had armour.
  if (def.state !== 'super') {
    def.state = 'hitstun';
    def.move = null;
    def.charging = false;
  }

  const lost = def.hpMax - def.hp;
  const exScale = opts.ex ? 1.16 : 1;
  const kb = (opts.baseKb + opts.growthKb * (lost / 10)) * exScale;
  const hitstun = Math.round(clamp(8 + kb * 1.9, 8, 110) * (def.burnout > 0 ? 1.2 : 1) * def.buff.guard);
  def.hitstun = Math.round(hitstun);
  def.state = 'hitstun';
  def.stateTicks = 0;
  def.vx = fcos(rad(opts.angle)) * kb * 0.92 * atk.facing;
  if (kb >= 5.3 || opts.angle < -20 || !def.grounded) {
    def.grounded = false;
    def.vy = -fsin(rad(opts.angle)) * kb * 0.92;
    if (def.vy > 0 && opts.angle < 0) def.vy = Math.min(def.vy, 15);
  } else {
    def.vx *= 0.68;
    def.vy = 0;
  }

  atk.vx -= atk.facing * Math.min(2.2, kb * 0.08);
  atk.chaseWindow = 28;
  atk.combo = tally.hits;
  atk.comboTimer = 58;

  // Null's passive steals half a pip every fourth hit.
  if (atk.char === 'null' && isForeign(atk.char, def.char)) {
    atk.passives.steal = (atk.passives.steal ?? 0) + 1;
    if (atk.passives.steal % 4 === 0) {
      const steal = Math.min(0.5, def.drive);
      def.drive -= steal;
      atk.drive = Math.min(DRIVE_MAX, atk.drive + steal);
      emit(m, { type: 'shield', side: atk.side, x: def.x, y: def.y - 100, text: 'PACKET STOLEN', seed: (m.rng + x) | 0 });
    }
  }

  const hitstop = opts.kind === 'super' ? 14 : opts.kind === 'sig' ? 8 : 4;
  m.hitstop = Math.max(m.hitstop, hitstop);
  emit(m, {
    type: 'hit',
    side: atk.side,
    other: def.side,
    x,
    y,
    value: damage,
    angle: opts.angle,
    move: opts.name,
    tier,
    text: opts.name,
    char: atk.char,
    seed: (m.rng + x * 31 + y * 17) | 0,
  });
  emit(m, {
    type: 'blood',
    side: def.side,
    x,
    y,
    vx: atk.facing * (1 + rng(m) * 3),
    vy: -1 - rng(m) * 3,
    value: damage,
    seed: (m.rng + x) | 0,
  });

  if (lethal) {
    const fin = findFinisher(m, atk, def, opts);
    if (fin && def.stocks <= 1 && wouldEnd(m, def)) {
      startFinisher(m, atk, def, opts, fin);
    } else {
      koFighter(m, def, atk, opts.name);
    }
  }
  if (atk.perfectParry > 0) atk.perfectParry = 0;

  return true;
}

/* ------------------------------------------------------------- finishers -- */

function conditionMet(fin: FinisherDef, m: MatchState, atk: Fighter, def: Fighter, opts: HitOpts): boolean {
  switch (fin.condition.kind) {
    case 'lastStock':
      return def.stocks <= 1;
    case 'fullCharge':
      return (opts.charge ?? 0) >= CHARGE_MAX;
    case 'burnout':
      return def.burnout > 0;
    case 'airborne':
      return !atk.grounded;
    case 'ranged':
      return opts.kind === 'projectile';
    case 'parry':
      return atk.perfectParry > 0;
    case 'lowHp':
      return atk.hp <= atk.hpMax * 0.25;
    default:
      return false;
  }
}

function findFinisher(m: MatchState, atk: Fighter, def: Fighter, opts: HitOpts): FinisherDef | null {
  if (!opts.key) return null;
  const unlocked = Math.max(1, Math.min(3, m.unlocked[atk.side]));
  const list = charDef(atk.char).finishers.slice(0, unlocked);
  for (const fin of list) {
    if (fin.moveKey !== opts.key) continue;
    if (conditionMet(fin, m, atk, def, opts)) return fin;
  }
  // The Finisher Builder's custom panel fires on any signature kill.
  const custom = m.custom[atk.side];
  if (custom && (opts.key === 'nSig' || opts.key === 'sSig' || opts.key === 'dSig')) {
    return {
      id: 'custom',
      name: custom.name,
      moveKey: opts.key,
      condition: { kind: 'lastStock', label: 'Signature kill' },
      panel: `${custom.parts.opener} / ${custom.parts.beat} / ${custom.parts.punchline}`,
      kind: 'custom',
    };
  }
  return null;
}

function startFinisher(m: MatchState, atk: Fighter, def: Fighter, opts: HitOpts, fin: FinisherDef): void {
  def.hp = 0;
  def.stocks = 0;
  def.state = 'ko';
  def.vx = atk.facing * 4;
  def.vy = -3;
  m.winner = atk.side;
  m.phase = 'finisher';
  const custom = fin.kind === 'custom' ? m.custom[atk.side] : null;
  const duration = custom ? customFinisherTicks(custom) + 20 : 240;
  m.phaseTicks = duration;
  m.hitstop = 0;
  m.stats.finisher = true;
  atk.state = 'idle';
  atk.move = null;
  atk.charging = false;
  atk.vx = 0;
  m.finisher = {
    winner: atk.side,
    loser: def.side,
    name: fin.name,
    move: opts.name,
    panel: fin.panel,
    char: atk.char,
    loserChar: def.char,
    condition: fin.condition.label,
    ticks: 0,
    kind: fin.kind,
    parts: custom ? { ...custom.parts } : null,
    duration,
    skipped: false,
    x: def.x,
    y: def.y,
  };
  emit(m, {
    type: 'finisher',
    side: atk.side,
    other: def.side,
    x: def.x,
    y: def.y - 90,
    text: fin.name,
    sub: fin.panel,
    move: opts.name,
    tier: 3,
    seed: (m.rng + 9999) | 0,
  });
}

/* ------------------------------------------------------------------- KO -- */

function koFighter(m: MatchState, def: Fighter, atk: Fighter | null, move: string): void {
  if (m.training) {
    def.hp = def.hpMax;
    def.state = 'hitstun';
    def.hitstun = 20;
    emit(m, { type: 'announce', text: 'DUMMY RESET', sub: 'Training dummy restored', side: def.side });
    return;
  }
  if (def.stocks <= 0 || m.phase === 'ko' || m.phase === 'finisher') return;
  def.stocks = Math.max(0, def.stocks - 1);
  def.state = 'ko';
  def.stateTicks = 0;
  def.hitstun = 0;
  def.charging = false;
  def.move = null;
  def.invuln = 0;
  if (def.hp <= 0) def.hp = 0;
  m.phase = 'ko';
  m.phaseTicks = 82;
  m.hitstop = 0;
  const alive = aliveTeams(m);
  const ends = alive.length <= 1;
  emit(m, {
    type: 'ko',
    side: def.side,
    other: atk?.side,
    x: def.x,
    y: def.y - 80,
    text: move,
    tier: ends ? 3 : 0,
    seed: (m.rng + def.x) | 0,
  });
  if (ends) {
    m.winner = alive[0] ?? (atk ? atk.team : -1);
    m.phaseTicks = 96;
  }
}

function ringOut(m: MatchState, f: Fighter): void {
  if (m.training) {
    f.x = m.fighters[0].x + 220;
    f.y = 300;
    f.vx = 0;
    f.vy = 0;
    f.state = 'respawn';
    return;
  }
  // A fighter already counted out keeps drifting during the KO freeze. Do not
  // charge them another stock for every tick they are past the blast zone.
  if (f.stocks <= 0 || f.state === 'ko') return;
  f.stocks = Math.max(0, f.stocks - 1);
  f.state = 'ko';
  f.stateTicks = 0;
  f.charging = false;
  f.move = null;
  // Credit whoever hit them last, if that was a foe; else the nearest one.
  const hitter = f.lastHitBy >= 0 && m.fighters[f.lastHitBy]?.team !== f.team ? m.fighters[f.lastHitBy] : null;
  const other = hitter ?? nearestFoe(m, f);
  m.stats.ringouts[other.side]++;
  m.phase = 'ko';
  m.phaseTicks = 82;
  m.hitstop = 0;
  const alive = aliveTeams(m);
  if (alive.length <= 1) {
    m.winner = alive[0] ?? other.team;
    m.phaseTicks = 96;
  }
  emit(m, {
    type: 'ringout',
    side: f.side,
    other: other.side,
    x: clamp(f.x, 0, 1600),
    y: clamp(f.y, 0, 900),
    text: 'RING OUT',
    tier: 2,
    seed: (m.rng + f.x * 3) | 0,
  });
  emit(m, { type: 'scar', side: f.side, x: clamp(f.x, 0, 1600), y: 650, value: 2, seed: (m.rng + f.x) | 0 });
}

/* -------------------------------------------------------------- fighters -- */

function tryJump(m: MatchState, f: Fighter, input: InputFrame): boolean {
  if (!input.jumpPressed) return false;
  if (f.grounded && input.down) {
    const p = m.platforms[f.platform];
    if (p?.soft) {
      f.dropTicks = 12;
      f.grounded = false;
      f.platform = -1;
      f.y += 6;
      return true;
    }
  }
  if (f.grounded) {
    f.vy = -JUMP_SPEED;
    f.grounded = false;
    f.platform = -1;
    f.jumps = 1;
    f.state = 'jump';
    f.stateTicks = 0;
    emit(m, { type: 'dodge', side: f.side, x: f.x, y: f.y, text: 'JUMP', seed: (m.rng + f.x) | 0 });
    return true;
  }
  if (f.jumps > 0) {
    f.vy = -AIR_JUMP_SPEED;
    f.jumps--;
    f.state = 'jump';
    f.stateTicks = 0;
    f.airDodged = false;
    return true;
  }
  return false;
}

function tryDodge(m: MatchState, f: Fighter, input: InputFrame): boolean {
  if (f.dodgeCooldown > 0) return false;
  if (!f.grounded && f.airDodged) return false;
  const x = dirX(input, f);
  const y = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const spot = x === 0 && y === 0;
  const chase = f.chaseWindow > 0;
  f.state = 'dodge';
  f.stateTicks = 0;
  f.invuln = Math.max(f.invuln, spot ? 18 : 12);
  f.dodgeCooldown = chase ? 28 : DODGE_COOLDOWN;
  if (!f.grounded) {
    f.airDodged = true;
    f.gcWindow = 24;
  }
  if (spot) {
    f.vx = 0;
    if (!f.grounded) f.vy = 0;
  } else {
    const len = hyp(x, y) || 1;
    const speed = chase ? 13.5 : f.grounded ? 11.5 : 10.2;
    f.vx = (x / len) * speed;
    f.vy = (y / len) * speed * (f.grounded ? 0 : 1.2);
    if (f.grounded) f.vy = 0;
  }
  m.stats.dodgeAttempts[f.side]++;
  if (chase) {
    f.chaseWindow = 0;
    f.drive = Math.min(DRIVE_MAX, f.drive + 0.5);
    emit(m, { type: 'chase', side: f.side, x: f.x, y: f.y, text: 'CHASE DODGE', seed: (m.rng + f.x) | 0 });
  } else {
    emit(m, { type: 'dodge', side: f.side, x: f.x, y: f.y, text: spot ? 'SPOT DODGE' : 'DODGE', seed: (m.rng + f.x) | 0 });
  }
  return true;
}

function tryParry(m: MatchState, f: Fighter, input: InputFrame): boolean {
  const pressed =
    (input.dodgePressed && input.heavy) ||
    (input.heavyPressed && input.dodge);
  if (!pressed) return false;
  if (f.burnout > 0) return false;
  if (!spendDrive(m, f, 1)) return false;
  f.state = 'parry';
  f.stateTicks = 0;
  f.parryTicks = 0;
  f.vx *= 0.2;
  if (!f.grounded) f.vy = Math.min(f.vy, 0);
  emit(m, { type: 'parry', side: f.side, x: f.x, y: f.y, text: 'PARRY', seed: (m.rng + f.x) | 0 });
  return true;
}

function tryImpact(m: MatchState, f: Fighter, input: InputFrame): boolean {
  if (!(input.light && input.heavy)) return false;
  if (f.burnout > 0) return false;
  if (!spendDrive(m, f, 1)) return false;
  startMove(m, f, 'impact', false, false);
  return true;
}

function trySuper(m: MatchState, f: Fighter): boolean {
  if (!canSpendForSuper(f)) return false;
  const comeback = f.superFree && f.drive < 2;
  if (f.superFree && !f.comebackUsed) {
    f.comebackUsed = true;
    f.superFree = false;
    f.ex = true;
  } else {
    if (!spendDrive(m, f, 2)) return false;
    f.ex = false;
  }
  startMove(m, f, 'super', f.ex, false);
  f.invuln = 24;
  m.stats.supers[f.side]++;
  m.dramatic = 38;
  m.dramaticSide = f.side;
  m.dramaticText = charDef(f.char).superName;
  m.dramaticSub = comeback ? 'COMEBACK SUPER  /  ONCE PER MATCH' : 'SUPER  /  TWO PIPS';
  emit(m, {
    type: comeback ? 'comeback' : 'super',
    side: f.side,
    x: f.x,
    y: f.y,
    text: charDef(f.char).superName,
    tier: 3,
    char: f.char,
    seed: (m.rng + 1234) | 0,
  });
  return true;
}

function tryThrowOrPickup(m: MatchState, f: Fighter): boolean {
  // Already holding a stage item: throw it.
  if (f.state === 'idle' || f.state === 'run' || f.state === 'jump' || f.state === 'fall') {
    const held = m.items.find((i) => i.heldBy === f.side);
    if (held) {
      held.heldBy = -1;
      held.thrower = f.side;
      held.vx = f.facing * 13.5;
      held.vy = -3.4;
      held.life = 900;
      held.spin = 1;
      emit(m, { type: 'throw', side: f.side, x: f.x, y: f.y - 90, text: 'THROW', seed: (m.rng + f.x) | 0 });
      return true;
    }
    // Pick up a nearby item.
    for (const item of m.items) {
      if (item.heldBy !== -1) continue;
      if (Math.abs(item.x - f.x) < 62 && Math.abs(item.y - (f.y - 20)) < 90) {
        item.heldBy = f.side;
        item.vx = 0;
        item.vy = 0;
        emit(m, { type: 'pickup', side: f.side, x: item.x, y: item.y, text: item.kind, seed: (m.rng + item.x) | 0 });
        return true;
      }
    }
    // Universal grab if a foe is close and grounded.
    for (const o of foesOf(m, f)) {
      if (
        o.stocks > 0 && o.state !== 'hitstun' && o.state !== 'ko' && o.state !== 'grabbed' && o.invuln <= 0 &&
        Math.abs(o.x - f.x) < 80 && Math.abs(o.y - f.y) < 100
      ) {
        f.state = 'grab';
        f.stateTicks = 0;
        f.move = 'throw';
        f.grabTarget = o.side;
        o.state = 'grabbed';
        o.hitstun = 0;
        o.vx = 0;
        o.vy = 0;
        f.vx = 0;
        emit(m, { type: 'throw', side: f.side, other: o.side, x: (f.x + o.x) / 2, y: f.y - 80, text: 'GRAB', seed: (m.rng + f.x) | 0 });
        return true;
      }
    }
  }
  return false;
}

function tryAttack(m: MatchState, f: Fighter, input: InputFrame, heavy: boolean): boolean {
  const x = dirX(input, f);
  const air = !f.grounded;
  if (x !== 0) f.facing = x > 0 ? 1 : -1;
  else faceOpponent(m, f);

  if (heavy && air && f.gcWindow > 0) {
    // Gravity cancel: air dodge, then a ground signature in the air.
    const key: MoveKey = input.down ? 'dSig' : x !== 0 ? 'sSig' : 'nSig';
    const ex = input.drive && !f.burnout && f.drive >= 1;
    if (ex && !spendDrive(m, f, 1)) return false;
    f.gcWindow = 0;
    f.airDodged = false;
    startMove(m, f, key, ex, true);
    emit(m, { type: 'gc', side: f.side, x: f.x, y: f.y, text: 'GRAVITY CANCEL', seed: (m.rng + f.x) | 0 });
    return true;
  }

  if (heavy) {
    const key = chooseHeavy(input, f);
    const md = moveOf(f.char, key);
    let ex = false;
    if (md.chargeable && input.drive && f.burnout <= 0 && f.drive >= 1) {
      if (spendDrive(m, f, 1)) ex = true;
    }
    startMove(m, f, key, ex, !!md.chargeable);
    return true;
  }

  const key = chooseLight(input, f);
  startMove(m, f, key, false, false);
  return true;
}

function startAttackIfAny(m: MatchState, f: Fighter, input: InputFrame): boolean {
  if (input.superPressed && trySuper(m, f)) return true;
  if (tryImpact(m, f, input)) return true;
  if (tryParry(m, f, input)) return true;
  if (input.throwPressed && tryThrowOrPickup(m, f)) return true;
  if (input.heavyPressed && tryAttack(m, f, input, true)) return true;
  if (input.lightPressed && tryAttack(m, f, input, false)) return true;
  if (input.jumpPressed && tryJump(m, f, input)) return true;
  if (input.dodgePressed && tryDodge(m, f, input)) return true;
  return false;
}

function updateNeutral(m: MatchState, f: Fighter, input: InputFrame): void {
  const x = dirX(input, f);
  if (f.state === 'land') {
    if (f.stateTicks >= 3) {
      f.state = 'idle';
      f.stateTicks = 0;
    }
  }

  if (startAttackIfAny(m, f, input)) return;

  if (f.state === 'idle' || f.state === 'run' || f.state === 'jump' || f.state === 'fall' || f.state === 'land') {
    if (x !== 0) {
      f.vx += x * (f.grounded ? GROUND_ACCEL : AIR_ACCEL);
      const cap = f.grounded ? RUN_SPEED : AIR_SPEED;
      f.vx = clamp(f.vx, -cap, cap);
      f.facing = x > 0 ? 1 : -1;
    } else if (f.grounded) {
      f.vx *= 0.8;
    } else {
      f.vx *= AIR_DRAG;
    }

    if (!f.grounded && input.down && f.vy > 0) f.vy = Math.max(f.vy, FAST_FALL);

    if (f.grounded) f.state = Math.abs(f.vx) > 0.35 ? 'run' : 'idle';
    else f.state = f.vy < 0 ? 'jump' : 'fall';

    if (f.state === 'idle' && input.down) f.stateTicks = 0;
  } else if (f.grounded) {
    f.vx *= 0.8;
  }
  f.stateTicks++;
}

function updateAttack(m: MatchState, f: Fighter, input: InputFrame): void {
  if (!f.move) {
    f.state = f.grounded ? 'idle' : 'fall';
    return;
  }
  const md = moveOf(f.char, f.move);

  // Chase dodge cancels a hit attack. That's the Brawlhalla pressure valve.
  if (f.chaseWindow > 0 && input.dodgePressed && tryDodge(m, f, input)) return;

  // Light strings: a light that has connected can be cancelled into another
  // light. The gap before recovery ends is the dodge-read window.
  if (md.kind === 'light' && f.moveHit && (input.lightPressed || (f.modern && input.light))) {
    // Modern layout auto-strings: holding light keeps the same direction going.
    const key = f.modern && !input.lightPressed ? f.move : chooseLight(input, f);
    startMove(m, f, key, false, false);
    return;
  }

  if (f.charging) {
    f.charge = Math.min(CHARGE_MAX, f.charge + 1);
    if (f.moveFrame < md.startup - 1) {
      f.moveFrame++;
    } else if (input.heavy) {
      f.moveFrame = md.startup - 1;
    } else {
      f.charging = false;
      f.moveFrame = md.startup;
    }
  } else {
    f.moveFrame++;
  }

  const activeStart = md.startup;
  const activeEnd = md.startup + md.active;

  if (f.moveFrame === activeStart && md.effect && !md.chargeable) {
    runMoveEffect(m, f, md, false);
  }
  if (f.moveFrame === activeStart && md.effect === 'slam') {
    runMoveEffect(m, f, md, false);
  }

  if (f.moveFrame >= activeStart && f.moveFrame < activeEnd) {
    const box = hitboxOf(f, md);
    // One connection per foe per move; a multi-hit move re-arms on its own clock.
    for (const other of foesOf(m, f)) {
      const bit = 1 << other.side;
      const canHit = !(f.hitMask & bit) || (md.multi !== undefined && f.hitCooldown <= 0);
      if (!canHit) continue;
      const hb = hurtbox(other);
      if (!overlap(box, hb)) continue;
      const x = (box.x + box.w / 2 + other.x) / 2;
      const y = (box.y + box.h / 2 + other.y - 70) / 2;
      if (applyHit(m, f, other, {
        damage: md.damage,
        angle: md.angle,
        baseKb: md.baseKb,
        growthKb: md.growthKb,
        name: md.name,
        key: md.key,
        kind: md.kind,
        charge: f.charge,
        ex: f.ex,
        source: 'melee',
      }, x, y)) {
        f.moveHit = true;
        f.moveHits++;
        f.hitMask |= bit;
        f.hitCooldown = md.multi ?? 999;
        f.stateTicks = 0;
      }
      if (m.phase !== 'fight') break;
    }
  }
  if (f.hitCooldown > 0) f.hitCooldown--;

  // Projectiles and traps are created on the first active tick.
  if (f.moveFrame === activeStart && md.projectile) {
    const spec = md.projectile;
    const count = spec.count ?? 1;
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * (spec.spread ?? 0);
      const vx = f.facing * spec.speed * fcos(spread);
      const vy = (spec.vy ?? 0) + fsin(spread) * spec.speed;
      const proj = spawnProjectile(
        m,
        f,
        f.char,
        f.side,
        spec.kind,
        f.x + f.facing * 44,
        f.y - 80,
        vx,
        vy,
        spec.gravity ?? 0,
        spec.life,
        spec.radius,
        spec.damage,
        spec.angle,
        spec.baseKb,
        spec.growthKb,
        md.key,
        spec.explode ?? 0,
      );
      proj.pierce = !!spec.pierce;
    }
  }

  // Some signatures drop a trap / mark on activation.
  if (
    (md.effect === 'sigil' || md.effect === 'pillar' || md.effect === 'egg' ||
      md.effect === 'turret' || md.effect === 'airstrike' || md.effect === 'swarm')
    && f.moveFrame === activeStart
  ) {
    runMoveEffect(m, f, md, false);
  }

  // Fire-and-forget hits that are not the main hitbox.
  if (f.moveFrame >= activeEnd + md.recovery) {
    f.state = f.grounded ? 'idle' : 'fall';
    f.stateTicks = 0;
    f.move = null;
    f.charging = false;
    f.ex = false;
  }

  // Gravity and light air drift apply even during a move.
  if (!f.grounded) {
    if (input.left || input.right) {
      const wish = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      f.vx += wish * 0.1;
      f.vx = clamp(f.vx, -AIR_SPEED, AIR_SPEED);
    }
  }
}

function updateDodge(m: MatchState, f: Fighter, input: InputFrame): void {
  f.stateTicks++;
  const air = !f.grounded;
  if (air && f.gcWindow > 0 && input.heavyPressed && f.stateTicks >= 4) {
    if (tryAttack(m, f, input, true)) return;
  }
  if (f.stateTicks >= 16) {
    f.state = f.grounded ? 'idle' : 'fall';
    f.stateTicks = 0;
    f.dodgeCooldown = Math.max(f.dodgeCooldown, 40);
    return;
  }
  if (air) {
    // air dodge direction was baked into velocity; drag it out
    f.vx *= 0.94;
    f.vy *= 0.94;
    if (input.down) f.vy += 0.2;
  } else {
    f.vx *= 0.88;
  }
}

function updateParry(m: MatchState, f: Fighter, input: InputFrame): void {
  f.parryTicks++;
  f.stateTicks++;
  if (f.parryTicks > 16) {
    f.state = f.grounded ? 'idle' : 'fall';
    f.stateTicks = 0;
    f.parryTicks = 0;
    return;
  }
  if (!f.grounded) f.vy = Math.min(f.vy + GRAVITY * 0.5, MAX_FALL);
  f.vx *= 0.8;
}

function updateHitstun(m: MatchState, f: Fighter, input: InputFrame): void {
  if (input.drivePressed && f.drive >= 2 && f.burnout <= 0 && f.hitstun > 6) {
    spendDrive(m, f, 2);
    f.hitstun = 0;
    f.state = 'idle';
    f.invuln = Math.max(f.invuln, 30);
    f.vx = 0;
    f.vy = -3;
    // The breaker shoves back every foe standing on top of you.
    let o = nearestFoe(m, f);
    for (const foe of foesOf(m, f)) {
      if (foe.stocks <= 0 || foe.state === 'ko' || Math.abs(foe.x - f.x) > 140 || Math.abs(foe.y - f.y) > 140) continue;
      foe.vx = (foe.x > f.x ? 1 : -1) * 5;
      foe.vy = -3;
      foe.state = 'hitstun';
      foe.hitstun = 16;
      foe.move = null;
      o = foe;
    }
    m.hitstop = Math.max(m.hitstop, 8);
    emit(m, { type: 'burst', side: f.side, other: o.side, x: f.x, y: f.y - 80, text: 'BREAKER', seed: (m.rng + f.x) | 0 });
    announce(m, 'BREAKER', 'Two pips. The combo is over.', f.side);
    return;
  }
  f.hitstun--;
  if (f.hitstun <= 0) {
    f.state = f.grounded ? 'idle' : 'fall';
    f.stateTicks = 0;
    if (f.grounded) f.vx *= 0.5;
  }
}

function updateGrab(m: MatchState, f: Fighter, input: InputFrame): void {
  const other = m.fighters[f.grabTarget] ?? nearestFoe(m, f);
  if (other.state !== 'grabbed') {
    // The hold broke (a teammate hit them, a KO): let go.
    f.state = f.grounded ? 'idle' : 'fall';
    f.stateTicks = 0;
    f.move = null;
    f.grabTarget = -1;
    return;
  }
  f.stateTicks++;
  const dir = dirX(input, f);
  if (dir !== 0) f.facing = dir > 0 ? 1 : -1;
  other.x = f.x + f.facing * 52;
  other.y = f.y;
  other.vx = 0;
  other.vy = 0;
  other.facing = f.facing === 1 ? -1 : 1;
  if (input.throwPressed || input.lightPressed || input.heavyPressed || f.stateTicks > 55) {
    const up = input.up;
    const down = input.down;
    const angle = up ? 78 : down ? -62 : 52;
    const dmg = up ? 8 : down ? 10 : 9;
    const fake: HitOpts = {
      damage: dmg,
      angle,
      baseKb: 5.6,
      growthKb: 0.75,
      name: 'Throw',
      key: 'throw',
      kind: 'throw',
    };
    other.state = 'hitstun';
    applyHit(m, f, other, fake, (f.x + other.x) / 2, f.y - 80);
    other.state = 'hitstun';
    other.hitstun = Math.max(other.hitstun, 20);
    f.state = f.grounded ? 'idle' : 'fall';
    f.stateTicks = 0;
    f.move = null;
    f.grabTarget = -1;
    emit(m, { type: 'throw', side: f.side, other: other.side, x: other.x, y: other.y - 80, text: 'THROW', seed: (m.rng + f.x) | 0 });
  }
}

function updateFighter(m: MatchState, f: Fighter, rawInput: InputFrame): void {
  f.px = f.x;
  f.py = f.y;
  const input = rawInput;
  const buff = f.buff;
  const other = nearestFoe(m, f);

  if (f.invuln > 0) f.invuln--;
  if (f.dodgeCooldown > 0) f.dodgeCooldown--;
  if (f.gcWindow > 0) f.gcWindow--;
  if (f.chaseWindow > 0) f.chaseWindow--;
  if (f.perfectParry > 0) f.perfectParry--;
  if (f.confuse > 0) f.confuse--;
  if (f.flash > 0) f.flash--;
  if (f.comboTimer > 0) f.comboTimer--;
  if (f.dropTicks > 0) f.dropTicks--;
  f.superFree = !f.comebackUsed && f.hp > 0 && f.hp <= f.hpMax * 0.25;
  if (f.burnout > 0) {
    f.burnout--;
    if (f.burnout === 0) announce(m, 'DRIVE ONLINE', 'Burnout over', f.side);
  } else if (f.state !== 'hitstun') {
    f.drive = Math.min(DRIVE_MAX, f.drive + 0.0028 * buff.drive);
  }

  // The Queen heals in the air, but only against a foreign universe.
  if (
    f.char === 'queen' && f.hp > 0 && f.hp < f.hpMax && !f.grounded &&
    isForeign(f.char, other.char) && m.tick % 90 === 0
  ) {
    f.hp = Math.min(f.hpMax, f.hp + 1);
  }

  if (f.state === 'grabbed') {
    return;
  }

  if (f.state === 'ko') {
    physics(m, f);
    return;
  }

  if (f.state === 'hitstun') {
    updateHitstun(m, f, input);
    physics(m, f);
    return;
  }

  if (f.state === 'grab') {
    updateGrab(m, f, input);
    physics(m, f);
    return;
  }

  if (f.state === 'dodge') {
    updateDodge(m, f, input);
    physics(m, f);
    return;
  }

  if (f.state === 'parry') {
    updateParry(m, f, input);
    physics(m, f);
    return;
  }

  if (f.state === 'attack' || f.state === 'super') {
    updateAttack(m, f, input);
    physics(m, f);
    return;
  }

  if (f.state === 'respawn') {
    physics(m, f);
    if (f.grounded) f.state = 'idle';
    return;
  }

  // Idle / run / jump / fall / land.
  updateNeutral(m, f, input);
  const stateNow: string = f.state;
  if (stateNow !== 'attack' && stateNow !== 'super' && stateNow !== 'dodge' && stateNow !== 'parry' && stateNow !== 'grab') {
    physics(m, f);
  }

  if (f.stateTicks > 600) f.stateTicks = 0;
}

/* ------------------------------------------------------------- entities -- */

function explode(
  m: MatchState,
  owner: number,
  char: CharId,
  x: number,
  y: number,
  radius: number,
  damage: number,
  angle: number,
  baseKb: number,
  growthKb: number,
  key: MoveKey | null,
  name: string,
): void {
  const atk = m.fighters[owner];
  emit(m, {
    type: 'impact',
    side: owner,
    x,
    y,
    value: radius,
    tier: 1,
    text: name,
    seed: (m.rng + x * 7 + y) | 0,
  });
  for (const def of foesOf(m, atk)) {
    const d = hyp(def.x - x, (def.y - 70) - y);
    if (d > radius + 24) continue;
    applyHit(m, atk, def, {
      damage,
      angle,
      baseKb,
      growthKb,
      name,
      key,
      kind: 'trap',
      source: 'trap',
      char,
    }, x, y);
    if (m.phase !== 'fight') break;
  }
}

function updateProjectiles(m: MatchState): void {
  for (const p of m.projectiles) {
    p.px = p.x;
    p.py = p.y;
    if (p.life <= 0) continue;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.gravity;
    p.life--;
    if (p.kind === 'shockwave') p.vy = 0;

    const atk = m.fighters[p.owner];
    const box = { x: p.x - p.radius, y: p.y - p.radius, w: p.radius * 2, h: p.radius * 2 };
    let def: Fighter | null = null;
    if (!p.hit) {
      for (const o of foesOf(m, atk)) {
        if (o.state !== 'ko' && o.stocks > 0 && overlap(box, hurtbox(o))) {
          def = o;
          break;
        }
      }
    }
    if (def) {
      p.hit = true;
      if (p.explode > 0) {
        explode(m, p.owner, p.char, p.x, p.y, p.explode, p.damage, p.angle, p.baseKb, p.growthKb, p.source as MoveKey, p.kind.toUpperCase());
        p.life = 0;
      } else {
        applyHit(m, atk, def, {
          damage: p.damage,
          angle: p.angle,
          baseKb: p.baseKb,
          growthKb: p.growthKb,
          name: p.kind === 'shockwave' ? 'Shockwave' : p.kind.toUpperCase(),
          key: (p.source as MoveKey) || null,
          kind: 'projectile',
          source: 'projectile',
          char: p.char,
        }, p.x, p.y);
        if (!p.pierce) p.life = 0;
      }
    }

    // Ground / platform collision.
    if (p.y > 650 || p.y < -200) {
      if (p.explode > 0) {
        explode(m, p.owner, p.char, p.x, Math.min(p.y, 650), p.explode, p.damage, p.angle, p.baseKb, p.growthKb, p.source as MoveKey, p.kind.toUpperCase());
      }
      p.life = 0;
    }
  }
  m.projectiles = m.projectiles.filter((p) => p.life > 0);
}

function updateTraps(m: MatchState): void {
  for (const t of m.traps) {
    t.px = t.x;
    t.py = t.y;
    if (t.life > 0) t.life--;
    if (t.arm > 0) {
      t.arm--;
      continue;
    }
    const atk = m.fighters[t.owner];
    const def = nearestFoe(m, atk);
    if (t.life <= 0) continue;
    const dx = def.x - t.x;
    const dy = (def.y - 70) - t.y;
    const near = hyp(dx, dy) < t.radius + 30;
    if (t.kind === 'sigil' && near) {
      explode(m, t.owner, t.char, t.x, t.y, t.radius, t.damage, 76, t.baseKb, t.growthKb, 'nSig', 'HOLY SIGIL');
      t.life = 0;
    } else if (t.kind === 'egg' && near) {
      applyHit(m, atk, def, {
        damage: t.damage, angle: 84, baseKb: 5.8, growthKb: 0.9,
        name: 'HATCHING', key: 'dSig', kind: 'trap', source: 'trap', char: t.char,
      }, t.x, t.y - 40);
      emit(m, { type: 'spawn', side: t.owner, x: t.x, y: t.y, text: 'HATCH', seed: (m.rng + t.x) | 0 });
      t.life = 0;
    } else if (t.kind === 'turret') {
      t.meta--;
      if (t.meta <= 0) {
        const dir = def.x >= t.x ? 1 : -1;
        spawnProjectile(m, atk, t.char, t.owner, 'crankshot', t.x, t.y - 80, dir * 8.5, 0, 0, 60, 10, 6, 24, 3.1, 0.35, 'nSig', 0);
        const fast = t.char === 'pip' && isForeign(t.char, def.char);
        t.meta = fast ? 22 : 44;
        emit(m, { type: 'item', side: t.owner, x: t.x, y: t.y - 80, text: 'CRANK', seed: (m.rng + t.x) | 0 });
      }
    } else if (t.kind === 'pillar') {
      t.meta--;
      if (t.meta <= 0) {
        if (Math.abs(dx) < t.radius + 8) {
          applyHit(m, atk, def, {
            damage: t.damage, angle: t.angle, baseKb: t.baseKb, growthKb: t.growthKb,
            name: 'PILLAR OF LIGHT', key: 'dSig', kind: 'trap', source: 'trap', char: t.char,
          }, t.x, t.y);
          t.life = 0;
        }
        t.meta = 10;
      }
    } else if (t.kind === 'airstrike') {
      explode(m, t.owner, t.char, t.x, t.y - 30, t.radius, t.damage, t.angle, t.baseKb, t.growthKb, 'super', 'AIRSTRIKE');
      t.life = 0;
    } else if (t.kind === 'breach') {
      explode(m, t.owner, t.char, t.x, t.y, t.radius, t.damage, t.angle, t.baseKb, t.growthKb, 'sSig', 'BREACH');
      t.life = 0;
    }
  }
  m.traps = m.traps.filter((t) => t.life > 0);
}

function updateItems(m: MatchState): void {
  for (const item of m.items) {
    item.px = item.x;
    item.py = item.y;
    if (item.heldBy >= 0) {
      const f = m.fighters[item.heldBy];
      item.x = f.x + f.facing * 38;
      item.y = f.y - 82;
      item.vx = 0;
      item.vy = 0;
      item.grounded = false;
      continue;
    }
    if (item.grounded) {
      item.life--;
      if (item.life <= 0) continue;
      continue;
    }
    item.x += item.vx;
    item.y += item.vy;
    item.vy += 0.55;
    item.vx *= 0.995;
    item.spin += 0.2;
    if (item.y >= 650) {
      item.y = 650;
      item.vy = 0;
      item.vx = 0;
      item.grounded = true;
      item.spin = 0;
      emit(m, { type: 'land', side: 0, x: item.x, y: item.y, text: 'ITEM', seed: (m.rng + item.x) | 0 });
      continue;
    }
    const speed = hyp(item.vx, item.vy);
    if (speed > 4) {
      for (const f of m.fighters) {
        if (f.state === 'ko' || f.stocks <= 0) continue;
        const thrower = item.thrower >= 0 ? item.thrower : (item.x < 800 ? 0 : 1);
        const atk = m.fighters[thrower] ?? m.fighters[0];
        if (atk.team === f.team) continue;
        if (overlap({ x: item.x - 22, y: item.y - 22, w: 44, h: 44 }, hurtbox(f))) {
          applyHit(m, atk, f, {
            damage: 10,
            angle: 40,
            baseKb: 6.2,
            growthKb: 0.8,
            name: 'THROWN ' + item.kind.toUpperCase(),
            key: 'throw',
            kind: 'item',
          }, item.x, item.y);
          item.vx *= -0.2;
          item.vy = -3;
          item.thrower = -1;
          break;
        }
      }
    }
  }
  m.items = m.items.filter((i) => i.life > 0 || i.heldBy >= 0);
  if (m.items.length === 0 && m.tick % 600 === 0 && m.tick > 0) {
    const stage = stageById(m.stageId);
    spawnItem(m, itemKindFor(stage.theme), 780 + rng(m) * 120, 640);
  }
}

/* ------------------------------------------------------------- match flow -- */

function respawn(m: MatchState, f: Fighter): void {
  const stage = stageById(m.stageId);
  const spawn = stage.spawns[f.side] ?? stage.spawns[f.side % 2];
  f.x = spawn.x;
  f.y = spawn.y;
  f.vx = 0;
  f.vy = 0;
  f.hp = f.hpMax;
  f.state = 'respawn';
  f.stateTicks = 0;
  f.invuln = 150;
  f.jumps = 2;
  f.airDodged = false;
  f.drive = Math.max(f.drive, 3);
  f.burnout = 0;
  f.move = null;
  f.charging = false;
  f.hitstun = 0;
  f.grounded = false;
  f.platform = -1;
  f.chaseWindow = 0;
  f.gcWindow = 0;
  f.confuse = 0;
  emit(m, { type: 'spawn', side: f.side, x: f.x, y: f.y, text: 'RESPAWN', seed: (m.rng + f.side * 77) | 0 });
}

function teamLabel(m: MatchState, team: number): string {
  const names = m.fighters.filter((f) => f.team === team).map((f) => charDef(f.char).name);
  return names.join(' & ');
}

function endOfKoPhase(m: MatchState): void {
  if (m.winner >= 0 && m.timer <= 0) {
    m.phase = 'over';
    m.phaseTicks = 0;
    return;
  }
  const alive = aliveTeams(m);
  if (alive.length <= 1) {
    // Everyone out at once (a double ring-out) goes to the healthier team.
    m.winner = alive.length === 1 ? alive[0] : leadingTeam(m);
    m.phase = 'over';
    m.phaseTicks = 0;
    if (m.winner >= 0) announce(m, 'K.O.', `${teamLabel(m, m.winner)} wins`, anyOnTeam(m, m.winner).side);
    return;
  }
  for (const f of m.fighters) if (f.state === 'ko' && f.stocks > 0) respawn(m, f);
  m.phase = 'fight';
  m.phaseTicks = 0;
}

function timeOver(m: MatchState): void {
  m.winner = leadingTeam(m);
  m.phase = 'ko';
  m.phaseTicks = 100;
  const winner = m.winner;
  announce(
    m,
    'TIME',
    winner >= 0 ? `${teamLabel(m, winner)} wins the clock` : 'Draw',
    winner === -1 ? -1 : anyOnTeam(m, winner).side,
  );
}

function updatePlatforms(m: MatchState): void {
  for (const p of m.platforms) {
    if (p.off && p.off > 0) p.off--;
    if (p.off === 0) p.off = undefined;
  }
}

export function drainEvents(m: MatchState): MatchEvent[] {
  const events = m.events;
  m.events = [];
  return events;
}

/** One tick. Inputs are per side, in fighter order; a missing one is neutral. */
export function stepMatch(m: MatchState, first: InputFrame | InputFrame[], second?: InputFrame, ...rest: InputFrame[]): MatchState {
  const inputs: InputFrame[] = Array.isArray(first) ? first : [first, second ?? emptyInput(), ...rest];
  const inputFor = (side: number): InputFrame => inputs[side] ?? emptyInput();
  if (m.phase === 'over') return m;
  for (const f of m.fighters) {
    f.px = f.x;
    f.py = f.y;
  }
  m.tick++;

  if (m.phase === 'finisher') {
    m.phaseTicks--;
    const fin = m.finisher;
    if (fin) {
      fin.ticks++;
      // The loser can skip the cinematic after half a second. Their choice, not the winner's.
      const li = inputFor(fin.loser);
      const pressed = li.lightPressed || li.heavyPressed || li.jumpPressed || li.dodgePressed || li.throwPressed || li.superPressed;
      if (fin.ticks > 30 && pressed && !fin.skipped) {
        fin.skipped = true;
        m.phaseTicks = Math.min(m.phaseTicks, 1);
      }
    }
    if (m.phaseTicks <= 0) {
      m.phase = 'over';
      if (fin) m.winner = m.fighters[fin.winner].team;
    }
    return m;
  }
  if (m.uiCorrupt > 0) m.uiCorrupt--;

  if (m.dramatic > 0) {
    m.dramatic--;
    if (m.dramatic === 0 && m.phase === 'fight') {
      // The super's active frames begin as soon as the flash clears.
    }
    return m;
  }

  if (m.hitstop > 0) {
    m.hitstop--;
    return m;
  }

  updatePlatforms(m);

  if (m.phase === 'intro') {
    m.phaseTicks--;
    for (const f of m.fighters) {
      updateFighter(m, f, emptyInput());
    }
    updateItems(m);
    if (m.phaseTicks <= 0) {
      m.phase = 'fight';
      m.introTicks = 0;
      announce(m, 'CLASH', 'No blocking. No timeouts on the clock.', -1);
    }
    return m;
  }

  if (m.phase === 'ko') {
    m.phaseTicks--;
    for (const f of m.fighters) {
      if (f.state === 'ko') physics(m, f);
      else if (f.state !== 'grabbed') updateFighter(m, f, emptyInput());
    }
    updateProjectiles(m);
    updateTraps(m);
    updateItems(m);
    if (m.phaseTicks <= 0) endOfKoPhase(m);
    return m;
  }

  if (m.phase !== 'fight') return m;

  if (!m.training) {
    m.timer--;
    if (m.timer <= 0) {
      timeOver(m);
      return m;
    }
  }

  // Sides act in order. Trades are allowed: a later update can still connect
  // during an earlier fighter's active frames.
  for (const f of m.fighters) {
    if (m.phase !== 'fight') break;
    const raw = inputFor(f.side);
    const input = f.confuse > 0 ? { ...raw, left: raw.right, right: raw.left } : raw;
    updateFighter(m, f, input);
  }
  updateProjectiles(m);
  updateTraps(m);
  updateItems(m);

  for (const tally of m.combo) {
    if (m.tick - tally.lastTick > 60) {
      tally.hits = 0;
      tally.damage = 0;
    }
  }

  return m;
}

/* --------------------------------------------------------------- helpers -- */

export function fighterById(m: MatchState, side: number): Fighter {
  return m.fighters[side];
}

export function isInvulnerable(f: Fighter): boolean {
  return f.invuln > 0 || f.state === 'respawn';
}

export function moveFor(f: Fighter): MoveDef | null {
  return f.move ? moveOf(f.char, f.move) : null;
}

export function drivePips(f: Fighter): number {
  return Math.floor(f.drive + 0.00001);
}

export function syncFighterGear(f: Fighter, look: GearLook): void {
  f.gear = look;
}

export function matchDuration(m: MatchState): number {
  return m.tick;
}

export const ALL_CHARS = CHARACTERS;
export { hurtbox as hurtboxOf, hitboxOf, CHARGE_MAX };
