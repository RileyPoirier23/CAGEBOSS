/**
 * Fighter Mode hub: one screen per week. Your fighter and vitals on the left,
 * this week's actions in the middle, offers / next fight and the Bleeter feed
 * on the right. Fight week: weigh-in -> gameplan -> fight night.
 */
import { Container, Graphics } from 'pixi.js';
import { Scene } from '../app';
import type { Skills } from '../../core/types';
import { PAL } from '../../art/palette';
import { W, H, text, button, box, ScrollBox } from '../kit';
import { openWindow, confirm, alertBox, selector } from '../widgets';
import { fighterPortrait } from '../sprites';
import { money, record } from '../../core/format';
import { fmtDate } from '../../core/time';
import { Rng } from '../../core/rng';
import { sfx } from '../../audio/sfx';
import { fullName, overall } from '../../sim/fighters';
import { divisionName } from '../../sim/divisions';
import { rankLabel, rankOf, undisputed } from '../../sim/rankings';
import {
  fm, me, BODY_PARTS, STAFF_ROLES, PLANS, doAction, treat, clinicCost, weeklyStaffCost, calloutTargets, callOut, humblePost,
  startPeds, stopPeds, bareknuckle, gamble, acceptOffer, resolveEvent, endWeek, fightThisWeek, weighInInfo, doWeighIn, fightEvent,
  afterFight, postFightCallout, weightLimit, fightReadySkills, type ActionId, type StaffId, type BodyPart,
  ensureFM, condition, trainSkill, cutWeight, hire, fire, resolveDoc, fightWeekPaperwork, cagesideReact, bkNext, bkPurse, bkSpot,
  ladderSpot, TIER_NAME, BKB_NAME, BRADIE, bradieOnYou, askOnlyFighters, postContent, cardSlot, SLOT_NAME, type CutMethod, type FMDoc,
} from '../../sim/fighter';
import { FightNightScene } from './fightnight';
import { openCorner } from '../cutman';
import type { GamePlan } from '../../sim/fight';
import { openLiveFight } from '../livefight';
import { openJumpRope, openTyreChop } from '../minigames';
import { officialsFor } from '../../sim/events';
import { portrait, namedPortrait } from '../sprites';

const bar = (w: number, v: number, color: number): Graphics => {
  const g = new Graphics();
  g.rect(0, 0, w, 5).fill(0x221e26).stroke({ color: 0x000000, width: 1 });
  g.rect(1, 1, Math.max(0, (w - 2) * Math.max(0, Math.min(1, v / 100))), 3).fill(color);
  return g;
};

export class FMHubScene extends Scene {
  music = 'office' as const;
  private msg = '';
  private paperworkWarned = false;
  private rng(): Rng {
    return new Rng(this.g.state!.rng);
  }
  private save(r: Rng): void {
    this.g.state!.rng = r.state;
  }

  enter(): void {
    if (this.g.state) ensureFM(this.g.state);
    super.enter();
    setTimeout(() => this.popups(), 300);
  }

  /** Week report, then any controversy waiting for a decision. */
  private popups(): void {
    const s = this.g.state;
    if (!s?.fm || this.g.modals.length) return;
    const st = fm(s);
    if (st.weekReport && st.weekReport.length) {
      const lines = st.weekReport;
      st.weekReport = null;
      alertBox(this.g, `WEEK ${s.week + 1}`, lines.slice(0, 9).join('\n'), () => this.popups());
      return;
    }
    const ev = st.pending[0];
    if (!ev) return;
    const frame = new Container();
    const wrap = this.g.modal(frame, { dim: 0.7 });
    const bw = 320;
    const many = ev.choices.length > 3;
    const bh = many ? 74 + ev.choices.length * 17 : 120;
    const bx = (W - bw) / 2;
    const by = (H - bh) / 2;
    frame.addChild(box(bw, bh, PAL.night, PAL.blood, { bevel: true })).position.set(bx, by);
    const face = ev.portrait?.startsWith('npc:') ? namedPortrait(ev.portrait.slice(4), 32) : null;
    const tx = face ? bx + 46 : bx + 8;
    if (face) {
      face.position.set(bx + 8, by + 8);
      frame.addChild(face);
    }
    frame.addChild(text(ev.title, tx, by + 6, { color: PAL.blood }));
    frame.addChild(text(ev.text, tx, by + 20, { small: true, width: bw - (tx - bx) - 8, color: PAL.bone, maxLines: many ? 5 : 6 }));
    const cw = many ? bw - 16 : (bw - 16) / ev.choices.length - 4;
    ev.choices.forEach((c, i) => frame.addChild(button(c.label, many ? bx + 8 : bx + 8 + i * ((bw - 16) / ev.choices.length), many ? by + 66 + i * 17 : by + bh - 22, cw, 15, () => {
      const r = this.rng();
      const out = resolveEvent(s, c.id, r);
      this.save(r);
      this.g.closeModal(wrap);
      if (out) this.msg = out;
      this.refresh();
      this.g.autosave();
      setTimeout(() => this.popups(), 200);
    }, { small: true, fill: PAL.steel })));
  }

  build(): void {
    const s = this.g.state!;
    const st = fm(s);
    const f = me(s);
    const r = this.root;
    const bg = new Graphics().rect(0, 0, W, H).fill(0x17141c);
    bg.rect(0, 0, W, 18).fill(0x0f0d13);
    r.addChild(bg);
    r.addChild(text(`WEEK ${s.week + 1}  •  ${fmtDate(s.week)}`, 6, 5, { color: PAL.gold }));
    r.addChild(text(`CASH ${money(st.money)}`, W - 120, 5, { color: st.money < 0 ? PAL.blood : PAL.moss, width: 114, align: 'right' }));
    const susp = s.week < st.suspendedUntil;
    if (susp) r.addChild(text(`SUSPENDED until week ${st.suspendedUntil + 1}`, 160, 5, { small: true, color: PAL.blood }));

    // ------------------------------------------------ left: you
    const L = new Container();
    L.position.set(6, 22);
    r.addChild(L);
    L.addChild(box(146, 226, PAL.night, PAL.slate));
    const por = fighterPortrait(f, 64);
    por.position.set(4, 4);
    L.addChild(por);
    L.addChild(text(fullName(f).toUpperCase(), 72, 6, { small: true, width: 72, color: PAL.bone, maxLines: 2 }));
    L.addChild(text(`"${f.nick}"`, 72, 24, { small: true, width: 72, color: PAL.gold, maxLines: 2 }));
    L.addChild(text(record(f.record), 72, 42, { color: PAL.bone }));
    const rk = rankOf(s, f.id);
    const spot = ladderSpot(s);
    if (st.tier === 'of') L.addChild(text(rk === 0 ? 'CHAMPION' : rk ? `RANKED #${rk}` : 'UNRANKED', 72, 54, { small: true, color: rk === 0 ? PAL.gold : rk ? PAL.sky : PAL.ash }));
    else L.addChild(text(`${st.tier === 'amateur' ? 'AMATEUR' : 'FURY FC'} ${spot === 0 ? 'CHAMP' : '#' + ((spot ?? 0) + 1)}`, 72, 54, { small: true, color: spot === 0 ? PAL.gold : PAL.sky }));
    L.addChild(text(`${divisionName(f.division)}  •  ${st.tier === 'of' ? 'CBFC' : st.tier === 'amateur' ? 'Amateur' : 'Regional pro'}`, 4, 72, { small: true, color: PAL.ash, width: 140, maxLines: 1 }));
    const cond = condition(s);
    L.addChild(text(`OVR ${Math.round(overall(f.skills))}  •  AGE ${f.age}  •`, 4, 82, { small: true, color: PAL.ash }));
    L.addChild(text(cond.label === 'PEAK CONDITION' ? 'PEAK' : cond.label, 98, 82, { small: true, color: PAL[cond.color] }));
    let y = 96;
    const vit = (label: string, v: number, c: number, right = '') => {
      L.addChild(text(label, 4, y, { small: true, color: PAL.ash }));
      if (right) L.addChild(text(right, 90, y, { small: true, color: PAL.bone, width: 52, align: 'right' }));
      L.addChild(bar(138, v, c)).position.set(4, y + 9);
      y += 18;
    };
    vit('ENERGY', st.energy, st.energy < 30 ? PAL.blood : PAL.moss, `${Math.round(st.energy)}`);
    vit('MORALE', st.morale, PAL.sky, `${Math.round(st.morale)}`);
    vit('HYPE', f.hype, PAL.gold, `${Math.round(f.hype)}`);
    const lim = weightLimit(s);
    const over = st.walkWeight - lim;
    vit('WEIGHT', Math.max(0, 100 - over * 5), over > 12 ? PAL.blood : over > 7 ? PAL.ember : PAL.moss, `${st.walkWeight.toFixed(1)} / ${lim}`);
    const health = Math.round(BODY_PARTS.reduce((a, p) => a + st.body[p.id], 0) / BODY_PARTS.length);
    vit('HEALTH', health, health < 60 ? PAL.blood : PAL.moss, `${health}`);
    L.addChild(text(`Diet`, 4, y + 2, { small: true, color: PAL.ash }));
    L.addChild(selector(30, y, 112, [{ value: 'clean' as const, label: 'Clean ($$)' }, { value: 'balanced' as const, label: 'Balanced' }, { value: 'junk' as const, label: 'Junk ($)' }], st.diet, (v) => { st.diet = v; }));
    y += 16;
    if (st.ped.on) L.addChild(text('ON A CYCLE', 4, y + 2, { small: true, color: PAL.blood }));

    // ------------------------------------------------ middle: this week
    const M = new Container();
    M.position.set(158, 22);
    r.addChild(M);
    M.addChild(box(160, 226, PAL.night, PAL.slate));
    M.addChild(text('THIS WEEK', 6, 4, { color: PAL.gold }));
    for (let i = 0; i < 3; i++) M.addChild(new Graphics().rect(110 + i * 14, 5, 10, 8).fill(i < st.ap ? PAL.gold : 0x2a2630));
    const act = (label: string, yy: number, fn: () => void, opts: { disabled?: boolean; fill?: number; tip?: string } = {}) =>
      M.addChild(button(label, 6, yy, 148, 15, fn, { small: true, fill: opts.fill ?? PAL.steel, disabled: opts.disabled || st.ap <= 0, tooltip: opts.tip }));
    const run = (a: ActionId, focus: keyof Skills | 'cheap' | 'pro' | 'partner' | null = null) => {
      const r2 = this.rng();
      this.msg = doAction(s, a, focus, r2);
      this.save(r2);
      sfx('click');
      this.refresh();
      setTimeout(() => this.popups(), 100);
    };
    act('TRAIN…', 17, () => this.trainMenu(), { tip: 'Pick a skill to drill. Peak condition = bigger gains' });
    act('SPAR…', 32, () => this.sparMenu(run), { tip: 'Big gains, real risk' });
    act('CUT WEIGHT…', 47, () => this.cutMenu(), { fill: PAL.ember, tip: 'Roadwork, sauna or a strict diet' });
    act('WORK A SHIFT', 62, () => run('work'), { tip: 'Money, but it drains you' });
    act('REST & RECOVER', 77, () => run('rest'));
    act('GO OUT TONIGHT', 92, () => run('party'), { fill: PAL.plum, tip: 'Morale up. What could go wrong?' });
    act('BLEETER / CALLOUTS', 107, () => this.mediaMenu(), { fill: PAL.sky });
    // free actions
    const free = (label: string, yy: number, fn: () => void, fill: number = PAL.shadow) => M.addChild(button(label, 6, yy, 148, 14, fn, { small: true, fill }));
    free(`PAPERWORK${st.inbox.length ? ` (${st.inbox.length})` : ''}`, 126, () => this.paperwork(), st.inbox.length ? PAL.ember : PAL.shadow);
    free('CONDITION & CLINIC', 141, () => this.conditionMenu());
    free('STAFF', 156, () => this.staffMenu());
    free(st.tier === 'of' ? 'RANKINGS' : 'THE LADDER', 171, () => this.rankingsMenu());
    if (st.undergroundOpen) free('THE UNDERGROUND', 186, () => this.undergroundMenu(), 0x1d3a22);
    if (this.msg) M.addChild(text(this.msg, 6, 202, { small: true, width: 148, color: PAL.bone, maxLines: 3 }));

    // ------------------------------------------------ right: fights & feed
    const R = new Container();
    R.position.set(324, 22);
    r.addChild(R);
    R.addChild(box(150, 106, PAL.night, PAL.slate));
    if (st.fight) {
      const o = st.fight;
      const opp = s.fighters[o.opp];
      R.addChild(text(o.title || o.tierTitle ? 'TITLE FIGHT' : 'NEXT FIGHT', 6, 4, { color: o.title || o.tierTitle ? PAL.gold : PAL.blood }));
      const op = fighterPortrait(opp, 32);
      op.position.set(6, 18);
      R.addChild(op);
      R.addChild(text(fullName(opp), 42, 18, { small: true, width: 104, color: PAL.bone, maxLines: 2 }));
      R.addChild(text(`${record(opp.record)}  ${st.tier === 'of' ? rankLabel(s, opp.id) : '#' + (st.ladder.indexOf(opp.id) + 1)}`, 42, 36, { small: true, color: PAL.ash }));
      const wk = o.week - s.week;
      R.addChild(text(`${wk <= 0 ? 'FIGHT WEEK!' : `In ${wk} week${wk > 1 ? 's' : ''}`}  •  ${SLOT_NAME(cardSlot(s), st.tier === 'of')}`, 6, 56, { small: true, color: wk <= 0 ? PAL.gold : PAL.bone }));
      R.addChild(text(`${money(o.purse)} + ${money(o.win)} win  •  ${o.rounds} rds`, 6, 66, { small: true, color: PAL.ash }));
      const odds = Math.round(100 / (1 + Math.exp(-(overall(fightReadySkills(s)) - overall(opp.skills)) / 6)));
      R.addChild(text(`Your odds: about ${odds}%`, 6, 76, { small: true, color: odds >= 50 ? PAL.moss : PAL.ember }));
    } else if (st.offers.length) {
      R.addChild(text('FIGHT OFFERS', 6, 4, { color: PAL.gold }));
      st.offers.slice(0, 3).forEach((o, i) => {
        const opp = s.fighters[o.opp];
        const yy = 16 + i * 30;
        R.addChild(text(`${o.title || o.tierTitle ? 'TITLE: ' : ''}${opp.last} ${record(opp.record)} ${st.tier === 'of' ? rankLabel(s, opp.id) : '#' + (st.ladder.indexOf(opp.id) + 1)}`, 6, yy, { small: true, width: 102, color: o.title || o.tierTitle ? PAL.gold : PAL.bone, maxLines: 1 }));
        R.addChild(text(`${money(o.purse)}+${money(o.win)} • wk ${o.week + 1}`, 6, yy + 9, { small: true, color: PAL.ash }));
        R.addChild(text(o.why, 6, yy + 18, { small: true, color: PAL.ash, width: 102, maxLines: 1 }));
        R.addChild(button('SIGN', 110, yy + 2, 34, 14, () => { acceptOffer(s, i); sfx('cash'); this.refresh(); this.g.autosave(); }, { small: true, fill: PAL.moss }));
      });
    } else {
      R.addChild(text('NO FIGHT BOOKED', 6, 4, { color: PAL.ash }));
      R.addChild(text(susp ? 'You are suspended. Train, rest, wait.' : 'Your phone is quiet. Win the internet, train, and offers will come. A manager helps.', 6, 18, { small: true, width: 138, color: PAL.ash, maxLines: 5 }));
    }
    R.addChild(box(150, 116, PAL.night, PAL.slate)).position.set(0, 110);
    R.addChild(text('BLEETER', 6, 114, { color: PAL.sky }));
    const feed = new ScrollBox(140, 98);
    feed.position.set(6, 126);
    let fy = 0;
    for (const p of st.feed.slice(-8).reverse()) {
      const t1 = text(p.handle, 0, fy, { small: true, color: PAL.sky });
      const t2 = text(p.text, 0, fy + 9, { small: true, width: 136, color: PAL.bone, maxLines: 3 });
      feed.content.addChild(t1);
      feed.content.addChild(t2);
      fy += 13 + t2.height;
    }
    R.addChild(feed);
    feed.refresh();

    // ------------------------------------------------ bottom bar
    if (fightThisWeek(s)) r.addChild(button('FIGHT WEEK: WEIGH-IN →', W - 170, H - 19, 164, 16, () => this.weighIn(), { fill: PAL.blood }));
    else r.addChild(button('END WEEK →', W - 110, H - 19, 104, 16, () => this.endTheWeek(), { fill: PAL.blood }));
    r.addChild(button('MENU', 6, H - 19, 50, 16, () => this.menu(), { small: true }));
    r.addChild(text(`Staff ${money(weeklyStaffCost(s))}/wk`, 62, H - 14, { small: true, color: PAL.ash }));
  }

  // ---------------------------------------------------------------- menus

  private trainMenu(): void {
    const s = this.g.state!;
    const win = openWindow(this.g, 'Train', 240, 150);
    const f = me(s);
    const cond = condition(s);
    const after = (k: keyof Skills, score: number | null) => {
      const r = this.rng();
      this.msg = trainSkill(s, k, r, score);
      this.save(r);
      sfx('click');
      this.refresh();
      setTimeout(() => this.popups(), 100);
    };
    const keys: [keyof Skills, string][] = [['striking', 'Striking'], ['power', 'Power'], ['wrestling', 'Wrestling'], ['grappling', 'Jiu-jitsu'], ['cardio', 'Cardio'], ['fightIQ', 'Fight IQ'], ['chin', 'Neck & chin'], ['durability', 'Conditioning']];
    keys.forEach(([k, label], i) => win.body.addChild(button(`${label} (${Math.round(f.skills[k])})`, 6 + (i % 2) * 116, 6 + Math.floor(i / 2) * 17, 112, 14, () => { win.close(); after(k, null); }, { small: true, fill: PAL.steel })));
    win.body.addChild(text('MINI GAMES (score boosts the gains):', 6, 76, { small: true, color: PAL.gold }));
    win.body.addChild(button('JUMP ROPE: cardio', 6, 86, 112, 14, () => { win.close(); openJumpRope(this.g, (sc) => after('cardio', sc)); }, { small: true, fill: PAL.moss }));
    win.body.addChild(button('TYRE CHOP: power', 122, 86, 112, 14, () => { win.close(); openTyreChop(this.g, (sc) => after('power', sc)); }, { small: true, fill: PAL.moss }));
    win.body.addChild(text(`Condition: ${cond.label} (x${cond.mult} gains). Training burns weight. Coach, energy, morale and health all count.`, 6, 106, { small: true, width: 226, color: cond.label === 'PEAK CONDITION' ? PAL.gold : PAL.ash, maxLines: 3 }));
  }

  private cutMenu(): void {
    const s = this.g.state!;
    const st = fm(s);
    const win = openWindow(this.g, 'Cut weight', 250, 128);
    const lim = weightLimit(s);
    win.body.addChild(text(`You walk around ${st.walkWeight.toFixed(1)} lbs. Limit ${lim}. ${st.water > 0 ? `(${st.water.toFixed(1)} lbs is sauna water.)` : ''}`, 6, 4, { small: true, width: 238, color: PAL.bone }));
    const go = (m: CutMethod) => {
      win.close();
      this.msg = cutWeight(s, m);
      sfx('click');
      this.refresh();
    };
    const opts: [CutMethod, string, string][] = [
      ['roadwork', 'ROADWORK', '-2 lbs and some cardio. Tiring.'],
      ['diet', 'STRICT DIET', '-1.5 lbs. Morale takes a hit. Nutritionist helps.'],
      ['sauna', 'SAUNA', '-4 lbs fast, but water comes back unless you weigh in this week. Hurts the body.'],
    ];
    opts.forEach(([m, label, blurb], i) => {
      win.body.addChild(button(label, 6, 22 + i * 30, 70, 14, () => go(m), { small: true, fill: m === 'sauna' ? PAL.ember : PAL.steel, disabled: st.ap <= 0 }));
      win.body.addChild(text(blurb, 82, 22 + i * 30, { small: true, width: 160, color: PAL.ash, maxLines: 2 }));
    });
  }

  private sparMenu(run: (a: ActionId, f: 'cheap' | 'pro' | 'partner') => void): void {
    const st = fm(this.g.state!);
    const win = openWindow(this.g, 'Spar', 230, st.partner ? 112 : 92);
    win.body.addChild(button('PAID PROS ($150)', 6, 8, 104, 16, () => { win.close(); run('spar', 'pro'); }, { small: true, fill: PAL.steel }));
    win.body.addChild(button('WHOEVER SHOWS UP', 116, 8, 104, 16, () => { win.close(); run('spar', 'cheap'); }, { small: true, fill: PAL.ember }));
    win.body.addChild(text('Pros are controlled and safe-ish. Gym randoms go 100%, hurt you, and sometimes film it.', 6, 30, { small: true, width: 214, color: PAL.ash }));
    if (st.partner) win.body.addChild(button(`YOUR PARTNER: ${st.partner.name.toUpperCase()} (FREE)`, 6, 58, 214, 16, () => { win.close(); run('spar', 'partner'); }, { small: true, fill: PAL.plum }));
  }

  private conditionMenu(): void {
    const s = this.g.state!;
    const st = fm(s);
    const win = openWindow(this.g, "St. Cath's Sports Medicine", 330, 190);
    const draw = () => {
      win.body.removeChildren().forEach((c) => c.destroy({ children: true }));
      // body outline
      const g = new Graphics();
      const col = (p: BodyPart) => { const v = st.body[p]; return v > 75 ? PAL.moss : v > 45 ? PAL.ember : PAL.blood; };
      g.circle(40, 18, 10).fill(col('head'));
      g.rect(36, 26, 8, 4).fill(col('jaw'));
      g.rect(28, 31, 24, 34).fill(col('body'));
      g.rect(18, 32, 8, 28).fill(col('larm'));
      g.rect(54, 32, 8, 28).fill(col('rarm'));
      g.circle(22, 64, 5).fill(col('lhand'));
      g.circle(58, 64, 5).fill(col('rhand'));
      g.rect(29, 66, 9, 40).fill(col('legs'));
      g.rect(42, 66, 9, 40).fill(col('legs'));
      g.position.set(6, 10);
      win.body.addChild(g);
      BODY_PARTS.forEach((p, i) => {
        const yy = 4 + i * 20;
        const v = Math.round(st.body[p.id]);
        win.body.addChild(text(`${p.name}  ${v}${p.id === 'head' ? ` / ${Math.round(st.headCap)}` : ''}`, 96, yy, { small: true, color: PAL.bone }));
        win.body.addChild(text(p.effect, 96, yy + 9, { small: true, width: 170, color: PAL.ash, maxLines: 1 }));
        const cost = clinicCost(s, p.id);
        if (cost) win.body.addChild(button(`TREAT ${money(cost)}`, 268, yy, 54, 13, () => { this.msg = treat(s, p.id); draw(); this.refresh(); }, { small: true, fill: PAL.steel, disabled: st.money < cost }));
      });
    };
    draw();
  }

  private staffMenu(): void {
    const s = this.g.state!;
    const st = fm(s);
    const win = openWindow(this.g, 'Your team', 360, 236);
    const draw = () => {
      win.body.removeChildren().forEach((c) => c.destroy({ children: true }));
      win.body.addChild(text('YOUR TEAM', 6, 2, { small: true, color: PAL.gold }));
      STAFF_ROLES.forEach((role, i) => {
        const yy = 12 + i * 13;
        const t = st.staff[role.id as StaffId];
        win.body.addChild(text(`${role.name}: ${st.staffNames[role.id as StaffId]}`, 6, yy, { small: true, color: PAL.bone, width: 200, maxLines: 1 }));
        win.body.addChild(text(role.id === 'manager' ? `${[0, 10, 15, 20][t]}% cut` : `${money(role.cost[t])}/wk`, 210, yy, { small: true, color: PAL.ash }));
        if (t > 0) win.body.addChild(button('FIRE', 300, yy - 1, 40, 11, () => { this.msg = fire(s, role.id as StaffId); draw(); this.refresh(); }, { small: true, fill: PAL.blood }));
      });
      win.body.addChild(text('FOR HIRE (new names every 4 weeks)', 6, 68, { small: true, color: PAL.gold }));
      st.market.forEach((c, i) => {
        const yy = 78 + i * 15;
        const role = STAFF_ROLES.find((r) => r.id === c.role)!;
        win.body.addChild(text(`${c.name}  •  ${role.name.toLowerCase()}, ${'★'.repeat(c.tier)}`, 6, yy, { small: true, color: PAL.bone, width: 210, maxLines: 1 }));
        win.body.addChild(text(c.quirk, 6, yy + 7, { small: true, color: PAL.ash, width: 220, maxLines: 1 }));
        win.body.addChild(text(c.role === 'manager' ? `${[0, 10, 15, 20][c.tier]}%` : `${money(role.cost[c.tier])}/wk`, 230, yy + 2, { small: true, color: PAL.ash }));
        win.body.addChild(button('HIRE', 300, yy + 1, 40, 12, () => { this.msg = hire(s, i); sfx('cash'); draw(); this.refresh(); }, { small: true, fill: PAL.moss }));
      });
    };
    draw();
  }

  private mediaMenu(): void {
    const s = this.g.state!;
    const st = fm(s);
    const win = openWindow(this.g, 'Bleeter', 300, 180);
    win.body.addChild(text('Call somebody out. Starts beef, builds hype, sometimes gets you the fight.', 6, 4, { small: true, width: 288, color: PAL.ash }));
    const targets = calloutTargets(s);
    targets.forEach((t, i) => win.body.addChild(button(`@${t.last.toLowerCase()}  ${rankLabel(s, t.id)}`, 6 + (i % 2) * 146, 20 + Math.floor(i / 2) * 18, 142, 15, () => {
      const r = this.rng();
      this.msg = callOut(s, t.id, r);
      this.save(r);
      win.close();
      this.refresh();
    }, { small: true, fill: PAL.sky, disabled: st.ap <= 0 })));
    if (!targets.length) win.body.addChild(text('Nobody worth calling out yet. Get ranked.', 6, 24, { small: true, color: PAL.ash }));
    // Only Fighters: Bradie's subscription site
    win.body.addChild(text('ONLY FIGHTERS', 6, 96, { small: true, color: 0x6ad0ff }));
    if (st.ofa.joined) {
      win.body.addChild(text(`${st.ofa.subs} subscribers`, 80, 96, { small: true, color: PAL.bone }));
      win.body.addChild(button('POST CONTENT', 6, 106, 100, 15, () => { const r = this.rng(); this.msg = postContent(s, r); this.save(r); win.close(); this.refresh(); }, { small: true, fill: 0x1f6a90, disabled: st.ap <= 0 }));
    } else if (st.ofa.asked) win.body.addChild(text("Bradie's contract is in your PAPERWORK.", 80, 96, { small: true, color: PAL.ash }));
    else win.body.addChild(button('DM BRADIE FOR AN ACCOUNT', 6, 106, 150, 15, () => { const r = this.rng(); this.msg = askOnlyFighters(s, r); this.save(r); win.close(); this.refresh(); }, { small: true, fill: 0x1f6a90 }));
    win.body.addChild(button('POST SOMETHING WHOLESOME', 6, 132, 160, 15, () => {
      const r = this.rng();
      this.msg = humblePost(s, r);
      this.save(r);
      win.close();
      this.refresh();
    }, { small: true, fill: PAL.steel, disabled: st.ap <= 0 }));
  }

  private undergroundMenu(): void {
    const s = this.g.state!;
    const st = fm(s);
    const win = openWindow(this.g, 'darknet.biz/blackshop', 300, 190);
    const g = new Graphics().rect(0, 0, 300, 178).fill(0x041a08);
    win.body.addChild(g);
    const draw = () => {
      win.body.removeChildren().forEach((c) => c.destroy({ children: true }));
      win.body.addChild(new Graphics().rect(0, 0, 300, 178).fill(0x041a08));
      const G = 0x3cff6a;
      win.body.addChild(text('> CONNECTED. DO NOT SCREENSHOT.', 6, 4, { small: true, color: G }));
      const jq = namedPortrait('jimmy_quavo', 24);
      if (jq) {
        jq.position.set(268, 2);
        win.body.addChild(jq);
      }
      win.body.addChild(text(`JIMMY QUAVO (Abibas, beanie, no last name)  •  PEDs: ${st.ped.on ? 'ON CYCLE' : 'clean'}  •  failed tests: ${st.ped.caught}`, 6, 14, { small: true, width: 258, color: G, maxLines: 2 }));
      win.body.addChild(button(st.ped.on ? 'COME OFF THE CYCLE' : 'TEXT JIMMY: A CYCLE ($1,500)', 6, 30, 140, 15, () => { this.msg = st.ped.on ? stopPeds(s) : startPeds(s); draw(); this.refresh(); }, { small: true, fill: 0x1d5a2a }));
      win.body.addChild(text('Way faster gains. Random tests. Long suspensions. Your liver files a complaint.', 152, 30, { small: true, width: 142, color: 0x8fe0a0 }));
      const r0 = this.rng();
      const nxt = bkNext(s, r0);
      this.save(r0);
      const spot = bkSpot(s);
      win.body.addChild(text(`${BKB_NAME.toUpperCase()} (Bradie owns this too, "for the culture")${st.bk.signed ? '' : ': contract needed'}`, 6, 52, { small: true, width: 288, color: G }));
      win.body.addChild(text(`You: ${spot === 0 ? 'CHAMPION' : '#' + (spot + 1)} (${st.bk.w}-${st.bk.l})  •  Next: ${nxt.first} "${nxt.nick}" ${nxt.last}  •  Purse ${money(bkPurse(s))}`, 6, 70, { small: true, width: 288, color: 0x8fe0a0, maxLines: 2 }));
      win.body.addChild(button(spot === 0 ? 'DEFEND THE BELT' : 'FIGHT HIM', 6, 90, 100, 15, () => { const r = this.rng(); this.msg = bareknuckle(s, r); this.save(r); draw(); this.refresh(); }, { small: true, fill: 0x5a1d1d, disabled: st.ap <= 0 }));
      win.body.addChild(text('BACK-ROOM CARDS', 6, 112, { small: true, color: G }));
      [100, 500, 2000].forEach((stake, i) => win.body.addChild(button(`BET ${money(stake)}`, 6 + i * 80, 124, 76, 15, () => { const r = this.rng(); this.msg = gamble(s, stake, r); this.save(r); draw(); this.refresh(); }, { small: true, fill: 0x1d5a2a, disabled: st.money < stake })));
      if (this.msg) win.body.addChild(text(this.msg, 6, 146, { small: true, width: 288, color: 0x8fe0a0, maxLines: 3 }));
    };
    draw();
  }

  // ---------------------------------------------------------------- paperwork

  private paperwork(): void {
    const s = this.g.state!;
    const st = fm(s);
    const win = openWindow(this.g, 'Paperwork', 280, 150);
    if (!st.inbox.length) {
      win.body.addChild(text('Nothing to sign. Enjoy it while it lasts.', 6, 6, { small: true, color: PAL.ash }));
      return;
    }
    win.body.addChild(text('Read before you sign. Unread paperwork gets signed as-is after two weeks (or at the weigh-in).', 6, 2, { small: true, width: 268, color: PAL.ash }));
    st.inbox.slice(0, 7).forEach((d, i) => {
      win.body.addChild(button(`${d.title}  •  ${d.from}`, 6, 22 + i * 17, 268, 14, () => { win.close(); this.openDoc(d); }, { small: true, fill: d.kind === 'medical' ? PAL.blood : PAL.steel }));
    });
  }

  /** Papers-please style: compare the document to the reference card, flag what's wrong, then sign or dispute. */
  private openDoc(d: FMDoc): void {
    const s = this.g.state!;
    const frame = new Container();
    const wrap = this.g.modal(frame, { dim: 0.8 });
    const flagged = new Set<string>();
    const draw = () => {
      frame.removeChildren().forEach((c) => c.destroy({ children: true }));
      // the document (paper)
      const dx = 20;
      const dy = 16;
      const dw = 250;
      const dh = 230;
      frame.addChild(new Graphics().rect(dx + 3, dy + 3, dw, dh).fill({ color: 0x000000, alpha: 0.4 }).rect(dx, dy, dw, dh).fill(0xe8e0cc).rect(dx, dy, dw, 18).fill(0xd4c8ac));
      frame.addChild(text(d.title, dx + 6, dy + 5, { color: 0x2a2018 }));
      frame.addChild(text(`From: ${d.from}`, dx + 6, dy + 22, { small: true, color: 0x5a4a38, width: dw - 12 }));
      d.fields.forEach((fl, i) => {
        const y = dy + 36 + i * 22;
        const on = flagged.has(fl.label);
        const row = new Container();
        row.addChild(new Graphics().rect(0, 0, dw - 12, 19).fill(on ? 0xf0b0a0 : 0xf4eedf).stroke({ color: on ? 0xa01818 : 0xc8bca0, width: 1 }));
        row.addChild(text(fl.label.toUpperCase(), 4, 2, { small: true, color: 0x7a6a50 }));
        row.addChild(text(fl.value, 4, 10, { small: true, color: 0x1a1410, width: dw - 20, maxLines: 1 }));
        row.position.set(dx + 6, y);
        row.eventMode = 'static';
        row.cursor = 'pointer';
        row.on('pointertap', () => {
          if (on) flagged.delete(fl.label);
          else flagged.add(fl.label);
          sfx('click');
          draw();
        });
        frame.addChild(row);
      });
      frame.addChild(text('Click a line to flag it.', dx + 6, dy + dh - 12, { small: true, color: 0x7a6a50 }));
      // the reference card
      const rx = 284;
      const rw = 182;
      frame.addChild(box(rw, 150, PAL.night, PAL.gold, { bevel: true })).position.set(rx, dy);
      frame.addChild(text(d.ref.title, rx + 6, dy + 6, { small: true, color: PAL.gold, width: rw - 12 }));
      d.ref.lines.forEach((l, i) => {
        frame.addChild(text(l.label.toUpperCase(), rx + 6, dy + 20 + i * 22, { small: true, color: PAL.ash }));
        frame.addChild(text(l.value, rx + 6, dy + 28 + i * 22, { small: true, color: PAL.bone, width: rw - 12, maxLines: 2 }));
      });
      const done = (action: 'sign' | 'dispute') => {
        const r = this.rng();
        const res = resolveDoc(s, d.id, action, [...flagged], r);
        this.save(r);
        this.g.closeModal(wrap);
        sfx(res.good ? 'stamp' : 'bad');
        this.msg = res.text;
        this.refresh();
        this.g.autosave();
        alertBox(this.g, res.good ? 'FILED' : 'HMM', res.text);
      };
      frame.addChild(button('SIGN IT', rx, dy + 160, 86, 18, () => done('sign'), { fill: PAL.moss }));
      frame.addChild(button(d.kind === 'sponsor' ? 'TURN IT DOWN' : 'DISPUTE', rx + 96, dy + 160, 86, 18, () => done('dispute'), { fill: PAL.blood, disabled: d.kind !== 'sponsor' && !flagged.size }));
      frame.addChild(button('LATER', rx, dy + 184, 182, 14, () => this.g.closeModal(wrap), { small: true }));
      frame.addChild(text(d.kind === 'sponsor' ? 'Turning a deal down needs a flagged line to count as a catch.' : 'Dispute = send back the flagged lines.', rx, dy + 204, { small: true, width: 182, color: PAL.ash }));
    };
    draw();
  }

  private rankingsMenu(): void {
    const s = this.g.state!;
    const f = me(s);
    const st = fm(s);
    if (st.tier !== 'of') {
      const win = openWindow(this.g, `${TIER_NAME[st.tier]}: ${divisionName(f.division)}`, 240, 150);
      st.ladder.forEach((id, i) => {
        const x = s.fighters[id];
        win.body.addChild(text(`${i === 0 ? 'C ' : '#' + (i + 1)}  ${fullName(x)}  ${record(x.record)}`, 6, 4 + i * 11, { small: true, color: id === f.id ? PAL.gold : PAL.bone }));
      });
      win.body.addChild(text(st.tier === 'amateur' ? 'Beat the champ to turn pro.' : "Win the Fury FC belt and Bradie's people call.", 6, 4 + st.ladder.length * 11 + 4, { small: true, color: PAL.ash }));
      return;
    }
    const win = openWindow(this.g, `${divisionName(f.division)} rankings`, 240, 220);
    const sb = new ScrollBox(228, 196);
    sb.position.set(6, 4);
    const champ = undisputed(s, f.division)?.holder;
    const ids = [champ, ...(s.rankings[f.division] ?? [])].filter((x): x is string => !!x);
    ids.forEach((id, i) => {
      const x = s.fighters[id];
      sb.content.addChild(text(`${i === 0 && champ ? 'C ' : '#' + (champ ? i : i + 1)}  ${fullName(x)}  ${record(x.record)}`, 0, i * 11, { small: true, color: id === f.id ? PAL.gold : PAL.bone }));
    });
    if (!ids.includes(f.id)) sb.content.addChild(text(`…  ${fullName(f)} (unranked)`, 0, ids.length * 11 + 4, { small: true, color: PAL.gold }));
    win.body.addChild(sb);
    sb.refresh();
  }

  private menu(): void {
    const win = openWindow(this.g, 'Menu', 160, 92);
    win.body.addChild(button('SAVE', 6, 6, 148, 15, () => { this.g.autosave(); this.g.toast('Saved.', PAL.moss, { small: true }); win.close(); }, { small: true }));
    win.body.addChild(button('RETIRE…', 6, 24, 148, 15, () => { win.close(); confirm(this.g, 'Hang up the gloves for good?', () => this.legacy()); }, { small: true, fill: PAL.ember }));
    win.body.addChild(button('QUIT TO TITLE', 6, 42, 148, 15, () => { this.g.autosave(); win.close(); void import('./title').then((m) => this.g.goto(new m.TitleScene(this.g))); }, { small: true }));
  }

  private legacy(): void {
    const s = this.g.state!;
    const st = fm(s);
    const f = me(s);
    st.retired = true;
    const titles = st.history.filter((h) => h.result === 'W').length;
    const wasChamp = Object.values(s.belts).some((b) => b.holder === f.id) || st.log.some((l) => /CHAMPION/.test(l.text));
    const verdict = wasChamp ? 'A champion. They will put you in the hall of fame and spell your name wrong.' : f.record.w > f.record.l * 2 ? 'A real one. Fans will remember your fights; promoters will remember your invoices.' : 'A journeyman with stories. Great at barbecues.';
    alertBox(this.g, 'LEGACY', `${fullName(f)} retires at ${f.age} with a record of ${record(f.record)}.\n${titles} wins under the ${s.promotion.name} banner. ${st.ped.caught ? `${st.ped.caught} failed drug test${st.ped.caught > 1 ? 's' : ''}. ` : ''}\n\n${verdict}`, () => {
      this.g.autosave();
      void import('./title').then((m) => this.g.goto(new m.TitleScene(this.g)));
    });
  }

  private endTheWeek(): void {
    const s = this.g.state!;
    const r = this.rng();
    endWeek(s, r);
    this.save(r);
    this.msg = '';
    sfx('bell');
    this.g.autosave();
    this.refresh();
    setTimeout(() => this.popups(), 250);
  }

  // ---------------------------------------------------------------- fight week

  private weighIn(): void {
    const s = this.g.state!;
    const st0 = fm(s);
    if (st0.inbox.length && !this.paperworkWarned) {
      this.paperworkWarned = true;
      confirm(this.g, `You have ${st0.inbox.length} unread document${st0.inbox.length > 1 ? 's' : ''}${st0.inbox.some((d) => d.kind === 'medical') ? " (including your opponent's medicals)" : ''}. Weigh in anyway? Unread paperwork gets signed as-is (PAPERWORK to read it first).`, () => this.weighIn(), 'WEIGH IN', 'NOT YET');
      return;
    }
    this.paperworkWarned = false;
    {
      const r = this.rng();
      const lines = fightWeekPaperwork(s, r);
      this.save(r);
      if (lines.length) this.msg = lines.join(' ');
    }
    const { need, risk } = weighInInfo(s);
    const frame = new Container();
    const wrap = this.g.modal(frame, { dim: 0.7 });
    const bw = 320;
    const bh = 112;
    const bx = (W - bw) / 2;
    const by = (H - bh) / 2;
    frame.addChild(box(bw, bh, PAL.night, PAL.gold, { bevel: true })).position.set(bx, by);
    frame.addChild(text('WEIGH-INS', bx + 8, by + 6, { color: PAL.gold }));
    frame.addChild(text(need <= 0 ? `You're on weight (${weightLimit(s)} lbs). Step on the scale and flex.` : `You walk around ${fm(s).walkWeight.toFixed(1)} lbs. The limit is ${weightLimit(s)}. You need to cut ${need.toFixed(1)} lbs. Risk of missing: ~${Math.round(risk * 100)}% (a nutritionist helps).`, bx + 8, by + 20, { small: true, width: bw - 16, color: PAL.bone }));
    const go = (c: 'easy' | 'hard' | 'miss') => {
      const r = this.rng();
      const res = doWeighIn(s, c, r);
      this.save(r);
      this.g.closeModal(wrap);
      alertBox(this.g, res.made ? 'MADE WEIGHT' : 'MISSED WEIGHT', res.text, () => this.gameplan());
    };
    frame.addChild(button(need <= 0 ? 'STEP ON THE SCALE' : 'SENSIBLE CUT', bx + 8, by + bh - 40, 96, 15, () => go('easy'), { small: true, fill: PAL.moss }));
    if (need > 0) {
      frame.addChild(button('BRUTAL SAUNA CUT', bx + 112, by + bh - 40, 96, 15, () => go('hard'), { small: true, fill: PAL.ember }));
      frame.addChild(button('SKIP IT, PAY FINE', bx + 216, by + bh - 40, 96, 15, () => go('miss'), { small: true, fill: PAL.shadow }));
      frame.addChild(text('Sensible: less energy lost, more risk. Brutal: you make it more often but fight dehydrated.', bx + 8, by + bh - 20, { small: true, width: bw - 16, color: PAL.ash }));
    }
  }

  private gameplan(): void {
    const s = this.g.state!;
    const st = fm(s);
    const frame = new Container();
    const wrap = this.g.modal(frame, { dim: 0.75 });
    const bw = 420;
    const bh = 210;
    const bx = (W - bw) / 2;
    const by = (H - bh) / 2;
    const opp = s.fighters[st.fight!.opp];
    frame.addChild(box(bw, bh, PAL.night, PAL.gold, { bevel: true })).position.set(bx, by);
    frame.addChild(text(`GAMEPLAN vs ${fullName(opp).toUpperCase()}`, bx + 8, by + 6, { color: PAL.gold }));
    const sk = opp.skills;
    const read = sk.wrestling > sk.striking + 8 ? 'He wants to take you down.' : sk.striking > sk.wrestling + 8 ? 'He wants to stand and bang.' : 'Well-rounded. No obvious hole.';
    frame.addChild(text(`Scouting: ${read}  Cardio ${sk.cardio > 70 ? 'deep' : sk.cardio < 55 ? 'questionable' : 'average'}. Chin ${sk.chin > 75 ? 'granite' : sk.chin < 55 ? 'glass' : 'normal'}.`, bx + 8, by + 18, { small: true, width: bw - 16, color: PAL.bone }));
    PLANS.forEach((p, i) => {
      const x = bx + 8 + (i % 2) * 204;
      const y = by + 40 + Math.floor(i / 2) * 40;
      frame.addChild(button(p.name, x, y, 196, 16, () => { st.plan = p.id; this.g.closeModal(wrap); this.startFight(); }, { small: true, fill: PAL.steel }));
      frame.addChild(text(p.text, x + 2, y + 19, { small: true, width: 192, color: PAL.ash, maxLines: 2 }));
    });
  }

  private startFight(): void {
    const s = this.g.state!;
    const st = fm(s);
    const f = me(s);
    const r = this.rng();
    const ev = fightEvent(s, r);
    this.save(r);
    const mine = ev.card.find((b) => b.a === f.id || b.b === f.id)!;
    const opp = s.fighters[st.fight!.opp];
    // tonight you fight with tonight's body; your opponent with whatever the paperwork and your sparring partner did to him
    const backup = { ...f.skills };
    const oppBackup = { ...opp.skills };
    f.skills = fightReadySkills(s);
    const mod = (k: keyof Skills, d: number) => (opp.skills[k] = Math.max(10, Math.min(99, opp.skills[k] + d)));
    if (st.oppFlagged) {
      mod('chin', -10);
      mod('cardio', -8);
    }
    if (st.fight!.heavyOpp) {
      mod('power', 5);
      mod('wrestling', 4);
    }
    if (st.partner?.leaking) mod('fightIQ', 8);
    if (st.partner?.fake) mod('fightIQ', -6);
    const restore = () => {
      f.skills = backup;
      opp.skills = oppBackup;
    };
    const oppPlan = (round: number): GamePlan => {
      const o = opp.skills;
      return round === 1 ? 'balanced' : o.wrestling > o.striking ? 'wrestle' : 'pressure';
    };
    const side = (b: { a: string }) => (b.a === f.id ? 0 : 1);
    const scene = new FightNightScene(this.g, ev.id, {
      event: ev,
      fm: {
        player: f.id,
        extra: () => ({
          plan: (sd, round) => (sd === side(mine) ? st.roundPlans[round] ?? st.plan : oppPlan(round)),
          cornerAid: (sd, round) => (sd === side(mine) ? st.cornerAid[round] : undefined),
        }),
        corner: (round, bout, done) => {
          const rep = (bout.result?.corners ?? []).find((c) => c.round === round && c.side === side(bout));
          openCorner(this.g, f, rep, st.staff.cutman, round, (aid, plan) => {
            st.cornerAid[round] = aid;
            for (let k = round + 1; k <= bout.rounds; k++) st.roundPlans[k] = plan;
            done();
          });
        },
        live: (bout, done) => {
          const r2 = this.rng();
          const off = officialsFor(s, ev, r2);
          const seed = r2.int(1, 1e9);
          this.save(r2);
          const A = s.fighters[bout.a];
          const B = s.fighters[bout.b];
          openLiveFight(this.g, {
            bout, A, B, skills: [A.skills, B.skills], player: side(bout) as 0 | 1, plan: st.plan, oppPlan: oppPlan(2), cutTier: st.staff.cutman, seed,
            event: ev.name, judges: off.judges.map((j) => j.name), referee: off.referee.name,
            done: (res) => {
              bout.result = res;
              done();
            },
          });
        },
        after: (bout) => this.cageside(bout),
      },
      onWrap: () => {
        restore();
        const r2 = this.rng();
        const won = mine.result?.winner === f.id;
        const lines = afterFight(s, ev, r2);
        const quote = bradieOnYou(s, won, r2);
        this.save(r2);
        this.g.autosave();
        this.g.goto(new FMHubScene(this.g));
        setTimeout(() => {
          alertBox(this.g, won ? 'VICTORY' : 'FIGHT OVER', lines.join('\n'), () => {
            this.bradieSays(quote, () => {
              if (won) this.micMoment();
            });
          });
        }, 400);
      },
    });
    this.g.goto(scene);
  }

  /** Bradie pops up on his stream / podcast with an opinion. */
  private bradieSays(line: string, then?: () => void): void {
    const frame = new Container();
    const wrap = this.g.modal(frame, { dim: 0.7 });
    const bw = 320;
    const bh = 96;
    const bx = (W - bw) / 2;
    const by = (H - bh) / 2;
    frame.addChild(box(bw, bh, PAL.night, 0x2aa0d8, { bevel: true })).position.set(bx, by);
    const por = portrait({ id: 'npc_bradie_taylor', look: BRADIE.look, gender: 'M', age: 41, variant: 'reporter', attire: 'hoodie', accent: 0x2aa0d8 }, 64);
    por.position.set(bx + 8, by + 8);
    frame.addChild(por);
    frame.addChild(text(`${BRADIE.name.toUpperCase()}`, bx + 78, by + 8, { small: true, color: 0x6ad0ff }));
    frame.addChild(text(BRADIE.title + '  •  LIVE', bx + 78, by + 16, { small: true, color: PAL.ash }));
    frame.addChild(text(line, bx + 78, by + 27, { small: true, width: bw - 86, color: PAL.bone, maxLines: 6 }));
    frame.addChild(button('LOL OK', bx + bw - 64, by + bh - 20, 56, 14, () => { this.g.closeModal(wrap); then?.(); }, { small: true, fill: PAL.steel }));
  }

  /** Cageside: you watched somebody else's fight on your card. Start something? */
  private cageside(bout: { result?: { winner: string | null; loser: string | null; method: string } }): void {
    const s = this.g.state!;
    const res = bout.result;
    if (!res?.winner || !res.loser) return;
    const w = s.fighters[res.winner];
    const l = s.fighters[res.loser];
    const frame = new Container();
    const wrap = this.g.modal(frame, { dim: 0.6 });
    const bw = 300;
    const bh = 120;
    const bx = (W - bw) / 2;
    const by = (H - bh) / 2;
    frame.addChild(box(bw, bh, PAL.night, PAL.gold, { bevel: true })).position.set(bx, by);
    frame.addChild(text('CAGESIDE', bx + 8, by + 6, { color: PAL.gold }));
    frame.addChild(text(`${fullName(w)} just beat ${fullName(l)} by ${res.method}. The camera finds you in the crowd.`, bx + 8, by + 20, { small: true, width: bw - 16, color: PAL.bone }));
    const pick = (c: 'stare' | 'clap' | 'mock' | 'ignore') => {
      const r = this.rng();
      const out = cagesideReact(s, w.id, l.id, c, r);
      this.save(r);
      this.g.closeModal(wrap);
      if (out) this.g.toast(out, PAL.gold, { small: true });
    };
    const opts: [typeof pick extends (c: infer C) => void ? C : never, string, number][] = [['stare', `STARE DOWN ${w.last.toUpperCase()}`, PAL.blood], ['mock', `LAUGH AT ${l.last.toUpperCase()}`, PAL.ember], ['clap', 'SLOW CLAP', PAL.steel], ['ignore', 'CHECK YOUR PHONE', PAL.shadow]];
    opts.forEach(([c, label, fill], i) => frame.addChild(button(label, bx + 8 + (i % 2) * 144, by + 50 + Math.floor(i / 2) * 20, 140, 15, () => pick(c), { small: true, fill })));
  }

  private micMoment(): void {
    const s = this.g.state!;
    const frame = new Container();
    const wrap = this.g.modal(frame, { dim: 0.7 });
    const bw = 300;
    const targets = calloutTargets(s).slice(0, 4);
    const bh = 54 + targets.length * 18;
    const bx = (W - bw) / 2;
    const by = (H - bh) / 2;
    frame.addChild(box(bw, bh, PAL.night, PAL.gold, { bevel: true })).position.set(bx, by);
    frame.addChild(text('THEY HAND YOU THE MIC', bx + 8, by + 6, { color: PAL.gold }));
    const pick = (id: string | null) => {
      const r = this.rng();
      const out = postFightCallout(s, id, r);
      this.save(r);
      this.g.closeModal(wrap);
      alertBox(this.g, 'THE MIC', out, () => this.refreshScene());
    };
    targets.forEach((t, i) => frame.addChild(button(`CALL OUT ${t.last.toUpperCase()} (${rankLabel(s, t.id)})`, bx + 8, by + 22 + i * 18, bw - 16, 15, () => pick(t.id), { small: true, fill: PAL.blood })));
    frame.addChild(button('THANK EVERYONE', bx + 8, by + bh - 22, bw - 16, 15, () => pick(null), { small: true, fill: PAL.steel }));
  }

  private refreshScene(): void {
    const sc = this.g.scene;
    if (sc instanceof FMHubScene) sc.refresh();
  }
}
