/**
 * The Road To Champion's big moments, staged as cutscenes (src/ui/cutscene.ts).
 * The words and the consequences live in src/sim/fmstory.ts; this is the staging: who is
 * standing where, who says what, and when somebody gets shoved. Beats without a scene here
 * play as the usual story card.
 */
import type { Fighter, GameState } from '../core/types';
import { me } from '../sim/fighter';
import { fmx } from '../sim/fmstory';
import { CAST, type Actor, type Cutscene, type Shot } from './cutscene';

const YOU_CLOTHES = { top: 0x3a3a44, bottom: 0x22222a };
const RIVAL_CLOTHES = { top: 0xf2f0ea, bottom: 0xc8b48a };

/** The cutscene for a story beat, if it has one (choices are added by the caller). */
export function storyScene(s: GameState, id: string): Cutscene | null {
  const f = me(s);
  const ss = fmx(s).story;
  const r: Fighter | undefined = ss?.rival ? s.fighters[ss.rival] : undefined;
  const R = r?.last ?? 'Vance';
  const Rf = r?.first ?? 'Tyler';
  const you = (x: number, facing: 1 | -1, o: Partial<Actor> = {}): Actor => ({ id: 'you', fighter: f, clothes: YOU_CLOTHES, name: f.first, x, facing, ...o });
  const riv = (x: number, facing: 1 | -1, o: Partial<Actor> = {}): Actor => (r ? { id: 'rival', fighter: r, clothes: RIVAL_CLOTHES, name: `${Rf} ${R}`, x, facing, ...o } : { id: 'rival', look: CAST.gordon, name: `${Rf} ${R}`, x, facing, ...o });
  const npc = (who: keyof typeof CAST, name: string, x: number, facing: 1 | -1, o: Partial<Actor> = {}): Actor => ({ id: who, look: CAST[who], name, x, facing, ...o });
  const ray = (x: number, facing: 1 | -1, o: Partial<Actor> = {}) => npc('ray', 'Uncle Ray', x, facing, o);
  const shot = (bg: Shot['bg'], cast: Actor[], lines: Shot['lines'], caption?: string): Shot => ({ bg, cast, lines, caption });
  const mateo = ss?.flags.mateo === 1;
  switch (id) {
    case 'c1_open':
      return {
        title: 'CHAPTER 1: SOUP',
        shots: [
          shot('street', [you(120, 1, { enter: 'left' })], [
            { who: null, text: 'Moncton. November. Raining sideways, the way it does.' },
            { who: null, text: "Uncle Ray's Boxing & Soup: half gym, half soup kitchen, one working light bulb." },
          ]),
          shot('gym', [ray(330, -1), you(150, 1, { enter: 'left' })], [
            { who: 'ray', text: 'There they are. Welcome to the family business, kid.' },
            { who: 'ray', text: 'Half gym, half soup kitchen. All mine. For now.' },
            { who: 'you', text: 'For now?' },
            { who: 'ray', text: `The landlord wants eight grand by the end of the year, or this place becomes a vape shop.`, sfx: 'thud' },
            { who: 'ray', text: 'So. No pressure. Win some fights, get famous, save the soup.' },
            { who: 'ray', text: 'And mop. Mostly mop.', poses: { ray: 'taunt' } },
          ]),
        ],
      };
    case 'c1_rival':
      return {
        shots: [
          shot('street', [you(150, 1), riv(330, -1, { enter: 'right' })], [
            { who: null, text: 'A white sports car pulls up outside the gym. It costs more than the building.' },
            { who: 'rival', text: `${Rf} ${R}. "Trust Fund". Seven and oh. You've probably heard of me.` },
            { who: 'rival', text: 'Soup kitchen. That is adorable. Do you guys fight for food?', poses: { rival: 'taunt' } },
            { who: 'rival', text: "See you at the top. Or, you know. Not." },
          ]),
        ],
      };
    case 'c1_landlord':
      return {
        shots: [
          shot('gym', [ray(120, 1), you(190, 1), npc('gordon', 'Gordon Vance', 360, -1, { enter: 'right' })], [
            { who: null, text: 'A man in a navy three-piece suit steps over the puddle in the doorway like it owes him money.' },
            { who: 'gordon', text: 'Gordon Vance. Vance Properties. I own this building. And the ten around it.' },
            { who: 'you', text: 'Vance? As in...' },
            { who: 'gordon', text: `${Rf} is my son. He tells me you're the reason my tenant thinks he can pay his rent in soup.` },
            { who: 'ray', text: "It's very good soup, Gordon." },
            { who: 'gordon', text: 'End of the year, Raymond. Or I knock it down.', sfx: 'thud', shake: true },
          ]),
        ],
      };
    case 'c1_mateo':
      return {
        shots: [
          shot('gym', [you(160, 1), npc('mateo', 'Mateo', 340, -1, { enter: 'right', scale: 1 })], [
            { who: null, text: "A kid has been hanging around the door for a week. Hoodie three sizes too big. Already has a fighter's stare." },
            { who: 'mateo', text: "I'm Mateo. Ray says you could teach me." },
            { who: 'mateo', text: "He says you're not that good yet. But you're cheap." },
          ]),
        ],
      };
    case 'c1_vance_booked':
    case 'c2_vance_booked':
      return {
        title: id === 'c1_vance_booked' ? 'THE TITLE FIGHT' : 'ROUND TWO',
        shots: [
          shot('stage', [you(170, 1, { pose: 'guard' }), riv(310, -1, { pose: 'guard' })], id === 'c1_vance_booked' ? [
            { who: null, text: 'The weigh-in is in the back of a bingo hall. Somebody is still calling numbers.' },
            { who: 'rival', text: `My dad owns the building you train in. After Saturday, I'll own you too.` },
            { who: 'you', text: "Does he own the bingo hall? 'Cause you're about to get called." },
            { who: 'rival', text: "...What does that even mean?", poses: { rival: 'taunt' } },
          ] : [
            { who: null, text: 'The regional press conference. There is a TV camera. There is also a man selling hot dogs.' },
            { who: 'rival', text: 'Last time was a fluke. This time there is a TV camera, so my dad is actually watching.' },
            { who: 'you', text: "Then he'll see it twice." },
          ]),
        ],
      };
    case 'c1_beatvance':
      return {
        shots: [
          shot('cage', [you(220, 1, { pose: 'celebrate' }), ray(300, -1, { pose: 'celebrate' }), riv(420, -1, { pose: 'down' })], [
            { who: null, text: "Seven and oh is seven and one.", flash: true, sfx: 'roar' },
            { who: 'ray', text: 'THE SOUP! THE SOUP IS UNDEFEATED!', shake: true },
            { who: null, text: `${R}'s dad's car is gone before the decision is read.` },
          ]),
        ],
      };
    case 'c2_jimmy':
      return {
        title: 'THE PARKING LOT',
        shots: [
          shot('lot', [riv(250, 1), npc('jimmy', 'Jimmy Quavo', 320, -1), you(60, 1, { enter: 'left' })], [
            { who: null, text: 'Leaving the arena late. Rain. Your car is at the far end of the lot, because of course it is.' },
            { who: 'rival', text: 'Same as last time. And nothing that shows up in a cup.' },
            { who: 'jimmy', text: 'Bro. I am a professional. I sell vitamins.' },
            { who: null, text: `An envelope changes hands. Then ${Rf} turns around. He sees you seeing him.`, poses: { rival: 'block' } },
          ]),
        ],
      };
    case 'c3_lounge':
      return {
        title: 'CHAPTER 3: THE LOUNGE',
        shots: [
          shot('presser', [you(130, 1), npc('producer', 'Producer', 240, -1), riv(350, -1)], [
            { who: 'producer', text: 'Love the soup gym angle. LOVE it. Okay. So.' },
            { who: 'producer', text: `We need you and ${R} to hate each other. On camera. In about four minutes.` },
            { who: 'rival', text: 'Already done. I hate everything about the help.', poses: { rival: 'taunt' } },
            { who: 'producer', text: 'See? A natural. So. Are you going to give us a moment?' },
          ]),
        ],
      };
    case 'c3_confessional':
      return {
        shots: [
          shot('booth', [you(240, 1, { pose: 'stool' })], [
            { who: null, text: 'A velvet couch. A red light. A producer you can hear chewing.' },
            { who: null, text: `"Tell the camera how you feel about ${R}. Really feel. We need tears or threats. Ideally both."` },
          ]),
        ],
      };
    case 'c3_landlord':
      return {
        title: 'THE ULTIMATUM',
        shots: [
          shot('landlord', [you(140, 1), npc('gordon', 'Gordon Vance', 330, -1)], [
            { who: null, text: 'Photos of every building he owns. One of a building he knocked down, framed like a trophy.' },
            { who: 'gordon', text: "You've made my son look ordinary. I don't forgive that." },
            { who: 'gordon', text: 'Everything you owe. Before your first CBFC fight. Or the bulldozer comes on fight night.', sfx: 'thud' },
          ]),
        ],
      };
    case 'c4_cbfc':
      return {
        title: 'CHAPTER 4: THE BIG SHOW',
        shots: [
          shot('office', [you(140, 1), npc('dane', 'Dane Whyte', 330, -1)], [
            { who: 'dane', text: "Look. I'm gonna be honest with you." },
            { who: null, text: 'Dane Whyte has never been honest with anyone.' },
            { who: 'dane', text: `I don't know who you are. But ${R} keeps talking about you, and the fans keep asking about "the soup guy".` },
            { who: 'dane', text: "So. Win a couple, you get him. Beat him, I'll think about a title shot. Lose, you go back to the soup." },
          ]),
        ],
      };
    case 'c4_grudge_booked':
      return {
        title: 'THE GRUDGE MATCH',
        shots: [
          shot('presser', [you(110, 1), npc('dane', 'Dane Whyte', 240, 1), riv(370, -1)], [
            { who: 'dane', text: "Soup Kitchen versus Trust Fund. I couldn't make this up if I tried. And I've tried." },
            { who: 'rival', text: ss?.flags.reported === 1 ? 'You took three months from me. I am taking the rest of your career.' : 'My dad is going to knock down your gym the same night I knock you out. Poetry.' },
            { who: 'you', text: "You've never read a poem in your life." },
            { who: 'rival', text: '...I have a guy who reads them for me.', poses: { rival: 'taunt' } },
          ]),
        ],
      };
    case 'c4_grudge_won':
      return {
        shots: [
          shot('lot', [you(160, 1), riv(320, -1, { enter: 'right' })], [
            { who: null, text: 'After the fight. The tunnel behind the arena. He finds you.' },
            { who: 'rival', text: 'My dad bet the building on me. Like, actually. He told everybody at the club.' },
            { who: 'rival', text: "He's never watched one of my fights to the end. He left in the second round." },
            { who: null, text: "He walks away. And for the first time, he doesn't look rich. He just looks tired." },
          ]),
          shot('office', [you(140, 1), npc('dane', 'Dane Whyte', 330, -1)], [
            { who: 'dane', text: "Title shot. Don't make me regret it." },
          ]),
        ],
      };
    case 'c4_titleshot':
      return {
        title: 'THE NIGHT BEFORE',
        shots: [
          shot('gym', [ray(300, -1, { pose: 'stool' }), you(160, 1), ...(mateo ? [npc('mateo', 'Mateo', 80, 1, { scale: 1 })] : [])], [
            { who: null, text: 'The gym is closed. The lights are on.' },
            { who: 'ray', text: "When I lost to Butch in '87, I thought that was it. My one shot." },
            { who: 'ray', text: 'Then I opened this place. And every kid who walked in got a shot.' },
            ...(mateo ? [{ who: 'mateo', text: "I'm one of the kids." }] : []),
            { who: 'ray', text: 'This one is yours. Eat something. Then go get it.' },
          ]),
        ],
      };
    case 'c4_champ':
      return {
        title: 'CHAMPION',
        shots: [
          shot('cage', [you(240, 1, { pose: 'celebrate' }), ray(320, -1, { pose: 'celebrate' }), ...(mateo ? [npc('mateo', 'Mateo', 170, 1, { scale: 1, pose: 'celebrate' })] : [])], [
            { who: null, text: 'AND NEW...', sfx: 'roar', flash: true },
            { who: null, text: `${f.first.toUpperCase()} "${(f.nick || 'THE SOUP').toUpperCase()}" ${f.last.toUpperCase()}!`, shake: true, sfx: 'crowd' },
            { who: 'ray', text: "I'm not crying. It's the soup. I've been chopping onions for thirty years.", poses: { ray: 'stand' } },
            { who: 'ray', text: ss?.gymSaved ? 'The gym is saved, kid. Your name is going next to the soup pot.' : 'Tomorrow you walk into Gordon Vance\'s office and pay him in cash. Then we buy the building.' },
          ]),
        ],
      };
    case 'e_rematch_booked':
      return {
        title: 'THE REMATCH',
        shots: [
          shot('stage', [you(170, 1), riv(310, -1)], [
            { who: null, text: 'No sunglasses. No designer underwear. Just a guy who has been training.' },
            { who: 'rival', text: 'My dad sold your building.' },
            { who: 'rival', text: "To me. I'm not knocking it down. I just wanted you to hear it from me." },
            { who: 'rival', text: "Before I take that belt." },
          ]),
        ],
      };
    case 'e_end':
      return {
        title: 'THE ROAD GOES ON',
        shots: [
          shot('gym', ss?.flags.rematchWon === 1 ? [ray(340, -1), you(220, 1), riv(100, 1, { enter: 'left' })] : [ray(300, -1), you(180, 1)], ss?.flags.rematchWon === 1 ? [
            { who: null, text: 'Monday. Six a.m.' },
            { who: 'rival', text: "I heard there's a gym around here that'll take anybody." },
            { who: 'ray', text: 'Anybody. Grab a mop.' },
            { who: 'rival', text: "...I brought my own.", poses: { rival: 'taunt' } },
          ] : [
            { who: null, text: 'Monday. Six a.m.' },
            { who: 'ray', text: 'He has the belt. You have soup. Some things never change.' },
            { who: 'ray', text: 'Go get it back.' },
          ]),
        ],
      };
  }
  return null;
}
