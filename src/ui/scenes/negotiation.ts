/**
 * Contract negotiation table: make offers, take counters, watch rivals bid.
 */
import { Container } from 'pixi.js';
import type { Game } from '../app';
import { PAL } from '../../art/palette';
import { W, text, button, box, paper } from '../kit';
import { fighterPortrait } from '../sprites';
import { stepper, checkbox } from '../widgets';
import { money } from '../../core/format';
import { makeOffer, walk, type Offer } from '../../sim/contracts';
import { marketPurse, moneyRead, seenOverall, effectiveScout, visibleTraits } from '../../sim/fighters';
import { content } from '../../core/content';
import { Rng } from '../../core/rng';
import { sfx } from '../../audio/sfx';
import { record } from '../../core/format';
import { rankLabel } from '../../sim/rankings';

export function openNegotiation(g: Game, negId: string, onDone: () => void): void {
  const s = g.state!;
  const frame = new Container();
  const wrap = g.modal(frame, { dim: 0.6 });
  const close = () => {
    g.closeModal(wrap);
    onDone();
  };
  let note = '';
  let offer: Offer | null = null;
  const draw = () => {
    frame.removeChildren().forEach((x) => x.destroy({ children: true }));
    const n = s.negotiations.find((x) => x.id === negId);
    const bw = 400;
    const bh = 230;
    const bx = (W - bw) / 2;
    const by = 20;
    frame.addChild(box(bw, bh, PAL.night, PAL.moss, { shadow: true, bevel: true })).position.set(bx, by);
    if (!n) {
      frame.addChild(text(note || 'This negotiation is over.', bx + 10, by + 20, { width: bw - 20, color: PAL.bone }));
      frame.addChild(button('CLOSE', bx + bw - 60, by + bh - 22, 52, 14, close));
      return;
    }
    const f = s.fighters[n.fighter];
    if (!offer) offer = { ...n.ask, purse: Math.round((n.ask.purse * 0.85) / 500) * 500 };
    frame.addChild(text(`CONTRACT ${n.kind.toUpperCase()}  •  expires ${Math.max(0, n.expires - s.week)} week(s)`, bx + 6, by + 4, { small: true, color: PAL.gold }));
    const p = fighterPortrait(f, 64);
    p.position.set(bx + 8, by + 16);
    frame.addChild(p);
    frame.addChild(text(`${f.first} "${f.nick}" ${f.last}`, bx + 80, by + 16, { color: PAL.bone, width: 300 }));
    frame.addChild(text(`${record(f.record)}  ${rankLabel(s, f.id)}  OVR ~${seenOverall(f)}  Star ${f.starPower}  Age ${f.age}`, bx + 80, by + 27, { small: true, color: PAL.ash }));
    frame.addChild(text(`Traits: ${visibleTraits(f).join(', ')}`, bx + 80, by + 36, { small: true, width: 310, color: PAL.ash, maxLines: 2 }));
    frame.addChild(text(`Money sense: ${moneyRead(f)}   Loyalty ${Math.round(f.loyalty)}   Morale ${Math.round(f.morale)}`, bx + 80, by + 52, { small: true, color: PAL.ash }));
    const mgr = content().managers.find((m) => m.id === f.manager);
    frame.addChild(text(`Rep: ${mgr?.name ?? f.manager}${mgr && !mgr.licensed ? ' (UNLICENSED)' : ''}`, bx + 80, by + 61, { small: true, color: mgr && !mgr.licensed ? PAL.blood : PAL.ash }));
    // the ask
    const ask = paper(180, 58, 'cream', 2);
    ask.position.set(bx + 8, by + 86);
    frame.addChild(ask);
    ask.addChild(text('THEIR ASK', 4, 3, { small: true, color: PAL.blood }));
    ask.addChild(text(`Show: ${money(n.ask.purse, false)}`, 4, 12, { color: PAL.ink }));
    ask.addChild(text(`Win: ${money(n.ask.winBonus, false)}`, 4, 22, { color: PAL.ink }));
    ask.addChild(text(`${n.ask.bouts} fights${n.ask.champClause ? ', champ clause' : ''}`, 4, 32, { color: PAL.ink }));
    ask.addChild(text(effectiveScout(f) >= 2 ? `Market value ~${money(marketPurse(s, f))}` : 'Market value: scout them to know', 4, 44, { small: true, color: PAL.slate }));
    if (n.rivalBid) {
      const r = content().rivals.find((x) => x.id === n.rivalBid);
      frame.addChild(text(`${r?.name ?? 'A rival'} is bidding ~${money(n.rivalPurse)} a fight.`, bx + 8, by + 148, { small: true, width: 180, color: PAL.ember }));
    }
    frame.addChild(text(`Patience: ${'★'.repeat(Math.max(0, n.patience))}`, bx + 8, by + 162, { small: true, color: PAL.gold }));
    // offer controls
    const ox = bx + 198;
    frame.addChild(text('YOUR OFFER', ox, by + 86, { small: true, color: PAL.moss }));
    const step = Math.max(500, Math.round(n.ask.purse / 20 / 500) * 500);
    frame.addChild(text('Show', ox, by + 98, { small: true, color: PAL.ash }));
    frame.addChild(stepper(ox + 34, by + 95, 156, offer.purse, 500, n.ask.purse * 3, step, (v) => money(v, false), (v) => (offer!.purse = v)));
    frame.addChild(text('Win', ox, by + 113, { small: true, color: PAL.ash }));
    frame.addChild(stepper(ox + 34, by + 110, 156, offer.winBonus, 0, n.ask.winBonus * 3 + 500, step, (v) => money(v, false), (v) => (offer!.winBonus = v)));
    frame.addChild(text('Fights', ox, by + 128, { small: true, color: PAL.ash }));
    frame.addChild(stepper(ox + 34, by + 125, 156, offer.bouts, 1, 8, 1, String, (v) => (offer!.bouts = v)));
    frame.addChild(checkbox(ox, by + 142, 'Champion clause', offer.champClause, (v) => (offer!.champClause = v)));
    if (note) frame.addChild(text(note, bx + 8, by + 176, { width: bw - 16, color: PAL.bone, small: true, maxLines: 4 }));
    const rng = new Rng(s.rng);
    const act = (o: Offer) => {
      const r = makeOffer(s, negId, o, rng);
      s.rng = rng.state;
      note = r.text;
      sfx(r.outcome === 'accepted' ? 'cash' : r.outcome === 'walked' ? 'bad' : 'click');
      if (r.outcome === 'countered') offer = null;
      draw();
    };
    frame.addChild(button('MAKE OFFER', bx + 8, by + bh - 22, 90, 16, () => act({ ...offer! }), { fill: PAL.moss }));
    frame.addChild(button('MEET THEIR ASK', bx + 104, by + bh - 22, 100, 16, () => act({ ...n.ask }), { fill: PAL.steel }));
    frame.addChild(button('LET THEM WALK', bx + 210, by + bh - 22, 100, 16, () => {
      walk(s, n, rng);
      s.rng = rng.state;
      note = `${f.last} is gone.`;
      sfx('bad');
      draw();
    }, { fill: PAL.blood }));
    frame.addChild(button('LATER', bx + bw - 60, by + bh - 22, 52, 16, close, { fill: PAL.shadow }));
  };
  draw();
}
