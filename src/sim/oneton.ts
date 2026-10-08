/**
 * 1ton (@1ton): the reporter who only ever asks about Mexican fighters.
 * Presser questions, the president's answers, live bleets and feed posts.
 */
import type { Bout, FightEvent, Fighter, GameState, SocialPost } from '../core/types';
import type { Rng } from '../core/rng';
import { content } from '../core/content';
import { clamp } from '../core/format';
import { fullName } from './fighters';
import { adjustMeter } from './econ';
import { expandPop } from './popculture';
import { PRESSER, type OnetonAnswer, type OnetonKind, type Reply } from './onetonlines';

export type { OnetonAnswer } from './onetonlines';

export const ONETON = 'oneton';
export const ONETON_HANDLE = '@1ton';

export const isMexican = (f: Fighter | undefined | null): boolean => !!f && f.country === 'Mexico';

function bank(key: string): string[] {
  return content().career.oneton[key] ?? [];
}

/** Pick a line from a bank, avoiding the ones 1ton used recently (he has a lot to say, but not the same thing twice). */
function fresh(s: GameState, key: string, rng: Rng, fallback: string): string {
  const lines = bank(key);
  if (!lines.length) return fallback;
  const recent = String(s.flags.oneton_recent ?? '').split('|').filter(Boolean);
  const open = lines.map((_, i) => i).filter((i) => !recent.includes(`${key}:${i}`));
  const i = open.length ? rng.pick(open) : rng.int(0, lines.length - 1);
  recent.push(`${key}:${i}`);
  // remember about half of each bank so lines come back only after a while
  s.flags.oneton_recent = recent.slice(-24).join('|');
  return lines[i];
}

function rel(s: GameState) {
  return (s.media.reporters[ONETON] ??= { rel: 10, banned: false, memory: [], scoops: 0 });
}

export interface OnetonQuestion {
  kind: OnetonKind;
  text: string;
  fighter: string | null;
  /** which conversation (its answers belong to this question) */
  convo: number;
  /** the placeholders, for filling the answers the same way */
  opp?: string | null;
  where?: string;
}

/** Pick one of his conversations of this kind, not one he used recently. */
function pickConvo(s: GameState, kind: OnetonKind, rng: Rng): number {
  const list = PRESSER[kind];
  const recent = String(s.flags.oneton_convos ?? '').split('|').filter(Boolean);
  const open = list.map((_, i) => i).filter((i) => !recent.includes(`${kind}:${i}`));
  const i = open.length ? rng.pick(open) : rng.int(0, list.length - 1);
  recent.push(`${kind}:${i}`);
  s.flags.oneton_convos = recent.slice(-8).join('|');
  return i;
}

/** Fill a line of his (or yours) with the names. */
function fillLine(s: GameState, t: string, f?: Fighter | null, opp?: Fighter | null, where = ''): string {
  const pres = s.president.name.split(' ').slice(-1)[0];
  const promises = Number(s.flags.oneton_promises) || 0;
  return expandPop(
    t.replace(/\{f\}/g, f ? fullName(f) : 'him').replace(/\{opp\}/g, opp?.last ?? 'the other guy')
      .replace(/\{presidentLast\}/g, pres).replace(/\{promotion\}/g, s.promotion.name).replace(/\{where\}/g, where).replace(/\{n\}/g, String(promises)),
  );
}

/** What 1ton asks at this event's presser. It is always about Mexican fighters. */
export function onetonQuestion(s: GameState, ev: FightEvent, rng: Rng): OnetonQuestion {
  const promises = Number(s.flags.oneton_promises) || 0;
  const make = (kind: OnetonKind, f: Fighter | null = null, opp: Fighter | null = null, where = ''): OnetonQuestion => {
    const convo = pickConvo(s, kind, rng);
    return { kind, convo, text: fillLine(s, PRESSER[kind][convo].q, f, opp, where), fighter: f?.id ?? null, opp: opp?.id ?? null, where };
  };
  // he keeps count: promises with no Mexican main event to show for them come back to haunt you
  const mexMain = ev.card.some((b) => b.position === 0 && b.status !== 'cancelled' && (isMexican(s.fighters[b.a]) || isMexican(s.fighters[b.b])));
  if (promises >= 2 && !mexMain && rng.chance(0.4)) return make('ask_broken');
  const live = ev.card.filter((b) => b.status !== 'cancelled');
  for (const b of live.slice().sort((x, y) => x.position - y.position)) {
    for (const [id, other] of [[b.a, b.b], [b.b, b.a]] as const) {
      const f = s.fighters[id];
      if (isMexican(f)) return make('ask_card', f, s.fighters[other]);
    }
  }
  const roster = Object.values(s.fighters).filter((f) => f.promotion === 'us' && f.status === 'active' && isMexican(f));
  if (roster.length) return make('ask_roster', rng.pick(roster));
  const elsewhere = Object.values(s.fighters).filter((f) => (f.status === 'free-agent' || (f.status === 'active' && f.promotion && f.promotion !== 'us')) && isMexican(f));
  if (elsewhere.length && rng.chance(0.55)) {
    const f = rng.pick(elsewhere);
    const rival = f.promotion ? content().rivals.find((r) => r.id === f.promotion)?.name : null;
    return make('ask_other', f, null, rival ? `fighting for ${rival} right now` : 'unsigned, training in a garage in Tijuana');
  }
  return make('ask_none');
}

/** The answers to this question (labels for the buttons). */
export function onetonReplies(q: OnetonQuestion): Record<OnetonAnswer, Reply> {
  return (PRESSER[q.kind][q.convo] ?? PRESSER[q.kind][0]).a;
}


/** The president answers; returns [what you said, how 1ton takes it]. */
export function answerOneton(s: GameState, q: OnetonQuestion, a: OnetonAnswer, rng: Rng): [string, string] {
  const r = rel(s);
  const f = q.fighter ? s.fighters[q.fighter] : null;
  switch (a) {
    case 'promise':
      r.rel = clamp(r.rel + 8, -100, 100);
      adjustMeter(s, 'fans', 0.4);
      if (f && f.promotion === 'us') f.hype = Math.min(100, f.hype + 3);
      s.flags.oneton_promises = (Number(s.flags.oneton_promises) || 0) + 1;
      break;
    case 'deflect':
      r.rel = clamp(r.rel - 5, -100, 100);
      break;
    case 'joke':
      r.rel = clamp(r.rel + 2, -100, 100);
      adjustMeter(s, 'media', 0.4);
      break;
    case 'honest':
      r.rel = clamp(r.rel + 5, -100, 100);
      adjustMeter(s, 'media', 0.3);
      // honesty resets the promise tally a little
      s.flags.oneton_promises = Math.max(0, (Number(s.flags.oneton_promises) || 0) - 1);
      break;
    case 'roast':
      r.rel = clamp(r.rel - 12, -100, 100);
      adjustMeter(s, 'fans', -0.3);
      adjustMeter(s, 'media', 0.6);
      break;
  }
  s.stats.onetonQuestions = (s.stats.onetonQuestions ?? 0) + 1;
  // the answer and his reaction belong to the question he asked
  const reply = onetonReplies(q)[a];
  const opp = q.opp ? s.fighters[q.opp] : null;
  return [fillLine(s, reply.said, f, opp, q.where), fillLine(s, reply.react, f, opp, q.where)];
}

/** A live bleet from @1ton: hype for Mexican fighters, contempt for everyone else. */
export function onetonBleet(s: GameState, bout: Bout, rng: Rng): { handle: string; kind: 'media'; text: string } | null {
  const A = s.fighters[bout.a];
  const B = s.fighters[bout.b];
  if (!A || !B) return null;
  const mex = isMexican(A) ? A : isMexican(B) ? B : null;
  const lines = bank(mex ? 'bleet_mex' : 'bleet_non');
  if (!lines.length) return null;
  const x = mex ?? (rng.chance(0.5) ? A : B);
  const y = x === A ? B : A;
  const text = expandPop(rng.pick(lines)).replace(/\{x\}/g, x.last).replace(/\{y\}/g, y.last).replace(/\{promotion\}/g, s.promotion.name).replace(/\{presidentLast\}/g, s.president.name.split(' ').slice(-1)[0]);
  return { handle: ONETON_HANDLE, kind: 'media', text };
}

/** Morning-paper feed post. */
export function onetonPost(s: GameState, rng: Rng): SocialPost | null {
  const lines = bank('feed');
  if (!lines.length) return null;
  const n = Object.values(s.fighters).filter((f) => f.promotion === 'us' && f.status === 'active' && isMexican(f)).length;
  const text = rng.pick(lines).replace(/\{promotion\}/g, s.promotion.name).replace(/\{n\}/g, n ? String(n) : 'ZERO');
  return { handle: ONETON_HANDLE, name: '1ton', text, likes: rng.int(800, 40000) };
}
