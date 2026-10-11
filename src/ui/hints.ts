/**
 * On-screen wording that depends on the machine. Console builds (Xbox, PlayStation) never
 * mention a keyboard or a mouse: they say the pad button instead, named the way that console
 * names it (A / CROSS, MENU / OPTIONS...). PC, web and phones are unchanged.
 *
 *   hint('ESC = BACK', '{B} = BACK')   // 'ESC = BACK' on PC, 'B = BACK' on Xbox, 'CIRCLE = BACK' on PS
 */
import { isConsole, padStyle } from '../core/platform';

const PS_NAMES: Record<string, string> = {
  A: 'CROSS', B: 'CIRCLE', X: 'SQUARE', Y: 'TRIANGLE',
  LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', LS: 'L3', RS: 'R3',
  View: 'CREATE', Menu: 'OPTIONS', Guide: 'PS',
};
const XB_NAMES: Record<string, string> = { View: 'VIEW', Menu: 'MENU', Guide: 'XBOX' };

/** A pad button's name on this console. */
export function padName(b: string): string {
  return (padStyle === 'playstation' ? PS_NAMES[b] : XB_NAMES[b]) ?? b;
}

/** The PC wording, or on a console the console wording with {A}-style button names filled in. */
export function hint(pc: string, onConsole: string): string {
  return isConsole ? onConsole.replace(/\{(\w+)\}/g, (_, b: string) => padName(b)) : pc;
}

/** "click" on PC, "select" on a console. */
export const CLICK = isConsole ? 'select' : 'click';
