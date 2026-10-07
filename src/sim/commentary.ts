/**
 * The broadcast: Juiced Butler's ring introductions and decision reads, and
 * the commentary booth (Lon Anik, Blow Hogan, "Chicken Man" Sandwich Cormier,
 * plus guests) interleaved into the fight ticker.
 *
 * All text lives in data/documents/commentary.json (tools/commentary_src.py).
 * Parody fighters only ever get "safe" controversy material.
 */
import { rankPhrase } from './rankings';
import type { Bout, FightEvent, Fighter, GameState, TickerLine } from '../core/types';
import { content } from '../core/content';
import { Rng } from '../core/rng';
import { pronounize } from './fighters';
import { divisionName } from './divisions';
import { rematchTag, roman } from './events';
import { expandPop } from './popculture';

export const BOOTH_IDS = ['lon', 'blow', 'dc', 'braille', 'biscuit'] as const;

/** Ticker template key -> commentary situation. */
function situation(key: string | undefined): string | null {
  if (!key) return null;
  if (key.startsWith('foul_missed')) return null;
  if (key.startsWith('foul_') || key === 'deduction') return 'foul';
  if (key.startsWith('injury_') || key === 'limb_snap') return 'injury';
  if (key.startsWith('ko_')) return 'finish_ko';
  if (key.startsWith('tko_') || key === 'cannot_continue') return 'finish_tko';
  const map: Record<string, string> = {
    takedown: 'wrestling', ground_control: 'wrestling',
    sub_attempt: 'bjj', sweep: 'bjj', escape: 'bjj', wont_tap: 'bjj',
    land_headkick: 'flashy', land_spinning: 'flashy', land_flying: 'flashy', land_superman: 'flashy',
    land_legkick: 'legkick', land_calfkick: 'legkick', land_body: 'body', land_bodykick: 'body',
    rocked: 'hurt', knockdown: 'knockdown', cut: 'blood', late_ref: 'lateref', standup: 'standup',
    feint: 'lull', crowd: 'lull', clinch_work: 'lull', showboat: 'showboat',
    round_end: 'round_end', round_start: 'round_start', stool: 'stool',
    tap: 'finish_sub', doctor: 'finish_doc', dq: 'finish_dq', decision: 'decision', decision_robbery: 'robbery',
  };
  return map[key] ?? null;
}

const CHANCE: Record<string, number> = {
  hurt: 0.85, knockdown: 0.95, flashy: 0.6, wrestling: 0.45, bjj: 0.5, blood: 0.45, foul: 0.6, lateref: 0.85,
  legkick: 0.25, body: 0.3, injury: 0.85, showboat: 0.5, standup: 0.4, lull: 0.4, round_end: 0.45, round_start: 0.3, stool: 1,
};
const FINISH = new Set(['finish_ko', 'finish_tko', 'finish_sub', 'finish_doc', 'finish_dq', 'decision', 'robbery']);

const isBJJ = (f: Fighter) => f.styles.some((x) => ['Sub Hunter', 'Leg Locker', 'Judoka'].includes(x));
const isWrestler = (f: Fighter) => f.styles.some((x) => ['Wrestler', 'Ground & Pound', 'Boring But Effective'].includes(x)) || f.backstory === 'ex_wrestler';

/** Sandwich Cormier's attempt at a name. */
export function mangle(name: string, seed: number): string {
  const r = new Rng(seed);
  const n = name.replace(/[^A-Za-z' -]/g, '');
  const opts = [
    () => n.slice(0, Math.max(3, Math.ceil(n.length * 0.6))) + r.pick(['ski', 'son', 'ez', 'ington', 'ovich', 'man', 'stein']),
    () => r.pick(['Mc', 'O\'', 'Van ', 'De', 'Big ']) + n,
    () => n.slice(0, 2) + n.slice(2).replace(/[aeiou]/g, (v) => ({ a: 'e', e: 'i', i: 'o', o: 'a', u: 'o' } as Record<string, string>)[v] ?? v),
    () => n.replace(/[aeiou]/, (v) => ({ a: 'o', e: 'a', i: 'e', o: 'u', u: 'i' } as Record<string, string>)[v] ?? v),
    () => r.pick(['Kevin', 'Brandon', 'Big Dog', 'Champ', 'My Guy', 'Number Seven']),
  ];
  const out = r.pick(opts)();
  return out === name ? out + 'son' : out;
}

/** Things Lon can bring up. Parodies only get the safe stuff. */
export function controversies(s: GameState, f: Fighter): string[] {
  const out: string[] = [];
  const p = (t: string) => pronounize(t, f);
  if (f.weightMisses > 0) out.push(p(`missing weight ${f.weightMisses === 1 ? 'last time out' : f.weightMisses + ' times in {his} career'}`));
  if (f.beefWithYou > 40) out.push(p('{his} very public contract dispute with the promotion'));
  const rival = f.rivals.map((id) => s.fighters[id]).find(Boolean);
  if (rival) out.push(`the ongoing feud with ${rival.first} ${rival.last}`);
  if (f.streak <= -2) out.push(`a ${-f.streak}-fight losing skid`);
  if (f.koLosses >= 2) out.push(p(`questions about {his} chin after ${f.koLosses} knockout losses`));
  if (f.traits.includes('Conspiracy Poster')) out.push(p('{his} posts claiming birds are government drones'));
  if (f.traits.includes('Streamer') || f.streaming) out.push(p('the livestream meltdown that went viral this week'));
  if (f.traits.includes('Clout Chaser')) out.push(p('{his} feud with a TikTok magician'));
  if (f.traits.includes('Crypto Bro')) out.push(p('the crypto coin {he} launched that lost 98% of its value in a weekend'));
  if (f.traits.includes('Trash Talker')) out.push(p('the things {he} said at the press conference, most of which we cannot repeat on television'));
  if (f.traits.includes('Diva')) out.push(p('{his} list of hotel demands, which reportedly included a live swan'));
  if (f.traits.includes('Gambler') && !f.parody) out.push(p('reports that {he} owes money to some very patient men'));
  if (!f.parody) {
    if (f.legalRecord.length) out.push(p('{his} recent legal troubles'));
    if (f.addiction && f.addiction > 50) out.push(p('{his} well-documented struggles outside the cage'));
  }
  if (!out.length) out.push(p('{his} comments to the media this week'));
  return out;
}

/** Fun facts for Juiced Butler. */
export function funFacts(s: GameState, f: Fighter): string[] {
  const out: string[] = [];
  const p = (t: string) => pronounize(t, f);
  const BACK: Record<string, string> = {
    ex_wrestler: 'a former Division One All-American wrestler',
    ex_cop: 'a former police officer, now arresting people professionally in a different way',
    accountant: 'a certified public accountant who has audited {his} own opponents',
    military: 'a military veteran',
    youtuber: '{he} runs a YouTube channel about {his} cats',
    farm_kid: '{he} grew up on a farm and can still lift a full-grown calf',
    karate_school: '{he} has been training karate since the age of four, at a strip mall between a nail salon and a vape shop',
    olympic_judoka: 'a former Olympic judoka',
    theater_kid: '{he} played Danny Zuko in a high-school production of Grease',
    failed_footballer: '{he} was one bad knee away from the pros. In football. Not this',
    tiktok_famous: '{he} has more TikTok followers than the population of Iceland',
    rich_kid: '{his} father owns three car dealerships and none of them were consulted about this',
    bouncer: 'a former nightclub bouncer',
    late_bloomer: '{he} did not throw a punch until the age of twenty-seven',
    family_dynasty: '{he} is the third generation of {his} family to fight professionally',
    divorced_dad: 'a proud father who fights for custody, of the belt',
  };
  if (BACK[f.backstory]) out.push(p(BACK[f.backstory]));
  if (f.streak >= 3) out.push(p(`{he} is riding a ${f.streak}-fight win streak`));
  if (f.titleDefenses > 0) out.push(p(`{he} has defended {his} title ${f.titleDefenses} time${f.titleDefenses === 1 ? '' : 's'}`));
  if (f.social.followers > 1_000_000) out.push(p(`{he} has ${(f.social.followers / 1e6).toFixed(1)} million followers and has posted all of them a picture of {his} abs`));
  if (f.streaming) out.push(p('a full-time streamer, {he} is technically live right now from a phone taped to {his} corner'));
  if (f.family.kids > 0) out.push(p(`a proud parent of ${f.family.kids}`));
  if (f.styles.includes('Sub Hunter')) out.push(p('a jiu-jitsu black belt who has never met a limb {he} did not want to borrow'));
  if (f.styles.includes('Muay Thai')) out.push(p('{he} has had over one hundred Muay Thai fights, most of them in a parking lot in Bangkok'));
  if (f.styles.includes('Kickboxer')) out.push(p('a former kickboxing world champion'));
  if (f.age >= 37) out.push(p(`at ${f.age} years young, {he} is older than the cage {he} is fighting in`));
  if (f.age <= 22) out.push(p(`at just ${f.age}, {he} is not legally allowed to rent a car`));
  if (f.anim?.walkout) out.push(p(f.anim.walkout));
  const gen = (content().commentary.butler.facts_generic as string[]) ?? [];
  const r = new Rng(hashStr(f.id));
  for (let i = 0; i < 2 && gen.length; i++) out.push(p(expandPop(r.pick(gen), r.int(1, 1e9))));
  return out;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function sentenceCase(t: string): string {
  return t.replace(/^\s*([a-z])/, (_, c) => c.toUpperCase()).replace(/([.!?]\s+)([a-z])/g, (_, a, c) => a + c.toUpperCase());
}

export function heightStr(cm: number): string {
  const inches = Math.round(cm / 2.54);
  const ft = Math.floor(inches / 12);
  const inch = inches % 12;
  return `${ft} feet${inch ? ` ${inch} inch${inch === 1 ? '' : 'es'}` : ''}`;
}

export function weighInWeight(f: Fighter, bout: Bout, seed: number): number {
  const div = content().divisions.find((d) => d.id === bout.division);
  const limit = div?.limit ?? 170;
  const r = new Rng(seed);
  if (limit >= 250) return Math.min(limit, Math.round(205 + (f.height - 180) * 1.2 + r.int(5, 30)));
  if (bout.missedBy === f.id) return limit + r.pick([1.5, 2, 2.5, 3.5, 4]);
  return limit - r.pick([0, 0, 0.5, 0.5, 1]);
}

// ------------------------------------------------------------------ booth

export function boothFor(s: GameState, ev: FightEvent, bout: Bout): string[] {
  const booth = ev.number !== null ? ['lon', 'blow', 'dc'] : ['lon', 'dc', 'biscuit'];
  if (s.flags.braille_on_broadcast || hashStr(bout.id) % 9 === 0) booth.push('braille');
  return booth;
}

interface Ctx {
  s: GameState;
  ev: FightEvent;
  bout: Bout;
  A: Fighter;
  B: Fighter;
  rng: Rng;
  used: Set<string>;
  booth: string[];
}

function vars(c: Ctx, xi: number): Record<string, string> {
  const x = xi === 1 ? c.B : c.A;
  const y = xi === 1 ? c.A : c.B;
  const ref = c.bout.result?.referee ?? 'the referee';
  const belt = c.bout.title ? c.s.belts[c.bout.title]?.name ?? 'the title' : 'the title';
  const venue = content().venues.find((v) => v.id === c.ev.venue)?.name ?? c.ev.venue;
  const coach = x.coach || 'his coach';
  const streak = x.streak >= 2 ? `Winner of ${x.streak} straight.` : x.streak <= -2 ? `Dropped ${-x.streak} in a row, and badly needs this one.` : '';
  const facts = controversies(c.s, x);
  const r = c.bout.result;
  const win = r?.winner ? c.s.fighters[r.winner] : null;
  const lose = r?.loser ? c.s.fighters[r.loser] : null;
  const sc = r?.scores?.[0] ?? [0, 0];
  const wa = r?.winner === c.B.id;
  return {
    x: x.last, xf: `${x.first} ${x.last}`, xfirst: x.first, xn: x.nick || x.last,
    y: y.last, yf: `${y.first} ${y.last}`,
    wn: mangle(x.last, hashStr(c.bout.id + x.id)),
    home: x.hometown.split('|')[0], country: x.country, gym: x.gym, coach,
    rec: `${x.record.w}-${x.record.l}${x.record.d ? '-' + x.record.d : ''}`, streak,
    kids: x.family.kids ? `${x.family.kids} kid${x.family.kids === 1 ? '' : 's'}` : 'a dog and a fish',
    age: String(x.age), ref, belt, event: c.ev.name, venue, div: divisionName(c.bout.division),
    president: c.s.president.name, fact: c.rng.pick(facts),
    winner: win?.last ?? x.last, loser: lose?.last ?? y.last,
    meeting: roman(c.bout.meeting ?? 1), bones: 'Bonez',
    wins: String(x.record.w), fin: String(Math.max(0, Math.round(x.record.w * (x.styles.includes('Point Fighter') || x.styles.includes('Boring But Effective') ? 0.3 : 0.6)))),
    sa: String(Math.max(sc[0], sc[1])), sb: String(Math.min(sc[0], sc[1])),
    r: '1', ...(wa ? {} : {}),
  };
}

function fill(t: string, v: Record<string, string>, f: Fighter, seed?: number): string {
  const out = sentenceCase(pronounize(expandPop(t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)), seed), f));
  // shouted lines stay shouted, names included
  const letters = t.replace(/\{\w+\}/g, '').replace(/[^A-Za-z]/g, '');
  const caps = letters.replace(/[^A-Z]/g, '').length;
  return letters.length > 8 && caps / letters.length > 0.8 ? out.toUpperCase() : out;
}

/** Pick an unused line for speaker/situation (with fallbacks). */
function pickLine(c: Ctx, sp: string, sit: string): string | null {
  const bank = content().commentary.booth[sp];
  if (!bank) return null;
  const chain = [sit, ...(content().commentary.fallback[sit] ?? [])];
  if (sp === 'braille' || sp === 'biscuit') chain.push('any');
  for (const k of chain) {
    const lines = (bank[k] ?? []).filter((l) => !c.used.has(l));
    if (lines.length) {
      const l = c.rng.pick(lines);
      c.used.add(l);
      return l;
    }
  }
  return null;
}

function line(c: Ctx, base: TickerLine | null, sp: string, sit: string, xi: number, round: number): TickerLine | null {
  const raw = pickLine(c, sp, sit);
  if (!raw) return null;
  const v = vars(c, xi);
  v.r = String(round);
  const subj = xi === 1 ? c.B : c.A;
  return {
    round, t: base?.t ?? 0, text: fill(raw, v, subj, c.rng.int(1, 1e9)), side: -1, intensity: 0, act: 'talk',
    pos: base?.pos ?? 'stand', hp: base?.hp ?? [100, 100], key: 'booth:' + sit, speaker: sp,
  };
}

/** Where a bout sits on the card, as an opener key: matches the MAIN / CO-MAIN / MAIN CARD / PRELIM labels. */
export function slotKey(b: Bout): 'open_main' | 'open_comain' | 'open_card' | 'open_prelim' {
  return b.position === 0 ? 'open_main' : b.position === 1 ? 'open_comain' : b.position < 5 ? 'open_card' : 'open_prelim';
}

/** Booth lines before the opening bell. */
export function boothOpen(s: GameState, ev: FightEvent, bout: Bout, seed: number): TickerLine[] {
  const A = s.fighters[bout.a];
  const B = s.fighters[bout.b];
  if (!A || !B) return [];
  const c: Ctx = { s, ev, bout, A, B, rng: new Rng(seed), used: new Set(), booth: boothFor(s, ev, bout) };
  const slot = slotKey(bout);
  const kind = bout.title ? 'open_title' : (bout.meeting ?? 1) > 1 ? 'open_rematch' : slot;
  const out: (TickerLine | null)[] = [];
  out.push(line(c, null, 'lon', kind, 0, 1));
  const color = c.booth.filter((x) => x === 'blow' || x === 'dc' || x === 'biscuit');
  const cs = c.rng.pick(color);
  out.push(line(c, null, cs, kind === 'open_rematch' ? slot : kind, c.rng.int(0, 1), 1));
  if (c.booth.includes('dc') && c.rng.chance(0.6)) out.push(line(c, null, 'dc', 'texted', c.rng.int(0, 1), 1));
  if (bout.position <= 1 && c.rng.chance(0.7)) out.push(line(c, null, 'lon', 'controversy', c.rng.int(0, 1), 1));
  if ((A.parody === undefined ? false : A.id === 'bro_bones') || B.id === 'bro_bones') if (c.booth.includes('dc')) out.push(line(c, null, 'dc', 'bones', 0, 1));
  if (c.booth.includes('braille')) out.push(line(c, null, 'braille', 'any', c.rng.int(0, 1), 1));
  return out.filter((x): x is TickerLine => !!x);
}

/** Interleave booth commentary into a fight's ticker. Deterministic per seed. */
export function commentate(s: GameState, ev: FightEvent, bout: Bout, lines: TickerLine[], seed: number): TickerLine[] {
  const A = s.fighters[bout.a];
  const B = s.fighters[bout.b];
  if (!A || !B) return lines;
  const c: Ctx = { s, ev, bout, A, B, rng: new Rng(seed ^ 0x5bd1e995), used: new Set(), booth: boothFor(s, ev, bout) };
  const colors: string[] = c.booth.filter((x) => x !== 'lon');
  const guests: string[] = c.booth.filter((x) => x === 'braille' || x === 'biscuit');
  const out: TickerLine[] = [];
  let gap = 3;
  const bones = A.id === 'bro_bones' || B.id === 'bro_bones';
  for (const L of lines) {
    out.push(L);
    gap++;
    const sit = situation(L.key);
    if (!sit) continue;
    const xi = L.side === 1 ? 1 : 0;
    const finish = FINISH.has(sit);
    const urgent = finish || sit === 'hurt' || sit === 'knockdown' || sit === 'lateref';
    if (!urgent && gap < 3) continue;
    if (!finish && !c.rng.chance(CHANCE[sit] ?? 0.3)) continue;
    const said: (TickerLine | null)[] = [];
    if (finish) {
      const wi = L.side === 1 ? 1 : 0;
      const winIdx = bout.result?.winner === B.id ? 1 : 0;
      said.push(line(c, L, 'lon', sit, sit === 'decision' || sit === 'robbery' ? winIdx : wi, L.round));
      const cs = c.rng.pick(colors.filter((x) => !guests.includes(x)));
      said.push(line(c, L, cs, sit, winIdx, L.round));
      if (c.rng.chance(0.5)) said.push(line(c, L, c.rng.pick(colors.filter((x) => x !== cs)), sit, winIdx, L.round));
    } else {
      let sp: string;
      let use = sit;
      const actor = xi === 1 ? B : A;
      if (sit === 'round_start') sp = 'lon';
      else if (sit === 'hurt' || sit === 'knockdown') sp = c.booth.includes('blow') && c.rng.chance(0.65) ? 'blow' : c.rng.pick(['lon', ...colors]);
      else if (sit === 'wrestling') {
        sp = c.rng.pick([...colors.filter((x) => x === 'blow' || x === 'dc'), 'lon']);
        if (sp === 'blow' && isWrestler(actor) && c.rng.chance(0.35)) use = 'fav_wrestler';
      } else if (sit === 'bjj') {
        sp = c.booth.includes('blow') && c.rng.chance(0.7) ? 'blow' : c.rng.pick(['lon', ...colors]);
        if (sp === 'blow' && isBJJ(actor) && c.rng.chance(0.35)) use = 'fav_bjj';
      } else if (sit === 'lull') {
        sp = c.rng.pick(['lon', ...colors, ...colors]);
        if (sp === 'lon') use = c.rng.pick(['lull', 'lull', 'controversy', 'controversy', 'stats']);
        if (sp === 'dc') use = c.rng.pick(['lull', 'texted', 'texted', 'name_mixup', ...(bones ? ['bones'] : [])]);
        if (sp === 'blow' && c.rng.chance(0.15)) use = 'bias';
      } else sp = c.rng.pick(['lon', ...colors]);
      if (guests.length && sp !== 'lon' && ['lull', 'round_end', 'hurt', 'flashy', 'wrestling'].includes(sit) && c.rng.chance(0.25)) {
        sp = c.rng.pick(guests);
        use = 'any';
      }
      if (sp === 'dc' && use !== 'name_mixup' && c.rng.chance(0.08)) use = 'name_mixup';
      said.push(line(c, L, sp, use, xi, L.round));
    }
    const got = said.filter((x): x is TickerLine => !!x);
    if (got.length) {
      out.push(...got);
      gap = 0;
    }
  }
  return out;
}

// ------------------------------------------------------------------ Juiced Butler

export interface AnnounceLine {
  text: string;
  stage?: boolean; // stage direction (italic aside), not spoken
  corner?: 0 | 1; // fighter being introduced
}

function bget(k: string): string[] {
  const v = content().commentary.butler[k];
  return Array.isArray(v) ? v : [];
}

/** Juiced Butler's introductions, blue corner (b) first, then red (a). */
export function butlerIntro(s: GameState, ev: FightEvent, bout: Bout, seed: number): AnnounceLine[] {
  const A = s.fighters[bout.a];
  const B = s.fighters[bout.b];
  if (!A || !B) return [];
  const r = new Rng(seed);
  const big = bout.position <= 1 || !!bout.title;
  const venue = content().venues.find((v) => v.id === ev.venue)?.name ?? ev.venue;
  const belt = bout.title ? s.belts[bout.title] : null;
  const champ = (f: Fighter) => !!belt && belt.holder === f.id;
  const up = (t: string) => t
    .replace(/\{VENUE\}/g, venue.toUpperCase()).replace(/\{BELT\}/g, (belt?.name ?? '').toUpperCase())
    .replace(/\{EVENT\}/g, ev.name.toUpperCase()).replace(/\{X\}/g, A.last.toUpperCase()).replace(/\{Y\}/g, B.last.toUpperCase())
    .replace(/\{ROMAN\}/g, rematchTag(bout).trim()).replace(/\{DIV\}/g, divisionName(bout.division).toUpperCase())
    .replace(/\{div\}/g, divisionName(bout.division).toLowerCase());
  const out: AnnounceLine[] = [];
  const say = (k: string) => {
    const l = bget(k);
    if (l.length) out.push({ text: up(r.pick(l)) });
  };
  const stage = () => {
    const l = bget('juiced');
    if (l.length) out.push({ text: r.pick(l), stage: true });
  };
  // only the actual main event gets "IT'S TIME" and "THE MAIN EVENT OF THE EVENING"
  const slot = slotKey(bout);
  if (big) {
    if (bout.position === 0) say('its_time');
    if (r.chance(0.6)) stage();
    say(bout.title ? 'open_title' : slot);
    if ((bout.meeting ?? 1) > 1) say('open_rematch');
  } else say((bout.meeting ?? 1) > 1 ? 'open_rematch' : slot);

  const intro = (f: Fighter, idx: 0 | 1, first: boolean) => {
    const v: Record<string, string> = {
      height: heightStr(f.height), weight: String(weighInWeight(f, bout, seed + idx)),
      home: f.hometown.split('|')[0], country: f.country, gym: f.gym,
      w: String(f.record.w), l: String(f.record.l),
      d: f.record.d ? `, ${f.record.d} draw${f.record.d === 1 ? '' : 's'}` : '',
    };
    const fl = (t: string) => sentenceCase(pronounize(up(t).replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m), f));
    const lines: string[] = [];
    lines.push(fl(r.pick(bget(first ? 'blue' : 'red').filter((l) => belt || !/challenger/i.test(l)))));
    lines.push(fl(r.pick(bget('height'))) + ' ' + fl(r.pick(bget('weight'))).replace(/^./, (ch) => ch.toLowerCase()));
    if (big || r.chance(0.5)) lines.push(fl(r.pick(bget('origin'))) + ' ' + fl(r.pick(bget('gym'))).replace(/^./, (ch) => ch.toLowerCase()));
    lines.push(fl(r.pick(bget('record'))));
    const rp = rankPhrase(s, f.id);
    if (rp && !champ(f)) lines.push(sentenceCase(`Fighting as ${rp.replace(/^the /, 'THE ').toUpperCase()}!`));
    if (big || r.chance(0.35)) {
      const facts = funFacts(s, f);
      const fact = r.pick(facts);
      lines.push(fl(r.pick(bget('fact_lead')).replace('{fact}', fact)));
    }
    for (const t of lines) out.push({ text: t, corner: idx });
    if (champ(f)) out.push({ text: up(r.pick(bget('champ_lead'))).replace(/\{HE\}/g, f.gender === 'W' ? 'SHE' : 'HE'), corner: idx });
    else out.push({ text: fl(r.pick(bget('name_lead'))), corner: idx });
    const name = `${f.first}${f.nick ? ` "${f.nick.toUpperCase()}"` : ''} ${f.last.toUpperCase()}!!!`;
    out.push({ text: big ? name.toUpperCase() : name, corner: idx });
    if (big && r.chance(0.45)) stage();
  };
  // challenger / B in blue first, champion / A in red last
  intro(B, 1, true);
  intro(A, 0, false);
  return out;
}

/** Decision ceremony: the three cards, then the winner. */
export function butlerDecision(s: GameState, ev: FightEvent, bout: Bout, seed: number): { lines: AnnounceLine[]; winner: string | null; newChamp: boolean; stillChamp: boolean } {
  const r = new Rng(seed);
  const res = bout.result!;
  const A = s.fighters[bout.a];
  const B = s.fighters[bout.b];
  const lines: AnnounceLine[] = [];
  const up = (t: string) => t.replace(/\{ROUNDS\}/g, ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'][bout.rounds] ?? String(bout.rounds))
    .replace(/\{DIV\}/g, divisionName(bout.division).toUpperCase());
  lines.push({ text: up(r.pick(bget('decision_open'))) });
  const winA = res.winner === A?.id;
  res.scores.forEach((sc, i) => {
    const judge = res.judges[i] ?? `Judge ${i + 1}`;
    const hi = Math.max(sc[0], sc[1]);
    const lo = Math.min(sc[0], sc[1]);
    let t = r.pick(bget('decision_card')).replace('{judge}', judge).replace('{sa}', String(hi)).replace('{sb}', String(lo));
    // the judge who scored it the other way names who they had
    if (res.winner && sc[0] !== sc[1] && (sc[0] > sc[1]) !== winA) t += ` for ${(sc[0] > sc[1] ? A : B)?.last ?? ''}.`;
    if (sc[0] === sc[1]) t = t.replace(/\.\.\.$/, '... a draw.');
    lines.push({ text: t });
  });
  const belt = bout.title ? s.belts[bout.title] : null;
  const winner = res.winner;
  let newChamp = false;
  let stillChamp = false;
  if (!winner) {
    lines.push({ text: r.pick(bget('decision_draw')) });
  } else {
    const kind = /split/i.test(res.detail) ? 'decision_split' : /majority/i.test(res.detail) ? 'decision_majority' : 'decision_unan';
    lines.push({ text: up(r.pick(bget(kind))) });
    if (belt) {
      // the ceremony runs before applyBout, so belt.holder is still the pre-fight champion
      stillChamp = belt.holder === winner;
      newChamp = !stillChamp;
      lines.push({ text: up(r.pick(bget(newChamp ? 'new_champ' : 'still_champ'))) });
    }
    const w = s.fighters[winner];
    if (w) lines.push({ text: `${w.first}${w.nick ? ` "${w.nick.toUpperCase()}"` : ''} ${w.last.toUpperCase()}!!!`, corner: w.id === A?.id ? 0 : 1 });
  }
  return { lines, winner: winner ?? null, newChamp, stillChamp };
}

/** Finish announcement for non-decision endings. */
export function butlerFinish(s: GameState, bout: Bout, seed: number): AnnounceLine[] {
  const r = new Rng(seed);
  const res = bout.result!;
  if (!res.winner) return [{ text: res.method === 'NC' ? 'Ladies and gentlemen, this bout has been declared a NO CONTEST.' : r.pick(bget('decision_draw')) }];
  const w = s.fighters[res.winner];
  const method = ({ KO: 'KNOCKOUT', TKO: 'TECHNICAL KNOCKOUT', SUB: 'SUBMISSION', DQ: 'DISQUALIFICATION', DOC: 'DOCTOR STOPPAGE' } as Record<string, string>)[res.method] ?? res.method;
  const t = r.pick(bget('finish')).replace('{ref}', res.referee ?? 'the referee').replace('{time}', res.time).replace('{round}', String(res.round)).replace('{method}', method);
  return [{ text: t }, { text: `${w?.first ?? ''}${w?.nick ? ` "${w.nick.toUpperCase()}"` : ''} ${w?.last.toUpperCase() ?? ''}!!!` }];
}
