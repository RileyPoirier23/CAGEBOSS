/**
 * Sandbox editors (filled out in the sandbox milestone).
 */
import type { Game } from '../app';
import { openFighterEditor } from './editor_fighter';

export function openEditor(g: Game, kind: 'fighter', id: string | null, onDone: () => void): void {
  if (kind === 'fighter') openFighterEditor(g, id, onDone);
}
