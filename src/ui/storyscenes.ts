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
import { sizeFor } from './arena';
import { stage } from '../sim/fighter';

const stageShort = (s: GameState) => stage(s).short;

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
  const shot = (bg: Shot['bg'], cast: Actor[], lines: Shot['lines'], caption?: string, tv?: Shot['tv']): Shot => ({ bg, cast, lines, caption, tv });
  const mateo = ss?.flags.mateo === 1;
  const zacP = ss?.flags.zacPartner === 1;
  // the bosses, drawn to size (Wyatt is four foot eight, Spadam is six foot seven)
  const boss = (bid: 'wyatt' | 'zac' | 'spadam', x: number, facing: 1 | -1, o: Partial<Actor> = {}, clothes?: { top: number; bottom: number }): Actor => {
    const bf = s.fighters[bid];
    const names = { wyatt: 'Wyatt Smitt', zac: 'Zac Buna', spadam: 'Spadam Biggs' };
    return bf ? { id: bid, fighter: bf, clothes, name: names[bid], x, facing, scale: 1.3 * sizeFor(bf), ...o } : { id: bid, look: CAST.dane, name: names[bid], x, facing, ...o };
  };
  const xav = (x: number, facing: 1 | -1, o: Partial<Actor> = {}) => npc('xavier', 'Xavier "Allstar" Cockett', x, facing, o);
  const dan = (x: number, facing: 1 | -1, o: Partial<Actor> = {}) => npc('daniel', 'Daniel Stinkovich', x, facing, o);
  const len = (x: number, facing: 1 | -1, o: Partial<Actor> = {}) => npc('lenny', 'Lenny Pratt', x, facing, o);
  const kid = (x: number, facing: 1 | -1, o: Partial<Actor> = {}) => npc('mateo', 'Mateo', x, facing, { scale: 1, ...o });
  const GREEN = { top: 0x1e5a2a, bottom: 0x2a2a2a };
  const GI = { top: 0xe8e8e4, bottom: 0xe8e8e4 };
  const WHITE_SUIT = { top: 0xe8e4dc, bottom: 0xe8e4dc };
  switch (id) {
    case 'c1_tv':
      return {
        shots: [
          shot('tv', [ray(440, -1)], [
            { who: null, text: 'The gym TV. A CBFC replay, the sound turned down. A six-foot-seven welterweight with long brown hair and a beard folds a man in half with a knee.', sfx: 'thud' },
            { who: null, text: 'SPADAM "THE WHITE BEAST" BIGGS. 24-0. The referee, a pudgy man with a curly mop and glasses, raises Biggs\'s hand before the other guy stops bouncing.' },
            { who: 'ray', text: "That's not fighting. That's a weather event." },
            { who: 'ray', text: "And that ref is Daniel Stinkovich. I worked a smoker with him in '04. He counted to ten in Roman numerals and lost his place." },
          ], 'CBFC REPLAY', 'beast'),
        ],
      };
    case 'c1_allstar':
      return {
        shots: [
          shot('bingo', [you(150, 1), xav(330, -1, { enter: 'right' })], [
            { who: null, text: 'After the fight. The bingo hall is stacking chairs; bingo resumes at nine.' },
            { who: 'xavier', text: "Xavier Cockett. They call me Allstar. Don't ask, it's a long story and most of it's true." },
            { who: 'xavier', text: "One day I'm gonna run my own league, kid. A real one." },
            { who: 'xavier', text: "And you're gonna be my first signing. Remember I said that.", poses: { xavier: 'taunt' } },
          ]),
        ],
      };
    case 'c1_jar':
      return {
        shots: [
          shot('gym', [ray(390, -1), you(270, 1), ...(mateo ? [kid(200, 1)] : [])], [
            { who: null, text: 'Somebody stole the donation jar off the soup counter. $211 in coins, and an IOU from Mateo.' },
            { who: 'ray', text: 'The only clue. Exactly where the jar was.' },
            { who: null, text: 'He holds up a tiny green hat. About the size of a coffee cup.' },
            { who: 'ray', text: 'Who in God\'s name wears a hat this small?' },
          ]),
        ],
      };
    case 'c2_wyatt':
      return {
        title: 'CHAPTER 2: THE REGIONALS',
        shots: [
          shot('stage', [you(160, 1), boss('wyatt', 300, -1, {}, GREEN)], [
            { who: null, text: `The ${stageShort(s)} champion. Twelve and oh. Never been finished.` },
            { who: 'wyatt', text: "Wyatt Smitt, lad. LeproClepto, if you're nasty. Nice granola bar." },
            { who: null, text: 'He is eating your granola bar. You had it in your bag a minute ago.' },
            { who: 'wyatt', text: "Lovely. Very oaty.", poses: { wyatt: 'taunt' } },
            { who: null, text: 'On his head: a green top hat. A full-size one. You think about the soup jar.' },
          ], 'OPEN WORKOUTS'),
        ],
      };
    case 'c2_wyatt_booked':
      return {
        title: 'THE LEPRECHAUN',
        shots: [
          shot('stage', [you(204, 1, { pose: 'guard' }), boss('wyatt', 262, -1, { pose: 'guard' })], [
            { who: null, text: 'The title fight face-off. Wyatt stands on a milk crate to look you in the chin.', flash: true, sfx: 'crowd' },
            { who: 'wyatt', text: 'Three rounds, lad. Nobody finishes Wyatt Smitt. Nobody.' },
            { who: null, text: 'He pats your chest, smiles, and hops off the crate.' },
            { who: 'wyatt', text: 'Lookin\' for something?', poses: { wyatt: 'taunt' } },
            { who: null, text: 'Your gold chain is gone. Nobody saw it happen.' },
          ]),
        ],
      };
    case 'c2_wyatt_done':
      return {
        shots: [
          shot('gym', [ray(380, -1), you(250, 1), ...(mateo ? [kid(170, 1)] : [])], [
            { who: null, text: 'Round three. Wyatt dropped into the splits and punched straight up. Disqualified. You are the champion. You are also walking funny.' },
            { who: null, text: 'Next morning, a package at the gym: your chain. The soup jar, $211 plus $40 "interest". Mateo\'s IOU, paid.' },
            { who: 'ray', text: '"Sorry lad. It\'s a condition. Great fight. W." In green crayon.' },
            { who: 'ray', text: 'I kind of like him.' },
          ], 'THE NEXT MORNING'),
        ],
      };
    case 'c2_zac_tv':
      return {
        shots: [
          shot('tv', [ray(440, -1)], [
            { who: null, text: 'The Lounge on the gym TV. A ginger kid called Zac "The Attacker" Buna chokes a man out in forty seconds, then helps him up and checks he\'s okay.' },
            { who: null, text: 'His manager grabs the mic: mustard suit, a moustache he thinks is charming. "Next season Zac is a STRIKER. Stand-up only. Big money!"' },
            { who: null, text: 'Zac nods like he\'s hearing it for the first time.' },
            { who: 'ray', text: 'Why would you take the best jiu-jitsu kid in the country and make him kickbox?' },
          ], 'THE LOUNGE, ON TV', 'zac'),
        ],
      };
    case 'c3_zac':
      return {
        shots: [
          shot('hotel', [you(150, 1), boss('zac', 230, -1, {}, { top: 0x2a4a6a, bottom: 0x2a2a30 })], [
            { who: 'zac', text: 'Hey. Can you read me what the pasta is? I left my glasses at home.' },
            { who: null, text: 'He isn\'t wearing glasses. He has never worn glasses. You read him the whole menu.' },
            { who: 'zac', text: "...I'll get the chicken." },
          ], "THE FIGHTERS' HOTEL"),
          shot('hotel', [you(150, 1), boss('zac', 230, -1, {}, { top: 0x2a4a6a, bottom: 0x2a2a30 }), len(370, -1, { enter: 'right' })], [
            { who: 'lenny', text: 'Lenny Pratt, Zac\'s representation. Zac doesn\'t talk to other fighters. Bad for the brand.' },
            { who: null, text: 'He signs the bill in Zac\'s name and pockets the receipt.' },
          ]),
        ],
      };
    case 'c3_spadam':
      return {
        shots: [
          shot('presser', [you(120, 1), boss('spadam', 270, -1, {}, WHITE_SUIT), dan(390, -1)], [
            { who: null, text: 'The Lounge\'s celebrity guest commentator has to duck to get through the door.' },
            { who: 'spadam', text: 'Nice little run, kid. Genuinely. Call me when you\'re somebody.' },
            { who: null, text: 'He signs your gloves without being asked. Behind him, a pudgy man with a curly mop carries his bag.' },
            { who: 'daniel', text: "Daniel Stinkovich. Referee. I'm very experienced.", poses: { daniel: 'taunt' } },
            { who: null, text: 'The referee. Carrying his bag.' },
          ]),
        ],
      };
    case 'c3_zac_booked':
      return {
        title: 'STAND-UP ONLY',
        shots: [
          shot('presser', [you(110, 1), len(240, 1), boss('zac', 370, -1, {}, GREEN)], [
            { who: 'lenny', text: 'The bout agreement, clause nine: STAND-UP ONLY. No takedowns. No grappling. Zac signed it.' },
            { who: null, text: 'Zac looks at the paper like it\'s in another language. To him, it is.' },
            { who: 'zac', text: "I'm a striker now." },
            { who: null, text: 'He doesn\'t sound sure. Rules are rules: no grappling in this fight, for either of you.' },
          ]),
        ],
      };
    case 'c3_zac_done':
      return {
        title: 'THE CONTRACT',
        shots: [
          shot('locker', [you(170, 1), boss('zac', 290, -1, { pose: 'stool' }, GI)], [
            { who: null, text: 'After the Lounge final. You sit down with Zac and read him his contract. All of it.' },
            { who: null, text: 'Lenny takes 60% of his purses. Lenny owns his likeness. Lenny "may assign fighting style at his discretion".' },
            { who: 'zac', text: '...Wait here.', poses: { zac: 'stand' } },
            { who: null, text: 'From the hallway, the loudest firing in the history of the Lounge.', shake: true, sfx: 'crowd' },
          ]),
          shot('gym', [ray(390, -1), you(250, 1), boss('zac', 140, 1, { enter: 'left' }, GI)], [
            { who: 'zac', text: "Monday. I've got nowhere to train. And you don't know any jiu-jitsu." },
            { who: 'ray', text: "He's not wrong." },
            { who: null, text: 'Zac Buna is now your sparring partner. SPAR with him to build your grappling.' },
          ], 'MONDAY'),
        ],
      };
    case 'e_rematch_done':
      return {
        shots: [
          shot('gym', [ray(390, -1), you(270, 1), riv(150, 1, { enter: 'left' })], ss?.flags.rematchWon === 1 ? [
            { who: null, text: 'Monday. Six a.m.' },
            { who: 'rival', text: "I heard there's a gym around here that'll take anybody." },
            { who: 'ray', text: 'Anybody. Grab a mop.' },
            { who: 'rival', text: '...I brought my own.', poses: { rival: 'taunt' } },
          ] : [
            { who: null, text: `Monday. Six a.m. ${Rf} has the belt now. He's here anyway.` },
            { who: 'rival', text: "I don't want to train at my dad's gym anymore. Can I mop?" },
            { who: 'ray', text: 'Mop\'s by the door.' },
          ], 'THE NEXT MONDAY'),
        ],
      };
    case 'c5_callout':
      return {
        title: 'CHAPTER 5: THE WHITE BEAST',
        shots: [
          shot('gym', [you(240, 1), ray(380, -1)], [
            { who: null, text: 'You call out Spadam "The White Beast" Biggs. Twenty-four and oh. Welterweight champion.' },
            { who: null, text: 'He replies in four minutes: "Love the energy, little guy. Genuinely. I\'m a welterweight. You\'re a snack. Eat some soup and get back to me."' },
            { who: null, text: 'Then he likes your post. Which is somehow worse.' },
            { who: 'ray', text: "Don't. Not yet." },
          ]),
        ],
      };
    case 'c5_tape':
      return {
        shots: [
          shot('tv', [riv(70, 1), you(410, -1), ...(zacP ? [boss('zac', 450, -1, {}, GI)] : [])], [
            { who: 'rival', text: 'Kickboxing, five years ago. I was nineteen. He broke my orbital in the first round.' },
            { who: null, text: 'On the tape: Spadam hits him after the bell. The referee, curly mop and glasses, doesn\'t call it.' },
            { who: 'rival', text: 'Daniel. Every one of his fights. Every single one. And watch: has anybody ever taken him down?' },
            { who: null, text: 'Nobody ever has.' },
            ...(zacP ? [{ who: 'zac', text: 'Then we take him down.' }] : [{ who: 'you', text: 'Then I take him down.' }]),
          ], 'THE TAPE', 'tape'),
        ],
      };
    case 'c5_superfight':
      return {
        shots: [
          shot('office', [you(140, 1), npc('dane', 'Dane Whyte', 330, -1)], [
            { who: null, text: 'A year of defending the belt. A year of Spadam saying no.' },
            { who: 'dane', text: 'Biggs ran out of welterweights. The fans want you. He wants money. So: a superfight. You move up. His belt. Five rounds.' },
            { who: 'dane', text: 'One condition from his side. The referee: Daniel Stinkovich. The Commission says he\'s "very experienced".' },
            { who: 'you', text: 'He carries Spadam\'s bag.' },
            { who: 'dane', text: "I know. Take it or leave it." },
          ], 'ONE YEAR LATER  •  2 A.M.'),
        ],
      };
    case 'c5_presser':
      return {
        title: 'THE SUPERFIGHT',
        shots: [
          shot('presser', [you(90, 1), npc('dane', 'Dane Whyte', 190, 1), boss('spadam', 300, -1, {}, WHITE_SUIT), dan(420, -1)], [
            { who: 'spadam', text: 'I want to thank the little guy for moving up. Brave. Very brave. I\'ll be gentle.' },
            { who: null, text: 'Daniel Stinkovich, in a referee shirt for some reason, gives Spadam a thumbs up.' },
            { who: null, text: 'A reporter: "Is it a conflict of interest that the referee is at the press conference?"' },
            { who: 'daniel', text: 'No.', poses: { daniel: 'taunt' } },
            { who: null, text: 'He puts his glasses on, like that settles it.' },
          ]),
        ],
      };
    case 'c5_night':
      return {
        title: 'THE NIGHT BEFORE THE WHITE BEAST',
        shots: [
          shot('gym', [ray(400, -1, { pose: 'stool' }), you(290, 1), ...(mateo ? [kid(230, 1)] : []), ...(zacP ? [boss('zac', 150, 1, {}, GI)] : []), riv(60, 1)], [
            { who: null, text: `After hours. The whole gym. ${mateo ? 'Mateo, fourteen now, tapes your hands like Ray taught him. ' : ''}${zacP ? 'Zac drills single legs on a heavy bag. ' : ''}${Rf} mops.` },
            { who: 'ray', text: 'Hands up. Chin down. Eat something.' },
            { who: null, text: 'The same thing he said before your first amateur fight.' },
            { who: 'ray', text: "Marie would have liked you. She'd have hated the fighting. But she'd have liked you." },
          ]),
        ],
      };
    case 'c5_won':
      return {
        title: 'THE WHITE BEAST FALLS',
        shots: [
          shot('cage', [you(220, 1, { pose: 'celebrate' }), dan(300, -1), boss('spadam', 400, -1, { pose: 'down' })], [
            { who: null, text: 'Twenty-four and oh is twenty-four and one.', flash: true, sfx: 'roar' },
            { who: null, text: 'Out of habit, Daniel grabs Spadam\'s wrist and starts to raise it. The arena boos him out of the cage.', poses: { daniel: 'taunt' } },
          ]),
          shot('cage', [you(220, 1), boss('spadam', 300, -1), ray(400, -1, { pose: 'celebrate' })], [
            { who: null, text: 'Spadam sits on the canvas for a long time. Then he gets up, finds you, and lifts your hand himself.' },
            { who: 'spadam', text: 'Pride of the Maritimes. Fair enough.', poses: { you: 'celebrate' } },
            { who: 'ray', text: "I'm not crying. It's the soup.", shake: true, sfx: 'crowd' },
          ]),
        ],
      };
    case 'c5_lost':
      return {
        shots: [
          shot('street', [ray(200, 1), you(260, -1)], [
            { who: null, text: 'Daniel raises Spadam\'s hand with both of his. The van home has no heat.' },
            { who: 'ray', text: 'Monday. Six a.m.' },
            { who: null, text: 'A week later Spadam\'s team calls. He wants the rematch. He says it was "closer than he likes". He has never said that about anybody.' },
          ], 'THE DRIVE HOME'),
        ],
      };
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
            { who: null, text: 'Somewhere in Halifax, a six-foot-seven man with long brown hair watches the replay. Twice.' },
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
          shot('gym', [ray(410, -1), you(300, 1), riv(220, 1), ...(zacP ? [boss('zac', 150, 1, {}, GI)] : []), ...(mateo ? [kid(80, 1)] : [])], [
            { who: null, text: `Monday. Six a.m.${mateo ? ' Mateo has his first amateur fight next month.' : ''}${zacP ? ' Zac runs the Tuesday jiu-jitsu class.' : ''} ${Rf} mops.` },
            { who: 'ray', text: 'Somebody in a cowboy hat called. Says he\'s starting a league. Says you owe him a signing.' },
            { who: null, text: "Ray makes the soup Marie's way. The road doesn't end. It just gets more people on it." },
            { who: null, text: 'The story is over. Your career isn\'t. (LEGACY MODE is unlocked.)' },
          ], 'MONDAY. SIX A.M.'),
        ],
      };
  }
  return null;
}
