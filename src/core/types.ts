/**
 * Core data types. GameState is a single plain serialisable object; all
 * simulation lives in pure-ish functions in src/sim operating on it.
 */

export const METER_KEYS = ['fans', 'fighters', 'media', 'commission', 'network', 'sponsors'] as const;
export type MeterKey = (typeof METER_KEYS)[number];
export type Meters = Record<MeterKey, number>;

export type Difficulty = 'easy' | 'normal' | 'fightweek' | 'ironman';
export type GameMode = 'career' | 'sandbox';

// ---------------------------------------------------------------- fighters

export interface Skills {
  striking: number;
  power: number;
  wrestling: number;
  grappling: number;
  cardio: number;
  chin: number;
  fightIQ: number;
  durability: number;
  heart: number; // resilience: fights through injuries instead of quitting on the stool
  weightCut: number; // difficulty of making weight (higher = harder)
}
export const SKILL_KEYS: (keyof Skills)[] = [
  'striking', 'power', 'wrestling', 'grappling', 'cardio', 'chin', 'fightIQ', 'durability', 'heart', 'weightCut',
];

export interface Look {
  head: number; // 0..3 head shape
  skin: number; // SKIN_TONES index
  hair: number; // 0 = bald, 1..7 styles
  hairColor: number; // HAIR_COLORS index
  beard: number; // 0..4
  brows: number; // 0..2
  eyes: number; // 0..2
  nose: number; // 0 straight, 1 wide, 2 broken
  ears: number; // base cauliflower 0..3
  scar: number; // 0..3
  tattoo: number; // 0..3
  build: number; // 0 lean, 1 average, 2 heavy
  glasses?: number; // 0 none, 1 dark shades, 2 nerd frames
}

export interface Contract {
  boutsLeft: number;
  purse: number; // show money per bout
  winBonus: number;
  champClause: boolean;
  exclusive: boolean;
  signedWeek: number;
}

export type LegalStatus = 'free' | 'arrested' | 'bail' | 'probation' | 'suspended' | 'banned' | 'jailed';
export type FighterStatus = 'active' | 'free-agent' | 'retired' | 'prospect';

export interface Injury {
  name: string;
  until: number; // week
}

export interface Fighter {
  id: string;
  first: string;
  last: string;
  nick: string;
  gender: 'M' | 'W';
  age: number;
  hometown: string;
  country: string;
  languages: string[];
  beliefs: string;
  height: number; // cm
  reach: number; // cm
  stance: 'Orthodox' | 'Southpaw' | 'Switch';
  gym: string;
  coach: string;
  manager: string; // manager id (data/roster/managers.json) or free text
  division: string;
  skills: Skills;
  styles: string[];
  traits: string[];
  family: { spouse: string | null; kids: number; parents: string };
  finances: { debt: number; spending: 'frugal' | 'normal' | 'lavish' };
  vices: string[];
  business: string[];
  social: { followers: number; style: string };
  legalRecord: string[];
  skeletons: string[];
  backstory: string; // backstory template id
  bio?: string; // authored bio (overrides generated)
  look: Look;
  marquee?: { archetype: string; arc: string };
  parody?: string; // real-life counterpart being parodied (never cast in criminal/doping/abuse storylets)
  anim?: FighterAnim; // fight-view animation style & signature moves
  legend?: boolean;
  record: { w: number; l: number; d: number; nc: number };

  // ---- dynamic (filled in at new game when absent)
  status: FighterStatus;
  promotion: string | null; // 'us' | rival id | null
  streak: number; // +wins / -losses
  koLosses: number;
  morale: number;
  loyalty: number;
  hype: number;
  starPower: number;
  damage: number; // accumulated career damage 0..100
  injuries: Injury[];
  medSuspUntil: number;
  contract: Contract | null;
  legal: LegalStatus;
  legalUntil: number;
  rivals: string[];
  friends: string[];
  beefReporters: string[];
  beefWithYou: number;
  storyHistory: Record<string, number>;
  lastFightWeek: number;
  careerLog: string[];
  titleDefenses: number;
  retiredWeek?: number;
  hallOfFame?: boolean;
  weightMisses: number;
  h2h?: Record<string, number>; // completed fights against each opponent id
  modded?: boolean;
  // ---- careers & scouting
  potential: number; // ceiling for skill growth (40..99)
  primeAge: number; // age at which the fighter peaks (26..33)
  scout: number; // scouting level 0..3 — how accurately we see skills/traits
  hiddenTraits: string[]; // traits revealed only by scouting or incidents
  addiction: number; // 0..100 severity of current vice spiral
  moneyIQ: number; // 0..100 — can this person be trusted with a purse?
  streaming: boolean; // has a live stream channel (source of drama)
  contractDemand?: number; // asking purse when negotiating
  cutman: { name: string; rating: number }; // corner cutman 0..100 — drives healing & cut stoppages
  wounds: Wounds; // visible post-fight damage (portraits & interviews)
}

export interface FighterAnim {
  stance: 'bouncy' | 'crouch' | 'upright' | 'handsLow' | 'wrestler' | 'karate' | 'brawler' | 'sway';
  signature: string[]; // e.g. 'spinningElbow', 'obliqueKick', 'showtimeKick', 'flyingKnee', 'shoulderShimmy'
  walkout?: string; // walkout flavour line
  celebration?: string; // e.g. 'backflip', 'billyWalk', 'strut', 'prays', 'gunShow'
}

export interface Wounds {
  cuts: number; // 0..3 open cuts (eyebrow/cheek)
  blackEye: number; // 0..2
  swelling: number; // 0..3 facial swelling
  bandages: number; // 0..3 bandaids / butterfly strips / gauze
  noseBleed: boolean;
}

// ---------------------------------------------------------------- events

export type Method = 'KO' | 'TKO' | 'SUB' | 'DEC' | 'DRAW' | 'DQ' | 'NC' | 'DOC';

export interface TickerLine {
  round: number;
  t: number; // seconds into round
  text: string;
  side: 0 | 1 | -1; // who acted (-1 neutral)
  intensity: number; // 0..3 crowd noise
  act: string; // animation cue for the mini arena (jab, kick, shoot, gnp, sub, kd, ko, ...)
  pos: 'stand' | 'clinch' | 'atop' | 'btop'; // position after the action
  hp: [number, number];
  key?: string; // template key that produced the line (drives commentary)
  speaker?: string; // commentary booth line (lon, blow, dc, braille, biscuit)
}

export interface CornerReport {
  round: number; // after this round
  side: 0 | 1;
  coach: string;
  cutman: string;
  hp: number;
  cut: number;
  injury: string | null;
  quit: boolean;
  scoreGuess: string; // what the corner thinks the scorecards say
}

export interface FightResult {
  winner: string | null;
  loser: string | null;
  method: Method;
  detail: string;
  round: number;
  time: string;
  scores: [number, number][]; // per judge totals (a, b)
  judges: string[];
  referee: string;
  robbery: boolean;
  fotn: number; // fight quality 0..100
  damage: [number, number];
  ticker?: TickerLine[];
  stats: { strikes: [number, number]; takedowns: [number, number]; knockdowns: [number, number] };
  injuries: { fighter: string; name: string; weeks: number }[]; // in-fight injuries (broken limbs etc.)
  fouls: { fighter: string; text: string; penalized: boolean }[];
  pointDeductions: [number, number];
  corners?: CornerReport[];
  roundScores?: [number, number][][]; // [round][judge] = [a, b]
  cuts: [number, number];
}

export interface Bout {
  id: string;
  a: string;
  b: string;
  division: string;
  title: string | null; // belt id
  rounds: 3 | 5;
  position: number; // 0 = main event
  catchweight: boolean;
  shortNotice: boolean;
  status: 'scheduled' | 'done' | 'cancelled';
  purse: [number, number];
  finePct: number; // weight-miss fine applied to a / b side (pct of purse)
  missedBy: string | null;
  meeting?: number; // 1 = first fight between this pair, 2 = rematch (II), 3 = trilogy (III)...
  pulled?: string[]; // fighters pulled from this bout (missed weight) awaiting a replacement
  result?: FightResult;
  bonus?: string[]; // fighter ids that received performance bonuses
}

export interface EventFinancials {
  attendance: number;
  gate: number;
  ppvBuys: number;
  ppv: number;
  broadcast: number;
  sponsors: number;
  merch: number;
  purses: number;
  bonuses: number;
  venue: number;
  production: number;
}

export interface FightEvent {
  id: string;
  name: string;
  number: number | null; // numbered events
  week: number;
  venue: string;
  region: string;
  card: Bout[];
  status: 'scheduled' | 'done' | 'cancelled';
  ppv: boolean;
  fin?: EventFinancials;
  notes: string[];
}

export interface Belt {
  id: string;
  name: string;
  division: string | null;
  holder: string | null;
  interim: boolean;
  symbolic: boolean;
  createdWeek: number;
  defenses: number;
  design: { plate: number; strap: number; gem: number };
  history: { holder: string; week: number }[];
  retired?: boolean;
}

// ---------------------------------------------------------------- desk

export type DocType =
  | 'bout' | 'medical' | 'drug' | 'visa' | 'weighin' | 'sponsor'
  | 'police' | 'expense' | 'press' | 'memo' | 'letter' | 'bail';

export type Stamp = 'approve' | 'deny' | 'escalate' | 'bury';

export interface DocField {
  key: string; // 'doc.weight'
  label: string;
  value: string;
  kind?: 'text' | 'sig' | 'barcode' | 'photo';
}

export interface Violation {
  rule: string;
  a: string; // field key (doc.x / file.x / rule.x / cal.x)
  b: string;
  text: string; // explanation shown when found
}

export interface DeskDoc {
  id: string;
  type: DocType;
  title: string;
  subject: string | null; // fighter id
  fields: DocField[];
  refs: Record<string, string>; // snapshot of file-card / rule values relevant to the doc
  violations: Violation[];
  week: number;
  overdue: number; // how many weeks rolled over
  meta: Record<string, string | number | boolean | null>;
  storylet?: string; // instance id if spawned by a storylet
  fine?: string; // fine print
  /** desk inspection: typed claims + record values the rule checks read (src/sim/docs.ts) */
  facts?: Record<string, DocFact>;
}

export type DocFact = string | number | boolean | null | string[] | number[];

export interface Citation {
  week: number;
  reason: string;
  fine: number;
  warning: boolean;
}

export interface DeskState {
  queue: DeskDoc[];
  citations: Citation[];
  minutes: number; // minutes since 9:00 this desk day
  log: { week: number; docId: string; type: DocType; stamp: Stamp | 'expired'; correct: boolean; deliberate: boolean; caught?: boolean }[];
}

// ---------------------------------------------------------------- storylets

export type StoryCategory =
  | 'legal' | 'speech' | 'doping' | 'business' | 'president' | 'fightnight' | 'weird'
  | 'fighter' | 'media' | 'presser' | 'owner' | 'rival' | 'family' | 'venture' | 'legend' | 'commission' | 'misc';

export interface RoleDef {
  type: 'fighter' | 'anyFighter' | 'legend' | 'reporter' | 'outlet' | 'rival' | 'sponsor' | 'champ' | 'freeAgent';
  where?: string;
  prefer?: string; // numeric expression; higher = more likely
}

export type SceneType =
  | 'phone' | 'visit' | 'doc' | 'memo' | 'presser' | 'headline' | 'social' | 'bail' | 'boardroom' | 'fightnight' | 'narration';

export interface SceneDef {
  type: SceneType;
  speaker?: string;
  portrait?: string; // role name to draw
  title?: string;
  text: string;
}

export interface ChoiceDef {
  label: string;
  if?: string;
  effects?: string[];
  result?: string;
  tone?: 'deflect' | 'attack' | 'joke' | 'truth' | 'wwsh' | 'storm';
  bot?: number; // hint weight for bots (higher = greedy policy prefers)
  default?: boolean; // applied if the player ignores the storylet
  ethics?: number; // -2 shady .. +2 noble (used by bot policies & endings)
}

export interface StoryletDef {
  id: string;
  title: string;
  category: StoryCategory;
  weight?: number;
  cooldownWeeks?: number;
  oncePerCareer?: boolean;
  acts?: number[];
  chain?: string;
  followupOnly?: boolean;
  conditions?: string;
  roles?: Record<string, RoleDef>;
  vars?: Record<string, string>;
  scenes: SceneDef[];
  choices: ChoiceDef[];
  tags?: string[];
  file?: string; // source file (filled by loader)
}

export interface StoryletInstance {
  iid: string;
  id: string;
  week: number;
  roles: Record<string, string>;
  vars: Record<string, number | string>;
  source: 'random' | 'followup' | 'fightnight' | 'presser' | 'system';
  status: 'pending' | 'resolved' | 'expired';
  choice?: number;
  resultText?: string;
  eventId?: string;
}

export interface ScheduledStorylet {
  id: string;
  week: number;
  roles: Record<string, string>;
  vars: Record<string, number | string>;
}

export interface StoryletState {
  history: Record<string, { count: number; first: number; last: number }>;
  pending: StoryletInstance[];
  resolved: StoryletInstance[]; // recent only (capped)
  scheduled: ScheduledStorylet[];
  categoryLog: Record<string, number[]>; // weeks fired per category (recent)
  seq: number;
}

// ---------------------------------------------------------------- media

export interface Feud {
  a: string;
  b: string;
  heat: number; // 0..100
  lastPost: number; // week
  result?: { winner: string; loser: string; week: number };
}

export interface SocialPost {
  handle: string;
  name: string;
  text: string;
  likes: number;
  fighter?: string;
}

export interface NewsItem {
  week: number;
  tags: string[];
  vars: Record<string, string | number>;
  text?: string; // explicit headline
  weight: number;
  tone: number; // -1 bad for you .. +1 good
}

export interface Story {
  outlet: string;
  headline: string;
  body: string;
}

export interface Newspaper {
  week: number;
  outlet: string;
  lead: Story;
  stories: Story[];
  feed: SocialPost[];
  notices: string[]; // rule changes etc
}

export interface ReporterState {
  rel: number; // -100..100
  banned: boolean;
  memory: string[];
  scoops: number;
}

// ---------------------------------------------------------------- legal

export interface LegalCase {
  id: string;
  who: string; // fighter id or 'president'
  charge: string; // charge id
  week: number;
  bail: number;
  bailPaid: 'promotion' | 'personal' | 'none' | null;
  lawyer: 'public' | 'mid' | 'shark' | null;
  courtWeek: number;
  status: 'custody' | 'bail' | 'closed';
  outcome?: 'acquitted' | 'dropped' | 'plea' | 'probation' | 'jail';
  noTravel: boolean;
  monitor: boolean;
}

// ---------------------------------------------------------------- world

export interface RivalState {
  cash: number;
  strength: number;
  alive: boolean;
  mergedInto: string | null;
  relationship: number;
  lastEventWeek: number;
}

export interface SponsorDeal {
  sponsor: string;
  weekly: number;
  until: number;
  fighter: string | null; // exclusive per-fighter deal
}

export interface TvDeal {
  network: string;
  tier: number; // 1 cable .. 4 mega
  perEvent: number;
  until: number;
  ppv: boolean;
}

export interface CompetitorState {
  buzz: number; // 0..100 current audience momentum
  lastBuys: number; // last PPV buys / viewers (thousands)
  lastWeek: number;
}

export interface RatingsRow {
  id: string; // 'us' | rival id | competitor id
  name: string;
  sport: string;
  buys: number; // thousands of PPV buys or viewers
}

export interface LedgerWeek {
  week: number;
  income: Record<string, number>;
  expenses: Record<string, number>;
  personal: Record<string, number>;
  cash: number;
  wealth: number;
  valuation: number;
  meters: Meters;
}

export interface LogEntry {
  week: number;
  text: string;
  kind: string;
}

export interface Message {
  id: string;
  week: number;
  from: string;
  subject: string;
  body: string;
  read: boolean;
}

export interface Negotiation {
  id: string;
  fighter: string;
  kind: 'renewal' | 'signing' | 'holdout';
  ask: { purse: number; winBonus: number; bouts: number; champClause: boolean };
  offer: { purse: number; winBonus: number; bouts: number; champClause: boolean } | null;
  round: number; // counter-offer rounds used
  patience: number; // fighter's patience 0..3 before walking
  rivalBid: string | null; // rival promotion bidding for the fighter
  rivalPurse: number;
  week: number;
  expires: number;
}

export interface SandboxOptions {
  scenario: 'tiny' | 'midtier' | 'giant' | 'strike';
  startCash: number;
  scandalFreq: number; // 0..2 multiplier
  chaos: number; // starting chaos
  simRealism: number; // 0..1 (0 = wild)
  greed: number; // 0..2 fighter purse demands
  mediaHostility: number; // 0..2
  strictness: number; // 0..2
  rivalAggression: number; // 0..2
  noOwner: boolean;
  infinite: boolean;
  allLegends: boolean;
  realRoster?: boolean; // every real-fighter parody starts signed to you
  dreamMatches: boolean;
  godMode: boolean;
}

export interface GameState {
  version: number;
  seed: number;
  rng: number;
  mode: GameMode;
  difficulty: Difficulty;
  sandbox: SandboxOptions | null;
  week: number;
  act: number;
  phase: 'paper' | 'desk' | 'fightnight' | 'ledger' | 'ended';
  promotion: {
    name: string;
    cash: number;
    valuation: number;
    tv: TvDeal | null;
    sideVenture: string | null;
    debt: number;
    staff: number; // weekly staff cost
  };
  president: {
    name: string;
    wealth: number;
    lifestyle: number; // 0 modest .. 2 whale
    marriage: 'married' | 'separated' | 'divorced';
    kidsSchool: boolean;
    vegasDebt: number;
  };
  meters: Meters;
  hidden: { heat: number; patience: number; chaos: number };
  fighters: Record<string, Fighter>;
  belts: Record<string, Belt>;
  rankings: Record<string, string[]>;
  events: FightEvent[];
  eventSeq: number;
  numberedSeq: number;
  desk: DeskState;
  rules: { active: string[]; params: Record<string, number | string | string[]> };
  storylets: StoryletState;
  flags: Record<string, number | string | boolean>;
  media: {
    reporters: Record<string, ReporterState>;
    paper: Newspaper | null;
    news: NewsItem[]; // accumulated for next paper
    headlinesUsed: Record<string, number>;
  };
  legal: { cases: LegalCase[] };
  rivals: Record<string, RivalState>;
  /** fighter feuds: online beef between pairs, keyed 'idA|idB' (sorted) */
  feuds?: Record<string, Feud>;
  owner: {
    name: string;
    target: number;
    revenueQ: number;
    memos: number;
    audit: number;
    sold: boolean;
    results: { q: number; target: number; actual: number; met: boolean }[];
  };
  commissions: Record<string, number>; // mood
  market: {
    competitors: Record<string, CompetitorState>;
    chart: { week: number; rows: RatingsRow[] }[]; // recent PPV/TV ratings charts
    tvOffers: { network: string; perEvent: number; tier: number; weeks: number; ppv: boolean; expires: number }[];
  };
  negotiations: Negotiation[];
  venuesUnlocked: string[];
  sponsorDeals: SponsorDeal[];
  divisionsOpen: string[];
  ledger: LedgerWeek[];
  current: { income: Record<string, number>; expenses: Record<string, number>; personal: Record<string, number> };
  log: LogEntry[];
  inbox: Message[];
  stats: Record<string, number>;
  ending: string | null;
  endingWeek: number | null;
  /** career progression: clout, unlocks, the owner's check-ins, contender series, rank points (see src/sim/career.ts) */
  career?: CareerState;
}

// ---------------------------------------------------------------- career progression

/** One movement on the rankings wall (0 = champion, null = unranked). */
export interface RankMove {
  id: string;
  div: string;
  from: number | null;
  to: number | null;
}

export type ObjectiveKind =
  | 'sellout' | 'title_fight' | 'sign' | 'med_bills' | 'fans' | 'gate' | 'finish' | 'clean_desk'
  | 'contender_sign' | 'book_gift' | 'new_champ' | 'ppv_buys' | 'cash';

export interface OwnerObjective {
  id: string;
  kind: ObjectiveKind;
  text: string;
  target: number;
  fighter?: string;
  issued: number; // week
  due: number; // last week it can be met in
  progress: number;
  status: 'open' | 'met' | 'failed';
  reward: { clout: number; cash: number };
  reviewed?: boolean; // the owner has commented on the result at a check-in
}

export interface OwnerVisit {
  week: number;
  beat: string | null; // story beat id played at this visit
  lines: string[]; // what the owner says (greeting + verdicts + beat)
  results: string[]; // objective ids reviewed this visit
  objectives: string[]; // objective ids issued this visit
  gift: { fighter: string; kind: 'prospect' | 'nephew' | 'vet'; purse: number } | null;
  giftDone?: 'signed' | 'passed';
}

export interface CareerState {
  clout: number;
  tier: number;
  unlocks: string[];
  unlockQueue: string[]; // unlocked, waiting for their UNLOCKED moment in the UI
  owner: {
    person: string;
    nextVisit: number;
    visits: number;
    objectives: OwnerObjective[];
    visit: OwnerVisit | null; // pending check-in (shown on the morning paper)
    beats: string[];
    gifts: string[]; // fighters the owner handed you
    nephew: string | null;
    seq: number;
  };
  contender: {
    event: FightEvent | null; // this cycle's card (lives outside s.events)
    done: boolean;
    seasons: number; // cards run
    signed: string[];
    alumni: string[]; // everyone who has fought on it (losers can come back)
    winners: string[]; // last card's winners awaiting offers
  };
  rp: Record<string, number>; // ranking points
  wall: Record<string, string[]>; // last published wall per division: [champ, #1..#15]
  p4p: string[];
  moves: { week: number; event: string; list: RankMove[] };
  headlines: string[]; // recently used front-page template ids
  medBills: number; // doctor's bills this week (reset weekly)
  history: { week: number; text: string }[];
}
