/**
 * Career progression: the story of a promotion going from a regional dumpster
 * fire to a global juggernaut.
 *
 *  - CLOUT is earned from good events and from the owner's objectives; it
 *    raises the promotion's TIER and UNLOCKS new things (contender series,
 *    scouting, staff, budget boosts, bigger rooms, PPV, international shows).
 *  - The owner checks in every few weeks (morning paper): reviews results,
 *    praises or threatens, sets objectives and sometimes hands you a fighter.
 *  - The Tuesday Night Contender Series: a card of generated prospects every
 *    four weeks once unlocked; winners can be signed on the spot.
 *
 * Hooks: careerStartWeek / careerEndWeek (week.ts), careerOnEvent (events.ts),
 * autoCareer (headless bots).
 */
import type { Bout, FightEvent, Fighter, GameState, ObjectiveKind, OwnerObjective, OwnerVisit, RankMove } from '../core/types';
import { ensureCareer } from '../core/career';
import { content } from '../core/content';
import { Rng } from '../core/rng';
import { money, clamp } from '../core/format';
import { fmtFightDate } from '../core/time';
import { scale, adjustMeter, adjustHidden, spend, earn } from './econ';
import { addNews } from './news';
import { fullName, overall, computeStarPower, marketPurse, addCareerLog, isOurs } from './fighters';
import { generateFighter } from './generate';
import { sign } from './newgame';
import { divisionName } from './divisions';
import { makeBout, runBout, applyBout, shortPromo, venueRegion, estimateFinancials, upcomingEvents } from './events';
import { rankingsWeekly } from './rankings';

export { ensureCareer };

// ---------------------------------------------------------------- tiers & unlocks

export const TIERS: { name: string; clout: number; blurb: string }[] = [
  { name: 'Regional Dumpster Fire', clout: 0, blurb: 'VFW halls, folding chairs, a ring announcer who is also the janitor.' },
  { name: 'Regional Promotion', clout: 110, blurb: 'People in three counties have heard of you. Some of them on purpose.' },
  { name: 'National Contender', clout: 320, blurb: 'Cable executives return your calls. Eventually.' },
  { name: 'National Brand', clout: 620, blurb: 'Your logo is on a bus. A real bus. Not your bus.' },
  { name: 'Global Powerhouse', clout: 960, blurb: 'Foreign governments want to host you. Some of them have human rights reports.' },
  { name: 'Global Juggernaut', clout: 1350, blurb: 'You are the sport. The sport is you. Your lawyers would like you to stop saying that.' },
];

export interface UnlockDef {
  id: string;
  name: string;
  blurb: string;
  clout: number;
  act?: number; // earliest act
}

export const UNLOCKS: UnlockDef[] = [
  { id: 'contender_series', name: 'Tuesday Night Contender Series', clout: 20, blurb: 'Every fourth Tuesday: a card of hungry nobodies fighting for a contract. Winners can be signed on the spot.' },
  { id: 'scouting', name: 'Scouting Department', clout: 60, blurb: 'Two guys with clipboards and a minivan. Each week they scout the best unsigned talent so you see real skills, not highlight reels.' },
  { id: 'budget_1', name: 'Budget Increase', clout: 110, blurb: 'The owner wires a lump of operating budget. Do not spend it on a jet ski.' },
  { id: 'venues_2', name: 'Bigger Rooms', clout: 170, blurb: 'College arenas, harbour arenas and the Apex-style TV studio join the booking sheet.' },
  { id: 'pr_team', name: 'PR Team', clout: 250, blurb: 'Three publicists who say "circle back" a lot. Media coverage slowly improves every week.' },
  { id: 'ppv_deal', name: 'Pay-Per-View Partner', clout: 340, blurb: 'A pay-per-view distributor wants in. Expect an offer on your desk.' },
  { id: 'international', name: 'International Events', clout: 440, blurb: 'London, Rio, Mexico City, Paris. Every so often a numbered event goes abroad. Bring visas. Bring a translator. Bring Pepto.' },
  { id: 'staff_doctor', name: 'In-House Medical Team', clout: 560, blurb: 'Real doctors on salary. Injuries heal faster and the doctor\'s bills get cut in half.' },
  { id: 'big_presser', name: 'The Big Presser', clout: 680, blurb: 'LED wall, smoke machine, an extra question and twice the hype out of every press conference.' },
  { id: 'budget_2', name: 'Budget Increase II', clout: 800, blurb: 'The owner is impressed enough to wire real money. He asks you to "keep it quiet from the board".' },
  { id: 'arena_4', name: 'Major Arenas', clout: 920, blurb: 'The big-city arenas with the corporate names finally return your calls.' },
  { id: 'paralegal', name: 'Legal Department', clout: 1060, blurb: 'A paralegal named Doug. Legal review fees are cut in half. Doug is in charge now.' },
  { id: 'global_tour', name: 'Global Tour & Stadiums', clout: 1200, blurb: 'Tokyo, Sydney, London\'s biggest dome and a football stadium in Texas. Go global or go home.' },
  { id: 'budget_3', name: 'Budget Increase III', clout: 1350, blurb: 'The owner wires a frankly irresponsible amount of money. Spend it before he sobers up.' },
];

const UNLOCK_VENUES: Record<string, string[]> = {
  venues_2: ['college_arena', 'harbor_arena', 'ape_x', 'desert_events'],
  international: ['o2_style', 'rio_arena', 'mexico_arena', 'paris_arena', 'jeunesse', 'roger_that', 'perth_rac'],
  arena_4: ['garden_arena', 't_mobster', 'barfclays', 'cryptocon_arena'],
  global_tour: ['saitama', 'aussie_dome', 'ozone', 'football_stadium', 'msquared'],
};

export function hasUnlock(s: GameState, id: string): boolean {
  return !!s.career?.unlocks.includes(id);
}

export function tierOf(clout: number): number {
  let t = 0;
  TIERS.forEach((x, i) => {
    if (clout >= x.clout) t = i;
  });
  return t;
}

/** The next locked unlock (for progress bars). */
export function nextUnlock(s: GameState): UnlockDef | null {
  const c = ensureCareer(s);
  return UNLOCKS.find((u) => !c.unlocks.includes(u.id)) ?? null;
}

export function cloutLog(s: GameState, text: string): void {
  const c = ensureCareer(s);
  c.history.push({ week: s.week, text });
  if (c.history.length > 80) c.history.splice(0, c.history.length - 80);
}

/** Earn clout; may raise the tier and unlock things. */
export function grantClout(s: GameState, n: number, why: string): void {
  if (n <= 0) return;
  const c = ensureCareer(s);
  c.clout = Math.round((c.clout + n) * 10) / 10;
  if (why) cloutLog(s, `+${n} clout: ${why}`);
  checkUnlocks(s);
}

/** Budget money from the owner: cash, but not revenue (it doesn't count toward his targets). */
function ownerBudget(s: GameState, amt: number): void {
  if (amt <= 0) return;
  s.promotion.cash += amt;
  s.current.income['owner budget'] = (s.current.income['owner budget'] ?? 0) + amt;
}

export function checkUnlocks(s: GameState): string[] {
  const c = ensureCareer(s);
  const out: string[] = [];
  if (s.mode === 'sandbox' && s.sandbox?.noOwner) return out;
  const newTier = tierOf(c.clout);
  if (newTier > c.tier) {
    for (let t = c.tier + 1; t <= newTier; t++) {
      c.unlockQueue.push('tier_' + t);
      addNews(s, { tags: ['career'], vars: {}, text: `${s.promotion.name.toUpperCase()} IS NOW A "${TIERS[t].name.toUpperCase()}", SAYS ${s.promotion.name.toUpperCase()}`, weight: 4, tone: 0.5 });
      cloutLog(s, `Tier up: ${TIERS[t].name}`);
    }
    c.tier = newTier;
  }
  for (const u of UNLOCKS) {
    if (c.unlocks.includes(u.id) || c.clout < u.clout || (u.act ?? 0) > s.act) continue;
    c.unlocks.push(u.id);
    c.unlockQueue.push(u.id);
    applyUnlock(s, u.id);
    cloutLog(s, `Unlocked: ${u.name}`);
    s.log.push({ week: s.week, kind: 'unlock', text: `Unlocked: ${u.name}` });
    out.push(u.id);
  }
  return out;
}

function applyUnlock(s: GameState, id: string): void {
  for (const v of UNLOCK_VENUES[id] ?? []) if (content().venues.some((x) => x.id === v) && !s.venuesUnlocked.includes(v)) s.venuesUnlocked.push(v);
  switch (id) {
    case 'budget_1':
      ownerBudget(s, Math.round(150000 * scale(s)));
      break;
    case 'budget_2':
      ownerBudget(s, Math.round(250000 * scale(s)));
      break;
    case 'budget_3':
      ownerBudget(s, Math.round(400000 * scale(s)));
      break;
    case 'pr_team':
      adjustMeter(s, 'media', 6);
      break;
    case 'ppv_deal': {
      if (s.promotion.tv?.ppv) {
        adjustMeter(s, 'network', 5);
        break;
      }
      const nets = content().networks.filter((n) => n.ppv && n.minAct <= s.act + 1).sort((a, b) => a.tier - b.tier);
      const n = nets[0];
      if (n && !s.market.tvOffers.some((o) => o.network === n.id)) {
        const per = Math.round((n.basePerEvent * (0.6 + s.meters.network / 120 + s.meters.fans / 250)) / 1000) * 1000;
        s.market.tvOffers.push({ network: n.id, perEvent: per, tier: n.tier, weeks: 104, ppv: true, expires: s.week + 8 });
        addNews(s, { tags: ['tv_offer', 'business'], vars: { network: n.name, promotion: s.promotion.name }, weight: 4, tone: 0.4 });
      }
      break;
    }
    case 'contender_series':
      addNews(s, { tags: ['career'], vars: {}, text: `${shortPromo(s)} LAUNCHES TUESDAY NIGHT CONTENDER SERIES; "WIN AND YOU'RE IN, LOSE AND YOU'RE IN DEBT"`, weight: 5, tone: 0.4 });
      break;
    case 'international':
      addNews(s, { tags: ['career'], vars: {}, text: `${shortPromo(s)} ANNOUNCES INTERNATIONAL EVENTS; PRESIDENT LEARNS WHAT A "VISA" IS`, weight: 5, tone: 0.3 });
      break;
  }
}

// ---------------------------------------------------------------- owner

export function ownerPerson(s: GameState): string {
  return ensureCareer(s).owner.person;
}

export function ownerMood(s: GameState): 'pleased' | 'neutral' | 'furious' {
  const p = s.hidden.patience;
  return p >= 65 ? 'pleased' : p >= 30 ? 'neutral' : 'furious';
}

const OBJ_REWARD: Record<ObjectiveKind, number> = {
  sellout: 10, title_fight: 6, sign: 14, med_bills: 8, fans: 10, gate: 10, finish: 8, clean_desk: 8,
  contender_sign: 6, book_gift: 6, new_champ: 12, ppv_buys: 10, cash: 6,
};

function nextEvent(s: GameState, minWeeks = 1): FightEvent | undefined {
  return upcomingEvents(s).find((e) => e.week >= s.week + minWeeks && e.card.some((b) => b.status === 'scheduled'));
}

function venueCap(ev: FightEvent): number {
  return content().venues.find((v) => v.id === ev.venue)?.capacity ?? 1000;
}

/** Build a new objective the promotion can actually attempt right now. */
export function makeObjective(s: GameState, rng: Rng, kind?: ObjectiveKind): OwnerObjective | null {
  const c = ensureCareer(s);
  const ev = nextEvent(s);
  const open = new Set(c.owner.objectives.filter((o) => o.status === 'open').map((o) => o.kind));
  const options: ObjectiveKind[] = ['fans', 'finish', 'clean_desk', 'med_bills', 'cash'];
  if (ev) options.push('sellout', 'gate', 'sellout');
  if (ev?.number !== null && ev) options.push('title_fight', 'new_champ');
  if (s.promotion.tv?.ppv && ev?.ppv) options.push('ppv_buys');
  if (hasUnlock(s, 'contender_series')) options.push('contender_sign');
  const fa = signTarget(s, rng);
  if (fa) options.push('sign');
  const pickFrom = options.filter((k) => !open.has(k));
  const k = kind ?? (pickFrom.length ? rng.pick(pickFrom) : null);
  if (!k) return null;
  const id = 'obj' + c.owner.seq++;
  const due = s.week + rng.int(4, 6);
  const base = { id, kind: k, issued: s.week, progress: 0, status: 'open' as const, reward: { clout: OBJ_REWARD[k], cash: 0 } };
  let o: OwnerObjective;
  switch (k) {
    case 'sellout': {
      if (!ev) return null;
      const est = estimateFinancials(s, ev);
      const fill = est.attendance / venueCap(ev);
      const target = clamp(Math.round((fill + 0.2) * 20) / 20, 0.6, 0.95);
      const pct = Math.round(target * 100);
      o = { ...base, text: target >= 0.9 ? `Sell out ${ev.name} (${pct}% of the seats or better).` : `Pack the building at ${ev.name}: ${pct}% of the seats or better.`, target, due: ev.week };
      break;
    }
    case 'gate': {
      if (!ev) return null;
      const target = Math.round((estimateFinancials(s, ev).gate * 1.15) / 1000) * 1000;
      o = { ...base, text: `Do a ${money(target)} gate at ${ev.name}.`, target, due: ev.week };
      break;
    }
    case 'ppv_buys': {
      if (!ev) return null;
      const target = Math.max(1000, Math.round((estimateFinancials(s, ev).ppvBuys * 1.1) / 100) * 100);
      o = { ...base, text: `Do ${target.toLocaleString()} pay-per-view buys at ${ev.name}.`, target, due: ev.week };
      break;
    }
    case 'title_fight':
      o = { ...base, text: `Put a title fight on a card by ${fmtFightDate(due)}. Belts sell. Belts are shiny.`, target: 1, due };
      break;
    case 'new_champ':
      o = { ...base, text: `Crown a NEW champion by ${fmtFightDate(due + 2)}. Fresh faces on the posters.`, target: 1, due: due + 2 };
      break;
    case 'finish':
      o = { ...base, text: `Give me a knockout in a main event by ${fmtFightDate(due)}. Not a decision. A NAP.`, target: 1, due };
      break;
    case 'fans': {
      const target = Math.min(92, Math.round(s.meters.fans + rng.int(4, 7)));
      o = { ...base, text: `Get the fans meter to ${target} by ${fmtFightDate(due)}.`, target, due };
      break;
    }
    case 'clean_desk':
      o = { ...base, text: `No more than one commission citation between now and ${fmtFightDate(due)}. Do your paperwork.`, target: 1, due };
      break;
    case 'med_bills': {
      const injured = Object.values(s.fighters).filter((f) => isOurs(f) && f.injuries.some((i) => i.until > s.week)).length;
      const target = Math.max(2000, Math.round((medBillRate(s) * Math.max(3, injured + 1) * (due - s.week)) / 500) * 500);
      o = { ...base, text: `Keep the doctor's bills under ${money(target)} through ${fmtFightDate(due)}. Tell them to walk it off.`, target, due };
      break;
    }
    case 'cash': {
      const target = Math.max(50000, Math.round((s.promotion.cash * 0.8) / 10000) * 10000);
      o = { ...base, text: `Keep the promotion's cash above ${money(target)} through ${fmtFightDate(due)}.`, target, due };
      break;
    }
    case 'contender_sign':
      o = { ...base, text: `Sign a Contender Series winner by ${fmtFightDate(due + 2)}. Find me the next big thing.`, target: 1, due: due + 2 };
      break;
    case 'sign': {
      if (!fa) return null;
      o = { ...base, text: `Sign ${fullName(fa)} (${divisionName(fa.division)}) by ${fmtFightDate(due + 2)}. My golf buddies keep asking about ${fa.gender === 'W' ? 'her' : 'him'}.`, target: 1, fighter: fa.id, due: due + 2 };
      break;
    }
    case 'book_gift':
      return null;
  }
  o.reward.cash = Math.round(o.reward.clout * 4000 * scale(s));
  return o;
}

function signTarget(s: GameState, rng: Rng): Fighter | null {
  const pool = Object.values(s.fighters).filter((f) => f.status === 'free-agent' && !f.legend && s.divisionsOpen.includes(f.division) && !s.negotiations.some((n) => n.fighter === f.id));
  pool.sort((a, b) => overall(b.skills) + b.starPower - (overall(a.skills) + a.starPower));
  const top = pool.slice(0, 5);
  return top.length ? rng.pick(top) : null;
}

function medBillRate(s: GameState): number {
  return Math.round(900 * scale(s) * (hasUnlock(s, 'staff_doctor') ? 0.5 : 1));
}

function settle(s: GameState, o: OwnerObjective, met: boolean): void {
  if (o.status !== 'open') return;
  o.status = met ? 'met' : 'failed';
  if (met) {
    adjustHidden(s, 'patience', 3);
    ownerBudget(s, o.reward.cash);
    s.stats.objectivesMet = (s.stats.objectivesMet ?? 0) + 1;
    s.stats['objMet_' + o.kind] = (s.stats['objMet_' + o.kind] ?? 0) + 1;
    grantClout(s, o.reward.clout, o.text);
  } else {
    adjustHidden(s, 'patience', -3);
    s.stats.objectivesFailed = (s.stats.objectivesFailed ?? 0) + 1;
    s.stats['objFail_' + o.kind] = (s.stats['objFail_' + o.kind] ?? 0) + 1;
    cloutLog(s, `Missed: ${o.text}`);
  }
}

/** Per-week objective checks (and deadlines). */
function weeklyObjectives(s: GameState): void {
  const c = ensureCareer(s);
  for (const o of c.owner.objectives) {
    if (o.status !== 'open') continue;
    const f = o.fighter ? s.fighters[o.fighter] : null;
    switch (o.kind) {
      case 'fans':
        o.progress = Math.round(s.meters.fans);
        if (s.meters.fans >= o.target) settle(s, o, true);
        break;
      case 'sign':
        if (f?.promotion === 'us') settle(s, o, true);
        else if (!f || (f.promotion && f.promotion !== 'us') || f.status === 'retired') settle(s, o, false);
        break;
      case 'book_gift':
        if (f && f.lastFightWeek >= o.issued && f.promotion === 'us') settle(s, o, true);
        else if (!f || f.promotion !== 'us') settle(s, o, false);
        break;
      case 'clean_desk':
        o.progress = s.desk.citations.filter((x) => x.week >= o.issued && !x.warning).length;
        if (o.progress > o.target) settle(s, o, false);
        break;
      case 'med_bills':
        o.progress += c.medBills;
        if (o.progress > o.target) settle(s, o, false);
        break;
      case 'cash':
        if (s.promotion.cash < o.target) settle(s, o, false);
        break;
    }
    if (o.status === 'open' && s.week >= o.due) {
      // deadline: the "keep it under / above" kinds succeed by surviving
      settle(s, o, o.kind === 'clean_desk' || o.kind === 'med_bills' || o.kind === 'cash');
    }
  }
  // keep the list short: open ones + the last few closed
  const closed = c.owner.objectives.filter((o) => o.status !== 'open' && o.reviewed);
  if (closed.length > 12) c.owner.objectives = c.owner.objectives.filter((o) => o.status === 'open' || !o.reviewed || closed.slice(-12).includes(o));
}

/** Objectives that resolve on fight night. */
function eventObjectives(s: GameState, ev: FightEvent): void {
  const c = ensureCareer(s);
  const fin = ev.fin;
  const done = ev.card.filter((b) => b.status === 'done' && b.result);
  for (const o of c.owner.objectives) {
    if (o.status !== 'open' || ev.week < o.issued) continue;
    switch (o.kind) {
      case 'sellout':
        if (fin) {
          o.progress = Math.round((fin.attendance / venueCap(ev)) * 100) / 100;
          if (o.progress >= o.target - 0.001) settle(s, o, true);
          else if (ev.week >= o.due) settle(s, o, false);
        }
        break;
      case 'gate':
        if (fin) {
          o.progress = fin.gate;
          if (fin.gate >= o.target) settle(s, o, true);
          else if (ev.week >= o.due) settle(s, o, false);
        }
        break;
      case 'ppv_buys':
        if (fin) {
          o.progress = fin.ppvBuys;
          if (fin.ppvBuys >= o.target) settle(s, o, true);
          else if (ev.week >= o.due) settle(s, o, false);
        }
        break;
      case 'title_fight':
        if (done.some((b) => b.title)) settle(s, o, true);
        break;
      case 'new_champ':
        if (done.some((b) => b.title && b.result!.winner && s.belts[b.title]?.history.slice(-1)[0]?.week === s.week && s.belts[b.title]?.history.slice(-1)[0]?.holder === b.result!.winner && s.belts[b.title].history.length > 1)) settle(s, o, true);
        break;
      case 'finish':
        if (done.some((b) => b.position === 0 && (b.result!.method === 'KO' || b.result!.method === 'TKO'))) settle(s, o, true);
        break;
    }
  }
}

/** Plan a check-in: verdicts on finished objectives, a story beat, new objectives, maybe a fighter. */
export function planOwnerVisit(s: GameState, rng: Rng): OwnerVisit {
  const c = ensureCareer(s);
  const lines: string[] = [];
  const O = content().career.owner;
  const fill = (t: string, extra: Record<string, string> = {}) => ownerFill(s, t, extra);
  const say = (key: string, extra: Record<string, string> = {}) => {
    // after the sale the corporate overlord has her own voice where it exists
    const bank = (c.owner.beats.includes('sold') && O[key + '_corp']) || O[key];
    if (bank?.length) lines.push(fill(rng.pick(bank), extra));
  };
  // story beats (each once)
  const beat = pickBeat(s);
  if (beat) {
    c.owner.beats.push(beat);
    if (beat === 'sold') c.owner.person = 'Brynn Kessler-Vance';
  }
  if (beat === 'intro') say('beat_intro');
  else {
    say('greet_' + ownerMood(s));
    if (beat) say('beat_' + beat, { tier: TIERS[c.tier].name, nexttier: TIERS[Math.min(TIERS.length - 1, c.tier + 1)].name });
  }
  // verdicts
  const results: string[] = [];
  for (const o of c.owner.objectives) {
    if (o.status === 'open' || o.reviewed) continue;
    o.reviewed = true;
    results.push(o.id);
    say(o.status === 'met' ? 'met' : 'failed', { obj: o.text.replace(/\.$/, '') });
  }
  if (!results.length && c.owner.visits > 0 && beat !== 'intro') say('no_results');
  if (s.hidden.patience < 25 && c.owner.visits > 0) say('warning');
  // new objectives
  const issued: string[] = [];
  const openCount = c.owner.objectives.filter((o) => o.status === 'open').length;
  const want = Math.min(3 - openCount, c.tier >= 2 ? 2 : 1);
  // the nephew must fight
  const neph = c.owner.nephew ? s.fighters[c.owner.nephew] : null;
  if (neph && neph.promotion === 'us' && !c.owner.objectives.some((o) => o.kind === 'book_gift' && o.fighter === neph.id) && want > 0) {
    const due = s.week + 6;
    const o: OwnerObjective = { id: 'obj' + c.owner.seq++, kind: 'book_gift', text: `Put my nephew ${fullName(neph)} on a card by ${fmtFightDate(due)}. He's been "training".`, target: 1, fighter: neph.id, issued: s.week, due, progress: 0, status: 'open', reward: { clout: OBJ_REWARD.book_gift, cash: Math.round(OBJ_REWARD.book_gift * 4000 * scale(s)) } };
    c.owner.objectives.push(o);
    issued.push(o.id);
  }
  for (let i = issued.length; i < want; i++) {
    const o = makeObjective(s, rng);
    if (!o) break;
    c.owner.objectives.push(o);
    issued.push(o.id);
  }
  if (issued.length) say('assign');
  // a fighter in a folder
  let gift: OwnerVisit['gift'] = null;
  if (beat !== 'intro' && c.owner.visits >= 1 && rng.chance(0.3)) {
    const sold = c.owner.beats.includes('sold');
    const kind: 'prospect' | 'nephew' | 'vet' = !sold && !c.owner.nephew && c.owner.visits >= 2 && rng.chance(0.45) ? 'nephew' : rng.chance(0.72) ? 'prospect' : 'vet';
    const f = makeGiftFighter(s, rng, kind);
    if (f) {
      gift = { fighter: f.id, kind, purse: marketPurse(s, f) };
      c.owner.gifts.push(f.id);
      if (kind === 'nephew') c.owner.nephew = f.id;
      say('gift_' + kind, { fighter: fullName(f), first: f.first });
    }
  }
  say('signoff');
  c.owner.visits++;
  return { week: s.week, beat, lines, results, objectives: issued, gift };
}

function pickBeat(s: GameState): string | null {
  const c = ensureCareer(s);
  const seen = new Set(c.owner.beats);
  const cands: string[] = [];
  if (c.owner.visits === 0) cands.push('intro');
  if (hasUnlock(s, 'contender_series')) cands.push('contender');
  for (let t = 1; t <= c.tier; t++) cands.push('tier_' + t);
  for (let a = 2; a <= s.act; a++) cands.push('act_' + a);
  if (s.act === 3 && s.week >= 270) cands.push('sale_rumor');
  if (s.owner.sold) cands.push('sold');
  const neph = c.owner.nephew ? s.fighters[c.owner.nephew] : null;
  if (neph && neph.promotion === 'us' && neph.record.w + neph.record.l > 0 && !s.owner.sold) cands.push(neph.streak > 0 ? 'nephew_won' : 'nephew_lost');
  // after the sale, the old owner's beats are gone
  const avail = cands.filter((b) => !seen.has(b) && !(s.owner.sold && seen.has('sold') && (b === 'sale_rumor' || b.startsWith('act_') && Number(b.slice(4)) < 4)));
  if (s.owner.sold && !seen.has('sold')) return 'sold';
  return avail[0] ?? null;
}

export function ownerFill(s: GameState, t: string, extra: Record<string, string> = {}): string {
  const c = ensureCareer(s);
  const v: Record<string, string> = {
    president: s.president.name, presidentLast: s.president.name.split(' ').slice(-1)[0], promotion: s.promotion.name,
    owner: c.owner.person, company: s.owner.name, tier: TIERS[c.tier].name,
    nexttier: TIERS[Math.min(TIERS.length - 1, c.tier + 1)].name, ...extra,
  };
  return t.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);
}

function makeGiftFighter(s: GameState, rng: Rng, kind: 'prospect' | 'nephew' | 'vet'): Fighter | null {
  const divs = s.divisionsOpen.filter((d) => !d.startsWith('w'));
  if (!divs.length) return null;
  const division = rng.pick(divs);
  const f = generateFighter(rng, content().names, {
    division, gender: 'M', tier: kind === 'vet' ? 'gatekeeper' : 'prospect',
    id: 'gift' + s.week + '_' + rng.int(0, 99999).toString(36), managers: content().managers.map((m) => m.id),
  });
  if (kind === 'prospect') {
    f.potential = rng.int(82, 96);
    for (const k of ['striking', 'power', 'wrestling', 'grappling', 'cardio', 'fightIQ'] as const) f.skills[k] = Math.min(99, f.skills[k] + rng.int(3, 8));
    addCareerLog(f, `Handed to ${s.promotion.name} by the owner himself.`);
  } else if (kind === 'nephew') {
    f.first = rng.pick(['Tanner', 'Brayden', 'Chad', 'Colt', 'Hunter', 'Trip']);
    f.last = 'Zenith';
    f.nick = rng.pick(['The Nepo Baby', 'Trust Fund', 'Uncle\'s Pick', 'The Heir', 'Silver Spoon']);
    f.age = rng.int(22, 26);
    f.record = { w: rng.int(1, 3), l: 0, d: 0, nc: 0 };
    for (const k of ['striking', 'power', 'wrestling', 'grappling', 'cardio', 'chin', 'fightIQ', 'durability', 'heart'] as const) f.skills[k] = Math.max(15, f.skills[k] - rng.int(6, 14));
    f.potential = rng.int(40, 55);
    f.traits = ['Clout Chaser', 'Party Animal'];
    f.social.followers = rng.int(40000, 140000);
    f.hometown = 'Greenwich';
    f.country = 'USA';
    f.backstory = f.backstory || 'rich_kid';
    addCareerLog(f, 'The owner\'s nephew. Trained at "a very exclusive gym" (his garage).');
  } else {
    f.age = rng.int(34, 38);
    addCareerLog(f, 'Recommended by the owner\'s golf buddy. "He was great in 2011."');
  }
  f.status = 'free-agent';
  f.promotion = null;
  f.starPower = computeStarPower(s, f);
  s.fighters[f.id] = f;
  return f;
}

/** The player's answer to the folder on the desk. */
export function resolveGift(s: GameState, accept: boolean): string {
  const c = ensureCareer(s);
  const v = c.owner.visit;
  if (!v?.gift || v.giftDone) return '';
  const f = s.fighters[v.gift.fighter];
  if (!f) return '';
  const O = content().career.owner;
  const rng = new Rng(s.rng ^ 0x0e1e);
  const key = `gift_${v.gift.kind}_${accept ? 'yes' : 'no'}`;
  if (accept) {
    sign(s, f, { boutsLeft: 3, purse: v.gift.purse, winBonus: v.gift.purse, champClause: false, exclusive: true, signedWeek: s.week });
    s.stats.signings = (s.stats.signings ?? 0) + 1;
    addCareerLog(f, `Signed with ${s.promotion.name} (owner's recommendation).`);
    adjustHidden(s, 'patience', v.gift.kind === 'nephew' ? 6 : 2);
    if (v.gift.kind === 'prospect') grantClout(s, 3, `Signed the owner's prospect ${fullName(f)}`);
  } else {
    adjustHidden(s, 'patience', v.gift.kind === 'nephew' ? -6 : -1);
  }
  v.giftDone = accept ? 'signed' : 'passed';
  const bank = (c.owner.beats.includes('sold') && O[key + '_corp']) || O[key] || ['"Fine."'];
  return ownerFill(s, rng.pick(bank), { fighter: fullName(f), first: f.first });
}

/** Close the check-in (UI or bot). */
export function finishOwnerVisit(s: GameState): void {
  const c = ensureCareer(s);
  if (c.owner.visit?.gift && !c.owner.visit.giftDone) resolveGift(s, false);
  c.owner.visit = null;
}

// ---------------------------------------------------------------- contender series

export const CONTENDER_VENUE = 'ape_x';

export function contenderEvent(s: GameState): FightEvent | null {
  const c = ensureCareer(s);
  const ev = c.contender.event;
  return ev && ev.week === s.week && !c.contender.done ? ev : null;
}

function contenderDue(s: GameState): boolean {
  if (!hasUnlock(s, 'contender_series')) return false;
  if (s.week % 4 !== 2) return false;
  return !s.events.some((e) => e.week === s.week && e.status === 'scheduled');
}

function planContender(s: GameState, rng: Rng): void {
  const c = ensureCareer(s);
  if (!contenderDue(s) || c.contender.event?.week === s.week) return;
  c.contender.done = false;
  c.contender.winners = [];
  const ev: FightEvent = {
    id: 'cs' + s.week,
    name: `${shortPromo(s)} Contender Series ${c.contender.seasons + 1}`,
    number: null,
    week: s.week,
    venue: CONTENDER_VENUE,
    region: venueRegion(CONTENDER_VENUE),
    card: [],
    status: 'scheduled',
    ppv: false,
    notes: ['started', 'contender'],
  };
  const divs = s.divisionsOpen.length ? s.divisionsOpen : ['light'];
  // losers come back for another shot
  const comeback = c.contender.alumni
    .map((id) => s.fighters[id])
    .filter((f): f is Fighter => !!f && f.status === 'free-agent' && !f.promotion && f.age < 31 && s.week - f.lastFightWeek >= 8 && divs.includes(f.division))
    .slice(-12);
  const bouts = 3;
  let mexican = rng.chance(0.3);
  for (let i = 0; i < bouts; i++) {
    const back = comeback.length && rng.chance(0.35) ? comeback.splice(rng.int(0, comeback.length - 1), 1)[0] : null;
    const division = back?.division ?? rng.pick(divs);
    const gender = division.startsWith('w') ? 'W' : 'M';
    const gen = (): Fighter => {
      const f = generateFighter(rng, content().names, {
        division, gender, tier: 'prospect', culture: mexican ? 'mexico' : undefined,
        id: 'cs' + s.week + '_' + i + '_' + rng.int(0, 99999).toString(36), managers: content().managers.map((m) => m.id),
      });
      mexican = false;
      f.status = 'free-agent';
      f.promotion = null;
      f.record = { w: rng.int(3, 9), l: rng.int(0, 2), d: 0, nc: 0 };
      f.age = rng.int(20, 26);
      f.starPower = computeStarPower(s, f);
      f.lastFightWeek = s.week - rng.int(6, 20);
      addCareerLog(f, `Invited to the ${ev.name}.`);
      s.fighters[f.id] = f;
      return f;
    };
    const a = back ?? gen();
    const b = gen();
    const bout = makeBout(s, ev, a, b, bouts - 1 - i, null);
    bout.rounds = 3;
    bout.position = i;
    ev.card.push(bout);
    for (const f of [a, b]) if (!c.contender.alumni.includes(f.id)) c.contender.alumni.push(f.id);
  }
  if (c.contender.alumni.length > 60) c.contender.alumni.splice(0, c.contender.alumni.length - 60);
  c.contender.event = ev;
}

/** Called once every bout on the card is done: pay for the show, list winners. */
export function finishContender(s: GameState): string[] {
  const c = ensureCareer(s);
  const ev = c.contender.event;
  if (!ev || c.contender.done) return c.contender.winners;
  c.contender.done = true;
  ev.status = 'done';
  c.contender.seasons++;
  spend(s, 'contender series', Math.round(7000 * scale(s)));
  if (s.promotion.tv) earn(s, 'broadcast', Math.round(s.promotion.tv.perEvent * 0.2));
  adjustMeter(s, 'fans', 0.3);
  c.contender.winners = ev.card.filter((b) => b.status === 'done' && b.result?.winner).map((b) => b.result!.winner!);
  for (const b of ev.card) {
    if (!b.result) continue;
    if (b.result.winner) addCareerLog(s.fighters[b.result.winner], `Won on the ${ev.name}.`);
  }
  // keep save size down
  for (const b of ev.card) if (b.result) {
    delete b.result.ticker;
    delete b.result.corners;
    delete b.result.roundScores;
  }
  return c.contender.winners;
}

export function runContenderHeadless(s: GameState, rng: Rng): string[] {
  const c = ensureCareer(s);
  const ev = c.contender.event;
  if (!ev || c.contender.done) return [];
  for (const b of ev.card.filter((x) => x.status === 'scheduled')) {
    runBout(s, ev, b, rng, false);
    applyBout(s, ev, b, rng);
  }
  return finishContender(s);
}

export function contenderOfferPurse(s: GameState, f: Fighter): number {
  return Math.max(2000, Math.round(marketPurse(s, f) / 500) * 500);
}

/** "You got a contract!" */
export function offerContenderContract(s: GameState, id: string): boolean {
  const c = ensureCareer(s);
  const f = s.fighters[id];
  if (!f || f.promotion || !c.contender.winners.includes(id)) return false;
  const purse = contenderOfferPurse(s, f);
  sign(s, f, { boutsLeft: 3, purse, winBonus: purse, champClause: false, exclusive: true, signedWeek: s.week });
  f.hype = clamp(f.hype + 8, 0, 100);
  f.morale = clamp(f.morale + 20, 0, 100);
  f.loyalty = Math.max(f.loyalty, 60);
  addCareerLog(f, `Got a contract on the Contender Series. Cried. On camera.`);
  c.contender.signed.push(id);
  c.contender.winners = c.contender.winners.filter((x) => x !== id);
  s.stats.signings = (s.stats.signings ?? 0) + 1;
  s.stats.contenderSigned = (s.stats.contenderSigned ?? 0) + 1;
  addNews(s, { tags: ['contender'], vars: { fighter: fullName(f), last: f.last }, text: `CONTENDER SERIES: ${f.last.toUpperCase()} GETS THE CONTRACT, CALLS HIS MOM, MOM ASKS "IS THAT THE ONE WITH THE CAGE?"`, weight: 3, tone: 0.3 });
  grantClout(s, 1, `Signed ${fullName(f)} off the Contender Series`);
  for (const o of c.owner.objectives) if (o.kind === 'contender_sign' && o.status === 'open') settle(s, o, true);
  return true;
}

// ---------------------------------------------------------------- international events

function planInternational(s: GameState, rng: Rng): void {
  if (!hasUnlock(s, 'international')) return;
  const last = Number(s.flags.lastIntlWeek ?? -99);
  if (s.week - last < 10) return;
  const intl = content().venues.filter((v) => v.special === 'international' && s.venuesUnlocked.includes(v.id));
  const ev = upcomingEvents(s).find((e) => e.number !== null && e.week >= s.week + 3 && e.status === 'scheduled');
  if (!intl.length || !ev || content().venues.find((v) => v.id === ev.venue)?.special) return;
  const budget = Math.max(s.promotion.cash * 0.15, 0);
  const afford = intl.filter((v) => v.cost <= budget);
  if (!afford.length) return;
  const v = rng.pick(afford);
  ev.venue = v.id;
  ev.region = v.region;
  s.flags.lastIntlWeek = s.week;
  addNews(s, { tags: ['career'], vars: {}, text: `${ev.name.toUpperCase()} HEADS ABROAD TO ${v.name.toUpperCase()}; FIGHTERS ASK IF THEY NEED "THE PASSPORT THING"`, weight: 4, tone: 0.3 });
}

// ---------------------------------------------------------------- weekly hooks

/** Monday morning: plan the owner's check-in, the contender series card, international dates. */
export function careerStartWeek(s: GameState, rng: Rng): void {
  if (s.sandbox?.noOwner && s.mode === 'sandbox') return;
  const c = ensureCareer(s);
  planContender(s, rng);
  planInternational(s, rng);
  if (!c.owner.visit && s.week >= c.owner.nextVisit) {
    c.owner.visit = planOwnerVisit(s, rng);
    c.owner.nextVisit = s.week + 3;
  }
}

/** End of the week: contender card if skipped, objectives, staff perks, rankings drift. */
export function careerEndWeek(s: GameState, rng: Rng, notes: string[]): void {
  const c = ensureCareer(s);
  if (contenderEvent(s)) {
    const w = runContenderHeadless(s, rng);
    if (w.length) notes.push(`Contender Series: ${w.length} winners (unsigned).`);
  }
  // doctor's bills: every injured fighter on the roster costs money
  const injured = Object.values(s.fighters).filter((f) => isOurs(f) && f.injuries.some((i) => i.until > s.week));
  c.medBills = injured.length * medBillRate(s);
  if (c.medBills) spend(s, "doctor's bills", c.medBills);
  if (hasUnlock(s, 'staff_doctor')) for (const f of injured) for (const i of f.injuries) if (i.until > s.week + 1 && rng.chance(0.25)) i.until--;
  if (hasUnlock(s, 'pr_team')) adjustMeter(s, 'media', 0.12);
  if (hasUnlock(s, 'paralegal')) {
    const fee = s.current.expenses['legal review'] ?? 0;
    if (fee > 0) {
      s.current.expenses['legal review'] = fee / 2;
      s.promotion.cash += fee / 2;
    }
  }
  if (hasUnlock(s, 'scouting')) {
    const fas = Object.values(s.fighters).filter((f) => f.status === 'free-agent' && f.scout < 3).sort((a, b) => b.potential + overall(b.skills) - (a.potential + overall(a.skills)));
    for (const f of fas.slice(0, 3)) f.scout++;
  }
  c.contender.winners = []; // unsigned winners go home (they can come back on a later card)
  weeklyObjectives(s);
  rankingsWeekly(s);
  // an unanswered check-in: the folder goes back in the drawer
  if (c.owner.visit && c.owner.visit.week < s.week) finishOwnerVisit(s);
  checkUnlocks(s);
}

/** After an event is paid out: rank moves, clout, fight-night objectives. */
export function careerOnEvent(s: GameState, ev: FightEvent, moves: RankMove[]): void {
  const c = ensureCareer(s);
  c.moves = { week: s.week, event: ev.name, list: moves };
  // notable moves make the news
  const notable = moves.filter((m) => m.to !== null && m.to > 0 && (m.from === null || m.from - m.to >= 3) && m.to <= 10);
  for (const m of notable.slice(0, 2)) {
    const f = s.fighters[m.id];
    if (f) addNews(s, { tags: ['rank_up'], vars: { fighter: fullName(f), last: f.last, rank: m.to!, old: m.from ?? 'NR', div: divisionName(m.div) }, text: `${f.last.toUpperCase()} ROCKETS UP TO #${m.to} AT ${divisionName(m.div).toUpperCase()}`, weight: 3, tone: 0.2 });
  }
  const fin = ev.fin;
  let gain = 0;
  const why: string[] = [];
  if (fin && fin.attendance >= venueCap(ev) * 0.9) {
    gain += 1;
    why.push('sellout');
  }
  if (ev.card.some((b) => b.title && b.status === 'done')) gain += 1;
  if (ev.card.some((b) => (b.result?.fotn ?? 0) >= 75)) {
    gain += 1;
    why.push('a banger');
  }
  grantClout(s, gain, `${ev.name}${why.length ? ' (' + why.join(', ') + ')' : ''}`);
  eventObjectives(s, ev);
}

/** A new act: a big chunk of clout and an UNLOCKED moment for the act's new systems. */
export function careerOnAct(s: GameState, act: number): void {
  const c = ensureCareer(s);
  c.unlockQueue.push('act_' + act);
  grantClout(s, 15, `Act ${act}: ${content().acts.find((a) => a.act === act)?.name ?? ''}`);
}

/** Bots: answer the owner, sign a contender winner now and then. */
export function autoCareer(s: GameState, rng: Rng, policy: string): void {
  const c = ensureCareer(s);
  if (c.owner.visit) {
    const g = c.owner.visit.gift;
    if (g) resolveGift(s, policy === 'chaos' ? rng.chance(0.5) : g.kind !== 'vet' && s.promotion.cash > 0);
    finishOwnerVisit(s);
  }
  if (contenderEvent(s)) runContenderHeadless(s, rng);
  const roster = Object.values(s.fighters).filter(isOurs).length;
  if (c.contender.winners.length && c.contender.event?.week === s.week && !c.contender.signed.some((id) => s.fighters[id]?.contract?.signedWeek === s.week) && roster < 90 && s.promotion.cash > 50000 * scale(s)) {
    const best = c.contender.winners.map((id) => s.fighters[id]).filter(Boolean).sort((a, b) => b.potential - a.potential)[0];
    if (best && (policy !== 'greedy' || best.potential > 75)) offerContenderContract(s, best.id);
  }
  c.unlockQueue = [];
}

export function boutsOf(ev: FightEvent): Bout[] {
  return ev.card.filter((b) => b.status !== 'cancelled').sort((a, b) => a.position - b.position);
}
