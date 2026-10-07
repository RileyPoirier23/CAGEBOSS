/**
 * Live bleets: the internet reacting while you watch. Other fighters on the roster,
 * media outlets and fans post about what just happened in the cage.
 */
import type { Bout, FightEvent, GameState, TickerLine } from '../core/types';
import type { Rng } from '../core/rng';
import { content } from '../core/content';
import { handleOf, FAN_HANDLES } from './news';
import { expandPop } from './popculture';
import { onetonBleet } from './oneton';

export type BleetKind = 'fighter' | 'media' | 'fan';
export interface Bleet {
  handle: string;
  kind: BleetKind;
  text: string;
}

/** What a ticker line is about, for bleeting purposes, and how likely the timeline reacts. */
export function bleetSituation(line: TickerLine): { sit: string; chance: number } | null {
  const k = line.key ?? '';
  if (line.speaker) return null;
  if (/^(ko_|tko_)/.test(k) || k === 'late_ref') return { sit: 'ko', chance: 0.95 };
  if (k === 'knockdown') return { sit: 'knockdown', chance: 0.85 };
  if (k === 'tap') return { sit: 'tap', chance: 0.95 };
  if (k === 'decision_robbery') return { sit: 'robbery', chance: 1 };
  if (k === 'decision') return { sit: 'decision', chance: 0.7 };
  if (k === 'rocked') return { sit: 'rocked', chance: 0.6 };
  if (k === 'sub_attempt' || k === 'wont_tap') return { sit: 'sub', chance: 0.55 };
  if (k === 'round_end') return { sit: 'round', chance: 0.55 };
  if (k === 'takedown') return { sit: 'takedown', chance: 0.25 };
  if (k === 'cut') return { sit: 'blood', chance: 0.4 };
  if (line.intensity <= 1) return { sit: 'lull', chance: 0.035 };
  return null;
}

/** Lines used recently (across fights in a session): avoid repeating them until the bank runs dry. */
const RECENT: string[] = [];
const remember = (line: string) => {
  RECENT.push(line);
  if (RECENT.length > 160) RECENT.shift();
};

// fans type in a dozen different voices
const FAN_PRE = ['', '', '', 'bro ', 'nah ', 'LMAO ', 'yo ', 'ngl ', 'chat ', 'wait ', 'ok but ', 'not gonna lie ', 'BRO ', 'lol ', 'genuinely '];
const FAN_POST = ['', '', '', ' lmao', ' smh', ' fr', ' no cap', '!!!', ' #BloodMoney', ' (i am sober)', ' send help', ' im crying', ' 100%', ' ...', ' on god'];
const HOT_TAKES = [
  'this fight > {pop_movie}', '{x} fights like {pop_athlete} on {pop_food}', 'somebody tell {pop_celeb} to sit down on fighter row',
  '{y} is having a {pop_show} season finale moment', '{pop_streamer} watch party is losing it rn', '{x} merch selling out on {pop_app} as we speak',
  'not {pop_celeb} live-bleeting this from fighter row', '{y} needs a {pop_brand} sponsorship for that chin', 'the commentary team is more lit than {pop_musician}',
];

export function makeBleet(s: GameState, ev: FightEvent, bout: Bout, sit: string, actor: 0 | 1, rng: Rng): Bleet | null {
  const bank = content().templates.bleets?.[sit];
  if (!bank) return null;
  const A = s.fighters[actor === 0 ? bout.a : bout.b];
  const B = s.fighters[actor === 0 ? bout.b : bout.a];
  if (!A || !B) return null;
  // @1ton lurks in every fight's replies
  if (rng.chance(0.07)) {
    const o = onetonBleet(s, bout, rng);
    if (o) return o;
  }
  const r = rng.next();
  let kind: BleetKind = r < 0.5 ? 'fan' : r < 0.8 ? 'fighter' : 'media';
  let handle = '';
  if (kind === 'fighter') {
    const peers = Object.values(s.fighters).filter((f) => f.promotion === 'us' && f.status === 'active' && f.id !== bout.a && f.id !== bout.b);
    if (peers.length) handle = handleOf(rng.pick(peers));
    else kind = 'fan';
  }
  if (kind === 'media') {
    const outlets = content().outlets;
    if (outlets.length) handle = '@' + rng.pick(outlets).name.replace(/[^A-Za-z0-9]/g, '');
    else kind = 'fan';
  }
  if (kind === 'fan') handle = '@' + rng.pick(FAN_HANDLES);
  const all = bank[kind] ?? bank.fan;
  if (!all?.length) return null;
  const fresh = all.filter((l) => !RECENT.includes(l));
  let line = rng.pick(fresh.length ? fresh : all);
  remember(line);
  if (kind === 'fan') {
    // remix: a hot take now and then, and everyone has their own typing style
    if (rng.chance(0.18)) line = rng.pick(HOT_TAKES);
    const pre = rng.pick(FAN_PRE);
    line = (pre ? pre + line.charAt(0).toLowerCase() + line.slice(1) : line) + rng.pick(FAN_POST);
  }
  const shout = kind === 'fan' && rng.chance(0.12);
  const promo = s.promotion.name;
  const text = expandPop(line, rng.int(0, 1e6))
    .replace(/\{X\}/g, A.last.toUpperCase()).replace(/\{Y\}/g, B.last.toUpperCase())
    .replace(/\{x\}/g, A.last).replace(/\{y\}/g, B.last)
    .replace(/\{xh\}/g, handleOf(A)).replace(/\{yh\}/g, handleOf(B))
    .replace(/\{event\}/g, ev.name).replace(/\{promotion\}/g, promo);
  return { handle, kind, text: shout ? text.toUpperCase() : text };
}
