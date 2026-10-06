/**
 * Routes a loaded / new GameState to the right scene for its phase.
 */
import type { Game } from './app';
import type { GameState } from '../core/types';
import { PaperScene } from './scenes/paper';
import { DeskScene } from './scenes/desk';
import { LedgerScene } from './scenes/ledger';
import { EndingScene } from './scenes/ending';
import { FightNightScene } from './scenes/fightnight';
import { eventThisWeek } from '../sim/events';

export function startGameFromState(g: Game, s: GameState, label = 'Loading your empire'): void {
  g.state = s;
  g.loading(label, () => routePhase(g, true));
}

export function routePhase(g: Game, direct = false): void {
  const s = g.state!;
  // heavy transitions (week processing, fight night setup) get a loading screen
  if (!direct && (s.phase === 'fightnight' || s.phase === 'ledger')) {
    return g.loading(s.phase === 'fightnight' ? 'Fight night' : 'Closing the books', () => routePhase(g, true), 0.8);
  }
  if (s.ending) return g.goto(new EndingScene(g));
  switch (s.phase) {
    case 'paper':
      return g.goto(new PaperScene(g));
    case 'desk':
      return g.goto(new DeskScene(g));
    case 'fightnight': {
      const ev = eventThisWeek(s);
      return ev ? g.goto(new FightNightScene(g, ev.id)) : g.goto(new LedgerScene(g));
    }
    case 'ledger':
      return g.goto(new LedgerScene(g));
    default:
      return g.goto(new EndingScene(g));
  }
}
