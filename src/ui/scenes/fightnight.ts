/**
 * Fight Night: faceoffs -> pre-fight press conference -> the card (watch or
 * sim each bout) -> post-fight interviews & fight-night chaos -> performance
 * bonuses -> post-fight presser -> ledger.
 */
import type { FightOpts } from '../../sim/fight';
import { Container, Graphics } from 'pixi.js';
import { Scene, Game, fullBg } from '../app';
import type { Bout, FightEvent, TickerLine, EventFinancials } from '../../core/types';
import { PostFightPresser } from '../presser';
import { eventSponsors, sponsorColor } from '../../sim/sponsorship';
import { setMusicContext, walkoutFor } from '../../audio/music';
import { NewsRecap } from '../newsrecap';
import { PAL, shade } from '../../art/palette';
import { W, H, text, button, box, ScrollBox, paper, clickable } from '../kit';
import { PixelText } from '../text';
import { fighterPortrait, reporterPortrait } from '../sprites';
import { ArenaView, cornerView, RingCardWalk, preloadRingCards, AW, AH } from '../arena';
import { BleetFeed } from '../bleetfeed';
import { TaleOfTape } from '../taleoftape';
import { bleetSituation, makeBleet } from '../../sim/bleets';
import { boothOpen, commentate, butlerIntro, butlerDecision, butlerFinish, weighInWeight, type AnnounceLine } from '../../sim/commentary';
import { runBout, applyBout, finalizeEvent, defaultBonuses, bonusAmount, autoFixCard, boutLabel, boutTitle, rematchTag, cardDraw, cardProblems } from '../../sim/events';
import { resolveCardProblems } from '../replace';
import { fireCategory } from '../../storylets/engine';
import { playStorylet } from '../dialog';
import { Rng } from '../../core/rng';
import { content } from '../../core/content';
import { money, record } from '../../core/format';
import { fullName, pronounize } from '../../sim/fighters';
import { rankLabel } from '../../sim/rankings';
import { routePhase } from '../flow';
import { sfx } from '../../audio/sfx';
import { fmtFightDate } from '../../core/time';
import { quickOdds, oddsString } from '../../sim/fight';

type Step = 'intro' | 'card' | 'watch' | 'bonus' | 'presser' | 'recap' | 'done';

const INTERVIEW: Record<string, string[]> = {
  win_ko: [
    'I told everybody! I TOLD everybody! Lights out, baby!',
    'I felt it land and I knew he was going to sleep. Goodnight, sweet prince.',
    'I want to thank God, my coach, and the guy who sold me that pre-workout. It\'s probably legal.',
    'That right hand has been sitting in my back pocket for six weeks. Felt good to finally use it.',
  ],
  win_sub: [
    'I caught that neck and I wasn\'t letting go. Not today.',
    'Jiu-jitsu is a beautiful art. Strangling people is also a beautiful art.',
    'He tapped. He knows he tapped. Everybody saw him tap.',
  ],
  win_dec: [
    'I would\'ve liked the finish, but a W is a W. My accountant doesn\'t care how.',
    'He was tough, man. Tougher than I thought. My face agrees.',
    'Three rounds of hell. I need a cheeseburger and a CAT scan, in that order.',
  ],
  win_other: ['A win is a win. We\'ll take it and go home.', 'Not how I wanted it to end, but I\'ll take the money.'],
  loss: [
    'I\'ll be back. I gotta go see a doctor first. Several doctors.',
    'No excuses. ...Okay, one excuse: I had food poisoning. Don\'t fact check that.',
    'I\'m gonna watch the tape, learn, and come back. Then probably watch it again and cry.',
  ],
  robbed: ['I won that fight. Everyone in the building knows I won that fight. The judges need glasses AND a lobotomy.'],
  callout: [
    'And {opp}? Yeah, YOU. You\'ve been running your mouth. Let\'s go. Next card.',
    'Hey {president}! Give me {opp}! I\'ll do it for free! (Don\'t actually make me do it for free.)',
    'I want the belt. I want the money. I want {opp}. In that order.',
  ],
};

const CAM_NAMES: Record<string, string> = { side: 'WIDE', tv: 'TV', top: 'TOP-DOWN' };

/** Fighter Mode hooks: your gameplan/corner feed the sim; the corner break is played by you. */
export interface FightNightFM {
  player: string;
  extra: () => Partial<FightOpts>;
  corner: (round: number, bout: Bout, done: () => void) => void;
  /** hands-on: play the player's bout yourself; call done once bout.result is set */
  live?: (bout: Bout, done: () => void) => void;
  /** another bout on the card finished (cageside reactions) */
  after?: (bout: Bout) => void;
}

export class FightNightScene extends Scene {
  tutorialKey = 'fightnight';
  music = 'fightnight' as const;
  private step: Step = 'intro';
  private ev: FightEvent;
  private arena: ArenaView | null = null;
  private playing: {
    bout: Bout; lines: TickerLine[]; idx: number; timer: number; paused: boolean;
    simRng: number; seed: number; fmDone: number[];
    phase: 'intro' | 'fight' | 'corner' | 'ringcard' | 'end' | 'ceremony'; phaseT: number;
    ringcard: RingCardWalk | null; corner: Container | null;
    intro: AnnounceLine[]; introIdx: number; cer: AnnounceLine[]; cerIdx: number; cerWinner: -1 | 0 | 1; raised: boolean;
  } | null = null;
  private subtitle: Container | null = null;
  private bleetFeed: BleetFeed | null = null;
  private tape: TaleOfTape | null = null;
  private tapeShown = false;
  private bleetQueue: { at: number; sit: string; actor: 0 | 1 }[] = [];
  private bleetClock = 0;
  private tickerBox: Container | null = null;
  private ctrlBar: Container | null = null;
  private bonusSel = new Set<string>();
  private presserView: PostFightPresser | null = null;
  private prePresser: PostFightPresser | null = null;
  private recapView: NewsRecap | null = null;
  private pressersDone = 0;

  /** opts.event: an event that isn't in state.events (Contender Series); opts.onWrap replaces bonuses/presser/ledger. */
  constructor(g: Game, evId: string, private opts: { event?: FightEvent; onWrap?: () => void; fm?: FightNightFM } = {}) {
    super(g);
    this.ev = opts.event ?? g.state!.events.find((e) => e.id === evId)!;
  }

  enter(): void {
    const s = this.g.state!;
    const fresh = !this.ev.notes.includes('started');
    if (!fresh && !this.opts.onWrap) autoFixCard(s, this.ev);
    this.settleStep();
    super.enter();
    // late withdrawals: the boss picks the short-notice replacements
    // Fighter Mode: you're not the promoter; the matchmaker sorts out withdrawals
    if (fresh && this.opts.fm && cardProblems(s, this.ev).length) autoFixCard(s, this.ev);
    else if (fresh && cardProblems(s, this.ev).length) {
      resolveCardProblems(this.g, this.ev, () => {
        this.settleStep();
        this.refresh();
      });
    }
  }

  private settleStep(): void {
    if (this.ev.card.every((b) => b.status !== 'scheduled')) this.step = this.ev.card.some((b) => b.status === 'done') ? 'bonus' : 'done';
    else if (this.ev.notes.includes('started')) this.step = 'card';
  }

  build(): void {
    const r = this.root;
    r.addChild(fullBg(0x120e14));
    if (this.opts.onWrap && (this.step === 'bonus' || this.step === 'presser' || this.step === 'recap' || this.step === 'done')) {
      const done = this.opts.onWrap;
      this.opts.onWrap = undefined;
      return void setTimeout(done, 0);
    }
    switch (this.step) {
      case 'intro': return this.buildIntro();
      case 'card': return this.buildCard();
      case 'watch': return this.buildWatch();
      case 'bonus': return this.buildBonus();
      case 'presser': return this.buildPresser();
      case 'recap': return this.buildRecap();
      case 'done': return this.finish();
    }
  }

  private live(): Bout[] {
    return this.ev.card.filter((b) => b.status !== 'cancelled').sort((a, b) => a.position - b.position);
  }

  // ------------------------------------------------------------ intro
  private buildIntro(): void {
    const s = this.g.state!;
    const r = this.root;
    const v = content().venues.find((x) => x.id === this.ev.venue);
    r.addChild(text(this.ev.name.toUpperCase(), 0, 8, { width: W, align: 'center', scale: 2, color: PAL.gold, shadow: PAL.ink }));
    if (this.ev.presentedBy) r.addChild(text(`PRESENTED BY ${this.ev.presentedBy.toUpperCase()}`, 0, 22, { width: W, align: 'center', small: true, color: sponsorColor(this.ev.presentedBy) }));
    r.addChild(text(`${fmtFightDate(this.ev.week)}  •  ${v?.name ?? this.ev.venue}  •  ${this.ev.ppv ? 'LIVE ON PAY-PER-VIEW' : 'LIVE ON TV'}`, 0, 28, { width: W, align: 'center', color: PAL.ash, small: true }));
    const main = this.live()[0];
    if (main) {
      const A = s.fighters[main.a];
      const B = s.fighters[main.b];
      r.addChild(text('MAIN EVENT FACEOFF', 0, 42, { width: W, align: 'center', color: PAL.blood }));
      const pa = fighterPortrait(A, 64, 'press');
      pa.position.set(120, 56);
      r.addChild(pa);
      const pb = fighterPortrait(B, 64, 'press');
      pb.position.set(W - 184, 56);
      pb.scale.x = -1;
      pb.x += 64;
      r.addChild(pb);
      r.addChild(text('VS', 0, 80, { width: W, align: 'center', scale: 2, color: PAL.blood }));
      r.addChild(text(`${fullName(A)}\n${record(A.record)}  ${rankLabel(s, A.id)}`, 8, 70, { width: 108, color: PAL.bone, small: true, align: 'right' }));
      r.addChild(text(`${fullName(B)}\n${record(B.record)}  ${rankLabel(s, B.id)}`, W - 116, 70, { width: 108, color: PAL.bone, small: true }));
      r.addChild(text(boutLabel(s, main), 0, 124, { width: W, align: 'center', color: PAL.gold, small: true }));
      const p = quickOdds(A, B);
      r.addChild(text(`ODDS ${oddsString(p)} / ${oddsString(1 - p)}  •  CARD DRAW ${Math.round(cardDraw(s, this.ev))}`, 0, 132, { width: W, align: 'center', color: PAL.ash, small: true }));
    }
    const card = this.live();
    card.slice(1, 7).forEach((b, i) => {
      r.addChild(text(`${boutTitle(s, b)}${b.title ? ' ★' : ''}${b.shortNotice ? ' (short notice)' : ''}`, 0, 146 + i * 9, { width: W, align: 'center', color: PAL.bone, small: true }));
    });
    if (this.ev.notes.length) r.addChild(text(this.ev.notes.filter((n) => n !== 'started').slice(-3).join('  '), 8, 214, { small: true, color: PAL.ember, width: W - 16 }));
    r.addChild(button(`PRESS CONFERENCE (${2 - this.pressersDone})`, 8, H - 26, 130, 18, () => this.presser(false), { fill: PAL.steel, disabled: this.pressersDone >= 2 }));
    r.addChild(button('START THE EVENT →', W - 138, H - 26, 130, 18, () => {
      this.ev.notes.push('started');
      this.step = 'card';
      sfx('roar');
      this.refresh();
    }, { fill: PAL.blood }));
    sfx('crowd');
  }

  /** Raised hands: pick a reporter, answer their question. */
  private presser(post: boolean): void {
    const s = this.g.state!;
    if (!post) {
      // fight-week presser: the same stage as the post-fight one, main and co-main at the table
      const view = new PostFightPresser(this.g, this.ev, this.finSafe(), [], () => {
        view.destroy({ children: true });
        this.prePresser = null;
        this.pressersDone++;
        this.refresh();
      }, 'pre');
      this.prePresser = view;
      this.root.addChild(view);
      return;
    }
    const reps = content().reporters.filter((x) => !s.media.reporters[x.id]?.banned);
    if (!reps.length) return this.afterPresser(post);
    const rng = new Rng(s.rng);
    const hands = rng.sample(reps, 3);
    s.rng = rng.state;
    const frame = new Container();
    const wrap = this.g.modal(frame, { dim: 0.7 });
    frame.addChild(box(W - 40, 150, PAL.night, PAL.ash, { bevel: true })).position.set(20, 50);
    frame.addChild(text(post ? 'POST-FIGHT PRESS CONFERENCE' : 'PRE-FIGHT PRESS CONFERENCE', 26, 55, { color: PAL.gold }));
    frame.addChild(text('Hands go up. Who do you call on?', 26, 67, { small: true, color: PAL.ash }));
    hands.forEach((rep, i) => {
      const c = clickable(new Container(), () => {
        this.g.closeModal(wrap);
        const rng2 = new Rng(s.rng);
        const inst = fireCategory(s, 'presser', rng2, { postFight: post, eventName: this.ev.name }, { reporter: rep.id }, this.ev.id);
        s.rng = rng2.state;
        if (!inst) return this.afterPresser(post);
        playStorylet(this.g, inst, () => this.afterPresser(post));
      });
      c.addChild(reporterPortrait(rep, 64));
      c.addChild(text(rep.name, 0, 68, { small: true, width: 120, color: PAL.bone }));
      c.addChild(text(content().outlets.find((o) => o.id === rep.outlet)?.name ?? '', 0, 76, { small: true, width: 120, color: PAL.ash }));
      const rel = s.media.reporters[rep.id]?.rel ?? 0;
      c.addChild(text(rel > 20 ? 'friendly' : rel < -20 ? 'HOSTILE' : 'neutral', 0, 84, { small: true, color: rel > 20 ? PAL.moss : rel < -20 ? PAL.blood : PAL.ash }));
      c.position.set(40 + i * 140, 80);
      frame.addChild(c);
    });
    frame.addChild(button('END PRESSER', W - 120, 182, 92, 14, () => {
      this.g.closeModal(wrap);
      this.afterPresser(post, true);
    }, { small: true }));
  }

  private afterPresser(post: boolean, ended = false): void {
    if (post) return this.finish();
    this.pressersDone++;
    if (!ended && this.pressersDone < 2) this.presser(false);
    else this.refresh();
  }

  // ------------------------------------------------------------ card
  private buildCard(): void {
    const s = this.g.state!;
    const r = this.root;
    r.addChild(text(this.ev.name.toUpperCase() + '  •  THE CARD', 8, 6, { color: PAL.gold }));
    const live = this.live();
    const sb = new ScrollBox(W - 16, H - 52);
    sb.position.set(8, 18);
    // show in running order: prelims first
    const order = live.slice().reverse();
    order.forEach((b, i) => {
      const A = s.fighters[b.a];
      const B = s.fighters[b.b];
      const row = new Container();
      const done = b.status === 'done' && b.result;
      row.addChild(box(W - 22, 22, done ? 0x1e1a20 : b.position === 0 ? 0x3a2228 : 0x2a2430, PAL.shadow));
      row.addChild(text(b.position === 0 ? 'MAIN' : b.position === 1 ? 'CO-MAIN' : b.position < 5 ? 'MAIN CARD' : 'PRELIM', 4, 3, { small: true, color: b.position === 0 ? PAL.gold : PAL.ash }));
      row.addChild(text(`${A ? fullName(A) : '?'}  vs  ${B ? fullName(B) : '?'}${rematchTag(b)}${b.title ? '  ★ ' + (s.belts[b.title]?.name ?? '') : ''}`, 4, 11, { color: PAL.bone, width: 300, maxLines: 1 }));
      if (done) {
        const res = b.result!;
        const w = res.winner ? s.fighters[res.winner] : null;
        row.addChild(text(w ? `${w.last} by ${res.method} (${res.detail}) R${res.round} ${res.time}` : `${res.detail}`, 300, 7, { small: true, color: PAL.moss, width: W - 330 }));
      } else {
        const fmb = this.fmFor(b);
        if (fmb?.live && this.g.settings.handsOn !== false) row.addChild(button('FIGHT!', W - 130, 4, 36, 14, () => this.liveFight(b), { small: true, fill: PAL.gold }));
        row.addChild(button('WATCH', W - 92, 4, 34, 14, () => this.watch(b), { small: true, fill: PAL.blood }));
        row.addChild(button('SIM', W - 56, 4, 30, 14, () => this.simBout(b), { small: true, fill: PAL.slate }));
      }
      row.position.set(0, i * 24);
      sb.content.addChild(row);
    });
    r.addChild(sb);
    sb.refresh();
    const remaining = live.filter((b) => b.status === 'scheduled');
    const prelims = remaining.filter((b) => b.position >= 5);
    r.addChild(button('SIM ALL PRELIMS', 8, H - 26, 100, 18, () => {
      prelims.sort((a, b) => b.position - a.position).forEach((b) => this.simBout(b, true));
      this.refresh();
    }, { small: true, disabled: !prelims.length }));
    r.addChild(button('SIM EVERYTHING', 112, H - 26, 100, 18, () => {
      remaining.sort((a, b) => b.position - a.position).forEach((b) => this.simBout(b, true));
      this.refresh();
    }, { small: true, disabled: !remaining.length }));
    if (!remaining.length) r.addChild(button(this.opts.onWrap ? 'CONTRACT TIME →' : 'BONUSES & WRAP UP →', W - 150, H - 26, 142, 18, () => { this.step = 'bonus'; this.refresh(); }, { fill: PAL.blood }));
    else r.addChild(text('Watch a fight, or sim it. Prelims run first, main event last.', 220, H - 21, { small: true, color: PAL.ash }));
  }

  private simBout(b: Bout, quiet = false): void {
    const s = this.g.state!;
    const rng = new Rng(s.rng);
    runBout(s, this.ev, b, rng, false, this.fmFor(b)?.extra() ?? {});
    applyBout(s, this.ev, b, rng);
    s.rng = rng.state;
    if (!quiet) {
      this.postBout(b, false);
      this.afterOther(b);
    }
  }

  /** Hands-on: the player fights this one. */
  private liveFight(b: Bout): void {
    const fm = this.fmFor(b);
    if (!fm?.live) return;
    fm.live(b, () => {
      const s = this.g.state!;
      const rng = new Rng(s.rng);
      b.status = 'done';
      applyBout(s, this.ev, b, rng);
      s.rng = rng.state;
      this.step = 'card';
      this.refresh();
      this.postBout(b, true);
    });
  }

  /** Fighter Mode: you were cageside for somebody else's fight. */
  private afterOther(b: Bout): void {
    const fm = this.opts.fm;
    if (!fm?.after || b.a === fm.player || b.b === fm.player || !b.result) return;
    const go = () => (this.g.modals.length ? setTimeout(go, 300) : fm.after!(b));
    setTimeout(go, 300);
  }

  // ------------------------------------------------------------ watch
  private watch(b: Bout): void {
    const s = this.g.state!;
    const simRng = s.rng;
    const rng = new Rng(s.rng);
    runBout(s, this.ev, b, rng, true, this.fmFor(b)?.extra() ?? {});
    s.rng = rng.state;
    const seed = rng.int(1, 1e9);
    const base = b.result!.ticker ?? [];
    const lines = [...boothOpen(s, this.ev, b, seed), ...commentate(s, this.ev, b, base, seed)];
    const intro = this.g.settings.intros === false ? [] : butlerIntro(s, this.ev, b, seed);
    this.playing = {
      bout: b, lines, idx: 0, timer: 0.8, paused: false, phase: intro.length ? 'intro' : 'fight', phaseT: 0, ringcard: null, corner: null,
      intro, introIdx: 0, cer: [], cerIdx: 0, cerWinner: -1, raised: false, simRng, seed, fmDone: [],
    };
    this.step = 'watch';
    this.tapeShown = false;
    // walkout music: the red corner's song for the intro, straight into the fight if there's no intro
    setMusicContext(intro.length ? 'walkout' : 'fight', walkoutFor(b.a));
    this.refresh();
  }

  private buildWatch(): void {
    const s = this.g.state!;
    const r = this.root;
    const p = this.playing!;
    const A = s.fighters[p.bout.a];
    const B = s.fighters[p.bout.b];
    const champ = (id: string) => Object.values(s.belts).some((bt) => bt.holder === id);
    this.arena = new ArenaView(A, B, p.bout.rounds, { event: this.ev.name, eventKey: this.ev.id, champs: [champ(A.id), champ(B.id)], sponsors: eventSponsors(s, this.ev) });
    this.arena.position.set(0, 0);
    r.addChild(this.arena);
    this.arena.setMode(this.g.settings.fightCam ?? 'side');
    if (p.phase === 'intro') this.arena.startIntro();
    if (p.phase === 'ceremony') this.arena.startCeremony();
    // replay lines already shown
    for (let i = 0; i < p.idx; i++) this.arena.cue(p.lines[i], true);
    this.arena.settle();
    if (p.phase === 'ceremony' && p.raised) this.arena.raiseHand(p.cerWinner);
    const sub = new Container();
    sub.position.set(0, AH - 34);
    r.addChild(sub);
    this.subtitle = sub;
    // tale of the tape before the walkouts (once per fight)
    if (p.phase === 'intro' && p.introIdx === 0 && !this.tapeShown) {
      this.tapeShown = true;
      this.tape = new TaleOfTape(A, B, AW, boutLabel(s, p.bout), weighInWeight(A, p.bout, 1), weighInWeight(B, p.bout, 2), [rankLabel(s, A.id), rankLabel(s, B.id)]);
      r.addChild(this.tape);
    } else this.tape = null;
    if (this.g.settings.bleets !== false) {
      this.bleetFeed = new BleetFeed();
      this.bleetFeed.position.set(AW - 146, 36);
      r.addChild(this.bleetFeed);
    } else this.bleetFeed = null;
    const tb = new Container();
    tb.position.set(0, AH);
    r.addChild(tb);
    this.tickerBox = tb;
    this.drawTicker();
    const ctrl = new Container();
    r.addChild(ctrl);
    this.ctrlBar = ctrl;
    this.drawControls();
    // overlays live on the root, so a rebuild destroys them: rebuild them rather than re-adding dead objects
    if (p.phase === 'corner') {
      const reps = (p.bout.result?.corners ?? []).filter((c) => c.round === (p.lines[p.idx - 1]?.round ?? 1));
      p.corner = reps.length ? cornerView(A, B, reps, reps[0].round) : null;
      if (p.corner) r.addChild(p.corner);
      else p.phaseT = 0;
    }
    if (p.phase === 'ringcard') {
      p.ringcard = new RingCardWalk((p.lines[p.idx - 1]?.round ?? 1) + 1);
      this.arena!.restInCorners();
      this.arena!.addBackdrop(p.ringcard);
    }
  }

  /** Big subtitle for Juiced Butler. */
  private say(line: AnnounceLine | null): void {
    const sub = this.subtitle;
    if (!sub || sub.destroyed) return;
    sub.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (!line) return;
    const t = text(line.stage ? line.text : line.text, 0, 0, {
      width: W - 40, align: 'center', color: line.stage ? PAL.ash : /!!!$/.test(line.text) ? PAL.gold : PAL.bone, small: line.stage, maxLines: 3, shadow: PAL.ink,
    });
    const h = t.textHeight + 8;
    sub.addChild(box(W - 24, h, 0x0a080c)).position.set(12, 30 - h);
    sub.children[0].alpha = 0.82;
    if (!line.stage) sub.addChild(text('JUICED BUTLER', 16, 30 - h - 9, { small: true, color: PAL.gold, shadow: PAL.ink }));
    t.position.set(20, 30 - h + 4);
    sub.addChild(t);
  }

  /** Queue a reaction from the timeline a beat after something happens (real people type slowly). */
  private queueBleet(sit: string, actor: 0 | 1, delay = 0.8 + Math.random() * 1.4): void {
    if (!this.bleetFeed || this.bleetQueue.length > 3) return;
    this.bleetQueue.push({ at: this.bleetClock + delay, sit, actor });
  }

  private reactToLine(line: TickerLine): void {
    const p = this.playing;
    if (!p || !this.bleetFeed) return;
    const sit = bleetSituation(line);
    if (!sit || Math.random() > sit.chance) return;
    let actor: 0 | 1 = line.side === 1 ? 1 : 0;
    if (sit.sit === 'round' || sit.sit === 'lull') actor = line.hp[0] >= line.hp[1] ? 0 : 1;
    const res = p.bout.result;
    if ((sit.sit === 'decision' || sit.sit === 'robbery') && res?.winner) actor = res.winner === p.bout.a ? 0 : 1;
    this.queueBleet(sit.sit, actor);
    // the big moments get a pile-on
    if (['ko', 'tap', 'robbery', 'knockdown'].includes(sit.sit) && Math.random() < 0.7) this.queueBleet(sit.sit, actor, 2.6 + Math.random() * 1.5);
  }

  private tickBleets(dt: number): void {
    const p = this.playing;
    if (!this.bleetFeed || this.bleetFeed.destroyed || !p) return;
    this.bleetClock += dt;
    this.bleetFeed.update(dt);
    const due = this.bleetQueue.filter((q) => q.at <= this.bleetClock);
    this.bleetQueue = this.bleetQueue.filter((q) => q.at > this.bleetClock);
    for (const q of due) {
      const b = makeBleet(this.g.state!, this.ev, p.bout, q.sit, q.actor, new Rng((Math.random() * 1e9) | 0));
      if (b) this.bleetFeed.push(b);
    }
  }

  /** The button strip under the fight. Redrawn in place: rebuilding the scene mid-fight would reset the arena. */
  private drawControls(): void {
    const c = this.ctrlBar;
    const p = this.playing;
    if (!c || c.destroyed || !p) return;
    c.removeChildren().forEach((ch) => ch.destroy({ children: true }));
    const s = this.g.state!;
    c.addChild(button('SPEED x' + this.g.settings.fightSpeed, 4, H - 16, 50, 13, () => {
      this.g.settings.fightSpeed = (this.g.settings.fightSpeed % 4) + 1;
      this.g.applySettings();
      this.drawControls();
    }, { small: true }));
    c.addChild(button(p.paused ? 'PLAY' : 'PAUSE', 57, H - 16, 36, 13, () => {
      p.paused = !p.paused;
      this.drawControls();
    }, { small: true }));
    c.addChild(button('CAM: ' + CAM_NAMES[this.g.settings.fightCam ?? 'side'], 96, H - 16, 62, 13, () => this.cycleCam(), { small: true, fill: PAL.steel }));
    if (p.phase === 'intro') c.addChild(button('SKIP INTRO', 161, H - 16, 56, 13, () => this.endIntro(), { small: true, fill: PAL.plum }));
    else c.addChild(button(p.phase === 'ceremony' ? 'SKIP' : 'SKIP TO END', 161, H - 16, 56, 13, () => this.skipToEnd(), { small: true, fill: PAL.blood }));
    c.addChild(text(boutLabel(s, p.bout).toUpperCase(), 222, H - 12, { small: true, color: PAL.ash, width: W - 226, maxLines: 1 }));
  }

  private cycleCam(): void {
    const order = ['side', 'tv', 'top'] as const;
    const cur = order.indexOf(this.g.settings.fightCam ?? 'side');
    this.g.settings.fightCam = order[(cur + 1) % order.length];
    this.g.applySettings();
    if (this.arena && !this.arena.destroyed) this.arena.setMode(this.g.settings.fightCam);
    this.drawControls();
  }

  private drawTicker(): void {
    const tb = this.tickerBox;
    const p = this.playing;
    if (!tb || !p || tb.destroyed) return;
    tb.removeChildren().forEach((c) => c.destroy({ children: true }));
    const boxH = H - AH - 18;
    tb.addChild(box(W, boxH, PAL.ink, PAL.shadow));
    const booth = content().commentary.speakers;
    const label = (l: TickerLine) => {
      if (l.speaker) return `{#${booth[l.speaker]?.color ?? 'c4a04a'}}${booth[l.speaker]?.short ?? l.speaker.toUpperCase()}:{/} `;
      return `R${l.round} ${Math.floor(l.t / 60)}:${String(l.t % 60).padStart(2, '0')}  `;
    };
    // newest at the bottom (wraps), older lines stacked above it
    let y = boxH - 4;
    for (let i = p.idx - 1; i >= 0 && y > 4; i--) {
      const l = p.lines[i];
      const newest = i === p.idx - 1;
      const t = text(label(l) + l.text, 6, 0, {
        small: !newest, width: W - 76, maxLines: newest ? 2 : 1,
        color: newest ? (l.speaker ? PAL.fog : l.intensity >= 3 ? PAL.gold : PAL.bone) : l.speaker ? PAL.ash : PAL.grey,
      });
      y -= t.textHeight + (newest ? 4 : 3);
      if (y < 2) {
        t.destroy();
        break;
      }
      t.y = y;
      tb.addChild(t);
    }
    // crowd meter
    const last = [...p.lines.slice(0, p.idx)].reverse().find((l) => !l.speaker);
    const inten = last ? last.intensity : 1;
    tb.addChild(text('CROWD', W - 64, 4, { small: true, color: PAL.ash }));
    tb.addChild(box(30, 5, PAL.shadow)).position.set(W - 36, 5);
    tb.addChild(box(Math.max(2, inten * 10), 5, inten >= 3 ? PAL.blood : PAL.gold)).position.set(W - 36, 5);
  }

  private endIntro(): void {
    const p = this.playing;
    if (!p || p.phase !== 'intro') return;
    p.phase = 'fight';
    p.timer = 0.8;
    this.arena?.startFight();
    this.say(null);
    this.queueBleet('open', 0, 1.2);
    setMusicContext('fight');
    sfx('bell');
    this.refresh();
  }

  private skipToEnd(): void {
    const p = this.playing;
    if (!p) return;
    if (p.phase === 'ceremony') return this.endWatch();
    p.idx = p.lines.length;
    p.corner?.destroy({ children: true });
    p.ringcard?.destroy({ children: true });
    p.corner = null;
    p.ringcard = null;
    this.startCeremony();
  }

  /** Decision read (or finish announcement) with the hand raise. */
  private startCeremony(): void {
    const p = this.playing;
    if (!p) return;
    const s = this.g.state!;
    const res = p.bout.result!;
    const seed = res.fotn * 7919 + p.bout.position;
    if (res.method === 'DEC' || res.method === 'DRAW') {
      const d = butlerDecision(s, this.ev, p.bout, seed);
      p.cer = d.lines;
    } else p.cer = butlerFinish(s, p.bout, seed);
    p.cerWinner = res.winner === p.bout.a ? 0 : res.winner === p.bout.b ? 1 : -1;
    p.cerIdx = 0;
    p.phase = 'ceremony';
    setMusicContext('fightnight');
    p.timer = 1.0;
    p.raised = false;
    this.refresh();
  }

  update(dt: number): void {
    if (this.step === 'presser' && this.presserView && !this.presserView.destroyed) this.presserView.update(dt);
    if (this.prePresser && !this.prePresser.destroyed) this.prePresser.update(dt);
    if (this.step === 'recap' && this.recapView && !this.recapView.destroyed) this.recapView.update(dt);
    const p = this.playing;
    if (this.step !== 'watch' || !p || !this.arena || this.arena.destroyed) return;
    const speed = [1, 0.6, 1, 2, 4][this.g.settings.fightSpeed] ?? 1;
    this.arena.pace = Math.max(1, Math.min(2, speed));
    this.arena.update(dt);
    if (!p.paused) this.tickBleets(dt * Math.min(2, speed));
    if (p.paused || this.g.modals.length) return;
    if (this.tape && !this.tape.destroyed) {
      // the tale of the tape holds the walkouts until it's done
      if (!this.tape.update(dt)) {
        this.tape.destroy({ children: true });
        this.tape = null;
      } else if (p.phase === 'intro') return;
    }
    if (p.phase === 'intro') {
      p.timer -= dt * Math.min(2, speed);
      if (p.timer > 0) return;
      const line = p.intro[p.introIdx++];
      if (!line) return this.endIntro();
      this.arena.introCue(line.corner, !!line.stage, line.text);
      this.say(line);
      if (/!!!$/.test(line.text)) sfx('roar');
      else if (!line.stage && p.introIdx === 1) sfx('crowd');
      p.timer = line.stage ? 1.8 : 1.0 + line.text.length / 38;
      return;
    }
    if (p.phase === 'ceremony') {
      p.timer -= dt * Math.min(2, speed);
      if (p.timer > 0) return;
      const line = p.cer[p.cerIdx++];
      if (!line) {
        if (p.timer < -2.6) this.endWatch();
        return;
      }
      this.arena.ceremonyCue(line.text);
      this.say(line);
      const last = p.cerIdx >= p.cer.length;
      if (last) {
        if (p.cerWinner >= 0 || /DRAW/i.test(line.text)) this.arena.raiseHand(p.cerWinner);
        p.raised = true;
        sfx('roar');
        p.timer = 3.2;
        // keep counting down past zero to linger on the raised hand
        setTimeout(() => {
          if (this.playing === p) this.endWatch();
        }, 3400 / Math.min(2, speed));
      } else p.timer = 1.0 + line.text.length / 40;
      return;
    }
    if (p.phase === 'corner') {
      p.phaseT -= dt * speed;
      // Fighter Mode: you work the corner, then the rest of the fight re-runs with your choices
      const fm = this.fmFor(p.bout);
      const rnd = p.lines[p.idx - 1]?.round ?? 1;
      if (p.phaseT <= 0 && fm && !p.fmDone.includes(rnd)) {
        p.fmDone.push(rnd);
        fm.corner(rnd, p.bout, () => this.fmResim(rnd));
        return;
      }
      if (p.phaseT <= 0) {
        p.corner?.destroy({ children: true });
        p.corner = null;
        const nextRound = (p.lines[p.idx - 1]?.round ?? 1) + 1;
        p.ringcard = new RingCardWalk(nextRound);
        this.arena.restInCorners();
        this.arena.addBackdrop(p.ringcard);
        p.phase = 'ringcard';
      }
      return;
    }
    if (p.phase === 'ringcard') {
      if (!p.ringcard || !p.ringcard.update(dt * speed)) {
        p.ringcard?.destroy({ children: true });
        p.ringcard = null;
        p.phase = 'fight';
        sfx('bell');
      }
      return;
    }
    if (p.phase === 'end') return;
    // the arena holds the next line while the fighters walk out or close the distance for an exchange
    if (this.arena.busy()) return;
    p.timer -= dt * speed;
    if (p.timer > 0) return;
    if (p.idx >= p.lines.length) {
      p.phase = 'end';
      setTimeout(() => {
        if (this.playing === p) this.startCeremony();
      }, 1400 / speed);
      return;
    }
    const line = p.lines[p.idx++];
    this.arena.cue(line);
    this.reactToLine(line);
    this.drawTicker();
    p.timer = line.speaker ? 0.9 + line.text.length / 55 : line.intensity >= 3 ? 1.6 : line.act === 'bell' ? 0.9 : 0.95;
    // round ended: corners cutaway (after the booth has had its say)
    if (line.act === 'bell' && p.idx < p.lines.length) {
      while (p.lines[p.idx]?.speaker && p.lines[p.idx].round === line.round) {
        const bl = p.lines[p.idx++];
        this.arena.cue(bl);
      }
      this.drawTicker();
      const reps = (p.bout.result?.corners ?? []).filter((c) => c.round === line.round);
      if (reps.length) {
        // round stats for the broadcast strip, counted from this round's action
        const rl = p.lines.filter((l) => !l.speaker && l.round === line.round);
        const count = (re: RegExp, side: 0 | 1) => rl.filter((l) => l.side === side && re.test(l.key ?? '')).length;
        const stats = {
          sig: [count(/^(land_|ko_|tko_|gnp|knockdown|rocked)/, 0), count(/^(land_|ko_|tko_|gnp|knockdown|rocked)/, 1)] as [number, number],
          td: [count(/^takedown$/, 0), count(/^takedown$/, 1)] as [number, number],
          kd: [count(/^knockdown$/, 0), count(/^knockdown$/, 1)] as [number, number],
        };
        p.corner = cornerView(this.g.state!.fighters[p.bout.a], this.g.state!.fighters[p.bout.b], reps, line.round, stats);
        this.root.addChild(p.corner);
        p.phase = 'corner';
        p.phaseT = 4.5;
      }
    }
  }

  private fmFor(b: Bout): FightNightFM | null {
    const fm = this.opts.fm;
    return fm && (b.a === fm.player || b.b === fm.player) ? fm : null;
  }

  /** Re-simulate from the same seed: everything already shown is identical, the rest follows the new plan & corner. */
  private fmResim(round: number): void {
    const p = this.playing;
    const fm = p && this.fmFor(p.bout);
    if (!p || !fm) return;
    const s = this.g.state!;
    const rng = new Rng(p.simRng);
    runBout(s, this.ev, p.bout, rng, true, fm.extra());
    const base = p.bout.result!.ticker ?? [];
    const lines = [...boothOpen(s, this.ev, p.bout, p.seed), ...commentate(s, this.ev, p.bout, base, p.seed)];
    let at = lines.findIndex((l) => !l.speaker && l.act === 'bell' && l.round === round);
    if (at >= 0) {
      at++;
      while (lines[at]?.speaker && lines[at].round === round) at++;
      p.lines = lines;
      p.idx = at;
    }
  }

  private endWatch(): void {
    const p = this.playing;
    if (!p || (p as { done?: boolean }).done) return;
    (p as { done?: boolean }).done = true;
    const s = this.g.state!;
    const rng = new Rng(s.rng);
    applyBout(s, this.ev, p.bout, rng);
    s.rng = rng.state;
    this.playing = null;
    this.arena = null;
    this.subtitle = null;
    setMusicContext('fightnight');
    this.step = 'card';
    this.refresh();
    this.postBout(p.bout, true);
    this.afterOther(p.bout);
  }

  /** Result card + post-fight interview, then maybe fight-night chaos. */
  private postBout(b: Bout, watched: boolean): void {
    const s = this.g.state!;
    const res = b.result!;
    const main = b.position <= 2;
    if (!watched && !main) return;
    const frame = new Container();
    const wrap = this.g.modal(frame, { dim: 0.6 });
    const bw = 380;
    frame.addChild(box(bw, 168, PAL.night, PAL.gold, { bevel: true, shadow: true })).position.set((W - bw) / 2, 40);
    const x0 = (W - bw) / 2 + 8;
    const w = res.winner ? s.fighters[res.winner] : null;
    const l = res.loser ? s.fighters[res.loser] : null;
    frame.addChild(text(w ? `WINNER: ${fullName(w).toUpperCase()}` : res.method === 'NC' ? 'NO CONTEST' : 'DRAW', x0, 46, { color: PAL.gold }));
    frame.addChild(text(`${res.method} (${res.detail})  R${res.round} ${res.time}  •  Ref: ${res.referee}`, x0, 57, { small: true, color: PAL.ash, width: bw - 16 }));
    if (res.method === 'DEC' || res.method === 'DRAW') frame.addChild(text(`Scorecards: ${res.scores.map((sc, i) => `${res.judges[i]} ${sc[0]}-${sc[1]}`).join(', ')}${res.robbery ? '  ROBBERY!' : ''}`, x0, 66, { small: true, color: res.robbery ? PAL.blood : PAL.ash, width: bw - 16 }));
    if (res.injuries.length) frame.addChild(text(`Injuries: ${res.injuries.map((i) => `${s.fighters[i.fighter]?.last} - ${i.name}`).join(', ')}`, x0, 75, { small: true, color: PAL.blood, width: bw - 16 }));
    const speaker = w ?? s.fighters[b.a];
    const por = fighterPortrait(speaker, 64, 'plain');
    por.position.set(x0, 86);
    frame.addChild(por);
    const rng = new Rng(s.rng ^ 0x1234);
    let key = res.robbery && l ? 'robbed' : res.method === 'KO' || res.method === 'TKO' ? 'win_ko' : res.method === 'SUB' ? 'win_sub' : res.method === 'DEC' ? 'win_dec' : 'win_other';
    const bank = { ...INTERVIEW, ...(content().templates.presser ?? {}) };
    const opp = l ?? s.fighters[b.b];
    const fill = (str: string) => pronounize(str.replace(/\{opp\}/g, opp?.last ?? 'him').replace(/\{president\}/g, s.president.name.split(' ').slice(-1)[0]), speaker);
    let quote = fill(rng.pick(bank[key] ?? INTERVIEW.win_other));
    if (w && (w.traits.includes('Trash Talker') || w.traits.includes('Showman')) && rng.chance(0.6)) {
      const rival = Object.values(s.fighters).find((f) => f.division === w.division && f.id !== w.id && f.promotion === 'us' && f.status === 'active' && f.id !== l?.id);
      if (rival) quote += ' ' + rng.pick(bank.callout ?? INTERVIEW.callout).replace(/\{opp\}/g, rival.last).replace(/\{president\}/g, s.president.name.split(' ').slice(-1)[0]);
    }
    if (res.robbery && l) {
      key = 'robbed';
      quote = fill(rng.pick(bank.robbed ?? INTERVIEW.robbed));
    }
    frame.addChild(text(`POST-FIGHT INTERVIEW (${speaker.last}, still bleeding):`, x0 + 72, 88, { small: true, color: PAL.ash, width: bw - 90 }));
    frame.addChild(text(`"${quote}"`, x0 + 72, 98, { color: PAL.bone, width: bw - 90 }));
    frame.addChild(button('CONTINUE', (W + bw) / 2 - 76, 188, 68, 14, () => {
      this.g.closeModal(wrap);
      // Fighter Mode: the promoter's fight-night drama isn't yours (your own prompts come after your fight)
      if (this.opts.fm) this.refresh();
      else this.fightNightChaos(b);
    }, { fill: PAL.moss }));
  }

  private fightNightChaos(b: Bout): void {
    const s = this.g.state!;
    const rng = new Rng(s.rng);
    const chance = b.position <= 1 ? 0.55 : 0.18;
    if (!rng.chance(chance)) {
      s.rng = rng.state;
      this.refresh();
      return;
    }
    const r = b.result!;
    const inst = fireCategory(s, 'fightnight', rng, {
      lastWinner: r.winner ?? '', lastLoser: r.loser ?? '', lastA: b.a, lastB: b.b, lastMethod: r.method, lastRobbery: r.robbery, lastMain: b.position === 0, lastTitle: !!b.title,
    }, {}, this.ev.id);
    s.rng = rng.state;
    if (!inst) return this.refresh();
    playStorylet(this.g, inst, () => this.refresh());
  }

  // ------------------------------------------------------------ bonuses & wrap up
  private buildBonus(): void {
    const s = this.g.state!;
    const r = this.root;
    if (!this.bonusSel.size) defaultBonuses(this.ev).forEach((id) => this.bonusSel.add(id));
    r.addChild(text('PERFORMANCE BONUSES', 8, 8, { color: PAL.gold }));
    r.addChild(text(`Each bonus costs ${money(bonusAmount(s))}. Fighters remember who got paid (and who didn't).`, 8, 20, { small: true, color: PAL.ash }));
    const done = this.live().filter((b) => b.status === 'done' && b.result);
    const sb = new ScrollBox(W - 16, H - 70);
    sb.position.set(8, 32);
    done.forEach((b, i) => {
      const res = b.result!;
      const row = new Container();
      row.addChild(box(W - 22, 20, 0x24212a, PAL.shadow));
      row.addChild(text(`${boutTitle(s, b)}: ${res.method} R${res.round}  (quality ${res.fotn})`, 4, 6, { small: true, color: PAL.bone, width: 230 }));
      [b.a, b.b].forEach((id, j) => {
        const sel = this.bonusSel.has(id);
        row.addChild(button(`${sel ? '✓ ' : ''}${s.fighters[id]?.last}`, 250 + j * 102, 3, 98, 14, () => {
          if (sel) this.bonusSel.delete(id);
          else this.bonusSel.add(id);
          this.refresh();
        }, { small: true, fill: sel ? PAL.moss : PAL.shadow }));
      });
      row.position.set(0, i * 22);
      sb.content.addChild(row);
    });
    r.addChild(sb);
    sb.refresh();
    r.addChild(text(`Selected: ${this.bonusSel.size}  (${money(this.bonusSel.size * bonusAmount(s))})`, 8, H - 22, { color: PAL.bone }));
    r.addChild(button('POST-FIGHT PRESSER →', W - 150, H - 26, 142, 18, () => this.wrapUp(), { fill: PAL.steel }));
  }

  /** Pay everybody, then the post-fight press conference and the TV recap. */
  private wrapUp(): void {
    const s = this.g.state!;
    if (this.ev.status === 'scheduled') {
      this.ev.fin = finalizeEvent(s, this.ev, [...this.bonusSel]);
      sfx('cash');
    }
    this.step = 'presser';
    this.refresh();
  }

  private finSafe(): EventFinancials {
    return this.ev.fin ?? { attendance: 0, gate: 0, ppvBuys: 0, ppv: 0, broadcast: 0, sponsors: 0, merch: 0, purses: 0, bonuses: 0, venue: 0, production: 0 };
  }

  private buildPresser(): void {
    this.presserView = new PostFightPresser(this.g, this.ev, this.finSafe(), [...this.bonusSel], () => {
      this.presserView = null;
      this.step = 'recap';
      this.refresh();
    });
    this.root.addChild(this.presserView);
  }

  private buildRecap(): void {
    this.recapView = new NewsRecap(this.g, this.ev, this.finSafe(), () => {
      this.recapView = null;
      this.finish();
    });
    this.root.addChild(this.recapView);
  }

  private finish(): void {
    const s = this.g.state!;
    if (this.ev.status === 'scheduled') {
      const fin = finalizeEvent(s, this.ev, [...this.bonusSel]);
      this.ev.fin = fin;
      sfx('cash');
      this.g.toast(`Gate ${money(fin.gate)}  •  ${fin.attendance.toLocaleString()} fans${fin.ppvBuys ? `  •  ${fin.ppvBuys.toLocaleString()} PPV buys` : ''}`, PAL.gold);
    }
    s.phase = 'ledger';
    this.g.autosave();
    routePhase(this.g);
  }
}

export { Graphics, PixelText, paper, shade };
