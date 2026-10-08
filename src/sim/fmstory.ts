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
import { fm, me, stage, type StaffId, type Tier } from './fighter';

export interface MomentChoice { id: string; label: string }
export type FMMoment =
  | { kind: 'signing'; league: string; short: string; tier: Tier; promoter: string; terms: [string, string][]; blurb: string }
  | { kind: 'checkin'; who: StaffId; name: string; text: string }
  | { kind: 'story'; id: string; chapter: string; title: string; text: string; who: string; choices?: MomentChoice[] }
  | { kind: 'interview'; phase: 'pre' | 'post'; reporter: string; outlet: string; q: string; choices: MomentChoice[] }
  /** the end of the road: credits roll and the memorial */
  | { kind: 'credits' };

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

type FMX = ReturnType<typeof fm> & { moments?: FMMoment[]; story?: StoryState; legacy?: boolean; stats?: FMStats };
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
  const promoter = rng.pick(PROMOTERS[sg.tier]);
  const terms: [string, string][] = [
    ['Promotion', sg.name],
    ['Fighter', `${f.first} "${f.nick}" ${f.last}`],
    ['Bouts', `${fights} fights, exclusive`],
    ['Show money', money(base)],
    ['Win bonus', money(base)],
    ['Weight class', `${f.division.toUpperCase()} (${'made every time, or else'})`],
    ['Signed', `Week ${s.week + 1}`],
  ];
  const blurb = sg.tier === 'amateur'
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

export function interviewMoment(s: GameState, rng: Rng, phase: 'pre' | 'post', won?: boolean): FMMoment | null {
  if (!rng.chance(interviewChance(s))) return null;
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
}

const rivalName = (s: GameState, ss: StoryState) => {
  const r = ss.rival ? s.fighters[ss.rival] : null;
  return r ? `${r.first} "${r.nick}" ${r.last}` : 'Tyler Vance';
};
const rivalLast = (s: GameState, ss: StoryState) => (ss.rival ? s.fighters[ss.rival]?.last : null) ?? 'Vance';
const wins = (s: GameState) => fm(s).history.filter((h) => h.result === 'W').length;
const losses = (s: GameState) => fm(s).history.filter((h) => h.result === 'L').length;

const BEATS: Beat[] = [
  {
    id: 'c1_open', chapter: 'CHAPTER 1: SOUP', when: () => true, title: "RAY'S BOXING & SOUP", who: 'Uncle Ray',
    text: (s) => `"Welcome to the family business, kid. Half gym, half soup kitchen, all mine. For now." Uncle Ray waves at a stack of red envelopes. "The landlord wants $8,000 by the end of the year or he turns this place into a vape shop. So. No pressure. Win some fights, get famous, save the soup." He hands you a mop. "And mop."`,
  },
  {
    id: 'c1_rival', chapter: 'CHAPTER 1: SOUP', when: (s) => s.week >= 1, title: 'THE KID FROM ACROSS TOWN', who: 'Bleeter',
    text: (s, ss) => `A Bleet goes up from the fancy gym across town (the one with the cold plunge and the ring light): "lol just saw ${me(s).last} training at a SOUP KITCHEN. some of us have sponsors. see u at the top. or not." It's ${rivalName(s, ss)}, unbeaten, rich parents, a nickname he gave himself. He's the ${stage(s).short} champion. Of course he is.`,
    choices: [{ id: 'fire', label: 'Fire back' }, { id: 'ignore', label: 'Let your hands talk' }],
  },
  {
    id: 'c1_firstwin', chapter: 'CHAPTER 1: SOUP', when: (s) => wins(s) >= 1, title: 'FIRST ONE', who: 'Uncle Ray',
    text: () => '"That\'s one." Ray is pretending he isn\'t crying, which is how you know he\'s crying. He puts $200 of your purse in a jar marked RENT and a hand-written sign over the bag: OUR GUY WON. "Now do it about thirty more times."',
  },
  {
    id: 'c1_firstloss', chapter: 'CHAPTER 1: SOUP', when: (s) => losses(s) >= 1, title: 'THE BAD NIGHT', who: 'Uncle Ray',
    text: () => '"Everybody loses. The ones that matter come back Monday." Ray hands you a bowl of soup. It is genuinely excellent soup. "Monday. Six a.m. Bring your chin, you left it in the cage."',
  },
  {
    id: 'c2_signed', chapter: 'CHAPTER 2: THE REGIONALS', when: (s) => fm(s).tier === 'regional', title: 'BIGGER ROOMS', who: 'Uncle Ray',
    text: (s, ss) => `You took ${rivalLast(s, ss)}'s belt, or the one he left behind when he moved up. Either way you're regional now. Ray tapes the newspaper clipping to the soup pot. "The landlord came by. I told him my fighter's going pro. He asked what that means for the rent. I said 'eventually'." Back rent: ${money(ss.rent)}.`,
    choices: [{ id: 'pay', label: 'Pay $1,500 toward the rent' }, { id: 'later', label: '"I\'ll handle it after the next fight"' }],
  },
  {
    id: 'c2_bradie', chapter: 'CHAPTER 2: THE REGIONALS', when: (s) => fm(s).tier === 'regional' && s.week >= 2, title: 'A MAN WITH AN AFRO AND AN OFFER', who: 'Bradie',
    text: (s, ss) => `Bradie slides into your DMs: "yo. heard about the soup gym. tragic. i could pay off the whole ${money(ss.rent)} tomorrow. all u gotta do is sign one (1) normal contract with only fighters. its basically normal. theres one clause. its fine."`,
    choices: [{ id: 'take', label: 'Take the money (the gym is saved... with a clause)' }, { id: 'no', label: '"I\'ll earn it."' }],
  },
  {
    id: 'c3_lounge', chapter: 'CHAPTER 3: THE LOUNGE', when: (s) => fm(s).tier === 'pfl', title: 'THE CAMERAS NEVER STOP', who: 'Lounge producer',
    text: (s, ss) => `A producer in a headset greets you at the Lounge: "Love the soup gym angle. LOVE it. We're going to need you and ${rivalLast(s, ss)} to hate each other on camera. He's already here, he's already ranked, and he already called you 'the help'. Are you going to give us a moment at the press conference?"`,
    choices: [{ id: 'moment', label: 'Give them a moment (shove him)' }, { id: 'pro', label: 'Stay professional' }],
  },
  {
    id: 'c3_ray', chapter: 'CHAPTER 3: THE LOUNGE', when: (s) => fm(s).tier === 'pfl' && s.week >= 2, title: 'RAY CALLS', who: 'Uncle Ray',
    text: (s, ss) => ss.gymSaved ? '"The gym\'s full, kid. Twelve new kids signed up because of you. They all want to be you. God help them. The soup\'s still free."' : `"Landlord gave us one more season. ${money(ss.rent)} to go. The kids are doing a car wash. They washed the landlord's car. He tipped. It was a weird day."`,
  },
  {
    id: 'c4_cbfc', chapter: 'CHAPTER 4: THE BIG SHOW', when: (s) => fm(s).tier === 'of', title: 'THE BIG SHOW', who: 'Dane Whyte',
    text: (s, ss) => `"Look, I'm gonna be honest with you." Dane Whyte is never honest with anyone. "I don't know who you are. But ${rivalLast(s, ss)} keeps talking about you, and the fans keep asking about the soup guy. So here's the deal: win, and you get the guy. Lose, and you go back to the soup."`,
  },
  {
    id: 'c4_ranked', chapter: 'CHAPTER 4: THE BIG SHOW', when: (s) => fm(s).tier === 'of' && wins(s) >= 3 && fm(s).history.slice(-1)[0]?.result === 'W', title: 'THE KIDS ARE WATCHING', who: 'Uncle Ray',
    text: () => '"There are forty kids in my gym right now, watching you on the TV I bought with your rent money. Don\'t tell the landlord. Win the next one and I\'ll make the good soup. The one with the meatballs."',
  },
  {
    id: 'c4_champ', chapter: 'EPILOGUE', when: (s) => fm(s).tier === 'of' && Object.values(s.belts).some((b) => b.holder === fm(s).player), title: 'CHAMPION', who: 'Uncle Ray',
    text: (s, ss) => `The belt is heavier than you thought. Ray is in the cage, crying openly now, holding a thermos. ${ss.gymSaved ? 'The gym is saved. There is a plaque with your name on it next to the soup pot.' : 'Tomorrow you walk into the landlord\'s office and pay the rent in cash. All of it. Then you buy the building.'} ${rivalLast(s, ss)} posts a single word on Bleeter: "rematch". Of course he does. That's the road. Now you defend it.`,
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
  if (!ss?.rival) return;
  const r = s.fighters[ss.rival];
  if (!r) return;
  const sg = stage(s);
  r.status = 'active';
  if (sg.tier === 'of') {
    r.promotion = 'us';
    for (const k of Object.keys(r.skills) as (keyof Fighter['skills'])[]) r.skills[k] = clamp(r.skills[k] + 6, 20, 95);
    return;
  }
  r.promotion = sg.promo;
  for (const k of Object.keys(r.skills) as (keyof Fighter['skills'])[]) r.skills[k] = clamp(r.skills[k] + 5, 20, 95);
  // he got here first: near the top of the ladder
  if (!st.ladder.includes(r.id)) {
    const me0 = st.ladder.indexOf(st.player);
    // the Lounge keeps its real-life order: he slots in just above you; elsewhere he's the #1 contender
    if (sg.tier === 'pfl' || st.ladder.length < 3 || st.ladder[1] === st.player) st.ladder.splice(Math.max(0, me0), 0, r.id);
    else st.ladder[1] = r.id;
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
    pushMoment(s, { kind: 'story', id: b.id, chapter: b.chapter, title: b.title, text: b.text(s, ss), who: b.who, choices: b.choices });
    if (b.id === 'c4_champ') pushMoment(s, { kind: 'credits' });
    return;
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
  }
  return '';
}

/** Rent paid down from purses as you go (Ray takes a cut "for the soup"). */
export function storyPurse(s: GameState, pay: number): string | null {
  const st = fmx(s);
  const ss = st.story;
  if (!ss || ss.gymSaved || pay <= 0) return null;
  const amt = Math.min(ss.rent, Math.round(pay * 0.1));
  ss.rent -= amt;
  st.money -= amt;
  if (ss.rent <= 0) {
    ss.gymSaved = true;
    return `The last ${money(amt)} goes to the landlord. RAY'S BOXING & SOUP IS SAVED.`;
  }
  return `${money(amt)} of the purse went to Ray's rent. ${money(ss.rent)} to go.`;
}
