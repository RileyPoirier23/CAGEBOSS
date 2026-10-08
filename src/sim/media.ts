/**
 * Fight week in public (Road To Champion / Legacy): the press conference and the weigh-in
 * face-off for YOUR fights. The bigger the fight, the more of it there is: every title fight
 * gets both, the CBFC always gets a face-off, the local circuit mostly doesn't bother.
 * The staging is src/ui/faceoff.ts.
 */
import type { GameState } from '../core/types';
import { Rng } from '../core/rng';
import { money } from '../core/format';
import { fm, me, rapSheet } from './fighter';
import { fmx, isLegacy } from './fmstory';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface FightWeekMedia { presser: boolean; faceoff: boolean }

/** What this fight week gets. (Fights against the story's rival are staged by the story instead.) */
export function fightWeekMedia(s: GameState, rng: Rng): FightWeekMedia {
  const st = fm(s);
  const o = st.fight;
  if (!o) return { presser: false, faceoff: false };
  const ss = fmx(s).story;
  if (ss && !isLegacy(s) && o.opp === ss.rival) return { presser: false, faceoff: false };
  const title = !!(o.title || o.tierTitle);
  const hype = me(s).hype;
  const presser = st.tier === 'amateur' ? false : title || (st.tier !== 'regional' && rng.chance(0.25 + hype / 150));
  const faceoff = title || st.tier === 'of' || rng.chance({ amateur: 0.3, regional: 0.55, pfl: 0.8, of: 1 }[st.tier]);
  return { presser, faceoff };
}

/** What he says to your face. */
export function faceoffLine(s: GameState, rng: Rng): string {
  const st = fm(s);
  const opp = st.fight ? s.fighters[st.fight.opp] : null;
  const you = me(s).last;
  if (!opp) return '...';
  const has = (...t: string[]) => t.some((x) => opp.traits.includes(x));
  const pool = has('Trash Talker', 'Showman', 'Hothead', 'Clout Chaser', 'Diva')
    ? [`You're a nice story, ${you}. Saturday the story ends.`, `I've seen your fights. All four minutes of highlights.`, 'Look at me. LOOK at me. You already know.', `Your mom called. She wants you to pull out.`, `I'm going to retire you and then I'm going to buy your gym.`]
    : has('Wholesome', 'Devout', 'Shy', 'Mentor', 'Family First')
      ? ['Good luck Saturday. Genuinely.', 'Respect. See you in there.', 'Let\'s give them a fight.']
      : ['...', `You're in my way, ${you}.`, 'Saturday.', 'Nothing personal. Business.', 'You look light. Bad cut?'];
  return rng.pick(pool);
}

export const FACEOFF_CHOICES = [
  { id: 'stare', label: 'Stare him down. Don\'t blink.' },
  { id: 'talk', label: 'Talk trash right back' },
  { id: 'shove', label: 'Shove him' },
  { id: 'respect', label: 'Touch fists' },
];

/** A face-off choice. Returns what happened. */
export function answerFaceoff(s: GameState, choice: string, rng: Rng): string {
  const st = fm(s);
  const f = me(s);
  const opp = st.fight ? s.fighters[st.fight.opp] : null;
  const name = opp?.last ?? 'He';
  switch (choice) {
    case 'stare':
      if (rng.chance(0.5 + st.morale / 300)) {
        st.morale = clamp(st.morale + 5, 0, 100);
        f.hype = clamp(f.hype + 2, 0, 100);
        return `${name} blinks first. Everybody sees it. The clip of him looking away gets slowed down and set to sad piano.`;
      }
      st.morale = clamp(st.morale - 2, 0, 100);
      return `You blink first. A camera catches it. The comments are brutal. "Bro blinked like he owed money."`;
    case 'talk':
      f.hype = clamp(f.hype + 5, 0, 100);
      if (opp) opp.hype = clamp(opp.hype + 2, 0, 100);
      return rng.chance(0.5) ? `You get the last word in. The crowd "OHHHH"s. ${name} pretends he didn't hear it. He heard it.` : `You and ${name} talk over each other for a full minute. Nobody can make out a word. It's the most-watched clip of the week.`;
    case 'shove': {
      const fine = { amateur: 100, regional: 500, pfl: 2500, of: 10000 }[st.tier];
      st.money -= fine;
      f.hype = clamp(f.hype + 8, 0, 100);
      if (opp) opp.hype = clamp(opp.hype + 4, 0, 100);
      rapSheet(s, 'CHARGE', `Shoved ${opp ? `${opp.first} ${opp.last}` : 'an opponent'} at a weigh-in. Fined ${money(fine)}.`);
      return rng.chance(0.35)
        ? `${name} shoves back. Then everybody shoves everybody. Somebody's cousin gets put through a table. Fined ${money(fine)}. Pay-per-view buys: up.`
        : `Security gets between you before he can answer. The Commission fines you ${money(fine)}. The promoter sends a fruit basket.`;
    }
    default:
      st.morale = clamp(st.morale + 4, 0, 100);
      f.hype = clamp(f.hype - 1, 0, 100);
      return `You touch fists. ${name} nods. Half the internet calls it class, the other half calls it soft. Your coach calls it smart.`;
  }
}
