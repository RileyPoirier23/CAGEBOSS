/**
 * QUICK FIGHT: pick any two fighters from the roster and fight it out hands-on.
 * Against the CPU, or local 2-player versus (two controllers, a controller and the
 * keyboard, or both of you on one keyboard). Nothing is saved; nobody's career is touched.
 */
import { Graphics } from 'pixi.js';
import { Scene } from '../app';
import type { Bout, FightEvent, Fighter, GameState } from '../../core/types';
import { PAL } from '../../art/palette';
import { W, H, text, button, box } from '../kit';
import { selector, alertBox } from '../widgets';
import { fighterPortrait } from '../sprites';
import { createNewGame } from '../../sim/newgame';
import { makeBout, officialsFor } from '../../sim/events';
import { DIVISION_ORDER, divisionName } from '../../sim/divisions';
import { overall } from '../../sim/fighters';
import { record } from '../../core/format';
import { content } from '../../core/content';
import { sponsorColor } from '../../sim/sponsorship';
import { openLiveFight } from '../livefight';
import { input } from '../../core/input';
import { Rng } from '../../core/rng';
import type { KeyboardShare } from '../../core/fightinput';
import type { CanvasStyle } from '../arena';
import { sfx } from '../../audio/sfx';

type Mode = 'cpu' | 'versus';
type Plan = 'balanced' | 'pressure' | 'counter' | 'wrestle';

let world: GameState | null = null;
/** A throwaway world with the full roster (built once per session). */
function roster(): GameState {
  if (!world) world = createNewGame({ seed: 1606, mode: 'sandbox', difficulty: 'normal', promotionName: 'Cage Boss Fighting Championship', presidentName: 'Dane Whyte' });
  return world;
}

export class QuickFightScene extends Scene {
  music = 'title' as const;
  private div = 'light';
  private pick: [number, number] = [0, 1];
  private mode: Mode = 'cpu';
  private rounds: 3 | 5 = 3;
  private canvas: CanvasStyle = 'cbfc';
  private cpu: Plan = 'balanced';

  private list(): Fighter[] {
    const s = roster();
    const ranked = (s.rankings[this.div] ?? []).map((id) => s.fighters[id]).filter(Boolean);
    const rest = Object.values(s.fighters)
      .filter((f) => f.division === this.div && f.status !== 'retired' && !ranked.includes(f))
      .sort((a, b) => overall(b.skills) - overall(a.skills));
    return [...ranked, ...rest].slice(0, 40);
  }

  build(): void {
    const r = this.root;
    const bg = new Graphics().rect(0, 0, W, H).fill(0x15121a);
    for (let y = 0; y < H; y += 6) bg.rect(0, y, W, 1).fill({ color: 0x000000, alpha: 0.25 });
    r.addChild(bg);
    r.addChild(text('QUICK FIGHT', 0, 6, { width: W, align: 'center', color: PAL.gold, scale: 2 }));
    r.addChild(text('Any two fighters. No careers on the line. Probably some brain damage.', 0, 24, { width: W, align: 'center', small: true, color: PAL.ash }));
    const fighters = this.list();
    this.pick = [Math.min(this.pick[0], fighters.length - 1), Math.min(this.pick[1], fighters.length - 1)];
    if (this.pick[0] === this.pick[1]) this.pick[1] = (this.pick[0] + 1) % fighters.length;
    // the two corners
    for (const side of [0, 1] as const) {
      const x = side === 0 ? 8 : W - 172;
      const f = fighters[this.pick[side]];
      r.addChild(box(164, 150, PAL.night, side === 0 ? 0x9e2a2a : 0x284a86, { bevel: true })).position.set(x, 36);
      r.addChild(text(side === 0 ? (this.mode === 'versus' ? 'RED CORNER  •  P1' : 'RED CORNER  •  YOU') : this.mode === 'versus' ? 'BLUE CORNER  •  P2' : 'BLUE CORNER  •  CPU', x + 6, 40, { small: true, color: side === 0 ? 0xd86a6a : 0x6a8ad8 }));
      if (!f) continue;
      const por = fighterPortrait(f, 64);
      por.position.set(x + 50, 50);
      r.addChild(por);
      r.addChild(text(`${f.first} ${f.last}`.toUpperCase(), x + 4, 118, { width: 156, align: 'center', color: PAL.bone, maxLines: 1 }));
      r.addChild(text(f.nick ? `"${f.nick}"` : ' ', x + 4, 129, { width: 156, align: 'center', small: true, color: PAL.gold, maxLines: 1 }));
      r.addChild(text(`${record(f.record)}  •  OVR ${Math.round(overall(f.skills))}  •  ${f.country}`, x + 4, 139, { width: 156, align: 'center', small: true, color: PAL.ash, maxLines: 1 }));
      r.addChild(selector(x + 6, 152, 152, fighters.map((x2, i) => ({ value: i, label: `${x2.first[0]}. ${x2.last}` })), this.pick[side], (v) => { this.pick[side] = v; this.refresh(); }));
      r.addChild(button('RANDOM', x + 6, 168, 74, 13, () => { this.pick[side] = Math.floor(Math.random() * fighters.length); this.refresh(); }, { small: true, fill: PAL.shadow }));
      r.addChild(button('VS ANYONE', x + 84, 168, 74, 13, () => this.anyone(side), { small: true, fill: PAL.shadow }));
    }
    // the middle: settings
    const mx = 180;
    const row = (label: string, y: number) => r.addChild(text(label, mx, y + 3, { small: true, color: PAL.ash }));
    row('DIVISION', 40);
    r.addChild(selector(mx + 40, 40, 80, DIVISION_ORDER.map((d) => ({ value: d, label: divisionName(d) })), this.div, (v) => { this.div = v; this.pick = [0, 1]; this.refresh(); }));
    row('PLAYERS', 58);
    r.addChild(selector(mx + 40, 58, 80, [{ value: 'cpu' as Mode, label: '1P vs CPU' }, { value: 'versus' as Mode, label: '2P versus' }], this.mode, (v) => { this.mode = v; this.refresh(); }));
    row('ROUNDS', 76);
    r.addChild(selector(mx + 40, 76, 80, [{ value: 3 as const, label: '3 rounds' }, { value: 5 as const, label: '5 rounds' }], this.rounds, (v) => (this.rounds = v)));
    row('CANVAS', 94);
    r.addChild(selector(mx + 40, 94, 80, [{ value: 'cbfc' as CanvasStyle, label: 'CBFC' }, { value: 'pfl' as CanvasStyle, label: 'The Lounge' }, { value: 'regional' as CanvasStyle, label: 'Regional' }, { value: 'local' as CanvasStyle, label: 'Bingo hall' }, { value: 'bk' as CanvasStyle, label: 'Bareknuckle' }], this.canvas, (v) => (this.canvas = v)));
    if (this.mode === 'cpu') {
      row('CPU PLAN', 112);
      r.addChild(selector(mx + 40, 112, 80, [{ value: 'balanced' as Plan, label: 'Balanced' }, { value: 'pressure' as Plan, label: 'Pressure' }, { value: 'counter' as Plan, label: 'Counter' }, { value: 'wrestle' as Plan, label: 'Wrestle' }], this.cpu, (v) => (this.cpu = v)));
    }
    r.addChild(text(this.controlsNote(), mx, 132, { small: true, width: 120, color: PAL.ash, maxLines: 7 }));
    r.addChild(button('← BACK', 8, H - 20, 60, 14, () => void import('./title').then((m) => this.g.goto(new m.TitleScene(this.g))), { small: true }));
    r.addChild(button('FIGHT!', W / 2 - 50, H - 24, 100, 18, () => this.fight(), { fill: PAL.blood }));
  }

  /** Who plays with what. */
  private assign(): { p1: { pad?: number; kb: KeyboardShare }; p2: { pad?: number; kb: KeyboardShare } } {
    const pads = input.padList().map((p) => p.index);
    if (pads.length >= 2) return { p1: { pad: pads[0], kb: 'full' }, p2: { pad: pads[1], kb: 'none' } };
    if (pads.length === 1) return { p1: { pad: -1, kb: 'full' }, p2: { pad: pads[0], kb: 'none' } };
    return { p1: { pad: -1, kb: 'left' }, p2: { pad: -1, kb: 'right' } };
  }

  private controlsNote(): string {
    if (this.mode === 'cpu') return 'You fight in the red corner with your usual controls. HELP has the full move list.';
    const n = input.padList().length;
    if (n >= 2) return 'P1: controller 1.\nP2: controller 2.\nPlug in a third and nobody cares.';
    if (n === 1) return 'P1: keyboard.\nP2: the controller.\n(Plug in a second controller to give P1 one too.)';
    return 'One keyboard, two people.\nP1: WASD move, J K L punch/kick, I block, Space grab.\nP2: arrows move, , . / punch/kick, R-Shift block, Enter grab.';
  }

  /** Pick a random opponent from any division (silly mismatches welcome). */
  private anyone(side: 0 | 1): void {
    const all = Object.values(roster().fighters).filter((f) => f.status !== 'retired' && !f.division.startsWith('w') === !this.div.startsWith('w'));
    const f = all[Math.floor(Math.random() * all.length)];
    this.div = f.division;
    const l = this.list();
    this.pick[side] = Math.max(0, l.indexOf(f));
    this.refresh();
  }

  private fight(): void {
    const s = roster();
    const l = this.list();
    const A = l[this.pick[0]];
    const B = l[this.pick[1]];
    if (!A || !B || A === B) return alertBox(this.g, 'Pick two fighters', 'Pick two different fighters.');
    sfx('bell');
    const ev: FightEvent = { id: 'qf_' + Date.now(), name: 'CBFC Exhibition', number: null, week: s.week, venue: 'ape_x', region: 'na', card: [], status: 'scheduled', ppv: false, notes: ['started'] };
    const bout: Bout = makeBout(s, ev, A, B, 0, null);
    bout.rounds = this.rounds;
    ev.card.push(bout);
    const rng = new Rng(Date.now() & 0xffffff);
    const sp = rng.sample(content().sponsors, 5).map((x) => x.name.replace(/ \(.*\)$/, ''));
    const off = officialsFor(s, ev, rng);
    const prev = this.g.state;
    this.g.state = s; // the booth and the Butler read the world they're in
    openLiveFight(this.g, {
      bout, A, B, skills: [A.skills, B.skills], player: 0, plan: 'balanced', oppPlan: this.cpu, cutTier: 2, seed: rng.int(1, 1e9),
      event: ev.name, judges: off.judges.map((j) => j.name), referee: off.referee.name,
      sponsors: sp.map((name) => ({ name, color: sponsorColor(name) })), canvas: { style: this.canvas, logo: this.canvas === 'cbfc' ? undefined : this.canvas === 'pfl' ? 'PFL LOUNGE' : this.canvas === 'bk' ? 'BAREKNUCKLE' : 'EXHIBITION' },
      bare: this.canvas === 'bk', state: s, ev, versus: this.mode === 'versus' ? this.assign() : undefined,
      done: (res) => {
        this.g.state = prev;
        const w = res.winner ? s.fighters[res.winner] : null;
        alertBox(this.g, 'RESULT', w ? `${w.first} ${w.last} wins by ${res.method} (${res.detail}), round ${res.round} at ${res.time}.` : `${res.method === 'NC' ? 'No contest' : 'A draw'} (${res.detail}).`, () => this.refresh());
      },
    });
  }
}
