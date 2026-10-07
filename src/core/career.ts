/**
 * Default career-progression state. Kept dependency-free so save migration and
 * every sim module can lazily attach it to old saves.
 */
import type { CareerState, GameState } from './types';

export const OWNER_PERSON = 'Chester "Chet" Zenith III';

export function defaultCareer(): CareerState {
  return {
    clout: 0,
    tier: 0,
    unlocks: [],
    unlockQueue: [],
    owner: { person: OWNER_PERSON, nextVisit: 0, visits: 0, objectives: [], visit: null, beats: [], gifts: [], nephew: null, seq: 0 },
    contender: { event: null, done: false, seasons: 0, signed: [], alumni: [], winners: [] },
    rp: {},
    wall: {},
    p4p: [],
    moves: { week: -1, event: '', list: [] },
    headlines: [],
    medBills: 0,
    history: [],
  };
}

/** The career block, created on first use (old saves, sandbox, tests). */
export function ensureCareer(s: GameState): CareerState {
  if (!s.career) s.career = defaultCareer();
  const c = s.career;
  // fill fields added after a save was made
  const d = defaultCareer();
  for (const k of Object.keys(d) as (keyof CareerState)[]) if (c[k] === undefined) (c as unknown as Record<string, unknown>)[k] = d[k];
  for (const k of Object.keys(d.owner) as (keyof CareerState['owner'])[]) if (c.owner[k] === undefined) (c.owner as unknown as Record<string, unknown>)[k] = d.owner[k];
  for (const k of Object.keys(d.contender) as (keyof CareerState['contender'])[]) if (c.contender[k] === undefined) (c.contender as unknown as Record<string, unknown>)[k] = d.contender[k];
  return c;
}
