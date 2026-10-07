/**
 * Fighter Mode: build your fighter. Name, nickname, nationality, division,
 * style and look (live portrait preview), then into the league.
 */
import { Container, Graphics } from 'pixi.js';
import { Scene } from '../app';
import type { Look } from '../../core/types';
import { PAL } from '../../art/palette';
import { W, H, text, button, box } from '../kit';
import { selector, domInput, removeAllDomInputs, bigTitle } from '../widgets';
import { portrait } from '../sprites';
import { content } from '../../core/content';
import { Rng } from '../../core/rng';
import { makeLook } from '../../sim/generate';
import { DIVISION_ORDER, divisionName, DIVISION_LIMITS } from '../../sim/divisions';
import { createFighterGame, type Archetype } from '../../sim/fighter';
import { FMHubScene } from './fmhub';
import { sfx } from '../../audio/sfx';

const COUNTRY_NAMES: Record<string, string> = {
  us_south: 'USA (South)', us_urban: 'USA (East Coast)', us_midwest: 'USA (Midwest)', brazil: 'Brazil', caucasus: 'Dagestan', russia: 'Russia', mexico: 'Mexico',
  uk: 'England', ireland: 'Ireland', poland: 'Poland', nigeria: 'Nigeria', japan: 'Japan', korea: 'South Korea', aus_nz: 'Australia / NZ', china: 'China',
  central_asia: 'Kazakhstan', nordic: 'Sweden', france: 'France', georgia: 'Georgia', philippines: 'Philippines', canada: 'Canada', netherlands: 'Netherlands',
};

const ARCHES: { value: Archetype; label: string; blurb: string }[] = [
  { value: 'striker', label: 'STRIKER', blurb: 'Hands, kicks, footwork. Lives and dies on the feet.' },
  { value: 'wrestler', label: 'WRESTLER', blurb: 'Takedowns, top control, endless cardio. Boring and terrifying.' },
  { value: 'grappler', label: 'SUBMISSION ARTIST', blurb: 'Every scramble is a trap. Taps people from their back.' },
];

export class FMCreateScene extends Scene {
  music = 'title' as const;
  private seed = (Date.now() ^ 0x5bd1e995) >>> 0;
  private first = '';
  private last = '';
  private nick = '';
  private gender: 'M' | 'W' = 'M';
  private culture = 'us_urban';
  private division = 'light';
  private arch: Archetype = 'striker';
  private look: Look;
  private inputs: { remove: () => void }[] = [];
  private preview: Container = new Container();

  constructor(g: ConstructorParameters<typeof Scene>[0]) {
    super(g);
    this.look = this.randomLook();
  }

  private randomLook(): Look {
    const rng = new Rng(this.seed++);
    const cul = content().names.cultures.find((c) => c.id === this.culture) ?? content().names.cultures[0];
    return makeLook(rng, cul, this.gender, this.division);
  }

  build(): void {
    const r = this.root;
    const bg = new Graphics().rect(0, 0, W, H).fill(0x15121a);
    for (let y = 0; y < H; y += 6) bg.rect(0, y, W, 1).fill({ color: 0x000000, alpha: 0.25 });
    r.addChild(bg);
    r.addChild(bigTitle('ROAD TO CHAMPION', 6, PAL.gold));
    r.addChild(text('Build your fighter. Then go take somebody\'s spot.', 0, 26, { width: W, align: 'center', small: true, color: PAL.ash }));

    // left: identity
    const p = new Container();
    p.position.set(10, 40);
    r.addChild(p);
    p.addChild(box(282, 184, PAL.night, PAL.slate, { bevel: true })); // short enough to clear the NOW PLAYING tag
    let y = 8;
    const row = (label: string) => {
      p.addChild(text(label, 8, y + 3, { small: true, color: PAL.ash }));
    };
    row('FIRST NAME');
    y += 17;
    row('LAST NAME');
    y += 17;
    row('NICKNAME');
    y += 19;
    // DOM inputs live on top of the canvas
    this.inputs.forEach((i) => i.remove());
    this.inputs = [
      domInput(this.g, 10 + 84, 40 + 8, 190, 14, this.first, { maxLength: 18, onChange: (v) => (this.first = v) }),
      domInput(this.g, 10 + 84, 40 + 25, 190, 14, this.last, { maxLength: 22, onChange: (v) => (this.last = v) }),
      domInput(this.g, 10 + 84, 40 + 42, 190, 14, this.nick, { maxLength: 22, onChange: (v) => (this.nick = v) }),
    ];
    row('FROM');
    p.addChild(selector(84, y, 190, content().names.cultures.map((c) => ({ value: c.id, label: COUNTRY_NAMES[c.id] ?? c.id })), this.culture, (v) => { this.culture = v; this.look = this.randomLook(); this.drawPreview(); }));
    y += 17;
    row('DIVISION');
    const divs = DIVISION_ORDER.filter((d) => (this.gender === 'W') === d.startsWith('w'));
    if (!divs.includes(this.division)) this.division = divs[0];
    p.addChild(selector(84, y, 190, divs.map((d) => ({ value: d, label: `${divisionName(d)} (${DIVISION_LIMITS[d]})` })), this.division, (v) => (this.division = v)));
    y += 17;
    row('LEAGUE');
    p.addChild(selector(84, y, 190, [{ value: 'M' as const, label: "Men's" }, { value: 'W' as const, label: "Women's" }], this.gender, (v) => { this.gender = v; this.look = this.randomLook(); this.refresh(); }));
    y += 19;
    row('STYLE');
    p.addChild(selector(84, y, 190, ARCHES.map((a) => ({ value: a.value, label: a.label })), this.arch, (v) => { this.arch = v; this.refresh(); }));
    y += 16;
    p.addChild(text(ARCHES.find((a) => a.value === this.arch)!.blurb, 84, y, { small: true, width: 190, color: PAL.bone, maxLines: 2 }));
    y += 22;
    p.addChild(text('You start 0-0 in a junk local promotion with $2,500 and a cousin who says he can corner. Win belts to move up: regional shows, the PFL Lounge, then the CBFC.', 8, y, { small: true, width: 266, color: PAL.ash, maxLines: 3 }));

    // right: look
    const q = new Container();
    q.position.set(300, 40);
    r.addChild(q);
    q.addChild(box(170, 206, PAL.night, PAL.slate, { bevel: true }));
    this.preview = new Container(); // the old one was destroyed with the last build
    this.preview.position.set(53, 8);
    q.addChild(this.preview);
    this.drawPreview();
    let ly = 76;
    const lk = (label: string, key: keyof Look, max: number) => {
      q.addChild(text(label, 8, ly + 3, { small: true, color: PAL.ash }));
      const opts = Array.from({ length: max + 1 }, (_, i) => ({ value: i, label: String(i + 1) }));
      q.addChild(selector(62, ly, 100, opts, (this.look[key] as number) ?? 0, (v) => { (this.look as unknown as Record<string, number>)[key] = v; this.drawPreview(); }));
      ly += 13;
    };
    lk('SKIN', 'skin', 7);
    lk('HAIR', 'hair', 7);
    lk('HAIR COL.', 'hairColor', 7);
    if (this.gender === 'M') lk('BEARD', 'beard', 4);
    lk('BROWS', 'brows', 2);
    lk('NOSE', 'nose', 2);
    lk('TATTOOS', 'tattoo', 3);
    lk('BUILD', 'build', 2);
    q.addChild(button('RANDOMISE', 8, 188, 154, 13, () => { this.look = this.randomLook(); sfx('click'); this.refresh(); }, { small: true, fill: PAL.steel }));

    r.addChild(button('← BACK', 10, H - 20, 60, 14, () => { this.exit(); void import('./title').then((m) => this.g.goto(new m.TitleScene(this.g))); }, { small: true }));
    r.addChild(button('STEP INTO THE CAGE →', W - 160, H - 21, 150, 16, () => this.start(), { fill: PAL.blood }));
  }

  private drawPreview(): void {
    if (this.preview.destroyed) return;
    this.preview.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.preview.addChild(portrait({ id: 'player-preview', look: this.look, gender: this.gender, age: 23, variant: 'plain', attire: 'shirtless' }, 64));
  }

  private start(): void {
    const first = this.first.trim();
    const last = this.last.trim();
    if (!last) return this.g.toast('Every fighter needs a last name. It goes on the shorts.', PAL.ember);
    this.exit();
    this.g.loading('Signing your contract', () => {
      const s = createFighterGame({ seed: this.seed, first, last, nick: this.nick.trim(), gender: this.gender, culture: this.culture, division: this.division, archetype: this.arch, look: this.look });
      this.g.state = s;
      this.g.goto(new FMHubScene(this.g));
      this.g.autosave();
    }, 1.2);
  }

  exit(): void {
    this.inputs.forEach((i) => i.remove());
    this.inputs = [];
    removeAllDomInputs();
  }
}
