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
  kind: 'ask_card' | 'ask_roster' | 'ask_none' | 'ask_other' | 'ask_broken';
  text: string;
  fighter: string | null;
}

/** What 1ton asks at this event's presser. It is always about Mexican fighters. */
export function onetonQuestion(s: GameState, ev: FightEvent, rng: Rng): OnetonQuestion {
  const pres = s.president.name.split(' ').slice(-1)[0];
  const promises = Number(s.flags.oneton_promises) || 0;
  const fill = (t: string, f?: Fighter, opp?: Fighter, where = '') => expandPop(
    t.replace(/\{f\}/g, f ? fullName(f) : 'him').replace(/\{opp\}/g, opp?.last ?? 'the other guy')
      .replace(/\{presidentLast\}/g, pres).replace(/\{promotion\}/g, s.promotion.name).replace(/\{where\}/g, where).replace(/\{n\}/g, String(promises)),
  );
  const ask = (k: string) => fresh(s, k, rng, '1ton. Mexican fighters. When?');
  // he keeps count: promises with no Mexican main event to show for them come back to haunt you
  const mexMain = ev.card.some((b) => b.position === 0 && b.status !== 'cancelled' && (isMexican(s.fighters[b.a]) || isMexican(s.fighters[b.b])));
  if (promises >= 2 && !mexMain && rng.chance(0.4)) return { kind: 'ask_broken', text: fill(ask('ask_broken')), fighter: null };
  const live = ev.card.filter((b) => b.status !== 'cancelled');
  for (const b of live.slice().sort((x, y) => x.position - y.position)) {
    for (const [id, other] of [[b.a, b.b], [b.b, b.a]] as const) {
      const f = s.fighters[id];
      if (isMexican(f)) return { kind: 'ask_card', text: fill(ask('ask_card'), f, s.fighters[other]), fighter: f.id };
    }
  }
  const roster = Object.values(s.fighters).filter((f) => f.promotion === 'us' && f.status === 'active' && isMexican(f));
  if (roster.length) {
    const f = rng.pick(roster);
    return { kind: 'ask_roster', text: fill(ask('ask_roster'), f), fighter: f.id };
  }
  const elsewhere = Object.values(s.fighters).filter((f) => (f.status === 'free-agent' || (f.status === 'active' && f.promotion && f.promotion !== 'us')) && isMexican(f));
  if (elsewhere.length && rng.chance(0.55)) {
    const f = rng.pick(elsewhere);
    const rival = f.promotion ? content().rivals.find((r) => r.id === f.promotion)?.name : null;
    const where = rival ? `fighting for ${rival} right now` : 'unsigned, training in a garage in Tijuana';
    return { kind: 'ask_other', text: fill(ask('ask_other'), f, undefined, where), fighter: f.id };
  }
  return { kind: 'ask_none', text: fill(ask('ask_none')), fighter: null };
}

export type OnetonAnswer = 'promise' | 'deflect' | 'joke' | 'honest' | 'roast';

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
  const pres = s.president.name.split(' ').slice(-1)[0];
  const said = fresh(s, 'answer_' + a, rng, 'Next question.');
  // broken promises sting more
  const react = (q.kind === 'ask_broken' && a === 'promise' ? '"That makes ' + (Number(s.flags.oneton_promises) || 0) + '," says 1ton, adding a tally mark to his notebook. ' : '')
    + fresh(s, 'react_' + a, rng, '1ton keeps his hand up.').replace(/\{presidentLast\}/g, pres);
  return [said, react];
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
