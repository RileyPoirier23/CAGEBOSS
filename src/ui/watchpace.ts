/**
 * Pacing for watched fights: how long each ticker line holds the screen, which booth lines
 * may talk over the action, and where NEXT ROUND jumps to. Pure functions (tests/watch.test.ts).
 */
import type { TickerLine } from '../core/types';

/** Acts that end a fight: NEXT ROUND never skips past one of these. */
const FINISH_ACTS: Record<string, boolean> = { ko: true, tko: true, tap: true, stop: true, stool: true };

/**
 * Seconds an action line holds before the next one, from the fight time to the next action line:
 * a strike and its follow-up (same second) flow together, a 20 s lull breathes, big moments linger.
 */
export function lineBeat(line: TickerLine, next: TickerLine | undefined): number {
  if (line.intensity >= 3) return 1.6;
  const gap = next && next.round === line.round ? next.t - line.t : 20;
  return gap === 0 ? 0.55 : 0.75 + Math.min(1, gap / 20) * 0.55;
}

/** Seconds a booth line needs to be read. */
export function talkBeat(line: TickerLine): number {
  return 0.9 + line.text.length / 55;
}

/** Booth lines that hold the fight until they're read: the finish, the decision and the end of a round. */
export function blocksAction(line: TickerLine): boolean {
  if (!line.speaker) return false;
  const k = line.key ?? '';
  return k.indexOf('booth:finish_') === 0 || k === 'booth:decision' || k === 'booth:robbery' || k === 'booth:round_end';
}

/** True for a line that ends the fight. */
export function isFinishLine(line: TickerLine): boolean {
  return !line.speaker && FINISH_ACTS[line.act] === true;
}

/**
 * NEXT ROUND: the index of the next round-ending bell at or after idx. If the fight ends first,
 * stop three action lines before the finish so it still plays out (idx when that's already behind us).
 */
export function nextRoundIndex(lines: TickerLine[], idx: number): number {
  let end = lines.length;
  for (let k = idx; k < lines.length; k++) {
    const l = lines[k];
    if (l.speaker) continue;
    if (l.act === 'bell') return k;
    if (isFinishLine(l)) {
      end = k;
      break;
    }
  }
  // the fight ends this round (a finish, or the lines just run out): back up three action lines
  let n = 0;
  let k = end - 1;
  while (k >= idx) {
    if (!lines[k].speaker) {
      n++;
      if (n === 3) return k;
    }
    k--;
  }
  return idx;
}

/** The next action (non-booth) line at or after idx, if any. */
export function nextAction(lines: TickerLine[], idx: number): TickerLine | undefined {
  for (let k = idx; k < lines.length; k++) if (!lines[k].speaker) return lines[k];
  return undefined;
}
