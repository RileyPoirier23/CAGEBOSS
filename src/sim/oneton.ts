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

function rel(s: GameState) {
  return (s.media.reporters[ONETON] ??= { rel: 10, banned: false, memory: [], scoops: 0 });
}

export interface OnetonQuestion {
  kind: 'ask_card' | 'ask_roster' | 'ask_none' | 'ask_other';
  text: string;
  fighter: string | null;
}

/** What 1ton asks at this event's presser. It is always about Mexican fighters. */
export function onetonQuestion(s: GameState, ev: FightEvent, rng: Rng): OnetonQuestion {
  const pres = s.president.name.split(' ').slice(-1)[0];
  const fill = (t: string, f?: Fighter, opp?: Fighter, where = '') => expandPop(
    t.replace(/\{f\}/g, f ? fullName(f) : 'him').replace(/\{opp\}/g, opp?.last ?? 'the other guy')
      .replace(/\{presidentLast\}/g, pres).replace(/\{promotion\}/g, s.promotion.name).replace(/\{where\}/g, where),
  );
  const live = ev.card.filter((b) => b.status !== 'cancelled');
  for (const b of live.slice().sort((x, y) => x.position - y.position)) {
    for (const [id, other] of [[b.a, b.b], [b.b, b.a]] as const) {
      const f = s.fighters[id];
      if (isMexican(f)) return { kind: 'ask_card', text: fill(rng.pick(bank('ask_card')), f, s.fighters[other]), fighter: f.id };
    }
  }
  const roster = Object.values(s.fighters).filter((f) => f.promotion === 'us' && f.status === 'active' && isMexican(f));
  if (roster.length) {
    const f = rng.pick(roster);
    return { kind: 'ask_roster', text: fill(rng.pick(bank('ask_roster')), f), fighter: f.id };
  }
  const elsewhere = Object.values(s.fighters).filter((f) => (f.status === 'free-agent' || (f.status === 'active' && f.promotion && f.promotion !== 'us')) && isMexican(f));
  if (elsewhere.length && rng.chance(0.55)) {
    const f = rng.pick(elsewhere);
    const rival = f.promotion ? content().rivals.find((r) => r.id === f.promotion)?.name : null;
    const where = rival ? `fighting for ${rival} right now` : 'unsigned, training in a garage in Tijuana';
    return { kind: 'ask_other', text: fill(rng.pick(bank('ask_other')), f, undefined, where), fighter: f.id };
  }
  return { kind: 'ask_none', text: fill(rng.pick(bank('ask_none'))), fighter: null };
}

export type OnetonAnswer = 'promise' | 'deflect' | 'joke';

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
  }
  s.stats.onetonQuestions = (s.stats.onetonQuestions ?? 0) + 1;
  const said = rng.pick(bank('answer_' + a).length ? bank('answer_' + a) : ['Next question.']);
  const react = rng.pick(bank('react_' + a).length ? bank('react_' + a) : ['1ton keeps his hand up.']);
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
