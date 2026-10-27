import { describe, it, expect } from 'vitest';
import { newGame } from './setup';
import { describe as presenceFor } from '../src/presence';
import type { Game } from '../src/ui/app';
import { TitleScene } from '../src/ui/scenes/title';
import { QuickFightScene } from '../src/ui/scenes/quickfight';
import { FightNightScene } from '../src/ui/scenes/fightnight';
import { PaperScene } from '../src/ui/scenes/paper';
import { FMHubScene } from '../src/ui/scenes/fmhub';
import type { FMState } from '../src/sim/fighter';

/** A stand-in for the running game: just the bits the Discord line reads. */
function game(scene: object | null, state: ReturnType<typeof newGame> | null, inLiveFight = false): Game {
  return { scene, state, inLiveFight } as unknown as Game;
}
const on = <T extends object>(cls: { prototype: T }): T => Object.create(cls.prototype) as T;

describe('the Discord presence line', () => {
  it('menus and Quick Fight', () => {
    expect(presenceFor(game(null, null))).toEqual({ details: 'In the menus' });
    // the title screen with last session's career still loaded is still the menus
    expect(presenceFor(game(on(TitleScene), newGame()))).toEqual({ details: 'In the menus' });
    expect(presenceFor(game(on(QuickFightScene), null))).toEqual({ details: 'Quick Fight', state: 'Picking fighters' });
    expect(presenceFor(game(on(QuickFightScene), null, true))).toEqual({ details: 'Quick Fight', state: 'In the cage' });
  });

  it('the promoter: the week, and what part of it', () => {
    const s = newGame();
    s.week = 13;
    expect(presenceFor(game({}, s))).toEqual({ details: 'Running the promotion', state: 'At the desk • Week 14' });
    expect(presenceFor(game(on(PaperScene), s)).state).toBe('Reading the paper • Week 14');
    expect(presenceFor(game(on(FightNightScene), s)).state).toBe('Fight night • Week 14');
    s.mode = 'sandbox';
    expect(presenceFor(game({}, s)).details).toBe('Sandbox');
  });

  it('Road To Champion and Legacy Mode: the tier, the week, the cage', () => {
    const s = newGame();
    s.mode = 'fighter';
    s.week = 3;
    s.fm = { tier: 'regional', legacy: false, retired: false } as FMState;
    expect(presenceFor(game(on(FMHubScene), s))).toEqual({ details: 'Road To Champion', state: 'Regional promotion • Week 4' });
    expect(presenceFor(game(on(FMHubScene), s, true)).state).toBe('In the cage • Regional promotion');
    s.fm.legacy = true;
    expect(presenceFor(game(on(FMHubScene), s)).details).toBe('Legacy Mode');
  });

  it('every line fits Discord (2 to 128 characters)', () => {
    const s = newGame();
    s.week = 519;
    for (const a of [presenceFor(game({}, s)), presenceFor(game(null, null))])
      for (const v of a.state === undefined ? [a.details] : [a.details, a.state]) expect(v.length >= 2 && v.length <= 128, v).toBe(true);
  });
});
