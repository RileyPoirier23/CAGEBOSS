/**
 * The Tuesday Night Contender Series: a card of generated prospects in the
 * TV studio. Watch (reuses the fight-night arena) or sim, then decide who
 * gets a contract. Winners you pass on (and the losers) can come back later.
 */
import { Container, Graphics } from 'pixi.js';
import { Scene, fullBg } from '../app';
import type { Game } from '../app';
import type { Fighter } from '../../core/types';
import { PAL, shade } from '../../art/palette';
import { W, H, text, button, box } from '../kit';
import { fighterPortrait } from '../sprites';
import { money, record } from '../../core/format';
import { sfx } from '../../audio/sfx';
import { Rng } from '../../core/rng';
import { content } from '../../core/content';
import { routePhase } from '../flow';
import { FightNightScene } from './fightnight';
import { fullName, seenOverall, seenPotential, grade, pronounize } from '../../sim/fighters';
import { divisionName } from '../../sim/divisions';
import { quickOdds, oddsString } from '../../sim/fight';
import {
  ensureCareer, finishContender, runContenderHeadless, offerContenderContract, contenderOfferPurse, hasUnlock,
} from '../../sim/career';
import { isMexican } from '../../sim/oneton';

const SIGNED_LINES = [
  '"I\'m gonna cry. I\'m crying. Mom, I\'m on TV crying. Turn it off. No, record it."',
  '"I quit my job at the tire shop this morning. Before the fight. That was a gamble, huh?"',
  '"I\'ve been waiting my whole life for this phone call. Is it a phone call? It\'s a guy in a suit. Even better."',
  '"I promise you will not regret this, sir. My cardio is a renewable resource."',
  '"Can I hug you? I\'m hugging you. I\'m still a little sweaty. A lot sweaty."',
  '"Every one of my exes said I\'d never make it. Ladies: I made it."',
  '"I\'m gonna buy my mom a house. A small one. A condo. Okay, a nice couch."',
  '"{He} drops to {his} knees, then gets up because the floor is sticky."',
];

export class ContenderScene extends Scene {
  music = 'fightnight' as const;
  private offers = false;

  constructor(g: Game, offers = false) {
    super(g);
    this.offers = offers;
  }

  enter(): void {
    const s = this.g.state!;
    const ev = ensureCareer(s).contender.event;
    if (ev && ev.card.every((b) => b.status !== 'scheduled')) {
      finishContender(s);
      this.offers = true;
    }
    super.enter();
  }

  private studio(): void {
    const r = this.root;
    r.addChild(fullBg(0x0c0e16));
    const g = new Graphics();
    // LED wall
    for (let x = 0; x < W; x += 12) for (let y = 0; y < 44; y += 6) g.rect(x + 1, y + 1, 10, 4).fill({ color: (x / 12 + y / 6) % 5 === 0 ? 0x2a4a8a : 0x161c30, alpha: 1 });
    g.rect(0, 44, W, 2).fill(PAL.gold);
    // studio floor
    for (let y = 230; y < H; y += 4) g.rect(0, y, W, 2).fill({ color: 0x1a1d2a, alpha: 0.8 });
    r.addChild(g);
  }

  build(): void {
    const s = this.g.state!;
    const ev = ensureCareer(s).contender.event;
    this.studio();
    const r = this.root;
    r.addChild(text('TUESDAY NIGHT CONTENDER SERIES', 0, 6, { width: W, align: 'center', scale: 2, color: PAL.gold, shadow: PAL.ink }));
    if (!ev) {
      r.addChild(text('No card this week.', 0, 80, { width: W, align: 'center', color: PAL.ash }));
      r.addChild(button('DONE →', W - 96, H - 24, 88, 18, () => routePhase(this.g), { fill: PAL.blood }));
      return;
    }
    const v = content().venues.find((x) => x.id === ev.venue);
    r.addChild(text(`${ev.name.toUpperCase()}  •  ${v?.name ?? 'THE STUDIO'}  •  WIN AND YOU'RE IN. LOSE AND YOU'RE IN DEBT.`, 0, 27, { width: W, align: 'center', small: true, color: PAL.fog }));
    if (this.offers) this.buildOffers();
    else this.buildCard();
  }

  private fighterBlock(f: Fighter, x: number, y: number, right: boolean, returning: boolean): void {
    const r = this.root;
    const p = fighterPortrait(f, 32, 'plain');
    p.position.set(right ? x - 32 : x, y);
    r.addChild(p);
    const tx = right ? x - 36 - 150 : x + 36;
    const align = right ? 'right' : 'left';
    r.addChild(text(fullName(f).toUpperCase(), tx, y, { width: 150, align, color: PAL.bone, maxLines: 1 }));
    r.addChild(text(`"${f.nick}"  •  ${record(f.record)}  •  ${f.age}  •  ${f.country}`, tx, y + 10, { width: 150, align, small: true, color: PAL.ash, maxLines: 1 }));
    r.addChild(text(`SKILL ${grade(seenOverall(f))}  •  POT ${seenPotential(f)}`, tx, y + 18, { width: 150, align, small: true, color: PAL.gold, maxLines: 1 }));
    const tags = [returning ? 'BACK FOR REDEMPTION' : '', isMexican(f) ? '1TON IS WATCHING' : ''].filter(Boolean).join('  •  ');
    if (tags) r.addChild(text(tags, tx, y + 26, { width: 150, align, small: true, color: PAL.ember, maxLines: 1 }));
  }

  private buildCard(): void {
    const s = this.g.state!;
    const c = ensureCareer(s);
    const ev = c.contender.event!;
    const r = this.root;
    const bouts = ev.card.filter((b) => b.status !== 'cancelled').sort((a, b) => b.position - a.position);
    bouts.forEach((b, i) => {
      const y = 50 + i * 58;
      const A = s.fighters[b.a];
      const B = s.fighters[b.b];
      if (!A || !B) return;
      r.addChild(box(W - 16, 54, i % 2 ? 0x1a1d2a : 0x20243a, shade(PAL.gold, -0.4))).position.set(8, y);
      const back = (f: Fighter) => f.careerLog.filter((l) => l.includes('Contender Series')).length > 1;
      this.fighterBlock(A, 16, y + 6, false, back(A));
      this.fighterBlock(B, W - 16, y + 6, true, back(B));
      r.addChild(text('VS', 0, y + 10, { width: W, align: 'center', color: PAL.blood, scale: 2 }));
      const p = quickOdds(A, B);
      r.addChild(text(`${divisionName(b.division).toUpperCase()}\n3 ROUNDS  •  ${oddsString(p)} / ${oddsString(1 - p)}`, W / 2 - 60, y + 30, { width: 120, align: 'center', small: true, color: PAL.ash }));
      if (b.status === 'done' && b.result) {
        const w = b.result.winner ? s.fighters[b.result.winner] : null;
        r.addChild(text(w ? `${w.last.toUpperCase()} BY ${b.result.method}` : b.result.method, W / 2 - 60, y + 46, { width: 120, align: 'center', small: true, color: PAL.moss }));
      }
    });
    r.addChild(text(hasUnlock(s, 'scouting') ? 'Your scouts filed reports on everyone.' : 'No scouting department yet: what you see is what you get.', 8, H - 36, { small: true, color: PAL.grey, width: 260 }));
    r.addChild(button('SIM THE CARD', 8, H - 24, 100, 18, () => {
      const rng = new Rng(s.rng);
      runContenderHeadless(s, rng);
      s.rng = rng.state;
      sfx('bell');
      this.offers = true;
      this.refresh();
    }, { fill: PAL.slate }));
    r.addChild(button('WATCH THE SHOW →', W - 138, H - 24, 130, 18, () => {
      sfx('roar');
      this.g.goto(new FightNightScene(this.g, ev.id, { event: ev, onWrap: () => this.g.goto(new ContenderScene(this.g, true)) }));
    }, { fill: PAL.blood }));
  }

  private buildOffers(): void {
    const s = this.g.state!;
    const c = ensureCareer(s);
    const ev = c.contender.event!;
    const r = this.root;
    finishContender(s);
    r.addChild(text('DECISION TIME: WHO GETS A CONTRACT?', 0, 52, { width: W, align: 'center', color: PAL.bone }));
    const done = ev.card.filter((b) => b.status === 'done' && b.result);
    const winners = done.map((b) => b.result!.winner).filter((x): x is string => !!x);
    const cw = 148;
    const x0 = Math.round((W - winners.length * (cw + 6)) / 2);
    winners.forEach((id, i) => {
      const f = s.fighters[id];
      if (!f) return;
      const b = done.find((x) => x.result!.winner === id)!;
      const x = x0 + i * (cw + 6);
      const y = 64;
      const signed = c.contender.signed.includes(id);
      const open = c.contender.winners.includes(id);
      r.addChild(box(cw, 150, signed ? 0x203a28 : 0x1a1d2a, signed ? PAL.moss : PAL.gold, { bevel: true })).position.set(x, y);
      const p = fighterPortrait(f, 64, signed ? 'press' : 'plain');
      p.position.set(x + (cw - 64) / 2, y + 6);
      r.addChild(p);
      r.addChild(text(fullName(f).toUpperCase(), x + 4, y + 74, { width: cw - 8, align: 'center', color: PAL.bone, maxLines: 1 }));
      r.addChild(text(`${record(f.record)}  •  ${divisionName(f.division)}`, x + 4, y + 85, { width: cw - 8, align: 'center', small: true, color: PAL.ash, maxLines: 1 }));
      r.addChild(text(`WON BY ${b.result!.method} (R${b.result!.round})`, x + 4, y + 93, { width: cw - 8, align: 'center', small: true, color: PAL.moss, maxLines: 1 }));
      r.addChild(text(`SKILL ${grade(seenOverall(f))}  •  POTENTIAL ${seenPotential(f)}`, x + 4, y + 101, { width: cw - 8, align: 'center', small: true, color: PAL.gold, maxLines: 1 }));
      const purse = contenderOfferPurse(s, f);
      r.addChild(text(`3 FIGHTS @ ${money(purse)} + ${money(purse)} WIN`, x + 4, y + 111, { width: cw - 8, align: 'center', small: true, color: PAL.fog, maxLines: 1 }));
      if (signed) r.addChild(text('SIGNED ✓', x + 4, y + 128, { width: cw - 8, align: 'center', color: PAL.moss }));
      else if (open) r.addChild(button('OFFER A CONTRACT', x + 8, y + 126, cw - 16, 16, () => this.sign(f), { fill: PAL.moss }));
      else r.addChild(text('WENT HOME', x + 4, y + 128, { width: cw - 8, align: 'center', color: PAL.grey }));
    });
    const losers = done.map((b) => b.result!.loser).filter((x): x is string => !!x).map((id) => s.fighters[id]?.last).filter(Boolean);
    if (losers.length) r.addChild(text(`Better luck next time: ${losers.join(', ')}. They can come back on a later card.`, 8, H - 40, { small: true, color: PAL.ash, width: W - 120, maxLines: 2 }));
    r.addChild(button('DONE →', W - 96, H - 24, 88, 18, () => {
      sfx('click');
      routePhase(this.g);
    }, { fill: PAL.blood }));
  }

  /** "You got a contract!" */
  private sign(f: Fighter): void {
    const s = this.g.state!;
    if (!offerContenderContract(s, f.id)) return;
    sfx('stamp');
    this.g.shake(3, 0.3);
    const frame = new Container();
    const wrap = this.g.modal(frame, { dim: 0.7 });
    const bw = 300;
    const bh = 150;
    const bx = (W - bw) / 2;
    const by = (H - bh) / 2;
    frame.addChild(box(bw, bh, PAL.ink, PAL.gold, { shadow: true, bevel: true })).position.set(bx, by);
    const p = fighterPortrait(f, 64, 'press');
    p.position.set(bx + 10, by + 30);
    frame.addChild(p);
    const stamp = text("YOU'RE IN!", 0, 0, { scale: 3, color: PAL.gold, shadow: PAL.blood });
    stamp.position.set(bx + bw / 2 - stamp.textWidth * 1.5 + 30, by + 8);
    frame.addChild(stamp);
    frame.addChild(text(`${fullName(f).toUpperCase()} GOT A CONTRACT!`, bx + 82, by + 40, { width: bw - 92, color: PAL.bone, maxLines: 2 }));
    const rng = new Rng(s.rng ^ 0x51a);
    frame.addChild(text(pronounize(rng.pick(SIGNED_LINES), f), bx + 82, by + 62, { width: bw - 92, small: true, color: PAL.fog, maxLines: 5 }));
    frame.addChild(button('WELCOME ABOARD →', bx + bw - 118, by + bh - 20, 110, 14, () => {
      this.g.closeModal(wrap);
      this.refresh();
    }, { fill: PAL.moss }));
    sfx('roar');
  }
}
