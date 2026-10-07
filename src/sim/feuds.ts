/**
 * Feuds: rival fighters going at each other online between fights. Beef heats up the more
 * they post, boils over when they're booked against each other, and gets a victory lap (or
 * a rematch demand) after they've fought. Heat feeds both fighters' hype.
 */
import type { Feud, Fighter, GameState, SocialPost } from '../core/types';
import type { Rng } from '../core/rng';
import { content } from '../core/content';
import { handleOf, fillTemplate } from './news';

export const feudKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function getFeud(s: GameState, a: string, b: string): Feud | undefined {
  return s.feuds?.[feudKey(a, b)];
}

/** Turn up (or start) the beef between two fighters. */
export function heatUp(s: GameState, a: string, b: string, d: number): Feud {
  s.feuds ??= {};
  const k = feudKey(a, b);
  const f = (s.feuds[k] ??= { a, b, heat: 10, lastPost: -99 });
  f.heat = Math.max(0, Math.min(100, f.heat + d));
  const A = s.fighters[a];
  const B = s.fighters[b];
  if (A && B) {
    if (!A.rivals.includes(b)) A.rivals.push(b);
    if (!B.rivals.includes(a)) B.rivals.push(a);
  }
  return f;
}

/** After they fight: the feud remembers who won (and cools a little, unless it was close). */
export function feudResult(s: GameState, winner: string, loser: string): void {
  const f = getFeud(s, winner, loser);
  if (!f) return;
  f.result = { winner, loser, week: s.week };
  f.heat = Math.max(15, f.heat - 15);
}

const active = (f?: Fighter) => !!f && (f.status === 'active' || f.status === 'free-agent');

/** This week's beef for the paper's feed. Mutates heat & hype. */
export function weeklyBanter(s: GameState, rng: Rng): SocialPost[] {
  const bank = content().templates.banter;
  if (!bank) return [];
  s.feuds ??= {};
  const fighters = s.fighters;
  // existing rivalries become feuds
  for (const f of Object.values(fighters)) {
    if (!active(f) || f.promotion !== 'us') continue;
    for (const r of f.rivals) if (active(fighters[r]) && !getFeud(s, f.id, r)) heatUp(s, f.id, r, 10);
  }
  // trash talkers pick new fights with the guys above them
  const talkers = Object.values(fighters).filter((f) => f.promotion === 'us' && f.status === 'active' && (f.traits.includes('Trash Talker') || f.traits.includes('Clout Chaser')));
  if (talkers.length && rng.chance(0.18)) {
    const t = rng.pick(talkers);
    const ladder = (s.rankings[t.division] ?? []).filter((id) => id !== t.id && active(fighters[id])).slice(0, 8);
    if (ladder.length) heatUp(s, t.id, rng.pick(ladder), 12);
  }
  // who's booked against whom, and how soon
  const booked = new Map<string, { weeks: number; event: string }>();
  for (const ev of s.events) {
    if (ev.week < s.week || ev.week > s.week + 8) continue;
    for (const b of ev.card) if (b.status === 'scheduled') booked.set(feudKey(b.a, b.b), { weeks: Math.max(1, ev.week - s.week), event: ev.name });
  }
  const all = Object.entries(s.feuds).filter(([, f]) => active(fighters[f.a]) && active(fighters[f.b]));
  // cool off the quiet ones
  for (const [k, f] of all) {
    if (!booked.has(k) && s.week - f.lastPost > 2) f.heat = Math.max(0, f.heat - 1);
  }
  const pick = all
    .map(([k, f]) => ({ k, f, w: (booked.has(k) ? 3 : 0) + (f.result && s.week - f.result.week <= 2 ? 2.5 : 0) + f.heat / 50 + rng.next() }))
    .filter((x) => x.w > 1.1)
    .sort((a, b) => b.w - a.w)
    .slice(0, 2);
  const posts: SocialPost[] = [];
  const used = new Set<string>();
  const pres = s.president.name.split(' ').pop() ?? 'boss';
  for (const { k, f } of pick) {
    const bk = booked.get(k);
    const fresh = f.result && s.week - f.result.week <= 2 ? f.result : null;
    let first = fighters[f.a];
    let second = fighters[f.b];
    if (fresh) {
      first = fighters[fresh.winner];
      second = fighters[fresh.loser];
    } else if (second.traits.includes('Trash Talker') && !first.traits.includes('Trash Talker')) [first, second] = [second, first];
    else if (rng.chance(0.5)) [first, second] = [second, first];
    const tier = fresh ? 'after' : bk ? 'booked' : f.heat >= 70 ? 'nuclear' : f.heat >= 35 ? 'heated' : 'spark';
    const openKey = tier === 'after' ? 'after_win' : `${tier}_open`;
    const replyKey = tier === 'after' ? 'after_loss' : `${tier}_reply`;
    const vars = (me: Fighter, opp: Fighter) => ({ opp: opp.last, oppnick: opp.nick, me: me.last, weeks: bk?.weeks ?? 0, event: bk?.event ?? 'the event', president: pres });
    const say = (me: Fighter, opp: Fighter, key: string, reply: boolean) => {
      const list = (bank[key] ?? []).filter((l) => !used.has(l));
      if (!list.length) return;
      const line = rng.pick(list);
      used.add(line);
      const text = fillTemplate(line, vars(me, opp));
      posts.push({ handle: handleOf(me), name: `${me.first} ${me.last}`, text: reply ? `${handleOf(opp)} ${text}` : text, likes: Math.round(me.social.followers * rng.float(0.02, 0.12) * (1 + f.heat / 50)), fighter: me.id });
    };
    say(first, second, openKey, false);
    say(second, first, replyKey, true);
    if ((tier === 'heated' || tier === 'nuclear') && rng.chance(0.35)) say(first, second, 'heated_clap', true);
    f.heat = Math.min(100, f.heat + (bk ? 10 : rng.int(5, 11)));
    f.lastPost = s.week;
    for (const fx of [first, second]) fx.hype = Math.min(100, fx.hype + rng.int(2, 4) + (bk ? 2 : 0));
  }
  return posts;
}
