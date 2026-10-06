import { loadContent } from '../tools/loadContent';
import { createNewGame } from '../src/sim/newgame';
import type { GameState } from '../src/core/types';

let loaded = false;
export function content(): void {
  if (!loaded) {
    loadContent();
    loaded = true;
  }
}

export function newGame(seed = 123): GameState {
  content();
  return createNewGame({ seed, mode: 'career', difficulty: 'normal', promotionName: 'Test FC', presidentName: 'Test Boss' });
}
