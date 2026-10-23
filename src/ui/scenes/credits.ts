import type { Game } from '../app';
import { openEndCredits } from '../endcredits';

/**
 * CREDITS, from anywhere: the full scrolling roll, the thank-you and the memorial (the same
 * credits as after Road To Champion), with a skip that stops at the memorial.
 */
export function openCredits(g: Game): void {
  openEndCredits(g, () => {}, { menu: true });
}
