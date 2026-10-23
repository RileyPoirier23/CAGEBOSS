/**
 * The tutorial's old entry points, kept for the screens that call them (app.ts, livefight.ts,
 * settings.ts). The lessons are in guidelessons.ts, the engine (picture cards, the TUTORIALS
 * list, when lessons pop up) in guide.ts.
 *
 *  - a screen with a tutorialKey: its lesson the first time it's reached (maybeTutorial)
 *  - every hands-on fight: the next fighting lesson that's due (liveTutorial)
 *  - Settings → REPLAY: every lesson again in this career (resetTutorial)
 */
import type { Game } from './app';
import { maybeLesson, nextFightLesson, resetLessons } from './guide';
import { LESSONS } from './guidelessons';

/** Screens both careers share: a fighter career has its own lesson for them. */
const FIGHTER_KEY: Record<string, string> = { fightnight: 'fm_fightnight' };

const keyFor = (g: Game, key: string): string => (g.state?.mode === 'fighter' && FIGHTER_KEY[key] ? FIGHTER_KEY[key] : key);

/** Called whenever a scene with a tutorial key is entered. */
export function maybeTutorial(g: Game, key: string): void {
  maybeLesson(g, keyFor(g, key));
}

/** Before every hands-on fight: the next fighting lesson that's due, if any (the fight waits for it). */
export function liveTutorial(g: Game): boolean {
  return nextFightLesson(g);
}

/** Settings → "Replay tutorial": every lesson again, for this save. */
export function resetTutorial(g: Game): void {
  resetLessons(g, LESSONS.map((l) => l.key));
}
