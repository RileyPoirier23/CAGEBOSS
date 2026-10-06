/**
 * Procedural fighter generation: names, nicknames, skills, personality,
 * off-cage life and look. Used by tools/namegen.ts (to write the editable
 * roster JSON) and at runtime for the regenerating prospects pool.
 */
import { Rng } from '../core/rng';
import type { CultureDef, NameTables } from '../core/content';
import type { Fighter, Look, Skills } from '../core/types';
import { DIVISION_LIMITS } from './divisions';

export const TRAITS = [
  'Trash Talker', 'Devout', 'Party Animal', 'Hothead', 'Conspiracy Poster', 'Business Savvy', 'Loyal', 'Mercenary',
  'Shy', 'Showman', 'Family First', 'Reckless Driver', 'Gambler', 'Crypto Bro', 'Political', 'Prankster',
  'Perfectionist', 'Injury Prone', 'Paranoid', 'Wholesome', 'Streamer', 'Clout Chaser', 'Gym Rat', 'Diva',
  'Lazy', 'Addictive Personality', 'Mentor',
] as const;

/** Traits gained through events (mutations). */
export const MUTATION_TRAITS = ['Martyr Complex', 'Reformed', 'Cancelled', 'Sober', 'Humbled', 'Washed', 'Born Again', 'Paranoid'];

/** Traits that start hidden and are revealed by deep scouting or incidents. */
export const HIDDEN_CAPABLE = ['Addictive Personality', 'Injury Prone', 'Lazy', 'Gambler', 'Paranoid', 'Party Animal', 'Hothead'];

export const STYLES = [
  'Pressure Striker', 'Counter Striker', 'Wrestler', 'Sub Hunter', 'Brawler', 'Point Fighter', 'Boring But Effective',
  'Kickboxer', 'Muay Thai', 'Judoka', 'Ground & Pound', 'Leg Locker', 'Showboat',
] as const;

export const BACKSTORY_IDS = [
  'rough_childhood', 'ex_wrestler', 'refugee', 'rich_kid', 'ex_cop', 'bouncer', 'military', 'youtuber', 'accountant',
  'farm_kid', 'karate_school', 'bar_brawler', 'prison_reform', 'olympic_judoka', 'divorced_dad', 'theater_kid',
  'failed_footballer', 'family_dynasty', 'late_bloomer', 'tiktok_famous',
];

const VICES = ['booze', 'pills', 'weed', 'gambling', 'online poker', 'energy drinks', 'strip clubs', 'sports betting', 'vapes', 'fast food', 'online shopping', 'cocaine', 'kratom', 'casino whales', 'lottery tickets'];
const BUSINESSES = ['a smoothie bar', 'a car wash', 'a vape shop', 'a gym franchise', 'a hot sauce brand', 'an OnlyFans management agency', 'a podcast', 'a clothing line', 'a crypto coin', 'a food truck', 'a barbershop', 'a mobile tattoo van', 'a real-estate LLC', 'a supplement line', 'an energy drink', 'a CBD dispensary', 'a pizza place', 'a bounce house rental'];
const SKELETONS = [
  'faked a GED', 'has a secret second family', 'owes money to a loan shark', 'was once arrested for stealing a goat', 'lost a fight to a bear (allegedly)',
  'ghostwrites rival fighters\' trash talk', 'has an unpaid tax bill of six figures', 'failed a drug test in amateurs that was buried', 'uses a body double for media days',
  'is secretly terrified of needles', 'fixed a regional fight years ago', 'has a burner account that roasts {his} own promotion', 'got kicked out of three gyms for stealing',
  'once sold fake signed gloves on eBay', 'has a DUI in another country nobody knows about', 'is secretly broke', 'is secretly a millionaire from a lawsuit',
  'was a contestant on a dating show under a fake name', 'wrote a self-published fantasy novel', 'still lives with {his} mom', 'has a gambling debt to a regional promoter',
];
const PARENTS = ['both alive, very proud', 'raised by grandma', 'dad in prison', 'mom is {his} manager', 'estranged from both', 'dad is an ex-fighter', 'parents run a restaurant', 'mom is a pastor', 'dad is a cop', 'orphaned young', 'divorced, fights over {him}', 'dad lives through {him}'];
const BELIEFS = ['devout Christian', 'devout Muslim', 'lapsed Catholic', 'Orthodox Christian', 'Buddhist', 'agnostic', 'atheist', 'believes in manifesting', 'astrology guy', 'stoic philosophy bro', 'pagan-curious', 'prays before every fight, just in case'];
const SPOUSES = ['{his} high school sweetheart', 'an Instagram model', 'a nurse', 'a fellow fighter', 'a dental hygienist', '{his} manager\'s sister', 'a reality-TV contestant', 'a schoolteacher', 'a realtor'];

export interface GenOpts {
  division: string;
  gender?: 'M' | 'W';
  tier: 'prospect' | 'journeyman' | 'gatekeeper' | 'contender' | 'elite';
  culture?: string;
  id?: string;
  managers?: string[];
}

function clampSkill(v: number): number {
  return Math.max(10, Math.min(99, Math.round(v)));
}

const TIER_BASE: Record<GenOpts['tier'], [number, number]> = {
  prospect: [42, 8],
  journeyman: [50, 7],
  gatekeeper: [60, 6],
  contender: [68, 6],
  elite: [78, 5],
};

export function pickCulture(rng: Rng, names: NameTables, id?: string): CultureDef {
  if (id) {
    const c = names.cultures.find((x) => x.id === id);
    if (c) return c;
  }
  return rng.weighted(names.cultures, (c) => c.weight)!;
}

export function makeName(rng: Rng, culture: CultureDef, gender: 'M' | 'W'): { first: string; last: string } {
  const first = rng.pick(gender === 'W' ? culture.firstW : culture.first);
  const last = rng.pick(culture.lastPre) + rng.pick(culture.lastSuf);
  return { first, last };
}

export interface NickContext {
  styles?: string[];
  traits?: string[];
  culture?: string;
  division?: string;
  gender?: 'M' | 'W';
}

/**
 * Nicknames that sound like real fight nicknames: picked to fit the fighter's
 * style, background, size or personality, with the odd blue-collar joke.
 */
export function makeNickname(rng: Rng, names: NameTables, ctx: NickContext = {}): string {
  const pools: { w: number; list: string[] }[] = [];
  const add = (w: number, list?: string[]) => {
    if (list && list.length) pools.push({ w, list });
  };
  for (const st of ctx.styles ?? []) add(3, names.nickStyle?.[st]);
  if (ctx.culture) add(2.5, names.nickCulture?.[ctx.culture]);
  for (const t of ctx.traits ?? []) add(0.8, names.nickTrait?.[t]);
  if (ctx.division === 'heavy') add(2, names.nickHeavy);
  if (ctx.gender === 'W') add(2.5, names.nickFemale);
  add(2.5, names.nicknames);
  const total = pools.reduce((a, p) => a + p.w, 0);
  let r = rng.next() * total;
  for (const p of pools) {
    r -= p.w;
    if (r <= 0) return rng.pick(p.list);
  }
  return rng.pick(names.nicknames);
}

export function makeLook(rng: Rng, culture: CultureDef, gender: 'M' | 'W', division: string): Look {
  const skinByCulture: Record<string, number[]> = {
    us_south: [0, 1, 1, 2, 4], us_urban: [2, 3, 4, 4, 5, 1], us_midwest: [0, 0, 1, 1], brazil: [1, 2, 3, 4, 5], caucasus: [0, 1, 1, 2],
    russia: [0, 0, 1], mexico: [1, 2, 2, 3], uk: [0, 0, 1, 4], ireland: [0, 0, 0], poland: [0, 0, 1], nigeria: [4, 5, 5],
    japan: [0, 1, 1], korea: [0, 1], aus_nz: [0, 1, 2, 3], china: [0, 1], central_asia: [1, 1, 2], nordic: [0, 0], france: [0, 1, 3, 4],
    georgia: [1, 1, 2], philippines: [2, 2, 3], canada: [0, 0, 1, 2], netherlands: [0, 2, 3, 4],
  };
  const skin = rng.pick(skinByCulture[culture.id] ?? [0, 1, 2, 3, 4, 5]);
  const darkHair = skin >= 2 || ['caucasus', 'mexico', 'japan', 'korea', 'china', 'central_asia', 'georgia', 'philippines', 'brazil'].includes(culture.id);
  const hairColor = darkHair ? rng.pick([0, 0, 1]) : rng.pick([0, 1, 2, 3, 4, 5]);
  const heavy = ['heavy', 'lightheavy'].includes(division);
  return {
    head: rng.int(0, 3),
    skin,
    hair: gender === 'W' ? rng.pick([2, 3, 5, 6, 7]) : rng.pick([0, 0, 1, 1, 2, 3, 4, 5, 6, 7]),
    hairColor,
    beard: gender === 'W' ? 0 : rng.pick([0, 0, 0, 1, 2, 3, 4]),
    brows: rng.int(0, 2),
    eyes: rng.int(0, 2),
    nose: rng.pick([0, 0, 1, 2]),
    ears: gender === 'W' ? rng.pick([0, 0, 1]) : rng.pick([0, 0, 1, 2, 3]),
    scar: rng.pick([0, 0, 0, 1, 2, 3]),
    tattoo: rng.pick([0, 0, 0, 1, 2, 3]),
    build: heavy ? rng.pick([1, 2, 2]) : rng.pick([0, 0, 1]),
  };
}

export function makeSkills(rng: Rng, tier: GenOpts['tier'], styles: string[]): Skills {
  const [base, spread] = TIER_BASE[tier];
  const s = (bonus = 0) => clampSkill(base + bonus + rng.gauss() * spread);
  const sk: Skills = {
    striking: s(), power: s(), wrestling: s(), grappling: s(), cardio: s(), chin: s(5), fightIQ: s(),
    durability: s(5), heart: s(5), weightCut: clampSkill(30 + rng.next() * 50),
  };
  const boost = (k: keyof Skills, n: number) => (sk[k] = clampSkill(sk[k] + n));
  for (const st of styles) {
    switch (st) {
      case 'Pressure Striker': boost('striking', 8); boost('cardio', 6); break;
      case 'Counter Striker': boost('striking', 7); boost('fightIQ', 7); break;
      case 'Wrestler': boost('wrestling', 14); boost('striking', -5); break;
      case 'Sub Hunter': boost('grappling', 14); boost('striking', -4); break;
      case 'Brawler': boost('power', 12); boost('chin', 5); boost('fightIQ', -8); boost('grappling', -4); break;
      case 'Point Fighter': boost('striking', 6); boost('power', -8); boost('fightIQ', 5); break;
      case 'Boring But Effective': boost('wrestling', 8); boost('cardio', 8); boost('fightIQ', 5); boost('power', -6); break;
      case 'Kickboxer': boost('striking', 10); boost('wrestling', -8); break;
      case 'Muay Thai': boost('striking', 9); boost('power', 4); break;
      case 'Judoka': boost('wrestling', 8); boost('grappling', 6); break;
      case 'Ground & Pound': boost('wrestling', 9); boost('power', 6); break;
      case 'Leg Locker': boost('grappling', 12); boost('wrestling', -5); break;
      case 'Showboat': boost('striking', 5); boost('fightIQ', -6); break;
    }
  }
  return sk;
}

let seq = 0;

export function generateFighter(rng: Rng, names: NameTables, opts: GenOpts): Fighter {
  const gender = opts.gender ?? 'M';
  const culture = pickCulture(rng, names, opts.culture);
  const { first, last } = makeName(rng, culture, gender);
  const [hometown, homeCountry] = rng.pick(culture.hometowns).split('|');
  const styles = rng.sample(STYLES as unknown as string[], rng.chance(0.55) ? 1 : 2);
  const skills = makeSkills(rng, opts.tier, styles);
  const nTraits = rng.int(2, 4);
  const traitPool = (TRAITS as unknown as string[]).filter((t) => t !== 'Family First' || rng.chance(0.6));
  const traits = rng.sample(traitPool, nTraits);
  const hiddenTraits: string[] = [];
  for (const t of HIDDEN_CAPABLE) {
    if (!traits.includes(t) && rng.chance(0.08)) hiddenTraits.push(t);
  }
  const age =
    opts.tier === 'prospect' ? rng.int(20, 25) : opts.tier === 'elite' ? rng.int(26, 34) : opts.tier === 'journeyman' ? rng.int(24, 37) : rng.int(24, 34);
  const primeAge = rng.int(26, 32) + (['heavy', 'lightheavy'].includes(opts.division) ? 2 : 0);
  const limit = DIVISION_LIMITS[opts.division] ?? 155;
  const height = Math.round(150 + (limit - 105) * 0.27 + rng.gauss() * 4);
  const reach = Math.round(height + rng.gauss() * 4 + 2);
  const winsBase = { prospect: [3, 9], journeyman: [9, 18], gatekeeper: [14, 24], contender: [14, 24], elite: [16, 28] }[opts.tier];
  const w = rng.int(winsBase[0], winsBase[1]);
  const l = opts.tier === 'prospect' ? rng.int(0, 1) : opts.tier === 'journeyman' ? rng.int(5, 11) : opts.tier === 'elite' ? rng.int(0, 4) : rng.int(2, 7);
  const potential = clampSkill(
    opts.tier === 'prospect' ? 55 + rng.next() * 42 : Math.max(...Object.values(skills).slice(0, 8)) + rng.int(0, 8),
  );
  const moneyIQ = clampSkill(rng.next() * 100);
  const followers = Math.round(Math.pow(10, 3 + rng.next() * 2.5 + (traits.includes('Streamer') || traits.includes('Clout Chaser') ? 1 : 0)));
  const id = opts.id ?? `${last.toLowerCase().replace(/[^a-z]/g, '')}_${(seq++).toString(36)}${rng.int(0, 1295).toString(36)}`;
  const isLavish = traits.includes('Party Animal') || moneyIQ < 30;
  return {
    id,
    first,
    last,
    nick: makeNickname(rng, names, { styles, traits, culture: culture.id, division: opts.division, gender }),
    gender,
    age,
    hometown,
    country: homeCountry ?? culture.countries[0],
    languages: culture.languages.slice(0, rng.int(1, culture.languages.length)),
    beliefs: rng.pick(BELIEFS),
    height,
    reach,
    stance: rng.pick(['Orthodox', 'Orthodox', 'Orthodox', 'Southpaw', 'Switch'] as const),
    gym: rng.pick(names.gyms),
    coach: rng.pick(names.coachFirst) + ' ' + rng.pick(names.coachLast),
    manager: opts.managers ? rng.pick(opts.managers) : 'self',
    division: opts.division,
    skills,
    styles,
    traits,
    family: {
      spouse: rng.chance(0.45) ? (gender === 'W' ? 'her partner' : rng.pick(SPOUSES)) : null,
      kids: rng.chance(0.45) ? rng.int(1, 4) : 0,
      parents: rng.pick(PARENTS),
    },
    finances: { debt: rng.chance(0.3) ? rng.int(1, 40) * 5000 : 0, spending: isLavish ? 'lavish' : moneyIQ > 70 ? 'frugal' : 'normal' },
    vices: rng.chance(0.55) ? rng.sample(VICES, rng.int(1, 2)) : [],
    business: rng.chance(0.35) ? [rng.pick(BUSINESSES)] : [],
    social: { followers, style: traits.includes('Streamer') ? 'live streams' : rng.pick(names.socialStyles) },
    legalRecord: rng.chance(0.15) ? [rng.pick(['bar fight (dismissed)', 'DUI', 'trespassing', 'disorderly conduct', 'unpaid parking tickets', 'assault (plea deal)'])] : [],
    skeletons: rng.chance(0.4) ? [rng.pick(SKELETONS)] : [],
    backstory: rng.pick(BACKSTORY_IDS),
    look: makeLook(rng, culture, gender, opts.division),
    record: { w, l, d: rng.chance(0.15) ? 1 : 0, nc: rng.chance(0.05) ? 1 : 0 },
    status: 'free-agent',
    promotion: null,
    streak: rng.int(-2, 4),
    koLosses: Math.min(l, rng.int(0, 3)),
    morale: rng.int(45, 75),
    loyalty: rng.int(30, 70),
    hype: Math.round(10 + (TIER_BASE[opts.tier][0] - 40) * 0.8 + rng.next() * 25),
    starPower: Math.round(5 + (TIER_BASE[opts.tier][0] - 40) * 0.7 + Math.log10(followers) * 4 + rng.next() * 15),
    damage: Math.round(Math.max(0, (age - 22) * 2 + l * 2 + rng.gauss() * 5)),
    injuries: [],
    medSuspUntil: -1,
    contract: null,
    legal: 'free',
    legalUntil: -1,
    rivals: [],
    friends: [],
    beefReporters: [],
    beefWithYou: 0,
    storyHistory: {},
    lastFightWeek: -rng.int(4, 30),
    careerLog: [],
    titleDefenses: 0,
    weightMisses: skills.weightCut > 70 && rng.chance(0.4) ? rng.int(1, 2) : 0,
    potential,
    primeAge,
    scout: 0,
    hiddenTraits,
    addiction: traits.includes('Addictive Personality') || hiddenTraits.includes('Addictive Personality') ? rng.int(5, 35) : 0,
    moneyIQ,
    streaming: traits.includes('Streamer'),
    cutman: { name: rng.pick(names.cutmen), rating: rng.int(25, 80) },
    wounds: { cuts: 0, blackEye: 0, swelling: 0, bandages: 0, noseBleed: false },
  };
}

/** Fill dynamic fields for an authored roster entry that may omit them. */
export function hydrateFighter(raw: Partial<Fighter> & { id: string }, rng: Rng, names: NameTables): Fighter {
  const tierGuess: GenOpts['tier'] = raw.marquee ? 'elite' : 'journeyman';
  const base = generateFighter(rng.fork(raw.id), names, { division: raw.division ?? 'light', gender: raw.gender, tier: tierGuess, id: raw.id });
  const f = { ...base, ...raw } as Fighter;
  f.skills = { ...base.skills, ...(raw.skills ?? {}) };
  f.look = { ...base.look, ...(raw.look ?? {}) };
  f.family = { ...base.family, ...(raw.family ?? {}) };
  f.finances = { ...base.finances, ...(raw.finances ?? {}) };
  f.social = { ...base.social, ...(raw.social ?? {}) };
  f.record = { ...base.record, ...(raw.record ?? {}) };
  f.cutman = { ...base.cutman, ...(raw.cutman ?? {}) };
  f.wounds = { cuts: 0, blackEye: 0, swelling: 0, bandages: 0, noseBleed: false };
  f.storyHistory = { ...(raw.storyHistory ?? {}) };
  f.careerLog = [...(raw.careerLog ?? [])];
  f.injuries = [...(raw.injuries ?? [])];
  f.hiddenTraits = [...(raw.hiddenTraits ?? base.hiddenTraits)];
  return f;
}
