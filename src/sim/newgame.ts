/**
 * Creating a new career / sandbox GameState.
 */
import type { GameState, Fighter, Difficulty, SandboxOptions, GameMode, Contract } from '../core/types';
import { content } from '../core/content';
import { Rng } from '../core/rng';
import { hydrateFighter, generateFighter } from './generate';
import { overall, computeStarPower, marketPurse } from './fighters';
import { applyRealRankings } from './realrank';
import { computeRankings, ensureDivisionBelts, awardBelt, undisputed, rankScore } from './rankings';
import { scheduleEvents } from './events';
import { DIVISION_ORDER } from './divisions';
import { activateRulesForAct } from './rules';

export const STATE_VERSION = 1;

export interface NewGameOpts {
  seed: number;
  mode: GameMode;
  difficulty: Difficulty;
  promotionName: string;
  presidentName: string;
  sandbox?: SandboxOptions;
}

export const DEFAULT_SANDBOX: SandboxOptions = {
  scenario: 'tiny',
  startCash: 400000,
  scandalFreq: 1,
  chaos: 20,
  simRealism: 1,
  greed: 1,
  mediaHostility: 1,
  strictness: 1,
  rivalAggression: 1,
  noOwner: false,
  infinite: false,
  allLegends: false,
  realRoster: true,
  dreamMatches: false,
  godMode: false,
};

export function makeContract(s: GameState, f: Fighter, rng: Rng): Contract {
  const purse = marketPurse(s, f);
  return {
    boutsLeft: rng.int(2, 4),
    purse,
    winBonus: Math.round(purse * (f.marquee ? 0.6 : 1) / 500) * 500,
    champClause: rng.chance(0.4),
    exclusive: true,
    signedWeek: s.week,
  };
}

export function sign(s: GameState, f: Fighter, c: Contract): void {
  f.promotion = 'us';
  f.status = 'active';
  f.contract = c;
  f.loyalty = Math.max(f.loyalty, 40);
  if (!s.divisionsOpen.includes(f.division)) f.status = 'active'; // stays on roster, can't be booked until division opens
}

export function createNewGame(opts: NewGameOpts): GameState {
  const c = content();
  const rng = Rng.fromSeed(opts.seed);
  const sb = opts.mode === 'sandbox' ? { ...DEFAULT_SANDBOX, ...(opts.sandbox ?? {}) } : null;
  const scenario = sb?.scenario ?? 'tiny';
  const startAct = scenario === 'tiny' ? 1 : scenario === 'midtier' ? 3 : 4;
  const diffCash = { easy: 1.6, normal: 1, fightweek: 0.75, ironman: 1 }[opts.difficulty];

  const s: GameState = {
    version: STATE_VERSION,
    seed: opts.seed >>> 0,
    rng: 0,
    mode: opts.mode,
    difficulty: opts.difficulty,
    sandbox: sb,
    week: 0,
    act: startAct,
    phase: 'paper',
    promotion: {
      name: opts.promotionName || 'Cage Boss Fighting Championship',
      cash: Math.round((sb ? sb.startCash : 400000) * diffCash),
      valuation: 0,
      tv: null,
      sideVenture: null,
      debt: scenario === 'tiny' ? 350000 : 0,
      staff: scenario === 'tiny' ? 4000 : scenario === 'midtier' ? 45000 : 160000,
    },
    president: { name: opts.presidentName || 'Dane Whyte', wealth: 60000, lifestyle: 0, marriage: 'married', kidsSchool: true, vegasDebt: 0 },
    meters: { fans: 30, fighters: 50, media: 40, commission: 55, network: 25, sponsors: 30 },
    hidden: { heat: 5, patience: 70, chaos: sb?.chaos ?? 20 },
    fighters: {},
    belts: {},
    rankings: {},
    events: [],
    eventSeq: 1,
    numberedSeq: 0,
    desk: { queue: [], citations: [], minutes: 0, log: [] },
    rules: { active: [], params: {} },
    storylets: { history: {}, pending: [], resolved: [], scheduled: [], categoryLog: {}, seq: 1 },
    flags: {},
    media: { reporters: {}, paper: null, news: [], headlinesUsed: {} },
    legal: { cases: [] },
    rivals: {},
    owner: { name: 'Zenith Holdings Group', target: 0, revenueQ: 0, memos: 0, audit: 0, sold: false, results: [] },
    commissions: {},
    venuesUnlocked: [],
    sponsorDeals: [],
    divisionsOpen: c.divisions.filter((d) => d.openAct <= startAct).map((d) => d.id),
    market: { competitors: {}, chart: [], tvOffers: [] },
    negotiations: [],
    ledger: [],
    current: { income: {}, expenses: {}, personal: {} },
    log: [],
    inbox: [],
    stats: {},
    ending: null,
    endingWeek: null,
  };
  if (scenario === 'midtier') {
    s.meters = { fans: 55, fighters: 50, media: 50, commission: 55, network: 55, sponsors: 50 };
    s.promotion.tv = { network: 'fux_sports', tier: 2, perEvent: 300000, until: 104, ppv: true };
  } else if (scenario === 'giant' || scenario === 'strike') {
    s.meters = { fans: 75, fighters: scenario === 'strike' ? 15 : 45, media: 50, commission: 60, network: 70, sponsors: 70 };
    s.promotion.tv = { network: 'worldwide_sports', tier: 3, perEvent: 1400000, until: 156, ppv: true };
    s.owner.sold = true;
    if (scenario === 'strike') {
      s.flags.union = 3;
      s.flags.strike_threat = 1;
    }
  } else {
    s.promotion.tv = { network: 'public_access', tier: 0, perEvent: 4000, until: 52, ppv: false };
  }

  // --- fighters
  for (const raw of c.roster) {
    const f = hydrateFighter(raw as Fighter & { id: string }, rng, c.names);
    f.status = f.legend ? 'retired' : 'free-agent';
    f.promotion = null;
    const debut = (raw as any).debutAct ?? 1;
    if (debut > startAct && !f.legend) f.status = 'prospect';
    if (f.legend) f.legend = true;
    if (sb?.allLegends && f.legend) {
      f.status = 'free-agent';
    }
    s.fighters[f.id] = f;
  }

  // assign initial rosters. Our league: mid/low tier fighters; rivals take a share of elites.
  const rosterSize = scenario === 'tiny' ? 44 : scenario === 'midtier' ? 110 : 170;
  const pool = Object.values(s.fighters).filter((f) => f.status === 'free-agent');
  const rivalsDefs = c.rivals.filter((r) => r.enterAct <= startAct);
  for (const r of c.rivals) {
    s.rivals[r.id] = { cash: r.startCash, strength: r.strength, alive: r.enterAct <= startAct, mergedInto: null, relationship: 0, lastEventWeek: -10 };
  }
  // sort pool by overall and distribute
  pool.sort((a, b) => overall(b.skills) - overall(a.skills));
  const ours: Fighter[] = [];
  for (const div of s.divisionsOpen) {
    const inDiv = pool.filter((f) => f.division === div && !f.marquee);
    // tiny league: skip the very best (they're elsewhere), take a mix of mid and low
    const perDiv = Math.round(rosterSize / s.divisionsOpen.length);
    const startIdx = scenario === 'tiny' ? Math.min(3, Math.floor(inDiv.length / 6)) : 0;
    const picks = inDiv.slice(startIdx).filter((_, i) => scenario !== 'tiny' || i % 2 === 0 || i > inDiv.length * 0.6).slice(0, perDiv);
    ours.push(...picks);
  }
  // a couple of marquee characters start with us in act 1 (cheap & early in their arcs)
  const earlyMarquee = Object.values(s.fighters).filter((f) => f.marquee && f.status === 'free-agent' && ((f as any).startWith === 'us'));
  ours.push(...earlyMarquee);
  // parodies move into the divisions their real counterparts fight in today
  const realChamps = applyRealRankings(s);
  // sandbox: every real-fighter parody on your roster (their divisions open with them)
  if (sb?.realRoster) {
    for (const f of Object.values(s.fighters)) {
      if (!f.marquee || !f.parody || f.legend || (f.status !== 'free-agent' && f.status !== 'prospect') || ours.includes(f)) continue;
      ours.push(f);
      if (!s.divisionsOpen.includes(f.division)) s.divisionsOpen.push(f.division);
    }
  }
  for (const f of ours) {
    sign(s, f, makeContract(s, f, rng));
    f.scout = 1;
    f.loyalty = rng.int(35, 65);
  }
  // rivals sign some of the remaining good fighters
  const remaining = Object.values(s.fighters).filter((f) => f.status === 'free-agent' && !f.legend);
  remaining.sort((a, b) => overall(b.skills) - overall(a.skills));
  let ri = 0;
  // authored characters can start at a specific rival
  for (const f of remaining) {
    const sw = (f as any).startWith as string | undefined;
    if (sw && s.rivals[sw]?.alive) {
      f.promotion = sw;
      f.status = 'active';
      f.contract = { boutsLeft: rng.int(2, 4), purse: marketPurse(s, f), winBonus: 0, champClause: false, exclusive: true, signedWeek: 0 };
    }
  }
  for (const f of remaining) {
    if (!rivalsDefs.length) break;
    if ((f as any).startWith || f.promotion) continue;
    if (rng.chance(0.5)) {
      const r = rivalsDefs[ri++ % rivalsDefs.length];
      f.promotion = r.id;
      f.status = 'active';
      f.contract = { boutsLeft: rng.int(1, 4), purse: marketPurse(s, f), winBonus: 0, champClause: false, exclusive: true, signedWeek: 0 };
    }
  }

  for (const f of Object.values(s.fighters)) f.starPower = computeStarPower(s, f);

  // belts: crown the best fighter in each division as the inherited champion
  ensureDivisionBelts(s);
  for (const div of s.divisionsOpen) {
    const real = realChamps[div] ? ours.find((f) => f.id === realChamps[div]) : undefined;
    const best = real ?? ours.filter((f) => f.division === div).sort((a, b) => rankScore(s, b) - rankScore(s, a))[0];
    const belt = undisputed(s, div);
    if (best && belt && rng.chance(scenario === 'tiny' ? 0.75 : 1)) awardBelt(s, belt, best.id);
  }
  computeRankings(s);

  // media, commissions, venues, market
  for (const r of c.reporters) s.media.reporters[r.id] = { rel: r.nemesis ? -20 : Math.round(rng.gauss() * 15), banned: false, memory: [], scoops: 0 };
  for (const cm of c.commissions) s.commissions[cm.id] = 50;
  s.venuesUnlocked = c.venues.filter((v) => v.unlockAct <= startAct && !v.special).map((v) => v.id);
  for (const comp of c.competitors) s.market.competitors[comp.id] = { buzz: comp.buzz, lastBuys: 0, lastWeek: -1 };
  activateRulesForAct(s, startAct, false);

  // the owner's first quarterly target
  s.owner.target = Math.round(450000 * (startAct === 1 ? 1 : startAct === 3 ? 12 : 40));

  s.rng = rng.state;
  // first events
  const r2 = new Rng(s.rng);
  scheduleEvents(s, r2);
  s.rng = r2.state;
  s.log.push({ week: 0, kind: 'start', text: `${s.president.name} takes over ${s.promotion.name}.` });
  s.media.news.push({
    week: 0, tags: ['takeover'], weight: 10, tone: 0,
    text: scenario === 'tiny'
      ? `LOCAL LOUDMOUTH BUYS BANKRUPT ${s.promotion.name.toUpperCase()} FOR "A USED KIA AND A HANDSHAKE"`
      : `${s.president.name.toUpperCase()} TAKES THE REINS AT ${s.promotion.name.toUpperCase()}; PROMISES "VIOLENCE AND SYNERGY"`,
    vars: { body: `${s.president.name}, a bald man who describes himself as "an energy drink in human form", has taken control of ${s.promotion.name}. Asked about his plans, he said "the fights are gonna be fights" and left in a golf cart.` },
  });
  s.stats.startedAt = 0;
  return s;
}

/** Generate fresh regional prospects (regenerating pool). */
export function spawnProspects(s: GameState, rng: Rng, n: number): Fighter[] {
  const c = content();
  const out: Fighter[] = [];
  for (let i = 0; i < n; i++) {
    const divs = s.divisionsOpen.length ? s.divisionsOpen : DIVISION_ORDER.slice(0, 8);
    const division = rng.pick(divs);
    const gender = division.startsWith('w') ? 'W' : 'M';
    const f = generateFighter(rng, c.names, {
      division,
      gender,
      tier: rng.chance(0.2) ? 'journeyman' : 'prospect',
      id: 'p' + s.week + '_' + i + '_' + rng.int(0, 99999).toString(36),
      managers: c.managers.map((m) => m.id),
    });
    f.status = 'free-agent';
    f.promotion = null;
    f.starPower = computeStarPower(s, f);
    s.fighters[f.id] = f;
    out.push(f);
  }
  return out;
}
