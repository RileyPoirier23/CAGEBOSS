/**
 * Fight Night: faceoffs -> pre-fight press conference -> the card (watch or
 * sim each bout) -> post-fight interviews & fight-night chaos -> performance
 * bonuses -> post-fight presser -> ledger.
 */
import { isTouchDevice } from '../../core/platform';
import { DANIEL_REF_LOOK } from '../../sim/cast';
import type { FightOpts } from '../../sim/fight';
import { Container, Graphics } from 'pixi.js';
import { Scene, Game, fullBg } from '../app';
import type { Bout, FightEvent, TickerLine, EventFinancials } from '../../core/types';
import { PostFightPresser } from '../presser';
import { eventSponsors, sponsorColor, eventCanvas } from '../../sim/sponsorship';
import { setMusicContext, walkoutFor } from '../../audio/music';
import { NewsRecap } from '../newsrecap';
import { PAL, shade } from '../../art/palette';
import { W, H, SW, OX, text, button, box, ScrollBox, paper, clickable, type ButtonOpts } from '../kit';
import { PixelText, measure } from '../text';
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
import { stepMomentum, momLead } from '../../sim/momentum';
import { lineBeat, talkBeat, blocksAction, nextRoundIndex, nextAction, isFinishLine } from '../watchpace';

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
/** settings.fightSpeed 1..4, named as in Settings */
const SPEED_NAMES = ['', 'SLOW', 'NORMAL', 'FAST', 'BLITZ'];
/** HIGHLIGHTS still plays these at full length, whatever their intensity */
const HL_KEEP: Record<string, boolean> = { takedown: true, sub_attempt: true, sweep: true, knockdown: true, rocked: true };
/** Booth calls that never go stale waiting for the booth to finish its last line */
const URGENT_TALK: Record<string, boolean> = { 'booth:hurt': true, 'booth:knockdown': true, 'booth:lateref': true, 'booth:momentum': true };
/** Lines that get the crowd up on their own, on top of the momentum (and so does a finish) */
const BIG_KEYS: Record<string, boolean> = { knockdown: true, rocked: true, land_headkick: true, land_spinning: true, land_flying: true };
/** The tug-of-war bar's corner colours */
const RED = 0xb83030;
const BLUE = 0x3a66c0;

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
    phase: 'intro' | 'fight' | 'corner' | 'ringcard' | 'end' | 'ceremony' | 'replay'; phaseT: number;
    ringcard: RingCardWalk | null; corner: Container | null;
    intro: AnnounceLine[]; introIdx: number; cer: AnnounceLine[]; cerIdx: number; cerWinner: -1 | 0 | 1; raised: boolean;
    /** the booth lines heard tonight before this bout (a Fighter Mode re-sim must pick the same lines) */
    avoid0: Set<string>;
    /** what the ticker shows, in the order it was said (the booth talks over the action, so not quite line order) */
    shown: TickerLine[];
    /** reading time left on the booth's last line; booth lines that come up meanwhile wait their turn, the action doesn't */
    talkT: number; boothQ: { l: TickerLine; at: number }[];
    /** fight-phase seconds (speed-scaled): how long a queued booth line has been waiting; when the fight clock reaches the next
     *  exchange; how long since the last action line (not counting the arena's holds) */
    clock: number; clockAt: number; sinceAct: number;
    /** round-end booth lines still to be read out over the corner */
    cornerTalk: TickerLine[]; cornerTalkT: number;
    /** HIGHLIGHTS: the line playing is a minor one, rushed through */
    hlFast: boolean;
    /** momentum per side, the last action line's intensity, the big-moment boost (s), the crowd's heat */
    mom: [number, number]; lastInt: number; bigT: number; heat: number; feetRound: number; feetDue: boolean; over: boolean;
    /** instant replay: seconds until it rolls (0 = none), the lines it shows, and its playback */
    replayIn: number; replayFrom: number; replayTo: number; rpIdx: number; rpT: number; rpTail: number;
  } | null = null;
  /** HIGHLIGHTS: rush through the minor stuff (this session only) */
  private highlights = false;
  /** booth lines heard tonight, so the next bout doesn't repeat them */
  private boothSeen = new Set<string>();
  /** the instant replay's own arena, over the live one */
  private rpView: ArenaView | null = null;
  /** the broadcast wipe in or out of the replay */
  private wipe: Graphics | null = null;
  private wipeT = 0;
  private wipeOut = false;
  /** the momentum / heat meters in the ticker box (redrawn only when they move) */
  private meterG: Graphics | null = null;
  private meterPull = -99;
  private meterHeat = -1;
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

  exit(): void {
    this.g.watchingFight = false;
    super.exit();
  }

  build(): void {
    const r = this.root;
    this.g.watchingFight = this.step === 'watch';
    r.x = 0; // (the card widens itself on phones)
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
    // phones: the card runs the full width of the screen, with bigger buttons and rows
    const P = isTouchDevice();
    const FW = P ? SW : W;
    if (P) {
      r.x = -OX;
      r.addChild(new Graphics().rect(0, 0, FW, H).fill(0x120e14)); // (fullBg assumes an unshifted root)
    }
    const rh = P ? 27 : 24;
    r.addChild(text(this.ev.name.toUpperCase() + '  •  THE CARD', 8, 6, { color: PAL.gold }));
    const live = this.live();
    const sb = new ScrollBox(FW - 16, H - 52);
    sb.position.set(8, 18);
    // show in running order: prelims first
    const order = live.slice().reverse();
    order.forEach((b, i) => {
      const A = s.fighters[b.a];
      const B = s.fighters[b.b];
      const row = new Container();
      const done = b.status === 'done' && b.result;
      row.addChild(box(FW - 22, rh - 2, done ? 0x1e1a20 : b.position === 0 ? 0x3a2228 : 0x2a2430, PAL.shadow));
      row.addChild(text(b.position === 0 ? 'MAIN' : b.position === 1 ? 'CO-MAIN' : b.position < 5 ? 'MAIN CARD' : 'PRELIM', 4, 3, { small: true, color: b.position === 0 ? PAL.gold : PAL.ash }));
      row.addChild(text(`${A ? fullName(A) : '?'}  vs  ${B ? fullName(B) : '?'}${rematchTag(b)}${b.title ? '  ★ ' + (s.belts[b.title]?.name ?? '') : ''}`, 4, 11, { color: PAL.bone, width: FW - 180, maxLines: 1 }));
      if (done) {
        const res = b.result!;
        const w = res.winner ? s.fighters[res.winner] : null;
        row.addChild(text(w ? `${w.last} by ${res.method} (${res.detail}) R${res.round} ${res.time}` : `${res.detail}`, FW - 180, 7, { small: true, color: PAL.moss, width: 150 }));
      } else {
        const fmb = this.fmFor(b);
        // [x, w] of FIGHT / WATCH / SIM from the row's right edge
        const bw = P ? [[168, 46], [118, 46], [68, 42]] : [[130, 36], [92, 34], [56, 30]];
        const bh = P ? 19 : 14;
        if (fmb?.live && this.g.settings.handsOn !== false) row.addChild(button('FIGHT!', FW - bw[0][0], P ? 3 : 4, bw[0][1], bh, () => this.liveFight(b), { small: true, fill: PAL.gold }));
        row.addChild(button('WATCH', FW - bw[1][0], P ? 3 : 4, bw[1][1], bh, () => this.watch(b), { small: true, fill: PAL.blood }));
        row.addChild(button('SIM', FW - bw[2][0], P ? 3 : 4, bw[2][1], bh, () => this.simBout(b), { small: true, fill: PAL.slate }));
      }
      row.position.set(0, i * rh);
      sb.content.addChild(row);
    });
    r.addChild(sb);
    sb.refresh();
    const remaining = live.filter((b) => b.status === 'scheduled');
    const prelims = remaining.filter((b) => b.position >= 5);
    // (what's left is worked out on the tap: a bout can finish between the redraw and the tap)
    r.addChild(button('SIM ALL PRELIMS', 8, H - 26, 100, 18, () => {
      live.filter((b) => b.status === 'scheduled' && b.position >= 5).sort((a, b) => b.position - a.position).forEach((b) => this.simBout(b, true));
      this.refresh();
    }, { small: true, disabled: !prelims.length }));
    r.addChild(button('SIM EVERYTHING', 112, H - 26, 100, 18, () => {
      live.filter((b) => b.status === 'scheduled').sort((a, b) => b.position - a.position).forEach((b) => this.simBout(b, true));
      this.refresh();
    }, { small: true, disabled: !remaining.length }));
    if (!remaining.length) r.addChild(button(this.opts.onWrap ? 'CONTRACT TIME →' : 'BONUSES & WRAP UP →', FW - 150, H - 26, 142, 18, () => { this.step = 'bonus'; this.refresh(); }, { fill: PAL.blood }));
    else r.addChild(text('Watch a fight, or sim it. Prelims run first, main event last.', 220, H - 21, { small: true, color: PAL.ash }));
  }

  private simBout(b: Bout, quiet = false): void {
    // a bout is fought once: a second tap on a stale SIM button must not add another result
    if (b.status === 'done') return;
    const s = this.g.state!;
    const rng = new Rng(s.rng);
    runBout(s, this.ev, b, rng, false, this.fmFor(b)?.extra() ?? {});
    applyBout(s, this.ev, b, rng);
    s.rng = rng.state;
    if (!quiet) {
      this.postBout(b, false);
      this.afterOther(b);
      this.refresh();
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
    if (b.status === 'done') return;
    const s = this.g.state!;
    const simRng = s.rng;
    const rng = new Rng(s.rng);
    runBout(s, this.ev, b, rng, true, this.fmFor(b)?.extra() ?? {});
    s.rng = rng.state;
    const seed = rng.int(1, 1e9);
    const base = b.result!.ticker ?? [];
    // the booth remembers what it already said tonight
    const avoid0 = new Set(this.boothSeen);
    const lines = [...boothOpen(s, this.ev, b, seed, this.boothSeen), ...commentate(s, this.ev, b, base, seed, this.boothSeen)];
    const intro = this.g.settings.intros === false ? [] : butlerIntro(s, this.ev, b, seed);
    this.playing = {
      bout: b, lines, idx: 0, timer: 0.8, paused: false, phase: intro.length ? 'intro' : 'fight', phaseT: 0, ringcard: null, corner: null,
      intro, introIdx: 0, cer: [], cerIdx: 0, cerWinner: -1, raised: false, simRng, seed, fmDone: [],
      avoid0, shown: [], talkT: 0, boothQ: [], clock: 0, clockAt: 0, sinceAct: 0, cornerTalk: [], cornerTalkT: 0, hlFast: false,
      mom: [0, 0], lastInt: 1, bigT: 0, heat: 0, feetRound: 0, feetDue: false, over: false,
      replayIn: 0, replayFrom: 0, replayTo: -1, rpIdx: 0, rpT: 0, rpTail: -1,
    };
    this.step = 'watch';
    this.g.watchingFight = true;
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
    // rebuilt mid-replay (the screen turned): the replay arena went with the old root, so carry on live
    if (p.phase === 'replay') p.phase = 'fight';
    p.replayIn = 0;
    this.rpView = null;
    this.wipe = null;
    this.wipeT = 0;
    this.arena = this.newArena();
    this.arena.position.set(0, 0);
    r.addChild(this.arena);
    this.arena.setMode(this.g.settings.fightCam ?? 'side');
    this.arena.reduceMotion = this.g.settings.reduceShake;
    if (p.phase === 'intro') this.arena.startIntro();
    // replay lines already shown
    for (let i = 0; i < p.idx; i++) this.arena.cue(p.lines[i], true);
    this.arena.settle();
    // (the ceremony is staged after the replay, so a replayed finish doesn't knock the loser down again)
    if (p.phase === 'ceremony') this.arena.startCeremony();
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

  /** An arena for the bout being watched (the live view, or the instant replay's). */
  private newArena(): ArenaView {
    const s = this.g.state!;
    const p = this.playing!;
    const A = s.fighters[p.bout.a];
    const B = s.fighters[p.bout.b];
    const champ = (id: string) => Object.values(s.belts).some((bt) => bt.holder === id);
    return new ArenaView(A, B, p.bout.rounds, { event: this.ev.name, eventKey: this.ev.id, champs: [champ(A.id), champ(B.id)], sponsors: eventSponsors(s, this.ev), canvas: eventCanvas(s, this.ev), refLook: /Stinkovich/.test(p.bout.result?.referee ?? '') ? DANIEL_REF_LOOK : undefined });
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
    // phones: taller buttons with the big face; the bout label shrinks (or goes) to fit
    const t = isTouchDevice();
    const by = t ? H - 17 : H - 16;
    const bh = t ? 16 : 13;
    const o = t ? {} : { small: true };
    const fit = (label: string, min: number) => Math.max(min, measure(label, !t) + (t ? 8 : 6));
    let x = 4;
    const add = (label: string, min: number, onClick: () => void, opts: ButtonOpts) => {
      const w = fit(label, min);
      c.addChild(button(label, x, by, w, bh, onClick, opts));
      x += w + 3;
    };
    add(SPEED_NAMES[this.g.settings.fightSpeed] ?? 'NORMAL', t ? 44 : 34, () => {
      this.g.settings.fightSpeed = (this.g.settings.fightSpeed % 4) + 1;
      this.g.applySettings();
      this.drawControls();
    }, o);
    add(p.paused ? 'PLAY' : 'PAUSE', t ? 46 : 32, () => {
      p.paused = !p.paused;
      this.drawControls();
    }, o);
    add('CAM: ' + CAM_NAMES[this.g.settings.fightCam ?? 'side'], t ? 60 : 48, () => this.cycleCam(), { ...o, fill: PAL.steel });
    // straight to the end of the round (or out of the corner): never past a finish
    const between = p.phase === 'corner' || p.phase === 'ringcard';
    add('NEXT RND', 0, () => this.nextRound(), { ...o, fill: PAL.slate, disabled: !(between || (p.phase === 'fight' && !p.over)) });
    add(this.highlights ? 'HIGHLIGHTS ON' : 'HIGHLIGHTS OFF', 0, () => {
      this.highlights = !this.highlights;
      this.drawControls();
      this.drawTicker();
    }, { ...o, fill: this.highlights ? PAL.gold : PAL.shadow, textColor: this.highlights ? PAL.ink : undefined });
    if (p.phase === 'intro') add(t ? 'SKIP INTRO >>' : 'SKIP INTRO', 0, () => this.endIntro(), { ...o, fill: PAL.plum, border: t ? PAL.gold : undefined });
    else if (p.phase === 'replay') add('SKIP REPLAY', 0, () => this.endReplay(), { ...o, fill: PAL.blood });
    else add(p.phase === 'ceremony' ? 'SKIP' : 'SKIP TO END', 0, () => this.skipToEnd(), { ...o, fill: PAL.blood });
    const lx = x + 2;
    // the bout label takes what's left (on a phone, the short form or nothing)
    const label = t ? boutLabel(s, p.bout).replace(/ • .*$/, '').replace(/ bout$/, '') : boutLabel(s, p.bout);
    if (W - lx - 4 >= 24 && label) c.addChild(text(label.toUpperCase(), lx, H - 12, { small: true, color: PAL.ash, width: W - lx - 4, maxLines: 1 }));
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
    const shown = p.shown;
    let y = boxH - 4;
    for (let i = shown.length - 1; i >= 0 && y > 4; i--) {
      const l = shown[i];
      const newest = i === shown.length - 1;
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
    // momentum (a tug of war from the middle) and the crowd's heat: drawn by drawMeters as they move
    tb.addChild(text('MOMENTUM', W - 64, 3, { small: true, color: PAL.ash }));
    tb.addChild(text('HEAT', W - 64, 19, { small: true, color: PAL.ash }));
    const g = new Graphics();
    tb.addChild(g);
    this.meterG = g;
    this.meterPull = -99;
    this.drawMeters();
    if (this.highlights) {
      tb.addChild(box(58, 9, PAL.gold)).position.set(W - 64, 29);
      tb.addChild(text('HIGHLIGHTS', W - 64, 31, { small: true, color: PAL.ink, width: 58, align: 'center' }));
    }
  }

  /** The momentum tug bar (red pulls left, blue pulls right) and the heat bar; cheap, and only when they change. */
  private drawMeters(): void {
    const g = this.meterG;
    const p = this.playing;
    if (!g || g.destroyed || !p) return;
    const lead = momLead(p.mom);
    const pull = Math.round(Math.max(-1, Math.min(1, lead)) * 28);
    const heat = Math.round(p.heat * 30);
    if (pull === this.meterPull && heat === this.meterHeat) return;
    this.meterPull = pull;
    this.meterHeat = heat;
    g.clear();
    const cx = W - 35;
    g.rect(W - 64, 10, 58, 6).fill(PAL.shadow);
    if (pull > 0) g.rect(cx - pull, 11, pull, 4).fill(RED);
    else if (pull < 0) g.rect(cx, 11, -pull, 4).fill(BLUE);
    g.rect(cx, 9, 1, 8).fill(PAL.bone);
    g.rect(W - 40, 19, 34, 6).fill(PAL.shadow);
    if (heat > 0) g.rect(W - 38, 20, Math.min(30, heat), 4).fill(p.heat >= 0.85 ? PAL.blood : p.heat >= 0.5 ? PAL.ember : PAL.gold);
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
    this.flushBooth();
    this.flushCornerTalk();
    for (let i = p.idx; i < p.lines.length; i++) p.shown.push(p.lines[i]);
    p.idx = p.lines.length;
    p.replayIn = 0;
    p.corner?.destroy({ children: true });
    p.ringcard?.destroy({ children: true });
    p.corner = null;
    p.ringcard = null;
    this.startCeremony();
  }

  /** NEXT RND: the rest of the round happens at once (quietly), straight to the bell; between rounds, out of the corner. */
  private nextRound(): void {
    const p = this.playing;
    if (!p || !this.arena || this.arena.destroyed) return;
    if (p.phase === 'corner') {
      // (a Fighter Mode corner still gets worked)
      p.phaseT = 0;
      this.flushCornerTalk();
      return;
    }
    if (p.phase === 'ringcard') {
      p.ringcard?.destroy({ children: true });
      p.ringcard = null;
      p.phase = 'fight';
      this.flushCornerTalk();
      sfx('bell');
      return;
    }
    if (p.phase !== 'fight' || p.over) return;
    const j = nextRoundIndex(p.lines, p.idx);
    if (j <= p.idx) return;
    this.flushBooth();
    this.arena.settle();
    for (let i = p.idx; i < j; i++) {
      this.arena.cue(p.lines[i], true);
      stepMomentum(p.mom, p.lines[i]);
      p.shown.push(p.lines[i]);
    }
    this.arena.settle();
    p.idx = j;
    p.timer = 0;
    p.talkT = 0;
    p.replayIn = 0;
    p.lastInt = 1;
    p.hlFast = false;
    this.drawTicker();
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
    // HIGHLIGHTS rushes the minor stuff: the fighters move double time through it
    this.arena.pace = this.highlights && p.hlFast ? 2 : Math.max(1, Math.min(2, speed));
    // (the live arena holds still under the instant replay)
    if (this.arena.visible) this.arena.update(dt);
    if (this.wipe) this.tickWipe(dt);
    if (!p.paused) this.tickBleets(dt * Math.min(2, speed));
    if (p.paused || this.g.modals.length) return;
    this.tickHeat(dt);
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
    if (p.phase === 'replay') return this.tickReplay(dt, speed);
    if (p.phase === 'corner') {
      p.phaseT -= dt * speed;
      this.tickCornerTalk(dt * speed);
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
      this.tickCornerTalk(dt * speed);
      if (!p.ringcard || !p.ringcard.update(dt * speed)) {
        p.ringcard?.destroy({ children: true });
        p.ringcard = null;
        p.phase = 'fight';
        this.flushCornerTalk();
        sfx('bell');
      }
      return;
    }
    if (p.phase === 'end') return;
    // a finish (in HIGHLIGHTS, a knockdown too) gets its instant replay once the live picture has had a moment
    if (p.replayIn > 0) {
      p.replayIn -= dt * Math.min(2, speed);
      if (p.replayIn <= 0) return this.startReplay();
    }
    p.clock += dt * speed;
    p.talkT -= dt * speed;
    // the booth reads out its queued lines one after another (about things the arena has already shown)
    if (p.boothQ.length && p.talkT <= 0) this.showBooth(p.boothQ.shift()!.l, speed);
    // the arena holds the next line while the fighters walk out or close the distance for an exchange
    if (this.arena.busy()) return;
    p.timer -= dt * speed;
    p.sinceAct += dt * speed;
    const nx = p.lines[p.idx];
    if (nx && nx.speaker && !blocksAction(nx)) {
      p.idx++;
      // HIGHLIGHTS: no chatter about the minor stuff
      if (this.highlights && this.minorBefore(p.idx - 1)) return;
      // the booth talks over the action: if it's still on its last line, this one waits its turn
      if (p.talkT <= 0 && !p.boothQ.length) this.showBooth(nx, speed);
      else this.queueBooth(nx);
      return;
    }
    // the finish, the decision and the end of a round wait for the booth to finish, and everything waits for them
    if (p.timer > 0 || (nx && nx.speaker && (p.talkT > 0 || p.boothQ.length))) return;
    if (p.idx >= p.lines.length) {
      if (p.replayIn > 0 || p.boothQ.length) return;
      p.phase = 'end';
      this.drawControls();
      setTimeout(() => {
        if (this.playing === p) this.startCeremony();
      }, 1400 / speed);
      return;
    }
    const line = p.lines[p.idx++];
    this.arena.cue(line);
    this.reactToLine(line);
    p.shown.push(line);
    if (line.speaker) {
      p.timer = talkBeat(line);
      p.talkT = p.timer;
      this.drawTicker();
      return;
    }
    this.onAction(line, speed);
    this.drawTicker();
    // round ended: corners cutaway, with the booth's round-end talk read out over it
    if (line.act === 'bell' && p.idx < p.lines.length) {
      const reps = (p.bout.result?.corners ?? []).filter((c) => c.round === line.round);
      if (reps.length) {
        const talk: TickerLine[] = [];
        for (const q of p.boothQ) talk.push(q.l);
        p.boothQ = [];
        while (p.lines[p.idx]?.speaker && p.lines[p.idx].round === line.round) talk.push(p.lines[p.idx++]);
        p.cornerTalk = talk;
        p.cornerTalkT = 0.8;
        p.talkT = 0;
        p.replayIn = 0;
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
        p.phaseT = Math.max(4.5, 1.6 * talk.length);
      }
    }
  }

  /** An action line just played: its beat, the clock, momentum and the crowd, and maybe a replay. */
  private onAction(line: TickerLine, speed: number): void {
    const p = this.playing!;
    p.hlFast = this.highlights && this.isMinor(line);
    p.sinceAct = 0;
    // the beat follows fight time: a follow-up shot lands right behind the first, a lull breathes
    const nxt = nextAction(p.lines, p.idx);
    p.timer = p.hlFast ? 0.15 : lineBeat(line, nxt);
    // and the clock runs on toward the next exchange instead of jumping there (through the walk out to the centre)
    const walk = line.key === 'opening' ? 4 : line.key === 'round_start' ? 2 : 0;
    p.clockAt = p.clock + p.timer + walk;
    if (nxt && nxt.round === line.round) this.arena!.clockTo(nxt.t, (p.clockAt - p.clock) / speed);
    stepMomentum(p.mom, line);
    p.lastInt = line.intensity;
    if (BIG_KEYS[line.key ?? ''] || line.act === 'ko' || line.act === 'tko' || line.act === 'tap') p.bigT = 3;
    if (isFinishLine(line)) {
      p.over = true;
      this.drawControls();
    }
    if (line.act === 'ko' || line.act === 'tko' || line.act === 'tap' || (this.highlights && line.key === 'knockdown')) this.armReplay();
  }

  /** HIGHLIGHTS skims these: low-intensity lines that aren't takedowns, scrambles or a man in trouble. */
  private isMinor(line: TickerLine): boolean {
    return line.intensity < 2 && !HL_KEEP[line.key ?? ''];
  }

  /** Is the action this booth line follows a minor one (or is there none yet)? */
  private minorBefore(idx: number): boolean {
    const p = this.playing!;
    for (let k = idx - 1; k >= 0; k--) if (!p.lines[k].speaker) return this.isMinor(p.lines[k]);
    return true;
  }

  /** Read the next round-end booth line over the corner. */
  private tickCornerTalk(dt: number): void {
    const p = this.playing!;
    if (!p.cornerTalk.length) return;
    p.cornerTalkT -= dt;
    if (p.cornerTalkT > 0) return;
    const l = p.cornerTalk.shift()!;
    this.arena?.cue(l);
    p.shown.push(l);
    this.drawTicker();
    p.cornerTalkT = 1.6;
  }

  private flushCornerTalk(): void {
    const p = this.playing!;
    if (!p.cornerTalk.length) return;
    for (const l of p.cornerTalk) p.shown.push(l);
    p.cornerTalk = [];
    this.drawTicker();
  }

  /** A booth line goes up on the ticker; the next action gives it a moment to be read. */
  private showBooth(l: TickerLine, speed: number): void {
    const p = this.playing!;
    this.arena?.cue(l);
    p.shown.push(l);
    this.drawTicker();
    p.talkT = talkBeat(l);
    // (but the booth never leaves the fighters standing there for more than a couple of seconds)
    p.timer = Math.max(p.timer, Math.min(1.1, 2.4 - p.sinceAct));
    // (if that holds the next exchange back, the clock takes longer getting there)
    if (p.clock + p.timer > p.clockAt) {
      p.clockAt = p.clock + p.timer;
      const na = nextAction(p.lines, p.idx);
      if (na && na.round === l.round) this.arena?.clockTo(na.t, p.timer / speed);
    }
  }

  /** The booth is still talking: this line waits its turn. Chatter that waited too long gives way to what's happening now. */
  private queueBooth(l: TickerLine): void {
    const p = this.playing!;
    for (let k = p.boothQ.length - 1; k >= 0; k--) {
      const q = p.boothQ[k];
      // (the pre-fight talk and the big calls always get said)
      if (p.clock - q.at > 4 && !URGENT_TALK[q.l.key ?? ''] && !(q.l.round === 1 && q.l.t === 0)) p.boothQ.splice(k, 1);
    }
    p.boothQ.push({ l, at: p.clock });
  }

  /** Everything the booth still had queued goes up at once. */
  private flushBooth(): void {
    const p = this.playing!;
    if (!p.boothQ.length) return;
    for (const q of p.boothQ) p.shown.push(q.l);
    p.boothQ = [];
    this.drawTicker();
  }

  /** Momentum fades in real time too; the crowd's heat follows it, the last line and any big moment. */
  private tickHeat(dt: number): void {
    const p = this.playing!;
    const f = Math.pow(0.97, dt);
    p.mom[0] *= f;
    p.mom[1] *= f;
    p.bigT = Math.max(0, p.bigT - dt);
    const heat = Math.max(0, Math.min(1, (0.25 * p.lastInt) / 3 + 0.5 * Math.abs(momLead(p.mom)) + (0.5 * p.bigT) / 3));
    // the first time it boils over in a round, the crowd gets to its feet
    const rnd = p.lines[p.idx - 1]?.round ?? 1;
    if (p.phase === 'fight' && heat >= 0.85 && p.feetRound !== rnd) {
      p.feetRound = rnd;
      p.feetDue = true;
    }
    // the picture and the meter: up fast, down slowly
    p.heat += (heat - p.heat) * Math.min(1, dt * (heat > p.heat ? 10 : 1.5));
    const a = this.arena;
    if (a && !a.destroyed) {
      a.heat = p.heat;
      // (after the KNOCKDOWN! has had its moment; never over a finish)
      if (p.feetDue && a.calloutT <= 0.6) {
        p.feetDue = false;
        if (!p.over && p.phase === 'fight') {
          a.showCallout('THE CROWD IS ON ITS FEET!');
          sfx('roar');
        }
      }
    }
    this.drawMeters();
  }

  /** Set up the instant replay of the line just played: the last four exchanges of the round up to it. */
  private armReplay(): void {
    const p = this.playing!;
    const to = p.idx - 1;
    const r = p.lines[to].round;
    let from = to;
    let n = 0;
    for (let k = to - 1; k >= 0 && p.lines[k].round === r; k--) {
      from = k;
      if (!p.lines[k].speaker) {
        n++;
        if (n >= 4) break;
      }
    }
    p.replayFrom = from;
    p.replayTo = to;
    p.replayIn = 2.2;
  }

  /** INSTANT REPLAY: a second arena, rebuilt quietly to just before the exchange, from the other camera. */
  private startReplay(): void {
    const p = this.playing!;
    p.replayIn = 0;
    if (!this.arena || this.rpView || p.replayTo < p.replayFrom) return;
    const rp = this.newArena();
    rp.setMode((this.g.settings.fightCam ?? 'side') === 'tv' ? 'side' : 'tv');
    rp.reduceMotion = this.g.settings.reduceShake;
    for (let i = 0; i < p.replayFrom; i++) rp.cue(p.lines[i], true);
    rp.settle();
    rp.replay = eventSponsors(this.g.state!, this.ev)[0]?.name ?? '';
    rp.visible = false; // revealed under the wipe
    this.root.addChildAt(rp, this.root.getChildIndex(this.arena) + 1);
    this.rpView = rp;
    p.rpIdx = p.replayFrom;
    p.rpT = 0.6;
    p.rpTail = -1;
    p.phase = 'replay';
    this.startWipe(false);
    this.drawControls();
  }

  /** The replay plays at a third of the speed; the booth's finish calls keep coming and narrate it. */
  private tickReplay(dt: number, speed: number): void {
    const p = this.playing!;
    const rp = this.rpView;
    const rs = Math.min(2, speed);
    if (rp && !rp.destroyed && !this.wipeOut) {
      rp.heat = p.heat;
      rp.update(dt * 0.35 * rs);
      p.rpT -= dt * rs;
      if (p.rpIdx <= p.replayTo) {
        if (p.rpT <= 0 && (!rp.busy() || p.rpT < -2)) {
          while (p.rpIdx <= p.replayTo && p.lines[p.rpIdx].speaker) p.rpIdx++;
          if (p.rpIdx <= p.replayTo) rp.cue(p.lines[p.rpIdx++]);
          p.rpT = 0.9;
        }
      } else if (p.rpTail < 0) {
        // the last line is out: once it has played, linger on it, then wipe back to the live picture
        if (!rp.busy() || p.rpT < -3) p.rpTail = 2.6;
      } else {
        p.rpTail -= dt * rs;
        if (p.rpTail <= 0) this.endReplay();
      }
    }
    p.timer -= dt * speed;
    p.talkT -= dt * speed;
    if (p.boothQ.length && p.talkT <= 0) this.showBooth(p.boothQ.shift()!.l, speed);
    const nx = p.lines[p.idx];
    if (p.timer <= 0 && p.talkT <= 0 && !p.boothQ.length && nx && nx.speaker) {
      p.idx++;
      this.arena?.cue(nx);
      p.shown.push(nx);
      this.drawTicker();
      p.timer = talkBeat(nx);
      p.talkT = p.timer;
    }
  }

  private endReplay(): void {
    if (!this.rpView || (this.wipe && this.wipeOut)) return;
    this.startWipe(true);
  }

  /** The broadcast wipe: a bar sweeps across (the picture swaps under it at half way) and off the other side. */
  private startWipe(out: boolean): void {
    if (!this.wipe || this.wipe.destroyed) {
      this.wipe = new Graphics();
      this.root.addChild(this.wipe);
    }
    this.wipeT = 0;
    this.wipeOut = out;
  }

  private tickWipe(dt: number): void {
    const g = this.wipe!;
    if (g.destroyed) {
      this.wipe = null;
      return;
    }
    const was = this.wipeT;
    this.wipeT += dt;
    const k = Math.min(1, this.wipeT / 0.25);
    if (was < 0.125 && this.wipeT >= 0.125) this.swapReplay();
    g.clear();
    if (k >= 1) {
      g.destroy();
      this.wipe = null;
      return;
    }
    const x0 = k < 0.5 ? 0 : (k - 0.5) * 2 * AW;
    const x1 = k < 0.5 ? k * 2 * AW : AW;
    g.rect(x0, 0, x1 - x0, AH).fill(0x0a0a10);
    g.rect(k < 0.5 ? x1 - 4 : x0, 0, 4, AH).fill(PAL.gold);
    g.rect(k < 0.5 ? x1 - 9 : x0 + 5, 0, 3, AH).fill(0xa01818);
  }

  /** Half way through the wipe: into the replay, or back out to the live arena (and on with the fight). */
  private swapReplay(): void {
    const rp = this.rpView;
    if (!this.wipeOut) {
      if (rp && !rp.destroyed) rp.visible = true;
      if (this.arena && !this.arena.destroyed) this.arena.visible = false;
      return;
    }
    if (rp && !rp.destroyed) rp.destroy({ children: true });
    this.rpView = null;
    if (this.arena && !this.arena.destroyed) this.arena.visible = true;
    const p = this.playing;
    if (p && p.phase === 'replay') {
      p.phase = 'fight';
      this.drawControls();
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
    // the booth's memory as it was before this bout, so the lines already heard come out the same
    const avoid = new Set(p.avoid0);
    const lines = [...boothOpen(s, this.ev, p.bout, p.seed, avoid), ...commentate(s, this.ev, p.bout, base, p.seed, avoid)];
    let at = lines.findIndex((l) => !l.speaker && l.act === 'bell' && l.round === round);
    if (at >= 0) {
      at++;
      while (lines[at]?.speaker && lines[at].round === round) at++;
      p.lines = lines;
      p.idx = at;
      p.boothQ = [];
      this.flushCornerTalk();
      this.boothSeen = avoid;
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
