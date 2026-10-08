/**
 * Legacy Mode extras: the things a fighter does when nobody is writing the script.
 *  - change weight class (up for power and an easy cut, down for speed and a miserable one)
 *  - open your own gym (costs money, makes money, makes your training better)
 *  - retire and become a promoter (a new promoter career, with your name on the door)
 */
import type { GameState } from '../core/types';
import { money } from '../core/format';
import { DIVISION_LIMITS, DIVISION_ORDER, divisionName } from './divisions';
import { computeRankings } from './rankings';
import { fm, me } from './fighter';

export interface Gym { name: string; level: number; members: number; opened: number }
type FMG = ReturnType<typeof fm> & { gym?: Gym };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Neighbouring divisions you can move to (same gender). */
export function divisionMoves(s: GameState): string[] {
  const d = me(s).division;
  const pool = DIVISION_ORDER.filter((x) => x.startsWith('w') === d.startsWith('w'));
  const i = pool.indexOf(d);
  return [pool[i - 1], pool[i + 1]].filter(Boolean) as string[];
}

export function changeDivision(s: GameState, to: string): string {
  const st = fm(s);
  const f = me(s);
  if (st.fight) return "You've got a fight booked. Finish it first.";
  const from = f.division;
  const up = (DIVISION_LIMITS[to] ?? 155) > (DIVISION_LIMITS[from] ?? 155);
  f.division = to;
  if (!s.divisionsOpen.includes(to)) s.divisionsOpen.push(to);
  // bigger men hit harder; smaller men are faster and gassed from the cut
  const k = up ? 1 : -1;
  f.skills.power = clamp(f.skills.power + 3 * k, 10, 99);
  f.skills.chin = clamp(f.skills.chin + 2 * k, 10, 99);
  f.skills.cardio = clamp(f.skills.cardio - 2 * k, 10, 99);
  f.skills.striking = clamp(f.skills.striking - 1 * k, 10, 99);
  st.walkWeight = (DIVISION_LIMITS[to] ?? 155) + (up ? 6 : 14);
  // join the new division's ladder (bottom rung) outside the CBFC
  if (st.tier !== 'of') {
    st.ladder = (st.rosters[to] ?? []).filter((x) => x !== f.id);
    st.ladder.push(f.id);
    st.rosters[to] = st.ladder;
  }
  st.offers = [];
  f.hype = clamp(f.hype + 3, 0, 100);
  computeRankings(s);
  return `You move ${up ? 'up' : 'down'} to ${divisionName(to)}. ${up ? 'The cut is easy. The men are huge.' : 'Everyone is fast. You are hungry.'}`;
}

export function gym(s: GameState): Gym | undefined {
  return (fm(s) as FMG).gym;
}

export const GYM_COST = 25000;
export const GYM_UPGRADE = (lvl: number) => 15000 * lvl;

export function openGym(s: GameState): string {
  const st = fm(s) as FMG;
  const f = me(s);
  if (st.gym) return 'You already own a gym.';
  if (st.money < GYM_COST) return `You need ${money(GYM_COST)}. You have ${money(st.money)}.`;
  st.money -= GYM_COST;
  st.gym = { name: `${f.last} MMA`, level: 1, members: 20 + Math.round(f.hype / 4), opened: s.week };
  return `${st.gym.name} is open. ${st.gym.members} members on day one. Most of them want selfies.`;
}

export function upgradeGym(s: GameState): string {
  const st = fm(s) as FMG;
  if (!st.gym) return '';
  const c = GYM_UPGRADE(st.gym.level);
  if (st.gym.level >= 4) return "It's the nicest gym in the state. There's a cold plunge. You've become what you hated.";
  if (st.money < c) return `The upgrade costs ${money(c)}.`;
  st.money -= c;
  st.gym.level++;
  return `${st.gym.name} is now level ${st.gym.level}: ${['', 'mats and a heavy bag', 'a real cage', 'a strength room', 'pro fighters training with you'][st.gym.level]}.`;
}

/** Weekly gym business. Returns a report line (or null). */
export function gymWeek(s: GameState): string | null {
  const st = fm(s) as FMG;
  const g = st.gym;
  if (!g) return null;
  const f = me(s);
  const target = 20 + g.level * 25 + f.hype * (0.6 + g.level * 0.2);
  g.members = Math.max(5, Math.round(g.members + (target - g.members) * 0.15));
  const income = g.members * (35 + g.level * 10);
  const costs = 400 + g.level * 450;
  st.money += income - costs;
  return `${g.name}: ${g.members} members, ${money(income - costs)} this week.`;
}

/** Training multiplier from your own gym. */
export function gymTrainBonus(s: GameState): number {
  const g = gym(s);
  return g ? 1 + g.level * 0.06 : 1;
}
