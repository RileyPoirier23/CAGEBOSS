/**
 * Matchmaking corkboard: build cards for upcoming events. Fighter cards are
 * pinned with string; add / remove / reorder bouts, make title fights,
 * change venue, create new events (event builder), handle replacements.
 */
import { Container, Graphics } from 'pixi.js';
import type { Game } from '../app';
import type { FightEvent, Fighter, Bout } from '../../core/types';
import { PAL, shade } from '../../art/palette';
import { W, H, text, button, box, ScrollBox, clickable, paper } from '../kit';
import { fighterPortrait } from '../sprites';
import { openReplacementPicker } from '../replace';
import { openWindow, alertBox, selector } from '../widgets';
import { rematchTag } from '../../sim/events';
import {
  upcomingEvents, bookable, canFight, makeBout, renumber, autoCard, cardProblems, findReplacement, estimateFinancials, createEvent, venueRegion, cardDraw,
} from '../../sim/events';
import { rankLabel, undisputed, interim } from '../../sim/rankings';
import { quickOdds, oddsString } from '../../sim/fight';
import { fullName, seenOverall } from '../../sim/fighters';
import { divisionShort, divisionName, DIVISION_ORDER } from '../../sim/divisions';
import { fmtFightDate } from '../../core/time';
import { money, record } from '../../core/format';
import { content } from '../../core/content';
import { Rng } from '../../core/rng';
import { sfx } from '../../audio/sfx';

export function openCorkboard(g: Game, onClose: () => void): void {
  const s = g.state!;
  let evId = upcomingEvents(s)[0]?.id ?? null;
  const win = openWindow(g, 'Matchmaking corkboard', W - 8, H - 8, { onClose, x: 4, y: 4, paper: 'cork' });
  const body = win.body;
  const draw = () => {
    body.removeChildren().forEach((c) => c.destroy({ children: true }));
    const evs = upcomingEvents(s);
    // event tabs
    evs.slice(0, 5).forEach((e, i) => {
      const lab = `${fmtFightDate(e.week)}${e.number !== null ? ' #' + e.number : ' FN'}`;
      body.addChild(button(lab, 4 + i * 74, 0, 72, 12, () => { evId = e.id; draw(); }, { small: true, fill: e.id === evId ? PAL.gold : PAL.woodDark, textColor: e.id === evId ? PAL.ink : PAL.bone }));
    });
    body.addChild(button('+ NEW EVENT', W - 92, 0, 78, 12, () => newEvent(), { small: true, fill: PAL.moss }));
    const ev = evs.find((e) => e.id === evId) ?? evs[0];
    if (!ev) {
      body.addChild(text('No upcoming events. Create one.', 8, 20, { color: PAL.bone }));
      return;
    }
    evId = ev.id;
    // header card
    const head = paper(W - 16, 26, 'white', 5);
    head.position.set(4, 15);
    body.addChild(head);
    const venue = content().venues.find((v) => v.id === ev.venue);
    head.addChild(text(ev.name, 4, 3, { color: PAL.ink, width: 220, maxLines: 1 }));
    head.addChild(text(`${fmtFightDate(ev.week)}  •  ${venue?.name ?? ev.venue} (${venue?.capacity.toLocaleString()} seats)  •  ${ev.ppv ? 'PPV' : 'TV'}`, 4, 14, { small: true, color: PAL.slate, width: 300 }));
    const fin = estimateFinancials(s, ev);
    head.addChild(text(`DRAW ${Math.round(cardDraw(s, ev))}  EST. GATE ${money(fin.gate)}${ev.ppv ? `  BUYS ~${fin.ppvBuys.toLocaleString()}` : ''}  PURSES ${money(fin.purses)}`, 228, 3, { small: true, color: PAL.ink, width: 230 }));
    head.addChild(button('VENUE', 360, 12, 40, 11, () => pickVenue(ev), { small: true }));
    head.addChild(button('AUTO-FILL', 404, 12, 48, 11, () => {
      const rng = new Rng(s.rng);
      autoCard(s, ev, rng);
      s.rng = rng.state;
      sfx('paper');
      draw();
    }, { small: true, fill: PAL.steel }));
    // card
    const sb = new ScrollBox(W - 16, H - 82);
    sb.position.set(4, 44);
    const live = ev.card.filter((b) => b.status === 'scheduled').sort((a, b) => a.position - b.position);
    const problems = cardProblems(s, ev);
    live.forEach((b, i) => sb.content.addChild(boutRow(ev, b, i, live.length, problems.filter((p) => p.bout === b).map((p) => `${s.fighters[p.fighter]?.last}: ${p.reason}`))).position.set(0, i * 30));
    body.addChild(sb);
    sb.refresh();
    body.addChild(button('+ ADD BOUT', 4, H - 36, 80, 14, () => pickFighters(ev), { fill: PAL.moss }));
    body.addChild(text(`${live.length} bouts. Fighters need ${5} weeks between fights. Main event & title fights are 5 rounds.`, 90, H - 32, { small: true, color: PAL.bone }));
  };

  const boutRow = (ev: FightEvent, b: Bout, i: number, n: number, probs: string[]): Container => {
    const c = new Container();
    const A = s.fighters[b.a];
    const B = s.fighters[b.b];
    c.addChild(box(W - 22, 28, i === 0 ? 0x5a3a28 : 0x4a3424, PAL.woodDark));
    const label = i === 0 ? 'MAIN EVENT' : i === 1 ? 'CO-MAIN' : i < 5 ? 'MAIN CARD' : 'PRELIMS';
    c.addChild(text(label, 4, 2, { small: true, color: i === 0 ? PAL.gold : PAL.ash }));
    c.addChild(text(`${b.rounds}R${rematchTag(b) ? ' ★' + rematchTag(b) : ''}${b.title ? ' ★ ' + (s.belts[b.title]?.name ?? '') : ''}${b.catchweight ? ' CATCHWEIGHT' : ''}${b.shortNotice ? ' SHORT NOTICE' : ''}`, 4, 20, { small: true, color: b.title ? PAL.gold : PAL.ash, width: 120, maxLines: 1 }));
    const side = (f: Fighter, x: number, right: boolean) => {
      const p = fighterPortrait(f, 24);
      p.position.set(right ? x + 106 : x, 2);
      c.addChild(p);
      c.addChild(text(fullName(f), right ? x : x + 28, 3, { width: 104, color: PAL.bone, align: right ? 'right' : 'left', maxLines: 1 }));
      c.addChild(text(`${record(f.record)} ${rankLabel(s, f.id)} OVR~${seenOverall(f)}`, right ? x : x + 28, 14, { small: true, width: 104, color: PAL.ash, align: right ? 'right' : 'left' }));
    };
    if (A) side(A, 76, false);
    if (B) side(B, 222, true);
    c.addChild(text('VS' + rematchTag(b), 211, 9, { color: PAL.blood }));
    if (A && B) {
      const p = quickOdds(A, B);
      c.addChild(text(`${oddsString(p)} / ${oddsString(1 - p)}`, 196, 19, { small: true, color: PAL.ash }));
    }
    // string pins
    const g = new Graphics();
    g.circle(76, 3, 2).fill(PAL.blood).circle(350, 3, 2).fill(PAL.blood);
    g.moveTo(76, 3).lineTo(350, 3).stroke({ color: PAL.blood, width: 1, alpha: 0.6 });
    c.addChild(g);
    if (probs.length) c.addChild(text('PROBLEM: ' + probs.join('; '), 76, 20, { small: true, color: PAL.blood, width: 280 }));
    // controls
    const bx = W - 22 - 104;
    c.addChild(button('↑', bx, 2, 12, 11, () => move(ev, b, -1), { small: true }));
    c.addChild(button('↓', bx + 14, 2, 12, 11, () => move(ev, b, 1), { small: true }));
    c.addChild(button('X', bx + 28, 2, 12, 11, () => { b.status = 'cancelled'; renumber(ev); sfx('paper'); draw(); }, { small: true, fill: PAL.blood }));
    const belt = undisputed(s, b.division);
    const canTitle = belt && ev.number !== null && (belt.holder === b.a || belt.holder === b.b || !belt.holder);
    if (canTitle && !b.title) c.addChild(button('TITLE', bx + 42, 2, 30, 11, () => { b.title = belt!.id; b.rounds = 5; draw(); }, { small: true, fill: PAL.gold, textColor: PAL.ink }));
    else if (b.title) c.addChild(button('NO TITLE', bx + 42, 2, 40, 11, () => { b.title = null; renumber(ev); draw(); }, { small: true }));
    else if (!interim(s, b.division) && belt?.holder && ![b.a, b.b].includes(belt.holder)) c.addChild(button('INTERIM', bx + 42, 2, 36, 11, () => makeInterim(ev, b), { small: true, fill: PAL.plum }));
    if (probs.length) c.addChild(button('REPLACE', bx, 15, 44, 11, () => replace(ev, b), { small: true, fill: PAL.ember }));
    return c;
  };

  const move = (ev: FightEvent, b: Bout, d: number) => {
    const live = ev.card.filter((x) => x.status === 'scheduled').sort((a, c) => a.position - c.position);
    const i = live.indexOf(b);
    const j = i + d;
    if (j < 0 || j >= live.length) return;
    [live[i].position, live[j].position] = [live[j].position, live[i].position];
    renumber(ev);
    sfx('click');
    draw();
  };

  const makeInterim = (ev: FightEvent, b: Bout) => {
    const name = `Interim ${divisionName(b.division)} Championship`;
    const belt = Object.values(s.belts).find((x) => x.name === name && !x.retired) ?? (() => {
      const id = 'belt_int_' + b.division + '_' + s.week;
      s.belts[id] = { id, name, division: b.division, holder: null, interim: true, symbolic: false, createdWeek: s.week, defenses: 0, design: { plate: 1, strap: 1, gem: 1 }, history: [] };
      return s.belts[id];
    })();
    b.title = belt.id;
    b.rounds = 5;
    s.meters.fans = Math.max(0, s.meters.fans - 1); // purists hate interim belts
    s.meters.network = Math.min(100, s.meters.network + 1);
    g.toast('Interim belt created. Purists are furious. Network is thrilled.', PAL.gold);
    draw();
  };

  const replace = (ev: FightEvent, b: Bout) => {
    const p = cardProblems(s, ev).find((q) => q.bout === b);
    if (!p) return;
    openReplacementPicker(g, ev, b, p.fighter, p.reason, () => draw());
  };

  const pickVenue = (ev: FightEvent) => {
    const vs = content().venues.filter((v) => s.venuesUnlocked.includes(v.id));
    const w2 = openWindow(g, 'Pick a venue', 320, 220);
    const sb = new ScrollBox(310, 190);
    sb.position.set(4, 2);
    vs.forEach((v, i) => {
      const row = clickable(new Container(), () => {
        ev.venue = v.id;
        ev.region = venueRegion(v.id);
        w2.close();
        draw();
      });
      row.addChild(box(300, 22, v.id === ev.venue ? PAL.slate : 0x2a2630));
      row.addChild(text(`${v.name}  (${v.capacity.toLocaleString()} seats, ${money(v.cost)})`, 3, 2, { small: true, color: PAL.bone, width: 294 }));
      row.addChild(text(v.blurb, 3, 10, { small: true, color: PAL.ash, width: 294, maxLines: 2 }));
      row.position.set(0, i * 24);
      sb.content.addChild(row);
    });
    w2.body.addChild(sb);
    sb.refresh();
  };

  const newEvent = () => {
    const taken = new Set(s.events.filter((e) => e.status === 'scheduled').map((e) => e.week));
    let wk = s.week + 2;
    while (taken.has(wk) && wk < s.week + 30) wk++;
    let numbered = false;
    const w2 = openWindow(g, 'Event builder', 260, 110);
    w2.body.addChild(text('Week', 6, 6, { color: PAL.ash }));
    const opts = [];
    for (let i = s.week + 2; i < s.week + 16; i++) if (!taken.has(i)) opts.push({ value: i, label: fmtFightDate(i) + ` (wk ${i + 1})` });
    w2.body.addChild(selector(60, 3, 190, opts, wk, (v) => (wk = v)));
    w2.body.addChild(text('Type', 6, 24, { color: PAL.ash }));
    w2.body.addChild(selector(60, 21, 190, [{ value: false, label: 'Fight Night (TV)' }, { value: true, label: 'Numbered event (PPV if possible)' }], false, (v) => (numbered = v)));
    w2.body.addChild(button('CREATE', 90, 60, 80, 16, () => {
      const rng = new Rng(s.rng);
      const ev = createEvent(s, wk, numbered, rng);
      s.rng = rng.state;
      evId = ev.id;
      w2.close();
      draw();
    }, { fill: PAL.moss }));
  };

  const pickFighters = (ev: FightEvent) => {
    let a: Fighter | null = null;
    let div = 'all';
    const w2 = openWindow(g, 'Pick fighters', W - 40, H - 30);
    const draw2 = () => {
      w2.body.removeChildren().forEach((c) => c.destroy({ children: true }));
      const used = new Set(ev.card.filter((b) => b.status === 'scheduled').flatMap((b) => [b.a, b.b]));
      let pool = bookable(s, ev.week, used);
      if (a) pool = pool.filter((f) => canFight(s, a!, f));
      const divs = ['all', ...DIVISION_ORDER.filter((d) => s.divisionsOpen.includes(d))];
      divs.forEach((d, i) => w2.body.addChild(button(d === 'all' ? 'ALL' : divisionShort(d), 4 + i * 28, 0, 27, 11, () => { div = d; draw2(); }, { small: true, fill: div === d ? PAL.steel : PAL.shadow })));
      if (div !== 'all') pool = pool.filter((f) => f.division === div);
      pool.sort((x, y) => DIVISION_ORDER.indexOf(x.division) - DIVISION_ORDER.indexOf(y.division) || seenOverall(y) - seenOverall(x));
      w2.body.addChild(text(a ? `Opponent for ${fullName(a)} (${divisionName(a.division)}):` : 'Pick the first fighter:', 4, 14, { color: PAL.gold }));
      const sb = new ScrollBox(W - 52, H - 72);
      sb.position.set(4, 26);
      pool.forEach((f, i) => {
        const row = clickable(new Container(), () => {
          if (!a) {
            a = f;
            draw2();
          } else {
            const b = makeBout(s, ev, a, f, ev.card.filter((x) => x.status === 'scheduled').length, null);
            ev.card.push(b);
            renumber(ev);
            sfx('paper');
            w2.close();
            draw();
          }
        });
        row.addChild(box(W - 60, 13, i % 2 ? 0x2a2630 : 0x24212a));
        const odds = a ? `  ${oddsString(quickOdds(a, f))}` : '';
        row.addChild(text(`${divisionShort(f.division)}  ${fullName(f)}  ${record(f.record)}  ${rankLabel(s, f.id)}  OVR~${seenOverall(f)}  STAR ${f.starPower}${odds}`, 3, 3, { small: true, color: PAL.bone }));
        row.position.set(0, i * 14);
        sb.content.addChild(row);
      });
      if (!pool.length) sb.content.addChild(text('Nobody available.', 4, 4, { color: PAL.ash }));
      w2.body.addChild(sb);
      sb.refresh();
    };
    draw2();
  };
  draw();
}

export { shade };
