/**
 * News items accumulate during a week; at the start of the next week they
 * become the Morning Paper (headline generator with slot filling + outlet
 * bias) plus a social-media feed sidebar.
 */
import { weeklyBanter } from './feuds';
import { expandPop } from './popculture';
import type { GameState, NewsItem, Newspaper, SocialPost, Story } from '../core/types';
import { content, type HeadlineDef, type OutletDef } from '../core/content';
import { Rng } from '../core/rng';
import { fullName } from './fighters';
import { frontPage } from './headlines';
import { onetonPost } from './oneton';

export function addNews(s: GameState, item: Omit<NewsItem, 'week'> & { week?: number }): void {
  s.media.news.push({ week: s.week, ...item });
  if (s.media.news.length > 60) s.media.news.splice(0, s.media.news.length - 60);
}

export function fillTemplate(text: string, vars: Record<string, string | number>): string {
  return expandPop(text.replace(/\{([a-zA-Z0-9_.]+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m)));
}

function headlineFor(s: GameState, item: NewsItem, outlet: OutletDef, rng: Rng): { headline: string; body: string; id: string | null } {
  if (item.text) return { headline: item.text, body: item.vars.body ? String(item.vars.body) : '', id: null };
  const all = content().headlines;
  const matches = all.filter(
    (h) => h.tags.some((t) => item.tags.includes(t)) && (!h.outlets || h.outlets.includes(outlet.type)) && Object.keys(needVars(h)).every((v) => item.vars[v] !== undefined),
  );
  if (!matches.length) {
    const v = item.vars;
    return { headline: String(v.headline ?? v.event ?? item.tags[0]).toUpperCase(), body: '', id: null };
  }
  // freshness: prefer templates used least; tone: hostile outlets prefer negative spins
  const used = s.media.headlinesUsed;
  const pick = rng.weighted(matches, (h) => {
    const fresh = 1 / (1 + (used[h.id] ?? 0) * 1.5);
    const toneFit = 1 + Math.max(0, -outlet.bias * -h.tone) + Math.max(0, outlet.bias * h.tone);
    return fresh * toneFit;
  })!;
  used[pick.id] = (used[pick.id] ?? 0) + 1;
  return { headline: fillTemplate(pick.text, item.vars), body: pick.body ? fillTemplate(pick.body, item.vars) : '', id: pick.id };
}

function needVars(h: HeadlineDef): Record<string, true> {
  const out: Record<string, true> = {};
  for (const m of (h.text + ' ' + (h.body ?? '')).matchAll(/\{([a-zA-Z0-9_.]+)\}/g)) if (!/^pop(_|$)/.test(m[1])) out[m[1]] = true;
  return out;
}

function chooseOutlet(s: GameState, item: NewsItem, rng: Rng): OutletDef {
  const outlets = content().outlets;
  if (!outlets.length) return { id: 'wire', name: 'The Wire', type: 'insider', bias: 0, reach: 3, style: '' };
  // bad news gets picked up by hostile outlets; low media meter = more hostile coverage overall
  const hostility = (50 - s.meters.media) / 50 + (s.sandbox?.mediaHostility ?? 1) - 1;
  return rng.weighted(outlets, (o) => o.reach * (1 + (item.tone < 0 ? -o.bias : o.bias) * 0.6 + (o.bias < 0 ? hostility * 0.5 : 0)))!;
}

export function genericBody(s: GameState, item: NewsItem, rng: Rng): string {
  const quips = content().templates.misc?.newsBodies ?? [];
  if (!quips.length) return '';
  return fillTemplate(rng.pick(quips), { promotion: s.promotion.name, president: s.president.name, ...item.vars });
}

export function buildPaper(s: GameState, rng: Rng): Newspaper {
  let items = s.media.news.filter((n) => n.week >= s.week - 1);
  items.sort((a, b) => b.weight - a.weight || a.tags[0].localeCompare(b.tags[0]));
  const stories: Story[] = [];
  // the front page: a fresh headline every week (memes + your roster's week)
  const fp = frontPage(s, items, rng);
  if (fp) {
    stories.push(fp.story);
    if (fp.replaces) items = items.filter((n) => n !== fp.replaces);
  }
  const notices: string[] = [];
  for (const it of items) {
    if (it.tags.includes('notice')) {
      notices.push(fillTemplate(it.text ?? '', it.vars));
      continue;
    }
    if (stories.length >= 7) continue;
    const outlet = chooseOutlet(s, it, rng);
    const h = headlineFor(s, it, outlet, rng);
    stories.push({ outlet: outlet.name, headline: h.headline, body: h.body || genericBody(s, it, rng) });
  }
  const filler = content().templates.misc?.slowNews ?? ['SLOW NEWS WEEK: LOCAL MAN STILL BELIEVES HE COULD BEAT A PRO FIGHTER'];
  // quiet weeks (and some busy ones) get a celebrity / pop-culture filler story
  if (!stories.length || (stories.length < 4 && rng.chance(0.55))) {
    const gossip = content().outlets.find((o) => o.type === 'tabloid') ?? content().outlets[0];
    stories.push({ outlet: gossip?.name ?? 'The Wire', headline: fillTemplate(rng.pick(filler), { promotion: s.promotion.name }).toUpperCase(), body: '' });
  }
  const paper: Newspaper = {
    week: s.week,
    outlet: 'The Daily Clinch',
    lead: stories[0],
    stories: stories.slice(1),
    feed: buildFeed(s, items, rng),
    notices,
  };
  s.media.news = s.media.news.filter((n) => n.week >= s.week); // consumed
  return paper;
}

export function handleOf(f: { first: string; last: string; nick: string }): string {
  const nick = f.nick.replace(/^The /, '').replace(/[^A-Za-z]/g, '');
  return '@' + (nick.length > 2 && nick.length < 14 ? nick : f.first + f.last).toLowerCase();
}

export function buildFeed(s: GameState, items: NewsItem[], rng: Rng): SocialPost[] {
  // the beef goes at the top of the feed: that's what everyone's reading
  const posts: SocialPost[] = weeklyBanter(s, rng);
  const bank = content().templates.social ?? {};
  const fighters = Object.values(s.fighters).filter((f) => f.promotion === 'us' && f.status === 'active');
  const loud = fighters.filter((f) => f.social.followers > 20000 || f.traits.includes('Trash Talker') || f.streaming);
  for (let i = 0; i < 4 && loud.length; i++) {
    const f = rng.pick(loud);
    const styleKey = f.social.style.replace(/\s+/g, '_');
    const list = bank[styleKey] ?? bank.generic ?? [];
    if (!list.length) break;
    const opp = rng.pick(fighters);
    let text = fillTemplate(rng.pick(list), { opp: opp.last, promotion: s.promotion.name, president: s.president.name.split(' ').pop() ?? 'boss', nick: f.nick, city: f.hometown.split('|')[0] });
    if (styleKey === 'all_caps_rants') text = text.toUpperCase();
    posts.push({
      handle: handleOf(f),
      name: fullName(f),
      text,
      likes: Math.round(f.social.followers * rng.float(0.01, 0.08)),
      fighter: f.id,
    });
  }
  // @1ton chimes in now and then (always about Mexican fighters)
  if (rng.chance(0.3)) {
    const p = onetonPost(s, rng);
    if (p) posts.push(p);
  }
  const fanList = bank.fans ?? [];
  for (let i = 0; i < 3 && fanList.length; i++) {
    const it = items.length ? rng.pick(items) : null;
    const vars: Record<string, string | number> = { promotion: s.promotion.name, president: s.president.name, ...(it?.vars ?? {}) };
    const text = fillTemplate(rng.pick(fanList), vars);
    if (/\{[a-z]+\}/.test(text)) continue;
    posts.push({ handle: '@' + rng.pick(FAN_HANDLES), name: 'fan', text, likes: rng.int(3, 4000) });
  }
  return posts;
}

export const FAN_HANDLES = [
  'mma_guru_420', 'xX_GNP_Xx', 'leg_kick_larry', 'cardio_karen', 'chinny_mcchinface', 'bjj_dad_1987', 'judge_hater', 'armchair_coach',
  'casual_andy', 'tapologist', 'dana_burner_7', 'boxing_is_dead', 'octagon_oracle', 'mma_mommy', 'ppv_pirate', 'ring_rat_99',
];
