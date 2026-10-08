/**
 * Road To Champion: the story, and the "moments" the hub shows between the weekly grind.
 *
 *  - The storyline: Uncle Ray's gym (Ray's Boxing & Soup) is drowning in back rent, and a
 *    trust-fund rival from the fancy gym across town follows you up every league, one step
 *    ahead, until the CBFC title. Beats fire on conditions (week, wins, league, belts).
 *  - League move-ups: a proper contract signing, not a line of text.
 *  - Staff check-ins: coach, nutritionist, manager and cutman message you about real things.
 *  - Interviews: reporters want you more the more famous you get (pre-fight and post-fight).
 *
 * Legacy Mode skips the storyline (everything else stays) and turns the chaos up.
 * The UI for all of this is src/ui/moments.ts.
 */
import type { Fighter, GameState } from '../core/types';
import { Rng } from '../core/rng';
import { content } from '../core/content';
import { money } from '../core/format';
import { generateFighter } from './generate';
import { overall } from './fighters';
import { DIVISION_LIMITS } from './divisions';
import { fm, me, stage, offerVs, type StaffId, type Tier } from './fighter';
import { makeBoss } from './cast';

export interface MomentChoice { id: string; label: string }
export type FMMoment =
  | { kind: 'signing'; league: string; short: string; tier: Tier; promoter: string; terms: [string, string][]; blurb: string }
  | { kind: 'checkin'; who: StaffId; name: string; text: string }
  | { kind: 'story'; id: string; chapter: string; title: string; text: string; who: string; choices?: MomentChoice[] }
  | { kind: 'interview'; phase: 'pre' | 'post'; reporter: string; outlet: string; q: string; choices: MomentChoice[] }
  /** the end of the road: credits roll and the memorial */
  | { kind: 'credits' }
  /** a chapter is done: congratulations, and a boss unlocked for Quick Fight */
  | { kind: 'chapter'; n: number; title: string; boss: string; bossName: string };

export interface StoryState {
  /** beats already shown */
  seen: string[];
  rival: string | null;
  /** Ray's back rent (the gym closes if nobody pays it by the CBFC) */
  rent: number;
  gymSaved: boolean;
  flags: Record<string, number | string | boolean>;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

type FMX = ReturnType<typeof fm> & { moments?: FMMoment[]; story?: StoryState; legacy?: boolean; stats?: FMStats; xavier?: boolean };
export interface FMStats { kos: number; subs: number; decs: number; streak: number; best: number; docsCaught: number; badSigned: number; interviews: number; belts: number }

export const fmx = (s: GameState): FMX => fm(s) as FMX;
export const isLegacy = (s: GameState): boolean => !!fmx(s).legacy;

export function pushMoment(s: GameState, m: FMMoment): void {
  const st = fmx(s);
  (st.moments ??= []).push(m);
}

export function stats(s: GameState): FMStats {
  const st = fmx(s);
  return (st.stats ??= { kos: 0, subs: 0, decs: 0, streak: 0, best: 0, docsCaught: 0, badSigned: 0, interviews: 0, belts: 0 });
}

// ------------------------------------------------------------------ league signings

const PROMOTERS: Record<Tier, string[]> = {
  amateur: ["Dave (he owns the bar)", 'Big Lou from the bingo hall', 'A man called Sal'],
  regional: ['Tony Marchetti', 'Carla Fenwick', 'Jimmy "Two Phones" Okafor', 'Rick Delacroix'],
  pfl: ['Ray Sorrento, Lounge Commissioner'],
  of: ['Dane Whyte, CBFC President'],
};

/** The contract for the next league: terms in the fine print, a promoter, a blurb. */
export function signingMoment(s: GameState, rng: Rng): FMMoment {
  const sg = stage(s);
  const st = fm(s);
  const f = me(s);
  const base = { amateur: 400, regional: 2000, pfl: 12000, of: 14000 }[sg.tier];
  const fights = { amateur: 3, regional: 4, pfl: 6, of: 4 }[sg.tier];
  // Legacy Mode: the first man to sign you is Xavier "Allstar" Cockett, who finally got his league
  const sx = fmx(s);
  const xavier = !!sx.legacy && !sx.xavier;
  if (xavier) sx.xavier = true;
  const promoter = xavier ? 'Xavier "Allstar" Cockett' : rng.pick(PROMOTERS[sg.tier]);
  const terms: [string, string][] = [
    ['Promotion', sg.name],
    ['Fighter', `${f.first} "${f.nick}" ${f.last}`],
    ['Bouts', `${fights} fights, exclusive`],
    ['Show money', money(base)],
    ['Win bonus', money(base)],
    ['Weight class', `${f.division.toUpperCase()} (${'made every time, or else'})`],
    ['Signed', `Week ${s.week + 1}`],
  ];
  const blurb = xavier
    ? `Xavier "Allstar" Cockett tips his cowboy hat. "Told you. Years ago, at a bingo hall, I told a kid I'd run my own league one day and he'd be my first signing. He went and got famous on me. So it's you." ${sg.name} is his. The ink is real. The hat is real. The horse is a rental.`
    : sg.tier === 'amateur'
    ? `${sg.name}: a cage with one wobbly panel, a ring card girl who is also the promoter's niece, and a canvas held together with duct tape. Everybody starts somewhere.`
    : sg.tier === 'pfl'
    ? "The Professional Fighters' Lounge: a season, playoffs, a final and a cheque the size of a door. Real names on this roster. The cameras never stop."
    : sg.tier === 'of'
      ? 'The CBFC. The big show. Every fighter you grew up watching is in this building. Dane Whyte shakes your hand like he is checking it for weapons.'
      : `${sg.name} is a step up: bigger crowds, a real canvas, judges who own glasses. ${st.circuit[st.stage - 1]?.short ?? 'The local'} belt got you in the door.`;
  return { kind: 'signing', league: sg.name, short: sg.short, tier: sg.tier, promoter, terms, blurb };
}

// ------------------------------------------------------------------ staff check-ins

/** Now and then somebody on your team checks in. About something real. */
export function staffCheckin(s: GameState, rng: Rng): FMMoment | null {
  const st = fm(s);
  const f = me(s);
  if (s.week < 1 || !rng.chance(0.38)) return null;
  const lim = st.fight?.limit ?? weightOf(s);
  const over = st.walkWeight - lim;
  const weeksOut = st.fight ? st.fight.week - s.week : 99;
  const opp = st.fight ? s.fighters[st.fight.opp] : null;
  const opts: { who: StaffId; text: string; w: number }[] = [];
  const nm = (k: StaffId) => st.staffNames[k];
  // coach: reads the opponent, or tells you what to drill
  if (opp) {
    const best = (Object.entries(opp.skills) as [string, number][]).filter(([k]) => ['striking', 'power', 'wrestling', 'grappling', 'cardio'].includes(k)).sort((a, b) => b[1] - a[1])[0][0];
    const tip: Record<string, string> = {
      striking: "He's the better boxer on paper. Don't stand in front of him: kick the legs, clinch, make it ugly.",
      power: "He hits like a car door. Keep your hands up, move your head, and make him miss early so he gets tired of swinging.",
      wrestling: "He's going to shoot. A lot. Sprawl, get your underhooks, and make him pay every time he comes in.",
      grappling: "Do NOT go to the ground with this guy unless you're on top and he's tired. Keep it standing.",
      cardio: "He'll still be fresh in round three. Bank the early rounds and go to the body to slow him down.",
    };
    opts.push({ who: 'coach', text: `Watched tape on ${opp.last}. ${tip[best]}`, w: weeksOut <= 3 ? 3 : 1 });
  } else {
    const weak = (Object.entries(f.skills) as [string, number][]).filter(([k]) => ['striking', 'power', 'wrestling', 'grappling', 'cardio', 'fightIQ'].includes(k)).sort((a, b) => a[1] - b[1])[0][0];
    opts.push({ who: 'coach', text: `Your ${weak === 'fightIQ' ? 'fight IQ' : weak} is the weak spot. Everybody you fight from now on is going to find it. We drill it this week.`, w: 1 });
  }
  if (st.energy < 35) opts.push({ who: 'coach', text: "You look like a zombie. Rest. Overtraining isn't dedication, it's stupidity in a nicer t-shirt.", w: 2 });
  // nutritionist: the scale
  if (st.fight && over > 6) opts.push({ who: 'nutrition', text: `You're ${over.toFixed(1)} lbs over ${lim} with ${weeksOut} week${weeksOut === 1 ? '' : 's'} to go. ${weeksOut <= 1 ? 'This is going to hurt.' : 'Cut a little now so fight week is boring.'}`, w: 3 });
  else if (over <= 3 && st.fight) opts.push({ who: 'nutrition', text: `Weight's on track: ${st.walkWeight.toFixed(1)} for a ${lim} limit. Don't celebrate with a pizza.`, w: 1 });
  if (st.diet === 'junk') opts.push({ who: 'nutrition', text: 'I saw the receipts. Four gas station burritos is not "carb loading".', w: 1 });
  // manager: money and offers
  if (st.staff.manager > 0) {
    if (!st.fight && st.offers.length) opts.push({ who: 'manager', text: `${st.offers.length} offer${st.offers.length > 1 ? 's' : ''} on the table. The ${money(Math.max(...st.offers.map((o) => o.purse)))} one is the best money. Read the paperwork before you sign. Seriously.`, w: 2 });
    if (st.money < 500) opts.push({ who: 'manager', text: "You're broke. Take a fight, take a sponsor, or take a shift. Pick one by Friday.", w: 2 });
  } else if (rng.chance(0.3)) opts.push({ who: 'manager', text: "(Your mom) Are you eating? Your cousin says you're on the internet getting punched. Call me.", w: 1 });
  // cutman: the face
  if (st.body.head < 70 || st.body.jaw < 70) opts.push({ who: 'cutman', text: "Your face is still a mess. Give it a week before you spar hard again, or the first jab opens it right back up.", w: 2 });
  if (!opts.length) return null;
  const tot = opts.reduce((a, o) => a + o.w, 0);
  let r = rng.next() * tot;
  const pick = opts.find((o) => (r -= o.w) <= 0) ?? opts[0];
  return { kind: 'checkin', who: pick.who, name: pick.who === 'manager' && st.staff.manager === 0 ? 'Mom' : nm(pick.who), text: pick.text };
}

function weightOf(s: GameState): number {
  return DIVISION_LIMITS[me(s).division] ?? 155;
}

// ------------------------------------------------------------------ interviews

const PRE_Q = [
  'Your opponent says you have "no business being on this card". Response?',
  'What do you know about {opp}?',
  'How was the weight cut?',
  "Prediction for Saturday?",
  'Fans online are saying you are overrated. Thoughts?',
];
const POST_WIN_Q = ['Walk us through that finish.', 'Who do you want next?', 'You looked unstoppable tonight. Is anybody in this division on your level?', 'What does this win mean for your family?'];
const POST_LOSS_Q = ['What went wrong tonight?', 'Is this a setback or a wake-up call?', 'Do you want the rematch?'];

/** Do the reporters want you? The more famous you are, the more they ask. */
export function interviewChance(s: GameState): number {
  const f = me(s);
  const tierK = { amateur: 0, regional: 0.08, pfl: 0.2, of: 0.3 }[fm(s).tier];
  return clamp(0.06 + f.hype / 140 + tierK, 0.05, 0.95);
}

export function interviewMoment(s: GameState, rng: Rng, phase: 'pre' | 'post', won?: boolean, force = false): Extract<FMMoment, { kind: 'interview' }> | null {
  if (!force && !rng.chance(interviewChance(s))) return null;
  const st = fm(s);
  const reps = content().reporters;
  const r = reps.length ? rng.pick(reps) : { name: 'A reporter', outlet: 'Local TV' };
  const opp = st.fight ? s.fighters[st.fight.opp] : null;
  const qPool = phase === 'pre' ? PRE_Q : won ? POST_WIN_Q : POST_LOSS_Q;
  const q = rng.pick(qPool).replace('{opp}', opp?.last ?? 'him');
  const choices: MomentChoice[] = phase === 'pre'
    ? [{ id: 'humble', label: '"Respect to him. Should be a great fight."' }, { id: 'cocky', label: '"He\'s getting knocked out. Next question."' }, { id: 'unhinged', label: '"I\'ve been eating raw garlic for six weeks."' }]
    : won
      ? [{ id: 'humble', label: '"Thank God, my team, my mom."' }, { id: 'cocky', label: '"I want the champ. Tonight if possible."' }, { id: 'unhinged', label: 'Grab the mic and sing.' }]
      : [{ id: 'humble', label: '"He was better tonight. I\'ll be back."' }, { id: 'cocky', label: '"Robbery. Everybody saw it."' }, { id: 'unhinged', label: 'Walk off mid-question.' }];
  return { kind: 'interview', phase, reporter: r.name, outlet: r.outlet, q, choices };
}

/** Answer an interview. Returns what happened. */
export function answerInterview(s: GameState, m: Extract<FMMoment, { kind: 'interview' }>, choice: string, rng: Rng): string {
  const st = fm(s);
  const f = me(s);
  stats(s).interviews++;
  const opp = st.fight ? s.fighters[st.fight.opp] : null;
  if (choice === 'humble') {
    f.hype = clamp(f.hype + 1, 0, 100);
    st.morale = clamp(st.morale + 2, 0, 100);
    return 'Classy. The clip gets 400 views and one comment that says "boring". Your mom shared it twice.';
  }
  if (choice === 'cocky') {
    f.hype = clamp(f.hype + 5, 0, 100);
    if (opp) opp.hype = clamp(opp.hype + 2, 0, 100);
    return rng.chance(0.5) ? 'It goes viral. Half the internet loves you, the other half wants to watch you lose. Either way: they are watching.' : 'The clip does numbers. Your opponent reposts it with a clown emoji.';
  }
  f.hype = clamp(f.hype + (rng.chance(0.6) ? 7 : -3), 0, 100);
  st.morale = clamp(st.morale + 3, 0, 100);
  return m.phase === 'pre' ? 'Nobody knows what to do with that. It becomes a meme by dinner.' : 'Security escorts you out of frame. Bleeter declares you "the most entertaining person in the sport".';
}

// ------------------------------------------------------------------ the storyline

interface Beat {
  id: string;
  chapter: string;
  when: (s: GameState, ss: StoryState) => boolean;
  title: string;
  who: string;
  text: (s: GameState, ss: StoryState) => string;
  choices?: MomentChoice[];
  /** something that happens when the beat plays (no choice needed) */
  effect?: (s: GameState, ss: StoryState) => void;
}

const rivalName = (s: GameState, ss: StoryState) => {
  const r = ss.rival ? s.fighters[ss.rival] : null;
  return r ? `${r.first} "${r.nick}" ${r.last}` : 'Tyler Vance';
};
const rivalLast = (s: GameState, ss: StoryState) => (ss.rival ? s.fighters[ss.rival]?.last : null) ?? 'Vance';
const rivalFirst = (s: GameState, ss: StoryState) => (ss.rival ? s.fighters[ss.rival]?.first : null) ?? 'Tyler';
const hist = (s: GameState) => fm(s).history;
const wins = (s: GameState) => hist(s).filter((h) => h.result === 'W').length;
const losses = (s: GameState) => hist(s).filter((h) => h.result === 'L').length;
const tier = (s: GameState) => fm(s).tier;
/** fights since the start of this league */
const since = (s: GameState, ss: StoryState, key: string) => hist(s).slice(Number(ss.flags[key] ?? 0));
const weeksIn = (s: GameState, ss: StoryState, key: string) => s.week - Number(ss.flags[key + 'Week'] ?? 0);
const bookedVs = (s: GameState, ss: StoryState) => !!ss.rival && fm(s).fight?.opp === ss.rival;
const isChamp = (s: GameState) => Object.values(s.belts).some((b) => b.holder === fm(s).player && !b.symbolic);
const booked = (s: GameState, id: string) => fm(s).fight?.opp === id;
const flag = (ss: StoryState, k: string) => ss.flags[k] === 1;
/** still the lightweight champion as well (the superfight was won as a champ-champ) */
const champBoth = (s: GameState) => Object.values(s.belts).filter((b) => b.holder === fm(s).player && !b.symbolic).length >= 2;
const C1 = 'CHAPTER 1: SOUP';
const C2 = 'CHAPTER 2: THE REGIONALS';
const C3 = 'CHAPTER 3: THE LOUNGE';
const C4 = 'CHAPTER 4: THE BIG SHOW';
const C5 = 'CHAPTER 5: THE WHITE BEAST';
const EP = 'EPILOGUE';

const BEATS: Beat[] = [
  // ================================================================ chapter 1: soup
  {
    id: 'c1_open', chapter: C1, when: () => true, title: "RAY'S BOXING & SOUP", who: 'Uncle Ray',
    text: () => `"Welcome to the family business, kid. Half gym, half soup kitchen, all mine. For now." Uncle Ray waves at a stack of red envelopes. "The landlord wants $8,000 by the end of the year or he turns this place into a vape shop. So. Win some fights, get famous, save the soup." He hands you a mop. "And mop."`,
  },
  {
    id: 'c1_rival', chapter: C1, when: (s) => s.week >= 1, title: 'THE KID FROM ACROSS TOWN', who: 'Tyler Vance',
    text: (s, ss) => `A white sports car idles outside the gym. ${rivalName(s, ss)} leans out: seven and oh, rich parents, a nickname he gave himself, and the ${stage(s).short} belt over his shoulder. "Soup kitchen. That's adorable. See you at the top. Or, you know. Not."`,
    choices: [{ id: 'fire', label: '"Nice car. Did your dad win it for you?"' }, { id: 'ignore', label: 'Say nothing. Keep mopping.' }],
  },
  {
    id: 'c1_tv', chapter: C1, when: (s) => s.week >= 2, title: 'THE TV ABOVE THE SOUP POT', who: 'Uncle Ray',
    text: () => 'The gym TV shows a CBFC replay: a six-foot-seven welterweight called Spadam "The White Beast" Biggs folds a man in half with a knee. Twenty-four and oh. The referee, a pudgy guy with a curly mop and glasses, raises Biggs\'s hand before the other man has stopped bouncing. Ray turns it off. "That\'s not fighting. That\'s a weather event." He pauses. "And that ref is Daniel Stinkovich. I worked a smoker with him in \'04. He counted to ten in Roman numerals and lost his place."',
  },
  {
    id: 'c1_gloves', chapter: C1, when: (s) => s.week >= 3, title: "RAY'S OLD GLOVES", who: 'Uncle Ray',
    text: () => '"Here." Ray hands you a pair of gloves older than you. Cracked leather, new laces. "Golden Gloves, 1987. Lost the final to a guy called Butch with a mullet you could hide a cat in." He looks at the soup pot. "Marie started the soup, you know. My wife. Said a gym should feed people, not just hit them. She\'s been gone eleven years. I still make it her way." (Morale up.)',
    effect: (s) => { fm(s).morale = clamp(fm(s).morale + 6, 0, 100); },
  },
  {
    id: 'c1_firstwin', chapter: C1, when: (s) => wins(s) >= 1, title: 'FIRST ONE', who: 'Uncle Ray',
    text: () => '"That\'s one." Ray is pretending he isn\'t crying, which is how you know he\'s crying. He puts a hand-written sign over the heavy bag: OUR GUY WON. Your mom texts you a single word: "EAT." "Now do it about thirty more times."',
  },
  {
    id: 'c1_firstloss', chapter: C1, when: (s) => losses(s) >= 1, title: 'THE BAD NIGHT', who: 'Uncle Ray',
    text: () => '"Everybody loses. The ones that matter come back Monday." Ray hands you a bowl of soup. It is genuinely excellent soup. "Monday. Six a.m. Bring your chin, you left it in the cage."',
  },
  {
    id: 'c1_allstar', chapter: C1, when: (s) => hist(s).length >= 1, title: 'THE MAN IN THE COWBOY HAT', who: 'Xavier Cockett',
    text: () => 'After your fight, the bingo hall\'s ring announcer catches you by the exit. Cowboy hat, big beard, boots that have never seen a horse. "Xavier Cockett. They call me Allstar. Don\'t ask, it\'s a long story and most of it\'s true." He hands you a business card with a hand-drawn star on it. "One day I\'m gonna run my own league, kid. A real one. And you\'re gonna be my first signing. Remember I said that."',
  },
  {
    id: 'c1_jar', chapter: C1, when: (s) => s.week >= 4, title: 'THE SOUP JAR', who: 'Uncle Ray',
    text: () => 'Somebody stole the donation jar off the soup counter. Two hundred and eleven dollars in coins and one IOU from Mateo. The only clue: a tiny green hat, about the size of a coffee cup, left exactly where the jar was. Ray holds it up to the light. "Who in God\'s name wears a hat this small?"',
  },
  {
    id: 'c1_landlord', chapter: C1, when: (s) => s.week >= 5, title: 'THE LANDLORD', who: 'Gordon Vance',
    text: (s, ss) => `A man in a navy three-piece suit steps over the puddle and into the gym. "Gordon Vance. Vance Properties. I own this building, and the ten around it." Vance. As in ${rivalFirst(s, ss)} Vance. He looks at Ray like an old photo he wants to throw out. "Raymond and I boxed together when we were kids. Then I grew up." ${money(ss.rent)} by the end of the year. Or he knocks it down.`,
    choices: [{ id: 'promise', label: '"You\'ll get your money. Every cent."' }, { id: 'mouth', label: '"Tell your son I said hi."' }],
  },
  {
    id: 'c1_mateo', chapter: C1, when: (s) => s.week >= 7, title: 'THE KID AT THE DOOR', who: 'Mateo',
    text: () => 'A kid has been hanging around the gym door for a week. Twelve, a hoodie three sizes too big, and the stare of somebody who has already been in a few fights. He lives above the laundromat with his grandmother. "Mateo," he says. "Ray says you could teach me. Ray says you\'re not that good yet, but you\'re cheap."',
    choices: [{ id: 'train', label: 'Teach him to hold his hands up' }, { id: 'homework', label: '"Do your homework first. Then we\'ll talk."' }],
  },
  {
    id: 'c1_vance_booked', chapter: C1, when: (s, ss) => tier(s) === 'amateur' && bookedVs(s, ss), title: 'FACE TO FACE', who: 'Tyler Vance',
    text: (s, ss) => `The weigh-in is in the back of a bingo hall. ${rivalLast(s, ss)} steps on the scale in designer underwear and turns to you. "My dad owns the building you train in. After Saturday, I'll own you too."`,
    choices: [{ id: 'stare', label: 'Stare him down' }, { id: 'laugh', label: 'Laugh in his face' }, { id: 'shove', label: 'Shove him' }],
  },
  {
    id: 'c1_beatvance', chapter: C1, when: (s, ss) => flag(ss, 'amWon'), title: 'THE SPORTS CAR LEAVES EARLY', who: 'Uncle Ray',
    text: (s, ss) => `${rivalLast(s, ss)}'s seven-and-oh is seven-and-one. His dad's car is gone before the decision is read. Ray is standing on a folding chair, screaming, holding a ladle like a sword. "THE SOUP! THE SOUP IS UNDEFEATED!"`,
    effect: (s, ss) => { ss.flags.ch1 = 1; },
  },
  {
    id: 'c1_lostvance', chapter: C1, when: (s, ss) => flag(ss, 'amLost'), title: 'TRUST FUND', who: 'Tyler Vance',
    text: (s, ss) => `${rivalName(s, ss)} on Bleeter, from the back seat of the car: "told u. soup is for sick people." Ray turns the phone face down. "He's right about one thing. Soup is for sick people. And you're sick of losing to him. So eat."`,
  },
  // ================================================================ chapter 2: the regionals
  {
    id: 'c2_signed', chapter: C2, when: (s) => tier(s) === 'regional', title: 'THREE MONTHS LATER', who: 'Uncle Ray',
    text: (s, ss) => `You're regional now. Ray tapes the newspaper clipping to the soup pot. "Landlord came by again. I told him my fighter's going pro. He asked what that means for the rent. I said 'eventually'." Back rent: ${money(ss.rent)}.`,
    choices: [{ id: 'pay', label: 'Pay $1,500 toward the rent' }, { id: 'later', label: '"I\'ll handle it after the next fight"' }],
    effect: (s, ss) => { ss.flags.ch1 = 1; },
  },
  {
    id: 'c2_wyatt', chapter: C2, when: (s, ss) => tier(s) === 'regional' && weeksIn(s, ss, 'reg') >= 1, title: 'THE CHAMPION IS FOUR FOOT EIGHT', who: 'Wyatt Smitt',
    text: (s) => `The ${stage(s).short} champion is Wyatt "LeproClepto" Smitt: four foot eight, a ginger beard down to his belt, and a green top hat he refuses to take off for weigh-ins. Twelve and oh. Never been finished. Never been searched at the door, either. At the open workout he steals your granola bar, eats it in front of you, and winks. On his head: a green hat. A full-size one. You think about the soup jar.`,
  },
  {
    id: 'c2_bradie', chapter: C2, when: (s, ss) => tier(s) === 'regional' && weeksIn(s, ss, 'reg') >= 2 && !ss.gymSaved, title: 'A MAN WITH AN AFRO AND AN OFFER', who: 'Bradie',
    text: (s, ss) => `Bradie slides into your DMs: "yo. heard about the soup gym. tragic. i could pay off the whole ${money(ss.rent)} tomorrow. all u gotta do is sign one (1) normal contract with only fighters. its basically normal. theres one clause. its fine."`,
    choices: [{ id: 'take', label: 'Take the money (the gym is saved... with a clause)' }, { id: 'no', label: '"I\'ll earn it."' }],
  },
  {
    id: 'c2_jimmy', chapter: C2, when: (s, ss) => tier(s) === 'regional' && weeksIn(s, ss, 'reg') >= 3, title: 'THE PARKING LOT', who: 'Jimmy Quavo',
    text: (s, ss) => `Leaving the arena late, you see ${rivalLast(s, ss)} in the parking lot, handing an envelope to a man in a black tracksuit and a beanie. Jimmy Quavo. Everybody knows what Jimmy sells. ${rivalFirst(s, ss)} sees you seeing him.`,
    choices: [{ id: 'report', label: 'Report it to the Commission' }, { id: 'keep', label: 'Keep it in your pocket for later' }, { id: 'confront', label: 'Walk over and say something' }],
  },
  {
    id: 'c2_zac_tv', chapter: C2, when: (s, ss) => tier(s) === 'regional' && weeksIn(s, ss, 'reg') >= 4, title: 'THE GUY ON THE LOUNGE', who: 'Uncle Ray',
    text: () => 'On the gym TV: the Professional Fighters\' Lounge. A ginger kid called Zac "The Attacker" Buna chokes a man unconscious in forty seconds, then helps him up and checks he\'s okay. In the interview, his manager, a man in a mustard suit, grabs the mic: "Next season Zac\'s a STRIKER. Stand-up only. Kickboxing showcase. Big money." Zac nods like he\'s hearing it for the first time. Ray squints. "Why would you take the best jiu-jitsu kid in the country and make him kickbox?"',
  },
  {
    id: 'c2_mateo', chapter: C2, when: (s, ss) => tier(s) === 'regional' && flag(ss, 'mateo') && weeksIn(s, ss, 'reg') >= 5, title: "MATEO'S FIRST FIGHT", who: 'Mateo',
    text: () => 'Mateo has his first kids\' tournament in a school gym. Ray says you should corner him. "I\'m not nervous," Mateo says, shaking so hard his headgear rattles.',
    choices: [{ id: 'corner', label: 'Corner him yourself' }, { id: 'crowd', label: 'Cheer from the bleachers, let Ray corner' }],
  },
  {
    id: 'c2_rent', chapter: C2, when: (s, ss) => tier(s) === 'regional' && !ss.gymSaved && weeksIn(s, ss, 'reg') >= 7, title: 'FINAL NOTICE', who: 'Gordon Vance',
    text: (s, ss) => `A red envelope, hand-delivered by a man who looks embarrassed to be delivering it. FINAL NOTICE. ${money(ss.rent)} outstanding. "Payment plans are for people with plans." - G. Vance.`,
    choices: [{ id: 'pay', label: 'Pay $2,000 now' }, { id: 'later', label: 'Put it on the fridge with the others' }],
  },
  {
    id: 'c2_vance_booked', chapter: C2, when: (s, ss) => tier(s) === 'regional' && bookedVs(s, ss), title: 'ROUND TWO', who: 'Tyler Vance',
    text: (s, ss) => `${rivalLast(s, ss)} at the press conference, in sunglasses, indoors: "Last time was a fluke. This time there's a TV camera, so my dad's actually watching."`,
    choices: [{ id: 'stare', label: '"Tell him to bring popcorn."' }, { id: 'laugh', label: 'Ask if his dad bought the TV station too' }],
  },
  {
    id: 'c2_wyatt_booked', chapter: C2, when: (s) => tier(s) === 'regional' && booked(s, 'wyatt'), title: 'THE LEPRECHAUN', who: 'Wyatt Smitt',
    text: (s) => `The ${stage(s).short} title fight. At the face-off Wyatt has to stand on a milk crate to look you in the chin. He pats your chest, smiles, and walks off. Your gold chain is gone. Nobody saw it happen. "Lookin' for something, lad?" he calls back, in an accent from a country he has never been to. "Three rounds. Nobody finishes Wyatt Smitt. Nobody."`,
    choices: [{ id: 'chain', label: '"Give me my chain back."' }, { id: 'laugh', label: 'Laugh. Check your pockets. Laugh less.' }],
  },
  {
    id: 'c2_wyatt_done', chapter: C2, when: (s, ss) => flag(ss, 'wyattDone'), title: 'THE POT OF GOLD', who: 'Wyatt Smitt',
    text: () => 'Disqualified. In round three Wyatt dropped into the splits and punched you square in the groin, at eye level, like a man who had been planning it for weeks (he had). The next morning there\'s a package at the gym: your chain, the soup jar (all $211, plus $40 "interest"), and Mateo\'s IOU, paid off. A note in green crayon: "sorry lad. it\'s a condition. great fight. - W." Ray reads it twice. "I kind of like him."',
    effect: (s, ss) => { ss.flags.ch2 = 1; },
  },
  // ================================================================ chapter 3: the lounge
  {
    id: 'c3_lounge', chapter: C3, when: (s) => tier(s) === 'pfl', title: 'THE CAMERAS NEVER STOP', who: 'Lounge producer',
    text: (s, ss) => `A producer in a headset greets you at the Lounge: "Love the soup gym angle. LOVE it. We need you and ${rivalLast(s, ss)} to hate each other on camera. He's already here, he's already ranked, and he already called you 'the help'. Are you going to give us a moment at the press conference?"`,
    choices: [{ id: 'moment', label: 'Give them a moment (shove him)' }, { id: 'pro', label: 'Stay professional' }],
    effect: (s, ss) => { ss.flags.ch2 = 1; },
  },
  {
    id: 'c3_zac', chapter: C3, when: (s, ss) => tier(s) === 'pfl' && weeksIn(s, ss, 'pfl') >= 1, title: 'THE MENU', who: 'Zac Buna',
    text: () => 'In the fighters\' hotel, Zac "The Attacker" Buna sits down next to you and slides the room-service menu across. "Can you read me what the pasta is? I left my glasses at home." He isn\'t wearing glasses. He has never worn glasses. You read him the menu. He orders the chicken. Then his manager, Lenny Pratt (mustard suit, no glasses either), sweeps in, signs the bill in Zac\'s name and pockets the receipt. "Zac doesn\'t talk to other fighters. Bad for the brand."',
    choices: [{ id: 'kind', label: 'Tell Zac he can ask you anytime' }, { id: 'lenny', label: 'Ask Lenny what\'s in Zac\'s contract' }],
  },
  {
    id: 'c3_ray', chapter: C3, when: (s, ss) => tier(s) === 'pfl' && weeksIn(s, ss, 'pfl') >= 2, title: 'RAY CALLS', who: 'Uncle Ray',
    text: (s, ss) => ss.gymSaved ? '"The gym\'s full, kid. Twelve new kids signed up because of you. They all want to be you. God help them. The soup\'s still free."' : `"Landlord gave us one more season. ${money(ss.rent)} to go. The kids did a car wash. They washed the landlord's car. He tipped. It was a weird day."`,
  },
  {
    id: 'c3_confessional', chapter: C3, when: (s, ss) => tier(s) === 'pfl' && weeksIn(s, ss, 'pfl') >= 3, title: 'THE CONFESSIONAL', who: 'Lounge producer',
    text: (s, ss) => `The Lounge films "confessionals": you, a velvet couch, a red light. "Tell the camera how you feel about ${rivalLast(s, ss)}," the producer says. "Really feel. We need tears or threats. Ideally both."`,
    choices: [{ id: 'honest', label: '"I don\'t hate him. I just need his belt."' }, { id: 'villain', label: 'Go full villain for the cameras' }],
  },
  {
    id: 'c3_spadam', chapter: C3, when: (s, ss) => tier(s) === 'pfl' && weeksIn(s, ss, 'pfl') >= 4, title: 'THE WHITE BEAST', who: 'Spadam Biggs',
    text: () => 'The Lounge books a celebrity guest commentator: Spadam "The White Beast" Biggs, undefeated CBFC welterweight champion. He has to duck to get through the door. Somebody says your name; he looks down at you for a long, polite moment. "Nice little run, kid. Genuinely. Call me when you\'re somebody." He signs your gloves without being asked. Behind him a pudgy man with a curly mop and glasses carries his bag: Daniel Stinkovich. The referee. Carrying his bag.',
  },
  {
    id: 'c3_suspended', chapter: C3, when: (s, ss) => tier(s) === 'pfl' && flag(ss, 'reported') && weeksIn(s, ss, 'pfl') >= 5, title: 'FLAGGED', who: 'Bleeter',
    text: (s, ss) => `BREAKING: ${rivalName(s, ss)} has been flagged for a banned substance and suspended for three months. He posts a single blurry photo of a parking lot and the caption "snitches." Everybody knows who he means.`,
    effect: (s, ss) => {
      const r = ss.rival ? s.fighters[ss.rival] : null;
      if (r) r.injuries = [...r.injuries, { name: 'suspension', until: s.week + 12 }];
      me(s).hype = clamp(me(s).hype + 3, 0, 100);
    },
  },
  {
    id: 'c3_landlord', chapter: C3, when: (s, ss) => tier(s) === 'pfl' && !ss.gymSaved && weeksIn(s, ss, 'pfl') >= 5, title: 'THE ULTIMATUM', who: 'Gordon Vance',
    text: (s, ss) => `Gordon Vance's office has photos of every building he owns, and one of a building he knocked down, framed like a trophy. "You've made my son look ordinary. I don't forgive that. ${money(ss.rent)}, before your first CBFC fight, or the bulldozer comes on fight night."`,
    choices: [{ id: 'payall', label: 'Pay it all, right now' }, { id: 'bradie', label: 'Call Bradie' }, { id: 'win', label: '"I\'ll pay you out of my purses."' }],
  },
  {
    id: 'c3_zac_booked', chapter: C3, when: (s) => tier(s) === 'pfl' && booked(s, 'zac'), title: 'STAND-UP ONLY', who: 'Lenny Pratt',
    text: () => 'The Lounge season final: you against Zac Buna, Lounge champion. At the press conference Lenny Pratt reads out a clause in the bout agreement: "STAND-UP ONLY. No takedowns, no grappling. Zac signed it." Zac looks at the paper like it\'s in another language. To him, it is. "I\'m a striker now," he says quietly. He doesn\'t sound sure. Rules are rules: no grappling in this fight. For either of you.',
    choices: [{ id: 'read', label: 'After the presser, read the clause to Zac' }, { id: 'focus', label: 'Stay out of it. Focus on the fight.' }],
  },
  {
    id: 'c3_zac_done', chapter: C3, when: (s, ss) => flag(ss, 'zacDone'), title: 'THE CONTRACT', who: 'Zac Buna',
    text: (s, ss) => `${ss.flags.zacWon === 1 ? 'You won the Lounge final standing up.' : 'Zac took the Lounge final standing up.'} Afterwards, in the locker room, you sit down with Zac and read him his contract. All of it. Lenny takes 60% of his purses. Lenny owns his likeness. Lenny "may assign fighting style at his discretion". Zac is quiet for a long time. Then he walks into the hallway and fires Lenny Pratt so loudly the cameras come running. The next Monday he turns up at Ray's with a gi. "I've got nowhere to train. And you don't know any jiu-jitsu." He's right. (Zac Buna is now your sparring partner: SPAR with him for grappling.)`,
    effect: (s, ss) => {
      ss.flags.ch3 = 1;
      ss.flags.zacPartner = 1;
    },
  },
  // ================================================================ chapter 4: the big show
  {
    id: 'c4_cbfc', chapter: C4, when: (s) => tier(s) === 'of', title: 'THE BIG SHOW', who: 'Dane Whyte',
    text: (s, ss) => `"Look, I'm gonna be honest with you." Dane Whyte is never honest with anyone. "I don't know who you are. But ${rivalLast(s, ss)} keeps talking about you, and the fans keep asking about the soup guy. So here's the deal: win a couple, you get him. Beat him, I'll think about a title shot. Lose, you go back to the soup."`,
    effect: (s, ss) => {
      ss.flags.ch2 = 1;
      ss.flags.ch3 = 1;
    },
  },
  {
    id: 'c4_ranked', chapter: C4, when: (s, ss) => tier(s) === 'of' && since(s, ss, 'of').filter((h) => h.result === 'W').length >= 1, title: 'THE KIDS ARE WATCHING', who: 'Uncle Ray',
    text: (s, ss) => `"There are forty kids in my gym right now, watching you on the TV I bought with your rent money. Don't tell the landlord." ${flag(ss, 'mateo') ? 'Mateo is wearing a homemade shirt with your face on it. The face is wrong, but the love is right.' : ''} ${flag(ss, 'zacPartner') ? 'Zac is teaching them all to triangle choke each other. Ray has put up a sign: NO CHOKING DURING SOUP.' : ''}`,
  },
  {
    id: 'c4_grudge_booked', chapter: C4, when: (s, ss) => tier(s) === 'of' && bookedVs(s, ss) && !isChamp(s), title: 'THE GRUDGE MATCH', who: 'Dane Whyte',
    text: (s, ss) => `The press conference has more cameras than seats. Dane Whyte at the podium: "Soup Kitchen versus Trust Fund. I couldn't make this up if I tried." ${rivalLast(s, ss)} leans into his mic: "${flag(ss, 'reported') ? 'You took three months from me. I\'m taking the rest of your career.' : 'My dad is going to knock down your gym the night I knock you out. Poetry.'}"`,
    choices: [{ id: 'calm', label: '"See you Saturday."' }, { id: 'table', label: 'Flip the table' }],
  },
  {
    id: 'c4_grudge_won', chapter: C4, when: (s, ss) => flag(ss, 'grudgeWon'), title: 'TRUST FUND, OVERDRAWN', who: 'Tyler Vance',
    text: (s, ss) => `After the fight, ${rivalFirst(s, ss)} finds you in the tunnel. The sunglasses are gone. "My dad bet the building on me. Like, actually. He told everyone at the club. He's never watched one of my fights to the end." Then he walks away. Dane Whyte, from behind you: "Title shot. Don't make me regret it."`,
  },
  {
    id: 'c4_grudge_lost', chapter: C4, when: (s, ss) => flag(ss, 'grudgeLost'), title: 'BACK TO THE SOUP', who: 'Uncle Ray',
    text: (s, ss) => `${rivalLast(s, ss)} gets the title shot. You get a bag of ice. Ray drives you home in the van with no heat. "You know what the difference between you and him is? When he loses, his dad buys him a new car. When you lose, you come back Monday." (Climb the rankings and the belt still comes to you.)`,
  },
  {
    id: 'c4_titleshot', chapter: C4, when: (s) => tier(s) === 'of' && !!fm(s).fight?.title && !isChamp(s), title: 'THE NIGHT BEFORE', who: 'Uncle Ray',
    text: () => 'The night before the title fight, the gym is closed but the lights are on. Ray is sitting on the ring apron, eating soup out of the pot with a ladle. "When I lost to Butch in \'87, I thought that was it. My one shot. Then Marie and I opened this place, and every kid who walked in got a shot." He hands you the ladle. "This is yours. Eat something. Then go get it."',
  },
  {
    id: 'c4_champ', chapter: C4, when: (s) => tier(s) === 'of' && isChamp(s), title: 'CHAMPION', who: 'Uncle Ray',
    text: (s, ss) => `The belt is heavier than you thought. Ray is in the cage, crying openly now, holding a thermos. ${ss.gymSaved ? 'The gym is saved. There is going to be a plaque.' : 'Tomorrow you walk into the landlord\'s office and pay the rent in cash. All of it. Then you buy the building.'} ${rivalLast(s, ss)} posts one word on Bleeter: "rematch". And somewhere in Halifax, a six-foot-seven man watches the replay, twice.`,
    effect: (s, ss) => {
      if (!ss.gymSaved) {
        fm(s).money -= Math.min(ss.rent, Math.max(0, fm(s).money));
        ss.rent = 0;
        ss.gymSaved = true;
      }
      ss.flags.champWeek = s.week;
      ss.flags.ch4 = 1;
    },
  },
  // ================================================================ chapter 5: the white beast
  {
    id: 'e_plaque', chapter: C5, when: (s, ss) => ss.seen.includes('c4_champ') && s.week - Number(ss.flags.champWeek ?? s.week) >= 1, title: 'SIX MONTHS LATER', who: 'Uncle Ray',
    text: (s, ss) => `Ray unveils a brass plaque by the soup pot: "${me(s).first.toUpperCase()} ${me(s).last.toUpperCase()}. CBFC CHAMPION. MOPPED HERE." ${flag(ss, 'mateo') ? 'Mateo, thirteen now and two inches taller, reads it out loud twice, then asks if he can have a plaque. Ray says he can have a mop.' : 'The kids clap. Somebody spills the soup. Nobody minds.'}`,
  },
  {
    id: 'e_rematch_booked', chapter: C5, when: (s, ss) => isChamp(s) && bookedVs(s, ss), title: 'THE REMATCH', who: 'Tyler Vance',
    text: (s, ss) => `${rivalLast(s, ss)} at the weigh-in looks different. No sunglasses. No designer underwear. Just a guy who's been training. "My dad sold your building," he says quietly. "To me. I'm not knocking it down. I just wanted you to know before I take that belt."`,
    choices: [{ id: 'respect', label: 'Shake his hand' }, { id: 'stare', label: 'Stare him down anyway' }],
  },
  {
    id: 'e_rematch_done', chapter: C5, when: (s, ss) => flag(ss, 'rematchDone'), title: 'MONDAY, SIX A.M.', who: 'Uncle Ray',
    text: (s, ss) => ss.flags.rematchWon === 1
      ? `${rivalFirst(s, ss)} Vance joins Ray's gym the next Monday. Six a.m. He brings his own mop. Gordon doesn't come to see him off. Ray makes ${rivalFirst(s, ss)} a bowl of soup and doesn't say anything about it, which is the nicest thing Ray has ever not said.`
      : `${rivalFirst(s, ss)} takes the belt. The next Monday he turns up at Ray's anyway. "I don't want to train at my dad's gym anymore," he says. "Can I mop?" Ray hands him the mop. You'll get the belt back. You both know it.`,
  },
  {
    id: 'c5_callout', chapter: C5, effect: (s, ss) => { ss.flags.calloutWeek = s.week; }, when: (s, ss) => flag(ss, 'rematchDone') && s.week - Number(ss.flags.rematchWeek ?? s.week) >= 1, title: 'CALLING OUT THE BEAST', who: 'Spadam Biggs',
    text: (s) => `You call out Spadam "The White Beast" Biggs on Bleeter. Twenty-four and oh. Six foot seven. Welterweight champion. He replies in four minutes: "Love the energy, little guy. Genuinely. I'm a welterweight. You're a snack. Eat some soup and get back to me." Then he likes your post, which is somehow worse. ${me(s).first}'s phone does not stop buzzing for three days.`,
  },
  {
    id: 'c5_tape', chapter: C5, effect: (s, ss) => { ss.flags.tapeWeek = s.week; }, when: (s, ss) => ss.seen.includes('c5_callout') && s.week - Number(ss.flags.calloutWeek ?? s.week) >= 2, title: 'THE TAPE', who: 'Tyler Vance',
    text: (s, ss) => `${rivalFirst(s, ss)} brings a USB stick to the gym. "Kickboxing, five years ago. I was nineteen. Spadam broke my orbital in the first round." He plays it. In the corner of the screen: a pudgy referee with a curly mop. Spadam hits him after the bell. Daniel Stinkovich doesn't call it. "Every one of his fights," ${rivalFirst(s, ss)} says. "Daniel. Every one. And watch this: has anybody ever taken him down?" Nobody ever has. Zac, from the mats, not looking up: "Then we take him down."`,
  },
  {
    id: 'c5_superfight', chapter: C5, when: (s, ss) => ss.seen.includes('c5_tape') && s.week - Number(ss.flags.tapeWeek ?? s.week) >= 2, title: 'ONE YEAR LATER', who: 'Dane Whyte',
    text: (s) => `A year of defending the belt. A year of Spadam saying no. Then Dane Whyte calls at 2 a.m. "Biggs ran out of welterweights. The fans want you. He wants money. So: a SUPERFIGHT. You move up to welterweight, his belt, five rounds. One condition from his side: the referee. Daniel Stinkovich. The Commission says he's 'very experienced'." ${me(s).first} looks at Ray. Ray looks at the ceiling. "Take it," says Ray. "Make him earn it."`,
  },
  {
    id: 'c5_presser', chapter: C5, when: (s) => booked(s, 'spadam'), title: 'THE SUPERFIGHT', who: 'Spadam Biggs',
    text: () => 'The biggest press conference in CBFC history. Spadam has to sit on two chairs. "I want to thank the little guy for moving up. Brave. Very brave. I\'ll be gentle." Daniel Stinkovich is at the end of the table in a referee shirt, for some reason, giving Spadam a thumbs up. A reporter asks if it\'s a conflict of interest. Daniel says "no" and puts his glasses on, like that settles it.',
    choices: [{ id: 'respect', label: '"I respect you. I\'m still taking it."' }, { id: 'daniel', label: 'Ask Daniel how much Spadam pays him' }, { id: 'stare', label: 'Say nothing. Stare at Spadam until he looks away.' }],
  },
  {
    id: 'c5_night', chapter: C5, when: (s) => booked(s, 'spadam') && fm(s).fight!.week - s.week <= 1, title: 'THE NIGHT BEFORE THE WHITE BEAST', who: 'Uncle Ray',
    text: (s, ss) => `The whole gym is there, after hours. Ray with the soup. ${flag(ss, 'mateo') ? 'Mateo, fourteen now, taping your hands like Ray taught him. ' : ''}${flag(ss, 'zacPartner') ? 'Zac, drilling single legs on a heavy bag. ' : ''}${rivalFirst(s, ss)} Vance, quietly mopping. Ray says the same thing he said before your first amateur fight: "Hands up. Chin down. Eat something." Then, after a while: "Marie would have liked you. She'd have hated the fighting. But she'd have liked you."`,
  },
  {
    id: 'c5_won', chapter: C5, when: (s, ss) => flag(ss, 'spadamWon'), title: 'THE WHITE BEAST FALLS', who: 'Uncle Ray',
    text: (s) => `Twenty-four and oh is twenty-four and one. Daniel Stinkovich, out of habit, grabs Spadam\'s wrist and starts to raise it before the announcer finishes reading your name. The arena boos him out of the cage. Spadam sits on the canvas for a long time. Then he gets up, finds you, and lifts your hand himself. "Pride of the Maritimes," he says. "Fair enough." ${champBoth(s) ? 'Two belts. Two divisions.' : 'The welterweight championship of the world.'} Ray\'s Boxing & Soup.`,
    effect: (s, ss) => {
      ss.flags.ch5 = 1;
    },
  },
  {
    id: 'c5_lost', chapter: C5, when: (s, ss) => flag(ss, 'spadamLost'), title: 'NOT YET', who: 'Uncle Ray',
    text: () => 'Daniel Stinkovich raises Spadam\'s hand with both of his. Ray drives you home in the van with no heat. Halfway there he says: "Monday. Six a.m." Spadam\'s team calls a week later. He wants the rematch. He says it was "closer than he likes". He has never said that about anybody.',
  },
  {
    id: 'e_end', chapter: EP, when: (s, ss) => ss.seen.includes('c5_won'), title: 'THE ROAD GOES ON', who: 'Uncle Ray',
    text: (s, ss) => `Monday. Six a.m. ${flag(ss, 'mateo') ? 'Mateo has his first amateur fight next month. ' : ''}${flag(ss, 'zacPartner') ? 'Zac runs the Tuesday jiu-jitsu class. ' : ''}${rivalFirst(s, ss)} mops. Somebody in a cowboy hat called; he says he's starting a league. Ray makes the soup Marie's way. The road doesn't end. It just gets more people on it. (The story is over. Your career isn't.)`,
  },
];

/** Start the storyline (new Road To Champion career): Ray, the rent, and the rival. */
export function startStory(s: GameState, rng: Rng): void {
  const st = fmx(s);
  if (st.legacy || st.story) return;
  st.story = { seen: [], rival: null, rent: 8000, gymSaved: false, flags: {} };
  const f = me(s);
  const r = makeRival(s, rng, f);
  st.story.rival = r.id;
  // he's the local champion: the first belt you go for is his
  if (st.ladder.length) st.ladder[0] = r.id;
  else st.ladder.push(r.id);
  // the story's road: one regional promotion (Wyatt's), the Lounge (Zac's), the CBFC (Spadam's)
  const regs = st.circuit.filter((x) => x.tier === 'regional');
  if (regs.length > 1) st.circuit = st.circuit.filter((x) => x.tier !== 'regional' || x === regs[0]);
  // the White Beast is already the CBFC welterweight champion: undefeated, untouchable
  const sp = makeBoss(s, 'spadam', 'us');
  const ww = Object.values(s.belts).find((b) => b.division === 'welter' && !b.interim && !b.symbolic);
  if (ww) ww.holder = sp.id;
}

function makeRival(s: GameState, rng: Rng, f: Fighter): Fighter {
  const r = generateFighter(rng, content().names, { division: f.division, gender: f.gender, tier: 'prospect', culture: 'us_urban', id: 'rival' });
  r.first = f.gender === 'W' ? 'Madison' : 'Tyler';
  r.last = 'Vance';
  r.nick = 'Trust Fund';
  r.age = 24;
  const top = overall(f.skills) + 8;
  const sh = top - overall(r.skills);
  for (const k of Object.keys(r.skills) as (keyof Fighter['skills'])[]) r.skills[k] = clamp(Math.round(r.skills[k] + sh), 20, 95);
  r.record = { w: 7, l: 0, d: 0, nc: 0 };
  r.promotion = stage(s).promo;
  r.status = 'active';
  r.contract = null;
  r.hype = 30;
  r.traits = ['Trash Talker', 'Showman'];
  r.potential = 90;
  r.careerLog = ['Rich parents, a cold plunge, and a nickname he gave himself.'];
  s.fighters[r.id] = r;
  return r;
}

/** Move up a league: the rival goes up too (he's always a step ahead). */
export function storyPromote(s: GameState): void {
  const st = fmx(s);
  const ss = st.story;
  if (!ss) return;
  // when each league started (fights and weeks), for the beats that need "a while in"
  const key = st.tier === 'regional' ? 'reg' : st.tier;
  ss.flags[key] = st.history.length;
  ss.flags[key + 'Week'] = s.week;
  if (!ss.rival) return;
  const r = s.fighters[ss.rival];
  if (!r) return;
  const sg = stage(s);
  r.status = 'active';
  if (sg.tier === 'of') {
    r.promotion = 'us';
    for (const k of Object.keys(r.skills) as (keyof Fighter['skills'])[]) r.skills[k] = clamp(r.skills[k] + 6, 20, 95);
    return;
  }
  // the boss of each league holds its belt
  if (sg.tier === 'regional' || sg.tier === 'pfl') {
    const boss = makeBoss(s, sg.tier === 'regional' ? 'wyatt' : 'zac', sg.promo);
    boss.promotion = sg.promo;
    boss.status = 'active';
    st.ladder = [boss.id, ...st.ladder.filter((x) => x !== boss.id)];
  }
  r.promotion = sg.promo;
  for (const k of Object.keys(r.skills) as (keyof Fighter['skills'])[]) r.skills[k] = clamp(r.skills[k] + 5, 20, 95);
  // he got here first: near the top of the ladder (never above the boss)
  if (!st.ladder.includes(r.id)) {
    const me0 = st.ladder.indexOf(st.player);
    // the Lounge keeps its real-life order: he slots in just above you; elsewhere he's the #1 contender
    if (sg.tier === 'pfl' || st.ladder.length < 3 || st.ladder[1] === st.player) st.ladder.splice(Math.max(1, me0), 0, r.id);
    else st.ladder.splice(1, 0, r.id);
  }
}

/** Queue any story beats whose time has come (one per week, so they breathe). */
export function storyWeek(s: GameState): void {
  const st = fmx(s);
  const ss = st.story;
  if (!ss || st.legacy) return;
  for (const b of BEATS) {
    if (ss.seen.includes(b.id) || !b.when(s, ss)) continue;
    ss.seen.push(b.id);
    b.effect?.(s, ss);
    pushMoment(s, { kind: 'story', id: b.id, chapter: b.chapter, title: b.title, text: b.text(s, ss), who: b.who, choices: b.choices });
    chapterDone(s, ss);
    if (b.id === 'c5_won') pushMoment(s, { kind: 'credits' });
    return;
  }
  chapterDone(s, ss);
}

/** The boss of each chapter (unlocked in Quick Fight when the chapter is done). */
export const CHAPTERS: { n: number; title: string; boss: string; bossName: string }[] = [
  { n: 1, title: 'SOUP', boss: 'rival', bossName: 'Tyler "Trust Fund" Vance' },
  { n: 2, title: 'THE REGIONALS', boss: 'wyatt', bossName: 'Wyatt "LeproClepto" Smitt' },
  { n: 3, title: 'THE LOUNGE', boss: 'zac', bossName: 'Zac "The Attacker" Buna' },
  { n: 4, title: 'THE BIG SHOW', boss: 'han', bossName: 'Han "The Pride Of The Maritimes" Tibular' },
  { n: 5, title: 'THE WHITE BEAST', boss: 'spadam', bossName: 'Spadam "The White Beast" Biggs' },
];

/** A chapter just finished: the congratulations screen (and its Quick Fight unlock). */
function chapterDone(s: GameState, ss: StoryState): void {
  for (const c of CHAPTERS) {
    if (ss.flags['ch' + c.n] !== 1 || ss.flags['chShown' + c.n] === 1) continue;
    ss.flags['chShown' + c.n] = 1;
    pushMoment(s, { kind: 'chapter', n: c.n, title: c.title, boss: c.boss, bossName: c.bossName });
  }
}

/** A choice in a story beat. */
export function answerStory(s: GameState, beat: string, choice: string): string {
  const st = fmx(s);
  const ss = st.story;
  const f = me(s);
  if (!ss) return '';
  switch (`${beat}:${choice}`) {
    case 'c1_rival:fire':
      f.hype = clamp(f.hype + 4, 0, 100);
      return 'You post a photo of the soup with the caption "made by champions". It does better than his entire account.';
    case 'c1_rival:ignore':
      st.morale = clamp(st.morale + 4, 0, 100);
      return 'Ray nods. "Good. Talk is for people with podcasts."';
    case 'c2_signed:pay': {
      const amt = Math.min(1500, Math.max(0, st.money));
      st.money -= amt;
      ss.rent = Math.max(0, ss.rent - amt);
      if (ss.rent === 0) ss.gymSaved = true;
      st.morale = clamp(st.morale + 6, 0, 100);
      return amt ? `You hand Ray ${money(amt)}. He tries to give it back three times. Rent left: ${money(ss.rent)}.` : "You don't have it. Ray says it's fine. It isn't, but it's fine.";
    }
    case 'c2_signed:later':
      return 'Ray says "sure". He says it the way people say "sure" when they mean "I knew you would say that".';
    case 'c2_bradie:take':
      ss.rent = 0;
      ss.gymSaved = true;
      st.ofa.joined = true;
      st.clauses.push('of_likeness');
      st.morale = clamp(st.morale + 5, 0, 100);
      return 'The rent is paid. The gym is saved. Somewhere in the contract, Bradie now owns your face "for promotional purposes". Ray does not ask. You do not tell.';
    case 'c2_bradie:no':
      f.hype = clamp(f.hype + 2, 0, 100);
      return 'Bradie: "respect. offer stands forever. like a tattoo." You can hear the gym\'s boiler groan from here.';
    case 'c3_lounge:moment':
      f.hype = clamp(f.hype + 8, 0, 100);
      return `You shove ${rivalLast(s, ss)} at the presser. The producers get their clip. The Commission gets a letter. Hype through the roof.`;
    case 'c3_lounge:pro':
      st.morale = clamp(st.morale + 3, 0, 100);
      return 'You shake his hand. He pulls it away and fixes his hair. The internet loves you for it.';
    case 'c1_landlord:promise':
      st.morale = clamp(st.morale + 4, 0, 100);
      return 'Gordon Vance smiles like a man who has heard that before, from better people. He leaves a business card on the soup pot. Ray uses it to scrape the pot.';
    case 'c1_landlord:mouth':
      f.hype = clamp(f.hype + 3, 0, 100);
      ss.rent += 500;
      return `"Late fee," he says, writing on his clipboard. "For the attitude." Rent is now ${money(ss.rent)}. Ray says it was worth it. Ray is not good with money.`;
    case 'c1_mateo:train':
      ss.flags.mateo = 1;
      st.morale = clamp(st.morale + 5, 0, 100);
      return 'You show Mateo how to keep his hands up. He drops them immediately. You show him again. By the end of the night he only drops them sometimes. Ray watches from the soup pot, very quiet.';
    case 'c1_mateo:homework':
      ss.flags.mateo = 1;
      return 'Mateo rolls his eyes so hard he almost falls over, then does his homework at the soup table. It\'s fractions. You help. You are worse at fractions than at fighting. He comes back the next day.';
    case 'c1_vance_booked:stare':
    case 'c2_vance_booked:stare':
    case 'e_rematch_booked:stare':
      st.morale = clamp(st.morale + 3, 0, 100);
      return 'You don\'t blink. He does. Everybody sees it.';
    case 'c1_vance_booked:laugh':
    case 'c2_vance_booked:laugh':
      f.hype = clamp(f.hype + 4, 0, 100);
      return 'The room laughs with you. His face goes the colour of a bad steak.';
    case 'c1_vance_booked:shove':
      f.hype = clamp(f.hype + 6, 0, 100);
      st.money -= 200;
      return 'Security pulls you apart. The local commission fines you $200 and the video gets 40,000 views, which in this town is everybody twice.';
    case 'c2_jimmy:report':
      ss.flags.reported = 1;
      st.morale = clamp(st.morale + 3, 0, 100);
      return 'You call the Commission\'s tip line. A tired woman takes it down. "We\'ll look into it." You have no idea if they will.';
    case 'c2_jimmy:keep':
      ss.flags.leverage = 1;
      return 'You say nothing. You remember everything. That\'s a kind of currency too.';
    case 'c2_jimmy:confront':
      f.hype = clamp(f.hype + 3, 0, 100);
      ss.flags.confronted = 1;
      return `You walk over. Jimmy leaves at a speed that suggests practice. ${rivalLast(s, ss)} looks at you for a long time. "It's B12," he says. Nobody has ever said "it's B12" about anything that was B12.`;
    case 'c2_mateo:corner':
      ss.flags.mateoCornered = 1;
      st.morale = clamp(st.morale + 8, 0, 100);
      st.energy = clamp(st.energy - 10, 0, 100);
      return 'Mateo loses a split decision to a kid who is clearly fourteen. In the car he says "I want to go again." Ray has to pull over for a minute.';
    case 'c2_mateo:crowd':
      st.morale = clamp(st.morale + 4, 0, 100);
      return 'Mateo wins by "the other kid started crying". He points at you in the bleachers. You point back. Ray, cornering, cries more than the other kid.';
    case 'c2_rent:pay': {
      const amt = Math.min(2000, Math.max(0, st.money));
      st.money -= amt;
      ss.rent = Math.max(0, ss.rent - amt);
      if (ss.rent === 0) ss.gymSaved = true;
      return amt ? `${money(amt)} to Vance Properties. ${ss.rent ? `${money(ss.rent)} to go.` : 'RAY\'S BOXING & SOUP IS SAVED.'}` : 'You don\'t have it. The envelope goes on the fridge.';
    }
    case 'c2_rent:later':
      return 'The fridge is now mostly envelopes. Ray calls it "the wall of shame" and puts a magnet of a cat on it.';
    case 'c3_confessional:honest':
      st.morale = clamp(st.morale + 5, 0, 100);
      return 'The producer sighs. The clip airs anyway, and becomes the most-shared thing the Lounge has ever posted. Turns out people like it when somebody means something.';
    case 'c3_confessional:villain':
      f.hype = clamp(f.hype + 7, 0, 100);
      st.morale = clamp(st.morale - 3, 0, 100);
      return `You say things about ${rivalLast(s, ss)}'s dad that you'd never say in church. The producer is crying with joy. Ray texts you one word: "Really?"`;
    case 'c3_landlord:payall': {
      if (st.money < ss.rent) return `You don't have ${money(ss.rent)}. Gordon Vance knew that before he asked.`;
      st.money -= ss.rent;
      ss.rent = 0;
      ss.gymSaved = true;
      st.morale = clamp(st.morale + 10, 0, 100);
      return 'You pay it. All of it. Cash, in a soup pot, which you leave on his desk. RAY\'S BOXING & SOUP IS SAVED.';
    }
    case 'c3_landlord:bradie':
      ss.rent = 0;
      ss.gymSaved = true;
      st.ofa.joined = true;
      if (!st.clauses.includes('of_likeness')) st.clauses.push('of_likeness');
      return 'Bradie pays it in one wire transfer with the memo "soup :)". The gym is saved. Bradie now owns a percentage of your face. You try not to think about which percentage.';
    case 'c3_landlord:win':
      ss.flags.betPurse = 1;
      f.hype = clamp(f.hype + 3, 0, 100);
      return 'Gordon Vance laughs. "Fine. Your purse, my building. Don\'t lose." From here on, Ray\'s rent comes out of every purse until it\'s paid.';
    case 'c4_grudge_booked:calm':
      st.morale = clamp(st.morale + 4, 0, 100);
      return 'Two words. The clip of you saying them gets more views than his whole speech.';
    case 'c4_grudge_booked:table':
      f.hype = clamp(f.hype + 8, 0, 100);
      st.money -= 2500;
      return 'The table goes over. So does a water jug, a microphone and Dane Whyte\'s dignity. CBFC fines you $2,500. Pay-per-view buys go up 30%.';
    case 'c2_wyatt_booked:chain':
      return 'Wyatt pats his pockets theatrically. "What chain?" He is wearing it. Under the beard. You can see it glinting.';
    case 'c2_wyatt_booked:laugh':
      st.morale = clamp(st.morale + 3, 0, 100);
      return 'You laugh. Then you check your pockets. Your wallet is there. Your keys are there. Your mouthguard is not. You decide not to think about it.';
    case 'c3_zac:kind':
      ss.flags.zacFriend = 1;
      st.morale = clamp(st.morale + 3, 0, 100);
      return '"Anytime," you tell him. Zac grins like nobody has said that to him in years. Lenny steers him away by the elbow.';
    case 'c3_zac:lenny':
      ss.flags.zacFriend = 1;
      f.hype = clamp(f.hype + 2, 0, 100);
      return 'Lenny smiles with all of his teeth. "Zac\'s contract is between Zac and Zac\'s representation. Which is me. Which is Zac." Zac looks at the floor.';
    case 'c3_zac_booked:read':
      ss.flags.zacFriend = 1;
      st.morale = clamp(st.morale + 4, 0, 100);
      return 'You read Zac the clause in the hallway. He listens to all of it. "So I can\'t grapple." "Not in this one." He nods, slowly. "After this one, can you read me the rest?"';
    case 'c3_zac_booked:focus':
      return 'You keep your head down. It\'s not your business. It bothers you anyway, all week.';
    case 'c5_presser:respect':
      st.morale = clamp(st.morale + 5, 0, 100);
      return 'Spadam nods, impressed despite himself. "Polite. I like polite. I\'ll still put you through the cage." It\'s the most respect he\'s shown anybody in two years.';
    case 'c5_presser:daniel':
      f.hype = clamp(f.hype + 8, 0, 100);
      return 'The room goes silent. Daniel takes off his glasses, puts them back on, and says "I\'m very experienced." Spadam laughs a little too hard. The clip has nine million views by midnight.';
    case 'c5_presser:stare':
      st.morale = clamp(st.morale + 3, 0, 100);
      f.hype = clamp(f.hype + 4, 0, 100);
      return 'Forty seconds. Neither of you blinks. Then Spadam glances at Daniel, just for a moment, like he\'s checking something. You see it. So does everybody.';
    case 'e_rematch_booked:respect':
      st.morale = clamp(st.morale + 6, 0, 100);
      return 'He looks at your hand for a second, then shakes it. Firm. "Saturday." "Saturday."';
  }
  return '';
}

/** A fight vs the rival just ended: remember how it went (the story reacts next week). */
export function storyResult(s: GameState, tierAt: Tier, opp: string, won: boolean, lost: boolean, title: boolean): void {
  const st = fmx(s);
  const ss = st.story;
  if (!ss || st.legacy) return;
  if (opp === 'wyatt' && title) {
    ss.flags.wyattDone = 1;
    return;
  }
  if (opp === 'zac' && title) {
    ss.flags.zacDone = 1;
    if (won) ss.flags.zacWon = 1;
    st.partner = { name: 'Zac "The Attacker" Buna', stage: 99, spars: 0, leaking: false, fake: false };
    return;
  }
  if (opp === 'spadam') {
    if (won) {
      ss.flags.spadamWon = 1;
      ss.flags.spadamLost = 0;
    } else {
      ss.flags.spadamLost = 1;
      ss.flags.spadamLostWeek = s.week;
      // the "not yet" beat can play again after the next loss
      ss.seen = ss.seen.filter((x) => x !== 'c5_lost' && x !== 'c5_presser' && x !== 'c5_night');
    }
    return;
  }
  if (opp !== ss.rival) return;
  if (tierAt === 'amateur' && !ss.flags.amDone) {
    ss.flags.amDone = 1;
    if (won) ss.flags.amWon = 1;
    else if (lost) ss.flags.amLost = 1;
  } else if (tierAt === 'of' && ss.seen.includes('c4_champ') && title) {
    ss.flags.rematchDone = 1;
    ss.flags.rematchWeek = s.week;
    if (won) ss.flags.rematchWon = 1;
  } else if (tierAt === 'of' && !ss.flags.grudgeDone) {
    ss.flags.grudgeDone = 1;
    ss.flags.grudgeAt = st.history.length;
    if (won) ss.flags.grudgeWon = 1;
    else ss.flags.grudgeLost = 1;
  }
}

/**
 * The fights the story books for you in the CBFC: the grudge match with the rival, the
 * title shot after you beat him, and the rematch (your first defence) after the credits.
 */
export function storyOffers(s: GameState, rng: Rng): void {
  const st = fmx(s);
  const ss = st.story;
  if (!ss || st.legacy || st.tier !== 'of' || st.fight || st.retired) return;
  const f = me(s);
  const r = ss.rival ? s.fighters[ss.rival] : null;
  const rivalOk = !!r && r.status !== 'retired' && !r.injuries.some((i) => i.until > s.week);
  const has = (id: string) => st.offers.some((o) => o.opp === id);
  const ofWins = since(s, ss, 'of').filter((h) => h.result === 'W').length;
  const belt = Object.values(s.belts).find((b) => b.division === f.division && !b.interim && !b.symbolic);
  if (!belt) return;
  if (r && rivalOk && !ss.flags.grudgeDone && ofWins >= 2 && !has(r.id)) {
    if (r.division !== f.division) r.division = f.division;
    st.offers.unshift({ ...offerVs(s, r, rng, `GRUDGE MATCH: Soup Kitchen vs Trust Fund. Dane Whyte wants it on the main card.`), expires: s.week + 3 });
    return;
  }
  // lost the grudge match: two more wins and Dane gives you the shot anyway
  const earned = ss.flags.grudgeWon === 1 || (ss.flags.grudgeLost === 1 && st.history.slice(Number(ss.flags.grudgeAt ?? 0)).filter((h) => h.result === 'W').length >= 2);
  if (earned && belt.holder && belt.holder !== f.id && !ss.seen.includes('c4_champ') && !has(belt.holder)) {
    const champ = s.fighters[belt.holder];
    if (champ && champ.status === 'active') st.offers.unshift({ ...offerVs(s, champ, rng, 'TITLE SHOT. You beat the Trust Fund; Dane Whyte keeps his word, for once.', belt.id), expires: s.week + 3 });
    return;
  }
  if (r && rivalOk && belt.holder === f.id && ss.seen.includes('e_plaque') && !ss.flags.rematchDone && !has(r.id)) {
    if (r.division !== f.division) r.division = f.division;
    r.promotion = 'us';
    st.offers.unshift({ ...offerVs(s, r, rng, `TITLE DEFENCE: the rematch. ${r.last} earned it. Mostly.`, belt.id), expires: s.week + 3 });
    return;
  }
  // the last fight of the road: the superfight with the White Beast, at welterweight
  const sp = s.fighters.spadam;
  const lostRecently = ss.flags.spadamLost === 1 && s.week - Number(ss.flags.spadamLostWeek ?? 0) < 6;
  if (sp && ss.seen.includes('c5_superfight') && ss.flags.spadamWon !== 1 && !lostRecently && !has(sp.id)) {
    // Han moves up a weight class for it (this is how changing division is introduced)
    if (f.division !== 'welter') {
      ss.flags.movedUp = 1;
      changeDivisionStory(s);
    }
    const wwBelt = Object.values(s.belts).find((b) => b.division === 'welter' && !b.interim && !b.symbolic);
    if (wwBelt && wwBelt.holder !== sp.id && wwBelt.holder !== f.id) wwBelt.holder = sp.id;
    const o = offerVs(s, sp, rng, 'SUPERFIGHT: Spadam "The White Beast" Biggs, for the welterweight title. Five rounds. Referee: "Dirty" Daniel Stinkovich.', wwBelt?.id ?? null);
    st.offers.unshift({ ...o, purse: Math.max(o.purse, 250000), win: Math.max(o.win, 250000), rounds: 5, limit: 170, expires: s.week + 4 });
  }
}

/** Han moves up to welterweight for the superfight (his lightweight belt comes with him). */
function changeDivisionStory(s: GameState): void {
  const f = me(s);
  f.division = 'welter';
  if (!s.divisionsOpen.includes('welter')) s.divisionsOpen.push('welter');
  f.skills.power = clamp(f.skills.power + 3, 10, 99);
  f.skills.chin = clamp(f.skills.chin + 2, 10, 99);
  f.skills.cardio = clamp(f.skills.cardio - 2, 10, 99);
  fm(s).walkWeight = 176;
}

/** Rent paid down from purses as you go (Ray takes a cut "for the soup"). */
export function storyPurse(s: GameState, pay: number): string | null {
  const st = fmx(s);
  const ss = st.story;
  if (!ss || ss.gymSaved || pay <= 0) return null;
  const amt = Math.min(ss.rent, Math.round(pay * (ss.flags.betPurse === 1 ? 0.5 : 0.1)));
  ss.rent -= amt;
  st.money -= amt;
  if (ss.rent <= 0) {
    ss.gymSaved = true;
    return `The last ${money(amt)} goes to the landlord. RAY'S BOXING & SOUP IS SAVED.`;
  }
  return `${money(amt)} of the purse went to Ray's rent. ${money(ss.rent)} to go.`;
}
