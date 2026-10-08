/**
 * Fight week, staged: the press conference and the weigh-in face-off for your own fights
 * (Road To Champion and Legacy). Rules and consequences: src/sim/media.ts.
 */
import type { Game } from './app';
import type { GameState } from '../core/types';
import { Rng } from '../core/rng';
import { alertBox } from './widgets';
import { CAST, playCutscene, type Actor } from './cutscene';
import { fm, me, stage, contractLimit } from '../sim/fighter';
import { interviewMoment, answerInterview } from '../sim/fmstory';
import { fightWeekMedia, faceoffLine, answerFaceoff, FACEOFF_CHOICES } from '../sim/media';

const OPP_CLOTHES = [{ top: 0x7a1a1a, bottom: 0x1a1a1a }, { top: 0x1a3a6a, bottom: 0x2a2a2a }, { top: 0x2a2a2a, bottom: 0x4a4a52 }, { top: 0x3a5a2a, bottom: 0x22222a }];

/** Any press conference / face-off this fight week, then `done`. `save` after each choice. */
export function fightWeekShow(g: Game, s: GameState, rng: Rng, save: () => void, done: () => void): void {
  const st = fm(s);
  if (!st.fight) return done();
  const media = fightWeekMedia(s, rng);
  const f = me(s);
  const opp = s.fighters[st.fight.opp];
  if (!opp) return done();
  const title = !!(st.fight.title || st.fight.tierTitle);
  const sg = stage(s);
  const promoter: Actor = st.tier === 'of' ? { id: 'promo', look: CAST.dane, name: 'Dane Whyte', x: 240, facing: 1 }
    : st.tier === 'pfl' ? { id: 'promo', look: CAST.producer, name: 'Lounge producer', x: 240, facing: 1 }
      : { id: 'promo', look: CAST.promoter, name: `${sg.short} promoter`, x: 240, facing: 1 };
  const faceoff = () => {
    if (!media.faceoff) return done();
    const lbs = contractLimit(s);
    playCutscene(g, {
      title: title ? 'TITLE FIGHT WEIGH-INS' : undefined,
      shots: [{
        bg: 'stage',
        cast: [
          { id: 'you', fighter: f, name: f.first, x: 196, facing: 1, pose: 'guard' },
          { id: 'opp', fighter: opp, name: `${opp.first} ${opp.last}`, x: 284, facing: -1, pose: 'guard' },
        ],
        caption: `${sg.short.toUpperCase()}  •  OFFICIAL WEIGH-INS`,
        lines: [
          { who: null, text: `${opp.first} ${opp.last}: ${(lbs - Math.random()).toFixed(1)} lbs. ${f.first} ${f.last}: ${(st.missedWeight ? lbs + 2.4 : lbs - Math.random()).toFixed(1)} lbs.` },
          { who: null, text: title ? 'The belt sits on a table between you. Nobody looks at it. Everybody looks at it.' : 'FACE OFF!', flash: true, sfx: 'crowd' },
          { who: 'opp', text: faceoffLine(s, rng), poses: { opp: 'taunt' } },
        ],
      }],
      choices: FACEOFF_CHOICES,
    }, (id) => {
      const out = answerFaceoff(s, id ?? 'stare', rng);
      save();
      alertBox(g, 'THE FACE-OFF', out, done);
    });
  };
  if (!media.presser) return faceoff();
  const iv = interviewMoment(s, rng, 'pre', undefined, true)!;
  const clothes = OPP_CLOTHES[opp.id.length % OPP_CLOTHES.length];
  playCutscene(g, {
    title: 'PRESS CONFERENCE',
    shots: [{
      bg: 'presser',
      cast: [
        { id: 'you', fighter: f, clothes: { top: 0x3a3a44, bottom: 0x22222a }, name: f.first, x: 110, facing: 1 },
        promoter,
        { id: 'opp', fighter: opp, clothes, name: `${opp.first} ${opp.last}`, x: 370, facing: -1 },
      ],
      lines: [
        { who: 'promo', text: title ? `This Saturday, for the ${sg.short} title: ${f.last} versus ${opp.last}. Five rounds. Somebody's leaving with gold, and somebody's leaving with a concussion.` : `This Saturday: ${f.last} versus ${opp.last}. Two guys who do not like each other. Probably. We'll see.` },
        { who: 'opp', text: faceoffLine(s, rng) },
        { who: iv.reporter, text: `${iv.reporter}, ${iv.outlet}. ${f.last}: ${iv.q}` },
      ],
    }],
    choices: iv.choices,
  }, (id) => {
    const out = answerInterview(s, iv, id ?? 'humble', rng);
    save();
    alertBox(g, 'THE PRESS CONFERENCE', out, faceoff);
  });
}
