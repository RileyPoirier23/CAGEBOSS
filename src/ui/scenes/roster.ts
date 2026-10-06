/**
 * Roster Filing Cabinet: lists (ours / free agents / rivals / legends) and the
 * fighter dossier with tabs: BIO, SKILLS, RECORD, CONTRACT, LEGAL, RELATIONS, TIMELINE.
 * Actions: scout, sign/offer, release, hire a better cutman, comeback.
 */
import { Container } from 'pixi.js';
import type { Game } from '../app';
import type { Fighter, Skills } from '../../core/types';
import { SKILL_KEYS } from '../../core/types';
import { PAL, meterColor } from '../../art/palette';
import { W, H, text, button, box, ScrollBox, clickable, paper } from '../kit';
import { fighterPortrait } from '../sprites';
import { measure } from '../text';
import { openWindow, confirm, alertBox } from '../widgets';
import {
  fullName, seenSkill, seenOverall, seenPotential, visibleTraits, moneyRead, SCOUT_COST, SCOUT_LABEL, effectiveScout,
  isInjured, marketPurse, woundScore,
} from '../../sim/fighters';
import { rankLabel, beltsOf } from '../../sim/rankings';
import { divisionShort, divisionName, DIVISION_ORDER } from '../../sim/divisions';
import { money, record, heightStr, compact } from '../../core/format';
import { bioFor } from '../../sim/bio';
import { spend, scale } from '../../sim/econ';
import { openNegotiation as openNeg } from '../../sim/contracts';
import { openNegotiation } from './negotiation';
import { releaseFighter } from '../../sim/world';
import { content } from '../../core/content';
import { Rng } from '../../core/rng';
import { fmtDate } from '../../core/time';
import { sfx } from '../../audio/sfx';
import { openEditor } from './editors';

type Tab = 'ours' | 'free' | 'rivals' | 'legends';
const SKILL_LABEL: Record<keyof Skills, string> = {
  striking: 'Striking', power: 'Power', wrestling: 'Wrestling', grappling: 'Grappling/BJJ', cardio: 'Cardio', chin: 'Chin',
  fightIQ: 'Fight IQ', durability: 'Durability', heart: 'Heart', weightCut: 'Weight cut (diff.)',
};

export function openRoster(g: Game, onClose: () => void, focus?: string): void {
  const s = g.state!;
  let tab: Tab = 'ours';
  let div = 'all';
  let selected: string | null = focus ?? null;
  let dtab = 'bio';
  let scroll = 0;
  const win = openWindow(g, 'Filing cabinet', W - 8, H - 8, { onClose, x: 4, y: 4 });
  const body = win.body;
  const draw = () => {
    body.removeChildren().forEach((c) => c.destroy({ children: true }));
    const tabs: [Tab, string][] = [['ours', 'OUR ROSTER'], ['free', 'FREE AGENTS'], ['rivals', 'RIVAL ROSTERS'], ['legends', 'LEGENDS']];
    tabs.forEach(([t, label], i) => body.addChild(button(label, 4 + i * 72, 0, 70, 12, () => { tab = t; scroll = 0; draw(); }, { small: true, fill: tab === t ? PAL.gold : PAL.slate, textColor: tab === t ? PAL.ink : PAL.bone })));
    const divs = ['all', ...DIVISION_ORDER.filter((d) => s.divisionsOpen.includes(d) || tab !== 'ours')];
    divs.forEach((d, i) => body.addChild(button(d === 'all' ? 'ALL' : divisionShort(d), 4 + i * 26, 14, 25, 10, () => { div = d; scroll = 0; draw(); }, { small: true, fill: div === d ? PAL.steel : PAL.shadow })));
    const list = fighters(tab).filter((f) => div === 'all' || f.division === div);
    list.sort((a, b) => (tab === 'free' ? seenOverall(b) + b.starPower - seenOverall(a) - a.starPower : DIVISION_ORDER.indexOf(a.division) - DIVISION_ORDER.indexOf(b.division) || seenOverall(b) - seenOverall(a)));
    const sb = new ScrollBox(176, H - 48);
    sb.position.set(4, 27);
    list.forEach((f, i) => {
      const row = clickable(new Container(), () => {
        selected = f.id;
        scroll = sb.scrollY;
        sfx('paper');
        draw();
      });
      row.addChild(box(170, 20, f.id === selected ? PAL.slate : i % 2 ? 0x2a2630 : 0x24212a));
      const p = fighterPortrait(f, 24);
      p.scale.set(0.75);
      p.position.set(1, 1);
      row.addChild(p);
      row.addChild(text(`${f.first[0]}. ${f.last}`, 22, 2, { color: PAL.bone, width: 100, maxLines: 1 }));
      const tag = tab === 'rivals' ? content().rivals.find((r) => r.id === f.promotion)?.short ?? '' : rankLabel(s, f.id);
      row.addChild(text(`${divisionShort(f.division)} ${record(f.record)} ${tag}`, 22, 12, { small: true, color: PAL.ash }));
      row.addChild(text(String(seenOverall(f)), 150, 3, { color: meterColor(seenOverall(f)) }));
      const flags = (isInjured(f, s.week) ? '+' : '') + (f.legal !== 'free' ? '!' : '') + (beltsOf(s, f.id).length ? '★' : '') + (woundScore(f) ? '*' : '');
      row.addChild(text(flags, 150, 12, { small: true, color: PAL.blood }));
      row.position.set(0, i * 21);
      sb.content.addChild(row);
    });
    body.addChild(sb);
    sb.scrollTo(scroll);
    body.addChild(text(`${list.length} fighters`, 4, H - 20, { small: true, color: PAL.grey }));
    const f = selected ? s.fighters[selected] : list[0];
    if (f) body.addChild(dossier(f));
  };

  const fighters = (t: Tab): Fighter[] => {
    const all = Object.values(s.fighters);
    switch (t) {
      case 'ours': return all.filter((f) => f.promotion === 'us' && f.status === 'active');
      case 'free': return all.filter((f) => f.status === 'free-agent');
      case 'rivals': return all.filter((f) => f.promotion && f.promotion !== 'us' && f.status === 'active');
      case 'legends': return all.filter((f) => f.status === 'retired');
    }
  };

  const dossier = (f: Fighter): Container => {
    const c = new Container();
    c.position.set(184, 0);
    const dw = W - 8 - 188;
    c.addChild(paper(dw, H - 28, 'manila', 11));
    const p = fighterPortrait(f, 64, beltsOf(s, f.id).length ? 'belt' : 'plain');
    p.position.set(5, 5);
    c.addChild(p);
    c.addChild(text(`${f.first} "${f.nick}" ${f.last}`, 74, 5, { color: PAL.ink, width: dw - 80 }));
    const belts = beltsOf(s, f.id).map((b) => b.name).join(', ');
    c.addChild(text(`${divisionName(f.division)}  •  ${rankLabel(s, f.id)}${belts ? '  •  ' + belts : ''}`, 74, 16, { small: true, color: PAL.blood, width: dw - 80 }));
    c.addChild(text(`${record(f.record)}  Age ${f.age}  ${heightStr(f.height)}  Reach ${Math.round(f.reach / 2.54)}"  ${f.stance}`, 74, 25, { small: true, color: PAL.ink }));
    c.addChild(text(`${f.hometown}, ${f.country}  •  ${f.gym}`, 74, 33, { small: true, color: PAL.ink, width: dw - 80 }));
    c.addChild(text(`Styles: ${f.styles.join(', ')}`, 74, 41, { small: true, color: PAL.ink, width: dw - 80 }));
    const sc = effectiveScout(f);
    c.addChild(text(`OVR ~${seenOverall(f)}  POT ${seenPotential(f)}  STAR ${f.starPower}  HYPE ${Math.round(f.hype)}  FOLLOWERS ${compact(f.social.followers)}${f.streaming ? ' (STREAMER)' : ''}`, 74, 50, { small: true, color: PAL.ink, width: dw - 80 }));
    c.addChild(text(`SCOUTING: ${SCOUT_LABEL[sc]}`, 74, 59, { small: true, color: sc >= 2 ? PAL.moss : PAL.ember }));
    const tabs = ['bio', 'skills', 'record', 'contract', 'legal', 'relations', 'timeline'];
    tabs.forEach((t, i) => c.addChild(button(t.toUpperCase(), 5 + i * 39, 72, 38, 11, () => { dtab = t; draw(); }, { small: true, fill: dtab === t ? PAL.ink : PAL.woodLight })));
    const area = new ScrollBox(dw - 10, H - 28 - 86 - 18);
    area.position.set(5, 86);
    const tw = dw - 18;
    let y = 0;
    const add = (str: string, color: number = PAL.ink, small = true) => {
      const t = text(str, 0, y, { width: tw, color, small });
      area.content.addChild(t);
      y += t.textHeight + 4;
    };
    switch (dtab) {
      case 'bio':
        add(bioFor(f, sc >= 3), PAL.ink, true);
        add(`Traits: ${visibleTraits(f).join(', ')}${sc < 3 ? '  (deep scouting may reveal more)' : ''}`, PAL.blood);
        add(`Money sense: ${moneyRead(f)}   Personality: ${f.beliefs}   Social: ${f.social.style}`);
        add(`Family: ${f.family.spouse ? 'married' : 'single'}${f.family.kids ? `, ${f.family.kids} kid(s)` : ''}; parents: ${f.family.parents.replace(/\{his\}/g, f.gender === 'W' ? 'her' : 'his').replace(/\{him\}/g, f.gender === 'W' ? 'her' : 'him')}`);
        if (f.marquee) add(`ARCHETYPE: ${f.marquee.archetype}`, PAL.plum);
        break;
      case 'skills': {
        SKILL_KEYS.forEach((k) => {
          const v = seenSkill(f, k);
          area.content.addChild(text(SKILL_LABEL[k], 0, y, { small: true, color: PAL.ink }));
          area.content.addChild(box(100, 5, PAL.ink)).position.set(70, y);
          area.content.addChild(box(Math.max(1, v), 3, k === 'weightCut' ? PAL.ember : meterColor(v))).position.set(71, y + 1);
          area.content.addChild(text(sc >= 3 ? String(v) : `~${v}`, 176, y, { small: true, color: PAL.ink }));
          y += 9;
        });
        y += 4;
        add(`Prime age ~${sc >= 2 ? f.primeAge : '??'}  ${f.age < f.primeAge - 1 ? '(still improving)' : f.age > f.primeAge + 1 ? '(past prime, declining)' : '(in prime)'}`);
        add(`Career damage: ${Math.round(f.damage)}/100  KO losses: ${f.koLosses}`, f.damage > 60 ? PAL.blood : PAL.ink);
        add(`Cutman: ${f.cutman.name} (rating ${f.cutman.rating})`);
        if (f.addiction > 30 && sc >= 2) add(`WARNING: substance issues (${Math.round(f.addiction)}/100)`, PAL.blood);
        break;
      }
      case 'record': {
        add(`${record(f.record)}  Streak: ${f.streak > 0 ? 'W' + f.streak : f.streak < 0 ? 'L' + -f.streak : '-'}  Title defenses: ${f.titleDefenses}`);
        const fights = s.events.filter((e) => e.status === 'done').flatMap((e) => e.card.filter((b) => b.result && (b.a === f.id || b.b === f.id)).map((b) => ({ e, b })));
        fights.reverse().slice(0, 15).forEach(({ e, b }) => {
          const opp = s.fighters[b.a === f.id ? b.b : b.a];
          const r = b.result!;
          const res = r.winner === f.id ? 'W' : r.loser === f.id ? 'L' : r.method === 'NC' ? 'NC' : 'D';
          add(`${res}  vs ${opp ? fullName(opp) : '?'}  ${r.method} (${r.detail}) R${r.round} ${r.time}  • ${e.name}`, res === 'W' ? PAL.moss : res === 'L' ? PAL.blood : PAL.ink);
        });
        if (!fights.length) add('No recent fights on file with us.');
        break;
      }
      case 'contract': {
        const ct = f.contract;
        if (ct && f.promotion === 'us') {
          add(`Show purse: ${money(ct.purse, false)}   Win bonus: ${money(ct.winBonus, false)}`);
          add(`Bouts left: ${ct.boutsLeft}   Champion clause: ${ct.champClause ? 'yes' : 'no'}   Exclusive: yes`);
          add(`Signed: ${fmtDate(ct.signedWeek)}`);
        } else if (ct) add(`Under contract elsewhere (${content().rivals.find((r) => r.id === f.promotion)?.name ?? f.promotion}).`);
        else add('No contract.');
        if (sc >= 2) add(`Estimated market value: ${money(marketPurse(s, f))} per fight`, PAL.slate);
        add(`Manager: ${content().managers.find((m) => m.id === f.manager)?.name ?? f.manager}`);
        add(`Debt: ${sc >= 2 ? money(f.finances.debt) : '??'}  Spending: ${sc >= 2 ? f.finances.spending : '??'}`);
        break;
      }
      case 'legal':
        add(`Status: ${f.legal.toUpperCase()}${f.legalUntil > s.week ? ' until ' + fmtDate(f.legalUntil) : ''}`, f.legal === 'free' ? PAL.ink : PAL.blood);
        add(`Record: ${f.legalRecord.length ? f.legalRecord.join('; ') : 'clean (as far as we know)'}`);
        s.legal.cases.filter((c) => c.who === f.id).forEach((c) => add(`${content().charges.find((x) => x.id === c.charge)?.name ?? c.charge}: ${c.status}${c.outcome ? ' - ' + c.outcome : ''} (court ${fmtDate(c.courtWeek)})`));
        if (f.injuries.length) add(`Injuries: ${f.injuries.map((i) => `${i.name} (until ${fmtDate(i.until)})`).join('; ')}`, PAL.blood);
        if (f.medSuspUntil > s.week) add(`Medical suspension until ${fmtDate(f.medSuspUntil)}`, PAL.blood);
        break;
      case 'relations': {
        const names = (ids: string[]) => ids.map((id) => s.fighters[id] ? fullName(s.fighters[id]) : '?').join(', ') || 'none';
        add(`Rivals: ${names(f.rivals)}`);
        add(`Friends: ${names(f.friends)}`);
        add(`Teammates at ${f.gym}: ${names(Object.values(s.fighters).filter((x) => x.gym === f.gym && x.id !== f.id && x.status === 'active').map((x) => x.id).slice(0, 8))}`);
        add(`Beef with you: ${Math.round(f.beefWithYou)}/100   Loyalty: ${Math.round(f.loyalty)}   Morale: ${Math.round(f.morale)}`);
        if (f.beefReporters.length) add(`Beefing with reporters: ${f.beefReporters.map((r) => content().reporters.find((x) => x.id === r)?.name ?? r).join(', ')}`);
        break;
      }
      case 'timeline':
        if (!f.careerLog.length) add('Nothing logged yet.');
        f.careerLog.slice().reverse().forEach((l) => add('• ' + l));
        break;
    }
    c.addChild(area);
    area.refresh();
    // actions
    const ay = H - 28 - 16;
    let ax = 5;
    const act = (label: string, fn: () => void, fill = PAL.slate, tip?: string) => {
      const w = measure(label, true) + 8;
      const bb = button(label, ax, ay, w, 12, fn, { small: true, fill, tooltip: tip });
      c.addChild(bb);
      ax += w + 3;
    };
    if (sc < 3) {
      const next = sc + 1;
      const cost = Math.round(SCOUT_COST[next] * Math.max(1, scale(s) * 0.5));
      act(`SCOUT: ${SCOUT_LABEL[next]} ${money(cost)}`, () => {
        if (s.promotion.cash < cost) return alertBox(g, 'Broke', 'Not enough cash for scouting.');
        spend(s, 'scouting', cost);
        f.scout = next;
        sfx('paper');
        draw();
      }, PAL.steel, 'Better scouting = more accurate skills, potential, money sense and hidden traits.');
    }
    if (f.status === 'free-agent') {
      act('OFFER CONTRACT', () => {
        const rng = new Rng(s.rng);
        const n = openNeg(s, f, 'signing', rng);
        s.rng = rng.state;
        const id = n?.id ?? s.negotiations.find((x) => x.fighter === f.id)?.id;
        if (id) openNegotiation(g, id, () => draw());
      }, PAL.moss);
    }
    if (f.promotion === 'us' && f.status === 'active') {
      const better = content().names.cutmen.length;
      const cost = Math.round(4000 * Math.max(1, scale(s) * 0.6));
      if (f.cutman.rating < 90 && better) act(`HIRE BETTER CUTMAN ${money(cost)}`, () => {
        if (s.promotion.cash < cost) return alertBox(g, 'Broke', 'Not enough cash.');
        spend(s, 'cutmen', cost);
        const rng = new Rng(s.rng);
        f.cutman = { name: rng.pick(content().names.cutmen), rating: Math.min(98, f.cutman.rating + rng.int(12, 25)) };
        s.rng = rng.state;
        sfx('cash');
        draw();
      }, PAL.teal, 'Better cutmen heal wounds faster and stop cuts from ending fights.');
      act('RELEASE', () => confirm(g, `Cut ${fullName(f)}? ${f.contract ? 'Contracts get paid out in exposure.' : ''}`, () => {
        releaseFighter(s, f.id);
        selected = null;
        draw();
      }), PAL.blood);
    }
    if (f.status === 'retired' && (s.sandbox?.allLegends || s.act >= 3)) {
      act('COMEBACK OFFER', () => {
        const rng = new Rng(s.rng);
        f.status = 'free-agent';
        const n = openNeg(s, f, 'signing', rng);
        s.rng = rng.state;
        if (n) openNegotiation(g, n.id, () => draw());
      }, PAL.plum, 'One more fight. What could go wrong?');
    }
    if (s.sandbox?.godMode) act('EDIT (GOD MODE)', () => openEditor(g, 'fighter', f.id, () => draw()), PAL.gold);
    return c;
  };
  draw();
}
