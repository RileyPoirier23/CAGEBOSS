/* UNIVERSE CLASH - the long-game screens.
   Pure string builders like ui.ts: the pack reel, the store's fine print,
   the training room, replays, story, the Rift Ladder, the Finisher Builder,
   the hitbox editor and the netplay sim. The app shell owns behaviour. */

import { MOVE_LABELS, charDef, exportChar } from './characters';
import { STAGES } from './stages';
import {
  CATALOG,
  DIRECT_PRICE,
  LEVEL_TRACK,
  PITY,
  REGIONS,
  SALVAGE_VALUE,
  perItemOdds,
  regionById,
  type CatalogItem,
} from './economy';
import { PACKS, levelProgress, upgradeCost, type ClashProfile, type Action, type KeyMap, type PackOpenResult } from './profile';
import { esc, gearRow, levelOf, rarityBorder, rarityClass, rarityColor, rarityLabel } from './ui';
import type { CharId, CustomFinisher, GearItem, MoveKey, Rarity } from './types';
import { CHAR_IDS, FINISHER_PART_TICKS, RARITIES, customFinisherTicks } from './types';
import type { ReplayFile } from './rollback';

/* --------------------------------------------------------------------------
   Pack reel
   -------------------------------------------------------------------------- */

export const REEL_TILES = 40;
export const REEL_LAND = 32;
export const REEL_TILE_W = 128;

function reelTile(item: { name: string; rarity: Rarity; slot: string; char: CharId }, won: boolean): string {
  return `<div class="reel-item ${rarityBorder(item.rarity)}${won ? ' won' : ''}">
    <i style="background:${rarityColor(item.rarity)}"></i>
    <b class="${rarityClass(item.rarity)}">${esc(item.name)}</b>
    <span>${esc(charDef(item.char).name)} // ${esc(item.slot.toUpperCase())}</span>
  </div>`;
}

/** One reel per card: a strip of the pool that stops on the pulled piece. `rng` picks the decoys. */
export function packReelHtml(result: PackOpenResult, packName: string, rng: () => number): string {
  const reels = result.items.map((item, i) => {
    let tiles = '';
    for (let k = 0; k < REEL_TILES; k++) {
      if (k === REEL_LAND) {
        tiles += reelTile(item, true);
        continue;
      }
      const decoy = CATALOG[Math.floor(rng() * CATALOG.length)];
      tiles += reelTile(decoy, false);
    }
    return `<div class="reel" data-reel="${i}" style="--delay:${(i * 0.32).toFixed(2)}s">
      <div class="reel-window"><div class="reel-track">${tiles}</div><div class="reel-needle"></div></div>
    </div>`;
  }).join('');
  return `<div class="panel results-card reel-card">
    <div class="result-kicker">${esc(packName)} // ${result.items.length} CARDS</div>
    <div class="result-win">THE <em>PULL</em></div>
    <div class="reels">${reels}</div>
    <div class="result-sub reel-summary" data-reel-summary>SPINNING...</div>
    <div class="inv-list reel-list hidden" data-reel-list>
      ${result.items.map((item) => gearRow(item, false, upgradeCost(item), item.level >= 20)).join('')}
    </div>
    <div class="result-actions">
      <button class="btn" data-action="reel-skip" data-reel-skip>SKIP</button>
      <button class="btn primary" data-action="close-modal" data-reel-take disabled>TAKE THEM</button>
    </div>
  </div>`;
}

/* --------------------------------------------------------------------------
   Store: the fine print
   -------------------------------------------------------------------------- */

export interface StoreArgs {
  profile: ClashProfile;
  filterChar: CharId | 'all';
  filterRarity: Rarity | 'all';
}

export function storeFinePrintHtml(args: StoreArgs): string {
  const p = args.profile;
  const region = regionById(p.region);
  const regionSel = `<div class="tab-row">
    ${REGIONS.map((r) => `<button class="tab ${r.id === region.id ? 'active' : ''}" data-action="region" data-region="${r.id}">${esc(r.name)}</button>`).join('')}
  </div>
  <div class="vault-note">${esc(region.note)} // ESRB: IN-GAME PURCHASES (INCLUDES RANDOM ITEMS) // PEGI 16</div>`;

  let gate = '';
  if (region.packs && !p.ageOk) {
    gate = `<div class="age-gate panel">
      <h3>AGE CHECK</h3>
      <p>Packs contain paid random items. You must be ${region.age}+ to buy them in ${esc(region.name)}. Direct purchases are open to everyone.</p>
      <div class="result-actions">
        <button class="btn primary" data-action="age-ok">I AM ${region.age} OR OLDER</button>
      </div>
    </div>`;
  }

  const pity = region.packs && p.ageOk
    ? `<div class="section-label">PITY // SHOWN HERE, ALWAYS</div>
      <div class="pity-row">
        <div class="mini-field"><label>LEGENDARY WITHIN ${PITY.legendary}</label><div class="value">${p.pity.legendary} / ${PITY.legendary}</div></div>
        <div class="mini-field"><label>MYTHIC WITHIN ${PITY.mythic}</label><div class="value">${p.pity.mythic} / ${PITY.mythic}</div></div>
        <div class="mini-field"><label>WEEKLY PACK</label><div class="value"><button class="btn small" data-action="weekly">CLAIM</button></div></div>
      </div>`
    : `<div class="pity-row"><div class="mini-field"><label>WEEKLY PACK</label><div class="value"><button class="btn small" data-action="weekly">CLAIM</button></div></div></div>`;

  const odds = region.packs && p.ageOk
    ? `<div class="section-label">PRINTED ODDS // PER ITEM, PER PACK SLOT</div>
      <table class="odds-table">
        <tr><th>RARITY</th>${PACKS.map((pk) => `<th>${esc(pk.name.toUpperCase())}</th>`).join('')}<th>ITEMS IN POOL</th><th>LEVEL CAP</th><th>DIRECT</th></tr>
        ${RARITIES.map((r) => `<tr>
          <td class="${rarityClass(r)}">${rarityLabel(r)}</td>
          ${PACKS.map((pk) => `<td>${perItemOdds(pk.id, r).toFixed(3)}%</td>`).join('')}
          <td>${CATALOG.filter((c) => c.rarity === r).length}</td>
          <td>${r === 'common' ? 5 : r === 'rare' ? 10 : r === 'epic' ? 15 : 20}</td>
          <td>${DIRECT_PRICE[r]} COINS</td>
        </tr>`).join('')}
      </table>`
    : '';

  const list = CATALOG.filter((c) => (args.filterChar === 'all' || c.char === args.filterChar) && (args.filterRarity === 'all' || c.rarity === args.filterRarity));
  const catalog = `<div class="section-label">THE CATALOGUE // EVERY PACK ITEM, SOLD DIRECTLY</div>
    <div class="tab-row">
      <button class="tab ${args.filterChar === 'all' ? 'active' : ''}" data-action="store-char" data-char="all">ALL</button>
      ${CHAR_IDS.map((id) => `<button class="tab ${args.filterChar === id ? 'active' : ''}" data-action="store-char" data-char="${id}" style="font-size:11px;padding:3px 6px">${esc(charDef(id).name)}</button>`).join('')}
    </div>
    <div class="tab-row">
      <button class="tab ${args.filterRarity === 'all' ? 'active' : ''}" data-action="store-rarity" data-rarity="all">ANY RARITY</button>
      ${RARITIES.map((r) => `<button class="tab ${args.filterRarity === r ? 'active' : ''}" data-action="store-rarity" data-rarity="${r}">${rarityLabel(r)}</button>`).join('')}
    </div>
    <div class="direct-grid">${list.slice(0, 60).map((c) => catalogCard(c, p.coins)).join('')}</div>
    ${list.length > 60 ? `<div class="vault-note">${list.length - 60} more. Narrow the filter.</div>` : ''}`;

  return `${regionSel}${gate}${pity}${odds}${catalog}`;
}

function catalogCard(c: CatalogItem, coins: number): string {
  const stats = Object.entries(c.stats).map(([k, v]) => `${k.toUpperCase()} +${v}`).join(' ');
  const price = DIRECT_PRICE[c.rarity];
  return `<div class="direct-item ${rarityBorder(c.rarity)}">
    <div class="dn ${rarityClass(c.rarity)}">${esc(c.name)}</div>
    <div>${esc(charDef(c.char).name)} // ${c.slot.toUpperCase()} // LV ${c.level}</div>
    <div>${esc(stats)}${c.modifier ? ` // ${esc(c.modifier)}` : ''}</div>
    <div>${price} COINS</div>
    <button data-action="buy-catalog" data-id="${c.id}" ${coins < price ? 'disabled' : ''}>BUY</button>
  </div>`;
}

export function salvageButton(item: GearItem): string {
  return `<button data-action="salvage" data-uid="${esc(item.uid)}">SALVAGE +${SALVAGE_VALUE[item.rarity]}</button>`;
}

/* --------------------------------------------------------------------------
   Progression track
   -------------------------------------------------------------------------- */

export function progressHtml(p: ClashProfile): string {
  return `
    <div class="screen-head">
      <div class="heading">
        <div class="kicker">PROGRESSION // LEVELS NEVER ADD STATS</div>
        <h1>THE <em>TRACK</em></h1>
        <div class="sub">FIFTY LEVELS PER FIGHTER. COSMETICS, FINISHERS, PRESTIGE. NEVER A NUMBER ON A HITBOX.</div>
      </div>
      <div class="head-actions"><button class="btn small" data-action="back">BACK</button></div>
    </div>
    <div class="screen-body">
      <div class="track-grid">
        ${CHAR_IDS.map((id) => {
          const lv = levelProgress(p.xp[id]);
          return `<div class="panel track-card">
            <div class="track-head"><canvas data-portrait="${id}" width="48" height="48"></canvas><div><b>${esc(charDef(id).name)}</b><span>LV ${lv.level} // ${lv.level >= 50 ? 'MAX' : `${lv.into} / ${lv.need} XP`}</span></div></div>
            <div class="xp-bar"><i style="width:${Math.round(lv.pct * 100)}%"></i></div>
            <ul class="track-list">${LEVEL_TRACK.map(([l, n]) => `<li class="${lv.level >= l ? 'done' : ''}">${l} // ${esc(n)}</li>`).join('')}</ul>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

/* --------------------------------------------------------------------------
   Training room (inside the pause panel)
   -------------------------------------------------------------------------- */

export interface TrainingArgs {
  char: CharId;
  dummy: string;
  options: ClashProfile['options']['training'];
  armed: number;
}

export function trainingPanelHtml(args: TrainingArgs): string {
  const def = charDef(args.char);
  const tog = (key: keyof TrainingArgs['options'], label: string) =>
    `<button class="opt-btn ${args.options[key] ? 'active' : ''}" data-action="train-toggle" data-key="${key}">${label}</button>`;
  const dummies = [['stand', 'STAND'], ['jump', 'JUMP'], ['dodge', 'DODGE ON ATTACK'], ['cpu', 'CPU']];
  return `<div class="training-panel">
    <div class="section-label">THE LAB</div>
    <div class="opt-row"><span>DUMMY</span><div class="opt-control">${dummies.map(([v, l]) => `<button class="opt-btn ${args.dummy === v ? 'active' : ''}" data-action="dummy" data-dummy="${v}">${l}</button>`).join('')}</div></div>
    <div class="opt-row"><span>OVERLAYS</span><div class="opt-control">${tog('hitboxes', 'HITBOXES')}${tog('frameData', 'FRAME DATA')}${tog('dodgeViz', 'DODGE WINDOWS')}${tog('ghost', 'GHOST 10S')}</div></div>
    <div class="section-label">COMBO TRIALS // ${esc(def.name.toUpperCase())}</div>
    <div class="trials">
      ${def.trials.map((t, i) => `<button class="opt-btn ${args.armed === i ? 'active' : ''}" data-action="trial" data-trial="${i}">${i + 1}. ${t.map((k) => esc(k === 'jump' || k === 'gc' ? k.toUpperCase() : MOVE_LABELS[k as MoveKey] ?? k)).join(' > ')}</button>`).join('')}
    </div>
    <div class="vault-note">Ghost replays your last ten seconds beside you. Trials arm on click and resume the lab; land the sequence as one combo.</div>
  </div>`;
}

/* --------------------------------------------------------------------------
   Replays
   -------------------------------------------------------------------------- */

export function replaysHtml(p: ClashProfile): string {
  const rows = p.replays.map((rep, i) => `<div class="inv-item">
    <div class="ii-copy">
      <div class="ii-name">${esc(charDef(rep.cfg.playerChar).name)} vs ${esc(charDef(rep.cfg.cpuChar).name)}</div>
      <div class="ii-sub">${esc((rep.when ?? '').slice(0, 16).replace('T', ' '))} // ${esc(rep.cfg.stageId.toUpperCase())} // ${(rep.ticks / 60).toFixed(0)} S // ${rep.inputs.length} INPUT EVENTS</div>
    </div>
    <div class="ii-actions"><button data-action="replay" data-index="${i}">WATCH</button></div>
  </div>`).join('');
  return `
    <div class="screen-head">
      <div class="heading">
        <div class="kicker">REPLAY THEATER // INPUTS ONLY</div>
        <h1>THE <em>TAPES</em></h1>
        <div class="sub">A REPLAY IS AN INPUT LOG. THE SIM IS DETERMINISTIC, SO IT RE-SIMULATES EXACTLY.</div>
      </div>
      <div class="head-actions"><button class="btn small" data-action="back">BACK</button></div>
    </div>
    <div class="screen-body"><div class="inv-list" style="flex:1">${rows || '<div class="vault-note">No tapes yet. Finish a match.</div>'}</div></div>`;
}

export function inputDisplayHtml(): string {
  const labels = ['↑', '↓', '←', '→', 'J', 'L', 'H', 'D', 'T', 'S', 'DR'];
  return [0, 1].map((side) => `<div class="input-row" data-inputs="${side}"><b>P${side + 1}</b>${labels.map((l) => `<span>${l}</span>`).join('')}</div>`).join('');
}

/* --------------------------------------------------------------------------
   Story and the Rift Ladder
   -------------------------------------------------------------------------- */

export function storyHtml(p: ClashProfile): string {
  return `
    <div class="screen-head">
      <div class="heading">
        <div class="kicker">STORY // EIGHT CHAPTERS</div>
        <h1>THE <em>TEAR</em></h1>
        <div class="sub">ONE CHAPTER PER FIGHTER, TOLD AS COMIC PAGES BETWEEN FIGHTS. EACH ENDS ON A BREAK FRAME.</div>
      </div>
      <div class="head-actions"><button class="btn small" data-action="back">BACK</button></div>
    </div>
    <div class="screen-body">
      <div class="chapter-grid">
        ${CHAR_IDS.map((id, i) => {
          const def = charDef(id);
          const foe = charDef(CHAR_IDS[(i + 1) % 8]);
          const stage = STAGES[(i + 1) % STAGES.length];
          const unlocked = i <= p.story;
          const done = i < p.story;
          return `<div class="panel chapter ${unlocked ? '' : 'locked'}">
            <div class="chapter-num">${String(i + 1).padStart(2, '0')}</div>
            <canvas data-portrait="${id}" width="120" height="140"></canvas>
            <div class="chapter-copy">
              <b>${esc(def.name)}</b>
              <p>${esc(def.story)}</p>
              <span>VS ${esc(foe.name.toUpperCase())} // ${esc(stage.name.toUpperCase())}</span>
              ${unlocked ? `<button class="btn small primary" data-action="story" data-chapter="${i}">${done ? 'REPLAY' : 'PLAY'} CHAPTER</button>` : '<span class="lock">LOCKED</span>'}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

export interface RiftRung {
  name: string;
  desc: string;
  mods: { damage?: number };
  stocks: number;
  cpuLevel: number;
  foe: CharId;
  stageId: string;
}

export function riftSeed(day: string): number {
  let s = 7;
  for (const ch of day) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return s >>> 0;
}

export function riftRungs(day: string, player: CharId): RiftRung[] {
  const seed = riftSeed(day);
  const base: Omit<RiftRung, 'foe' | 'stageId'>[] = [
    { name: 'Heavy Ink', desc: 'All damage x1.3', mods: { damage: 130 }, stocks: 3, cpuLevel: 2 },
    { name: 'Thin Air', desc: 'One stock each', mods: {}, stocks: 1, cpuLevel: 3 },
    { name: 'Burnout Bowl', desc: 'Damage x1.15, CPU level 5', mods: { damage: 115 }, stocks: 3, cpuLevel: 5 },
  ];
  return base.map((b, i) => {
    let foe = CHAR_IDS[(seed + i * 3) % 8];
    if (foe === player) foe = CHAR_IDS[(seed + i * 3 + 1) % 8];
    return { ...b, foe, stageId: STAGES[(seed + i) % STAGES.length].id };
  });
}

export function riftHtml(p: ClashProfile, day: string): string {
  const rungs = riftRungs(day, p.selected);
  const wins = p.rift.day === day ? p.rift.wins : 0;
  return `
    <div class="screen-head">
      <div class="heading">
        <div class="kicker">RIFT LADDER // SEED ${riftSeed(day).toString(16).toUpperCase()}</div>
        <h1>TODAY'S <em>RIFT</em></h1>
        <div class="sub">${esc(day)} // ${wins} OF 3 CLEARED // PLAYING AS ${esc(charDef(p.selected).name.toUpperCase())}</div>
      </div>
      <div class="head-actions"><button class="btn small" data-action="back">BACK</button></div>
    </div>
    <div class="screen-body">
      <div class="rung-list">
        ${rungs.map((r, i) => `<div class="panel rung ${i > wins ? 'locked' : ''} ${i < wins ? 'done' : ''}">
          <div class="rung-num">${i + 1}</div>
          <div class="rung-copy">
            <b>${esc(r.name)}</b>
            <span>${esc(r.desc)} // VS ${esc(charDef(r.foe).name.toUpperCase())} // ${esc(r.stageId.toUpperCase())} // CPU LV${r.cpuLevel}</span>
          </div>
          ${i === wins ? `<button class="btn primary" data-action="rift" data-rung="${i}">FIGHT</button>` : i < wins ? '<span class="lock">CLEARED</span>' : '<span class="lock">LOCKED</span>'}
        </div>`).join('')}
      </div>
      <div class="vault-note">Three rungs a day, same seed for everyone. Each win pays 120 coins; clearing the ladder marks the day.</div>
    </div>`;
}

/* --------------------------------------------------------------------------
   Finisher Builder
   -------------------------------------------------------------------------- */

const PARTS: Record<'opener' | 'beat' | 'punchline', [string, string][]> = {
  opener: [['lift', 'LIFT'], ['drag', 'DRAG'], ['hold', 'HOLD']],
  beat: [['punches', 'PUNCHES'], ['slam', 'SLAM'], ['stomp', 'STOMP'], ['long', 'EXTENDED (200)']],
  punchline: [['panel', 'COMIC PANEL'], ['zoom', 'ZOOM'], ['wipe', 'WIPE']],
};

export function builderHtml(p: ClashProfile, char: CharId): string {
  const def = charDef(char);
  const cur: CustomFinisher = p.custom[char] ?? { name: 'Custom Finisher', parts: { opener: 'lift', beat: 'punches', punchline: 'panel' } };
  const total = customFinisherTicks(cur);
  const ok = total <= 240;
  const row = (k: 'opener' | 'beat' | 'punchline') => `<div class="opt-row"><span>${k.toUpperCase()}</span><div class="opt-control">
    ${PARTS[k].map(([v, l]) => `<button class="opt-btn ${cur.parts[k] === v ? 'active' : ''}" data-action="builder-part" data-part="${k}" data-value="${v}">${l} <small>${FINISHER_PART_TICKS[v]}</small></button>`).join('')}
  </div></div>`;
  return `
    <div class="screen-head">
      <div class="heading">
        <div class="kicker">FINISHER BUILDER // OPENER + BEAT + PUNCHLINE</div>
        <h1>BUILD THE <em>PANEL</em></h1>
        <div class="sub">MAX FOUR SECONDS. FIRES WHEN A SIGNATURE LANDS THE FINAL KO AND NO BUILT-IN FINISHER MATCHED.</div>
      </div>
      <div class="head-actions"><button class="btn small" data-action="back">BACK</button></div>
    </div>
    <div class="screen-body options-screen">
      <div class="options-panel panel">
        <div class="tab-row">${CHAR_IDS.map((id) => `<button class="tab ${id === char ? 'active' : ''}" data-action="builder-char" data-char="${id}" style="font-size:11px;padding:3px 6px">${esc(charDef(id).name)}</button>`).join('')}</div>
        <div class="opt-row"><span>NAME</span><div class="opt-control"><input class="text-field" data-builder-name value="${esc(cur.name)}" maxlength="32"></div></div>
        ${row('opener')}${row('beat')}${row('punchline')}
        <div class="vault-note ${ok ? 'ok' : 'bad'}">LENGTH ${total} TICKS (${(total / 60).toFixed(1)} S) // ${ok ? 'VALID' : 'TOO LONG. MAX 240.'}</div>
        <div class="options-actions">
          <button class="btn primary" data-action="builder-save" ${ok ? '' : 'disabled'}>SAVE FOR ${esc(def.name.toUpperCase())}</button>
          <button class="btn" data-action="builder-clear">REMOVE</button>
        </div>
      </div>
      <div class="options-panel panel">
        <h3>BUILT-IN FINISHERS // ${esc(def.name.toUpperCase())}</h3>
        ${def.finishers.map((f, i) => `<div class="mv"><b>${i + 1}. ${esc(f.name)}</b><span>${esc(f.condition.label)} // ${esc(f.kind.toUpperCase())} // ${esc(f.panel)}</span></div>`).join('')}
        <div class="vault-note">Finishers unlock at levels 1, 15 and 30. The custom panel is a fourth, and plays in the loser's universe treatment.</div>
      </div>
    </div>`;
}

/* --------------------------------------------------------------------------
   Hitbox / animation editor
   -------------------------------------------------------------------------- */

const EDIT_KEYS: MoveKey[] = ['nLight', 'sLight', 'dLight', 'nAir', 'sAir', 'dAir', 'nSig', 'sSig', 'dSig', 'recovery', 'pound', 'airSig', 'super', 'impact', 'throw'];

export function editorHtml(char: CharId, key: MoveKey): string {
  const def = charDef(char);
  const m = def.moves[key];
  const num = (label: string, field: string, value: number, step = 1) =>
    `<div class="opt-row"><span>${label}</span><div class="opt-control"><input class="num-field" type="number" step="${step}" value="${value}" data-edit="${field}"></div></div>`;
  return `
    <div class="screen-head">
      <div class="heading">
        <div class="kicker">HITBOX / ANIMATION EDITOR // LIVE</div>
        <h1>THE <em>DRAWING</em> TABLE</h1>
        <div class="sub">EDITS APPLY TO THE CHARACTER DATA AT ONCE. THE SIM READS MOVES EVERY TICK, SO THE LAB SHOWS CHANGES IMMEDIATELY.</div>
      </div>
      <div class="head-actions"><button class="btn small" data-action="back">BACK</button></div>
    </div>
    <div class="screen-body options-screen">
      <div class="options-panel panel">
        <div class="tab-row">${CHAR_IDS.map((id) => `<button class="tab ${id === char ? 'active' : ''}" data-action="editor-char" data-char="${id}" style="font-size:11px;padding:3px 6px">${esc(charDef(id).name)}</button>`).join('')}</div>
        <div class="tab-row">${EDIT_KEYS.map((k) => `<button class="tab ${k === key ? 'active' : ''}" data-action="editor-move" data-key="${k}" style="font-size:11px;padding:3px 6px">${esc(MOVE_LABELS[k])}</button>`).join('')}</div>
        <h3>${esc(m.name)} // ${esc(m.kind.toUpperCase())}</h3>
        ${num('STARTUP', 'startup', m.startup)}${num('ACTIVE', 'active', m.active)}${num('RECOVERY', 'recovery', m.recovery)}
        ${num('DAMAGE', 'damage', m.damage)}${num('ANGLE (DEG, 90 = UP)', 'angle', m.angle)}${num('BASE KNOCKBACK', 'baseKb', m.baseKb, 0.1)}${num('GROWTH KNOCKBACK', 'growthKb', m.growthKb, 0.05)}
        <div class="section-label">HITBOX // PX FROM FEET, X FORWARD, Y NEGATIVE = UP</div>
        ${num('X', 'hitbox.x', m.hitbox.x)}${num('Y', 'hitbox.y', m.hitbox.y)}${num('W', 'hitbox.w', m.hitbox.w)}${num('H', 'hitbox.h', m.hitbox.h)}
        <div class="options-actions">
          <button class="btn primary" data-action="editor-test">TEST IN THE LAB</button>
          <button class="btn" data-action="editor-export">REFRESH JSON</button>
          <button class="btn" data-action="editor-import">IMPORT JSON</button>
        </div>
      </div>
      <div class="options-panel panel">
        <h3>CHARACTER DATA FILE</h3>
        <div class="vault-note">One file per fighter: stats, art recipe, move list with frame data and hitboxes, finishers, universe tag, Break panel style. Importing replaces this character for the session.</div>
        <textarea class="json-field" data-editor-json rows="22" spellcheck="false">${esc(exportChar(char))}</textarea>
      </div>
    </div>`;
}

/* --------------------------------------------------------------------------
   Netplay sim settings (on the select screen) and the net HUD line
   -------------------------------------------------------------------------- */

export function netSettingsHtml(net: ClashProfile['options']['net'], p2: 'cpu' | 'keys'): string {
  const num = (label: string, field: string, value: number, min: number, max: number) =>
    `<div class="mini-field"><label>${label}</label><div class="value"><input class="num-field" type="number" min="${min}" max="${max}" value="${value}" data-net="${field}"></div></div>`;
  return `<div class="loadout-row">
    ${num('INPUT DELAY', 'delay', net.delay, 0, 8)}${num('PING MS', 'ping', net.ping, 0, 400)}${num('JITTER MS', 'jitter', net.jitter, 0, 200)}
    <div class="mini-field" data-action="net-p2" role="button" tabindex="0"><label>PEER 2</label><div class="value">${p2 === 'cpu' ? 'CPU' : 'KEYS'}<span class="hint">TAP</span></div></div>
  </div>
  <div class="vault-note">Two peers in one page over a simulated wire. Each predicts the other, rolls back on a late input, and compares checksums on every confirmed tick.</div>`;
}

/* --------------------------------------------------------------------------
   Key bindings
   -------------------------------------------------------------------------- */

const ACTIONS: Action[] = ['up', 'down', 'left', 'right', 'jump', 'light', 'heavy', 'dodge', 'throw', 'super', 'drive'];

export function keyName(code: string): string {
  return code.replace(/^Key/, '').replace(/^Arrow/, '').replace(/^Numpad/, 'NUM ').replace(/^Digit/, '');
}

export function keysHtml(keys: [KeyMap, KeyMap], binding: { side: 0 | 1; action: Action } | null): string {
  return [0, 1].map((side) => `<div class="section-label">KEYS // P${side + 1}</div>
    <div class="keys keys-bind">
      ${ACTIONS.map((a) => {
        const live = binding && binding.side === side && binding.action === a;
        return `<span class="k ${live ? 'live' : ''}" data-action="bind" data-side="${side}" data-key="${a}" role="button" tabindex="0">${live ? 'PRESS A KEY' : esc(keyName(keys[side as 0 | 1][a]))}</span><span>${a.toUpperCase()}</span>`;
      }).join('')}
    </div>`).join('') + `<div class="vault-note">Click a key to rebind. Gamepads: stick or d-pad, A jump, X light, Y heavy, B or RB dodge, LB throw, triggers super, start pauses.</div>`;
}

export function levelLine(p: ClashProfile, id: CharId): string {
  return `LV ${levelOf(p, id)}`;
}

/* --------------------------------------------------------------------------
   Online (real netplay over WebRTC, hand-carried codes)
   -------------------------------------------------------------------------- */

export interface OnlineView {
  role: 'host' | 'guest' | null;
  status: string;
  detail: string;
  invite: string;
  reply: string;
  open: boolean;
  rtt: number;
  peerName: string;
  peerChar: CharId | null;
  name: string;
  char: CharId;
  supported: boolean;
  log: string[];
}

export function onlineHtml(v: OnlineView): string {
  const me = charDef(v.char);
  const peer = v.peerChar ? charDef(v.peerChar) : null;
  const ta = (field: string, value: string, ro: boolean, ph: string) =>
    `<textarea class="code-field" data-online="${field}" ${ro ? 'readonly' : ''} placeholder="${esc(ph)}" spellcheck="false">${esc(value)}</textarea>`;
  const head = `<div class="screen-head"><h1>ONLINE</h1><div class="sub">PEER TO PEER // ROLLBACK // NO SERVER</div></div>`;
  if (!v.supported) {
    return `${head}<div class="vault-note">This browser has no WebRTC. Netplay needs Chrome, Edge, Firefox or Safari.</div>
      <div class="loadout-row"><button class="btn" data-action="title">BACK</button></div>`;
  }
  const status = `<div class="online-status ${v.open ? 'on' : ''}">
      <b>${esc(v.status.toUpperCase())}</b> ${esc(v.detail)}${v.open ? ` · PING ${v.rtt} MS` : ''}
    </div>`;
  const who = `<div class="loadout-row">
      <div class="mini-field"><label>YOU</label><div class="value">${esc(v.name)} · ${esc(me.name)}</div></div>
      <div class="mini-field"><label>THEM</label><div class="value">${peer ? `${esc(v.peerName)} · ${esc(peer.name)}` : '—'}</div></div>
      <div class="mini-field"><label>YOUR NAME</label><div class="value"><input class="num-field text" type="text" maxlength="14" value="${esc(v.name)}" data-online="name"></div></div>
    </div>
    <div class="vault-note">Your fighter is whoever you last picked on the FIGHT screen (${esc(me.name)}). The host picks the stage and the rules.</div>`;
  let body = '';
  if (!v.role) {
    body = `<div class="loadout-row">
        <button class="btn primary" data-action="online-host">HOST A MATCH</button>
        <button class="btn" data-action="online-join">JOIN A MATCH</button>
      </div>
      <div class="vault-note">Host makes an invite code and sends it any way you like. Guest pastes it, sends back the reply code. That is the whole handshake; the fight runs browser to browser.</div>`;
  } else if (v.role === 'host') {
    body = `<div class="section-label">1 // SEND THIS INVITE</div>
      ${ta('invite', v.invite, true, 'Making the invite…')}
      <div class="loadout-row"><button class="btn" data-action="online-copy" data-field="invite">COPY INVITE</button></div>
      <div class="section-label">2 // PASTE THEIR REPLY</div>
      ${ta('reply', v.reply, false, 'Paste the reply code here')}
      <div class="loadout-row">
        <button class="btn primary" data-action="online-accept">CONNECT</button>
        ${v.open ? `<button class="btn primary" data-action="online-start">START THE FIGHT</button>` : ''}
        <button class="btn" data-action="online-leave">LEAVE</button>
      </div>`;
  } else {
    body = `<div class="section-label">1 // PASTE THE INVITE</div>
      ${ta('invite', v.invite, false, 'Paste the host\'s invite code here')}
      <div class="loadout-row"><button class="btn primary" data-action="online-answer">MAKE REPLY</button></div>
      <div class="section-label">2 // SEND THIS REPLY</div>
      ${ta('reply', v.reply, true, 'Your reply code appears here')}
      <div class="loadout-row">
        <button class="btn" data-action="online-copy" data-field="reply">COPY REPLY</button>
        <button class="btn" data-action="online-leave">LEAVE</button>
      </div>
      ${v.open ? `<div class="vault-note">Connected. The host starts the fight.</div>` : ''}`;
  }
  const log = v.log.length ? `<div class="online-log">${v.log.slice(-6).map((l) => `<div>${esc(l)}</div>`).join('')}</div>` : '';
  return `${head}${status}${who}${body}${log}
    <div class="loadout-row"><button class="btn" data-action="title">BACK TO TITLE</button></div>`;
}
