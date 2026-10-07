/**
 * Career-mode UI: the owner's check-in, the UNLOCKED moment, and the career
 * overview window (tier ladder, unlocks, objectives).
 */
import { Container, Graphics, Ticker } from 'pixi.js';
import type { Game } from './app';
import type { OwnerObjective } from '../core/types';
import { PAL, shade } from '../art/palette';
import { W, H, text, box, button, ScrollBox } from './kit';
import { PixelText } from './text';
import { fighterPortrait, npcPortrait } from './sprites';
import { openWindow } from './widgets';
import { content } from '../core/content';
import { money, record } from '../core/format';
import { fmtFightDate, fmtDate } from '../core/time';
import { sfx } from '../audio/sfx';
import { fullName, seenOverall, seenPotential, grade } from '../sim/fighters';
import { divisionName } from '../sim/divisions';
import {
  ensureCareer, TIERS, UNLOCKS, nextUnlock, ownerMood, resolveGift, finishOwnerVisit, ownerPerson, hasUnlock,
} from '../sim/career';

const MOOD: Record<string, [string, number]> = { pleased: ['PLEASED', PAL.moss], neutral: ['IMPATIENT', PAL.ember], furious: ['FURIOUS', PAL.blood] };

export function ownerPortrait(g: Game, size: 64 | 32 = 64): Container {
  const s = g.state!;
  return npcPortrait('owner:' + ownerPerson(s), 'exec', size);
}

/** Small clout progress bar toward the next unlock. */
export function cloutBar(g: Game, w: number): Container {
  const s = g.state!;
  const c = ensureCareer(s);
  const nu = nextUnlock(s);
  const prev = [...UNLOCKS].reverse().find((u) => c.unlocks.includes(u.id))?.clout ?? 0;
  const goal = nu?.clout ?? prev;
  const frac = nu ? Math.max(0, Math.min(1, (c.clout - prev) / Math.max(1, goal - prev))) : 1;
  const out = new Container();
  out.addChild(box(w, 5, PAL.ink, PAL.shadow));
  out.addChild(box(Math.max(1, Math.round((w - 2) * frac)), 3, PAL.gold)).position.set(1, 1);
  return out;
}

function objLine(o: OwnerObjective): string {
  const mark = o.status === 'met' ? '✓ ' : o.status === 'failed' ? '✗ ' : '• ';
  return mark + o.text;
}

// ---------------------------------------------------------------- owner check-in

export function showOwnerCheckIn(g: Game, onDone: () => void): void {
  const s = g.state!;
  const c = ensureCareer(s);
  const v = c.owner.visit;
  if (!v) return onDone();
  const frame = new Container();
  const wrap = g.modal(frame, { dim: 0.65 });
  const bw = 440;
  const bh = 224;
  const bx = Math.round((W - bw) / 2);
  const by = Math.round((H - bh) / 2);
  sfx('thud');

  // the owner's speech, paginated so nothing overflows
  const speech = v.lines.filter(Boolean);
  const gift = v.gift ? s.fighters[v.gift.fighter] : null;
  const giftLine = gift ? speech.find((l) => l.includes(fullName(gift)) || l.includes(gift.first)) ?? '' : '';
  const signoff = speech[speech.length - 1] ?? '';
  const talk = speech.filter((l) => l !== giftLine && l !== signoff);
  const TW = bw - 96;
  const MAXH = 120;
  const pages: string[][] = [[]];
  for (const l of talk) {
    const cur = pages[pages.length - 1];
    const probe = new PixelText([...cur, l].join('\n\n'), { width: TW, color: PAL.bone });
    const tooBig = probe.textHeight > MAXH && cur.length > 0;
    probe.destroy();
    if (tooBig) pages.push([l]);
    else cur.push(l);
  }
  type Step = { kind: 'talk'; lines: string[] } | { kind: 'report' } | { kind: 'gift' } | { kind: 'reaction'; line: string } | { kind: 'bye' };
  const steps: Step[] = pages.filter((p) => p.length).map((lines) => ({ kind: 'talk' as const, lines }));
  if (v.results.length || v.objectives.length) steps.push({ kind: 'report' });
  if (gift) steps.push({ kind: 'gift' });
  steps.push({ kind: 'bye' });
  let idx = 0;
  let typing: { node: PixelText; full: string; shown: number } | null = null;
  const tick = (t: Ticker) => {
    if (!typing || typing.node.destroyed) return;
    const speed = [0, 50, 100, 240, 99999][g.settings.textSpeed] ?? 100;
    typing.shown = Math.min(typing.full.length, typing.shown + speed * t.deltaMS / 1000);
    typing.node.setText(typing.full.slice(0, Math.floor(typing.shown)));
    if (typing.shown >= typing.full.length) typing = null;
  };
  g.app.ticker.add(tick);
  const close = () => {
    g.app.ticker.remove(tick);
    finishOwnerVisit(s);
    g.closeModal(wrap);
    onDone();
  };

  const chrome = (title: string) => {
    frame.removeChildren().forEach((ch) => ch.destroy({ children: true }));
    frame.addChild(box(bw, bh, PAL.night, PAL.gold, { shadow: true, bevel: true })).position.set(bx, by);
    frame.addChild(box(bw, 12, shade(PAL.gold, -0.45))).position.set(bx, by);
    frame.addChild(text(title, bx + 4, by + 3, { small: true, color: PAL.bone }));
    const [mood, mc] = MOOD[ownerMood(s)];
    frame.addChild(text(`MOOD: ${mood}`, bx + bw - 90, by + 3, { small: true, color: mc, width: 86, align: 'right' }));
  };
  const ownerSide = () => {
    const p = ownerPortrait(g, 64);
    p.position.set(bx + 8, by + 18);
    frame.addChild(p);
    frame.addChild(text(ownerPerson(s), bx + 4, by + 86, { small: true, color: PAL.gold, width: 74, align: 'center', maxLines: 3 }));
    frame.addChild(text(s.owner.name, bx + 4, by + 106, { small: true, color: PAL.ash, width: 74, align: 'center', maxLines: 4 }));
  };
  const next = (label = 'CONTINUE →', fn = () => { idx++; draw(); }) => {
    frame.addChild(button(label, bx + bw - 104, by + bh - 20, 96, 14, () => {
      sfx('click');
      fn();
    }, { fill: PAL.slate }));
  };
  const clout = () => {
    const tier = TIERS[c.tier];
    const nu = nextUnlock(s);
    frame.addChild(text(`${tier.name.toUpperCase()}  •  CLOUT ${Math.floor(c.clout)}${nu ? `  •  NEXT: ${nu.name} (${nu.clout})` : ''}`, bx + 8, by + bh - 34, { small: true, color: PAL.gold, width: bw - 16, maxLines: 1 }));
    const bar = cloutBar(g, bw - 120);
    bar.position.set(bx + 8, by + bh - 17);
    frame.addChild(bar);
  };

  const draw = () => {
    const st = steps[idx];
    if (!st) return close();
    typing = null;
    switch (st.kind) {
      case 'talk': {
        chrome(`OWNER CHECK-IN  •  ${fmtDate(s.week)}`);
        ownerSide();
        const body = text('', bx + 88, by + 20, { width: TW, color: PAL.bone });
        frame.addChild(body);
        typing = { node: body, full: st.lines.join('\n\n'), shown: 0 };
        const skip = new Graphics().rect(bx, by + 12, bw, bh - 40).fill({ color: 0, alpha: 0.001 });
        skip.eventMode = 'static';
        skip.on('pointertap', () => {
          if (typing) {
            typing.node.setText(typing.full);
            typing = null;
          }
        });
        frame.addChild(skip);
        clout();
        next();
        break;
      }
      case 'report': {
        chrome('OWNER CHECK-IN  •  THE REPORT CARD');
        ownerSide();
        let y = by + 18;
        const x = bx + 88;
        const res = v.results.map((id) => c.owner.objectives.find((o) => o.id === id)).filter((o): o is OwnerObjective => !!o);
        if (res.length) {
          frame.addChild(text('SINCE LAST TIME', x, y, { small: true, color: PAL.ash }));
          y += 9;
          for (const o of res.slice(0, 4)) {
            const t = text(objLine(o), x, y, { small: true, width: TW - 70, color: o.status === 'met' ? PAL.moss : PAL.blood, maxLines: 2 });
            frame.addChild(t);
            frame.addChild(text(o.status === 'met' ? `+${o.reward.clout} CLOUT\n+${money(o.reward.cash)}` : 'NO BONUS', x + TW - 66, y, { small: true, width: 66, align: 'right', color: o.status === 'met' ? PAL.gold : PAL.grey }));
            y += Math.max(t.textHeight, 12) + 3;
          }
          y += 3;
        }
        const fresh = v.objectives.map((id) => c.owner.objectives.find((o) => o.id === id)).filter((o): o is OwnerObjective => !!o);
        if (fresh.length) {
          frame.addChild(text('NEW OBJECTIVES', x, y, { small: true, color: PAL.gold }));
          y += 9;
          for (const o of fresh) {
            const card = new Container();
            const t = text(o.text, 4, 3, { width: TW - 82, color: PAL.ink, small: true, maxLines: 3 });
            const h = Math.max(22, t.textHeight + 7);
            card.addChild(box(TW, h, PAL.paper, PAL.ink));
            card.addChild(t);
            card.addChild(text(`DUE ${fmtFightDate(o.due)}`, TW - 76, 3, { small: true, color: PAL.blood, width: 72, align: 'right' }));
            card.addChild(text(`+${o.reward.clout} CLOUT • ${money(o.reward.cash)}`, TW - 76, 11, { small: true, color: PAL.ink, width: 72, align: 'right', maxLines: 2 }));
            card.position.set(x, y);
            frame.addChild(card);
            y += h + 3;
          }
        }
        clout();
        next();
        break;
      }
      case 'gift': {
        if (!gift || !v.gift) {
          idx++;
          return draw();
        }
        chrome(v.gift.kind === 'nephew' ? 'OWNER CHECK-IN  •  A FAMILY MATTER' : 'OWNER CHECK-IN  •  A FIGHTER IN A FOLDER');
        ownerSide();
        const x = bx + 88;
        frame.addChild(text(giftLine, x, by + 18, { width: TW, color: PAL.bone, maxLines: 6 }));
        const card = new Container();
        card.addChild(box(TW, 70, PAL.paper, PAL.ink));
        const fp = fighterPortrait(gift, 64, 'plain');
        fp.position.set(3, 3);
        card.addChild(fp);
        card.addChild(text(`${fullName(gift).toUpperCase()}${gift.nick ? `  "${gift.nick}"` : ''}`, 72, 4, { color: PAL.ink, width: TW - 76, maxLines: 1 }));
        card.addChild(text(`${divisionName(gift.division)}  •  ${record(gift.record)}  •  AGE ${gift.age}  •  ${gift.country}`, 72, 15, { small: true, color: PAL.shadow, width: TW - 76 }));
        card.addChild(text(`SKILL ${grade(seenOverall(gift))}   POTENTIAL ${seenPotential(gift)}`, 72, 26, { small: true, color: PAL.blood, width: TW - 76 }));
        card.addChild(text(`ASKING ${money(v.gift.purse)}/FIGHT, 3 FIGHTS`, 72, 37, { small: true, color: PAL.ink, width: TW - 76 }));
        if (v.gift.kind === 'nephew') card.addChild(text('Saying no will hurt the owner\'s feelings. And your budget.', 72, 50, { small: true, color: PAL.blood, width: TW - 76, maxLines: 2 }));
        card.position.set(x, by + bh - 100);
        frame.addChild(card);
        const decide = (yes: boolean) => {
          const line = resolveGift(s, yes);
          sfx(yes ? 'stamp' : 'paper');
          if (yes) g.toast(`${fullName(gift)} signed!`, PAL.gold);
          steps.splice(idx + 1, 0, { kind: 'reaction', line });
          idx++;
          draw();
        };
        frame.addChild(button(`SIGN ${gift.last.toUpperCase()}`, bx + 8, by + bh - 20, 96, 14, () => decide(true), { fill: PAL.moss }));
        frame.addChild(button('PASS', bx + 108, by + bh - 20, 60, 14, () => decide(false), { fill: PAL.blood }));
        break;
      }
      case 'reaction': {
        chrome('OWNER CHECK-IN');
        ownerSide();
        const body = text('', bx + 88, by + 20, { width: TW, color: PAL.bone });
        frame.addChild(body);
        typing = { node: body, full: st.line, shown: 0 };
        next();
        break;
      }
      case 'bye': {
        chrome('OWNER CHECK-IN');
        ownerSide();
        const body = text('', bx + 88, by + 20, { width: TW, color: PAL.bone });
        frame.addChild(body);
        typing = { node: body, full: signoff, shown: 0 };
        clout();
        next('BACK TO WORK →', close);
        break;
      }
    }
  };
  draw();
}

// ---------------------------------------------------------------- UNLOCKED!

/** Play every queued UNLOCKED / TIER UP / NEW ACT moment, one after another. */
export function playUnlockQueue(g: Game, onDone: () => void): void {
  const s = g.state!;
  const c = ensureCareer(s);
  const id = c.unlockQueue.shift();
  if (!id) return onDone();
  showUnlock(g, id, () => playUnlockQueue(g, onDone));
}

export function showUnlock(g: Game, id: string, onDone: () => void): void {
  const s = g.state!;
  let kicker = 'UNLOCKED!';
  let title = '';
  let blurb = '';
  let color: number = PAL.gold;
  if (id.startsWith('tier_')) {
    const t = TIERS[Number(id.slice(5))];
    kicker = 'TIER UP!';
    title = t?.name ?? '';
    blurb = t?.blurb ?? '';
    color = 0x6fd8a0;
  } else if (id.startsWith('act_')) {
    const a = content().acts.find((x) => x.act === Number(id.slice(4)));
    kicker = `ACT ${id.slice(4)}`;
    title = a?.name ?? '';
    blurb = a ? `${a.goal}.  New: ${a.unlocks.join(', ')}.` : '';
    color = 0xd86f6f;
  } else {
    const u = UNLOCKS.find((x) => x.id === id);
    title = u?.name ?? id;
    blurb = u?.blurb ?? '';
  }
  const frame = new Container();
  const wrap = g.modal(frame, { dim: 0.75 });
  const glow = new Graphics();
  frame.addChild(glow);
  const bw = 340;
  const bh = 150;
  const bx = Math.round((W - bw) / 2);
  const by = Math.round((H - bh) / 2) + 6;
  frame.addChild(box(bw, bh, PAL.ink, color, { shadow: true, bevel: true })).position.set(bx, by);
  const big = new Container();
  const bt = text(kicker, 0, 0, { scale: 3, color, shadow: PAL.ink });
  bt.x = -Math.round(bt.textWidth * 1.5);
  bt.y = -Math.round(bt.textHeight * 1.5);
  big.addChild(bt);
  big.position.set(W / 2, by + 26);
  frame.addChild(big);
  frame.addChild(text(title.toUpperCase(), bx + 8, by + 50, { width: bw - 16, align: 'center', scale: 1, color: PAL.bone, maxLines: 2 }));
  frame.addChild(text(blurb, bx + 14, by + 72, { width: bw - 28, align: 'center', small: true, color: PAL.fog, maxLines: 6 }));
  frame.addChild(text(`${s.promotion.name.toUpperCase()}  •  CLOUT ${Math.floor(ensureCareer(s).clout)}`, bx + 8, by + bh - 30, { small: true, width: bw - 16, align: 'center', color: PAL.ash }));
  const sparks: { x: number; y: number; vx: number; vy: number; t: number }[] = [];
  let t = 0;
  const tick = (tk: Ticker) => {
    const dt = tk.deltaMS / 1000;
    t += dt;
    const k = Math.min(1, t * 4);
    const bounce = k < 1 ? 0.2 + k * 1.1 : 1 + Math.sin(t * 6) * 0.03;
    big.scale.set(Math.min(1.3, bounce));
    if (t < 1.2 && Math.random() < 0.8) sparks.push({ x: W / 2 + (Math.random() - 0.5) * 120, y: by + 26, vx: (Math.random() - 0.5) * 160, vy: -40 - Math.random() * 90, t: 1 });
    glow.clear();
    glow.circle(W / 2, by + 26, 60 + Math.sin(t * 3) * 6).fill({ color, alpha: 0.08 });
    for (const p of sparks) {
      p.t -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 160 * dt;
      if (p.t > 0) glow.rect(Math.round(p.x), Math.round(p.y), 2, 2).fill({ color: Math.random() < 0.5 ? color : 0xffffff, alpha: Math.min(1, p.t * 2) });
    }
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].t <= 0) sparks.splice(i, 1);
  };
  g.app.ticker.add(tick);
  sfx('roar');
  g.shake(2, 0.25);
  frame.addChild(button('NICE →', bx + bw / 2 - 40, by + bh - 20, 80, 14, () => {
    g.app.ticker.remove(tick);
    g.closeModal(wrap);
    sfx('click');
    onDone();
  }, { fill: PAL.moss }));
}

// ---------------------------------------------------------------- career window

export function openCareerPanel(g: Game): void {
  const s = g.state!;
  const c = ensureCareer(s);
  const win = openWindow(g, 'Career: the road to the top', W - 16, H - 16, { x: 8, y: 8 });
  const b = win.body;
  // tier ladder
  b.addChild(text('THE LADDER', 6, 2, { small: true, color: PAL.gold }));
  TIERS.forEach((t, i) => {
    const y = 12 + (TIERS.length - 1 - i) * 16;
    const here = i === c.tier;
    const done = i < c.tier;
    b.addChild(box(124, 14, here ? shade(PAL.gold, -0.35) : done ? 0x2a3a2a : 0x24212a, here ? PAL.gold : PAL.shadow)).position.set(6, y);
    b.addChild(text(`${done ? '✓ ' : here ? '★ ' : ''}${t.name}`, 9, y + 4, { small: true, color: here ? PAL.bone : done ? PAL.moss : PAL.grey, width: 92, maxLines: 1 }));
    b.addChild(text(String(t.clout), 100, y + 4, { small: true, color: PAL.ash, width: 26, align: 'right' }));
  });
  b.addChild(text(`CLOUT ${Math.floor(c.clout)}`, 6, 112, { color: PAL.gold }));
  const bar = cloutBar(g, 124);
  bar.position.set(6, 124);
  b.addChild(bar);
  const nu = nextUnlock(s);
  b.addChild(text(nu ? `Next unlock: ${nu.name} at ${nu.clout}` : 'Everything unlocked. Now defend it.', 6, 132, { small: true, color: PAL.fog, width: 124, maxLines: 3 }));
  b.addChild(text('Earn clout by hitting the owner\'s objectives and putting on big shows (sellouts, title fights, bangers).', 6, 156, { small: true, color: PAL.ash, width: 124, maxLines: 6 }));
  const [mood, mc] = MOOD[ownerMood(s)];
  b.addChild(text(`OWNER: ${ownerPerson(s)}`, 6, 200, { small: true, color: PAL.bone, width: 124, maxLines: 2 }));
  b.addChild(text(`MOOD: ${mood}  •  NEXT VISIT ${fmtDate(c.owner.nextVisit)}`, 6, 216, { small: true, color: mc, width: 124, maxLines: 2 }));
  // unlocks
  b.addChild(text('UNLOCKS', 140, 2, { small: true, color: PAL.gold }));
  const sb = new ScrollBox(176, H - 50);
  sb.position.set(140, 12);
  UNLOCKS.forEach((u, i) => {
    const got = c.unlocks.includes(u.id);
    const row = new Container();
    row.addChild(box(170, 16, got ? 0x2a3a2a : 0x24212a, got ? PAL.moss : PAL.shadow));
    row.addChild(text(`${got ? '✓' : '•'} ${u.name}`, 3, 2, { small: true, color: got ? PAL.bone : PAL.grey, width: 138, maxLines: 1 }));
    row.addChild(text(got ? 'OPEN' : String(u.clout), 140, 2, { small: true, color: got ? PAL.moss : PAL.ash, width: 27, align: 'right' }));
    row.addChild(text(u.blurb, 3, 9, { small: true, color: PAL.ash, width: 164, maxLines: 1 }));
    row.position.set(0, i * 18);
    sb.content.addChild(row);
  });
  b.addChild(sb);
  sb.refresh();
  // objectives
  const x = 324;
  b.addChild(text('OWNER\'S OBJECTIVES', x, 2, { small: true, color: PAL.gold }));
  let y = 12;
  const open = c.owner.objectives.filter((o) => o.status === 'open');
  if (!open.length) b.addChild(text('Nothing assigned right now. Enjoy the silence.', x, y, { small: true, color: PAL.ash, width: 132 }));
  for (const o of open) {
    const t = text(o.text, x + 3, y + 3, { small: true, color: PAL.ink, width: 126, maxLines: 4 });
    const h = t.textHeight + 16;
    b.addChild(box(132, h, PAL.paper, PAL.ink)).position.set(x, y);
    b.addChild(t);
    b.addChild(text(`DUE ${fmtFightDate(o.due)}  •  +${o.reward.clout}`, x + 3, y + h - 9, { small: true, color: PAL.blood, width: 126 }));
    y += h + 3;
  }
  y += 4;
  const closed = c.owner.objectives.filter((o) => o.status !== 'open').slice(-4).reverse();
  if (closed.length && y < 190) {
    b.addChild(text('RECENT', x, y, { small: true, color: PAL.ash }));
    y += 9;
    for (const o of closed) {
      if (y > 222) break;
      const t = text(objLine(o), x, y, { small: true, color: o.status === 'met' ? PAL.moss : PAL.blood, width: 132, maxLines: 2 });
      b.addChild(t);
      y += t.textHeight + 2;
    }
  }
  if (hasUnlock(s, 'contender_series')) {
    const nextCs = s.week + ((2 - (s.week % 4) + 4) % 4);
    b.addChild(text(`CONTENDER SERIES: ${c.contender.seasons} cards, ${c.contender.signed.length} signed. Next: week of ${fmtDate(nextCs)}`, x, 228, { small: true, color: PAL.sky, width: 132, maxLines: 2 }));
  }
}
