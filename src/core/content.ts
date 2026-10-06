/**
 * Static content definitions (everything under data/). The browser loads
 * these through import.meta.glob (src/content.browser.ts); node tools and
 * tests load them from disk (tools/loadContent.ts). Both call buildContent().
 */
import type { Fighter, Look, StoryletDef } from './types';

export interface DivisionDef {
  id: string;
  name: string;
  short: string;
  limit: number; // lbs
  gender: 'M' | 'W';
  openAct: number;
}

export interface ManagerDef {
  id: string;
  name: string;
  licensed: boolean;
  license: string;
  shady: number; // 0..100
  agency: string;
}

export interface OutletDef {
  id: string;
  name: string;
  type: string;
  bias: number; // -1 hostile .. 1 friendly
  reach: number; // 1..5
  style: string;
}

export interface ReporterDef {
  id: string;
  name: string;
  outlet: string;
  gender: 'M' | 'W';
  personality: string;
  traits: string[];
  nemesis?: boolean;
  look: Look;
  catchphrase?: string;
}

export interface HeadlineDef {
  id: string;
  tags: string[];
  text: string;
  tone: number; // -1 .. 1 (for the president)
  outlets?: string[]; // outlet types allowed
  body?: string;
}

export interface SponsorDef {
  id: string;
  name: string;
  category: string;
  tier: number;
  weekly: number;
  blurb: string;
  ethics?: number; // 0 clean .. 3 grim
}

export interface VenueDef {
  id: string;
  name: string;
  region: string;
  capacity: number;
  cost: number;
  tier: number;
  unlockAct: number;
  special?: string;
  blurb: string;
}

export interface RuleDef {
  id: string;
  page: string;
  title: string;
  text: string;
  act: number; // act in which it becomes active automatically (0 = start)
  docTypes: string[];
  params?: Record<string, number | string | string[]>;
  announce?: string; // newspaper notice when it activates
}

export interface RivalDef {
  id: string;
  name: string;
  short: string;
  type: 'regional' | 'foreign' | 'startup' | 'boxing';
  aggression: number;
  startCash: number;
  strength: number;
  color: number;
  owner: string;
  blurb: string;
  enterAct: number;
}

export interface CompetitorDef {
  id: string;
  name: string;
  sport: string;
  buzz: number;
  volatility: number;
  blurb: string;
}

export interface NetworkDef {
  id: string;
  name: string;
  tier: number;
  basePerEvent: number;
  ppv: boolean;
  minAct: number;
  blurb: string;
}

export interface CommissionDef {
  id: string;
  name: string;
  region: string;
  country: string;
  strictness: number;
  visa: boolean;
  quirks: string[];
}

export interface ChargeDef {
  id: string;
  name: string;
  severity: number; // 1..5
  bail: [number, number];
  serious?: boolean; // handled without jokes
  desc: string;
}

export interface OfficialDef {
  id: string;
  name: string;
  role: 'judge' | 'referee';
  bias: string; // judges: 'striking'|'grappling'|'aggression'|'bad'|'fair'|'hometown'; refs: stoppage tendency 'early'|'late'|'fair'
  fouls?: 'lenient' | 'fair' | 'strict'; // refs: how they police illegal strikes
  standups?: 'fast' | 'fair' | 'slow'; // refs: how quickly they stand up stalled grappling
  competence?: number; // 0..100 — low = blown calls
  desc: string;
}

export interface EndingDef {
  id: string;
  title: string;
  headline: string;
  text: string;
  priority: number;
  secret?: boolean;
}

export interface ActDef {
  act: number;
  name: string;
  week: number; // earliest start week
  intro: string;
  goal: string;
  unlocks: string[];
}

export interface CultureDef {
  id: string;
  weight: number;
  countries: string[];
  hometowns: string[];
  languages: string[];
  first: string[];
  firstW: string[];
  lastPre: string[];
  lastSuf: string[];
}

export interface NameTables {
  cultures: CultureDef[];
  nicknames: string[];
  nickStyle?: Record<string, string[]>;
  nickCulture?: Record<string, string[]>;
  nickTrait?: Record<string, string[]>;
  nickHeavy?: string[];
  nickFemale?: string[];
  gyms: string[];
  cutmen: string[];
  coachFirst: string[];
  coachLast: string[];
  socialStyles: string[];
}

export interface BackstoryDef {
  id: string;
  name: string;
  paragraphs: string[][]; // each paragraph: alternatives
}

export interface TemplateBank {
  ticker: Record<string, string[]>;
  social: Record<string, string[]>;
  presser: Record<string, string[]>;
  ledgerQuips: string[];
  misc: Record<string, string[]>;
  presserQ?: Record<string, string[]>;
  recap?: Record<string, string[]>;
  bleets?: Record<string, Record<string, string[]>>;
}

export interface DocContent {
  substances: { code: string; name: string; banned: boolean; act: number }[];
  doctors: { name: string; license: string; real: boolean }[];
  scans: string[];
  countries: { name: string; visa: boolean; blocksArrests: boolean }[];
  expenseItems: { item: string; low: number; high: number; absurd?: string }[];
  sponsorCategories: string[];
}

export interface Content {
  divisions: DivisionDef[];
  roster: Fighter[]; // generated + marquee + legends (raw defs; dynamic fields may be missing)
  managers: ManagerDef[];
  storylets: StoryletDef[];
  outlets: OutletDef[];
  reporters: ReporterDef[];
  headlines: HeadlineDef[];
  sponsors: SponsorDef[];
  venues: VenueDef[];
  rules: RuleDef[];
  rivals: RivalDef[];
  competitors: CompetitorDef[];
  networks: NetworkDef[];
  commissions: CommissionDef[];
  charges: ChargeDef[];
  officials: OfficialDef[];
  endings: EndingDef[];
  acts: ActDef[];
  names: NameTables;
  backstories: BackstoryDef[];
  templates: TemplateBank;
  docs: DocContent;
  commentary: CommentaryBank;
  popculture: Record<string, { real: string; parody: string }[]>;
}

export interface CommentaryBank {
  speakers: Record<string, { name: string; short: string; color: string; bio: string }>;
  booth: Record<string, Record<string, string[]>>;
  fallback: Record<string, string[]>;
  butler: Record<string, string[] | string>;
}

let current: Content | null = null;

export function setContent(c: Content): void {
  current = c;
}

export function content(): Content {
  if (!current) throw new Error('Content not loaded');
  return current;
}

export function hasContent(): boolean {
  return current !== null;
}

type Raw = Record<string, unknown>;

/** Merge a set of JSON files (path -> parsed) into a Content bundle. */
export function buildContent(files: Record<string, unknown>): Content {
  const REQUIRED = Symbol('required');
  const get = (suffix: string, fallback: unknown = []): any => {
    const key = Object.keys(files).find((k) => k.replace(/\\/g, '/').endsWith(suffix));
    if (!key) {
      if (fallback === REQUIRED) throw new Error('Missing content file: ' + suffix);
      return fallback;
    }
    return files[key];
  };
  const under = (dir: string): [string, any][] =>
    Object.entries(files)
      .filter(([k]) => k.replace(/\\/g, '/').includes('/data/' + dir + '/') || k.replace(/\\/g, '/').startsWith('data/' + dir + '/'))
      .sort(([a], [b]) => a.localeCompare(b));
  const concat = <T>(dir: string): T[] => {
    const out: T[] = [];
    for (const [file, data] of under(dir)) {
      const arr = Array.isArray(data) ? data : (data as Raw).items;
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        if (dir === 'storylets') (item as StoryletDef).file = file.replace(/\\/g, '/').replace(/^.*\/data\//, 'data/');
        out.push(item as T);
      }
    }
    return out;
  };

  const roster: Fighter[] = [];
  for (const [file, data] of under('roster')) {
    if (file.endsWith('managers.json')) continue;
    const arr = Array.isArray(data) ? data : (data as Raw).fighters;
    if (Array.isArray(arr)) roster.push(...(arr as Fighter[]));
  }

  return {
    divisions: get('divisions/divisions.json', REQUIRED),
    roster,
    managers: get('roster/managers.json'),
    storylets: concat<StoryletDef>('storylets'),
    outlets: get('outlets/outlets.json'),
    reporters: get('reporters/reporters.json'),
    headlines: concat('headlines'),
    sponsors: get('sponsors/sponsors.json'),
    venues: get('venues/venues.json'),
    rules: get('rules/rules.json'),
    rivals: get('rules/rivals.json'),
    competitors: get('rules/competitors.json'),
    networks: get('rules/networks.json'),
    commissions: get('rules/commissions.json'),
    charges: get('rules/charges.json'),
    officials: get('rules/officials.json'),
    endings: get('rules/endings.json'),
    acts: get('rules/acts.json'),
    names: get('roster/names.json', REQUIRED),
    backstories: get('documents/backstories.json'),
    // templates/docs fall back to empty banks so partial content still loads
    templates: get('documents/templates.json', { ticker: {}, social: {}, presser: {}, ledgerQuips: [], misc: {} }),
    docs: get('documents/docs.json', { substances: [], doctors: [], scans: [], countries: [], expenseItems: [], sponsorCategories: [] }),
    commentary: get('documents/commentary.json', { speakers: {}, booth: {}, fallback: {}, butler: {} }),
    popculture: get('documents/popculture.json', {}),
  };
}
