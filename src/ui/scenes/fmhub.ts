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
import { openHelp } from '../help';
import { openSettings } from './settings';
import { showMoment } from '../moments';
import { divisionMoves, changeDivision, gym, openGym, upgradeGym, GYM_COST, GYM_UPGRADE } from '../../sim/legacy';
import { createNewGame } from '../../sim/newgame';
import { startWeek } from '../../sim/week';
import { routePhase } from '../flow';
import { openAchievements, checkAchievements } from '../achievements';
import { openSaveSlots, openLoad } from './loadmenu';
import { familyOf } from '../../core/save';
import { fighterPortrait } from '../sprites';
import { money, record } from '../../core/format';
import { fmtDate } from '../../core/time';
import { Rng } from '../../core/rng';
import { sfx } from '../../audio/sfx';
import { fullName, overall } from '../../sim/fighters';
import { divisionName, DIVISION_ORDER } from '../../sim/divisions';
import { rankLabel, rankOf, undisputed } from '../../sim/rankings';
import {
  fm, me, BODY_PARTS, STAFF_ROLES, PLANS, doAction, treat, clinicCost, weeklyStaffCost, calloutTargets, callOut, humblePost,
  startPeds, stopPeds, bareknuckle, gamble, acceptOffer, resolveEvent, endWeek, fightThisWeek, weighInInfo, doWeighIn, fightEvent,
  afterFight, postFightCallout, weightLimit, contractLimit, fightReadySkills, type ActionId, type StaffId, type BodyPart,
  ensureFM, condition, trainSkill, trainPreview, isMaxed, SKILL_MAX, cutWindow, allocateSpar, cutWeight, hire, fire, fightWeekPaperwork, cagesideReact, bkNext, bkPurse, bkSpot,
  ladderSpot, stage, BKB_NAME, BRADIE, bradieOnYou, askOnlyFighters, postContent, cardSlot, SLOT_NAME, type CutMethod,
} from '../../sim/fighter';
import { FightNightScene } from './fightnight';
import { openCorner } from '../cutman';
import type { GamePlan } from '../../sim/fight';
import { openLiveFight } from '../livefight';
import { openFMDesk } from '../fmdesk';
import { eventSponsors, eventCanvas } from '../../sim/sponsorship';
import { openJumpRope, openTyreChop } from '../minigames';
import { officialsFor } from '../../sim/events';
import { portrait, namedPortrait, reporterPortrait } from '../sprites';
import { content } from '../../core/content';
import { fightWeekShow } from '../faceoff';
import { bossLive } from '../../sim/cast';

const bar = (w: number, v: number, color: number): Graphics => {
  const g = new Graphics();
  g.rect(0, 0, w, 5).fill(0x221e26).stroke({ color: 0x000000, width: 1 });
  g.rect(1, 1, Math.max(0, (w - 2) * Math.max(0, Math.min(1, v / 100))), 3).fill(color);
  return g;
};

export class FMHubScene extends Scene {
  music = 'office' as const;
  tutorialKey = 'fmhub';
  private msg = '';
  private paperworkWarned = false;
  private rng(): Rng {
    return new Rng(this.g.state!.rng);
  }
  private save(r: Rng): void {
    this.g.state!.rng = r.state;
  }

  /** set while the post-fight chain (results, Bradie, the mic) plays; popups wait for it */
  static holdPopups = false;

  enter(): void {
    if (this.g.state) ensureFM(this.g.state);
    super.enter();
    if (!FMHubScene.holdPopups) setTimeout(() => this.popups(), 300);
  }

  /** Week report, then any controversy waiting for a decision. */
  popups(): void {
    const s = this.g.state;
    if (!s?.fm || this.g.modals.length) return;
    const st = fm(s);
    if (st.weekReport && st.weekReport.length) {
      const lines = st.weekReport;
      st.weekReport = null;
      alertBox(this.g, `WEEK ${s.week + 1}`, lines.slice(0, 9).join('\n'), () => this.popups());
      return;
    }
    if (st.moments?.length) {
      const m = st.moments.shift()!;
      showMoment(this.g, s, m, () => new Rng((Math.random() * 1e9) | 0), () => {
        this.g.autosave();
        this.refresh();
        setTimeout(() => this.popups(), 250);
      });
      return;
    }
    const ev = st.pending[0];
    if (!ev) return checkAchievements(this.g);
    const frame = new Container();
    const wrap = this.g.modal(frame, { dim: 0.7 });
    const bw = 320;
    const many = ev.choices.length > 3;
    const bh = many ? 74 + ev.choices.length * 17 : 120;
    const bx = (W - bw) / 2;
    const by = (H - bh) / 2;
    frame.addChild(box(bw, bh, PAL.night, PAL.blood, { bevel: true })).position.set(bx, by);
    const repDef = ev.portrait?.startsWith('rep:') ? content().reporters.find((x) => x.id === ev.portrait!.slice(4)) : null;
    const face = ev.portrait?.startsWith('npc:') ? namedPortrait(ev.portrait.slice(4), 32) : repDef ? reporterPortrait(repDef, 32) : null;
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
    L.addChild(text(st.tier === 'amateur' ? `AM ${record(f.record)}` : record(f.record), 72, 42, { color: PAL.bone }));
    if (st.amateur) L.addChild(text(`PRO  (AM ${st.amateur.w}-${st.amateur.l}${st.amateur.d ? '-' + st.amateur.d : ''})`, 72, 62, { small: true, color: PAL.ash, width: 72, maxLines: 1 }));
    const rk = rankOf(s, f.id);
    const spot = ladderSpot(s);
    if (st.tier === 'of') L.addChild(text(rk === 0 ? 'CHAMPION' : rk ? `RANKED #${rk}` : 'UNRANKED', 72, 54, { small: true, color: rk === 0 ? PAL.gold : rk ? PAL.sky : PAL.ash }));
    else L.addChild(text(`${stage(s).short} ${spot === 0 ? 'CHAMP' : '#' + ((spot ?? 0) + 1)}`, 72, 54, { small: true, color: spot === 0 ? PAL.gold : PAL.sky, width: 72, maxLines: 1 }));
    L.addChild(text(`${divisionName(f.division)}  •  ${stage(s).short}`, 4, 72, { small: true, color: PAL.ash, width: 140, maxLines: 1 }));
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
    const lim = contractLimit(s);
    const over = st.walkWeight - lim;
    vit('WEIGHT', Math.max(0, 100 - over * 5), over > 12 ? PAL.blood : over > 7 ? PAL.ember : PAL.moss, `${st.walkWeight.toFixed(1)} / ${lim}`);
    const health = Math.round(BODY_PARTS.reduce((a, p) => a + st.body[p.id], 0) / BODY_PARTS.length);
    vit('HEALTH', health, health < 60 ? PAL.blood : PAL.moss, `${health}`);
    L.addChild(text(`Diet`, 4, y + 2, { small: true, color: PAL.ash }));
    L.addChild(selector(30, y, 112, [{ value: 'clean' as const, label: 'Clean ($$)' }, { value: 'balanced' as const, label: 'Balanced' }, { value: 'junk' as const, label: 'Junk ($)' }], st.diet, (v) => { st.diet = v; }));
    y += 16;
    if (st.ped.on) L.addChild(text('ON A CYCLE', 4, y + 2, { small: true, color: PAL.blood }));
    L.addChild(button(`CAREER FILE${st.rap?.length ? ` (${st.rap.length} FLAG${st.rap.length > 1 ? 'S' : ''})` : ''}`, 4, 212, 138, 11, () => this.careerFile(), { small: true, fill: st.rap?.length ? 0x3a1a1a : PAL.shadow }));

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
      // sparring earns points: spend them now
      if (a === 'spar' && (st.sparPoints ?? 0) > 0) setTimeout(() => this.sparAllocate(), 120);
      else setTimeout(() => this.popups(), 100);
    };
    act('TRAIN…', 17, () => this.trainMenu(), { tip: 'Pick a skill to drill. Peak condition = bigger gains' });
    act('SPAR…', 32, () => this.sparMenu(run), { tip: 'Big gains, real risk' });
    const cw = cutWindow(s);
    act(cw.open ? 'CUT WEIGHT…' : 'CUT WEIGHT (FINAL 2 WKS)', 47, () => this.cutMenu(), { fill: cw.open ? PAL.ember : PAL.shadow, tip: cw.open ? 'Roadwork, sauna or a strict diet' : 'The dedicated cut opens two weeks before the fight' });
    act('WORK A SHIFT', 62, () => run('work'), { tip: 'Money, but it drains you' });
    act('REST & RECOVER', 77, () => run('rest'));
    act('GO OUT TONIGHT', 92, () => run('party'), { fill: PAL.plum, tip: 'Morale up. What could go wrong?' });
    act('BLEETER / CALLOUTS', 107, () => this.mediaMenu(), { fill: PAL.sky });
    // free actions
    const free = (label: string, yy: number, fn: () => void, fill: number = PAL.shadow) => M.addChild(button(label, 6, yy, 148, 14, fn, { small: true, fill }));
    free(`PAPERWORK${st.inbox.length ? ` (${st.inbox.length})` : ''}`, 126, () => this.paperwork(), st.inbox.length ? PAL.ember : PAL.shadow);
    free('CONDITION & CLINIC', 141, () => this.conditionMenu());
    free('STAFF', 156, () => this.staffMenu());
    free(`${stage(s).short} ROSTER & RANKINGS`, 171, () => this.rankingsMenu());
    if (st.undergroundOpen) free('THE UNDERGROUND', 186, () => this.undergroundMenu(), 0x1d3a22);
    if ((st.sparPoints ?? 0) > 0) M.addChild(button(`SPEND ${st.sparPoints} SPARRING POINTS`, 6, 186 + (st.undergroundOpen ? 15 : 0), 148, 14, () => this.sparAllocate(), { small: true, fill: PAL.gold }));
    const extraRows = (st.undergroundOpen ? 1 : 0) + ((st.sparPoints ?? 0) > 0 ? 1 : 0);
    if (this.msg) M.addChild(text(this.msg, 6, 187 + extraRows * 15, { small: true, width: 148, color: PAL.bone, maxLines: extraRows >= 2 ? 1 : extraRows ? 2 : 3 }));

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
    if (st.legacy) r.addChild(button('LEGACY…', 60, H - 19, 60, 16, () => this.legacyMenu(), { small: true, fill: PAL.plum }));
    r.addChild(text(`Staff ${money(weeklyStaffCost(s))}/wk`, st.legacy ? 126 : 62, H - 14, { small: true, color: PAL.ash }));
  }

  // ---------------------------------------------------------------- menus

  private trainMenu(): void {
    const s = this.g.state!;
    const win = openWindow(this.g, 'Train', 320, 206);
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
    const keys: [keyof Skills, string][] = [['striking', 'Striking'], ['power', 'Power'], ['wrestling', 'Wrestling'], ['grappling', 'Jiu-jitsu'], ['cardio', 'Cardio'], ['fightIQ', 'Fight IQ'], ['chin', 'Neck & chin'], ['durability', 'Conditioning'], ['heart', 'Heart']];
    const NAME: Partial<Record<keyof Skills, string>> = { ...Object.fromEntries(keys), chin: 'Chin', durability: 'Cond.', grappling: 'BJJ' };
    win.body.addChild(text('SKILL', 6, 2, { small: true, color: PAL.ash }));
    win.body.addChild(text('NOW', 150, 2, { small: true, color: PAL.ash }));
    win.body.addChild(text('AFTER A SESSION', 176, 2, { small: true, color: PAL.ash }));
    keys.forEach(([k, label], i) => {
      const y = 12 + i * 14;
      const v = f.skills[k];
      const pv = trainPreview(s, k);
      const maxed = isMaxed(v);
      const trainable = k !== 'heart' && !maxed;
      win.body.addChild(text(label, 6, y + 3, { small: true, color: PAL.bone }));
      // the bar: what you have, and (gold) what one session adds
      const bar = new Graphics().rect(60, y + 3, 86, 6).fill(0x1a1820).rect(60, y + 3, Math.round(86 * v / 100), 6).fill(PAL.steel);
      if (trainable) bar.rect(60 + Math.round(86 * v / 100), y + 3, Math.max(1, Math.round(86 * pv.gain / 100)), 6).fill(PAL.gold);
      win.body.addChild(bar);
      win.body.addChild(text(String(Math.round(v)), 150, y + 3, { small: true, color: PAL.bone }));
      const after1 = Math.min(SKILL_MAX, v + pv.gain);
      win.body.addChild(text(maxed ? 'MAX' : trainable ? `${after1.toFixed(1)}  (+${pv.gain}${pv.buddy ? `, ${NAME[pv.buddy] ?? pv.buddy} +${pv.buddyGain}` : ''})` : 'comes from real fights', 176, y + 3, { small: true, color: maxed ? PAL.moss : trainable ? PAL.gold : PAL.ash, width: 98, maxLines: 1 }));
      if (maxed && k !== 'heart') win.body.addChild(button('MAX', 276, y, 38, 12, () => {}, { small: true, fill: PAL.shadow, disabled: true }));
      else if (trainable) win.body.addChild(button('TRAIN', 276, y, 38, 12, () => { win.close(); after(k, null); }, { small: true, fill: PAL.steel, disabled: fm(s).ap <= 0 }));
    });
    const my = 12 + keys.length * 14 + 2;
    win.body.addChild(text('MINI GAMES (a good score beats a normal session):', 6, my, { small: true, color: PAL.gold }));
    const ropeMax = isMaxed(f.skills.cardio);
    const chopMax = isMaxed(f.skills.power);
    win.body.addChild(button(ropeMax ? 'JUMP ROPE: cardio MAX' : 'JUMP ROPE: cardio', 6, my + 10, 150, 13, () => { win.close(); openJumpRope(this.g, (sc) => after('cardio', sc)); }, { small: true, fill: PAL.moss, disabled: ropeMax || fm(s).ap <= 0 }));
    win.body.addChild(button(chopMax ? 'TYRE CHOP: power MAX' : 'TYRE CHOP: power', 162, my + 10, 150, 13, () => { win.close(); openTyreChop(this.g, (sc) => after('power', sc)); }, { small: true, fill: PAL.moss, disabled: chopMax || fm(s).ap <= 0 }));
    win.body.addChild(text(`Condition: ${cond.label} (x${cond.mult} gains). Training burns a little weight; the real cut is the last two weeks of camp.`, 6, my + 26, { small: true, width: 306, color: cond.label === 'PEAK CONDITION' ? PAL.gold : PAL.ash, maxLines: 2 }));
  }

  /** Sparring points: put them where your camp needs them. */
  private sparAllocate(): void {
    const s = this.g.state!;
    const st = fm(s);
    const f = me(s);
    const total = st.sparPoints ?? 0;
    if (total <= 0) return;
    const alloc: Partial<Record<keyof Skills, number>> = {};
    const keys: [keyof Skills, string][] = [['striking', 'Striking'], ['power', 'Power'], ['wrestling', 'Wrestling'], ['grappling', 'Jiu-jitsu'], ['cardio', 'Cardio'], ['fightIQ', 'Fight IQ'], ['chin', 'Neck & chin'], ['durability', 'Conditioning']];
    const win = openWindow(this.g, 'Sparring: spend your points', 250, 164, { onClose: () => this.refresh() });
    const draw = () => {
      win.body.removeChildren().forEach((c) => c.destroy({ children: true }));
      const used = Object.values(alloc).reduce((a, b) => a + (b ?? 0), 0);
      const left = total - used;
      win.body.addChild(text(`${left} of ${total} point${total > 1 ? 's' : ''} left. One point = +1.`, 6, 2, { small: true, color: left ? PAL.gold : PAL.moss }));
      keys.forEach(([k, label], i) => {
        const y = 12 + i * 14;
        const n = alloc[k] ?? 0;
        const now = f.skills[k];
        // points can't take a skill past the cap: at the cap the row reads MAX
        const atCap = isMaxed(now + n);
        win.body.addChild(text(label, 6, y + 3, { small: true, color: PAL.bone }));
        win.body.addChild(text(isMaxed(now) ? 'MAX' : `${Math.round(now)}${n ? `  ->  ${atCap ? 'MAX' : Math.round(now + n)}` : ''}`, 80, y + 3, { small: true, color: isMaxed(now) ? PAL.moss : n ? PAL.gold : PAL.ash }));
        win.body.addChild(button('-', 160, y, 16, 12, () => { if (n > 0) { alloc[k] = n - 1; draw(); } }, { small: true, fill: PAL.shadow, disabled: n <= 0 }));
        win.body.addChild(text(String(n), 180, y + 3, { small: true, color: PAL.bone, width: 14, align: 'center' }));
        win.body.addChild(button(atCap ? 'MAX' : '+', 196, y, atCap ? 26 : 16, 12, () => { if (left > 0 && !atCap) { alloc[k] = n + 1; draw(); } }, { small: true, fill: PAL.steel, disabled: left <= 0 || atCap }));
      });
      win.body.addChild(button(left ? 'SAVE THE REST FOR LATER' : 'DONE', 6, 128, 236, 14, () => {
        this.msg = allocateSpar(s, alloc);
        sfx('good');
        win.close();
        this.refresh();
      }, { small: true, fill: left ? PAL.steel : PAL.moss }));
    };
    draw();
  }

  private cutMenu(): void {
    const s = this.g.state!;
    const st = fm(s);
    const win = openWindow(this.g, 'Cut weight', 250, 128);
    const lim = contractLimit(s);
    const cw = cutWindow(s);
    win.body.addChild(text(`You walk around ${st.walkWeight.toFixed(1)} lbs. ${lim !== weightLimit(s) ? 'Contracted' : 'Limit'} ${lim}. ${st.water > 0 ? `(${st.water.toFixed(1)} lbs is sauna water.)` : ''}`, 6, 4, { small: true, width: 238, color: PAL.bone }));
    if (!cw.open) {
      // too early: the cut is the last two weeks of camp
      win.body.addChild(text(cw.weeksOut === null ? 'No fight booked. There is nothing to cut for yet: train (it burns a little) and keep the diet clean.' : `The fight is ${cw.weeksOut} weeks out. Cut now and it all comes back. The dedicated cut opens in the last two weeks of camp. Until then, training burns a little.`, 6, 26, { small: true, width: 238, color: PAL.ash, maxLines: 6 }));
      return;
    }
    const go = (m: CutMethod) => {
      win.close();
      this.msg = cutWeight(s, m);
      sfx('click');
      this.refresh();
    };
    const opts: [CutMethod, string, string][] = [
      ['roadwork', 'ROADWORK', '-3 lbs and some cardio. Tiring.'],
      ['diet', 'STRICT DIET', '-2 lbs. Morale takes a hit. Nutritionist helps.'],
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

  /** Same inspection as the career desk, at your kitchen table. */
  private paperwork(): void {
    openFMDesk(this.g, () => {
      this.refresh();
      setTimeout(() => this.popups(), 200);
    });
  }

  /** The whole roster of the promotion you're in, division by division (rankings, champion first). */
  private rankingsMenu(div?: string): void {
    const s = this.g.state!;
    const f = me(s);
    const st = fm(s);
    const sg = stage(s);
    const d = div ?? f.division;
    const divs = st.tier === 'of' ? s.divisionsOpen.slice() : Object.keys(st.rosters).length ? Object.keys(st.rosters) : [f.division];
    divs.sort((a, b) => DIVISION_ORDER.indexOf(a) - DIVISION_ORDER.indexOf(b));
    const win = openWindow(this.g, `${sg.short} roster`, 250, 230);
    win.body.addChild(text(sg.name, 6, 3, { small: true, color: PAL.gold, width: 238, maxLines: 1 }));
    win.body.addChild(selector(6, 12, 238, divs.map((x) => ({ value: x, label: divisionName(x) })), d, (v) => { win.close(); this.rankingsMenu(v); }));
    const sb = new ScrollBox(238, 166);
    sb.position.set(6, 28);
    let ids: string[];
    let champ: string | null | undefined = null;
    if (st.tier === 'of') {
      champ = undisputed(s, d)?.holder;
      ids = [champ, ...(s.rankings[d] ?? [])].filter((x): x is string => !!x);
    } else ids = (d === f.division ? st.ladder : st.rosters[d]) ?? [];
    ids.forEach((id, i) => {
      const x = s.fighters[id];
      if (!x) return;
      const label = st.tier === 'of' ? (i === 0 && champ ? 'C ' : '#' + (champ ? i : i + 1)) : i === 0 ? 'C ' : '#' + (i + 1);
      sb.content.addChild(text(`${label}  ${fullName(x)}  ${record(x.record)}`, 0, i * 11, { small: true, color: id === f.id ? PAL.gold : PAL.bone, width: 228, maxLines: 1 }));
    });
    if (d === f.division && !ids.includes(f.id)) sb.content.addChild(text(`…  ${fullName(f)} (unranked)`, 0, ids.length * 11 + 4, { small: true, color: PAL.gold }));
    win.body.addChild(sb);
    sb.refresh();
    const foot = st.tier === 'of' ? 'Rankings follow the real ones.' : st.tier === 'pfl' ? 'Lounge order follows the real PFL. Win the season final and the CBFC calls.' : `Beat the ${sg.short} champ to move up.`;
    win.body.addChild(text(foot, 6, 198, { small: true, color: PAL.ash, width: 238, maxLines: 2 }));
  }

  /** Your file: every fight (amateur and pro), the rap sheet, and what the press wrote. */
  private careerFile(tab: 'fights' | 'file' | 'press' = 'fights'): void {
    const s = this.g.state!;
    const st = fm(s);
    const f = me(s);
    const win = openWindow(this.g, `Career file: ${fullName(f)}`, 360, 226);
    const am = st.amateur ?? (st.tier === 'amateur' ? f.record : null);
    const pro = st.tier === 'amateur' ? null : f.record;
    const rec = (r: { w: number; l: number; d: number } | null) => (r ? `${r.w}-${r.l}${r.d ? '-' + r.d : ''}` : '-');
    win.body.addChild(text(`PRO ${rec(pro)}   •   AMATEUR ${rec(am)}${st.turnedPro !== undefined ? `   •   TURNED PRO ${fmtDate(st.turnedPro)}` : ''}`, 6, 2, { small: true, color: PAL.gold, width: 348, maxLines: 1 }));
    const tabs: [typeof tab, string][] = [['fights', 'FIGHTS'], ['file', `RAP SHEET (${st.rap?.length ?? 0})`], ['press', 'PRESS']];
    tabs.forEach(([id, label], i) => win.body.addChild(button(label, 6 + i * 116, 12, 112, 13, () => { win.close(); this.careerFile(id); }, { small: true, fill: id === tab ? PAL.gold : PAL.shadow })));
    const sb = new ScrollBox(346, 172);
    sb.position.set(6, 30);
    win.body.addChild(sb);
    let yy = 0;
    const row = (t: string, c: number, tag?: [string, number]) => {
      let x = 0;
      if (tag) {
        sb.content.addChild(text(tag[0], 0, yy, { small: true, color: tag[1] }));
        x = 52;
      }
      const tt = text(t, x, yy, { small: true, width: 338 - x, color: c, maxLines: 3 });
      sb.content.addChild(tt);
      yy += Math.max(10, tt.textHeight + 3);
    };
    if (tab === 'fights') {
      if (!st.history.length) row('No fights yet. Everybody starts somewhere. Usually a bingo hall.', PAL.ash);
      for (const h of st.history.slice().reverse()) {
        const o = s.fighters[h.opp];
        const c = h.result === 'W' ? PAL.moss : h.result === 'L' ? PAL.blood : PAL.bone;
        row(`${h.result}  vs ${o ? fullName(o) : 'unknown'}  •  ${h.method}, R${h.round}  •  ${h.promo ?? ''} ${fmtDate(h.week)}${h.title ? '  •  TITLE' : ''}`, c, [h.pro === false || (h.pro === undefined && st.turnedPro !== undefined && h.week < st.turnedPro) ? 'AMATEUR' : 'PRO', h.pro === false ? PAL.ash : PAL.gold]);
      }
    } else if (tab === 'file') {
      const rap = st.rap ?? [];
      if (!rap.length) row('Clean. No arrests, no failed tests, no missed weight, no bad contracts. Suspiciously clean.', PAL.moss);
      const col: Record<string, number> = { ARREST: PAL.blood, CHARGE: PAL.blood, DOPING: PAL.ember, SUSPENSION: PAL.ember, WEIGHT: PAL.gold, CONTRACT: PAL.sky };
      for (const r of rap.slice().reverse()) row(`${fmtDate(r.week)}: ${r.text}`, PAL.bone, [r.kind, col[r.kind] ?? PAL.ash]);
      if (st.ped.caught) row(`USADA-ish flag: ${st.ped.caught} adverse finding${st.ped.caught > 1 ? 's' : ''}. Enhanced testing applies.`, PAL.ember);
    } else {
      const pr = st.press ?? [];
      if (!pr.length) row('Nobody has written about you yet. Win something.', PAL.ash);
      for (const a of pr.slice().reverse()) row(`"${a.headline}"`, PAL.bone, [a.outlet.toUpperCase().slice(0, 12), PAL.sky]);
    }
    sb.refresh();
  }

  private menu(): void {
    const win = openWindow(this.g, 'Menu', 160, 146);
    win.body.addChild(button('SAVE…', 6, 6, 72, 15, () => { this.g.autosave(); win.close(); openSaveSlots(this.g); }, { small: true }));
    win.body.addChild(button('LOAD…', 82, 6, 72, 15, () => { win.close(); openLoad(this.g, familyOf(this.g.state!)); }, { small: true }));
    win.body.addChild(button('HELP: HOW TO BE A PRO', 6, 24, 148, 15, () => openHelp(this.g, 'rtc'), { small: true, fill: PAL.shadow, border: PAL.gold }));
    win.body.addChild(button('SETTINGS', 6, 42, 148, 15, () => openSettings(this.g), { small: true }));
    win.body.addChild(button('TROPHY CASE', 6, 60, 148, 15, () => openAchievements(this.g), { small: true }));
    win.body.addChild(button('RETIRE…', 6, 78, 148, 15, () => { win.close(); confirm(this.g, 'Hang up the gloves for good?', () => this.legacy()); }, { small: true, fill: PAL.ember }));
    win.body.addChild(button('QUIT TO TITLE', 6, 96, 148, 15, () => { this.g.autosave(); win.close(); void import('./title').then((m) => this.g.goto(new m.TitleScene(this.g))); }, { small: true }));
  }

  /** Legacy Mode: weight classes, your own gym. */
  private legacyMenu(): void {
    const s = this.g.state!;
    const f = me(s);
    const win = openWindow(this.g, 'Legacy', 280, 168);
    const b = win.body;
    b.addChild(text('WEIGHT CLASS', 6, 4, { color: PAL.gold }));
    b.addChild(text(`You fight at ${divisionName(f.division)}. Moving up: more power, easier cut. Moving down: faster, hungrier, miserable cut.`, 6, 15, { small: true, width: 266, color: PAL.ash, maxLines: 2 }));
    divisionMoves(s).forEach((d, i) => b.addChild(button(`MOVE TO ${divisionName(d).toUpperCase()}`, 6 + i * 136, 34, 130, 14, () => confirm(this.g, `Move to ${divisionName(d)}? You start at the bottom of that ladder.`, () => { this.msg = changeDivision(s, d); win.close(); this.g.autosave(); this.refresh(); }), { small: true, fill: PAL.steel })));
    b.addChild(text('YOUR OWN GYM', 6, 58, { color: PAL.gold }));
    const gy = gym(s);
    if (!gy) {
      b.addChild(text(`Open your own gym for ${money(GYM_COST)}. Members pay dues every week, and training in your own place makes you better.`, 6, 69, { small: true, width: 266, color: PAL.ash, maxLines: 3 }));
      b.addChild(button(`OPEN ${f.last.toUpperCase()} MMA (${money(GYM_COST)})`, 6, 92, 266, 14, () => { this.msg = openGym(s); sfx('cash'); win.close(); this.g.autosave(); this.refresh(); }, { small: true, fill: PAL.moss }));
    } else {
      b.addChild(text(`${gy.name}  •  level ${gy.level}  •  ${gy.members} members  •  training +${Math.round(gy.level * 6)}%`, 6, 69, { small: true, width: 266, color: PAL.bone, maxLines: 2 }));
      if (gy.level < 4) b.addChild(button(`UPGRADE (${money(GYM_UPGRADE(gy.level))})`, 6, 92, 266, 14, () => { this.msg = upgradeGym(s); win.close(); this.g.autosave(); this.refresh(); }, { small: true, fill: PAL.moss }));
    }
    b.addChild(text('WHEN YOU HANG THEM UP', 6, 114, { color: PAL.gold }));
    b.addChild(text('Retire (MENU > RETIRE) and you can start a promoter career with your name on the door and your savings in the bank.', 6, 125, { small: true, width: 266, color: PAL.ash, maxLines: 3 }));
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
      const toTitle = () => void import('./title').then((m) => this.g.goto(new m.TitleScene(this.g)));
      if (!st.legacy) return toTitle();
      // Legacy Mode: the gloves come off, the suit goes on
      confirm(this.g, `Become a promoter? A new career: ${f.last.toUpperCase()} FIGHTING CHAMPIONSHIP, with ${money(Math.max(0, st.money))} of your savings on top of the usual budget.`, () => {
        const ns = createNewGame({ seed: (s.seed ^ 0x51ed) >>> 0, mode: 'career', difficulty: 'normal', promotionName: `${f.last} Fighting Championship`, presidentName: fullName(f) });
        ns.promotion.cash += Math.max(0, st.money);
        startWeek(ns);
        this.g.state = ns;
        routePhase(this.g, true);
        this.g.autosave();
      }, 'SUIT UP', 'NO, TITLE');
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
    const lim = contractLimit(s);
    const signed = lim !== weightLimit(s) ? ` (the weight YOU signed for; your division is ${weightLimit(s)})` : '';
    frame.addChild(text(need <= 0 ? `You're on weight (${lim} lbs${signed}). Step on the scale and flex.` : `You walk around ${fm(s).walkWeight.toFixed(1)} lbs. The limit is ${lim}${signed}. You need to cut ${need.toFixed(1)} lbs. Risk of missing: ~${Math.round(risk * 100)}% (a nutritionist helps).`, bx + 8, by + 20, { small: true, width: bw - 16, color: PAL.bone }));
    const go = (c: 'easy' | 'hard' | 'miss') => {
      const r = this.rng();
      const res = doWeighIn(s, c, r);
      this.save(r);
      this.g.closeModal(wrap);
      // then the press conference and the face-off (if this fight gets them)
      alertBox(this.g, res.made ? 'MADE WEIGHT' : 'MISSED WEIGHT', res.text, () => {
        const r2 = this.rng();
        fightWeekShow(this.g, s, r2, () => this.save(r2), () => this.gameplan());
      });
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
    if (st.fight!.bare) {
      // no gloves: everything cuts, hands break, chins matter
      mod('power', 4);
      mod('chin', -6);
      f.skills.chin = Math.max(10, f.skills.chin - 6);
      f.skills.power = Math.min(99, f.skills.power + 4);
    }
    if (st.fight!.rehydro) {
      // fought dry: no gas, and a brain with no fluid around it
      f.skills.cardio = Math.max(10, f.skills.cardio - 9);
      f.skills.chin = Math.max(10, f.skills.chin - 4);
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
          // the story's boss fights have their own rules (and one very bad referee)
          const boss = bossLive(s, bout);
          openLiveFight(this.g, {
            bout, A, B, skills: [A.skills, B.skills], player: side(bout) as 0 | 1, plan: st.plan, oppPlan: oppPlan(2), cutTier: st.staff.cutman, seed,
            rules: boss.rules, refLook: boss.refLook,
            event: ev.name, judges: off.judges.map((j) => j.name), referee: boss.referee ?? off.referee.name, sponsors: eventSponsors(s, ev), canvas: eventCanvas(s, ev), bare: !!st.fight?.bare, state: s, ev,
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
        FMHubScene.holdPopups = true;
        this.g.goto(new FMHubScene(this.g));
        const release = () => {
          FMHubScene.holdPopups = false;
          const sc = this.g.scene;
          if (sc instanceof FMHubScene) setTimeout(() => sc.popups(), 250);
        };
        setTimeout(() => {
          alertBox(this.g, won ? 'VICTORY' : 'FIGHT OVER', lines.join('\n'), () => {
            this.bradieSays(quote, () => {
              if (won) this.micMoment(release);
              else release();
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

  private micMoment(then?: () => void): void {
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
      alertBox(this.g, 'THE MIC', out, () => {
        this.refreshScene();
        then?.();
      });
    };
    targets.forEach((t, i) => frame.addChild(button(`CALL OUT ${t.last.toUpperCase()} (${rankLabel(s, t.id)})`, bx + 8, by + 22 + i * 18, bw - 16, 15, () => pick(t.id), { small: true, fill: PAL.blood })));
    frame.addChild(button('THANK EVERYONE', bx + 8, by + bh - 22, bw - 16, 15, () => pick(null), { small: true, fill: PAL.steel }));
  }

  private refreshScene(): void {
    const sc = this.g.scene;
    if (sc instanceof FMHubScene) sc.refresh();
  }
}
