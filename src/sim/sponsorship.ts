/**
 * Event sponsors: who is on the cage, the canvas and the ribbon boards at each event.
 * Every event gets its own set (picked from the sponsor list by the event id, so it never
 * changes mid-event). Small promotions get small businesses. A company can pay to PRESENT
 * an event ("CBFC Fight Night 12, presented by ..."): in career mode they ask throughout the
 * weeks (INBOX > OFFERS); in Fighter Mode they ask you to plug the fight.
 */
import type { FightEvent, GameState } from '../core/types';
import { content } from '../core/content';
import { Rng, hashString } from '../core/rng';
import { money } from '../core/format';
import { earn, adjustMeter, scale } from './econ';
import { upcomingEvents } from './events';
import { param } from './rules';

export interface ArenaSponsor {
  name: string;
  color: number;
}

/** Tiny-promotion sponsors: local businesses that paid $200 and a case of beer. */
export const LOCAL_SPONSORS = [
  "Dave's Bar & Grill", "Ron's Tire & Lube", 'Sunrise Laundromat', 'Taco Loco (the truck)', 'Smile Bright Dental', "Kevin's Mattress World",
  'Cash 4 Gold 4 Cash', 'Big Al\'s Used Cars', 'Pizza Palace (2 for 1 Tue)', 'Iron Temple Gym', 'Discount Vape Planet', 'Grandma Rosa\'s Meatballs',
  'Lucky Star Nail Salon', 'Bob\'s Plumbing & Prayer', 'QuikStop Gas', 'The Hot Wing Hut', 'Steel City Roofing', 'Mike\'s Bait & Tackle',
];
export const REGIONAL_SPONSORS = [
  'Thunder Energy', 'Riverside Casino', 'MegaMart', 'Pain Relief Patch Co.', 'CageWear Apparel', 'Lone Star Lager', 'Apex Auto Insurance',
  'Muscle Meal Prep', 'Kingpin Bowling', 'GoldRush Sportsbook', 'TitanTruck Dealers', 'Brick House Burgers',
];

const COLORS = [0xd8342c, 0x2a6ad8, 0xe8b830, 0x2aa060, 0xd86a1c, 0x9a3ad8, 0xe8e8e8, 0x1ab8c8, 0xd83a8a, 0x8ad83a];
export const sponsorColor = (name: string): number => COLORS[hashString(name) % COLORS.length];

function sponsorName(id: string): string {
  return content().sponsors.find((x) => x.id === id)?.name ?? id;
}

/** The sponsors on show at an event: the presenting sponsor first. */
export function eventSponsors(s: GameState, ev: FightEvent): ArenaSponsor[] {
  const rng = new Rng(hashString(ev.id + ':ads'));
  const fmTier = s.mode === 'fighter' && s.fm ? s.fm.tier : null;
  let names: string[];
  if (fmTier === 'amateur') names = rng.sample(LOCAL_SPONSORS, 4);
  else if (fmTier === 'regional') names = [...rng.sample(REGIONAL_SPONSORS, 3), ...rng.sample(LOCAL_SPONSORS, 2)];
  else {
    const banned = param<string[]>(s, 'bannedSponsorCategories', []);
    const pool = content().sponsors.filter((x) => !banned.includes(x.category));
    names = rng.sample(pool, 5).map((x) => x.name.replace(/ \(.*\)$/, ''));
  }
  const pres = ev.presentedBy ? [ev.presentedBy] : [];
  const all = [...pres, ...(ev.sponsors ?? []), ...names].filter((n, i, a) => a.indexOf(n) === i).slice(0, 6);
  return all.map((name) => ({ name, color: sponsorColor(name) }));
}

/** "... presented by X" (or just the event name). */
export function eventTitle(ev: FightEvent): string {
  return ev.presentedBy ? `${ev.name}, presented by ${ev.presentedBy}` : ev.name;
}

// ---------------------------------------------------------------- career: companies asking to present an event

export interface EventSponsorOffer {
  id: string;
  sponsor: string;
  name: string;
  eventId: string;
  fee: number;
  ask: string;
  expires: number;
  banned: boolean;
}

const ASKS = [
  'They want the main event walkouts to play their jingle.',
  'The ring card girls hand out free samples between rounds.',
  'Their mascot gets a seat cageside. The mascot is a seven-foot hot dog.',
  'Their logo goes in the centre of the canvas, slightly bigger than yours.',
  'The commentators say the full company name every time somebody gets knocked down.',
  "Their CEO wants to present the belt. He's never seen a fight.",
  'The Juiced Butler has to read their slogan before the main event. It rhymes.',
  'They want naming rights to the knockout of the night ("The ___ Knockout of the Night").',
];

/** Each week there's a chance a company asks to present one of your next events. */
export function weeklySponsorOffers(s: GameState, rng: Rng): EventSponsorOffer | null {
  const m = s.market as typeof s.market & { eventOffers?: EventSponsorOffer[] };
  m.eventOffers = (m.eventOffers ?? []).filter((o) => o.expires >= s.week && s.events.some((e) => e.id === o.eventId && e.status === 'scheduled'));
  if (!rng.chance(0.35)) return null;
  const ev = upcomingEvents(s).find((e) => !e.presentedBy && !m.eventOffers!.some((o) => o.eventId === e.id));
  if (!ev) return null;
  const sp = rng.pick(content().sponsors);
  const banned = param<string[]>(s, 'bannedSponsorCategories', []).includes(sp.category);
  const fee = Math.round((sp.weekly * rng.float(3, 6) * (ev.ppv ? 2 : 1) * scale(s)) / 500) * 500;
  const o: EventSponsorOffer = { id: 'eso' + s.week + '_' + rng.int(0, 1e6), sponsor: sp.id, name: sp.name.replace(/ \(.*\)$/, ''), eventId: ev.id, fee, ask: rng.pick(ASKS), expires: s.week + 2, banned };
  m.eventOffers.push(o);
  s.inbox.push({ id: o.id, week: s.week, from: o.name, subject: `We want to present ${ev.name}`, body: `${o.name} will pay ${money(o.fee)} to present ${ev.name}. ${o.ask}${banned ? '\n\nNOTE: their category is on the Commission\'s banned sponsor list.' : ''}\n\nAnswer in INBOX > OFFERS before ${'week ' + (o.expires + 1)}.`, read: false });
  return o;
}

export function eventOffers(s: GameState): EventSponsorOffer[] {
  return (s.market as typeof s.market & { eventOffers?: EventSponsorOffer[] }).eventOffers ?? [];
}

/** Accept (or decline) a company's offer to present an event. */
export function answerEventOffer(s: GameState, id: string, accept: boolean): string {
  const m = s.market as typeof s.market & { eventOffers?: EventSponsorOffer[] };
  const o = (m.eventOffers ?? []).find((x) => x.id === id);
  if (!o) return '';
  m.eventOffers = (m.eventOffers ?? []).filter((x) => x !== o);
  if (!accept) return `You passed on ${o.name}.`;
  const ev = s.events.find((e) => e.id === o.eventId);
  if (!ev) return '';
  ev.presentedBy = o.name;
  ev.sponsors = [o.name, ...(ev.sponsors ?? [])];
  earn(s, 'sponsors', o.fee);
  if (o.banned) {
    adjustMeter(s, 'commission', -3);
    return `${ev.name} is now presented by ${o.name} (+${money(o.fee)}). The Commission has noticed the banned category. It is writing things down.`;
  }
  adjustMeter(s, 'sponsors', 1);
  return `${ev.name} is now presented by ${o.name}. +${money(o.fee)}.`;
}

/** Which canvas the event is fought on: every promotion paints its own (see ArenaView CANVAS). */
export function eventCanvas(s: GameState, ev: FightEvent): { style: 'cbfc' | 'local' | 'regional' | 'pfl' | 'bk'; logo?: string; accent?: number } {
  void ev;
  if (s.mode !== 'fighter' || !s.fm) return { style: 'cbfc' };
  const st = s.fm as { tier: string; stage?: number; circuit?: { short: string; name: string }[] };
  const sg = st.circuit?.[Math.min(st.stage ?? 0, (st.circuit?.length ?? 1) - 1)];
  if (st.tier === 'of') return { style: 'cbfc' };
  if (st.tier === 'pfl') return { style: 'pfl', logo: 'PFL LOUNGE' };
  const short = sg?.short ?? 'LOCAL';
  // each regional show has its own colour, picked from its name
  const accent = st.tier === 'regional' ? [0x2a5aa0, 0xb83a2a, 0x2a8a4a, 0x8a3ab0, 0xd88a1a][hashString(short) % 5] : undefined;
  return { style: st.tier === 'amateur' ? 'local' : 'regional', logo: short, accent };
}
