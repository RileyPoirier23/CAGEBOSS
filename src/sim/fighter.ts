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
import { DIVISION_LIMITS, divisionName } from './divisions';
import { fullName, overall, computeStarPower } from './fighters';
import { computeRankings, rankOf, undisputed } from './rankings';
import { makeBout, runBout, applyBout } from './events';
import { heatUp, feudKey } from './feuds';
import type { GamePlan } from './fight';
import { money } from '../core/format';

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

export interface FMOffer { opp: string; week: number; purse: number; win: number; rounds: 3 | 5; title: string | null; why: string; expires: number }
export interface FMChoice { label: string; id: string }
export interface FMEvent { id: string; title: string; text: string; choices: FMChoice[]; data?: Record<string, string | number> }

export interface FMState {
  player: string;
  archetype: Archetype;
  money: number;
  energy: number;
  morale: number;
  walkWeight: number;
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
  history: { week: number; opp: string; result: 'W' | 'L' | 'D'; method: string; round: number }[];
  weekReport: string[] | null;
  partied: number;
  /** sketchy supplement in your system */
  taint: number;
  missedWeight: boolean;
}

export const STAFF_ROLES = [
  { id: 'coach', name: 'Head coach', tiers: ['Your uncle', 'Local gym owner', 'Respected coach', 'Elite camp'], cost: [0, 250, 700, 1800], blurb: 'Training gains and better gameplan reads.' },
  { id: 'cutman', name: 'Cutman', tiers: ['Guy with a towel', 'Part-timer', 'Veteran cutman', 'Legendary cutman'], cost: [0, 150, 450, 1100], blurb: 'More time and wider sweet spots in the corner.' },
  { id: 'nutrition', name: 'Nutritionist', tiers: ['Google', 'Meal-prep bro', 'Sports dietitian', 'Performance lab'], cost: [0, 120, 400, 900], blurb: 'Easier weight cuts, faster recovery.' },
  { id: 'manager', name: 'Manager', tiers: ['Yourself', 'Hustler', 'Real agent', 'Power broker'], cost: [0, 0, 0, 0], blurb: 'Better offers and purses. Takes 10/15/20% of every purse.' },
] as const;
export type StaffId = (typeof STAFF_ROLES)[number]['id'];

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

export const fm = (s: GameState): FMState => s.fm!;
export const me = (s: GameState): Fighter => s.fighters[fm(s).player];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const log = (s: GameState, text: string, tone = 0) => {
  fm(s).log.push({ week: s.week, text, tone });
  if (fm(s).log.length > 120) fm(s).log.splice(0, fm(s).log.length - 120);
};
const post = (s: GameState, handle: string, text: string) => {
  fm(s).feed.push({ week: s.week, handle, text });
  if (fm(s).feed.length > 60) fm(s).feed.splice(0, fm(s).feed.length - 60);
};

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
  f.record = { w: 3, l: 0, d: 0, nc: 0 };
  f.streak = 3;
  f.status = 'active';
  f.promotion = 'us';
  f.contract = { boutsLeft: 99, purse: 4000, winBonus: 4000, champClause: true, exclusive: true, signedWeek: 0 };
  f.hype = 10;
  f.scout = 3;
  f.lastFightWeek = -10;
  f.careerLog = ['Signed with the Cage Boss Fighting Championship after a 3-0 regional run.'];
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
  };
  computeRankings(s);
  log(s, `You signed with the ${s.promotion.name}. Unranked, broke and very confident.`);
  post(s, '@' + (f.last.toLowerCase()), 'Signed the contract. Mom cried. I cried. The guy at the gas station cried. LETS GO');
  makeOffers(s, rng, true);
  return s;
}

// ---------------------------------------------------------------- vitals helpers

export function weightLimit(s: GameState): number {
  return DIVISION_LIMITS[me(s).division] ?? 155;
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

export type ActionId = 'train' | 'spar' | 'work' | 'rest' | 'party';

const gain = (s: GameState, base: number) => {
  const st = fm(s);
  const f = me(s);
  const room = Math.max(0.15, (f.potential + (st.ped.on ? 8 : 0) - overall(f.skills)) / 40);
  return base * (1 + st.staff.coach * 0.35) * (st.ped.on ? 1.7 : 1) * (0.5 + st.energy / 160) * Math.min(1.4, room);
};

/** Returns a short line describing what happened. */
export function doAction(s: GameState, a: ActionId, focus: keyof Skills | 'cheap' | 'pro' | null, rng: Rng): string {
  const st = fm(s);
  const f = me(s);
  if (st.ap <= 0) return 'No time left this week.';
  st.ap--;
  switch (a) {
    case 'train': {
      const k = (focus as keyof Skills) ?? 'striking';
      const g = gain(s, rng.float(0.9, 1.8));
      f.skills[k] = clamp(Math.round((f.skills[k] + g) * 10) / 10, 10, 99);
      st.energy = clamp(st.energy - 16, 0, 100);
      if (rng.chance(0.04 + (st.energy < 25 ? 0.12 : 0))) {
        const part = rng.pick(['legs', 'body', 'lhand', 'rhand', 'larm', 'rarm'] as BodyPart[]);
        st.body[part] = clamp(st.body[part] - rng.int(10, 25), 0, 100);
        return `Trained ${k.toUpperCase()} (+${g.toFixed(1)}) and tweaked your ${BODY_PARTS.find((p) => p.id === part)!.name.toLowerCase()}.`;
      }
      return `Trained ${k.toUpperCase()}: +${g.toFixed(1)}.`;
    }
    case 'spar': {
      const cheap = focus === 'cheap';
      const g = gain(s, rng.float(1.2, 2.2));
      f.skills.fightIQ = clamp(f.skills.fightIQ + g * 0.6, 10, 99);
      f.skills.striking = clamp(f.skills.striking + g * 0.5, 10, 99);
      f.skills.wrestling = clamp(f.skills.wrestling + g * 0.3, 10, 99);
      st.energy = clamp(st.energy - 22, 0, 100);
      if (!cheap) st.money -= 150;
      const hurtP = cheap ? 0.3 : 0.1;
      let extra = '';
      if (rng.chance(hurtP)) {
        const part = rng.pick(['head', 'jaw', 'body', 'legs', 'lhand', 'rhand'] as BodyPart[]);
        st.body[part] = clamp(st.body[part] - rng.int(12, 30), 0, 100);
        if (part === 'head') st.headCap = Math.max(60, st.headCap - 1);
        extra = cheap ? ` Your "partner" went 100% and hurt your ${BODY_PARTS.find((p) => p.id === part)!.name.toLowerCase()}.` : ` Took a bad one to the ${BODY_PARTS.find((p) => p.id === part)!.name.toLowerCase()}.`;
      }
      if (cheap && rng.chance(0.12)) st.pending.push(EVENTS.leak(s, rng));
      return `Sparred ${cheap ? 'with whoever showed up' : 'with paid pros (-$150)'}: fight IQ & striking up.` + extra;
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
  return `St. Cath's Sports Medicine patched up your ${BODY_PARTS.find((p) => p.id === part)!.name.toLowerCase()} (-${money(cost)}).`;
}

export function setStaff(s: GameState, id: StaffId, tier: number): void {
  fm(s).staff[id] = clamp(tier, 0, 3);
  if (id === 'cutman') me(s).cutman = { name: STAFF_ROLES[1].tiers[tier], rating: [25, 45, 70, 92][tier] };
}

export function weeklyStaffCost(s: GameState): number {
  const st = fm(s);
  return STAFF_ROLES.reduce((acc, r) => acc + r.cost[st.staff[r.id]], 0);
}

// ---------------------------------------------------------------- media

/** Fighters you could call out: your division, ranked around and above you. */
export function calloutTargets(s: GameState): Fighter[] {
  const f = me(s);
  const wall = [undisputed(s, f.division)?.holder, ...(s.rankings[f.division] ?? [])].filter((x): x is string => !!x && x !== f.id);
  const my = rankOf(s, f.id) ?? 16;
  return wall.map((id) => s.fighters[id]).filter((x) => x && x.status === 'active').filter((x) => (rankOf(s, x.id) ?? 16) <= my + 2).slice(0, 8);
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
  heatUp(s, f.id, t.id, rng.int(12, 25));
  f.hype = clamp(f.hype + rng.int(3, 7), 0, 100);
  const reply = rng.chance(0.65);
  if (reply) post(s, '@' + t.last.toLowerCase(), rng.pick(REPLIES));
  // a good callout sometimes gets you the fight
  const r = rankOf(s, t.id) ?? 16;
  const mine = rankOf(s, f.id) ?? 16;
  if (!st.fight && rng.chance(0.18 + f.hype / 300) && mine - r <= 6) {
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
  log(s, 'You started a cycle. The guy said "it\'s basically vitamins". It is not vitamins.', -1);
  return 'Package received. Training gains way up. Test risk: also way up.';
}

export function stopPeds(s: GameState): string {
  fm(s).ped.on = false;
  return 'You came off the cycle. Takes a while to clear your system.';
}

/** Bareknuckle cash fight: quick and brutal. */
export function bareknuckle(s: GameState, rng: Rng): string {
  const st = fm(s);
  if (st.ap <= 0) return 'No time left this week.';
  st.ap--;
  const f = me(s);
  const sk = fightReadySkills(s);
  const p = 0.35 + (sk.striking + sk.power + sk.chin) / 600;
  const won = rng.chance(p);
  const purse = rng.int(800, 2500);
  const dmg = rng.int(8, 22);
  st.body.lhand = clamp(st.body.lhand - rng.int(6, 18), 0, 100);
  st.body.rhand = clamp(st.body.rhand - rng.int(6, 18), 0, 100);
  st.body.head = clamp(st.body.head - dmg, 0, st.headCap);
  st.energy = clamp(st.energy - 25, 0, 100);
  if (won) {
    st.money += purse;
    return `Bareknuckle in a car park behind a laundromat. You won. +${money(purse)} in a paper bag.`;
  }
  st.money += Math.round(purse * 0.2);
  f.damage = clamp(f.damage + 2, 0, 100);
  return `Bareknuckle under a bridge. You lost and your hands look like burgers. +${money(Math.round(purse * 0.2))} show money.`;
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

function offerVs(s: GameState, opp: Fighter, rng: Rng, why: string, title: string | null = null): FMOffer {
  const st = fm(s);
  const f = me(s);
  const mine = rankOf(s, f.id);
  const base = 4000 + (mine === null ? 0 : (16 - mine) * 2500) + f.hype * 120;
  const mgr = [1, 1.15, 1.35, 1.6][st.staff.manager];
  const purse = Math.round((base * mgr * rng.float(0.9, 1.15)) / 500) * 500 * (title ? 3 : 1);
  return { opp: opp.id, week: s.week + rng.int(4, 7), purse, win: purse, rounds: title ? 5 : 3, title, why, expires: s.week + 2 };
}

export function makeOffers(s: GameState, rng: Rng, force = false): void {
  const st = fm(s);
  const f = me(s);
  st.offers = st.offers.filter((o) => o.expires >= s.week && s.fighters[o.opp]?.status === 'active');
  if (st.fight || s.week < st.suspendedUntil || st.retired) return;
  if (!force && !rng.chance(0.45 + st.staff.manager * 0.12)) return;
  const wall = s.rankings[f.division] ?? [];
  const mine = rankOf(s, f.id);
  const champ = undisputed(s, f.division);
  const pool = Object.values(s.fighters).filter((x) => x.division === f.division && x.id !== f.id && x.status === 'active' && x.promotion === 'us' && !x.injuries.some((i) => i.until > s.week));
  const pick = (list: Fighter[]) => (list.length ? rng.pick(list) : null);
  const n = 1 + (st.staff.manager >= 2 ? 1 : 0) + (rng.chance(0.4) ? 1 : 0);
  for (let i = 0; i < n && st.offers.length < 3; i++) {
    let opp: Fighter | null;
    let why: string;
    if (mine !== null && mine <= 2 && champ?.holder && champ.holder !== f.id && i === 0) {
      opp = s.fighters[champ.holder];
      st.offers.push(offerVs(s, opp, rng, 'TITLE SHOT. This is the one.', champ.id));
      continue;
    }
    if (mine === null) {
      opp = pick(pool.filter((x) => !wall.includes(x.id)));
      why = rng.pick(['A step-up fight on the prelims.', 'Short notice, but a win is a win.', 'Their guy pulled out. You in?']);
    } else {
      const above = wall.slice(Math.max(0, mine - 4), mine - 1).map((id) => s.fighters[id]).filter(Boolean);
      opp = pick(above.length && rng.chance(0.6) ? above : pool.filter((x) => (rankOf(s, x.id) ?? 99) > mine));
      why = rng.pick(['Beat him and you jump the line.', 'A ranked scalp on the main card.', 'The matchmaker thinks you two will bleed for the cameras.']);
    }
    if (opp && !st.offers.some((o) => o.opp === opp!.id)) st.offers.push(offerVs(s, opp, rng, why));
  }
}

export function acceptOffer(s: GameState, i: number): void {
  const st = fm(s);
  const o = st.offers[i];
  if (!o) return;
  st.fight = { ...o, eventId: 'fm' + o.week };
  st.offers = [];
  st.roundPlans = {};
  st.cornerAid = {};
  const t = s.fighters[o.opp];
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
    choices: [{ id: 'fire', label: 'Fire back' }, { id: 'ignore', label: 'Ignore it' }, { id: 'money', label: '"Pay me and I\'ll fight anyone"' }],
  }),
};

export function resolveEvent(s: GameState, choice: string, rng: Rng): string {
  const st = fm(s);
  const f = me(s);
  const ev = st.pending.shift();
  if (!ev) return '';
  const hype = (n: number) => (f.hype = clamp(f.hype + n, 0, 100));
  const mor = (n: number) => (st.morale = clamp(st.morale + n, 0, 100));
  switch (ev.id + ':' + choice) {
    case 'leak:context': hype(3); return 'The full clip shows you getting up and dropping him. Comments flip. W.';
    case 'leak:laugh': mor(3); hype(1); return 'You posted "lol yeah he got me" and the internet decided you were likeable.';
    case 'leak:fire': hype(4); mor(-3); return 'You called him a snake. Gyms across the city choose sides.';
    case 'barfight:lawyer':
      if (st.money < 3000) { st.pending.unshift(ev); return 'You do not have $3,000.'; }
      st.money -= 3000; log(s, 'Charges dropped. Your lawyer high-fived you in the lobby.', 0); return 'Charges dropped.';
    case 'barfight:plead': hype(-3); mor(-6); st.ap = Math.max(0, st.ap - 1); log(s, 'Community service: picking up litter in a hi-vis vest. Someone filmed it.', -1); return '40 hours of community service.';
    case 'barfight:tough': hype(6); mor(-2); if (rng.chance(0.4)) { st.suspendedUntil = s.week + 6; log(s, 'The Commission suspended you for 6 weeks for "conduct unbecoming of a man in a cage".', -2); return 'The video went viral. So did the suspension.'; } return 'The video went viral. Fans love it. Lawyers hate it.';
    case 'ex:respond': hype(4); mor(-6); return 'You responded. Then she responded. Then her mom responded. Week ruined, hype up.';
    case 'ex:ignore': hype(-2); mor(-3); return 'You stayed silent. The internet took that as confirmation.';
    case 'ex:pay': st.money -= 400; mor(4); return 'You Venmo\'d $400 with the note "for the PlayStation". She posted it. Respect, somehow.';
    case 'sponsor:take': st.money += 2000; if (rng.chance(0.35)) { st.taint = 6; } return '+$2,000. The powder tastes like a battery.';
    case 'sponsor:pass': mor(2); return 'You passed. Probably smart. Definitely broke.';
    case 'test:pee': return drugTest(s, rng);
    case 'test:run': st.suspendedUntil = s.week + 26; cancelFight(s, 'You dodged a test: an automatic 6-month suspension.'); hype(-8); return 'Dodging a test counts as failing it. Six months on the shelf.';
    case 'calledout:fire': { const by = s.fighters[String(ev.data?.by)]; if (by) { heatUp(s, f.id, by.id, 20); hype(5); if (!st.fight && rng.chance(0.4)) st.offers.unshift(offerVs(s, by, rng, 'The beef sells. The matchmaker wants it.')); } return 'You fired back. It got ugly. The matchmaker is smiling.'; }
    case 'calledout:ignore': hype(-1); mor(2); return 'You ignored it. Classy. Boring.';
    case 'calledout:money': hype(3); return '"Pay me" is now your catchphrase. Merch incoming.';
  }
  return '';
}

function drugTest(s: GameState, rng: Rng): string {
  const st = fm(s);
  const f = me(s);
  const dirty = st.ped.on || st.ped.weeks > 0 || st.taint > 0;
  if (dirty && rng.chance(st.ped.on ? 0.75 : 0.35)) {
    st.ped.caught++;
    st.suspendedUntil = s.week + 26 * st.ped.caught;
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

// ---------------------------------------------------------------- end of week

/** Everything that happens between weeks. Returns report lines for the next week's screen. */
export function endWeek(s: GameState, rng: Rng): string[] {
  const st = fm(s);
  const f = me(s);
  const out: string[] = [];
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
  // the rest of the league fights
  out.push(...leagueWeek(s, rng));
  const before = rankOf(s, f.id);
  computeRankings(s);
  const after = rankOf(s, f.id);
  if (before !== after) out.push(after === null ? 'You dropped out of the rankings.' : before === null ? `You're ranked! #${after} at ${divisionName(f.division)}.` : after < before ? `You moved up to #${after}.` : `You slipped to #${after}.`);
  s.week++;
  st.ap = 3;
  // controversy & life
  if (!st.pending.length) {
    const roll = rng.next();
    const r = 0.16 + st.partied * 0.03;
    if (roll < r * 0.3) st.pending.push(EVENTS.ex(s, rng));
    else if (roll < r * 0.55) st.pending.push(EVENTS.sponsor(s, rng));
    else if (roll < r && rankOf(s, f.id) !== null) {
      const by = calloutTargets(s).filter((x) => x.traits.includes('Trash Talker') || rng.chance(0.4));
      if (by.length) st.pending.push(EVENTS.callout(s, rng, rng.pick(by)));
    }
    const testP = (st.fight && st.fight.week - s.week <= 4 ? 0.22 : 0.06) + (rankOf(s, f.id) !== null && rankOf(s, f.id)! <= 5 ? 0.06 : 0);
    if (rng.chance(testP)) st.pending.push(EVENTS.test(s));
  }
  st.partied = Math.max(0, st.partied - 1);
  if (s.week >= 6) st.undergroundOpen = true;
  makeOffers(s, rng);
  if (st.offers.length && !st.fight) out.push(`${st.offers.length} fight offer${st.offers.length > 1 ? 's' : ''} on the table.`);
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
    const wall = (s.rankings[d] ?? []).map((id) => s.fighters[id]).filter((x) => x && x.id !== st.player && x.id !== st.fight?.opp && x.status === 'active');
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
  const need = Math.max(0, st.walkWeight - weightLimit(s));
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
    return { made: false, text: `You skipped the cut and came in ${need.toFixed(1)} lbs heavy. 20% of your purse goes to your opponent.` };
  }
  const hard = choice === 'hard';
  const made = need <= 0 || !rng.chance(hard ? risk * 0.5 : risk);
  st.energy = clamp(st.energy - Math.min(60, need * (hard ? 4.5 : 3)), 0, 100);
  if (hard) st.body.body = clamp(st.body.body - need * 1.5, 0, 100);
  st.walkWeight = weightLimit(s) + 2;
  if (!made) {
    st.missedWeight = true;
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
  const ev: FightEvent = { id: o.eventId, name: `CBFC ${o.title ? 'Championship Night' : 'Fight Night'} ${s.week + 1}`, number: null, week: s.week, venue: 'ape_x', region: 'na', card: [], status: 'scheduled', ppv: !!o.title, notes: ['started', 'fighter'] };
  // your fight is the main event; fight-ready skills apply tonight
  ev.card.push(makeBout(s, ev, f, opp, 0, o.title));
  ev.card[0].rounds = o.rounds;
  // a prelim for atmosphere
  const others = Object.values(s.fighters).filter((x) => x.promotion === 'us' && x.status === 'active' && x.id !== f.id && x.id !== opp.id && x.division === f.division);
  if (others.length >= 2) {
    const [a, b] = rng.sample(others, 2);
    const pb = makeBout(s, ev, a, b, 1, null);
    ev.card.push(pb);
  }
  return ev;
}

/** After the fight: money, body damage, history, news. */
export function afterFight(s: GameState, ev: FightEvent, rng: Rng): string[] {
  const st = fm(s);
  const f = me(s);
  const o = st.fight!;
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
  st.money += pay - fee;
  out.push(`Purse: ${money(pay)}${fee ? ` (manager takes ${money(fee)})` : ''}.`);
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
  st.history.push({ week: s.week, opp: o.opp, result: won ? 'W' : lost ? 'L' : 'D', method: `${r.method} (${r.detail})`, round: r.round });
  log(s, `${won ? 'WIN' : lost ? 'LOSS' : 'DRAW'} vs ${fullName(s.fighters[o.opp])} by ${r.method}, round ${r.round}.`, won ? 2 : lost ? -2 : 0);
  if (o.title && won) out.push(`YOU ARE THE ${divisionName(f.division).toUpperCase()} CHAMPION.`);
  post(s, '@' + rng.pick(['mmaguru_99', 'cageside_carl', 'jabjabjabby']), won ? `${f.last.toUpperCase()} IS HIM` : `${f.last} got exposed. Back to the regionals.`);
  st.fight = null;
  st.missedWeight = false;
  st.roundPlans = {};
  st.cornerAid = {};
  computeRankings(s);
  const rk = rankOf(s, f.id);
  out.push(rk === null ? 'Still unranked.' : rk === 0 ? 'Champion.' : `Ranked #${rk}.`);
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
