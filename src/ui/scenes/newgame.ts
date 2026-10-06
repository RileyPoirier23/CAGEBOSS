/**
 * New Career / Sandbox setup.
 */
import { Container } from 'pixi.js';
import { Scene, Game, fullBg } from '../app';
import { PAL } from '../../art/palette';
import { W, text, button, box } from '../kit';
import { selector, stepper, checkbox, domInput, removeAllDomInputs, bigTitle } from '../widgets';
import type { Difficulty, GameMode, SandboxOptions } from '../../core/types';
import { createNewGame, DEFAULT_SANDBOX } from '../../sim/newgame';
import { startWeek } from '../../sim/week';
import { routePhase } from '../flow';
import { TitleScene } from './title';
import { money } from '../../core/format';

const PROMO_NAMES = [
  'Cage Boss Fighting Championship', 'Ultimate Brawling Federation', 'Knuckle Sandwich Combat League', 'Apex Predator Fighting',
  'Blood Money MMA', 'Concussion Nation FC', 'Thunderdome Combat Series', 'Hostile Takeover FC',
];

export class NewGameScene extends Scene {
  private promo = PROMO_NAMES[Math.floor(Math.random() * PROMO_NAMES.length)];
  private pres = 'Dane Whyte';
  private seed = Math.floor(Math.random() * 1e9);
  private difficulty: Difficulty = 'normal';
  private sb: SandboxOptions = { ...DEFAULT_SANDBOX };
  private inputs: { remove: () => void; value: () => string }[] = [];

  constructor(
    g: Game,
    private mode: GameMode,
  ) {
    super(g);
  }

  build(): void {
    const r = this.root;
    r.addChild(fullBg(0x17141a));
    r.addChild(bigTitle(this.mode === 'career' ? 'NEW CAREER' : 'SANDBOX', 8, PAL.gold));
    const panel = new Container();
    panel.x = 20;
    panel.y = 34;
    r.addChild(panel);
    panel.addChild(box(W - 40, 196, PAL.night, PAL.slate, { bevel: true }));
    let y = 8;
    panel.addChild(text('Promotion name', 8, y + 3, { color: PAL.ash }));
    panel.addChild(text('President', 8, y + 21, { color: PAL.ash }));
    this.inputs.forEach((i) => i.remove());
    this.inputs = [
      domInput(this.g, panel.x + 110, panel.y + y, 220, 14, this.promo, { maxLength: 40, onChange: (v) => (this.promo = v) }),
      domInput(this.g, panel.x + 110, panel.y + y + 18, 220, 14, this.pres, { maxLength: 30, onChange: (v) => (this.pres = v) }),
    ];
    y += 38;
    panel.addChild(text('Difficulty', 8, y + 3, { color: PAL.ash }));
    panel.addChild(selector(110, y, 220, [
      { value: 'easy', label: 'Easy - more money, lenient citations' },
      { value: 'normal', label: 'Normal' },
      { value: 'fightweek', label: 'Fight Week - strict & fast' },
      { value: 'ironman', label: 'Ironman - one save, no take-backs' },
    ], this.difficulty, (v) => (this.difficulty = v as Difficulty)));
    y += 17;
    panel.addChild(text('Seed', 8, y + 3, { color: PAL.ash }));
    const seedLabel = text(String(this.seed), 110, y + 3, { color: PAL.bone });
    panel.addChild(seedLabel);
    panel.addChild(button('REROLL', 220, y, 50, 13, () => {
      this.seed = Math.floor(Math.random() * 1e9);
      seedLabel.setText(String(this.seed));
    }, { small: true }));
    y += 20;
    if (this.mode === 'sandbox') this.buildSandbox(panel, y);
    else {
      panel.addChild(text(
        'Act I - The Bus Tour.\nYou just bought a bankrupt cage-fighting league for the price of a used Kia and a handshake with a conglomerate you\'ve never met. ' +
        'The fighters are shady, the venues smell like feet, and the bank wants its money. Land a cable TV deal before it all falls apart.',
        8, y, { width: W - 56, color: PAL.fog }));
    }
    r.addChild(button('< BACK', 20, 240, 60, 16, () => this.g.goto(new TitleScene(this.g)), { fill: PAL.shadow }));
    r.addChild(button('START', W - 100, 240, 80, 16, () => this.start(), { fill: PAL.blood }));
  }

  private buildSandbox(panel: Container, y: number): void {
    const sb = this.sb;
    panel.addChild(text('Scenario', 8, y + 3, { color: PAL.ash }));
    panel.addChild(selector(110, y, 300, [
      { value: 'tiny', label: 'Tiny league (Act I start)' },
      { value: 'midtier', label: 'Established mid-tier promotion' },
      { value: 'giant', label: 'The dominant giant' },
      { value: 'strike', label: 'Just bought the giant... union about to strike' },
    ], sb.scenario, (v) => (sb.scenario = v as SandboxOptions['scenario'])));
    y += 16;
    const col = (x: number, yy: number, label: string, v: number, min: number, max: number, step: number, fmt: (n: number) => string, set: (n: number) => void) => {
      panel.addChild(text(label, x, yy + 3, { color: PAL.ash, small: true }));
      panel.addChild(stepper(x + 74, yy, 120, v, min, max, step, fmt, set));
    };
    const pct = (n: number) => Math.round(n * 100) + '%';
    col(8, y, 'START CASH', sb.startCash, 50000, 50000000, 50000, (n) => money(n), (n) => (sb.startCash = n));
    col(212, y, 'SCANDALS', sb.scandalFreq, 0, 2, 0.25, pct, (n) => (sb.scandalFreq = n));
    y += 15;
    col(8, y, 'CHAOS', sb.chaos, 0, 100, 10, String, (n) => (sb.chaos = n));
    col(212, y, 'SIM REALISM', sb.simRealism, 0, 1, 0.1, pct, (n) => (sb.simRealism = n));
    y += 15;
    col(8, y, 'FIGHTER GREED', sb.greed, 0.5, 2, 0.25, pct, (n) => (sb.greed = n));
    col(212, y, 'MEDIA HOSTILITY', sb.mediaHostility, 0, 2, 0.25, pct, (n) => (sb.mediaHostility = n));
    y += 15;
    col(8, y, 'STRICTNESS', sb.strictness, 0, 2, 0.25, pct, (n) => (sb.strictness = n));
    col(212, y, 'RIVAL AGGRO', sb.rivalAggression, 0, 2, 0.25, pct, (n) => (sb.rivalAggression = n));
    y += 18;
    panel.addChild(checkbox(8, y, 'No corporate owner', sb.noOwner, (v) => (sb.noOwner = v)));
    panel.addChild(checkbox(150, y, 'Infinite years', sb.infinite, (v) => (sb.infinite = v)));
    panel.addChild(checkbox(280, y, 'All legends active', sb.allLegends, (v) => (sb.allLegends = v)));
    y += 14;
    panel.addChild(checkbox(8, y, 'Dream matches (cross-era)', sb.dreamMatches, (v) => (sb.dreamMatches = v)));
    panel.addChild(checkbox(220, y, 'God mode (edit anything)', sb.godMode, (v) => (sb.godMode = v)));
  }

  private start(): void {
    this.exit();
    this.g.loading('Building your promotion', () => {
      const s = createNewGame({
        seed: this.seed,
        mode: this.mode,
        difficulty: this.difficulty,
        promotionName: this.promo.trim() || PROMO_NAMES[0],
        presidentName: this.pres.trim() || 'Dane Whyte',
        sandbox: this.mode === 'sandbox' ? this.sb : undefined,
      });
      startWeek(s);
      this.g.state = s;
      routePhase(this.g, true);
      this.g.autosave();
    }, 1.4);
  }

  exit(): void {
    this.inputs.forEach((i) => i.remove());
    this.inputs = [];
    removeAllDomInputs();
  }
}
