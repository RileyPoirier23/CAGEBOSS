/**
 * Loading screens: a little fighter shadowboxing on the canvas, a progress
 * bar that is mostly theatre, and a tip that is mostly lies.
 */
import { Container, Graphics } from 'pixi.js';
import { PAL } from '../art/palette';
import { W, H, text } from './kit';
import { pixelArtResolution, type PixelText } from './text';
import { POSES, drawRig, lerpRig, type Rig, type Look2, type Pose } from './rig';
import { expandPop } from '../sim/popculture';

const TIPS = [
  'TIP: Fighters who miss weight by 4 lbs "only had water". Check the burrito wrappers.',
  'TIP: Nerm Bean will stop the fight eventually. Eventually.',
  'TIP: A fighter with "Crypto Bro" will pay you back in {pop_app} coins. Do not accept.',
  'TIP: Cutmen are cheap. Faces are not.',
  'TIP: Sandwich Cormier will forget your champion\'s name. Your champion will remember.',
  'TIP: Blow Hogan cannot be stopped. Only redirected toward elk.',
  'TIP: Juiced Butler\'s tux is a size small. By choice.',
  'TIP: Braille Sonnen\'s picks are 50/50. Somehow worse than a coin.',
  'TIP: Bury a document and it stays buried. Until the subpoena.',
  'TIP: The commission notices everything. Doreen notices more.',
  'TIP: A "family emergency" four days before a fight is usually {pop_game}.',
  'TIP: Fighters who stream will say everything on stream. Everything.',
  'TIP: Robberies sell rematches. Rematches sell PPVs. PPVs sell yachts.',
  'TIP: Your owner does not care about legacy. Your owner cares about Q3.',
  'TIP: Never let a heavyweight near the catering before weigh-ins.',
  'TIP: The rulebook is a living document. It is also a weapon.',
  'TIP: {pop_celeb} sitting cageside adds 3% to the gate and 40% to the chaos.',
  'TIP: A loyal fighter will take less money. A mercenary will take your parking space.',
  'TIP: You can sign a replacement on short notice. You cannot sign a replacement for your dignity.',
  'TIP: Leg kicks win fights. Calf kicks win wars. Oblique kicks lose friends.',
  'TIP: The ring card girl walks faster if you pay her more. She does not.',
  'TIP: "Undisclosed injury" means one of three things. Two of them are {pop_food}.',
  'TIP: Promote the trash talker. Pray for the trash talker. Pay the trash talker\'s bail.',
  'TIP: Judges score what they see. Judges see very little.',
  'TIP: Scout before you sign. That "28-0" record includes 19 fights in a barn.',
  'TIP: Every fighter has a prime. Every prime ends. Usually on your card.',
  'TIP: When in doubt, book the rematch and add a Roman numeral.',
  'TIP: Slap leagues make money. So does selling plasma. Think about it.',
  'TIP: The fans want violence. The network wants violence at 9:00 sharp.',
  'TIP: Press conferences are free advertising. Bail is not.',
];

const STATUS = [
  'Taping gloves', 'Waxing Juiced Butler\'s head', 'Bribing judges (allegedly)', 'Calibrating the bathroom scale', 'Hydrating the heavyweights',
  'Mopping the octagon', 'Waking up Nerm Bean', 'Charging Blow Hogan\'s sauna', 'Texting Sandwich Cormier', 'Counting PPV buys (twice)',
  'Hiding the receipts', 'Printing the contracts in 4pt font', 'Rehearsing the 360 spin', 'Finding the ring card', 'Lowering fighter pay',
  'Stretching the cutman', 'Loading {pop_movie} on the jumbotron', 'Restocking {pop_food}',
];

const LOOK: Look2 = {
  skin: 0xc08e64, hairStyle: 2, hairColor: 0x2a1c14, beard: 2, build: 1, trunks: 0x9e2a2a, trim: 0xe8d8b0, glove: 0x6e1a1a,
  stance: 'bouncy', female: false, tattoo: 1,
};

export class LoadingScreen extends Container {
  private g = new Graphics();
  private bar = new Graphics();
  private rig: Rig = { ...POSES.guard };
  private status: PixelText;
  private t = 0;
  private pose: Pose = 'guard';
  private poseT = 0;
  done = false;
  fade = 1;

  constructor(label: string) {
    super();
    this.eventMode = 'static';
    this.hitArea = { contains: () => true };
    const bg = new Graphics().rect(0, 0, W, H).fill(0x0e0b0f);
    for (let y = 0; y < H; y += 3) bg.rect(0, y, W, 1).fill({ color: 0x000000, alpha: 0.25 });
    this.addChild(bg);
    this.addChild(text('CAGE BOSS', 0, 34, { width: W, align: 'center', scale: 3, color: PAL.gold, shadow: PAL.blood }));
    this.addChild(text(label.toUpperCase(), 0, 66, { width: W, align: 'center', color: PAL.bone }));
    this.addChild(this.g, this.bar);
    this.g.cacheAsTexture({ resolution: pixelArtResolution(), antialias: false });
    const tip = expandPop(TIPS[Math.floor(Math.random() * TIPS.length)]);
    this.addChild(text(tip, 40, H - 44, { width: W - 80, align: 'center', color: PAL.ash, small: true, maxLines: 3 }));
    this.status = text('', 0, 196, { width: W, align: 'center', color: PAL.grey, small: true });
    this.addChild(this.status);
  }

  update(dt: number): boolean {
    this.t += dt;
    // shadowboxing loop
    this.poseT -= dt;
    if (this.poseT <= 0) {
      const seq: Pose[] = ['jab', 'guard', 'jab', 'cross', 'guard', 'hook', 'guard', 'legkick', 'guard', 'uppercut', 'guard', 'taunt'];
      this.pose = seq[Math.floor(this.t * 3) % seq.length];
      this.poseT = this.pose === 'guard' ? 0.18 : 0.26;
    }
    this.rig = lerpRig(this.rig, POSES[this.pose], Math.min(1, dt * 18));
    const g = this.g;
    g.clear();
    g.ellipse(W / 2, 176, 26, 4).fill({ color: 0x000000, alpha: 0.5 });
    g.ellipse(W / 2, 176, 60, 8).stroke({ color: PAL.blood, width: 1, alpha: 0.5 });
    drawRig(g, this.rig, Math.round(W / 2 - 6 + Math.sin(this.t * 4) * 2), 176, 1, LOOK, 1.1);
    g.updateCacheTexture();
    // progress bar (theatre)
    const p = this.done ? 1 : Math.min(0.92, 1 - Math.exp(-this.t * 2.2));
    const b = this.bar;
    b.clear();
    b.rect(W / 2 - 90, 186, 180, 6).fill(PAL.shadow).rect(W / 2 - 89, 187, Math.round(178 * p), 4).fill(PAL.blood);
    const st = expandPop(STATUS[Math.floor(this.t * 1.6) % STATUS.length], Math.floor(this.t * 1.6));
    this.status.setText(st + '...');
    if (this.done) {
      this.fade -= dt * 4;
      this.alpha = Math.max(0, this.fade);
    }
    return this.fade > 0;
  }
}
