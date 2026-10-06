/**
 * The post-fight press conference: step-and-repeat backdrop, the president
 * flanked by the night's winners (banged up, belts on shoulders), a room of
 * reporters with raised hands, camera flashes, and chaos.
 */
import { Container, Graphics } from 'pixi.js';
import type { Game } from './app';
import type { Bout, EventFinancials, FightEvent, Fighter } from '../core/types';
import { PAL, shade } from '../art/palette';
import { W, H, text, box, button, clickable } from './kit';
import type { PixelText } from './text';
import { fighterPortrait, reporterPortrait, npcPortrait } from './sprites';
import { content } from '../core/content';
import { Rng } from '../core/rng';
import { money } from '../core/format';
import { fullName, pronounize } from '../sim/fighters';
import { boutTitle } from '../sim/events';
import { fireCategory } from '../storylets/engine';
import { playStorylet } from './dialog';
import { expandPop } from '../sim/popculture';
import { adjustMeter } from '../sim/econ';
import { sfx } from '../audio/sfx';

interface Seat {
  who: 'president' | Fighter;
  bout?: Bout;
  x: number;
}

export class PostFightPresser extends Container {
  private flashG = new Graphics();
  private panel = new Container();
  private seats: Seat[] = [];
  private rng: Rng;
  private qas = 0;
  private flashes: { x: number; y: number; t: number }[] = [];
  private typing: { node: PixelText; full: string; shown: number } | null = null;

  constructor(
    private g: Game,
    private ev: FightEvent,
    private fin: EventFinancials,
    private bonusIds: string[],
    private onDone: () => void,
  ) {
    super();
    const s = g.state!;
    this.rng = new Rng((s.rng ^ 0x7e57) >>> 0);
    this.buildStage();
    this.addChild(this.flashG, this.panel);
    this.intro();
  }

  // ------------------------------------------------------------ staging

  private buildStage(): void {
    const s = this.g.state!;
    const bg = new Graphics();
    bg.rect(0, 0, W, 172).fill(0x101a2e);
    // step-and-repeat logo wall
    const sponsors = content().sponsors.map((x) => x.name);
    const promo = s.promotion.name.toUpperCase();
    this.addChild(bg);
    const wall = new Container();
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 6; col++) {
        const isPromo = (row + col) % 2 === 0;
        const label = isPromo ? promo : sponsors[(row * 6 + col) % Math.max(1, sponsors.length)] ?? 'SPONSOR';
        const x = col * 84 + (row % 2) * 42 - 20;
        const y = 4 + row * 16;
        bg.rect(x, y, 76, 12).fill(isPromo ? 0x1c2a48 : 0x16223a);
        wall.addChild(text(label.toUpperCase(), x + 2, y + 3, { small: true, width: 72, align: 'center', color: isPromo ? PAL.gold : 0x8aa2c8, maxLines: 1 }));
      }
    }
    wall.alpha = 0.75;
    this.addChild(wall);
    // seats: president in the middle, winners either side
    const live = this.ev.card.filter((b) => b.status === 'done' && b.result).sort((a, b) => a.position - b.position);
    const guests: { f: Fighter; b: Bout }[] = [];
    for (const b of live.slice(0, 3)) {
      const r = b.result!;
      const w = r.winner ? s.fighters[r.winner] : null;
      if (w && guests.length < 3) guests.push({ f: w, b });
      if (b.position === 0 && r.robbery && r.loser && s.fighters[r.loser] && guests.length < 4) guests.push({ f: s.fighters[r.loser], b });
    }
    if (!guests.length && live[0]) guests.push({ f: s.fighters[live[0].a], b: live[0] });
    const order: Seat['who'][] = [];
    guests.forEach((gst, i) => (i % 2 === 0 ? order.push(gst.f) : order.unshift(gst.f)));
    order.splice(Math.floor(order.length / 2), 0, 'president');
    const step = 76;
    const x0 = Math.round(W / 2 - (order.length * step) / 2);
    order.forEach((who, i) => {
      const x = x0 + i * step + 6;
      const seat: Seat = { who, x, bout: who === 'president' ? undefined : guests.find((gg) => gg.f === who)?.b };
      this.seats.push(seat);
      let por: Container;
      if (who === 'president') por = npcPortrait('president:' + s.president.name, 'exec', 64);
      else {
        const champ = Object.values(s.belts).some((bl) => bl.holder === who.id && !bl.retired);
        por = fighterPortrait(who, 64, champ ? 'belt' : 'press');
      }
      por.position.set(x, 50);
      this.addChild(por);
    });
    // the table, cloth, placards, mics, sponsor bottles
    const t = new Graphics();
    t.rect(20, 110, W - 40, 34).fill(0x2a1418).rect(20, 110, W - 40, 3).fill(PAL.gold);
    t.rect(20, 143, W - 40, 4).fill(0x150a0c);
    this.addChild(t);
    this.seats.forEach((seat) => {
      const mic = new Graphics();
      mic.rect(seat.x + 30, 96, 2, 14).fill(0x222226).circle(seat.x + 31, 95, 3).fill(0x3a3a44);
      mic.rect(seat.x + 46, 100, 5, 10).fill(0xb8d8f0).rect(seat.x + 46, 98, 5, 2).fill(0xe0e0e0); // water
      if (this.rng.chance(0.5)) mic.rect(seat.x + 8, 101, 5, 9).fill(0x1a6a3a).rect(seat.x + 9, 99, 3, 2).fill(0xc0c0c0); // energy can
      this.addChild(mic);
      const name = seat.who === 'president' ? s.president.name : fullName(seat.who);
      const plac = new Graphics().rect(seat.x + 4, 118, 56, 10).fill(0xf0eadc).stroke({ color: PAL.ink, width: 1 });
      this.addChild(plac);
      this.addChild(text(name.split(' ').slice(-1)[0].toUpperCase(), seat.x + 4, 120, { small: true, width: 56, align: 'center', color: PAL.ink, maxLines: 1 }));
    });
    this.addChild(text(`${this.ev.name.toUpperCase()}  •  POST-FIGHT PRESS CONFERENCE`, 0, 132, { width: W, align: 'center', small: true, color: PAL.gold }));
    // the press pit: backs of heads, cameras
    const pit = new Graphics();
    pit.rect(0, 147, W, 25).fill(0x0c0a0e);
    for (let i = 0; i < 34; i++) {
      const x = 6 + i * 14 + (i % 2) * 4;
      const y = 156 + (i % 3) * 3;
      pit.circle(x, y, 5).fill(shade(0x2a2226, ((i * 37) % 10) / 30));
      if (i % 5 === 2) pit.rect(x - 4, y - 12, 9, 7).fill(0x18181c).rect(x - 1, y - 10, 3, 3).fill(0x4a5a6a); // camera
    }
    this.addChild(pit);
  }

  // ------------------------------------------------------------ dialogue panel

  private say(speaker: string, portraitNode: Container | null, line: string, after: { label: string; fn: () => void; color?: number }[] = []): void {
    const p = this.panel;
    p.removeChildren().forEach((c) => c.destroy({ children: true }));
    p.addChild(box(W - 8, H - 176, PAL.night, PAL.ash, { bevel: true })).position.set(4, 174);
    let tx = 12;
    if (portraitNode) {
      portraitNode.position.set(10, 180);
      p.addChild(portraitNode);
      tx = 48;
    }
    p.addChild(text(speaker.toUpperCase(), tx, 180, { small: true, color: PAL.gold }));
    const t = text('', tx, 190, { width: W - tx - 14, color: PAL.bone });
    p.addChild(t);
    this.typing = { node: t, full: line, shown: 0 };
    const bw = Math.min(140, Math.floor((W - 20) / Math.max(1, after.length)) - 4);
    after.forEach((a, i) => {
      p.addChild(button(a.label, W - 12 - (after.length - i) * (bw + 4), H - 22, bw, 14, () => {
        sfx('click');
        a.fn();
      }, { small: true, fill: a.color ?? PAL.steel }));
    });
    this.flash(2);
  }

  private presLine(line: string, after: { label: string; fn: () => void; color?: number }[]): void {
    const s = this.g.state!;
    this.say(s.president.name + ' (President)', npcPortrait('president:' + s.president.name, 'exec', 32), line, after);
  }

  // ------------------------------------------------------------ flow

  private intro(): void {
    const s = this.g.state!;
    const live = this.ev.card.filter((b) => b.status === 'done' && b.result);
    const fotn = live.slice().sort((a, b) => b.result!.fotn - a.result!.fotn)[0];
    const bonusNames = this.bonusIds.map((id) => s.fighters[id]?.last).filter(Boolean);
    const lines = [
      `Tonight: ${this.fin.attendance.toLocaleString()} in the building, a ${money(this.fin.gate)} gate${this.fin.ppvBuys ? `, ${this.fin.ppvBuys.toLocaleString()} pay-per-view buys` : ''}.`,
      fotn ? `Fight of the Night: ${boutTitle(s, fotn)}.` : '',
      bonusNames.length ? `Performance bonuses go to ${bonusNames.join(', ')}.` : 'No bonuses tonight. Nobody earned one. I said what I said.',
    ].filter(Boolean).join(' ');
    this.presLine(lines, [{ label: 'OPENING STATEMENT →', fn: () => this.opening() }]);
  }

  private opening(): void {
    const q = content().templates.presserQ ?? {};
    const pick = (k: string) => expandPop(this.rng.pick(q[k] ?? ['Thanks for coming.']));
    this.presLine('How do you want to open?', [
      { label: 'HYPE IT UP', fn: () => { adjustMeter(this.g.state!, 'fans', 1); this.presLine(pick('open_hype'), [{ label: 'TAKE QUESTIONS →', fn: () => this.hands() }]); } },
      { label: 'THANK THE FIGHTERS', fn: () => { adjustMeter(this.g.state!, 'fighters', 1); this.presLine(pick('open_thanks'), [{ label: 'TAKE QUESTIONS →', fn: () => this.hands() }]); } },
      { label: 'RANT AT THE JUDGES', fn: () => { adjustMeter(this.g.state!, 'commission', -2); adjustMeter(this.g.state!, 'media', 1); this.presLine(pick('open_rant'), [{ label: 'TAKE QUESTIONS →', fn: () => this.hands() }]); } },
    ]);
  }

  /** Raised hands: three reporters to pick from, or wrap it up. */
  private hands(): void {
    const s = this.g.state!;
    if (this.qas >= 4) return this.closing();
    // the occasional bit of chaos between questions
    if (this.qas > 0 && this.rng.chance(0.35)) {
      const fs = this.seats.filter((x) => x.who !== 'president').map((x) => x.who as Fighter);
      const f = fs.length ? this.rng.pick(fs) : null;
      const sp = content().sponsors.filter((x) => x.category === 'energy' || x.category === 'drinks');
      const line = this.rng.pick(content().templates.presserQ?.chaos ?? ['The room goes quiet.'])
        .replace(/\{f\}/g, f?.last ?? 'Somebody')
        .replace(/\{sponsor\}/g, sp.length ? this.rng.pick(sp).name : 'sponsor');
      this.say('Meanwhile...', null, expandPop(f ? pronounize(line, f) : line), [{ label: 'CONTINUE →', fn: () => this.handsPick() }]);
      return;
    }
    this.handsPick();
    void s;
  }

  private handsPick(): void {
    const s = this.g.state!;
    const reps = content().reporters.filter((x) => !s.media.reporters[x.id]?.banned);
    const p = this.panel;
    p.removeChildren().forEach((c) => c.destroy({ children: true }));
    p.addChild(box(W - 8, H - 176, PAL.night, PAL.ash, { bevel: true })).position.set(4, 174);
    p.addChild(text(`Hands go up. Who do you call on? (${4 - this.qas} questions left)`, 12, 179, { small: true, color: PAL.ash }));
    const hands = this.rng.sample(reps, Math.min(3, reps.length));
    hands.forEach((rep, i) => {
      const c = clickable(new Container(), () => this.question(rep.id));
      c.addChild(box(140, 52, 0x2a2630, PAL.shadow));
      const por = reporterPortrait(rep, 32);
      por.position.set(3, 3);
      c.addChild(por);
      c.addChild(text(rep.name, 39, 4, { small: true, width: 98, color: PAL.bone, maxLines: 2 }));
      c.addChild(text(content().outlets.find((o) => o.id === rep.outlet)?.name ?? '', 39, 19, { small: true, width: 98, color: PAL.ash, maxLines: 2 }));
      const rel = s.media.reporters[rep.id]?.rel ?? 0;
      c.addChild(text(rel > 20 ? 'friendly' : rel < -20 ? 'HOSTILE' : 'neutral', 39, 40, { small: true, color: rel > 20 ? PAL.moss : rel < -20 ? PAL.blood : PAL.ash }));
      c.position.set(10 + i * 146, 189);
      p.addChild(c);
    });
    p.addChild(button('WRAP IT UP', W - 86, H - 22, 74, 14, () => this.closing(), { small: true, fill: PAL.blood }));
    this.flash(4);
  }

  private question(repId: string): void {
    const s = this.g.state!;
    this.qas++;
    const rep = content().reporters.find((r) => r.id === repId)!;
    const fighters = this.seats.filter((x) => x.who !== 'president');
    // half the time the reporter goes after a fighter; otherwise it's on you
    if (fighters.length && this.rng.chance(0.5)) return this.fighterQuestion(rep.id, this.rng.pick(fighters));
    const rng2 = new Rng(s.rng);
    const inst = fireCategory(s, 'presser', rng2, { postFight: true, eventName: this.ev.name }, { reporter: rep.id }, this.ev.id);
    s.rng = rng2.state;
    if (!inst) return this.fighterQuestion(rep.id, fighters[0] ?? this.seats[0]);
    playStorylet(this.g, inst, () => this.hands());
  }

  private fighterQuestion(repId: string, seat: Seat): void {
    const s = this.g.state!;
    if (seat.who === 'president') return this.hands();
    const f = seat.who;
    const rep = content().reporters.find((r) => r.id === repId)!;
    const q = content().templates.presserQ ?? {};
    const r = seat.bout?.result;
    const champ = Object.values(s.belts).some((bl) => bl.holder === f.id && !bl.retired);
    const won = r?.winner === f.id;
    const robbed = !!r?.robbery && r.loser === f.id;
    const qk = robbed ? 'to_robbed' : !won ? 'to_loser' : champ && this.rng.chance(0.5) ? 'to_champ' : 'to_winner';
    const ak = robbed ? 'answer_robbed' : !won ? 'answer_loser' : qk === 'to_champ' ? 'answer_champ' : 'answer_winner';
    const adj = this.rng.pick(['sharp', 'dangerous', 'tired', 'unstoppable', 'a little confused', 'like a different person']);
    const fill = (t: string) => expandPop(pronounize(t.replace(/\{f\}/g, f.first).replace(/\{adj\}/g, adj).replace(/\{president\}/g, s.president.name.split(' ').slice(-1)[0]), f));
    const question = fill(this.rng.pick(q[qk] ?? ['What\'s next?']));
    let answer = fill(this.rng.pick(q[ak] ?? ['No comment.']));
    // trash talkers can't help themselves
    if (won && (f.traits.includes('Trash Talker') || f.traits.includes('Showman')) && this.rng.chance(0.6)) {
      const rival = Object.values(s.fighters).find((o) => o.division === f.division && o.id !== f.id && o.status === 'active' && o.promotion === 'us' && o.id !== r?.loser);
      const call = content().templates.presser.callout ?? [];
      if (rival && call.length) answer += ' ' + this.rng.pick(call).replace(/\{opp\}/g, rival.last).replace(/\{president\}/g, s.president.name.split(' ').slice(-1)[0]);
    }
    this.say(rep.name, reporterPortrait(rep, 32), question, [{
      label: `${f.last.toUpperCase()} ANSWERS →`, fn: () => {
        this.say(fullName(f), fighterPortrait(f, 32), answer, [{ label: 'NEXT QUESTION →', fn: () => this.hands() }]);
        if (/robb|judges/i.test(answer)) adjustMeter(s, 'commission', -1);
        f.hype = Math.min(100, f.hype + 2);
      },
    }]);
  }

  private closing(): void {
    const s = this.g.state!;
    const lines = [
      'Thanks everybody. Drive safe. Don\'t sue us.',
      'That\'s it. Go home. Tip your bartenders. Tip your cutmen. Especially your cutmen.',
      'We\'re done here. If you have more questions, email my assistant, who does not exist.',
      `See you at the next one. ${s.promotion.name}: we're the {pop_brand} of fighting.`,
    ];
    this.presLine(expandPop(this.rng.pick(lines)), [{ label: 'TO THE NEWS →', fn: () => this.onDone(), color: PAL.blood }]);
  }

  // ------------------------------------------------------------ frame

  private flash(n: number): void {
    for (let i = 0; i < n; i++) this.flashes.push({ x: 10 + Math.random() * (W - 20), y: 140 + Math.random() * 20, t: 0.12 + Math.random() * 0.4 });
  }

  update(dt: number): void {
    if (Math.random() < dt * 1.2) this.flash(1);
    const g = this.flashG;
    g.clear();
    this.flashes = this.flashes.filter((f) => (f.t -= dt) > 0);
    for (const f of this.flashes) {
      g.circle(f.x, f.y, 4).fill({ color: 0xffffff, alpha: Math.min(1, f.t * 6) });
      g.circle(f.x, f.y, 14).fill({ color: 0xffffff, alpha: Math.min(0.25, f.t * 2) });
    }
    // typewriter
    const ty = this.typing;
    if (ty && !ty.node.destroyed && ty.shown < ty.full.length) {
      const speed = [40, 40, 80, 160, 9999][this.g.settings.textSpeed] ?? 80;
      ty.shown = Math.min(ty.full.length, ty.shown + dt * speed);
      ty.node.setText(ty.full.slice(0, Math.floor(ty.shown)));
    }
  }
}
