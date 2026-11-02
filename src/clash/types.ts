/* UNIVERSE CLASH - shared types.
   The fight is plain data. No Pixi, no DOM, no clock: a match can be cloned,
   rolled back and replayed from a tick number. */

export const CHAR_IDS = [
  'kestrel',
  'mireille',
  'brickhouse',
  'halo',
  'pip',
  'oyelaran',
  'queen',
  'null',
] as const;

export type CharId = (typeof CHAR_IDS)[number];

export const UNIVERSE_IDS = [
  'capital',
  'oldink',
  'arcade',
  'chapel',
  'saturday',
  'blacksite',
  'hive',
  'glitch',
] as const;

export type UniverseId = (typeof UNIVERSE_IDS)[number];

export const SLOTS = ['head', 'torso', 'arms', 'legs', 'aura'] as const;
export type Slot = (typeof SLOTS)[number];

export const RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const;
export type Rarity = (typeof RARITIES)[number];

export const STAT_KEYS = ['strength', 'guard', 'drive', 'vigor'] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export interface GearStats {
  strength: number;
  guard: number;
  drive: number;
  vigor: number;
}

export interface GearItem {
  uid: string;
  char: CharId;
  slot: Slot;
  rarity: Rarity;
  name: string;
  level: number;
  stats: Partial<GearStats>;
  modifier?: string;
  visual: number;
}

export type GearLook = Partial<Record<Slot, GearItem>>;

export interface InputFrame {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  light: boolean;
  heavy: boolean;
  dodge: boolean;
  jump: boolean;
  throw: boolean;
  super: boolean;
  drive: boolean;
  lightPressed: boolean;
  heavyPressed: boolean;
  dodgePressed: boolean;
  jumpPressed: boolean;
  throwPressed: boolean;
  superPressed: boolean;
  drivePressed: boolean;
}

export function emptyInput(): InputFrame {
  return {
    left: false, right: false, up: false, down: false,
    light: false, heavy: false, dodge: false, jump: false,
    throw: false, super: false, drive: false,
    lightPressed: false, heavyPressed: false, dodgePressed: false,
    jumpPressed: false, throwPressed: false, superPressed: false, drivePressed: false,
  };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Platform extends Rect {
  id: string;
  soft: boolean;
  off?: number;
}

export type StageTheme =
  | 'rooftop'
  | 'scroll'
  | 'cabinet'
  | 'crypt'
  | 'soundstage'
  | 'hangar';

export interface StageDef {
  id: string;
  name: string;
  subtitle: string;
  theme: StageTheme;
  universe: UniverseId;
  platforms: Platform[];
  blast: { left: number; right: number; top: number; bottom: number };
  /** One spawn per side; a match with more fighters than spawns spaces the rest along the main slab. */
  spawns: { x: number; y: number }[];
  music: string;
}

/** How many fighters and who is on whose side. 1v1 is two teams of one. */
export type MatchFormat = '1v1' | '2v2' | 'ffa';

export function fighterCount(format: MatchFormat | undefined): number {
  return format === '2v2' || format === 'ffa' ? 4 : 2;
}

/** Team per side: 2v2 seats sides 0 and 2 together against 1 and 3. */
export function teamsFor(format: MatchFormat | undefined): number[] {
  if (format === '2v2') return [0, 1, 0, 1];
  if (format === 'ffa') return [0, 1, 2, 3];
  return [0, 1];
}

export type PoseName =
  | 'idle'
  | 'lift'
  | 'limp'
  | 'victory'
  | 'heave'
  | 'guard'
  | 'run'
  | 'jump'
  | 'fall'
  | 'crouch'
  | 'punch'
  | 'cross'
  | 'hook'
  | 'uppercut'
  | 'kick'
  | 'lowKick'
  | 'sweep'
  | 'slam'
  | 'dash'
  | 'cast'
  | 'shoot'
  | 'dive'
  | 'rise'
  | 'spin'
  | 'grab'
  | 'throw'
  | 'dodge'
  | 'parry'
  | 'hit'
  | 'hurt'
  | 'ko'
  | 'super'
  | 'taunt'
  | 'item'
  | 'pound';

export type MoveKey =
  | 'nLight'
  | 'sLight'
  | 'dLight'
  | 'nAir'
  | 'sAir'
  | 'dAir'
  | 'nSig'
  | 'sSig'
  | 'dSig'
  | 'recovery'
  | 'pound'
  | 'airSig'
  | 'super'
  | 'impact'
  | 'throw';

export type MoveKind = 'light' | 'sig' | 'air' | 'super' | 'impact' | 'throw';

export type MoveEffect =
  | 'none'
  | 'dash'
  | 'teleportBehind'
  | 'confuse'
  | 'deletePlatform'
  | 'sigil'
  | 'egg'
  | 'turret'
  | 'pillar'
  | 'breach'
  | 'airstrike'
  | 'swarm'
  | 'shockwave'
  | 'heal'
  | 'stealMeter'
  | 'pull'
  | 'armor'
  | 'launch'
  | 'slam'
  | 'crankShot'
  | 'wings'
  | 'shoot';

export interface ProjectileSpec {
  kind: string;
  speed: number;
  vy?: number;
  gravity?: number;
  life: number;
  radius: number;
  damage: number;
  angle: number;
  baseKb: number;
  growthKb: number;
  pierce?: boolean;
  explode?: number;
  count?: number;
  spread?: number;
  source?: string;
}

export interface MoveDef {
  key: MoveKey;
  name: string;
  kind: MoveKind;
  pose: PoseName;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  angle: number;
  baseKb: number;
  growthKb: number;
  hitbox: { x: number; y: number; w: number; h: number };
  motion?: { x: number; y: number };
  chargeable?: boolean;
  armor?: boolean;
  projectile?: ProjectileSpec;
  effect?: MoveEffect;
  onHit?: MoveEffect;
  multi?: number;
  cost?: number;
  tier?: 1 | 2 | 3;
  finisher?: boolean;
  desc: string;
}

export interface FinisherCondition {
  kind:
    | 'lastStock'
    | 'fullCharge'
    | 'burnout'
    | 'airborne'
    | 'ranged'
    | 'parry'
    | 'lowHp';
  label: string;
}

/* How the finisher cinematic plays out. The sim only stores the kind; the
   renderer owns the staging. 'custom' plays the Finisher Builder parts. */
export type FinisherKind =
  | 'floorpunch'
  | 'bloodname'
  | 'spriteburst'
  | 'shadowvanish'
  | 'paperflat'
  | 'headshot'
  | 'cocoon'
  | 'wireframe'
  | 'skyslam'
  | 'inkdrown'
  | 'crush'
  | 'split'
  | 'custom';

export interface FinisherDef {
  id: string;
  name: string;
  moveKey: MoveKey;
  condition: FinisherCondition;
  panel: string;
  kind: FinisherKind;
}

/* Finisher Builder: an opener, a beat and a punchline, each a fixed tick count. */
export interface CustomFinisher {
  name: string;
  parts: { opener: string; beat: string; punchline: string };
}

export const FINISHER_PART_TICKS: Record<string, number> = {
  lift: 60, drag: 60, hold: 60,
  punches: 120, slam: 120, stomp: 120, long: 200,
  panel: 60, zoom: 60, wipe: 60,
};

export function customFinisherTicks(c: CustomFinisher): number {
  return (FINISHER_PART_TICKS[c.parts.opener] ?? 60) + (FINISHER_PART_TICKS[c.parts.beat] ?? 120) + (FINISHER_PART_TICKS[c.parts.punchline] ?? 60);
}

/* The Break impact frame: a one-panel comic in the attacker's universe style. */
export interface BreakStyle {
  bg: string;
  ink: string;
  caption: string;
}

export interface CharArt {
  scale: number;
  bulk: number;
  head: number;
  skin: string;
  skinShade: string;
  primary: string;
  primaryShade: string;
  secondary: string;
  secondaryShade: string;
  accent: string;
  ink: string;
  hair: string;
  face: 'square' | 'long' | 'round' | 'mask' | 'helmet' | 'skull' | 'toon' | 'visor';
  cape?: boolean;
  wings?: boolean;
  halo?: boolean;
  tail?: boolean;
  extraArms?: boolean;
  glow?: string;
  pattern?: 'none' | 'pixel' | 'halftone' | 'sepia' | 'noir' | 'toon' | 'military' | 'organic' | 'glitch';
}

export interface CharDef {
  id: CharId;
  name: string;
  title: string;
  universe: UniverseId;
  universeName: string;
  universeShort: string;
  archetype: string;
  blurb: string;
  quote: string;
  art: CharArt;
  stats: { power: number; speed: number; weight: number; range: number; difficulty: number };
  passive: { name: string; desc: string };
  moves: Record<MoveKey, MoveDef>;
  finishers: FinisherDef[];
  superName: string;
  superDesc: string;
  gearLine: string;
  breakStyle: BreakStyle;
  /** Combo trials for the training room: sequences of move keys ('jump' and 'gc' are free). */
  trials: string[][];
  /** The one-line route the roster screen prints. */
  route: string;
  /** Story chapter opener. */
  story: string;
}

export type FighterState =
  | 'idle'
  | 'run'
  | 'jump'
  | 'fall'
  | 'land'
  | 'attack'
  | 'hitstun'
  | 'dodge'
  | 'parry'
  | 'grab'
  | 'grabbed'
  | 'ko'
  | 'respawn'
  | 'super'
  | 'victory';

export interface Fighter {
  /** Index into MatchState.fighters, and the input slot this fighter reads. */
  side: number;
  /** Fighters on the same team cannot hit each other. */
  team: number;
  char: CharId;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  platform: number;
  jumps: number;
  dropTicks: number;
  hpMax: number;
  hp: number;
  stocks: number;
  drive: number;
  burnout: number;
  superFree: boolean;
  comebackUsed: boolean;
  state: FighterState;
  stateTicks: number;
  move: MoveKey | null;
  moveFrame: number;
  moveHit: boolean;
  moveHits: number;
  hitCooldown: number;
  charge: number;
  charging: boolean;
  ex: boolean;
  attackDir: -1 | 0 | 1;
  hitstun: number;
  invuln: number;
  dodgeCooldown: number;
  airDodged: boolean;
  gcWindow: number;
  chaseWindow: number;
  combo: number;
  comboTimer: number;
  parryTicks: number;
  armorStock: number;
  confuse: number;
  lastHitBy: number;
  lastHitMove: string;
  /** Bit per side this move has already connected with (multi-target moves hit each foe once). */
  hitMask: number;
  /** Who this fighter is holding in a grab, or -1. */
  grabTarget: number;
  perfectParry: number;
  gear: GearLook;
  buff: { damage: number; guard: number; drive: number; hp: number };
  passives: Record<string, number>;
  landingLag: number;
  jumpHeld: boolean;
  throwHeld: number;
  flash: number;
  taunt: number;
  finalStand: boolean;
  /** SF6-style Modern layout: auto-string, auto-charge, -10% damage. */
  modern: boolean;
  /** What the last hit this fighter took looked like; finishers read it. */
  last: { key: MoveKey | null; charge: boolean; ranged: boolean; trap: boolean; parry: boolean; air: boolean; burnout: boolean; confused: boolean } | null;
}

export interface Projectile {
  id: number;
  owner: number;
  char: CharId;
  kind: string;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  radius: number;
  damage: number;
  angle: number;
  baseKb: number;
  growthKb: number;
  pierce: boolean;
  explode: number;
  source: string;
  hit: boolean;
}

export interface Trap {
  id: number;
  owner: number;
  char: CharId;
  kind: string;
  x: number;
  y: number;
  px: number;
  py: number;
  life: number;
  arm: number;
  radius: number;
  damage: number;
  angle: number;
  baseKb: number;
  growthKb: number;
  meta: number;
}

export interface WorldItem {
  id: number;
  kind: string;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  grounded: boolean;
  life: number;
  heldBy: number;
  thrower: number;
  spin: number;
}

export type ImpactTier = 0 | 1 | 2 | 3;

export type MatchPhase = 'intro' | 'fight' | 'ko' | 'finisher' | 'over';

export interface MatchEvent {
  type:
    | 'hit'
    | 'block'
    | 'parry'
    | 'perfect'
    | 'impact'
    | 'ko'
    | 'ringout'
    | 'dodge'
    | 'chase'
    | 'gc'
    | 'burnout'
    | 'burst'
    | 'super'
    | 'comeback'
    | 'announce'
    | 'land'
    | 'throw'
    | 'pickup'
    | 'item'
    | 'blood'
    | 'scar'
    | 'finisher'
    | 'shield'
    | 'clash'
    | 'spawn'
    | 'whiff';
  tick: number;
  side?: number;
  other?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  value?: number;
  text?: string;
  sub?: string;
  move?: string;
  tier?: ImpactTier;
  angle?: number;
  char?: CharId;
  color?: string;
  seed?: number;
}

export interface ComboTally {
  side: number;
  hits: number;
  damage: number;
  max: number;
  lastTick: number;
  move: string;
}

export interface FinisherState {
  /** Sides, not teams: the renderer poses these two fighters. */
  winner: number;
  loser: number;
  name: string;
  move: string;
  panel: string;
  char: CharId;
  loserChar: CharId;
  condition: string;
  ticks: number;
  kind: FinisherKind;
  parts: CustomFinisher['parts'] | null;
  /** Total length in ticks; the loser can skip once `ticks` passes 30. */
  duration: number;
  skipped: boolean;
  /** Where the loser was when it started, world space. */
  x: number;
  y: number;
}

/** Per-side tallies, indexed like MatchState.fighters. */
export interface MatchStats {
  damage: number[];
  hits: number[];
  maxCombo: number[];
  ringouts: number[];
  perfectParries: number[];
  driveSpent: number[];
  moveHits: Record<string, number>[];
  dodgeAttempts: number[];
  dodgeReads: number[];
  supers: number[];
  finisher: boolean;
}

export interface MatchConfig {
  stageId: string;
  mode: 'casual' | 'ranked' | 'training' | 'local';
  seed: number;
  stocks: number;
  timerTicks: number;
  gearBuffs: boolean;
  playerChar: CharId;
  cpuChar: CharId;
  cpuLevel: number;
  modern: boolean;
  gear: GearLook[];
  training: boolean;
  /** Modern layout for the second fighter (local 2P). */
  modern2?: boolean;
  /** How many of each fighter's three finishers are unlocked (1..3). */
  unlocked?: number[];
  /** Finisher Builder result per side; fires when a signature lands the final KO and no built-in matched. */
  custom?: (CustomFinisher | null)[];
  /** Rift Ladder modifiers. damage is a percentage (130 = x1.3). */
  mods?: { damage?: number };
  /** 2v2 and free-for-all seat four fighters: playerChar, cpuChar, then `chars[2..]`. */
  format?: MatchFormat;
  /** Every fighter in side order. When absent the match is playerChar vs cpuChar. */
  chars?: CharId[];
}

export interface MatchState {
  tick: number;
  phase: MatchPhase;
  phaseTicks: number;
  timer: number;
  introTicks: number;
  hitstop: number;
  dramatic: number;
  dramaticSide: number;
  dramaticText: string;
  dramaticSub: string;
  stageId: string;
  mode: MatchConfig['mode'];
  format: MatchFormat;
  platforms: Platform[];
  fighters: Fighter[];
  projectiles: Projectile[];
  traps: Trap[];
  items: WorldItem[];
  events: MatchEvent[];
  nextEntity: number;
  rng: number;
  stats: MatchStats;
  combo: ComboTally[];
  finisher: FinisherState | null;
  /** The winning team (a side in 1v1), or -1. */
  winner: number;
  slowmo: number;
  training: boolean;
  gearBuffs: boolean;
  seed: number;
  /** Null's super corrupts the HUD for this many ticks. */
  uiCorrupt: number;
  unlocked: number[];
  custom: (CustomFinisher | null)[];
  mods: { damage?: number };
}

export interface FrameEvent {
  tick: number;
  text: string;
  side: 0 | 1;
  move: string;
  startup: number;
  active: number;
  recovery: number;
  advantage: number;
  blocked: boolean;
}

export interface InputHistory {
  tick: number;
  side: number;
  input: string;
}
