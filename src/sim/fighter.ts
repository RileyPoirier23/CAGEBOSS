/**
 * FIGHTER MODE: you are one fighter (your own creation) in a league of every
 * parody fighter, seeded from the real rankings. Weekly loop:
 *
 *   week start: news, offers, controversy  ->  spend 3 action points
 *   (train / spar / work / rest / media / clinic / underground)  ->  END WEEK
 *   (staff wages, diet & weight drift, healing, PEDs, the rest of the league
 *   fights, rankings move)  ->  fight week: weigh-in, gameplan, fight
 *
 * Because the character is yours, the full controversy menu applies to you
 * (exes, arrests, PEDs). Parody fighters only ever appear in sporting beef.
 */
import type { Bout, FightEvent, Fighter, GameState, Skills } from '../core/types';
import { Rng } from '../core/rng';
import { content } from '../core/content';
import { createNewGame } from './newgame';
import { generateFighter } from './generate';
import { DIVISION_LIMITS, DIVISION_ORDER, divisionName } from './divisions';
import { fullName, overall, computeStarPower, healWeek } from './fighters';
import { computeRankings, rankOf, undisputed } from './rankings';
import { makeBout, runBout, applyBout } from './events';
import { heatUp, feudKey } from './feuds';
import type { GamePlan } from './fight';
import { money } from '../core/format';
import { sigOf } from './docs';
import { LOCAL_SPONSORS, REGIONAL_SPONSORS } from './sponsorship';
import type { FMMoment, StoryState, FMStats } from './fmstory';
import { gymWeek, gymTrainBonus } from './legacy';
import { SCRUM } from './onetonlines';
import { HAN, isBoss } from './cast';
import { pushMoment, signingMoment, storyPromote, storyWeek, storyOffers, storyResult, startStory, staffCheckin, interviewMoment, storyPurse, stats, isLegacy } from './fmstory';

export type BodyPart = 'head' | 'jaw' | 'body' | 'larm' | 'rarm' | 'lhand' | 'rhand' | 'legs';
export const BODY_PARTS: { id: BodyPart; name: string; effect: string }[] = [
  { id: 'head', name: 'Head', effect: 'Chin and durability. Every knockout takes a little off the top for good.' },
  { id: 'jaw', name: 'Jaw', effect: 'A cracked jaw turns a jab into a nap.' },
  { id: 'body', name: 'Body / ribs', effect: 'Cardio and breathing. Bad ribs = empty gas tank by round two.' },
  { id: 'larm', name: 'Left arm', effect: 'Lead-hand speed, frames and underhooks.' },
  { id: 'rarm', name: 'Right arm', effect: 'Rear-hand power and whizzers.' },
  { id: 'lhand', name: 'Left hand', effect: 'How much bite your left-handed punches have.' },
  { id: 'rhand', name: 'Right hand', effect: 'How much bite your right-handed punches have.' },
  { id: 'legs', name: 'Legs', effect: 'Footwork, kicks, takedown defence. Nobody respects a limp.' },
];

export type Archetype = 'striker' | 'wrestler' | 'grappler';

export interface FMOffer { opp: string; week: number; purse: number; win: number; rounds: 3 | 5; title: string | null; why: string; expires: number; /** amateur / regional belt on the line */ tierTitle?: boolean; /** a sponsor asked you to plug it (and who's on the cage) */ promoAsked?: boolean; sponsors?: string[]; /** you signed a doctored catchweight: he comes in heavy */ heavyOpp?: boolean;
  /** the weight you are contracted to make (a signed agreement is binding, even when it's wrong) */ limit?: number;
  /** signed away the gloves: bareknuckle rules */ bare?: boolean;
  /** signed a rehydration clause: weighed again on fight morning, no refuelling */ rehydro?: boolean }
export type Tier = 'amateur' | 'regional' | 'pfl' | 'of';
export const TIER_NAME: Record<Tier, string> = { amateur: 'Local circuit', regional: 'Regional promotion', pfl: "Professional Fighters' Lounge", of: 'CBFC' };
export const PFL_ID = 'pfl_ish';
/** One stop on the road to the CBFC. */
export interface Stage { tier: Tier; name: string; short: string; promo: string }
const LOCAL_NAMES: [string, string][] = [
  ['Basement Brawl Series', 'BBS'], ['Gas Station Fight League', 'GSFL'], ["Thursday Throwdown at Dave's Bar", 'TTDB'], ['Rec Centre Rumble', 'RCR'],
  ['Strip Mall Showdown', 'SMS'], ['Backyard Cage League', 'BCL'], ['Bingo Hall Brawl', 'BHB'], ['Parking Lot Prizefights', 'PLP'],
];
const REGIONAL_NAMES: [string, string][] = [
  ['Fury Fighting Championship', 'Fury FC'], ['Lionheart Combat', 'LHC'], ['Iron Cage Championship', 'ICC'], ['Cage Titans of Ohio', 'Cage Titans'],
  ['Rumble on the River', 'ROTR'], ['Northern Combat League', 'NCL'], ['Big Sky Fight Series', 'BSFS'], ['Gulf Coast Cage Wars', 'GCCW'],
  ['Desert Storm Fighting', 'DSF'], ['King of the Casino', 'KOTC'],
];

/** The road: a junk local promotion, one or two regional ones, the Lounge (PFL), then the CBFC. */
export function makeCircuit(rng: Rng): Stage[] {
  const [ln, ls] = rng.pick(LOCAL_NAMES);
  const regs = rng.sample(REGIONAL_NAMES, rng.int(1, 2));
  return [
    { tier: 'amateur', name: ln, short: ls, promo: 'fm_local' },
    ...regs.map(([n, sh], i) => ({ tier: 'regional' as Tier, name: n, short: sh, promo: 'fm_reg' + i })),
    { tier: 'pfl', name: "Professional Fighters' Lounge", short: 'PFL', promo: PFL_ID },
    { tier: 'of', name: 'Cage Boss Fighting Championship', short: 'CBFC', promo: 'us' },
  ];
}

export function stage(s: GameState): Stage {
  const st = fm(s);
  return st.circuit[Math.min(st.stage, st.circuit.length - 1)];
}
/** Bradie also owns the bareknuckle circuit. "It's for the culture, bro." */
export const BKB_NAME = "Bradie's Biggest Bird Bareknuckle";
export interface StaffCandidate { role: StaffId; name: string; tier: number; quirk: string; shady: boolean }
export interface DocField { label: string; value: string; bad?: boolean; kind?: 'text' | 'sig' }
export interface FMDoc {
  id: string;
  kind: 'bout' | 'statement' | 'medical' | 'sponsor' | 'ofdeal' | 'bkdeal';
  title: string;
  from: string;
  fields: DocField[];
  /** what it should match: your offer, your manager's contract, the opponent's file, the banned list */
  ref: { title: string; lines: DocField[] };
  fault: string | null;
  week: number;
  data?: Record<string, string | number>;
}
export interface FMChoice { label: string; id: string }
export interface FMEvent { id: string; title: string; text: string; choices: FMChoice[]; data?: Record<string, string | number>; /** 'npc:<key>' for a named character */ portrait?: string }

export interface FMState {
  player: string;
  archetype: Archetype;
  money: number;
  energy: number;
  morale: number;
  walkWeight: number;
  /** sparring points waiting to be put into skills */
  sparPoints?: number;
  ap: number;
  body: Record<BodyPart, number>;
  /** max head health: knockouts lower it permanently */
  headCap: number;
  staff: { coach: number; cutman: number; nutrition: number; manager: number };
  diet: 'clean' | 'balanced' | 'junk';
  ped: { on: boolean; weeks: number; caught: number };
  suspendedUntil: number;
  fight: (FMOffer & { eventId: string }) | null;
  offers: FMOffer[];
  plan: GamePlan;
  roundPlans: Record<number, GamePlan>;
  cornerAid: Record<number, number>;
  log: { week: number; text: string; tone?: number }[];
  feed: { week: number; handle: string; text: string }[];
  pending: FMEvent[];
  undergroundOpen: boolean;
  retired: boolean;
  history: { week: number; opp: string; result: 'W' | 'L' | 'D'; method: string; round: number; pro?: boolean; promo?: string; title?: boolean }[];
  /** amateur record, frozen the day you turn pro (the pro record starts at 0-0) */
  amateur?: { w: number; l: number; d: number; nc: number } | null;
  turnedPro?: number;
  /** the career file: arrests, charges, failed tests, suspensions, missed weight, bad contracts */
  rap?: RapEntry[];
  /** what the press wrote about you */
  press?: { week: number; outlet: string; headline: string }[];
  /** things the hub shows between weeks: signings, check-ins, story beats, interviews */
  moments?: FMMoment[];
  /** Legacy Mode: no storyline, more chaos */
  legacy?: boolean;
  story?: StoryState;
  stats?: FMStats;
  weekReport: string[] | null;
  partied: number;
  /** sketchy supplement in your system */
  taint: number;
  missedWeight: boolean;
  tier: Tier;
  /** the promotions you climb through, and where you are on that road */
  circuit: Stage[];
  stage: number;
  /** ids on the current tier's ladder, [0] = champion (amateur / regional / PFL; your division) */
  ladder: string[];
  /** the rest of the current promotion's roster: division -> ranked ids, [0] = champion */
  rosters: Record<string, string[]>;
  bk: { ladder: string[]; w: number; l: number; champ: boolean; signed?: boolean };
  /** Only Fighters account (Bradie's subscription site) */
  ofa: { joined: boolean; subs: number; posted: boolean; asked: boolean };
  /** weird clauses you signed without reading: of_split, of_likeness, of_quota, bk_credits, bk_dale */
  clauses: string[];
  staffNames: Record<StaffId, string>;
  shady: Partial<Record<StaffId, boolean>>;
  market: StaffCandidate[];
  marketWeek: number;
  partner: { name: string; stage: number; spars: number; leaking: boolean; fake: boolean } | null;
  /** the partner storyline has started (once per career) */
  flagsPartner?: boolean;
  inbox: FMDoc[];
  /** sauna water weight that comes back if you're not weighing in */
  water: number;
  /** tonight's opponent: caught with doctored medicals (fights compromised) */
  oppFlagged: boolean;
}

export const STAFF_ROLES = [
  { id: 'coach', name: 'Head coach', tiers: ['Your uncle', 'Local gym owner', 'Respected coach', 'Elite camp'], cost: [0, 250, 700, 1800], blurb: 'Training gains and better gameplan reads.' },
  { id: 'cutman', name: 'Cutman', tiers: ['Guy with a towel', 'Part-timer', 'Veteran cutman', 'Legendary cutman'], cost: [0, 150, 450, 1100], blurb: 'More time and wider sweet spots in the corner.' },
  { id: 'nutrition', name: 'Nutritionist', tiers: ['Google', 'Meal-prep bro', 'Sports dietitian', 'Performance lab'], cost: [0, 120, 400, 900], blurb: 'Easier weight cuts, faster recovery.' },
  { id: 'manager', name: 'Manager', tiers: ['Yourself', 'Hustler', 'Real agent', 'Power broker'], cost: [0, 0, 0, 0], blurb: 'Better offers and purses. Takes 10/15/20% of every purse.' },
] as const;
export type StaffId = 'coach' | 'cutman' | 'nutrition' | 'manager';

export const PLANS: { id: GamePlan; name: string; text: string }[] = [
  { id: 'balanced', name: 'BALANCED', text: 'Take what he gives you.' },
  { id: 'pressure', name: 'PRESSURE', text: 'Walk him down. Burns gas, breaks will.' },
  { id: 'counter', name: 'COUNTER', text: 'Make him miss, make him pay.' },
  { id: 'wrestle', name: 'WRESTLE', text: 'Shoot early, shoot often.' },
  { id: 'grind', name: 'GRIND', text: 'Take him down and lie on him. Win on control time.' },
  { id: 'legs', name: 'LEG KICKS', text: 'Chop the base. Make him limp to the stool.' },
  { id: 'subhunt', name: 'SUB HUNT', text: 'Get it to the mat and hunt the neck.' },
  { id: 'survive', name: 'SURVIVE', text: 'Hands up, move, get to the bell.' },
];

export type RapKind = 'ARREST' | 'CHARGE' | 'DOPING' | 'SUSPENSION' | 'WEIGHT' | 'CONTRACT';
export interface RapEntry { week: number; kind: RapKind; text: string }

export const fm = (s: GameState): FMState => s.fm!;

/** Something for the career file. */
export function rapSheet(s: GameState, kind: RapKind, text: string): void {
  const st = fm(s);
  (st.rap ??= []).push({ week: s.week, kind, text });
}

/** A headline about you (the press file). */
export function article(s: GameState, outlet: string, headline: string): void {
  const st = fm(s);
  (st.press ??= []).push({ week: s.week, outlet, headline });
  if (st.press.length > 80) st.press.splice(0, st.press.length - 80);
}
const OUTLETS: Record<string, string> = { '@MMAJunkie_ish': 'MMA Junkie-ish', '@cageside_carl': "Cageside Carl's Blog" };
export const me = (s: GameState): Fighter => s.fighters[fm(s).player];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const log = (s: GameState, text: string, tone = 0) => {
  fm(s).log.push({ week: s.week, text, tone });
  if (fm(s).log.length > 120) fm(s).log.splice(0, fm(s).log.length - 120);
};
const post = (s: GameState, handle: string, text: string) => {
  if (OUTLETS[handle]) article(s, OUTLETS[handle], text);
  fm(s).feed.push({ week: s.week, handle, text });
  if (fm(s).feed.length > 60) fm(s).feed.splice(0, fm(s).feed.length - 60);
};

// ---------------------------------------------------------------- Bradie

/**
 * Bradie "Biggest Bird" Taylor: retired legend, CEO of Only Fighters (the subscription
 * content site for fighters) and owner of the bareknuckle circuit. Curly white-guy afro,
 * permanently stoned, contracts full of very strange clauses.
 */
export const BRADIE = {
  id: 'bradie_taylor',
  name: 'Bradie "Biggest Bird" Taylor',
  short: 'Bradie',
  handle: '@biggestbird',
  title: 'CEO, Only Fighters',
  look: { head: 1, skin: 1, hair: 8, hairColor: 3, beard: 1, brows: 0, eyes: 2, nose: 2, ears: 2, scar: 1, tattoo: 0, build: 1, stoned: 1 },
};
const BRADIE_BLEETS = [
  "fights this weekend are gonna be so sick bro. like so sick. i just ate an entire pizza thinking about it",
  "people keep asking me about the rankings. bro the rankings are a construct. also {you} is ranked now i think",
  "retired legend tip: if you get hit in the face, dont. thats it. thats the tip",
  "just watched {you} train and dude. dude. DUDE.",
  "who keeps putting fighters in my office. its a nice office. please knock",
  "contracts are just friendship but with numbers. thats why i dont read them",
  "im not saying im the greatest of all time. other people are saying it. its me. im the other people",
  "the octagon has 8 sides. i counted. took a while",
  "{you} vs anybody. whenever. i love violence and also my dog",
  "only fighters creators made 4 million dollars this month. a lot of it was feet. fighter feet. respect the hustle",
  "reminder that only fighters is NOT that other website. we are a FIGHT content platform. mostly. 90%",
  "bareknuckle card this weekend in my backyard. bring a towel. not for the hot tub. for the blood. ok also the hot tub",
  "somebody asked if im high on the stream. bro im high on LIFE. and also other things",
  "my afro has its own manager now. negotiations are going well",
];
const BRADIE_POST_WIN = [
  "Bradie on his Only Fighters livestream, eyes like two cherries: \"Bro. BRO. {you} was cooking tonight. I was eating chips and I stood up. I never stand up.\"",
  "Bradie, squinting into his webcam: \"{you} is the future, man. The future is now. What time is it? Subscribe to {you}. Subscribe to me. Subscribe.\"",
  "Bradie, on his podcast: \"That finish was so sick I forgot what I was gonna say. {you}, bro, call me. I have a CONTRACT for you. It's mostly normal.\"",
  "Bradie, hair somehow bigger than last week: \"{you}? Love him. Love the vibe. Big vibe. Only Fighters vibe.\"",
];
const BRADIE_POST_LOSS = [
  "Bradie on his stream: \"{you} had a rough night, man. We've all been there. I was there in 2014. Still kind of there.\"",
  "Bradie, eating a burrito on camera: \"Tough loss for {you}. Kid's got heart though. And legs. Two of them. Post the legs, bro. Content.\"",
  "Bradie: \"Hey, losing builds character. I lost once and now I'm a CEO. Wait, how did that happen?\"",
];
export function bradieOnYou(s: GameState, won: boolean, rng: Rng): string {
  return rng.pick(won ? BRADIE_POST_WIN : BRADIE_POST_LOSS).replace(/\{you\}/g, me(s).last);
}

// ---------------------------------------------------------------- creation

export interface CreateOpts {
  seed: number;
  first: string;
  last: string;
  nick: string;
  gender: 'M' | 'W';
  culture: string;
  division: string;
  archetype: Archetype;
  look: Fighter['look'];
  /** Legacy Mode: no storyline, more chaos, start anywhere on the road */
  legacy?: boolean;
  /** Road To Champion: you are Han "The Pride Of The Maritimes" Tibular */
  han?: boolean;
  startTier?: Tier;
}

const ARCH_SKILLS: Record<Archetype, Partial<Skills>> = {
  striker: { striking: 58, power: 56, wrestling: 40, grappling: 38, cardio: 50, fightIQ: 48 },
  wrestler: { striking: 42, power: 48, wrestling: 60, grappling: 46, cardio: 56, fightIQ: 46 },
  grappler: { striking: 40, power: 42, wrestling: 48, grappling: 62, cardio: 50, fightIQ: 52 },
};
const ARCH_STYLES: Record<Archetype, string[]> = { striker: ['Kickboxer'], wrestler: ['Wrestler'], grappler: ['Sub Hunter'] };

export function createFighterGame(o: CreateOpts): GameState {
  const s = createNewGame({
    seed: o.seed, mode: 'sandbox', difficulty: 'normal', promotionName: 'Cage Boss Fighting Championship', presidentName: 'Dane Whyte',
    sandbox: { scenario: 'giant', startCash: 5_000_000, scandalFreq: 1, chaos: 20, simRealism: 1, greed: 1, mediaHostility: 1, strictness: 1, rivalAggression: 1, noOwner: true, infinite: true, allLegends: false, realRoster: true, dreamMatches: false, godMode: false },
  });
  s.mode = 'fighter';
  s.events = [];
  const rng = new Rng(s.rng);
  const f = generateFighter(rng, content().names, { division: o.division, gender: o.gender, tier: 'prospect', culture: o.culture, id: 'player' });
  f.first = o.first || f.first;
  f.last = o.last || f.last;
  f.nick = o.nick || f.nick;
  f.look = { ...o.look };
  f.age = 23;
  f.skills = { ...f.skills, ...ARCH_SKILLS[o.archetype], chin: 55, durability: 55, heart: 60, weightCut: 45 };
  f.potential = 92;
  f.styles = [...ARCH_STYLES[o.archetype]];
  f.traits = ['Hungry'];
  f.hiddenTraits = [];
  f.record = { w: 0, l: 0, d: 0, nc: 0 };
  f.streak = 0;
  f.status = 'active';
  f.promotion = 'fm_local'; // not in the CBFC rankings until you get there
  f.contract = { boutsLeft: 99, purse: 4000, winBonus: 4000, champClause: true, exclusive: true, signedWeek: 0 };
  f.hype = 10;
  f.scout = 3;
  f.lastFightWeek = -10;
  f.careerLog = ['Walked into an amateur gym with a dream and a gym bag that smells like soup.'];
  if (o.han) {
    Object.assign(f, { height: HAN.height, reach: HAN.reach, age: HAN.age, hometown: HAN.hometown, country: HAN.country, gym: "Ray's Boxing & Soup" });
    f.potential = 99;
    f.traits = ['Hungry', 'Family First'];
    f.careerLog = ["Twenty-one. Moncton born, Shediac summers, his uncle Ray's gym every day after school since he was nine. Everybody back home already calls him the Pride of the Maritimes. He hasn't had a single amateur fight."];
  }
  f.cutman = { name: 'Guy with a towel', rating: 25 };
  f.manager = '';
  f.starPower = computeStarPower(s, f);
  s.fighters[f.id] = f;
  if (!s.divisionsOpen.includes(f.division)) s.divisionsOpen.push(f.division);
  s.rng = rng.state;
  const limit = DIVISION_LIMITS[f.division] ?? 155;
  s.fm = {
    player: f.id, archetype: o.archetype, money: 2500, energy: 80, morale: 70, walkWeight: limit + 10, ap: 3,
    body: { head: 100, jaw: 100, body: 100, larm: 100, rarm: 100, lhand: 100, rhand: 100, legs: 100 }, headCap: 100,
    staff: { coach: 0, cutman: 0, nutrition: 0, manager: 0 }, diet: 'balanced',
    ped: { on: false, weeks: 0, caught: 0 }, suspendedUntil: 0,
    fight: null, offers: [], plan: 'balanced', roundPlans: {}, cornerAid: {},
    log: [], feed: [], pending: [], undergroundOpen: false, retired: false, history: [], weekReport: null, partied: 0, taint: 0, missedWeight: false,
    tier: 'amateur', circuit: makeCircuit(rng), stage: 0, ladder: [], rosters: {}, bk: { ladder: [], w: 0, l: 0, champ: false },
    staffNames: { coach: 'Uncle Ray', cutman: 'Some guy with a towel', nutrition: 'Google', manager: 'You' }, shady: {}, market: [], marketWeek: -99,
    partner: null, inbox: [], water: 0, oppFlagged: false,
    ofa: { joined: false, subs: 0, posted: false, asked: false }, clauses: [],
  };
  // the Lounge (PFL) has its own parody roster (Bellator's lot went with it when it got bought)
  for (const x of Object.values(s.fighters)) {
    const sw = (x as { startWith?: string }).startWith;
    if (x.parody && (sw === PFL_ID || sw === 'bellatrix' || x.parody === 'Francis Ngannou')) {
      x.promotion = PFL_ID;
      x.status = 'active';
    }
  }
  computeRankings(s);
  // any CBFC belt that went with them goes to the top contender left behind
  for (const b of Object.values(s.belts)) {
    if (!b.holder || !b.division || s.fighters[b.holder]?.promotion !== PFL_ID) continue;
    b.holder = (s.rankings[b.division] ?? []).find((id) => s.fighters[id]?.promotion === 'us') ?? null;
  }
  buildLadder(s, rng, 'amateur');
  refreshMarket(s, rng);
  computeRankings(s);
  if (o.legacy) {
    const st = fm(s);
    st.legacy = true;
    st.money = 10000;
    // start wherever you like: skip ahead through the road (no belts, no story)
    const want = o.startTier ?? 'amateur';
    const tmp: string[] = [];
    while (st.tier !== want && st.stage < st.circuit.length - 1) promote(s, rng, tmp);
    // one contract signing, for wherever you start: Xavier "Allstar" Cockett signs you first
    st.moments = [];
    (st as { xavier?: boolean }).xavier = false;
    pushMoment(s, signingMoment(s, rng));
    st.stats = undefined; // skipping ahead isn't winning belts
  } else {
    startStory(s, rng);
    pushMoment(s, signingMoment(s, rng));
    storyWeek(s);
  }
  log(s, `You signed with the ${stage(s).name}. Climb the ladder, win the belt, move up.${stage(s).tier === 'of' ? '' : ' The CBFC is a long way off.'}`);
  post(s, '@' + (f.last.toLowerCase()), 'First amateur fight coming up. Mom cried. I cried. The guy at the gas station cried. LETS GO');
  makeOffers(s, rng, true);
  return s;
}

/** Old saves: fill in anything added since. */
export function ensureFM(s: GameState): void {
  const st = s.fm;
  if (!st) return;
  st.tier ??= 'of';
  if (!st.circuit) {
    st.circuit = makeCircuit(new Rng(s.rng));
    st.stage = st.circuit.findIndex((x) => x.tier === st.tier);
    if (st.stage < 0) st.stage = st.circuit.length - 1;
  }
  st.ladder ??= [];
  st.rosters ??= {};
  st.bk ??= { ladder: [], w: 0, l: 0, champ: false };
  st.staffNames ??= { coach: STAFF_ROLES[0].tiers[st.staff.coach], cutman: STAFF_ROLES[1].tiers[st.staff.cutman], nutrition: STAFF_ROLES[2].tiers[st.staff.nutrition], manager: STAFF_ROLES[3].tiers[st.staff.manager] };
  st.shady ??= {};
  st.market ??= [];
  st.marketWeek ??= -99;
  st.partner ??= null;
  st.inbox ??= [];
  st.water ??= 0;
  st.oppFlagged ??= false;
  st.ofa ??= { joined: false, subs: 0, posted: false, asked: false };
  st.clauses ??= [];
}

// ---------------------------------------------------------------- tiers & ladders

const LADDER_SIZE: Record<'amateur' | 'regional' | 'pfl' | 'bk', number> = { amateur: 6, regional: 8, pfl: 10, bk: 8 };
const LADDER_OVR: Record<'amateur' | 'regional' | 'pfl' | 'bk', [number, number]> = { amateur: [40, 52], regional: [50, 63], pfl: [64, 76], bk: [46, 66] };

/**
 * Real-life order of the Lounge (PFL) parodies per division: champion first. Edit this list to
 * follow the real rankings; anyone not listed is ranked behind, by ability.
 */
export const PFL_ORDER: Record<string, string[]> = {
  heavy: ['francis_ngonnagetpaid', 'renan_ferreirah', 'denis_goldsov', 'ryan_badder'],
  lightheavy: ['vadim_nemcough', 'corey_andersun'],
  middle: ['johnny_eblenz', 'fabian_edwardz', 'impa_kasangabay'],
  welter: ['ray_cooper_threeish', 'mvp_paige', 'magomed_magomedkerimoof', 'cedric_doomby'],
  light: ['usman_nurmagomedoof', 'gadzhi_rabadanoof', 'clay_collards'],
  feather: ['patricio_freirepit', 'aj_mckeen', 'timur_khizrieff', 'jesus_pinedough', 'brendan_loughnaine'],
  bantam: ['patchy_remix', 'sergio_petis'],
  wfly: ['dakota_ditchvisa', 'liz_carmoosh', 'taila_santoss'],
  wbantam: ['cris_cyberborg', 'larissa_pachecko'],
};

/** A local fighter (not a parody): generated, then pulled to the overall we want. */
function localFighter(s: GameState, rng: Rng, promo: string, target: number, idx: number, division?: string): Fighter {
  const f0 = me(s);
  const div = division ?? f0.division;
  const x = generateFighter(rng, content().names, { division: div, gender: div.startsWith('w') ? 'W' : 'M', tier: 'prospect', id: `${promo}_${div}_${s.week}_${idx}_${rng.int(0, 1e6)}` });
  const shift = target - overall(x.skills);
  for (const k of Object.keys(x.skills) as (keyof Skills)[]) x.skills[k] = clamp(Math.round(x.skills[k] + shift), 15, 95);
  x.promotion = promo;
  x.status = 'active';
  x.contract = null;
  const w = rng.int(0, 6 + idx);
  x.record = { w, l: rng.int(0, Math.max(1, Math.round(w / 2))), d: 0, nc: 0 };
  x.age = rng.int(20, 34);
  if (promo === 'bkb') {
    x.nick = rng.pick(['Knuckles', 'The Butcher', 'Hambone', 'Concrete', 'Two-Teeth', 'The Landlord', 'Mad Dog', 'Grandpa', 'Big Country', 'Scrapyard']);
    x.skills.power = clamp(x.skills.power + 10, 15, 95);
    x.skills.chin = clamp(x.skills.chin + 8, 15, 95);
    x.look = { ...x.look, scar: 1 } as Fighter['look'];
  }
  s.fighters[x.id] = x;
  return x;
}

export function buildLadder(s: GameState, rng: Rng, which: 'amateur' | 'regional' | 'pfl' | 'bk'): void {
  const st = fm(s);
  const n = LADDER_SIZE[which];
  let [lo, hi] = LADDER_OVR[which];
  // each regional promotion is a step up from the last
  const regIdx = which === 'regional' ? st.circuit.slice(0, st.stage).filter((x) => x.tier === 'regional').length : 0;
  lo += regIdx * 5;
  hi += regIdx * 5;
  const promo = which === 'bk' ? 'bkb' : stage(s).promo;
  const f0 = me(s);
  const division = (div: string, size: number): string[] => {
    const ids: string[] = [];
    if (which === 'pfl') {
      // the Lounge's parody roster in its real-life order (champion first); local signings fill the gaps
      const order = PFL_ORDER[div] ?? [];
      const par = Object.values(s.fighters).filter((x) => x.promotion === PFL_ID && x.division === div && x.status === 'active' && x.id !== f0.id)
        .sort((a, b) => {
          const ia = order.indexOf(a.id);
          const ib = order.indexOf(b.id);
          if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
          return overall(b.skills) - overall(a.skills);
        }).slice(0, size);
      ids.push(...par.map((x) => x.id));
    }
    for (let i = ids.length; i < size; i++) ids.push(localFighter(s, rng, promo, Math.round(hi - ((hi - lo) * i) / (size - 1)), i, div).id);
    return ids;
  };
  if (which === 'bk') {
    st.bk.ladder = [...division(f0.division, n), st.player];
    return;
  }
  st.ladder = [...division(f0.division, n), st.player];
  // a full roster: every division of the promotion has its own ranked ladder
  st.rosters = { [f0.division]: st.ladder };
  const divs = DIVISION_ORDER.filter((d) => d !== f0.division && (which !== 'amateur' || rng.chance(0.7)));
  for (const d of divs) st.rosters[d] = division(d, which === 'pfl' ? Math.max(5, (PFL_ORDER[d] ?? []).length) : 5);
}

/** Your spot on the current tier's ladder (0 = champion). Null in Only Fighters. */
export function ladderSpot(s: GameState): number | null {
  const st = fm(s);
  if (st.tier === 'of') return null;
  const i = st.ladder.indexOf(st.player);
  return i < 0 ? null : i;
}

/** Winner climbs: takes the loser's spot if the loser was above him. */
function climb(list: string[], winner: string, loser: string): void {
  const w = list.indexOf(winner);
  const l = list.indexOf(loser);
  if (w < 0 || l < 0 || w < l) return;
  list.splice(w, 1);
  list.splice(l, 0, winner);
}

/** Win a promotion's belt and move up the road: local -> regional (one or two) -> the Lounge -> the CBFC. */
function promote(s: GameState, rng: Rng, out: string[]): void {
  const st = fm(s);
  const f = me(s);
  const was = stage(s);
  st.stage = Math.min(st.stage + 1, st.circuit.length - 1);
  const next = stage(s);
  st.tier = next.tier;
  stats(s).belts++;
  // a new league is a new contract: the hub plays the signing
  pushMoment(s, signingMoment(s, rng));
  if (was.tier === 'amateur' && next.tier !== 'amateur' && !st.amateur) {
    // turning pro: the amateur record is frozen, the pro record starts at 0-0
    st.amateur = { ...f.record };
    st.turnedPro = s.week;
    f.record = { w: 0, l: 0, d: 0, nc: 0 };
    out.push(`You turn pro. Your amateur record (${st.amateur.w}-${st.amateur.l}${st.amateur.d ? '-' + st.amateur.d : ''}) goes in the file; your pro record starts at 0-0.`);
    article(s, 'The Local Gazette', `Local fighter ${fullName(f)} turns pro after ${st.amateur.w + st.amateur.l + st.amateur.d} amateur bouts`);
  }
  if (next.tier === 'regional' || next.tier === 'pfl') {
    f.promotion = next.promo;
    buildLadder(s, rng, next.tier);
    st.offers = [];
    out.push(next.tier === 'pfl'
      ? `${was.short} CHAMPION. The Professional Fighters' Lounge calls: season format, playoffs, and a "million dollar" prize. Real names on this roster now.`
      : `${was.short} CHAMPION. ${next.name} signs you. Bigger shows, better purses, harder men.`);
    log(s, `Won the ${was.name} belt and signed with ${next.name}.`, 2);
    f.hype = clamp(f.hype + (next.tier === 'pfl' ? 10 : 6), 0, 100);
    storyPromote(s);
    return;
  }
  if (next.tier === 'of') {
    st.ladder = [];
    f.promotion = 'us';
    if (!s.divisionsOpen.includes(f.division)) s.divisionsOpen.push(f.division);
    f.contract = { boutsLeft: 99, purse: 6000, winBonus: 6000, champClause: true, exclusive: true, signedWeek: s.week };
    out.push(`LOUNGE CHAMPION. The CBFC calls. You're in the big show now: bottom of the prelims, but you're in.`);
    log(s, `Signed with the ${s.promotion.name}.`, 2);
    post(s, BRADIE.handle, `${f.last.toLowerCase()} made the cbfc. congrats bro. also check your DMs. i have an only fighters offer. its mostly normal`);
    f.hype = clamp(f.hype + 12, 0, 100);
    storyPromote(s);
    computeRankings(s);
  }
}

// ---------------------------------------------------------------- vitals helpers

export function weightLimit(s: GameState): number {
  return DIVISION_LIMITS[me(s).division] ?? 155;
}

/** The weight you have to make this fight week: whatever you signed for (usually the division limit). */
export function contractLimit(s: GameState): number {
  const st = fm(s);
  return st.fight?.limit ?? weightLimit(s);
}

/** Skills as they'd fight today: injuries, energy and morale bite. */
export function fightReadySkills(s: GameState): Skills {
  const f = me(s);
  const st = fm(s);
  const b = st.body;
  const k = (p: number) => 0.55 + 0.45 * (p / 100);
  const sk = { ...f.skills };
  sk.chin = Math.round(sk.chin * k(Math.min(b.head, b.jaw)));
  sk.durability = Math.round(sk.durability * k(b.head));
  sk.cardio = Math.round(sk.cardio * k(b.body) * (0.8 + st.energy / 500));
  sk.striking = Math.round(sk.striking * k((b.larm + b.rarm + b.lhand + b.rhand) / 4));
  sk.power = Math.round(sk.power * k((b.lhand + b.rhand) / 2));
  sk.wrestling = Math.round(sk.wrestling * k((b.legs + b.larm + b.rarm) / 3));
  sk.heart = Math.round(sk.heart * (0.8 + st.morale / 500));
  return sk;
}

// ---------------------------------------------------------------- weekly actions

export type ActionId = 'train' | 'spar' | 'work' | 'rest' | 'party' | 'cut';
export type CutMethod = 'roadwork' | 'sauna' | 'diet';

/** How ready your body is to take a hard week. Peak condition makes training land. */
export function condition(s: GameState): { label: 'PEAK CONDITION' | 'GOOD' | 'WORN DOWN' | 'WRECKED'; mult: number; color: 'gold' | 'moss' | 'ember' | 'blood' } {
  const st = fm(s);
  const health = BODY_PARTS.reduce((a, p) => a + st.body[p.id], 0) / BODY_PARTS.length;
  const score = st.energy * 0.45 + st.morale * 0.25 + health * 0.3;
  if (score >= 78 && st.energy >= 65 && health >= 85) return { label: 'PEAK CONDITION', mult: 1.6, color: 'gold' };
  if (score >= 60) return { label: 'GOOD', mult: 1.15, color: 'moss' };
  if (score >= 40) return { label: 'WORN DOWN', mult: 0.8, color: 'ember' };
  return { label: 'WRECKED', mult: 0.5, color: 'blood' };
}

const gain = (s: GameState, base: number) => {
  const st = fm(s);
  const f = me(s);
  const room = Math.max(0.2, (f.potential + (st.ped.on ? 8 : 0) - overall(f.skills)) / 35);
  return base * (1 + st.staff.coach * 0.4) * (st.ped.on ? 1.6 : 1) * condition(s).mult * Math.min(1.5, room) * gymTrainBonus(s);
};

/** What a normal training session of this skill should add (the middle of the range), and the knock-on skill. */
export function trainPreview(s: GameState, k: keyof Skills): { gain: number; buddy: keyof Skills | null; buddyGain: number } {
  const g = gain(s, 2.2);
  const b2 = TRAIN_BUDDY[k] ?? null;
  return { gain: Math.round(g * 10) / 10, buddy: b2, buddyGain: Math.round(g * 2.5) / 10 };
}
const TRAIN_BUDDY: Partial<Record<keyof Skills, keyof Skills>> = { striking: 'fightIQ', power: 'striking', wrestling: 'cardio', grappling: 'fightIQ', cardio: 'heart', chin: 'durability', durability: 'heart', fightIQ: 'striking' };

/** Dedicated weight cutting is for the last two weeks of camp. Before that, it just comes back. */
export function cutWindow(s: GameState): { open: boolean; weeksOut: number | null } {
  const st = fm(s);
  if (!st.fight) return { open: false, weeksOut: null };
  const w = st.fight.week - s.week;
  return { open: w <= 2, weeksOut: w };
}

/** Burn weight (training, roadwork). Returns pounds lost. */
const burn = (s: GameState, lbs: number) => {
  const st = fm(s);
  const floor = Math.min(weightLimit(s), contractLimit(s)) - 2;
  const before = st.walkWeight;
  st.walkWeight = Math.max(floor, Math.round((st.walkWeight - lbs) * 10) / 10);
  return Math.round((before - st.walkWeight) * 10) / 10;
};

/** Training result scaled by a mini game score (0..1); null = no mini game. */
/** Skills top out here. */
export const SKILL_MAX = 99;
export const isMaxed = (v: number): boolean => v >= SKILL_MAX - 0.05;

export function trainSkill(s: GameState, k: keyof Skills, rng: Rng, score: number | null = null): string {
  const st = fm(s);
  const f = me(s);
  if (st.ap <= 0) return 'No time left this week.';
  if (isMaxed(f.skills[k])) return `${k.toUpperCase()} is already maxed out. Train something else.`;
  st.ap--;
  const cond = condition(s);
  const perf = score === null ? 1 : 0.55 + score * 0.95;
  const g = gain(s, rng.float(1.6, 2.8)) * perf;
  f.skills[k] = clamp(Math.round((f.skills[k] + g) * 10) / 10, 10, 99);
  // a little carries over to the neighbours
  const b2 = TRAIN_BUDDY[k];
  if (b2) f.skills[b2] = clamp(Math.round((f.skills[b2] + g * 0.25) * 10) / 10, 10, 99);
  st.energy = clamp(st.energy - 15, 0, 100);
  // training burns a little; the real cutting happens in the last two weeks of camp
  const lost = burn(s, (k === 'cardio' ? 0.8 : k === 'wrestling' || k === 'grappling' ? 0.55 : 0.35) * (score === null ? 1 : 0.7 + score * 0.6));
  const tag = cond.label === 'PEAK CONDITION' ? ' PEAK CONDITION bonus!' : cond.label === 'WRECKED' ? ' (You trained wrecked: barely stuck.)' : '';
  if (rng.chance(0.04 + (st.energy < 25 ? 0.12 : 0))) {
    const part = rng.pick(['legs', 'body', 'lhand', 'rhand', 'larm', 'rarm'] as BodyPart[]);
    st.body[part] = clamp(st.body[part] - rng.int(10, 25), 0, 100);
    return `Trained ${k.toUpperCase()} (+${g.toFixed(1)}, -${lost} lbs) and tweaked your ${BODY_PARTS.find((p) => p.id === part)!.name.toLowerCase()}.${tag}`;
  }
  return `Trained ${k.toUpperCase()}: +${g.toFixed(1)}${lost ? `, -${lost} lbs` : ''}.${tag}`;
}

/** Dedicated weight cutting. */
export function cutWeight(s: GameState, m: CutMethod): string {
  const st = fm(s);
  const f = me(s);
  if (st.ap <= 0) return 'No time left this week.';
  const win = cutWindow(s);
  if (!win.open) return win.weeksOut === null ? 'No fight booked: nothing to cut for. Train, and keep the diet clean.' : `Too early: the fight is ${win.weeksOut} weeks out. Cut now and it all comes back. The dedicated cut starts two weeks out.`;
  st.ap--;
  if (m === 'roadwork') {
    const lost = burn(s, 2.8 + st.staff.nutrition * 0.4);
    st.energy = clamp(st.energy - 14, 0, 100);
    f.skills.cardio = clamp(f.skills.cardio + 0.4, 10, 99);
    return `Roadwork in a trash-bag hoodie at 5 a.m.: -${lost} lbs, cardio +0.4.`;
  }
  if (m === 'sauna') {
    const lost = burn(s, 4);
    st.water += lost;
    st.energy = clamp(st.energy - 20, 0, 100);
    st.body.body = clamp(st.body.body - 4, 0, 100);
    return `Sat in the sauna until you saw God: -${lost} lbs. Most of it is water and comes back unless you weigh in this week.`;
  }
  const lost = burn(s, 2.2 + st.staff.nutrition * 0.5);
  st.morale = clamp(st.morale - 5, 0, 100);
  st.energy = clamp(st.energy - 5, 0, 100);
  return `Strict meal prep: chicken, rice, sadness. -${lost} lbs.`;
}

/** Put sparring points into skills (one point = +1). */
export function allocateSpar(s: GameState, alloc: Partial<Record<keyof Skills, number>>): string {
  const st = fm(s);
  const f = me(s);
  let left = st.sparPoints ?? 0;
  const done: string[] = [];
  for (const [k, n] of Object.entries(alloc) as [keyof Skills, number][]) {
    // never spend points past the cap
    const room = Math.max(0, Math.ceil(SKILL_MAX - f.skills[k]));
    const use = Math.min(left, room, Math.max(0, Math.floor(n)));
    if (!use || k === 'weightCut') continue;
    f.skills[k] = clamp(Math.round((f.skills[k] + use) * 10) / 10, 10, 99);
    left -= use;
    done.push(`${k} +${use}`);
  }
  st.sparPoints = left;
  return done.length ? `Sparring paid off: ${done.join(', ')}.` : 'No points spent.';
}

/** Returns a short line describing what happened. */
export function doAction(s: GameState, a: ActionId, focus: keyof Skills | 'cheap' | 'pro' | 'partner' | null, rng: Rng): string {
  const st = fm(s);
  const f = me(s);
  if (st.ap <= 0) return 'No time left this week.';
  st.ap--;
  switch (a) {
    case 'train':
    case 'cut':
      st.ap++;
      return a === 'train' ? trainSkill(s, (focus as keyof Skills) ?? 'striking', rng) : cutWeight(s, 'roadwork');
    case 'spar': {
      const cheap = focus === 'cheap';
      const partner = focus === 'partner' && st.partner;
      const g = gain(s, rng.float(1.6, 2.8)) * (partner ? 1.2 : 1);
      // sparring earns points you put where you want them: you choose what the camp works on
      const pts = clamp(Math.round(g * 1.6), 2, 7);
      st.sparPoints = (st.sparPoints ?? 0) + pts;
      f.skills.fightIQ = clamp(f.skills.fightIQ + g * 0.2, 10, 99);
      st.energy = clamp(st.energy - 22, 0, 100);
      burn(s, 0.8);
      if (focus === 'pro') st.money -= 150;
      if (partner) return sparPartner(s, rng, g) + ` (+${pts} skill points to spend.)`;
      // the gym rat who wants to be your regular partner
      if (cheap && !st.partner && !st.flagsPartner && rng.chance(0.5)) {
        st.flagsPartner = true;
        st.pending.push(EVENTS.partnerOffer(s, rng));
      }
      const hurtP = cheap ? 0.3 : 0.1;
      let extra = '';
      if (rng.chance(hurtP)) {
        const part = rng.pick(['head', 'jaw', 'body', 'legs', 'lhand', 'rhand'] as BodyPart[]);
        st.body[part] = clamp(st.body[part] - rng.int(12, 30), 0, 100);
        if (part === 'head') st.headCap = Math.max(60, st.headCap - 1);
        extra = cheap ? ` Your "partner" went 100% and hurt your ${BODY_PARTS.find((p) => p.id === part)!.name.toLowerCase()}.` : ` Took a bad one to the ${BODY_PARTS.find((p) => p.id === part)!.name.toLowerCase()}.`;
      }
      if (cheap && rng.chance(0.12)) st.pending.push(EVENTS.leak(s, rng));
      return `Sparred ${cheap ? 'with whoever showed up' : 'with paid pros (-$150)'}: ${pts} skill points to spend.` + extra;
    }
    case 'work': {
      const pay = rng.int(320, 620);
      st.money += pay;
      st.energy = clamp(st.energy - 14, 0, 100);
      st.morale = clamp(st.morale - 4, 0, 100);
      const job = rng.pick(['flipped tyres at the scrapyard', 'worked the door at a nightclub', 'delivered furniture', 'taught a cardio-kickboxing class to moms', 'moved fridges', 'worked a double at the warehouse']);
      return `You ${job}: +${money(pay)}.`;
    }
    case 'rest': {
      st.energy = clamp(st.energy + 32, 0, 100);
      st.morale = clamp(st.morale + 6, 0, 100);
      for (const p of BODY_PARTS) st.body[p.id] = clamp(st.body[p.id] + 6, 0, p.id === 'head' ? st.headCap : 100);
      return 'Rested. Ice bath, nap, eleven episodes of something.';
    }
    case 'party': {
      st.morale = clamp(st.morale + 18, 0, 100);
      st.energy = clamp(st.energy - 10, 0, 100);
      st.walkWeight += 1.5;
      st.partied++;
      if (rng.chance(0.25)) st.pending.push(EVENTS.barFight(s, rng));
      return 'Went out. It was a great night. Probably.';
    }
  }
}

export function clinicCost(s: GameState, part: BodyPart): number {
  return Math.round((100 - fm(s).body[part]) * 18);
}

export function treat(s: GameState, part: BodyPart): string {
  const st = fm(s);
  const cost = clinicCost(s, part);
  if (!cost) return 'Nothing to treat.';
  if (st.money < cost) return `The clinic wants ${money(cost)}. You have ${money(st.money)}.`;
  st.money -= cost;
  st.body[part] = part === 'head' ? st.headCap : 100;
  if (part === 'head' || part === 'jaw') me(s).wounds = { cuts: 0, blackEye: 0, swelling: 0, bandages: me(s).wounds.cuts ? 1 : 0, noseBleed: false };
  return `St. Cath's Sports Medicine patched up your ${BODY_PARTS.find((p) => p.id === part)!.name.toLowerCase()} (-${money(cost)}).`;
}

export function setStaff(s: GameState, id: StaffId, tier: number, name?: string, shady = false): void {
  const st = fm(s);
  st.staff[id] = clamp(tier, 0, 3);
  st.staffNames[id] = name ?? STAFF_ROLES.find((r) => r.id === id)!.tiers[st.staff[id]];
  st.shady[id] = shady;
  if (id === 'cutman') me(s).cutman = { name: st.staffNames.cutman, rating: [25, 45, 70, 92][st.staff.cutman] };
}

const STAFF_NAMES: Record<StaffId, string[]> = {
  coach: ['Tony "The Professor" Ferraro', 'Duke Ramsey', 'Javi Ortega', 'Big Sal Lombardo', 'Coach Kim Haeun', 'Old Man Petrov', 'Marcus "Mad Scientist" Bell', 'Dana Kowalczyk', 'Rafa Monteiro', 'Lars Ekdahl'],
  cutman: ['Stitch McGee', 'Doc Holloway', 'Benny "Vaseline" Russo', 'Maria Santos', 'Jimmy Two-Swabs', 'Eddie Fong', 'Grandma Ruth', 'Ice Pack Pete'],
  nutrition: ['Dr. Kale Greenberg', 'Bethany Macros', 'Chef Tavita', 'Coach Broccoli', 'Dr. Ines Vidal', 'Meal-Prep Mike', 'Priya Raman, RD'],
  manager: ['Sly Vincent', 'Barry "Ten Percent" Klein', 'Monique Ash', 'Teddy Shakes', 'Ava Sterling', 'Larry Cash', 'Dom Ricci', 'Ruth Okafor'],
};
const QUIRKS: Record<StaffId, [string, string][]> = {
  coach: [['Old school. Makes you run up hills.', ''], ['Writes gameplans on napkins.', ''], ['Cried at your last fight. Good cry.', ''], ['Has a podcast. Mentions it a lot.', '']],
  cutman: [['Hands like a surgeon.', ''], ['Brings his own enswell, named it Brenda.', ''], ['Has seen things. Will not elaborate.', '']],
  nutrition: [['Thinks carbs are a government plot.', ''], ['Brings Tupperware to funerals.', ''], ['Knows exactly how much you weigh. Always.', '']],
  manager: [['Very confident handshake.', 'shady'], ['Wears sunglasses indoors.', 'shady'], ['Has your mom on speed dial.', ''], ['Reads every contract twice.', ''], ['Pays for lunch. Every time. Suspicious.', 'shady'], ['Sends you invoices for "vibes".', 'shady']],
};

/** New candidates every few weeks: hire people by name. */
export function refreshMarket(s: GameState, rng: Rng): void {
  const st = fm(s);
  st.marketWeek = s.week;
  const out: StaffCandidate[] = [];
  for (const role of ['coach', 'cutman', 'nutrition', 'manager'] as StaffId[]) {
    const n = role === 'manager' ? 3 : 2;
    const names = rng.sample(STAFF_NAMES[role], n);
    names.forEach((name, i) => {
      const [quirk, sh] = rng.pick(QUIRKS[role]);
      out.push({ role, name, tier: clamp(1 + i + (rng.chance(0.3) ? 1 : 0) - (rng.chance(0.25) ? 1 : 0), 1, 3), quirk, shady: !!sh });
    });
  }
  st.market = out;
}

export function hire(s: GameState, i: number): string {
  const st = fm(s);
  const c = st.market[i];
  if (!c) return '';
  setStaff(s, c.role, c.tier, c.name, c.shady);
  st.market.splice(i, 1);
  log(s, `Hired ${c.name} (${STAFF_ROLES.find((r) => r.id === c.role)!.name.toLowerCase()}).`);
  return `${c.name} is on the team.`;
}

export function fire(s: GameState, role: StaffId): string {
  const st = fm(s);
  const was = st.staffNames[role];
  setStaff(s, role, 0);
  return `You let ${was} go.`;
}

// ---------------------------------------------------------------- the sparring partner

const PARTNER_NAMES = ['Tanner "Tank" Voss', 'Kyle Brisket', 'Dmitri "The Fridge" Orlov', 'Jace Wexley', 'Brody Sharpe'];

function sparPartner(s: GameState, rng: Rng, g: number): string {
  const st = fm(s);
  const p = st.partner!;
  p.spars++;
  // Zac Buna (Road To Champion): the real thing. Grappling, every time, no drama
  if (p.stage === 99) {
    const f = me(s);
    f.skills.grappling = clamp(f.skills.grappling + g * 0.9, 10, 99);
    f.skills.wrestling = clamp(f.skills.wrestling + g * 0.5, 10, 99);
    return `Rolled with ${p.name} for two hours: +${(g * 0.9).toFixed(1)} grappling, +${(g * 0.5).toFixed(1)} wrestling. He tapped you eleven times and apologised every time.`;
  }
  let extra = '';
  // the storyline: he goes too hard, then the clip leaks, then you find out who he really works for
  if (p.stage === 0 && p.spars >= 2) {
    p.stage = 1;
    const part = rng.pick(['jaw', 'body', 'rhand'] as BodyPart[]);
    st.body[part] = clamp(st.body[part] - rng.int(15, 25), 0, 100);
    extra = ` ${p.name} went 100% "by accident" and hurt your ${BODY_PARTS.find((x) => x.id === part)!.name.toLowerCase()}.`;
  } else if (p.stage === 1 && p.spars >= 4) {
    p.stage = 2;
    st.pending.push(EVENTS.leak(s, rng));
    extra = ` Somebody filmed it.`;
  } else if (p.stage === 2 && p.spars >= 5 && st.fight) {
    p.stage = 3;
    p.leaking = true;
    st.pending.push(EVENTS.partnerSnake(s, rng));
  }
  return `Sparred with ${p.name}: +${g.toFixed(1)} fight IQ-ish. Free, too.${extra}`;
}

// ---------------------------------------------------------------- Bradie's bareknuckle circuit

export function bkSpot(s: GameState): number {
  return fm(s).bk.ladder.indexOf(fm(s).player);
}

export function weeklyStaffCost(s: GameState): number {
  const st = fm(s);
  return STAFF_ROLES.reduce((acc, r) => acc + r.cost[st.staff[r.id]], 0);
}

// ---------------------------------------------------------------- media

/** Fighters you could call out: your division, ranked around and above you. */
export function calloutTargets(s: GameState): Fighter[] {
  const f = me(s);
  const st = fm(s);
  if (st.tier !== 'of') {
    const i = Math.max(0, st.ladder.indexOf(f.id));
    return st.ladder.slice(Math.max(0, i - 4), i).map((id) => s.fighters[id]).filter(Boolean).reverse();
  }
  const wall = [undisputed(s, f.division)?.holder, ...(s.rankings[f.division] ?? [])].filter((x): x is string => !!x && x !== f.id && !isBoss(x));
  const my = rankOf(s, f.id) ?? 16;
  const out = wall.map((id) => s.fighters[id]).filter((x) => x && x.status === 'active').filter((x) => (rankOf(s, x.id) ?? 16) <= my + 2).slice(0, 8);
  // once you're a champion, you can call out the Beast (he won't take it seriously)
  const sp = s.fighters.spadam;
  if (sp && sp.status === 'active' && Object.values(s.belts).some((b) => b.holder === f.id) && st.fight?.opp !== 'spadam') out.unshift(sp);
  return out;
}

const CALLOUTS = [
  "{x} is a paper champion with a cardboard chin. Sign the contract.",
  "Been watching {x} tape. Fell asleep twice. Let's fix that for everyone.",
  "{x} ducks more than a waterfowl convention. I'm right here.",
  "No disrespect to {x}, but I'd beat him in a phone booth, a parking lot or a church.",
  "{x}'s cardio has a 3-minute warranty. I fight for 15.",
  "Hey {x}, I'm free whenever your mom lets you out.",
  "{x} fights like he's buffering. Let's go.",
];
/** Spadam Biggs, humbly egoing anyone who calls him out. */
const SPADAM_EGO = [
  'Love the energy, little guy. Genuinely. Eat some soup and get back to me.',
  "Appreciate you, {you}. Big fan. Not of fighting you, but of you. Keep going champ.",
  "Respect the hustle. I'll fight you when you're a welterweight. Or a building.",
  "That's cute. My nephew called me out too. He's six. He had more reach.",
  "Thank you for thinking of me. I'm booked until you're good.",
  "Humbly: no. But I'll sign something for your gym.",
];
const REPLIES = [
  "who?",
  "Get a few more wins, kid. Then maybe.",
  "Bro is ranked behind my cousin. Sit down.",
  "Saved this one. Gonna frame it after I beat you.",
  "You want it? Tell the matchmaker. I'll be there.",
  "Lmao this guy",
];

export function callOut(s: GameState, targetId: string, rng: Rng): string {
  const st = fm(s);
  const f = me(s);
  const t = s.fighters[targetId];
  if (!t) return '';
  if (st.ap <= 0) return 'No time left this week.';
  st.ap--;
  const line = rng.pick(CALLOUTS).replace(/\{x\}/g, '@' + t.last.toLowerCase());
  post(s, '@' + f.last.toLowerCase(), line);
  if (t.id === 'spadam') {
    // the Beast doesn't fight people who call him out. He pats them on the head.
    const ego = rng.pick(SPADAM_EGO).replace(/\{you\}/g, f.last);
    post(s, '@whitebeastbiggs', ego);
    f.hype = clamp(f.hype + 2, 0, 100);
    return `You called out Spadam Biggs. He replied: "${ego}"`;
  }
  heatUp(s, f.id, t.id, rng.int(12, 25));
  f.hype = clamp(f.hype + rng.int(3, 7), 0, 100);
  const reply = rng.chance(0.65);
  if (reply) {
    const said = rng.pick(REPLIES);
    post(s, '@' + t.last.toLowerCase(), said);
    st.pending.push(EVENTS.reply(s, rng, t, said));
  }
  // a good callout sometimes gets you the fight
  const r = rankOf(s, t.id) ?? 16;
  const mine = rankOf(s, f.id) ?? 16;
  if (!st.fight && !isSuspended(s) && rng.chance(0.18 + f.hype / 300) && mine - r <= 6) {
    st.offers.unshift(offerVs(s, t, rng, 'The callout worked. The matchmaker saw it.'));
  }
  return `You called out ${fullName(t)}. ${reply ? 'He answered.' : 'He left you on read.'}`;
}

export function humblePost(s: GameState, rng: Rng): string {
  const st = fm(s);
  const f = me(s);
  if (st.ap <= 0) return 'No time left this week.';
  st.ap--;
  post(s, '@' + f.last.toLowerCase(), rng.pick(['Grateful for the grind. 5am again tomorrow.', 'Thank you to everyone who believes in me. Even you, Kevin.', 'Head down. Work hard. The rest takes care of itself.', 'New gloves, same hunger.']));
  f.hype = clamp(f.hype + 1, 0, 100);
  st.morale = clamp(st.morale + 5, 0, 100);
  return 'Posted something wholesome. The comments were 40% supportive, 60% bots.';
}

// ---------------------------------------------------------------- underground

export function startPeds(s: GameState): string {
  const st = fm(s);
  if (st.money < 1500) return 'The guy wants $1,500 up front.';
  st.money -= 1500;
  st.ped = { ...st.ped, on: true, weeks: 0 };
  log(s, 'You started a cycle. Jimmy Quavo said "it\'s basically vitamins". It is not vitamins.', -1);
  return 'Package received. Training gains way up. Test risk: also way up.';
}

export function stopPeds(s: GameState): string {
  fm(s).ped.on = false;
  return 'You came off the cycle. Takes a while to clear your system.';
}

/** Next man up on Bradie's bareknuckle ladder (the champion defends against #1). */
export function bkNext(s: GameState, rng: Rng): Fighter {
  const st = fm(s);
  if (!st.bk.ladder.length) buildLadder(s, rng, 'bk');
  const i = bkSpot(s);
  const id = i <= 0 ? st.bk.ladder[1] : st.bk.ladder[i - 1];
  return s.fighters[id];
}

export function bkPurse(s: GameState): number {
  const i = Math.max(0, bkSpot(s));
  return 800 + (LADDER_SIZE.bk - i) * 700 + (i <= 1 ? 3000 : 0);
}

/** Bareknuckle fight on Bradie's circuit: quick and brutal, climbs his ladder. */
export function bareknuckle(s: GameState, rng: Rng): string {
  const st = fm(s);
  if (st.ap <= 0) return 'No time left this week.';
  if (!st.bk.signed) {
    if (!st.inbox.some((d) => d.kind === 'bkdeal')) st.inbox.push(bkDeal(s, rng));
    return "Bradie wants you on paper first. His bareknuckle contract is in your PAPERWORK. Read it. Really read it.";
  }
  const opp = bkNext(s, rng);
  st.ap--;
  const f = me(s);
  const sk = fightReadySkills(s);
  const mine = (sk.striking + sk.power * 1.3 + sk.chin + sk.heart * 0.5) / 3.8;
  const theirs = (opp.skills.striking + opp.skills.power * 1.3 + opp.skills.chin + opp.skills.heart * 0.5) / 3.8;
  const won = rng.chance(clamp(0.5 + (mine - theirs) / 30, 0.08, 0.92));
  const purse = Math.round(bkPurse(s) * (hasClause(s, 'bk_credits') ? 0.5 : 1));
  const dmg = rng.int(8, 22);
  st.body.lhand = clamp(st.body.lhand - rng.int(6, 18), 0, 100);
  st.body.rhand = clamp(st.body.rhand - rng.int(6, 18), 0, 100);
  st.body.head = clamp(st.body.head - dmg, 0, st.headCap);
  st.energy = clamp(st.energy - 25, 0, 100);
  f.wounds = { ...f.wounds, cuts: Math.min(3, f.wounds.cuts + 1), swelling: Math.min(3, f.wounds.swelling + 1) };
  const where = rng.pick(['a warehouse in the industrial park', "the parking garage under Bradie's condo", 'a barge (Bradie insisted)', 'a closed-down Blockbuster', "Bradie's backyard, next to the hot tub"]);
  if (won) {
    st.money += purse;
    st.bk.w++;
    const wasChamp = bkSpot(s) === 0;
    climb(st.bk.ladder, f.id, opp.id);
    const champ = bkSpot(s) === 0;
    if (champ && !wasChamp) {
      st.bk.champ = true;
      log(s, `Won the ${BKB_NAME} belt. Bradie presented it while eating a corn dog.`, 2);
      post(s, BRADIE.handle, `${f.last.toLowerCase()} is the bareknuckle champ now. belt is real gold. well. its gold colored`);
      return `BKB CHAMPION! You beat ${opp.first} "${opp.nick}" ${opp.last} in ${where}. +${money(purse)}. Bradie: "dude. DUDE. that was so sick."`;
    }
    return `Beat ${opp.first} "${opp.nick}" ${opp.last} in ${where}. +${money(purse)} in a paper bag. You're #${bkSpot(s)} on Bradie's ladder.`;
  }
  st.money += Math.round(purse * 0.2);
  st.bk.l++;
  climb(st.bk.ladder, opp.id, f.id);
  if (bkSpot(s) !== 0) st.bk.champ = false;
  f.damage = clamp(f.damage + 2, 0, 100);
  return `${opp.first} "${opp.nick}" ${opp.last} beat you in ${where}. Your hands look like burgers. +${money(Math.round(purse * 0.2))} show money.`;
}

/** Card game: stake money, roughly 46% to double it. */
export function gamble(s: GameState, stake: number, rng: Rng): string {
  const st = fm(s);
  stake = Math.min(stake, st.money);
  if (stake <= 0) return 'You are broke.';
  const win = rng.chance(0.46);
  st.money += win ? stake : -stake;
  return win ? `Blackjack in a back room: +${money(stake)}.` : `Lost ${money(stake)} to a man named Spider.`;
}

// ---------------------------------------------------------------- offers

export function offerVs(s: GameState, opp: Fighter, rng: Rng, why: string, title: string | null = null): FMOffer {
  const st = fm(s);
  const f = me(s);
  if (st.tier !== 'of') {
    const top = st.ladder[0] === opp.id;
    const mgr = [1, 1.1, 1.25, 1.4][st.staff.manager];
    const idx = Math.max(0, st.ladder.indexOf(opp.id));
    const regIdx = st.circuit.slice(0, st.stage).filter((x) => x.tier === 'regional').length;
    const base = st.tier === 'amateur' ? 150 : st.tier === 'regional' ? (1500 + regIdx * 1000) + Math.max(0, 8 - idx) * 250 : 6000 + Math.max(0, 10 - idx) * 900;
    const purse = Math.round((base * mgr * (top ? 2 : 1)) / 50) * 50;
    // the Lounge's season final pays the famous "million dollars"
    const win = st.tier === 'pfl' && top ? 1_000_000 : purse;
    const name = stage(s).short;
    return { opp: opp.id, week: s.week + rng.int(2, 4), purse, win, rounds: top && st.tier === 'pfl' ? 5 : 3, title: null, tierTitle: top, why: top ? (st.tier === 'pfl' ? 'LOUNGE SEASON FINAL. Win the "million dollars" and the CBFC calls.' : `${name} TITLE FIGHT. Win and move up.`) : why, expires: s.week + 2 };
  }
  const mine = rankOf(s, f.id);
  const base = 4000 + (mine === null ? 0 : (16 - mine) * 2500) + f.hype * 120;
  const mgr = [1, 1.15, 1.35, 1.6][st.staff.manager];
  const purse = Math.round((base * mgr * rng.float(0.9, 1.15)) / 500) * 500 * (title ? 3 : 1);
  return { opp: opp.id, week: s.week + rng.int(4, 7), purse, win: purse, rounds: title ? 5 : 3, title, why, expires: s.week + 2 };
}

/** Suspended fighters get no sanctioned fights: no offers, nothing to sign. */
export const isSuspended = (s: GameState): boolean => s.week < fm(s).suspendedUntil;

export function makeOffers(s: GameState, rng: Rng, force = false): void {
  const st = fm(s);
  const f = me(s);
  st.offers = st.offers.filter((o) => o.expires >= s.week && s.fighters[o.opp]?.status === 'active');
  if (isSuspended(s)) st.offers = [];
  if (st.fight || isSuspended(s) || st.retired) return;
  if (!force && !rng.chance((st.tier === 'of' ? 0.45 : 0.65) + st.staff.manager * 0.12)) return;
  if (st.tier !== 'of') {
    // climb the local ladder: somebody a few rungs up (or the champ, if you're next in line)
    const i = Math.max(0, st.ladder.indexOf(f.id));
    const up = st.ladder.slice(Math.max(0, i - 3), i).filter((id) => s.fighters[id]?.status === 'active');
    const down = st.ladder.slice(i + 1, i + 3);
    const pool = up.length ? up : down;
    const n = 1 + (rng.chance(0.4 + st.staff.manager * 0.15) ? 1 : 0);
    for (const id of rng.sample(pool, Math.min(n, pool.length))) {
      if (st.offers.some((o) => o.opp === id) || st.offers.length >= 3) continue;
      const lines = st.tier === 'amateur' ? ['Rec-centre smoker. Bring your own mouthguard.', 'Church basement card. Headgear optional.', 'A bar show. The cage is a little small.', 'The ring card girl is the promoter\'s mum.']
        : st.tier === 'pfl' ? ['Lounge regular season: points for finishes.', 'A Lounge card in a half-empty arena. Great lighting.', 'Lounge playoffs. Somebody\'s sovereign wealth fund is watching.', 'Lounge "super fight". Nobody knows what makes it super.']
          : [`${stage(s).short} on a Friday night. Real crowd, real purse.`, 'Casino ballroom card. The buffet is included.', 'Main card at the county fair. Right after the pig race.', 'A TV deal with a channel you\'ve never heard of.'];
      st.offers.push(offerVs(s, s.fighters[id], rng, rng.pick(lines)));
    }
    return;
  }
  const wall = s.rankings[f.division] ?? [];
  const mine = rankOf(s, f.id);
  const champ = undisputed(s, f.division);
  const pool = Object.values(s.fighters).filter((x) => x.division === f.division && x.id !== f.id && x.status === 'active' && x.promotion === 'us' && !isBoss(x.id) && !x.injuries.some((i) => i.until > s.week));
  const pick = (list: Fighter[]) => (list.length ? rng.pick(list) : null);
  const n = 1 + (st.staff.manager >= 2 ? 1 : 0) + (rng.chance(0.4) ? 1 : 0);
  for (let i = 0; i < n && st.offers.length < 3; i++) {
    let opp: Fighter | null;
    let why: string;
    if (mine !== null && mine <= 2 && champ?.holder && champ.holder !== f.id && !isBoss(champ.holder) && i === 0) {
      opp = s.fighters[champ.holder];
      st.offers.push(offerVs(s, opp, rng, 'The CBFC matchmaker called. TITLE SHOT.', champ.id));
      continue;
    }
    if (mine === null) {
      opp = pick(pool.filter((x) => !wall.includes(x.id)));
      why = rng.pick(['A step-up fight on the prelims.', 'Short notice, but a win is a win.', 'Their guy pulled out. You in?']);
    } else {
      const above = wall.slice(Math.max(0, mine - 4), mine - 1).map((id) => s.fighters[id]).filter((x) => x && !isBoss(x.id));
      opp = pick(above.length && rng.chance(0.6) ? above : pool.filter((x) => (rankOf(s, x.id) ?? 99) > mine));
      why = rng.pick(['Beat him and you jump the line.', 'A ranked scalp on the main card.', 'The matchmaker thinks you two will bleed for the cameras.']);
    }
    if (opp && !st.offers.some((o) => o.opp === opp!.id)) st.offers.push(offerVs(s, opp, rng, why));
  }
}

export function acceptOffer(s: GameState, i: number): void {
  const st = fm(s);
  const o = st.offers[i];
  if (!o || isSuspended(s)) return;
  st.fight = { ...o, eventId: 'fm' + o.week };
  st.offers = [];
  st.roundPlans = {};
  st.cornerAid = {};
  const t = s.fighters[o.opp];
  st.inbox.push(boutDoc(s, new Rng((s.rng ^ (s.week * 7919)) >>> 0), o));
  log(s, `Booked: you vs ${fullName(t)}${o.title ? ' for the title' : ''} on ${fightDay(o.week)}. Purse ${money(o.purse)} + ${money(o.win)} to win.`, 1);
}

export const fightDay = (week: number) => `week ${week + 1}`;

// ---------------------------------------------------------------- controversies

const EVENTS = {
  leak: (s: GameState, rng: Rng): FMEvent => ({
    id: 'leak', title: 'SPARRING FOOTAGE LEAKED',
    text: `A "training partner" posted a 9-second clip of you getting dropped in sparring. It has ${rng.int(2, 9)}00k views. The clip conveniently ends before you got up and returned the favour.`,
    choices: [{ id: 'context', label: 'Post the full clip' }, { id: 'laugh', label: 'Laugh it off' }, { id: 'fire', label: 'Call him a snake' }],
  }),
  barFight: (s: GameState, rng: Rng): FMEvent => ({
    id: 'barfight', title: 'ARRESTED OUTSIDE A NIGHTCLUB',
    text: `Somebody threw a drink, somebody else threw a ${rng.pick(['punch', 'chair', 'bouncer', 'birthday cake'])}. The police report says you were "the most aggressive person at a bachelor party for some reason".`,
    choices: [{ id: 'lawyer', label: 'Hire a lawyer ($3,000)' }, { id: 'plead', label: 'Plead out (community service)' }, { id: 'tough', label: 'Post a defiant video' }],
  }),
  ex: (s: GameState, rng: Rng): FMEvent => ({
    id: 'ex', title: 'YOUR EX WENT LIVE',
    text: `Your ex did a ${rng.int(2, 4)}-hour livestream about you. Allegations include: ${rng.pick(['you cried at a car commercial', 'you owe her $400 and a PlayStation', 'your "abs" are contour makeup', 'you sleep with your gloves on', 'you made her watch your fights on repeat'])}. It is trending.`,
    choices: [{ id: 'respond', label: 'Respond publicly' }, { id: 'ignore', label: 'Stay silent' }, { id: 'pay', label: 'Pay her the $400' }],
  }),
  sponsor: (s: GameState, rng: Rng): FMEvent => ({
    id: 'sponsor', title: 'SKETCHY SPONSOR',
    text: `${rng.pick(['GAINZ-X', 'MuscleMilk-ish', 'CryptoKicks', 'TestoTea'])} wants to sponsor you for $2,000. Their supplement is "definitely not contaminated", says a man wearing sunglasses indoors.`,
    choices: [{ id: 'take', label: 'Take the money' }, { id: 'pass', label: 'Pass' }],
  }),
  test: (s: GameState): FMEvent => ({
    id: 'test', title: 'RANDOM DRUG TEST',
    text: 'The testing agency is at your door at 6 a.m. with a cup and a disappointed expression.',
    choices: [{ id: 'pee', label: 'Provide a sample' }, { id: 'run', label: "Pretend you're not home" }],
  }),
  callout: (s: GameState, rng: Rng, by: Fighter): FMEvent => ({
    id: 'calledout', title: 'YOU GOT CALLED OUT', data: { by: by.id },
    text: `${fullName(by)} on Bleeter: "${rng.pick(['@' + me(s).last.toLowerCase() + ' is all hype. Sign it.', 'Nobody is scared of @' + me(s).last.toLowerCase() + '. Let me prove it.', 'I want @' + me(s).last.toLowerCase() + ' next. Easy work.'])}"`,
    choices: [
      { id: 'fire', label: 'Fire back' },
      { id: 'record', label: 'Post your record next to his' },
      { id: 'gym', label: 'Invite him to your gym' },
      { id: 'money', label: '"Pay me and I\'ll fight anyone"' },
      { id: 'ignore', label: 'Ignore it' },
    ],
  }),
  /** someone answered your callout: keep it going? */
  reply: (s: GameState, rng: Rng, by: Fighter, said: string): FMEvent => ({
    id: 'reply', title: `@${by.last.toLowerCase()} REPLIED`, data: { by: by.id },
    text: `${fullName(by)} quoted your callout: "${said}" The replies are on fire.`,
    choices: [
      { id: 'double', label: 'Double down' },
      { id: 'loss', label: 'Post a clip of his worst loss' },
      { id: 'meme', label: 'Reply with a single clown emoji' },
      { id: 'bkb', label: "Challenge him to Bradie's bareknuckle thing" },
      { id: 'drop', label: 'Let it go' },
    ],
  }),
  jimmy: (s: GameState, rng: Rng): FMEvent => ({
    id: 'jimmy', title: 'JIMMY QUAVO', portrait: 'npc:jimmy_quavo',
    text: rng.pick([
      `A guy in an Abibas tracksuit and a beanie is leaning on your car. "Jimmy Quavo. Everybody knows me. You look flat, champ. I got vitamins. The kind with a needle."`,
      `Jimmy Quavo slides into the booth across from you at the diner. Same tracksuit. Same beanie. "My guys are getting huge, bro. You're getting... medium. Let me help."`,
      `"Yo." Jimmy Quavo, in the gym bathroom, somehow. "New batch. Undetectable. The commission can't even spell it."`,
    ]),
    choices: [{ id: 'cycle', label: 'Buy a cycle ($1,500)' }, { id: 'vitamins', label: 'Just the "vitamins" ($300)' }, { id: 'no', label: 'Get lost, Jimmy' }],
  }),
  partnerOffer: (s: GameState, rng: Rng): FMEvent => {
    const name = rng.pick(PARTNER_NAMES);
    return {
      id: 'partner', title: 'A REGULAR SPARRING PARTNER?', data: { name },
      text: `${name} has been at the gym every day this week. Says he'll be your full-time sparring partner for free, "just to get better, bro". He has a lot of camera equipment for a guy who just wants to get better.`,
      choices: [{ id: 'yes', label: 'Sure, free is free' }, { id: 'no', label: 'No thanks' }],
    };
  },
  partnerSnake: (s: GameState, rng: Rng): FMEvent => {
    const p = fm(s).partner!;
    const opp = fm(s).fight ? s.fighters[fm(s).fight!.opp] : null;
    return {
      id: 'snake', title: 'YOUR SPARRING PARTNER IS A SNAKE',
      text: `Your cousin saw ${p.name} at a bar with ${opp ? fullName(opp) + "'s" : 'your next opponent\'s'} coach, showing him phone footage of your sparring. He's been selling your gameplan.`,
      choices: [{ id: 'fire', label: 'Fire him' }, { id: 'confront', label: 'Confront him' }, { id: 'fake', label: 'Feed him a fake gameplan' }],
    };
  },
};

// ---------------------------------------------------------------- fight night (your night, your prompts)

const PRESS_Q = {
  win: [
    "{rep}: \"{you}, walk us through the finish. When did you know {opp} was done?\"",
    "{rep}: \"That's a statement win. Who's next for {you}?\"",
    "{rep}: \"{you}, the crowd was chanting your name. Did you hear it in there?\"",
    "{rep}: \"Some people had you as the underdog tonight. Anything to say to them?\"",
    "{rep}: \"{you}, how much money did that performance just make you, roughly?\"",
    "{rep}: \"What did your corner tell you between rounds? Because something changed.\"",
    "{rep}: \"{you}, is it fair to say {opp} underestimated you?\"",
    "{rep}: \"Your mom was cageside. What did she say after?\"",
    "{rep}: \"Are you calling anyone out tonight, or are we being humble?\"",
    "{rep}: \"{you}, what's the first thing you're eating?\"",
  ],
  loss: [
    "{rep}: \"{you}, tough night. What went wrong out there?\"",
    "{rep}: \"Do you want the rematch with {opp}?\"",
    "{rep}: \"Was the weight cut a factor tonight?\"",
    "{rep}: \"Some fans are saying you're not ready for this level. Your response?\"",
    "{rep}: \"What's next for {you} after this?\"",
    "{rep}: \"Did you agree with the referee tonight?\"",
    "{rep}: \"{you}, how's the face? Honestly. It looks bad from here.\"",
    "{rep}: \"Are you thinking about changing camps?\"",
  ],
};
const PRESS_A: Record<string, string[]> = {
  humble: ["You thank God, your coach, your mom and the cleaning staff. In that order.", "\"Credit to {opp}. Tough guy. Back to the gym Monday.\" Nobody can clip it. That's the point.", "You keep it classy. Your sponsors love it. Bleeter is bored.", "\"I'm just a kid from {home} who works hard.\" A grandma in the third row cries."],
  trash: ["\"{opp} hits like a wet sandwich.\" The room explodes.", "You call {opp}'s cardio 'a rumour'. It's on every highlight show by midnight.", "\"I'd fight {opp} again for free. Actually, he should pay me.\"", "You say {opp}'s camp should be investigated for 'crimes against wrestling'."],
  callout: ["You look into the camera and name the man you want next. The arena gasps on cue.", "\"There's one guy I want. He knows who he is. It's {target}.\" {target}'s phone starts buzzing.", "You call out {target} and demand the main event. Somebody in matchmaking writes it down.", "\"{target}, I'm coming for that spot. Stop hiding behind your nutritionist.\""],
  joke: ["You answer every question with a cooking tip. The clip does 3 million views.", "\"I'm going to Disneyland.\" You are not going to Disneyland. You're going to the hospital, for a check.", "You ask the reporter a question back. He doesn't have an answer. Nobody does.", "You do the whole presser in a sombrero someone threw in. 1ton approves."],
  excuse: ["\"I had the flu, a hamstring, and a bad feeling.\" Nobody buys it.", "You blame the judges, the lights, and the canvas. The canvas has no comment.", "\"I was off tonight. Mentally. Physically. Spiritually. Financially.\"", "You say you broke your hand in round one. The X-ray says you didn't."],
};
const REPORTERS = ['Ariel Hell-Wani', 'The Pathetic Fight Desk', 'Cageside Carl', 'MMA Junkie-ish', 'Chisel Rudolph', 'Big Hen'];
/** After your fight: press scrum (and sometimes something else happens). Pushes events to answer back at the hub. */
export function fightNightEvents(s: GameState, ev: FightEvent, rng: Rng): void {
  const st = fm(s);
  const f = me(s);
  const b = ev.card.find((x) => x.a === f.id || x.b === f.id);
  const r = b?.result;
  if (!b || !r) return;
  const won = r.winner === f.id;
  const opp = s.fighters[b.a === f.id ? b.b : b.a];
  const mex = f.country === 'Mexico';
  // 1ton shows up at your scrum now and then (always, if you're Mexican)
  if (mex || rng.chance(0.3)) {
    // a question that fits the night (won or lost), with answers that answer it
    const pool = SCRUM.map((c, i) => [c, i] as const).filter(([c]) => c.mex === mex && (c.when === 'any' || c.when === (won ? 'win' : 'loss')));
    const [c, i] = rng.pick(pool);
    st.pending.push({
      id: 'fn1ton', title: '1TON HAS HIS HAND UP', text: c.q.replace(/\{you\}/g, f.last).replace(/\{opp\}/g, opp?.last ?? 'him'), portrait: 'rep:oneton',
      data: { convo: i },
      choices: c.choices.map((x) => ({ id: x.id, label: x.label })),
    });
  }
  const target = calloutTargets(s)[0];
  const q = rng.pick(PRESS_Q[won ? 'win' : 'loss']).replace(/\{rep\}/g, rng.pick(REPORTERS)).replace(/\{you\}/g, f.last).replace(/\{opp\}/g, opp.last);
  st.pending.push({
    id: 'fnpress', title: won ? 'POST-FIGHT PRESSER' : 'POST-FIGHT SCRUM', text: q, data: { opp: opp.id, target: target?.id ?? '' },
    choices: won
      ? [{ id: 'humble', label: 'Stay humble' }, { id: 'trash', label: `Trash ${opp.last}` }, ...(target ? [{ id: 'callout', label: `Call out ${target.last}` }] : []), { id: 'joke', label: 'Make a joke' }]
      : [{ id: 'humble', label: 'Give him credit' }, { id: 'excuse', label: 'Make excuses' }, { id: 'trash', label: 'Demand a rematch' }, { id: 'joke', label: 'Make a joke' }],
  });
  // something else happens on the night
  const extra = rng.next();
  if (extra < 0.15) st.pending.push({
    id: 'fnbottle', title: 'INCOMING WATER BOTTLE', data: { opp: opp.id },
    text: `On your way out, somebody from ${opp.last}'s corner throws a water bottle at your head. It misses. Mostly. The cameras are still rolling.`,
    choices: [{ id: 'throw', label: 'Throw it back' }, { id: 'point', label: 'Point at the scoreboard' }, { id: 'walk', label: 'Keep walking' }],
  });
  else if (extra < 0.3) st.pending.push({
    id: 'fnbradie', title: 'BRADIE IS IN THE TUNNEL', portrait: 'npc:bradie_taylor',
    text: `Bradie "Biggest Bird" Taylor, wearing sunglasses at night, holding a phone on a selfie stick: "BRO. Only Fighters live. Right now. You and me. Ten minutes. Bring the blood."`,
    choices: [{ id: 'live', label: 'Go live with Bradie' }, { id: 'no', label: '"Not tonight, Bradie"' }],
  });
  else if (extra < 0.42) st.pending.push({
    id: 'fnfan', title: 'A FAN JUMPED THE BARRIER',
    text: 'A man in a homemade shirt with your face on it gets past security and bear-hugs you in the tunnel. Security is coming. He is crying.',
    choices: [{ id: 'hug', label: 'Hug him back' }, { id: 'selfie', label: 'Take a selfie with him' }, { id: 'security', label: 'Let security handle it' }],
  });
  else if (extra < 0.52 && !won) st.pending.push({
    id: 'fndoc', title: 'COMMISSION DOCTOR',
    text: "The commission doctor shines a light in your eyes and frowns. \"I'm recommending a 30-day medical suspension. Or you could sign this saying you feel great.\"",
    choices: [{ id: 'rest', label: 'Take the suspension' }, { id: 'sign', label: 'Sign it. You feel great.' }],
  });
}

/** Resolve a fight-night event (press answers etc.). Returns null if it isn't one. */
function resolveFightNight(s: GameState, ev: FMEvent, choice: string, rng: Rng): string | null {
  const st = fm(s);
  const f = me(s);
  const hype = (n: number) => (f.hype = clamp(f.hype + n, 0, 100));
  const mor = (n: number) => (st.morale = clamp(st.morale + n, 0, 100));
  const opp = s.fighters[String(ev.data?.opp ?? '')];
  const fill = (t: string) => t.replace(/\{opp\}/g, opp?.last ?? 'him').replace(/\{you\}/g, f.last).replace(/\{home\}/g, f.hometown.split('|')[0]).replace(/\{target\}/g, s.fighters[String(ev.data?.target ?? '')]?.last ?? 'the champ');
  if (ev.id === 'fnpress') {
    const out = fill(rng.pick(PRESS_A[choice] ?? PRESS_A.humble));
    if (choice === 'humble') { mor(4); hype(1); }
    if (choice === 'trash') { hype(4); if (opp) heatUp(s, f.id, opp.id, 15); }
    if (choice === 'joke') { hype(2); mor(2); }
    if (choice === 'excuse') { hype(-3); mor(1); }
    if (choice === 'callout') {
      const t = s.fighters[String(ev.data?.target ?? '')];
      hype(6);
      if (t) {
        heatUp(s, f.id, t.id, 20);
        post(s, '@' + t.last.toLowerCase(), rng.pick(['saw that. sign the paper then.', 'lmao who', 'Be careful what you ask for.', 'Get in line, kid.']));
        if (!st.fight && !isSuspended(s) && rng.chance(0.4)) st.offers.unshift(offerVs(s, t, rng, 'Your callout at the presser landed. The matchmaker wants it.'));
      }
    }
    return out;
  }
  if (ev.id === 'fn1ton') {
    const c = SCRUM[Number((ev.data as { convo?: number } | undefined)?.convo ?? -1)];
    const ch = c?.choices.find((x) => x.id === choice);
    if (!c || !ch) {
      hype(2);
      return '1ton does not laugh. His beard laughs a little.';
    }
    const name = (t: string) => t.replace(/\{YOU\}/g, f.last.toUpperCase()).replace(/\{you\}/g, f.last.toLowerCase());
    if (choice === 'abuela') {
      // he checks
      hype(4);
      if (rng.chance(0.4)) { hype(-6); post(s, '@1ton', `I CHECKED. ${f.last.toUpperCase()}'S GRANDMA IS FROM OHIO. I HAVE NEVER BEEN SO BETRAYED.`); return '1ton investigates. Your grandma is from Ohio. He bleets about it for a week.'; }
      post(s, '@1ton', `${f.last.toUpperCase()} HAS A MEXICAN ABUELA. I KNEW IT. I ALWAYS KNEW IT.`);
      return '1ton gasps. "I KNEW IT." You are now, as far as 1ton is concerned, Mexican.';
    }
    hype(ch.hype);
    if (ch.morale) mor(ch.morale);
    if (ch.bleet) post(s, '@1ton', name(ch.bleet));
    return ch.out;
  }
  switch (ev.id + ':' + choice) {
    case 'fnbottle:throw': hype(6); if (opp) heatUp(s, f.id, opp.id, 20); if (rng.chance(0.4)) { st.money -= 1000; return 'Direct hit. The Commission fines you $1,000. The clip is everywhere. Worth it.'; } return 'You miss, hit a cameraman, apologise to the cameraman. The beef is very real now.';
    case 'fnbottle:point': hype(3); if (opp) heatUp(s, f.id, opp.id, 10); return 'You point at the scoreboard. Somebody makes it a meme within minutes.';
    case 'fnbottle:walk': mor(2); return 'You keep walking. Classy. Your coach is proud. The internet is bored.';
    case 'fnbradie:live': st.ofa.subs += 250 + f.hype * 4; hype(3); mor(-2); return `Ten minutes became forty. Bradie asked you to rate his afro (you gave it an 8). ${st.ofa.joined ? '+subscribers on Only Fighters.' : 'You aren\'t even on Only Fighters. He signed you up "as a guest".'}`;
    case 'fnbradie:no': return 'Bradie: "respect. respect. next time." He goes live with the cleaning staff instead.';
    case 'fnfan:hug': hype(3); mor(4); return 'You hug him back. Security waits. He says you changed his life. It goes viral (the good kind).';
    case 'fnfan:selfie': hype(4); return 'The selfie is incredible. He posts it with 40 fire emojis.';
    case 'fnfan:security': hype(-1); return 'Security drags him off. He is still waving. You feel a bit bad.';
    case 'fndoc:rest': st.suspendedUntil = Math.max(st.suspendedUntil, s.week + 4); st.offers = []; for (const p of BODY_PARTS) st.body[p.id] = clamp(st.body[p.id] + 8, 0, p.id === 'head' ? st.headCap : 100); return 'Four weeks on the shelf. Your brain thanks you.';
    case 'fndoc:sign': st.headCap = Math.max(55, st.headCap - 2); return 'You sign. You feel great. Your brain files a quiet complaint (head ceiling -2).';
  }
  return null;
}

/** Fighter Mode cageside: you watched somebody else's fight on your card. */
export function cagesideReact(s: GameState, winner: string, loser: string, choice: 'stare' | 'clap' | 'mock' | 'ignore', rng: Rng): string {
  const st = fm(s);
  const f = me(s);
  const w = s.fighters[winner];
  const l = s.fighters[loser];
  if (!w || !l) return '';
  switch (choice) {
    case 'stare': {
      heatUp(s, f.id, w.id, 18);
      f.hype = clamp(f.hype + 3, 0, 100);
      post(s, '@cageside_carl', `The camera caught ${f.last} STARING A HOLE through ${w.last} after that fight. We need this.`);
      const same = w.division === f.division && w.status === 'active' && w.promotion === f.promotion;
      if (same && !st.fight && !isSuspended(s) && rng.chance(0.45)) st.offers.unshift(offerVs(s, w, rng, 'The staredown went viral. Matchmaker wants it.'));
      return `You stood up and stared ${w.last} down. He saw it. Everybody saw it.`;
    }
    case 'clap':
      st.morale = clamp(st.morale + 2, 0, 100);
      return `You gave ${w.last} a respectful slow clap. Someone in the crowd yelled "KISS".`;
    case 'mock':
      heatUp(s, f.id, l.id, 15);
      f.hype = clamp(f.hype + 2, 0, 100);
      post(s, '@' + l.last.toLowerCase(), `saw ${f.last.toLowerCase()} laughing cageside. keep my name out your mouth`);
      return `You laughed at ${l.last} as he got up. He noticed. A rivalry is born.`;
    default:
      return 'You checked your phone. Riveting.';
  }
}

export function resolveEvent(s: GameState, choice: string, rng: Rng): string {
  const st = fm(s);
  const f = me(s);
  const ev = st.pending.shift();
  if (!ev) return '';
  const night = resolveFightNight(s, ev, choice, rng);
  if (night !== null) return night;
  const hype = (n: number) => (f.hype = clamp(f.hype + n, 0, 100));
  const mor = (n: number) => (st.morale = clamp(st.morale + n, 0, 100));
  switch (ev.id + ':' + choice) {
    case 'leak:context': hype(3); return 'The full clip shows you getting up and dropping him. Comments flip. W.';
    case 'leak:laugh': mor(3); hype(1); return 'You posted "lol yeah he got me" and the internet decided you were likeable.';
    case 'leak:fire': hype(4); mor(-3); return 'You called him a snake. Gyms across the city choose sides.';
    case 'barfight:lawyer':
      if (st.money < 3000) { st.pending.unshift(ev); return 'You do not have $3,000.'; }
      st.money -= 3000; log(s, 'Charges dropped. Your lawyer high-fived you in the lobby.', 0); rapSheet(s, 'ARREST', 'Arrested outside a nightclub. Charges dropped (lawyer: $3,000).'); return 'Charges dropped.';
    case 'barfight:plead': rapSheet(s, 'CHARGE', 'Disorderly conduct outside a nightclub. Pled out: 40 hours community service.'); hype(-3); mor(-6); st.ap = Math.max(0, st.ap - 1); log(s, 'Community service: picking up litter in a hi-vis vest. Someone filmed it.', -1); return '40 hours of community service.';
    case 'barfight:tough': hype(6); mor(-2); rapSheet(s, 'ARREST', 'Arrested outside a nightclub. Posted a defiant video about it.'); if (rng.chance(0.2)) { st.suspendedUntil = Math.max(st.suspendedUntil, s.week + 4); st.offers = []; rapSheet(s, 'SUSPENSION', '4 weeks: "conduct unbecoming of a man in a cage".'); log(s, 'The Commission suspended you for 4 weeks for "conduct unbecoming of a man in a cage".', -2); return 'The video went viral. So did the suspension.'; } return 'The video went viral. Fans love it. Lawyers hate it.';
    case 'ex:respond': hype(4); mor(-6); return 'You responded. Then she responded. Then her mom responded. Week ruined, hype up.';
    case 'ex:ignore': hype(-2); mor(-3); return 'You stayed silent. The internet took that as confirmation.';
    case 'ex:pay': st.money -= 400; mor(4); return 'You Venmo\'d $400 with the note "for the PlayStation". She posted it. Respect, somehow.';
    case 'sponsor:take': st.money += 2000; if (rng.chance(0.35)) { st.taint = 6; } return '+$2,000. The powder tastes like a battery.';
    case 'sponsor:pass': mor(2); return 'You passed. Probably smart. Definitely broke.';
    case 'test:pee': return drugTest(s, rng);
    case 'test:run': rapSheet(s, 'DOPING', 'Refused / dodged a drug test. Counted as a failure: 26-week suspension.'); st.suspendedUntil = s.week + 26; st.offers = []; cancelFight(s, 'You dodged a test: an automatic 6-month suspension.'); hype(-8); return 'Dodging a test counts as failing it. Six months on the shelf.';
    case 'calledout:fire': { const by = s.fighters[String(ev.data?.by)]; if (by) { heatUp(s, f.id, by.id, 20); hype(5); if (!st.fight && rng.chance(0.4)) st.offers.unshift(offerVs(s, by, rng, 'The beef sells. The matchmaker wants it.')); } return 'You fired back. It got ugly. The matchmaker is smiling.'; }
    case 'calledout:ignore': hype(-1); mor(2); return 'You ignored it. Classy. Boring.';
    case 'calledout:money': hype(3); return '"Pay me" is now your catchphrase. Merch incoming.';
    case 'calledout:record': { const by = s.fighters[String(ev.data?.by)]; if (by) heatUp(s, f.id, by.id, 12); hype(3); return 'You posted the records side by side. The math was rude.'; }
    case 'calledout:gym': { const by = s.fighters[String(ev.data?.by)]; if (by) heatUp(s, f.id, by.id, 6); mor(3); return rng.chance(0.5) ? 'He actually showed up. You both pretended to be friendly. Weird week.' : 'He did not show up. You posted the empty mat. Brutal.'; }
    case 'reply:double': { const by = s.fighters[String(ev.data?.by)]; if (by) { heatUp(s, f.id, by.id, 15); if (!st.fight && rng.chance(0.3)) st.offers.unshift(offerVs(s, by, rng, 'The beef sells. Bradie wants it.')); } hype(5); post(s, '@' + f.last.toLowerCase(), "Said what I said. Sign the paper."); return 'You doubled down. Bradie liked the post. Then unliked it. Then liked it again.'; }
    case 'reply:loss': { const by = s.fighters[String(ev.data?.by)]; if (by) heatUp(s, f.id, by.id, 22); hype(6); mor(-2); return 'You posted his worst loss in slow motion with sad violin music. Nuclear.'; }
    case 'reply:meme': hype(2); mor(2); return 'The clown emoji got 40k likes. He is furious. You are at peace.';
    case 'reply:bkb': { const by = s.fighters[String(ev.data?.by)]; hype(4); if (by) heatUp(s, f.id, by.id, 10); post(s, BRADIE.handle, 'ayo. bareknuckle. both of yall. my backyard. i have a hot tub'); return "You challenged him to Bradie's bareknuckle circuit. Bradie is very into it. The Commission is not."; }
    case 'reply:drop': mor(2); return 'You let it go. Growth.';
    case 'promo:plug':
    case 'promo:shorts': {
      const pay = Number(ev.data?.pay ?? 0) * (choice === 'shorts' ? 2 : 1);
      st.money += pay;
      if (st.fight) st.fight.sponsors = [String(ev.data?.name), ...(st.fight.sponsors ?? [])];
      if (choice === 'shorts') hype(-1);
      mor(1);
      post(s, '@' + f.last.toLowerCase(), `Big thanks to ${ev.data?.name} for presenting my fight!! ${choice === 'shorts' ? 'Logo on the shorts, baby.' : 'Link in bio.'}`);
      return `+${money(pay)}. ${ev.data?.name} is on the cage for your fight${choice === 'shorts' ? ' and on your shorts. The comments say "sellout". The bank says thank you.' : '.'}`;
    }
    case 'promo:no': mor(1); return 'You passed. Your integrity is intact. Your wallet is not.';
    case 'jimmy:cycle': return startPeds(s);
    case 'jimmy:vitamins':
      if (st.money < 300) return 'Jimmy: "No money, no vitamins, bro."';
      st.money -= 300;
      st.taint = 8;
      f.skills.power = clamp(f.skills.power + 1, 10, 99);
      f.skills.cardio = clamp(f.skills.cardio + 1, 10, 99);
      return 'The "vitamins" are a powder in a sandwich bag. You feel incredible and slightly radioactive. They will show up on a test.';
    case 'jimmy:no': mor(1); return 'Jimmy shrugs. "I\'ll be around." He always is.';
    case 'partner:yes': st.partner = { name: String(ev.data?.name), stage: 0, spars: 0, leaking: false, fake: false }; return `${st.partner.name} is your regular sparring partner now. Free, and he brings his own camera.`;
    case 'partner:no': return 'You passed. He looked strangely disappointed.';
    case 'snake:fire': { const n = st.partner?.name; st.partner = null; mor(4); log(s, `Fired sparring partner ${n} for selling your tape.`, 0); return `${n} is gone. He took the camera.`; }
    case 'snake:confront': { const n = st.partner?.name; if (rng.chance(0.5)) { st.partner = null; hype(3); return `You confronted ${n}. It got physical. He left. Somebody filmed it, obviously.`; } if (st.partner) st.partner.leaking = true; return `${n} swore on his mom it wasn't him. He's still leaking.`; }
    case 'snake:fake': if (st.partner) { st.partner.fake = true; st.partner.leaking = false; } hype(1); return 'You "accidentally" let him film you drilling a gameplan you will never use. Chess.';
  }
  return '';
}

function drugTest(s: GameState, rng: Rng): string {
  const st = fm(s);
  const f = me(s);
  const doping = st.ped.on || st.ped.weeks > 0;
  // a contaminated supplement (sketchy sponsor, Jimmy's "vitamins") shows up less often and
  // gets a reduced sanction: 8 weeks, and it doesn't count as a doping strike
  if (!doping && st.taint > 0 && rng.chance(0.15)) {
    st.suspendedUntil = Math.max(st.suspendedUntil, s.week + 8);
    st.offers = [];
    st.taint = 0;
    rapSheet(s, 'DOPING', 'Adverse finding from a contaminated supplement. Reduced sanction: 8 weeks.');
    f.hype = clamp(f.hype - 4, 0, 100);
    st.morale = clamp(st.morale - 8, 0, 100);
    cancelFight(s, 'CONTAMINATED SUPPLEMENT: suspended 8 weeks.');
    post(s, '@MMAJunkie_ish', `${fullName(f)} flagged for a contaminated supplement. Reduced 8-week sanction. Says the sponsor "seemed legit".`);
    return 'Your sponsor\'s powder had something in it. The commission believes you, mostly: 8 weeks on the shelf.';
  }
  if (doping && rng.chance(st.ped.on ? 0.75 : 0.35)) {
    st.ped.caught++;
    st.suspendedUntil = s.week + 26 * st.ped.caught;
    st.offers = [];
    rapSheet(s, 'DOPING', `Failed drug test (adverse finding #${st.ped.caught}). Suspended ${26 * st.ped.caught} weeks.`);
    f.hype = clamp(f.hype - 10, 0, 100);
    st.morale = clamp(st.morale - 15, 0, 100);
    cancelFight(s, `FAILED DRUG TEST: suspended ${26 * st.ped.caught} weeks.`);
    post(s, '@MMAJunkie_ish', `BREAKING: ${fullName(f)} flagged for a banned substance. Says it was "contaminated beef jerky".`);
    st.ped.on = false;
    return `You failed. Suspended ${26 * st.ped.caught} weeks. Your mom found out from Bleeter.`;
  }
  return 'Clean. The tester seemed disappointed.';
}

function cancelFight(s: GameState, why: string): void {
  const st = fm(s);
  if (st.fight) log(s, `Fight cancelled. ${why}`, -2);
  else log(s, why, -2);
  st.fight = null;
  st.offers = [];
}

// ---------------------------------------------------------------- paperwork (the inspect desk)

const LICENSED = ['Dr. A. Patel', 'Dr. M. Okoro', 'Dr. L. Chen', 'Dr. R. Silva'];
const BANNED = ['Ostarine', 'DMAA', 'Trenbolone', 'EPO', 'Clenbuterol'];
const docId = (s: GameState, rng: Rng) => `doc${s.week}_${rng.int(0, 1e6)}`;

/** The bout agreement for a fight you just took: does it match what you agreed? */
export function boutDoc(s: GameState, rng: Rng, o: FMOffer): FMDoc {
  const opp = s.fighters[o.opp];
  const lim = weightLimit(s);
  const fields: DocField[] = [
    { label: 'Opponent', value: fullName(opp) },
    { label: 'Fight week', value: `Week ${o.week + 1}` },
    { label: 'Rounds', value: String(o.rounds) },
    { label: 'Weight limit', value: `${lim} lbs` },
    { label: 'Purse', value: money(o.purse) },
    { label: 'Win bonus', value: money(o.win) },
    { label: 'Gloves', value: '4 oz MMA gloves' },
    { label: 'Rehydration', value: 'No limit' },
    { label: 'Fighter signature', value: sigOf(me(s)), kind: 'sig' },
  ];
  const ref = { title: 'WHAT YOU AGREED (offer + your file)', lines: fields.map((x) => ({ ...x })) };
  let fault: string | null = null;
  if (rng.chance(0.42)) {
    fault = rng.pick(['Purse', 'Win bonus', 'Rounds', 'Weight limit', 'Weight limit', 'Gloves', 'Rehydration', ...(fm(s).staff.manager > 0 ? ['Fighter signature'] : [])]);
    const f = fields.find((x) => x.label === fault)!;
    if (fault === 'Purse') f.value = money(Math.round(o.purse * 0.6 / 50) * 50);
    if (fault === 'Win bonus') f.value = money(0);
    if (fault === 'Rounds') f.value = o.rounds === 5 ? '7' : '5';
    // the weight is wrong one way or the other: 10 lbs under your division, or a catchweight for a bigger man
    if (fault === 'Weight limit') f.value = rng.chance(0.5) ? `${lim - 10} lbs` : `${lim + 8} lbs (catchweight)`;
    if (fault === 'Gloves') f.value = 'Hand wraps only (bareknuckle rules)';
    if (fault === 'Rehydration') f.value = 'Max 10% regain (re-weighed fight morning)';
    if (fault === 'Fighter signature') f.value = sigOf(me(s), 2);
    f.bad = true;
  }
  return { id: docId(s, rng), kind: 'bout', title: 'BOUT AGREEMENT', from: fm(s).tier === 'of' ? 'CBFC matchmaking' : stage(s).name, fields, ref, fault, week: s.week };
}

/** Your manager's statement after a fight. Shady managers skim. */
export function statementDoc(s: GameState, rng: Rng, gross: number): FMDoc {
  const st = fm(s);
  const pct = [0, 10, 15, 20][st.staff.manager];
  const fee = Math.round((gross * pct) / 100);
  const fields: DocField[] = [
    { label: 'Gross purse', value: money(gross) },
    { label: 'Manager rate', value: `${pct}%` },
    { label: 'Manager fee', value: money(fee) },
    { label: 'Expenses', value: 'Hand wraps, tape, gas: ' + money(120) },
    { label: 'Net to you', value: money(gross - fee - 120) },
  ];
  const ref = { title: `CONTRACT: ${st.staffNames.manager}`, lines: [{ label: 'Gross purse', value: money(gross) }, { label: 'Manager rate', value: `${pct}%` }, { label: 'Allowed expenses', value: 'Wraps, tape, travel. Nothing else.' }] };
  let fault: string | null = null;
  let skim = 120;
  if (rng.chance(st.shady.manager ? 0.6 : 0.1)) {
    fault = rng.pick(['Manager fee', 'Expenses', 'Manager rate']);
    if (fault === 'Manager fee') {
      const bad = Math.round((gross * (pct + 10)) / 100);
      fields[2] = { label: 'Manager fee', value: money(bad), bad: true };
      skim += bad - fee;
    } else if (fault === 'Expenses') {
      const extra = rng.pick([['Jet ski (business)', 2400], ['"Consulting" (his cousin)', 1500], ['Steakhouse, party of 11', 1100]] as [string, number][]);
      fields[3] = { label: 'Expenses', value: `${extra[0]}: ${money(extra[1])}`, bad: true };
      skim += extra[1];
    } else {
      fields[1] = { label: 'Manager rate', value: `${pct + 5}%`, bad: true };
      const bad = Math.round((gross * (pct + 5)) / 100);
      fields[2] = { label: 'Manager fee', value: money(bad) };
      skim += bad - fee;
    }
    fields[4] = { label: 'Net to you', value: money(gross - fee - skim) };
  }
  return { id: docId(s, rng), kind: 'statement', title: 'MANAGER STATEMENT', from: st.staffNames.manager, fields, ref, fault, week: s.week, data: { skim: skim - 120 } };
}

/** Your opponent's pre-fight medicals: are they real? */
export function medicalDoc(s: GameState, rng: Rng): FMDoc | null {
  const st = fm(s);
  if (!st.fight) return null;
  const opp = s.fighters[st.fight.opp];
  const fields: DocField[] = [
    { label: 'Fighter', value: fullName(opp) },
    { label: 'Age', value: String(opp.age) },
    { label: 'Exam date', value: `Week ${Math.max(1, s.week - rng.int(1, 8))}` },
    { label: 'Eye exam', value: 'PASS' },
    { label: 'MRI', value: 'CLEAR' },
    { label: 'Signed', value: rng.pick(LICENSED) },
  ];
  let fault: string | null = null;
  if (rng.chance(0.3)) {
    fault = rng.pick(['Age', 'Exam date', 'Signed']);
    const f = fields.find((x) => x.label === fault)!;
    if (fault === 'Age') f.value = String(opp.age - rng.int(4, 9));
    if (fault === 'Exam date') f.value = `Week ${Math.max(1, s.week - rng.int(30, 60))}`;
    if (fault === 'Signed') f.value = rng.pick(['Dr. Feelgood', 'Dr. Steve (chiropractor)', 'Dr. Dre', 'Nurse Kevin']);
    f.bad = true;
  }
  return {
    id: docId(s, rng), kind: 'medical', title: 'OPPONENT MEDICALS', from: 'State Athletic Commission (copy)', fields, fault, week: s.week,
    ref: { title: 'OPPONENT FILE + RULES', lines: [{ label: 'Fighter', value: fullName(opp) }, { label: 'Age', value: String(opp.age) }, { label: 'Rule', value: `Exams within 26 weeks (now: week ${s.week + 1})` }, { label: 'Licensed docs', value: LICENSED.join(', ') }] },
  };
}

/** A sponsor deal. Some are real money; some are a man in sunglasses indoors. */
export function sponsorDoc(s: GameState, rng: Rng): FMDoc {
  const company = rng.pick(['GAINZ-X', 'TestoTea', 'CryptoKicks', 'Mama Rosa\'s Meatballs', 'RazorBurn Energy', 'Kevin\'s Mattress World']);
  const pay = rng.int(4, 12) * 250;
  const fields: DocField[] = [
    { label: 'Company', value: company },
    { label: 'Product', value: rng.pick(['Pre-workout', 'Energy drink', 'Protein bar', 'Mattress', 'Meatballs']) },
    { label: 'Ingredients', value: rng.pick(['Caffeine, beet juice', 'Whey, sugar, regret', 'Foam, springs', 'Beef, love']) },
    { label: 'Payment', value: money(pay) },
    { label: 'Paid on', value: 'Signing' },
  ];
  let fault: string | null = null;
  if (rng.chance(0.5)) {
    fault = rng.pick(['Ingredients', 'Payment', 'Paid on']);
    const f = fields.find((x) => x.label === fault)!;
    if (fault === 'Ingredients') f.value = `Caffeine, ${rng.pick(BANNED)} ("natural")`;
    if (fault === 'Payment') f.value = `${(pay * 40).toLocaleString()} MoonPup tokens`;
    if (fault === 'Paid on') f.value = 'After your 12th title defence';
    f.bad = true;
  }
  return {
    id: docId(s, rng), kind: 'sponsor', title: 'SPONSORSHIP DEAL', from: company, fields, fault, week: s.week, data: { pay },
    ref: { title: 'COMMISSION + COMMON SENSE', lines: [{ label: 'Banned list', value: BANNED.join(', ') }, { label: 'Payment', value: 'Real money only' }, { label: 'Paid on', value: 'Signing, or within 30 days' }] },
  };
}

const OF_CLAUSES: { id: string; label: string; value: string }[] = [
  { id: 'of_split', label: 'Revenue split', value: 'Creator 30% / Bradie 70% ("for server costs and vibes")' },
  { id: 'of_likeness', label: 'Likeness', value: 'Bradie owns your face, voice and "aura" forever, incl. 10% of fight purses' },
  { id: 'of_quota', label: 'Content quota', value: '7 shirtless videos a week or a $400 "sadness fee"' },
];
const BK_CLAUSES: { id: string; label: string; value: string }[] = [
  { id: 'bk_credits', label: 'Purse', value: 'Paid 50% in Only Fighters credits (not money)' },
  { id: 'bk_dale', label: 'Availability', value: "Fighter will fight Bradie's cousin Dale whenever Dale is upset" },
];

/** Bradie's Only Fighters creator contract: what he said on the phone vs what he sent. */
export function ofDeal(s: GameState, rng: Rng): FMDoc {
  const fields: DocField[] = [
    { label: 'Creator', value: fullName(me(s)) },
    { label: 'Revenue split', value: 'Creator 70% / Bradie 30%' },
    { label: 'Likeness', value: 'Only Fighters may use your name on the site' },
    { label: 'Content quota', value: 'Post whenever you want' },
    { label: 'Signed', value: 'Bradie "Biggest Bird" Taylor, CEO (drew a bird)' },
  ];
  let fault: string | null = null;
  let clause = '';
  if (rng.chance(0.8)) {
    const c = rng.pick(OF_CLAUSES);
    fault = c.label;
    clause = c.id;
    const f = fields.find((x) => x.label === c.label)!;
    f.value = c.value;
    f.bad = true;
  }
  return {
    id: docId(s, rng), kind: 'ofdeal', title: 'ONLY FIGHTERS CREATOR DEAL', from: BRADIE.name, fields, fault, week: s.week, data: { clause },
    ref: { title: 'WHAT BRADIE SAID ON THE PHONE', lines: [{ label: 'Split', value: '"70 for you bro, 30 for me, easy"' }, { label: 'Likeness', value: '"we just put your name on the site"' }, { label: 'Posting', value: '"post whenever, no pressure, i barely post"' }] },
  };
}

/** Bradie's bareknuckle contract. Equally strange. */
export function bkDeal(s: GameState, rng: Rng): FMDoc {
  const fields: DocField[] = [
    { label: 'Fighter', value: fullName(me(s)) },
    { label: 'Purse', value: 'Cash, paid on the night' },
    { label: 'Availability', value: 'You choose your fights' },
    { label: 'Medical', value: 'There is a guy with a first aid kit' },
    { label: 'Signed', value: 'Bradie "Biggest Bird" Taylor, Promoter (drew a bird)' },
  ];
  let fault: string | null = null;
  let clause = '';
  if (rng.chance(0.75)) {
    const c = rng.pick(BK_CLAUSES);
    fault = c.label;
    clause = c.id;
    const f = fields.find((x) => x.label === c.label)!;
    f.value = c.value;
    f.bad = true;
  }
  return {
    id: docId(s, rng), kind: 'bkdeal', title: "BRADIE'S BAREKNUCKLE CONTRACT", from: BRADIE.name, fields, fault, week: s.week, data: { clause },
    ref: { title: 'WHAT BRADIE SAID', lines: [{ label: 'Money', value: '"cash bro. paper bag. the real stuff"' }, { label: 'Fights', value: '"you pick who you fight, its chill"' }, { label: 'Medical', value: '"we have a guy"' }] },
  };
}

export const hasClause = (s: GameState, c: string) => fm(s).clauses.includes(c);

/** Ask Bradie for an Only Fighters account: the contract lands in your paperwork. */
export function askOnlyFighters(s: GameState, rng: Rng): string {
  const st = fm(s);
  if (st.ofa.joined || st.ofa.asked) return '';
  st.ofa.asked = true;
  st.inbox.push(ofDeal(s, rng));
  return 'Bradie sent the Only Fighters contract over. Read it before you sign it. Seriously.';
}

/** Post content on Only Fighters (uses an action). */
export function postContent(s: GameState, rng: Rng): string {
  const st = fm(s);
  const f = me(s);
  if (st.ap <= 0) return 'No time left this week.';
  st.ap--;
  const gain = Math.round((40 + f.hype * 6 + st.ofa.subs * 0.08) * rng.float(0.7, 1.4));
  st.ofa.subs += gain;
  st.ofa.posted = true;
  f.hype = clamp(f.hype + 1, 0, 100);
  const what = rng.pick(['a shirtless ice bath', 'you eating 14 eggs', 'a "day in the life" that is mostly naps', 'sparring footage (the good parts)', 'a Q&A where you answer one question', 'your feet. They paid for your feet.']);
  return `Posted ${what} on Only Fighters: +${gain} subscribers.`;
}

/** Weekly Only Fighters payout (and the clause damage). */
function ofWeek(s: GameState, rng: Rng, out: string[]): void {
  const st = fm(s);
  if (!st.ofa.joined) return;
  st.ofa.subs = Math.max(0, Math.round(st.ofa.subs * (st.ofa.posted ? 1.01 : 0.97)));
  const split = hasClause(s, 'of_split') ? 0.3 : 0.7;
  const pay = Math.round(st.ofa.subs * 0.9 * split);
  if (pay > 0) {
    st.money += pay;
    out.push(`Only Fighters payout: +${money(pay)} (${st.ofa.subs} subs${hasClause(s, 'of_split') ? ', Bradie keeps 70%' : ''}).`);
  }
  if (hasClause(s, 'of_quota') && !st.ofa.posted) {
    st.money -= 400;
    out.push('Only Fighters "sadness fee" for not posting: -$400.');
  }
  st.ofa.posted = false;
  if (hasClause(s, 'bk_dale') && rng.chance(0.12)) {
    st.body.head = clamp(st.body.head - rng.int(5, 14), 0, st.headCap);
    st.body.rhand = clamp(st.body.rhand - rng.int(4, 10), 0, 100);
    st.energy = clamp(st.energy - 15, 0, 100);
    out.push(rng.pick(["Bradie's cousin Dale got upset. Contract says you fight him. You fought him in a Denny's parking lot.", 'Dale was upset again (his fantasy team lost). You had to fight him. He bites.']));
  }
}

/** Jimmy Quavo turns up (fighter mode). */
export const JIMMY = { name: 'Jimmy Quavo', portrait: 'npc:jimmy_quavo' };

/** The reference line a bad document line has to be compared with, and what's wrong (shown on a match). */
const PAIRS: Record<string, Record<string, [string, string]>> = {
  bout: {
    Purse: ['Purse', 'The purse is lower than the one you agreed.'],
    'Win bonus': ['Win bonus', 'The win bonus is not what you agreed.'],
    Rounds: ['Rounds', 'They added rounds you never agreed to.'],
    'Weight limit': ['Weight limit', "That's not your division's limit. Sign it and that's the weight you have to make."],
    Gloves: ['Gloves', "It says no gloves. That's a bareknuckle fight with extra steps."],
    Rehydration: ['Rehydration', "A rehydration clause. You'd be re-weighed fight morning and fight dry."],
    'Fighter signature': ['Fighter signature', "That's not your signature. Somebody signed for you."],
  },
  statement: {
    'Manager fee': ['Manager rate', "The fee doesn't match the rate in his contract."],
    Expenses: ['Allowed expenses', "That expense isn't allowed under his contract."],
    'Manager rate': ['Manager rate', 'He changed his own percentage.'],
  },
  medical: {
    Age: ['Age', "The age doesn't match the fighter's file."],
    'Exam date': ['Rule', 'The exam is older than 26 weeks.'],
    Signed: ['Licensed docs', "That doctor isn't licensed by the Commission."],
  },
  sponsor: {
    Ingredients: ['Banned list', 'It contains a banned substance.'],
    Payment: ['Payment', "That's not money. That's MoonPup tokens."],
    'Paid on': ['Paid on', "You'd get paid after your 12th title defence. So, never."],
  },
  ofdeal: {
    'Revenue split': ['Split', "That's not the split Bradie promised. It's backwards."],
    Likeness: ['Likeness', 'He owns your face and takes a cut of your purses. Forever.'],
    'Content quota': ['Posting', "There's a posting quota with a fine. He said post whenever."],
  },
  bkdeal: {
    Purse: ['Money', "Half the purse is in Only Fighters credits, not cash."],
    Availability: ['Fights', "You'd have to fight his cousin Dale whenever Dale is upset."],
  },
};

/** Compare a document line with a reference line: the problem, if those two lines are the bad pair. */
export function comparePair(d: FMDoc, docLabel: string, refLabel: string): string | null {
  if (!d.fault || docLabel !== d.fault) return null;
  const p = PAIRS[d.kind]?.[d.fault];
  return p && p[0] === refLabel ? p[1] : null;
}

/** Sign the document as is, or dispute the fields you flagged. */
export function resolveDoc(s: GameState, id: string, action: 'sign' | 'dispute', flagged: string[], rng: Rng): { text: string; good: boolean } {
  const st = fm(s);
  const f = me(s);
  const i = st.inbox.findIndex((d) => d.id === id);
  if (i < 0) return { text: '', good: false };
  const d = st.inbox.splice(i, 1)[0];
  const caught = action === 'dispute' && !!d.fault && flagged.includes(d.fault);
  const wrong = action === 'dispute' && !caught;
  if (caught) stats(s).docsCaught++;
  if (action === 'sign' && d.fault) stats(s).badSigned++;
  if (caught) {
    f.hype = clamp(f.hype + 1, 0, 100);
    st.morale = clamp(st.morale + 3, 0, 100);
    switch (d.kind) {
      case 'bout': return { text: `Caught it: the ${d.fault!.toLowerCase()} was wrong. The promoter sends a corrected copy and a fruit basket.`, good: true };
      case 'ofdeal':
      case 'bkdeal':
        if (d.kind === 'ofdeal') st.ofa.joined = true;
        else st.bk.signed = true;
        return { text: `You crossed out "${d.fields.find((x) => x.label === d.fault)?.value}". Bradie, on speaker: "ok ok ok. fine. my lawyer is my cousin, he gets excited." Signed without it.`, good: true };
      case 'statement': return { text: `Caught ${st.staffNames.manager} skimming ${money(Number(d.data?.skim ?? 0))}. He "found" the money. Maybe find a new manager (STAFF).`, good: true };
      case 'medical':
        st.oppFlagged = true;
        post(s, '@MMAJunkie_ish', `REPORT: ${fullName(s.fighters[st.fight?.opp ?? ''] ?? f)} ordered to redo medicals after "paperwork irregularities". Fight still on, per sources.`);
        return { text: 'The Commission orders new medicals. Turns out your opponent is carrying an injury he hid. He fights compromised.', good: true };
      case 'sponsor': return { text: `Good catch. ${d.from} was a scam. The man in the sunglasses has vanished.`, good: true };
    }
  }
  if (wrong) {
    st.morale = clamp(st.morale - 2, 0, 100);
    if (d.kind === 'sponsor') return { text: `You turned down ${d.from}. It was legit. That was ${money(Number(d.data?.pay ?? 0))}.`, good: false };
    if (d.kind === 'ofdeal' || d.kind === 'bkdeal') {
      post(s, BRADIE.handle, `bro why is ${f.last.toLowerCase()} sending me legal letters. the contract was fine. chill`);
      if (d.fault) {
        if (d.kind === 'ofdeal') st.ofa.joined = true;
        else st.bk.signed = true;
        st.clauses.push(d.data?.clause as string);
        rapSheet(s, 'CONTRACT', `Signed ${d.title.toLowerCase()} with a bad clause: "${d.fields.find((x) => x.label === d.fault)?.value}".`);
        return { text: 'You crossed out the wrong line. Bradie signs it "with love" and the weird clause stays in.', good: false };
      }
      if (d.kind === 'ofdeal') st.ofa.joined = true;
      else st.bk.signed = true;
      return { text: 'Nothing was wrong with it. Bradie is hurt. He signs it anyway and sends a crying emoji.', good: false };
    }
    if (d.kind === 'statement') return { text: `You accused ${st.staffNames.manager} of skimming${d.fault ? ' (wrong line)' : ''}. ${d.fault ? 'He was, just not there. He keeps the money.' : 'He wasn\'t. Awkward Christmas.'}`, good: false };
    if (d.fault) return { text: `You disputed the wrong line. The bad ${d.fault.toLowerCase()} went through anyway.`, good: false };
    return { text: 'Nothing was wrong with it. You look paranoid. It gets signed anyway.', good: false };
  }
  // signed
  if (d.kind === 'sponsor') {
    if (!d.fault) {
      st.money += Number(d.data?.pay ?? 0);
      return { text: `+${money(Number(d.data?.pay ?? 0))} from ${d.from}. You have to say their name in interviews now.`, good: true };
    }
    if (d.fault === 'Ingredients') {
      st.money += Number(d.data?.pay ?? 0);
      st.taint = 8;
      return { text: `+${money(Number(d.data?.pay ?? 0))}. The product contains a banned substance. You've been drinking it. Pray nobody tests you.`, good: false };
    }
    return { text: `You signed. ${d.fault === 'Payment' ? 'You were paid in MoonPup tokens. They are worth $3.' : 'The money arrives after your 12th title defence. So, never.'}`, good: false };
  }
  if (d.kind === 'ofdeal' || d.kind === 'bkdeal') {
    if (d.kind === 'ofdeal') st.ofa.joined = true;
    else st.bk.signed = true;
    if (!d.fault) return { text: d.kind === 'ofdeal' ? "You're on Only Fighters. Fair split, no weird stuff. Bradie seems almost disappointed." : "You're on Bradie's bareknuckle roster. Normal contract, somehow.", good: true };
    st.clauses.push(d.data?.clause as string);
    rapSheet(s, 'CONTRACT', `Signed ${d.title.toLowerCase()} with a bad clause: "${d.fields.find((x) => x.label === d.fault)?.value}".`);
    return { text: `Signed. You missed one: "${d.fields.find((x) => x.label === d.fault)?.value}". That's legally binding now.`, good: false };
  }
  if (!d.fault) return { text: 'Signed. Everything was in order.', good: true };
  return { text: applyBadDoc(s, d), good: false };
}

function applyBadDoc(s: GameState, d: FMDoc): string {
  const st = fm(s);
  if (d.kind === 'statement') {
    const sk = Number(d.data?.skim ?? 0);
    st.money -= sk;
    return `Signed. ${st.staffNames.manager} quietly skimmed ${money(sk)} off your purse.`;
  }
  if (d.kind === 'bout' && st.fight) {
    rapSheet(s, 'CONTRACT', `Signed a bout agreement without reading it: ${d.fault!.toLowerCase()} was "${d.fields.find((x) => x.label === d.fault)?.value}".`);
    if (d.fault === 'Purse') st.fight.purse = Math.round(st.fight.purse * 0.6 / 50) * 50;
    if (d.fault === 'Win bonus') st.fight.win = 0;
    if (d.fault === 'Rounds') st.fight.rounds = 5;
    if (d.fault === 'Gloves') {
      st.fight.bare = true;
      return 'Signed. You agreed to fight with hand wraps only. The Commission says a signed agreement is a signed agreement. Bring a mouthguard and a dentist.';
    }
    if (d.fault === 'Rehydration') {
      st.fight.rehydro = true;
      return "Signed. There's a rehydration clause: you get re-weighed fight morning and can't put the water back on. A big cut will leave you flat.";
    }
    if (d.fault === 'Weight limit') {
      const v = d.fields.find((x) => x.label === 'Weight limit')?.value ?? '';
      const lbs = parseInt(v, 10);
      st.fight.limit = lbs || undefined;
      if (/catchweight/.test(v)) {
        st.fight.heavyOpp = true;
        return `Signed. It's a ${lbs} lb catchweight and it's legally binding. He gets to come in 8 lbs heavier, and so do you. He's the bigger man on the night.`;
      }
      return `Signed. You are now contractually obliged to make ${lbs} lbs: 10 under your division. It's legally binding. Start cutting.`;
    }
    return `Signed. The ${d.fault!.toLowerCase()} was wrong, and now it's legally binding.`;
  }
  return 'Signed. The paperwork was doctored; nobody noticed.';
}

// ---------------------------------------------------------------- end of week

/** Sign anything that sat in the inbox too long (you agreed to it by not reading it). */
function autoSign(s: GameState, rng: Rng, all = false): string[] {
  const st = fm(s);
  const out: string[] = [];
  for (const d of st.inbox.slice()) {
    if (!all && s.week - d.week < 2) continue;
    if (d.kind === 'medical') {
      st.inbox = st.inbox.filter((x) => x !== d);
      continue;
    }
    const r = resolveDoc(s, d.id, 'sign', [], rng);
    if (!r.good) out.push(`Unread paperwork: ${r.text}`);
  }
  return out;
}

/** Fight week: unread paperwork gets signed as is. */
export function fightWeekPaperwork(s: GameState, rng: Rng): string[] {
  return autoSign(s, rng, true);
}

/** Everything that happens between weeks. Returns report lines for the next week's screen. */
export function endWeek(s: GameState, rng: Rng): string[] {
  const st = fm(s);
  const f = me(s);
  const out: string[] = [];
  out.push(...autoSign(s, rng));
  // sauna water comes back unless you weigh in
  if (st.water > 0) {
    st.walkWeight = Math.round((st.walkWeight + st.water * 0.7) * 10) / 10;
    st.water = 0;
  }
  // wages & manager cut handled at fight time
  const wages = weeklyStaffCost(s);
  st.money -= wages;
  if (wages) out.push(`Staff wages: -${money(wages)}.`);
  if (st.money < 0) {
    st.morale = clamp(st.morale - 6, 0, 100);
    out.push('You are in the red. The bank keeps calling.');
    if (st.money < -3000) st.undergroundOpen = true;
  }
  // diet & weight drift
  const drift = st.diet === 'clean' ? -0.8 : st.diet === 'junk' ? 1.2 : 0.1;
  st.walkWeight = Math.round((st.walkWeight + drift * (st.staff.nutrition >= 2 ? 0.8 : 1)) * 10) / 10;
  st.money -= st.diet === 'clean' ? 140 + st.staff.nutrition * 30 : st.diet === 'balanced' ? 80 : 35;
  // recovery
  const heal = 3 + st.staff.nutrition * 1.5 + (st.diet === 'clean' ? 1.5 : 0);
  for (const p of BODY_PARTS) st.body[p.id] = clamp(st.body[p.id] + heal, 0, p.id === 'head' ? st.headCap : 100);
  st.energy = clamp(st.energy + 22 + st.staff.nutrition * 3 + (st.diet === 'junk' ? -6 : 0), 0, 100);
  st.morale = clamp(st.morale + (st.morale < 50 ? 2 : -1), 0, 100);
  // PEDs
  if (st.ped.on) {
    st.ped.weeks++;
    f.damage = clamp(f.damage + 0.4, 0, 100);
  } else if (st.ped.weeks > 0) st.ped.weeks = Math.max(0, st.ped.weeks - 2);
  st.taint = Math.max(0, st.taint - 1);
  // aging
  if (s.week > 0 && s.week % 52 === 0) {
    f.age++;
    out.push(`Happy birthday. You're ${f.age}.`);
    if (f.age > 33) for (const k of ['striking', 'power', 'cardio', 'chin', 'durability'] as (keyof Skills)[]) f.skills[k] = clamp(f.skills[k] - rng.float(0.5, 2), 10, 99);
  }
  // faces heal (yours at the speed your cutman/clinic allows), injuries expire
  for (const x of Object.values(s.fighters)) {
    healWeek(x, rng);
    if (x.injuries.length) x.injuries = x.injuries.filter((i) => i.until > s.week);
  }
  // the rest of the league fights
  out.push(...leagueWeek(s, rng));
  const before = rankOf(s, f.id);
  computeRankings(s);
  const after = rankOf(s, f.id);
  if (before !== after) out.push(after === null ? 'You dropped out of the rankings.' : before === null ? `You're ranked! #${after} at ${divisionName(f.division)}.` : after < before ? `You moved up to #${after}.` : `You slipped to #${after}.`);
  s.week++;
  st.ap = 3;
  // your own gym (Legacy Mode)
  const gl = gymWeek(s);
  if (gl) out.push(gl);
  // the story, your team, the press
  storyWeek(s);
  const chk = staffCheckin(s, rng);
  if (chk) pushMoment(s, chk);
  if (st.fight && st.fight.week === s.week) {
    const iv = interviewMoment(s, rng, 'pre');
    if (iv) pushMoment(s, iv);
  }
  // controversy & life (Legacy Mode: a lot more of it)
  if (!st.pending.length) {
    const roll = rng.next();
    const r = (0.16 + st.partied * 0.03) * (isLegacy(s) ? 1.8 : 1);
    if (roll < r * 0.3) st.pending.push(EVENTS.ex(s, rng));
    else if (roll < r * 0.55) st.inbox.push(sponsorDoc(s, rng));
    else if (roll < r && rankOf(s, f.id) !== null) {
      const by = calloutTargets(s).filter((x) => x.traits.includes('Trash Talker') || rng.chance(0.4));
      if (by.length) st.pending.push(EVENTS.callout(s, rng, rng.pick(by)));
    }
    const testP = (st.fight && st.fight.week - s.week <= 4 ? 0.12 : 0.04) + (rankOf(s, f.id) !== null && rankOf(s, f.id)! <= 5 ? 0.04 : 0);
    if (rng.chance(testP)) st.pending.push(EVENTS.test(s));
  }
  st.partied = Math.max(0, st.partied - 1);
  if (s.week >= 4) st.undergroundOpen = true;
  if (s.week - st.marketWeek >= 4) refreshMarket(s, rng);
  ofWeek(s, rng, out);
  // a company sponsoring your next event wants you to plug it
  if (st.fight && !st.fight.promoAsked && st.fight.week - s.week <= 3 && rng.chance(0.45)) {
    st.fight.promoAsked = true;
    const pool = st.tier === 'amateur' ? LOCAL_SPONSORS : st.tier === 'regional' ? REGIONAL_SPONSORS : content().sponsors.map((x) => x.name.replace(/ \(.*\)$/, ''));
    const name = rng.pick(pool);
    const pay = { amateur: 200, regional: 900, pfl: 3500, of: 9000 }[st.tier] * rng.float(0.8, 1.3);
    st.pending.push({
      id: 'promo', title: 'A SPONSOR WANTS A PLUG', data: { name, pay: Math.round(pay / 50) * 50 },
      text: `${name} is sponsoring your next event and wants you to promote it: three posts, a video "in your own words" (they wrote the words) and a mention at the weigh-in. ${money(Math.round(pay / 50) * 50)}. Double if their logo goes on your shorts.`,
      choices: [{ id: 'plug', label: 'Plug it' }, { id: 'shorts', label: 'Plug it + logo on the shorts' }, { id: 'no', label: 'No thanks' }],
    });
  }
  if (!st.ped.on && !st.pending.some((e) => e.id === 'jimmy') && rng.chance(s.week < 3 ? 0 : 0.06)) st.pending.push(EVENTS.jimmy(s, rng));
  if (st.tier === 'of' && !st.ofa.asked && rng.chance(0.25)) {
    st.ofa.asked = true;
    st.inbox.push(ofDeal(s, rng));
    post(s, BRADIE.handle, `${me(s).last.toLowerCase()} check ur paperwork bro. only fighters wants u. 70/30. easy money. read it tho. or dont. lol`);
  }
  if (rng.chance(0.12)) st.inbox.push(sponsorDoc(s, rng));
  if (st.fight && st.fight.week === s.week) {
    const md = medicalDoc(s, rng);
    if (md) st.inbox.push(md);
  }
  if (st.inbox.length) out.push(`${st.inbox.length} document${st.inbox.length > 1 ? 's' : ''} waiting in your PAPERWORK.`);
  makeOffers(s, rng);
  storyOffers(s, rng);
  if (st.offers.length && !st.fight) out.push(`${st.offers.length} fight offer${st.offers.length > 1 ? 's' : ''} on the table.`);
  if (rng.chance(0.55)) post(s, BRADIE.handle, rng.pick(BRADIE_BLEETS).replace(/\{you\}/g, f.last.toLowerCase()));
  // bleets about you
  if (rng.chance(0.5 + f.hype / 200)) post(s, '@' + rng.pick(['mmaguru_99', 'cageside_carl', 'jabjabjabby', 'notafedd', 'chokeartist']), rng.pick([
    `${f.last} is going to be a problem in 2 years. Remember I said it.`,
    `Overrated. ${f.last} has fought nobody.`,
    `${f.last}'s walkout song goes hard ngl`,
    `I'd pay to watch ${f.last} fight a kangaroo`,
    `${f.last} cardio check pending`,
  ]));
  st.weekReport = out;
  return out;
}

/** Simulate a handful of bouts around the league so rankings breathe. */
function leagueWeek(s: GameState, rng: Rng): string[] {
  const out: string[] = [];
  const st = fm(s);
  const ev: FightEvent = { id: 'lg' + s.week, name: `CBFC Fight Night ${s.week + 1}`, number: null, week: s.week, venue: 'ape_x', region: 'na', card: [], status: 'done', ppv: false, notes: ['league'] };
  const divs = rng.sample(s.divisionsOpen, Math.min(3, s.divisionsOpen.length));
  for (const d of divs) {
    const wall = (s.rankings[d] ?? []).map((id) => s.fighters[id]).filter((x) => x && x.id !== st.player && x.id !== st.fight?.opp && x.status === 'active' && !isBoss(x.id));
    if (wall.length < 2) continue;
    const i = rng.int(0, wall.length - 2);
    const a = wall[i];
    const b = wall[Math.min(wall.length - 1, i + rng.int(1, 3))];
    if (!a || !b || a.id === b.id) continue;
    const bout: Bout = makeBout(s, ev, a, b, 0, null);
    runBout(s, ev, bout, rng, false);
    applyBout(s, ev, bout, rng);
    const r = bout.result!;
    if (r.winner) out.push(`${s.fighters[r.winner].last} def. ${s.fighters[r.loser!].last} (${r.method}, R${r.round}).`);
  }
  return out;
}

// ---------------------------------------------------------------- fight week

export function fightThisWeek(s: GameState): boolean {
  const st = fm(s);
  return !!st.fight && st.fight.week <= s.week;
}

export type CutChoice = 'easy' | 'hard' | 'miss';

/** Weigh-in: how much you have to cut and what each option costs. */
export function weighInInfo(s: GameState): { need: number; risk: number } {
  const st = fm(s);
  const need = Math.max(0, st.walkWeight - contractLimit(s));
  const skill = me(s).skills.weightCut / 100;
  const risk = clamp((need - 8 - st.staff.nutrition * 3) / 18 + skill * 0.12, 0, 0.95);
  return { need: Math.round(need * 10) / 10, risk };
}

export function doWeighIn(s: GameState, choice: CutChoice, rng: Rng): { made: boolean; text: string } {
  const st = fm(s);
  const { need, risk } = weighInInfo(s);
  if (choice === 'miss') {
    st.energy = clamp(st.energy + 10, 0, 100);
    st.missedWeight = true;
    rapSheet(s, 'WEIGHT', `Missed weight by ${need.toFixed(1)} lbs (skipped the cut). 20% of the purse forfeited.`);
    return { made: false, text: `You skipped the cut and came in ${need.toFixed(1)} lbs heavy. 20% of your purse goes to your opponent.` };
  }
  const hard = choice === 'hard';
  const made = need <= 0 || !rng.chance(hard ? risk * 0.5 : risk);
  st.energy = clamp(st.energy - Math.min(60, need * (hard ? 4.5 : 3)), 0, 100);
  if (hard) st.body.body = clamp(st.body.body - need * 1.5, 0, 100);
  const dry = !!st.fight?.rehydro && need > 5;
  st.walkWeight = contractLimit(s) + (dry ? 0 : 2);
  if (dry) st.energy = clamp(st.energy - 15, 0, 100);
  if (!made) {
    st.missedWeight = true;
    rapSheet(s, 'WEIGHT', `Missed weight at ${contractLimit(s)} lbs. 20% of the purse forfeited.`);
    return { made: false, text: 'You missed weight. The sauna won. 20% of your purse goes to your opponent and the internet has jokes.' };
  }
  return { made: true, text: need <= 0 ? 'On weight without a cut. Your nutritionist (Google) is proud.' : hard ? `Brutal cut: ${need.toFixed(1)} lbs in the sauna. You made it, but you look like a raisin.` : `You cut ${need.toFixed(1)} lbs and made weight.` };
}

/** Build tonight's event: you vs the opponent on a small card. */
export function fightEvent(s: GameState, rng: Rng): FightEvent {
  const st = fm(s);
  const o = st.fight!;
  const f = me(s);
  const opp = s.fighters[o.opp];
  const sg = stage(s);
  const evName = st.tier === 'of' ? `CBFC ${o.title ? 'Championship Night' : 'Fight Night'} ${s.week + 1}`
    : st.tier === 'pfl' ? `PFL Lounge ${o.tierTitle ? 'Season Final' : 'Week ' + ((s.week % 20) + 1)}`
      : `${sg.short} ${o.tierTitle ? 'Title Night' : sg.tier === 'amateur' ? 'Smoker' : 'Fight Night'} ${10 + s.week}`;
  const ev: FightEvent = { sponsors: o.sponsors, presentedBy: o.sponsors?.[0], id: o.eventId, name: evName, number: null, week: s.week, venue: 'ape_x', region: 'na', card: [], status: 'scheduled', ppv: !!o.title, notes: ['started', 'fighter'] };
  // where you are on the card depends on your rank and how famous you are: everybody starts on the prelims
  const slot = cardSlot(s);
  const size = st.tier === 'of' ? 8 : st.tier === 'pfl' ? 6 : 5;
  const mine = makeBout(s, ev, f, opp, slot, o.title);
  mine.rounds = slot === 0 ? 5 : o.rounds;
  ev.card.push(mine);
  // the rest of the card (the better the fighters, the higher they go). Watch them from cageside.
  const promo = sg.promo;
  const pool = Object.values(s.fighters)
    .filter((x) => x.promotion === promo && x.status === 'active' && x.id !== f.id && x.id !== opp.id && !isBoss(x.id) && !x.injuries.some((i) => i.until > s.week))
    .sort((a, b) => overall(b.skills) + b.hype * 0.3 - (overall(a.skills) + a.hype * 0.3));
  const used = new Set<string>();
  for (let pos = 0; pos < size; pos++) {
    if (pos === slot) continue;
    // the top of the card is the best; the prelims get the rest (with a bit of shuffle)
    const start = pos <= 1 ? 0 : Math.min(pool.length - 1, Math.floor((pos / size) * pool.length * 0.6) + rng.int(0, 6));
    let a: Fighter | null = null;
    let b: Fighter | null = null;
    for (let i = start; i < pool.length && !b; i++) {
      const x = pool[i];
      if (used.has(x.id)) continue;
      if (!a) a = x;
      else if (x.division === a.division) b = x;
    }
    if (!a || !b) continue;
    used.add(a.id);
    used.add(b.id);
    const pb = makeBout(s, ev, a, b, pos, null);
    pb.rounds = pos === 0 ? 5 : 3;
    ev.card.push(pb);
  }
  ev.card.sort((x, y) => x.position - y.position);
  return ev;
}

/** Your spot on tonight's card: 0 = main event ... prelims at the bottom. Rank and hype move you up. */
export function cardSlot(s: GameState): number {
  const st = fm(s);
  const f = me(s);
  const o = st.fight;
  if (o?.title || o?.tierTitle) return 0;
  const h = f.hype;
  if (st.tier !== 'of') {
    const spot = ladderSpot(s) ?? 9;
    return spot <= 1 ? 1 : spot <= 3 ? 2 : h > 50 ? 3 : 4;
  }
  const r = rankOf(s, f.id);
  if (r === null) return h >= 45 ? 6 : 7;
  if (r === 0) return 0;
  if (r <= 2) return h >= 75 ? 0 : 1;
  if (r <= 5) return h >= 65 ? 1 : 2;
  if (r <= 10) return h >= 55 ? 3 : 4;
  return h >= 50 ? 5 : 6;
}

export const SLOT_NAME = (slot: number, ofTier: boolean) => (slot === 0 ? 'MAIN EVENT' : slot === 1 ? 'CO-MAIN' : ofTier ? (slot <= 4 ? 'MAIN CARD' : slot <= 5 ? 'PRELIMS' : 'EARLY PRELIMS') : slot <= 2 ? 'MAIN CARD' : 'UNDERCARD');

/** After the fight: money, body damage, history, news. */
export function afterFight(s: GameState, ev: FightEvent, rng: Rng): string[] {
  const st = fm(s);
  const f = me(s);
  const o = st.fight!;
  const tierAt = st.tier;
  const b = ev.card.find((x) => x.a === f.id || x.b === f.id);
  const out: string[] = [];
  if (!b?.result) return out;
  const r = b.result;
  const won = r.winner === f.id;
  const lost = r.loser === f.id;
  const cut = [0, 0.1, 0.15, 0.2][st.staff.manager];
  let pay = o.purse + (won ? o.win : 0);
  if (st.missedWeight) pay = Math.round(pay * 0.8);
  const fee = Math.round(pay * cut);
  const bradieCut = hasClause(s, 'of_likeness') ? Math.round(pay * 0.1) : 0;
  st.money += pay - fee - bradieCut;
  out.push(`Purse: ${money(pay)}${fee ? ` (manager takes ${money(fee)})` : ''}${bradieCut ? ` (Bradie's "likeness" cut: ${money(bradieCut)})` : ''}.`);
  const rent = storyPurse(s, pay - fee - bradieCut);
  if (rent) out.push(rent);
  {
    const k = stats(s);
    if (won) {
      k.streak++;
      k.best = Math.max(k.best, k.streak);
      if (r.method === 'KO' || r.method === 'TKO') k.kos++;
      else if (r.method === 'SUB') k.subs++;
      else k.decs++;
    } else if (lost) k.streak = 0;
    const iv = interviewMoment(s, rng, 'post', won);
    if (iv) pushMoment(s, iv);
  }
  // damage to the body
  const mine = r.damage[b.a === f.id ? 0 : 1];
  st.body.head = clamp(st.body.head - mine * 0.5, 0, st.headCap);
  st.body.jaw = clamp(st.body.jaw - mine * 0.25, 0, 100);
  st.body.body = clamp(st.body.body - mine * 0.3, 0, 100);
  st.body.legs = clamp(st.body.legs - mine * 0.2, 0, 100);
  st.body.lhand = clamp(st.body.lhand - rng.int(0, 12), 0, 100);
  st.body.rhand = clamp(st.body.rhand - rng.int(0, 12), 0, 100);
  if (lost && (r.method === 'KO' || r.method === 'TKO')) {
    st.headCap = Math.max(55, st.headCap - 6);
    st.body.head = Math.min(st.body.head, st.headCap);
    out.push('Getting knocked out takes something off the top for good.');
  }
  st.energy = clamp(st.energy - 30, 0, 100);
  st.morale = clamp(st.morale + (won ? 20 : lost ? -18 : 0), 0, 100);
  st.history.push({ week: s.week, opp: o.opp, result: won ? 'W' : lost ? 'L' : 'D', method: `${r.method} (${r.detail})`, round: r.round, pro: st.tier !== 'amateur', promo: stage(s).short, title: !!(o.title || o.tierTitle) });
  {
    // the write-up
    const oppF = s.fighters[o.opp];
    const outlet = st.tier === 'amateur' ? 'The Local Gazette' : st.tier === 'regional' ? rng.pick(['Regional MMA Report', 'Tapology-ish', 'Sherdog-ish']) : rng.pick(['MMA Junkie-ish', 'Sherdog-ish', 'Bloody Elbow-ish', 'MMA Fighting-ish', 'ESPN-ish']);
    const fin = r.method === 'KO' || r.method === 'TKO' ? 'stops' : r.method === 'SUB' ? 'submits' : 'outpoints';
    const head = won
      ? rng.pick([`${f.last} ${fin} ${oppF.last} in round ${r.round}`, `${f.last} gets past ${oppF.last}${o.title || o.tierTitle ? ' and takes the belt' : ''}`, `"${f.nick}" ${f.last} ${fin} ${oppF.last}: what's next?`])
      : lost ? rng.pick([`${oppF.last} ${r.method === 'DEC' ? 'outworks' : 'finishes'} ${f.last}`, `Setback for ${f.last} against ${oppF.last}`, `${f.last} falls to ${oppF.last} by ${r.method}`])
        : `${f.last} and ${oppF.last} fight to a draw`;
    article(s, outlet, head);
  }
  log(s, `${won ? 'WIN' : lost ? 'LOSS' : 'DRAW'} vs ${fullName(s.fighters[o.opp])} by ${r.method}, round ${r.round}.`, won ? 2 : lost ? -2 : 0);
  if (o.title && won) out.push(`YOU ARE THE ${divisionName(f.division).toUpperCase()} CHAMPION.`);
  // ladders: the other fights on the card move the ladder too
  if (st.tier !== 'of') {
    for (const bb of ev.card) {
      if (!bb.result?.winner || !bb.result.loser) continue;
      const list = bb.division === f.division ? st.ladder : st.rosters[bb.division];
      if (list) climb(list, bb.result.winner, bb.result.loser);
    }
    if (won && o.tierTitle) promote(s, rng, out);
    else out.push(`You're #${(ladderSpot(s) ?? 0) + 1} in the ${stage(s).name}${ladderSpot(s) === 0 ? ' (champion)' : ''}.`);
  }
  // your manager's statement lands in the inbox
  if (st.staff.manager > 0) st.inbox.push(statementDoc(s, rng, pay));
  out.push(bradieOnYou(s, won, rng));
  post(s, '@' + rng.pick(['mmaguru_99', 'cageside_carl', 'jabjabjabby']), won ? `${f.last.toUpperCase()} IS HIM` : `${f.last} got exposed. Back to the regionals.`);
  st.fight = null;
  st.missedWeight = false;
  st.roundPlans = {};
  st.cornerAid = {};
  computeRankings(s);
  st.oppFlagged = false;
  // your night isn't over: presser, 1ton, whatever else happened in the tunnel
  fightNightEvents(s, ev, rng);
  storyResult(s, tierAt, o.opp, won, lost, !!(o.title || o.tierTitle));
  storyWeek(s);
  if (st.tier === 'of') {
    const rk = rankOf(s, f.id);
    out.push(rk === null ? 'Still unranked.' : rk === 0 ? 'Champion.' : `Ranked #${rk}.`);
  }
  return out;
}

/** Post-fight mic moment: who do you call out (if you won)? */
export function postFightCallout(s: GameState, targetId: string | null, rng: Rng): string {
  const f = me(s);
  if (!targetId) {
    f.hype = clamp(f.hype + 2, 0, 100);
    return 'You thanked God, your mom, your coach and a sponsor you forgot the name of.';
  }
  const t = s.fighters[targetId];
  heatUp(s, f.id, t.id, 25);
  f.hype = clamp(f.hype + 8, 0, 100);
  post(s, '@' + f.last.toLowerCase(), `${t.last.toUpperCase()}. YOU'RE NEXT.`);
  if (rng.chance(0.5)) fm(s).offers.unshift(offerVs(s, t, rng, 'Your post-fight callout landed. The matchmaker wants it.'));
  return `You grabbed the mic and called out ${fullName(t)}. The crowd went insane. ${t.last} did not look thrilled.`;
}

export { feudKey, Rng };
