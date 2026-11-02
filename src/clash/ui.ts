/* UNIVERSE CLASH - screen markup.
   Pure string builders: no state, no listeners, no canvas. The app shell owns
   behaviour; this file owns the printed-comic look. Every builder takes plain
   data so it can be tested or previewed without a browser. */

import {
  KIND_LABEL,
  MOVE_LABELS,
  charDef,
} from './characters';
import { STAGES } from './stages';
import type {
  CharId,
  GearItem,
  MatchFormat,
  MatchStats,
  MoveKey,
  Rarity,
} from './types';
import { CHAR_IDS, SLOTS } from './types';
import {
  DIRECT_OFFERS,
  PACKS,
  RARITY_ODDS,
  SLOT_NAMES,
  levelProgress,
  loadoutStats,
  totalGear,
  upgradeCost,
  type ClashOptions,
  type ClashProfile,
  type DirectOffer,
  type MatchReward,
  type PackDef,
  type PackOpenResult,
} from './profile';

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fmtClock(ticks: number): string {
  const total = Math.max(0, Math.ceil(ticks / 60));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function modeName(mode: string): string {
  if (mode === 'ranked') return 'RANKED';
  if (mode === 'training') return 'TRAINING';
  if (mode === 'local') return 'LOCAL VERSUS';
  return 'CASUAL';
}

export function rarityClass(r: Rarity): string {
  return `rarity-${r}`;
}

export function rarityBorder(r: Rarity): string {
  return `rarity-border-${r}`;
}

export function rarityLabel(r: Rarity): string {
  return r.toUpperCase();
}

export function levelOf(p: ClashProfile, id: CharId): number {
  return levelProgress(p.xp[id]).level;
}

export function selectedLevel(p: ClashProfile): number {
  return levelOf(p, p.selected);
}

function key(label: string): string {
  return `<span class="key">${esc(label)}</span>`;
}

/* --------------------------------------------------------------------------
   HUD
   -------------------------------------------------------------------------- */

export interface HudArgs {
  profile: ClashProfile;
  mode: string;
  format: MatchFormat;
  stageName: string;
  stageSub: string;
  stocks: number;
  timerMinutes: number;
  modern: boolean;
  spectator: boolean;
  /** Every seat in side order, its team, and the tag it wears (P1, P2, CPU LV3, PARTNER). */
  chars: CharId[];
  teams: number[];
  labels: string[];
}

export function stocksHtml(count: number, max: number): string {
  const total = Math.max(1, max);
  let out = '';
  for (let i = 0; i < total; i++) {
    const lost = i >= count ? ' lost' : '';
    const final = !lost && count === 1 && i === 0 ? ' final' : '';
    out += `<i class="stock${lost}${final}"></i>`;
  }
  return out;
}

function driveHtml(side: number): string {
  let out = `<div class="drive" data-drive="${side}">`;
  for (let i = 0; i < 6; i++) out += '<i></i>';
  out += '<span class="burnout-label">BURNOUT</span></div>';
  return out;
}

function hudSide(side: number, args: HudArgs): string {
  const id = args.chars[side];
  const def = charDef(id);
  const who = args.labels[side] ?? 'CPU';
  const right = side % 2 === 1;
  const compact = side >= 2;
  const team = args.teams[side] ?? side;
  return `
    <div class="hud-side ${right ? 'right' : ''} ${compact ? 'compact' : ''} team-${team}" data-side="${side}">
      <div class="hud-portrait"><canvas data-portrait="${id}" data-portrait-crop="bust" data-portrait-face="${right ? -1 : 1}" width="96" height="96"></canvas></div>
      <div class="hud-bars">
        <div class="hud-name-row">
          <div class="hud-name" data-name="${side}">${esc(def.name)}</div>
          <span class="hud-tag" data-tag="${side}">${esc(who)} // ${esc(def.universeShort)}</span>
        </div>
        <div class="health-frame">
          <div class="health-chip" data-chip="${side}"></div>
          <div class="health-fill" data-hp="${side}"></div>
          <div class="health-gloss"></div>
        </div>
        <div class="hud-meta">
          <div class="stocks" data-stocks="${side}">${args.mode === 'training' ? '<i class="stock final"></i>' : stocksHtml(args.stocks, args.stocks)}</div>
          ${driveHtml(side)}
        </div>
      </div>
    </div>`;
}

export function formatName(format: MatchFormat): string {
  return format === '2v2' ? 'TAG 2V2' : format === 'ffa' ? 'FREE-FOR-ALL' : '';
}

export function hudHtml(args: HudArgs): string {
  const fmt = formatName(args.format);
  const mode = args.spectator ? 'SPECTATOR' : fmt || modeName(args.mode);
  const n = args.chars.length;
  // Even seats stack on the left, odd seats on the right; 1v1 is one card a side.
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < n; i++) (i % 2 === 0 ? left : right).push(i);
  const combos = args.chars.map((_, i) => `<div class="combo ${i % 2 === 0 ? 'left' : 'right'} slot-${Math.floor(i / 2)}" data-combo="${i}"><b>0</b><span>HITS</span></div>`).join('');
  return `
    <div class="hud-top ${n > 2 ? 'four' : ''}">
      <div class="hud-group left">${left.map((i) => hudSide(i, args)).join('')}</div>
      <div class="hud-center">
        <div class="clock-plate">
          <div class="round-label">${esc(mode)}</div>
          <div class="clock" data-clock>${args.mode === 'training' ? '∞' : `${args.timerMinutes}:00`}</div>
        </div>
      </div>
      <div class="hud-group right">${right.map((i) => hudSide(i, args)).join('')}</div>
    </div>
    <div class="hud-bottom">
      <div>${esc(args.stageName.toUpperCase())} // ${esc(args.stageSub.toUpperCase())}</div>
      <div>${args.spectator ? 'NO INPUT · CANVAS FEED' : args.mode === 'training' ? 'DUMMY HOLDS STILL · PAUSE TO RESET' : `${fmt ? `${fmt} · ` : ''}${args.stocks} STOCK · ${args.timerMinutes} MIN`}</div>
      <div>${args.modern ? 'MODERN' : 'CLASSIC'} // F3 FRAME DATA</div>
    </div>
    <div class="count-in" data-countin><span></span></div>
    ${combos}
    <div class="center-callout" data-callout><span class="big"></span><span class="small"></span></div>
    <div class="move-toast" data-movetoast></div>
    <div class="super-flash hidden" data-superflash><div class="name"></div><div class="who"></div></div>`;
}

/* --------------------------------------------------------------------------
   Spectator Canvas: the crowd votes on how the fight is shown, never on how
   it plays. Three ballots a round; the leader of each applies when the round
   closes.
   -------------------------------------------------------------------------- */

export interface CanvasCategory {
  id: string;
  label: string;
  options: [string, string][];
}

export const CANVAS_CATEGORIES: CanvasCategory[] = [
  { id: 'look', label: 'THE LOOK', options: [['stage', 'AS DRAWN'], ['noir', 'NOIR'], ['pixel', 'PIXEL'], ['toon', 'TOON'], ['oldink', 'OLD INK'], ['glitch', 'GLITCH']] },
  { id: 'camera', label: 'THE CAMERA', options: [['normal', 'NORMAL'], ['tight', 'TIGHT'], ['wide', 'WIDE']] },
  { id: 'crowd', label: 'THE CROWD', options: [['cheer', 'CHEER'], ['hush', 'HUSH']] },
];

export interface CanvasView {
  viewers: number;
  round: number;
  secondsLeft: number;
  /** Votes this round, keyed "category:option". */
  tallies: Record<string, number>;
  /** What the last round applied, by category. */
  applied: Record<string, string>;
  /** This viewer's current vote, by category. */
  mine: Record<string, string>;
}

export function canvasHtml(v: CanvasView): string {
  const cats = CANVAS_CATEGORIES.map((cat) => {
    const total = cat.options.reduce((n, [id]) => n + (v.tallies[`${cat.id}:${id}`] ?? 0), 0) || 1;
    let lead = '';
    let leadN = -1;
    for (const [id] of cat.options) {
      const n = v.tallies[`${cat.id}:${id}`] ?? 0;
      if (n > leadN) {
        leadN = n;
        lead = id;
      }
    }
    const rows = cat.options.map(([id, label]) => {
      const n = v.tallies[`${cat.id}:${id}`] ?? 0;
      const pct = Math.round((n / total) * 100);
      const mine = v.mine[cat.id] === id;
      const on = v.applied[cat.id] === id;
      return `<button class="cv-opt ${mine ? 'mine' : ''} ${id === lead ? 'lead' : ''} ${on ? 'on' : ''}" data-action="canvas-vote" data-cat="${cat.id}" data-vote="${id}">
        <i style="width:${pct}%"></i><span>${esc(label)}</span><b>${n}</b>
      </button>`;
    }).join('');
    return `<div class="cv-cat"><div class="cv-label">${esc(cat.label)}${v.applied[cat.id] ? ` <em>// ${esc(cat.options.find(([id]) => id === v.applied[cat.id])?.[1] ?? '')}</em>` : ''}</div>${rows}</div>`;
  }).join('');
  return `<div class="canvas-panel">
    <div class="cv-head"><b>SPECTATOR CANVAS</b><span>${v.viewers.toLocaleString()} WATCHING</span><span>ROUND ${v.round} · ${v.secondsLeft}S</span></div>
    ${cats}
    <div class="cv-foot">VOTES CHANGE THE PICTURE, NEVER THE FRAME DATA.</div>
  </div>`;
}

/* --------------------------------------------------------------------------
   Title
   -------------------------------------------------------------------------- */

export function titleHtml(p: ClashProfile): string {
  const lvl = selectedLevel(p);
  const def = charDef(p.selected);
  const menu = (label: string, action: string, primary = false, hotkey = '') => `
    <button class="btn ${primary ? 'primary' : ''}" data-action="${action}">
      <span class="label">${esc(label)}</span>${hotkey ? key(hotkey) : ''}
    </button>`;
  return `
    <div class="title-top">
      <div class="issue"><b>ISSUE #01</b><span>EIGHT UNIVERSES</span></div>
      <div class="issue"><b>60 HZ</b><span>ROLLBACK READY</span></div>
    </div>
    <div class="title-main">
      <div class="title-left">
        <div class="title-lockup">
          <span class="title-kicker">THE INK IS STILL WET</span>
          <span class="logo-universe">UNIVERSE</span>
          <span class="logo-clash">CL<span>ASH</span></span>
          <div class="title-tag">NO BLOCKING. NO MERCY. <em>NO CONTINUE.</em></div>
        </div>
        <div class="title-menu">
          ${menu('FIGHT', 'fight', true, '↵')}
          ${menu('ARCADE', 'arcade')}
          ${menu('STORY', 'story-screen')}
          ${menu('RIFT LADDER', 'rift-screen')}
          ${menu('TRAINING', 'training')}
          ${menu('ONLINE', 'online')}
          ${menu('NETPLAY SIM', 'netplay')}
          ${menu('SPECTATE', 'spectate')}
          ${menu('REPLAYS', 'replays')}
          ${menu('ROSTER', 'roster')}
          ${menu('THE VAULT', 'vault')}
          ${menu('PROGRESSION', 'progress')}
          ${menu('FINISHER BUILDER', 'builder')}
          ${menu('HITBOX EDITOR', 'editor')}
          ${menu('OPTIONS', 'options')}
        </div>
      </div>
      <div class="title-cover" data-action="roster" role="button" tabindex="0" title="Open the roster">
        <div class="speedlines"></div>
        <canvas data-portrait="${p.selected}" data-portrait-pose="taunt" width="480" height="640"></canvas>
        <div class="cover-top">
          <span class="tag ink">${esc(def.universeName)}</span>
          <span class="tag">LV ${lvl}</span>
        </div>
        <div class="cover-burst">${esc(def.archetype.split(' ')[0])}</div>
        <div class="cover-name">
          <b>${esc(def.name)}</b>
          <span>${esc(def.title)}</span>
        </div>
      </div>
    </div>
    <div class="title-foot">
      <div class="stamp">NO BLOCKING // NO TIMEOUTS</div>
      <div>PROFILE // CHALLENGER ${lvl}</div>
      <div>${p.coins} COINS · ${totalGear(p)} GEAR</div>
      <div>ENTER TO CLASH · F3 FRAME DATA</div>
    </div>`;
}

/* --------------------------------------------------------------------------
   Character select
   -------------------------------------------------------------------------- */

export interface SelectArgs {
  profile: ClashProfile;
  mode: string;
  target: 0 | 1;
  cpu: CharId;
  arcade: boolean;
  stageId: string;
  cpuLevel: number;
  /** Extra markup under the rules (the netplay sim's wire settings). */
  extra?: string;
}

function fighterCard(id: CharId, args: SelectArgs): string {
  const def = charDef(id);
  const pick1 = args.profile.selected === id;
  const pick2 = args.cpu === id;
  const locked = false;
  const cls = `fighter-card${locked ? ' locked' : ''}${pick1 ? ' picked-1' : ''}${pick2 ? ' picked-2' : ''}`;
  return `
    <div class="${cls}" role="button" tabindex="0" data-action="pick" data-char="${id}" style="--uc:${def.art.accent}">
      <canvas data-portrait="${id}" width="180" height="210"></canvas>
      <span class="fc-tag">${esc(def.universeShort)}</span>
      ${pick1 ? '<span class="p1-mark">P1</span>' : ''}
      ${pick2 ? '<span class="p2-mark">P2</span>' : ''}
      <div class="fc-info">
        <div class="fc-name">${esc(def.name)}</div>
        <div class="fc-universe">${esc(def.universeName)} // ${esc(def.archetype)}</div>
      </div>
      <div class="fc-band"></div>
    </div>`;
}

function statBar(label: string, value: number): string {
  return `<div class="stat-bar"><span>${esc(label)}</span><div class="bar"><i style="width:${clampPct(value * 10)}%"></i></div></div>`;
}

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function selectHtml(args: SelectArgs): string {
  const p = args.profile;
  const player = charDef(p.selected);
  const rival = charDef(args.cpu);
  const stage = STAGES.find((s) => s.id === args.stageId) ?? STAGES[0];
  const team = args.mode === '2v2' || args.mode === 'ffa';
  const heading = args.arcade ? 'ARCADE <em>RUN</em>' : args.mode === 'training' ? 'TRAINING <em>ROOM</em>' : args.mode === 'net' ? 'NETPLAY <em>SIM</em>' : args.mode === '2v2' ? 'TAG <em>TEAM</em>' : args.mode === 'ffa' ? 'FREE FOR <em>ALL</em>' : 'CHOOSE <em>YOUR</em> VERSE';
  const begin = args.arcade ? 'BEGIN RUN' : args.mode === 'training' ? 'ENTER THE LAB' : args.mode === 'net' ? 'CONNECT' : 'CLASH';
  const modes: { id: string; label: string }[] = [
    { id: 'casual', label: 'CASUAL' },
    { id: 'ranked', label: 'RANKED' },
    { id: 'training', label: 'TRAINING' },
    { id: 'local', label: 'LOCAL 2P' },
    { id: '2v2', label: 'TAG 2V2' },
    { id: 'ffa', label: 'FREE-FOR-ALL' },
    { id: 'net', label: 'NETPLAY SIM' },
  ];
  const teamNote = team
    ? `<div class="vault-note" style="color:var(--paper-3)">${args.mode === '2v2' ? 'Your partner and the second rival are drawn from the rest of the roster. Partners cannot hit each other.' : 'Four fighters, four teams, last one standing. The other two seats are drawn at random.'}</div>`
    : '';
  return `
    <div class="screen-head">
      <div class="heading">
        <div class="kicker">${args.arcade ? 'ARCADE // EIGHT DOORS' : args.mode === 'training' ? 'THE LAB // NO CLOCK' : 'RISK IT ALL // PICK YOUR UNIVERSE'}</div>
        <h1>${heading}</h1>
        <div class="sub">${args.arcade ? 'EIGHT OPPONENTS. TWO STOCKS. NO RETRIES.' : args.mode === 'ranked' ? 'GEAR BUFFS DISABLED. PRIDE ENABLED.' : 'EVERY STAGE. EVERY FINISHER. EVERY GRUDGE.'}</div>
      </div>
      <div class="head-actions">
        <div class="wallet"><span>${p.coins} COINS</span><span class="spacer"></span><span>${totalGear(p)} GEAR</span></div>
        <button class="btn small" data-action="back">BACK</button>
      </div>
    </div>
    <div class="screen-body">
      <div class="select-layout">
        <div>
          <div class="tab-row" style="margin-bottom:8px">
            <button class="tab ${args.target === 0 ? 'active' : ''}" data-action="picktab" data-side="0">YOU // ${esc(player.name)}</button>
            <button class="tab ${args.mode !== 'local' && args.target === 1 ? 'active' : ''}" data-action="picktab" data-side="1">${args.mode === 'local' ? '' : 'RIVAL // '}${esc(rival.name)}</button>
            <button class="tab" data-action="random">RANDOM</button>
          </div>
          <div class="roster-grid">
            ${CHAR_IDS.map((id) => fighterCard(id, args)).join('')}
          </div>
        </div>
        <div class="select-side">
          <div class="picked-card panel">
            <div class="picked-art">
              <div class="sunburst"></div>
              <canvas data-portrait="${p.selected}" data-portrait-pose="taunt" width="420" height="360"></canvas>
              <span class="tag picked-lv">LV ${levelOf(p, player.id)}</span>
            </div>
            <div class="picked-copy">
              <div class="name">${esc(player.name)}</div>
              <div class="meta">${esc(player.universeName)} // ${esc(player.archetype)} // LV ${levelOf(p, player.id)}</div>
              <div class="blurb">${esc(player.blurb)}</div>
            </div>
          </div>
          <div class="loadout-row">
            <div class="mini-field">
              <label>STAGE</label>
              <div class="value">${esc(stage.name)}</div>
            </div>
            <div class="mini-field">
              <label>RULES</label>
              <div class="value">${args.mode === 'training' ? 'OPEN LAB' : `${p.stocks} STOCK`}<span class="hint">${args.mode === 'training' ? '' : `${p.timer} MIN`}</span></div>
            </div>
          </div>
          <div class="versus-strip">
            <div class="p"><span class="who">${args.mode === 'local' ? 'P1' : 'YOU'}</span><span class="nm">${esc(player.name)}</span></div>
            <div class="x">X</div>
            <div class="p r"><span class="who">${args.mode === 'local' ? 'P2' : 'CPU'}</span><span class="nm">${esc(rival.name)}</span></div>
          </div>
          <div class="loadout-row">
            <div class="mini-field" data-action="cycle" data-field="cpuLevel" role="button" tabindex="0">
              <label>CPU LEVEL</label>
              <div class="value">LV ${p.cpuLevel}<span class="hint">1—5</span></div>
            </div>
            <div class="mini-field" data-action="cycle" data-field="stocks" role="button" tabindex="0">
              <label>STOCKS</label>
              <div class="value">${p.stocks}<span class="hint">TAP</span></div>
            </div>
            <div class="mini-field" data-action="cycle" data-field="timer" role="button" tabindex="0">
              <label>TIMER</label>
              <div class="value">${p.timer} MIN</div>
            </div>
            <div class="mini-field" data-action="toggle" data-field="gearBuffs" role="button" tabindex="0">
              <label>GEAR</label>
              <div class="value">${p.gearBuffs ? 'ON' : 'OFF'}<span class="hint">${args.mode === 'ranked' ? 'LOCKED' : 'BUFFS'}</span></div>
            </div>
          </div>
          <div class="stage-strip">
            ${STAGES.map((s) => `<div class="stage-chip ${s.id === stage.id ? 'active' : ''}" data-action="stage" data-stage="${s.id}" role="button" tabindex="0"><span class="dot" style="background:${stageDot(s.theme)}"></span>${esc(s.name)}</div>`).join('')}
          </div>
          <div class="tab-row">
            ${modes.map((m) => `<button class="tab ${args.mode === m.id && !args.arcade ? 'active' : ''}" data-action="mode" data-mode="${m.id}">${m.label}</button>`).join('')}
          </div>
          ${teamNote}${args.extra ?? ''}
          <div class="select-actions">
            <button class="btn primary" data-action="begin">${begin}</button>
            <button class="btn" data-action="back">BACK</button>
          </div>
        </div>
      </div>
    </div>`;
}

function stageDot(theme: string): string {
  const map: Record<string, string> = {
    rooftop: '#d8242c',
    scroll: '#cbb995',
    cabinet: '#21d7e8',
    crypt: '#6a3fa0',
    soundstage: '#f7c948',
    hangar: '#5d6b3c',
  };
  return map[theme] ?? '#d8242c';
}

/* --------------------------------------------------------------------------
   Roster / finisher builder
   -------------------------------------------------------------------------- */

export interface RosterArgs {
  profile: ClashProfile;
  char: CharId;
}

function gearSlots(p: ClashProfile, char: CharId): string {
  return SLOTS.map((slot) => {
    const item = p.loadouts[char]?.[slot];
    return `<div class="gear-slot ${item ? rarityBorder(item.rarity) : ''}">
      <b class="${item ? rarityClass(item.rarity) : ''}">${item ? esc(item.name) : 'EMPTY'}</b>
      ${SLOT_NAMES[slot]}${item ? ` // LV ${item.level}` : ''}
    </div>`;
  }).join('');
}

function moveCell(id: CharId, key: MoveKey): string {
  const def = charDef(id);
  const move = def.moves[key];
  if (!move) return '';
  const tag = move.projectile ? 'PROJECTILE' : move.effect && move.effect !== 'none' ? move.effect.toUpperCase() : KIND_LABEL[move.kind];
  return `<div class="mv"><b>${esc(move.name)}</b><span>${esc(MOVE_LABELS[key])} // ${esc(tag)}</span></div>`;
}

export function rosterHtml(args: RosterArgs): string {
  const p = args.profile;
  const def = charDef(args.char);
  const lvl = levelProgress(p.xp[args.char]);
  const fin = def.finishers;
  const active = p.finishers[args.char] ?? null;
  const equipped = fin.find((f) => f.id === active) ?? fin[0];
  const rival = p.rivals[def.id];
  const stats = def.stats;
  const record = p.perChar[args.char];
  return `
    <div class="screen-head">
      <div class="heading">
        <div class="kicker">THE ROSTER // EIGHT DOORS</div>
        <h1>UNIVERSE <em>FILES</em></h1>
        <div class="sub">${esc(def.universeName.toUpperCase())} // ${esc(def.title.toUpperCase())}</div>
      </div>
      <div class="head-actions">
        <div class="wallet"><span>LV ${lvl.level}</span><span class="spacer"></span><span>${record.wins}W ${record.losses}L</span></div>
        <button class="btn small" data-action="back">BACK</button>
      </div>
    </div>
    <div class="screen-body">
      <div class="roster-list">
        ${CHAR_IDS.map((id) => {
          const d = charDef(id);
          return `<div class="roster-item ${id === args.char ? 'active' : ''}" data-action="rosterpick" data-char="${id}" role="button" tabindex="0">
            <canvas data-portrait="${id}" width="40" height="40"></canvas>
            <div class="ri-copy"><div class="nm">${esc(d.name)}</div><div class="un">${esc(d.universeShort)}</div></div>
            <div class="lv">${levelOf(p, id)}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="roster-main">
        <div class="big-art panel">
          <div class="sunburst"></div>
          <canvas data-portrait="${args.char}" data-portrait-pose="taunt" width="460" height="560"></canvas>
          <div class="art-label">${esc(def.universeName.toUpperCase())} // ${esc(def.archetype.toUpperCase())}</div>
          <div class="level-stamp">${lvl.level}</div>
        </div>
        <div class="roster-copy">
          <div>
            <h2>${esc(def.name)}</h2>
            <div class="epithet">${esc(def.title)} // ${esc(def.universeName)}</div>
          </div>
          <div class="quote">“${esc(def.quote)}”</div>
          <div class="xp-row">
            <div class="xp-bar"><i style="width:${Math.round(lvl.pct * 100)}%"></i></div>
            <div class="xp-lv">LV ${lvl.level}</div>
          </div>
          <div class="stat-bars">
            ${statBar('POWER', stats.power)}
            ${statBar('SPEED', stats.speed)}
            ${statBar('WEIGHT', stats.weight)}
            ${statBar('RANGE', stats.range)}
            ${statBar('DIFFICULTY', stats.difficulty)}
          </div>
          <div class="section-label">UNIVERSE PASSIVE</div>
          <div class="mv"><b>${esc(def.passive.name)}</b><span>${esc(def.passive.desc)}</span></div>
          <div class="section-label">SUPER // ${esc(def.superName)}</div>
          <div class="mv"><b>${esc(def.superName)}</b><span>${esc(def.superDesc)}</span></div>
          <div class="section-label">MOVE LIST</div>
          <div class="movelist">
            ${(['nLight', 'sLight', 'dLight', 'nAir', 'sAir', 'dAir', 'nSig', 'sSig', 'dSig', 'recovery', 'pound', 'airSig'] as MoveKey[]).map((k) => moveCell(args.char, k)).join('')}
          </div>
          <div class="section-label">FINISHER BUILDER // PICK THE PANEL</div>
          <div class="unlock-row">
            ${fin.map((f) => `<div class="unlock ${equipped.id === f.id ? 'done' : ''}" data-action="finisher" data-id="${f.id}" role="button" tabindex="0">
              <b>${esc(f.name)}</b> // ${esc(f.condition.label)}
            </div>`).join('')}
          </div>
          <div class="mv"><b>${esc(equipped.name)}</b><span>${esc(equipped.condition.label)} // ${esc(equipped.panel)}</span></div>
          <div class="section-label">GEAR LOADOUT</div>
          <div class="gear-slots">${gearSlots(p, args.char)}</div>
          <div class="section-label">RIVAL MEMORY // ${esc(def.name.toUpperCase())}</div>
          <div class="rival-panel">
            <div>
              <h3>${rival.matches > 0 ? `${rival.wins}-${rival.losses}` : 'NO READ'}</h3>
              <p>${esc(rival.note)}</p>
            </div>
            <div class="rival-panels">
              ${readPanel('DODGE', rival.dodge)}
              ${readPanel('ATTACK', rival.attack)}
              ${readPanel('AIR', rival.air)}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function readPanel(label: string, value: number): string {
  const pct = Math.round(value * 100);
  return `<div class="rp"><b>${label}</b>${pct}%<div class="stat-bar" style="margin-top:3px"><div class="bar"><i style="width:${clampPct(pct)}%"></i></div></div></div>`;
}

/* --------------------------------------------------------------------------
   Gear rows
   -------------------------------------------------------------------------- */

export function gearRow(item: GearItem, equipped: boolean, cost: number, maxed: boolean): string {
  const stats = Object.entries(item.stats)
    .map(([k, v]) => `${k.toUpperCase()} +${v}`)
    .join(' / ');
  return `<div class="inv-item ${rarityBorder(item.rarity)}">
    <div class="ii-art" style="background:${rarityColor(item.rarity)}"></div>
    <div class="ii-copy">
      <div class="ii-name ${rarityClass(item.rarity)}">${esc(item.name)}</div>
      <div class="ii-sub">${esc(charDef(item.char).name.toUpperCase())} // ${SLOT_NAMES[item.slot]} // LV ${item.level} // ${stats}</div>
      ${item.modifier ? `<div class="ii-sub">${esc(item.modifier)}</div>` : ''}
    </div>
    <div class="ii-actions">
      <button data-action="equip" data-uid="${esc(item.uid)}">${equipped ? 'EQUIPPED' : 'EQUIP'}</button>
      <button data-action="upgrade" data-uid="${esc(item.uid)}" ${maxed ? 'disabled' : ''}>${maxed ? 'MAX' : `UP ${cost}`}</button>
      <button data-action="salvage" data-uid="${esc(item.uid)}">SALVAGE</button>
    </div>
  </div>`;
}

export function rarityColor(r: Rarity): string {
  return {
    common: '#6f6658',
    rare: '#246fd8',
    epic: '#7b39b8',
    legendary: '#c58b1a',
    mythic: '#d8242c',
  }[r];
}

/* --------------------------------------------------------------------------
   Vault
   -------------------------------------------------------------------------- */

export interface VaultArgs {
  profile: ClashProfile;
  tab: 'store' | 'inventory';
  char: CharId;
  /** The store's fine print: region, age gate, pity, printed odds, catalogue. */
  finePrint?: string;
  /** Packs are hidden where the region forbids paid random items or the age gate is unanswered. */
  packsOpen?: boolean;
}

function packCard(pack: PackDef, coins: number): string {
  const odds = Object.entries(pack.odds)
    .filter(([, v]) => v > 0)
    .map(([r, v]) => `<b><span class="${rarityClass(r as Rarity)}">${rarityLabel(r as Rarity)}</span><span>${v}%</span></b>`)
    .join('');
  return `<div class="pack-card panel">
    <div class="pack-art"></div>
    <h4>${esc(pack.name)}</h4>
    <div class="pack-desc">${esc(pack.desc)}</div>
    <div class="odds">${odds}<div class="disclaimer">PRINTED ODDS. NO FINE PRINT.</div></div>
    <div class="price">${pack.cards} CARDS // ${pack.price} COINS</div>
    <button class="btn small primary" data-action="buy-pack" data-pack="${pack.id}" ${coins < pack.price ? 'disabled' : ''}>OPEN PACK</button>
  </div>`;
}

function directCard(offer: DirectOffer, coins: number, owned: boolean): string {
  const stats = Object.entries(offer.stats).map(([k, v]) => `${k.toUpperCase()} +${v}`).join(' ');
  return `<div class="direct-item ${rarityBorder(offer.rarity)}">
    <div class="dn ${rarityClass(offer.rarity)}">${esc(offer.name)}</div>
    <div>${esc(charDef(offer.char).name)} // ${SLOT_NAMES[offer.slot]} // LV ${offer.level}</div>
    <div>${esc(stats)}</div>
    <div>${offer.price} COINS${owned ? ' // OWNED' : ''}</div>
    <button data-action="buy-direct" data-uid="${offer.uid}" ${owned || coins < offer.price ? 'disabled' : ''}>${owned ? 'OWNED' : 'BUY'}</button>
  </div>`;
}

export function vaultHtml(args: VaultArgs): string {
  const p = args.profile;
  const def = charDef(args.char);
  const levels = loadoutStats(p, args.char);
  const total = Object.values(levels).reduce((a, b) => a + b, 0);
  const owned = new Set(p.inventory.map((i) => i.uid));
  const equippedUids = new Set(
    SLOTS.map((s) => p.loadouts[args.char]?.[s]?.uid).filter((x): x is string => !!x),
  );
  const tab = args.tab;
  return `
    <div class="screen-head">
      <div class="heading">
        <div class="kicker">THE VAULT // PRINTED ODDS, NO FINE PRINT</div>
        <h1>THE <em>VAULT</em></h1>
        <div class="sub">GEAR ${totalGear(p)} // COINS ${p.coins} // PACKS OPENED ${p.packsOpened}</div>
      </div>
      <div class="head-actions">
        <button class="btn small" data-action="back">BACK</button>
      </div>
    </div>
    <div class="screen-body">
      <div class="vault-layout" style="flex:1;min-width:0">
        <div style="min-width:0;display:flex;flex-direction:column;gap:10px">
          <div class="vault-tabs">
            <button class="tab ${tab === 'store' ? 'active' : ''}" data-action="vaulttab" data-tab="store">STORE</button>
            <button class="tab ${tab === 'inventory' ? 'active' : ''}" data-action="vaulttab" data-tab="inventory">INVENTORY</button>
          </div>
          ${tab === 'store'
            ? `${args.packsOpen === false ? '' : `<div class="store-grid">${PACKS.map((pk) => packCard(pk, p.coins)).join('')}</div>`}
               ${args.finePrint ?? ''}
               <div class="section-label">FEATURED // NO GAMBLE</div>
               <div class="direct-grid">${DIRECT_OFFERS.map((o) => directCard(o, p.coins, owned.has(o.uid))).join('')}</div>`
            : `<div class="inv-list">${p.inventory.length === 0
                ? '<div class="vault-note">The vault is empty. Win a match or open a pack. The house recommends both.</div>'
                : p.inventory.slice().sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || b.level - a.level)
                  .map((it) => gearRow(it, equippedUids.has(it.uid), upgradeCost(it), it.level >= 20)).join('')}</div>`}
        </div>
        <div class="vault-side">
          <div class="wallet"><span><b>${p.coins}</b> COINS</span><span class="spacer"></span><span>${totalGear(p)} / 400</span></div>
          <div class="section-label">LOADOUT // ${esc(def.name.toUpperCase())}</div>
          <div class="tab-row">
            ${CHAR_IDS.map((id) => `<button class="tab ${id === args.char ? 'active' : ''}" data-action="vault-char" data-char="${id}" style="font-size:11px;padding:3px 6px">${esc(charDef(id).name)}</button>`).join('')}
          </div>
          <div class="gear-slots">${gearSlots(p, args.char)}</div>
          <div class="mini-field"><label>LOADOUT TOTAL</label><div class="value">+${total.toFixed(1)}<span class="hint">${p.gearBuffs ? 'ACTIVE' : 'OFF'}</span></div></div>
          <div class="stat-bars">
            ${statBarPlain('STR', levels.strength)}
            ${statBarPlain('GRD', levels.guard)}
            ${statBarPlain('DRV', levels.drive)}
            ${statBarPlain('VIG', levels.vigor)}
          </div>
          <div class="vault-note">Gear buffs apply in Casual, Local and Arcade. Ranked ignores every point of it. Cosmetics are forever; the leaderboard is not.</div>
          <div class="section-label">RARITY ODDS</div>
          <div class="odds">
            ${Object.entries(RARITY_ODDS).map(([r, v]) => `<b><span class="${rarityClass(r as Rarity)}">${rarityLabel(r as Rarity)}</span><span>${v}%</span></b>`).join('')}
            <div class="disclaimer">BASE DROP TABLE // PACKS PRINT THEIR OWN.</div>
          </div>
        </div>
      </div>
    </div>`;
}

function statBarPlain(label: string, value: number): string {
  return `<div class="stat-bar"><span>${label}</span><div class="bar"><i style="width:${clampPct(value * 6)}%"></i></div></div>`;
}

function rarityRank(r: Rarity): number {
  return ['common', 'rare', 'epic', 'legendary', 'mythic'].indexOf(r);
}

export function packResultHtml(result: PackOpenResult, packName: string): string {
  return `<div class="panel results-card">
    <div class="result-kicker">${esc(packName)} // ${result.items.length} CARDS</div>
    <div class="result-win">PULL <em>RESULTS</em></div>
    <div class="result-sub">BEST ${rarityLabel(result.rarity)}${result.coins > 0 ? ` // ${result.coins} COINS BACK` : ''}</div>
    <div class="inv-list">
      ${result.items.map((item) => gearRow(item, false, upgradeCost(item), item.level >= 20)).join('')}
    </div>
    <div class="result-actions">
      <button class="btn primary" data-action="close-modal">TAKE THEM</button>
    </div>
  </div>`;
}

/* --------------------------------------------------------------------------
   Options
   -------------------------------------------------------------------------- */

export interface OptionsArgs {
  options: ClashOptions;
  fromPause: boolean;
  /** Key binding markup (screens.keysHtml). */
  keys?: string;
}

function optBtn(field: string, value: string, label: string, active: boolean): string {
  return `<button class="opt-btn ${active ? 'active' : ''}" data-action="opt" data-field="${field}" data-value="${value}">${esc(label)}</button>`;
}

function slider(field: string, value: number, min: number, max: number, step: number): string {
  return `<div class="slider"><input type="range" data-opt-range="${field}" min="${min}" max="${max}" step="${step}" value="${value}"><b data-opt-out="${field}">${Math.round(value * 100)}%</b></div>`;
}

function optRow(label: string, control: string): string {
  return `<div class="opt-row"><span>${esc(label)}</span><div class="opt-control">${control}</div></div>`;
}

export function optionsHtml(args: OptionsArgs): string {
  const o = args.options;
  return `
    <div class="screen-head">
      <div class="heading">
        <div class="kicker">SYSTEM // INK PRESSURE</div>
        <h1>OPTIONS</h1>
        <div class="sub">GRAPHICS, AUDIO, INPUT. NOTHING HIDDEN BEHIND A SLIDER.</div>
      </div>
      <div class="head-actions">
        <button class="btn small" data-action="back">BACK</button>
      </div>
    </div>
    <div class="screen-body options-screen">
      <div class="options-panel panel">
        <h3>GRAPHICS</h3>
        ${optRow('RESOLUTION SCALE', `${optBtn('resolutionScale', '0.6', '60%', o.resolutionScale <= 0.6)}${optBtn('resolutionScale', '0.75', '75%', o.resolutionScale === 0.75)}${optBtn('resolutionScale', '1', '100%', o.resolutionScale >= 1)}`)}
        ${optRow('OUTLINE QUALITY', `${optBtn('outline', '0', 'OFF', o.outline === 0)}${optBtn('outline', '1', 'LOW', o.outline === 1)}${optBtn('outline', '2', 'FULL', o.outline === 2)}`)}
        ${optRow('SHADOW TONE', `${optBtn('shadowTone', '0', 'LIGHT', o.shadowTone === 0)}${optBtn('shadowTone', '1', 'HARD', o.shadowTone === 1)}${optBtn('shadowTone', '2', 'BLACK', o.shadowTone === 2)}`)}
        ${optRow('BLOOD DENSITY', slider('blood', o.blood, 0, 1, 0.1))}
        ${optRow('PARTICLE DENSITY', slider('particles', o.particles, 0, 1, 0.1))}
        ${optRow('IMPACT FRAMES', `${optBtn('impactFrames', '0', 'OFF', o.impactFrames === 0)}${optBtn('impactFrames', '1', 'CRACK', o.impactFrames === 1)}${optBtn('impactFrames', '2', 'BREAK', o.impactFrames === 2)}`)}
        ${optRow('SHAKE', slider('shake', o.shake, 0, 1.5, 0.1))}
        ${optRow('VSYNC', `${optBtn('vsync', '1', 'ON', o.vsync)}${optBtn('vsync', '0', 'OFF', !o.vsync)}`)}
        ${optRow('FRAME CAP', `${optBtn('fpsCap', '0', 'UNCAPPED', o.fpsCap === 0)}${optBtn('fpsCap', '60', '60', o.fpsCap === 60)}${optBtn('fpsCap', '120', '120', o.fpsCap === 120)}${optBtn('fpsCap', '144', '144', o.fpsCap === 144)}${optBtn('fpsCap', '240', '240', o.fpsCap === 240)}`)}
        ${optRow('STAGE SCARS', `${optBtn('persistentScars', '0', 'PER MATCH', !o.persistentScars)}${optBtn('persistentScars', '1', 'PERSISTENT', o.persistentScars)}`)}
        ${optRow('PERF OVERLAY', `${optBtn('perfOverlay', '0', 'OFF', !o.perfOverlay)}${optBtn('perfOverlay', '1', 'ON (F3)', o.perfOverlay)}`)}
        <div class="vault-note">VSync off runs the render loop as fast as the page allows; on uses requestAnimationFrame. The simulation stays at 60 Hz either way; the renderer interpolates.</div>
      </div>
      <div class="options-panel panel">
        <h3>AUDIO &amp; INPUT</h3>
        ${optRow('MUTE', `${optBtn('muted', '0', 'SOUND ON', !o.muted)}${optBtn('muted', '1', 'MUTED', o.muted)}`)}
        ${optRow('MASTER VOLUME', slider('volume', o.volume, 0, 1, 0.05))}
        ${optRow('MUSIC', slider('music', o.music, 0, 1, 0.05))}
        ${optRow('LAYOUT', `${optBtn('modern', '0', 'CLASSIC', !o.modern)}${optBtn('modern', '1', 'MODERN', o.modern)}`)}
        ${optRow('INPUT LATENCY', `${optBtn('latency', '1', 'DEFAULT (1 TICK)', o.latency === 1)}${optBtn('latency', '0', 'LOW (0)', o.latency === 0)}`)}
        <div class="vault-note">Modern layout auto-strings lights while the button is held, starts every signature a quarter charged, and costs 10% damage. Light + Heavy is Drive Impact, Dodge + Heavy is Parry, Drive in hitstun is the Breaker.</div>
        ${args.keys ?? ''}
      </div>
      <div class="options-actions">
        <button class="btn" data-action="reset-options">RESET DEFAULTS</button>
        <button class="btn" data-action="wipe">WIPE PROFILE</button>
        <button class="btn primary" data-action="back">${args.fromPause ? 'BACK TO PAUSE' : 'BACK TO TITLE'}</button>
      </div>
    </div>`;
}

/* --------------------------------------------------------------------------
   Pause + results
   -------------------------------------------------------------------------- */

export interface PauseArgs {
  training: boolean;
  arcade: boolean;
  spectator: boolean;
  /** The training room panel (screens.trainingPanelHtml). */
  lab?: string;
}

export function pauseHtml(args: PauseArgs): string {
  return `<div class="panel results-card">
    <div class="result-kicker">MATCH PAUSED // THE INK WAITS</div>
    <div class="result-win">HOLD <em>THAT</em></div>
    <div class="result-sub">${args.spectator ? 'SPECTATOR FEED' : args.training ? 'TRAINING LAB' : args.arcade ? 'ARCADE RUN' : 'NO BLOCKING. NO MERCY.'}</div>
    ${args.lab ?? ''}
    <div class="result-actions">
      <button class="btn primary" data-action="resume">RESUME</button>
      <button class="btn" data-action="restart">${args.training ? 'RESET LAB' : 'RESTART'}</button>
      <button class="btn" data-action="pause-options">OPTIONS</button>
      <button class="btn" data-action="select">CHARACTER SELECT</button>
      ${args.training ? '<button class="btn" data-action="end-training">END SESSION</button>' : ''}
      <button class="btn" data-action="quit">QUIT TO TITLE</button>
    </div>
    <div class="vault-note" style="margin-top:10px">ESC resumes. The simulation is frozen; the camera is not.</div>
  </div>`;
}

export interface ResultArgs {
  profile: ClashProfile;
  char: CharId;
  rival: CharId;
  mode: string;
  stageName: string;
  winningSide: 0 | 1 | -1;
  local: boolean;
  spectator: boolean;
  training: boolean;
  stocks: [number, number];
  stats: MatchStats;
  reward: MatchReward | null;
  arcade: { wins: number; index: number; total: number; cleared: boolean } | null;
  arcadeNext: boolean;
  /** Ranked MMR, story or rift progress, the finisher that landed. */
  extraLine?: string;
  format?: MatchFormat;
  /** Names on each side of the score line when the match had teams. */
  teamNames?: [string, string];
}

function statBox(label: string, value: string | number): string {
  return `<div class="stat"><b>${esc(String(value))}</b><span>${esc(label)}</span></div>`;
}

function readPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function resultsHtml(args: ResultArgs): string {
  const p = args.profile;
  const def = charDef(args.char);
  const rival = p.rivals[args.rival];
  const lvl = levelProgress(p.xp[args.char]);
  const winner = args.winningSide;
  const playerWon = winner === 0;
  const draw = winner === -1;
  const headline = args.spectator
    ? `${esc(charDef(winner === 1 ? args.rival : args.char).name)} <em>WINS</em>`
    : draw
      ? 'DRAW <em>GAME</em>'
      : args.local
        ? winner === 1 ? 'PLAYER 2 <em>WINS</em>' : 'PLAYER 1 <em>WINS</em>'
        : playerWon ? 'YOU <em>WIN</em>' : 'YOU <em>LOSE</em>';
  const fmt = args.format ? formatName(args.format) : '';
  const kicker = `${fmt || modeName(args.mode)} // ${esc(args.stageName.toUpperCase())} // ${args.training ? 'OPEN LAB' : `${p.stocks} STOCK`}`;
  const sideA = args.teamNames && fmt ? esc(args.teamNames[0]) : esc(def.name.toUpperCase());
  const sideB = args.teamNames && fmt ? esc(args.teamNames[1]) : esc(charDef(args.rival).name.toUpperCase());
  const reward = args.reward;
  const arcadeLine = args.arcade
    ? args.arcade.cleared
      ? `ARCADE CLEARED // ${args.arcade.wins} WINS`
      : `ARCADE RUN // ${Math.min(args.arcade.index, args.arcade.total)} OF ${args.arcade.total} // ${args.arcade.wins} WINS`
    : '';
  return `<div class="panel results-card">
    <div class="result-kicker">${kicker}</div>
    <div class="result-win">${headline}</div>
    <div class="result-sub">${sideA} ${args.stocks[0]} — ${args.stocks[1]} ${sideB}${arcadeLine ? ` · ${arcadeLine}` : ''}</div>
    ${args.extraLine ? `<div class="result-sub">${esc(args.extraLine)}</div>` : ''}
    <div class="result-stats">
      ${statBox('DAMAGE DEALT', Math.round(args.stats.damage[0]))}
      ${statBox('HITS LANDED', args.stats.hits[0])}
      ${statBox('BEST COMBO', args.stats.maxCombo[0])}
      ${statBox('RINGOUTS', args.stats.ringouts[0])}
      ${statBox('PERFECT PARRIES', args.stats.perfectParries[0])}
      ${statBox('SUPERS', args.stats.supers[0])}
      ${statBox('DRIVE SPENT', args.stats.driveSpent[0].toFixed(1))}
      ${statBox('STOCKS LEFT', args.stocks[0])}
    </div>
    ${args.training ? '<div class="vault-note">Training rewards are reduced. The lab is for the loop, not the ladder.</div>' : `
      <div class="xp-row">
        <div class="kicker">XP</div>
        <div class="xp-bar"><i style="width:${Math.round(lvl.pct * 100)}%"></i></div>
        <div class="xp-lv">LV ${lvl.level}</div>
      </div>
      <div class="result-sub">+${reward?.xp ?? 0} XP · +${reward?.coins ?? 0} COINS${reward?.levelUps ? ` · LEVEL UP ×${reward.levelUps}` : ''}${reward?.item ? ` · ${esc(reward.item.name)} (${rarityLabel(reward.item.rarity)})` : ''}</div>`}
    <div class="rival-panel">
      <div>
        <h3>RIVAL MEMORY</h3>
        <p>${esc(rival.note)}</p>
        <div class="section-label">SERIES ${rival.wins} — ${rival.losses} // ${rival.matches} MATCHES</div>
      </div>
      <div class="rival-panels">
        ${readPanel('DODGE', rival.dodge)}
        ${readPanel('ATTACK', rival.attack)}
        ${readPanel('AIR', rival.air)}
      </div>
    </div>
    <div class="result-actions">
      ${args.arcadeNext ? '<button class="btn primary" data-action="nextarcade">NEXT OPPONENT</button>' : args.spectator ? '<button class="btn primary" data-action="spectate">NEXT MATCH</button>' : '<button class="btn primary" data-action="rematch">REMATCH</button>'}
      <button class="btn" data-action="select">CHARACTER SELECT</button>
      <button class="btn" data-action="roster">ROSTER</button>
      <button class="btn" data-action="title">TITLE</button>
    </div>
    <div class="vault-note" style="margin-top:10px">Rival reads: dodge ${readPct(rival.dodge)} // attack ${readPct(rival.attack)} // air ${readPct(rival.air)}.</div>
  </div>`;
}
