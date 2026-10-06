/**
 * Exchange-level MMA fight simulation.
 *
 * Each round is ~300s of exchanges. Skills, styles, stamina, accumulated
 * damage, cuts, injuries, fouls and the referee's/judges' tendencies drive
 * the outcome. Produces a FightResult with a play-by-play ticker (with
 * animation cues for the mini arena) and between-round corner reports.
 */
import type { Fighter, FightResult, Method, Skills, TickerLine, CornerReport } from '../core/types';
import type { OfficialDef } from '../core/content';
import { Rng } from '../core/rng';

export interface FightOpts {
  rounds: 3 | 5;
  title?: boolean;
  judges: OfficialDef[];
  referee: OfficialDef;
  realism?: number; // 0..1; lower = wilder outcomes
  ticker?: Record<string, string[]>;
  keepTicker?: boolean;
  homeSide?: 0 | 1 | -1; // for hometown-biased judges
}

type Pos = 'stand' | 'clinch' | 'atop' | 'btop';

interface Side {
  f: Fighter;
  sk: Skills;
  name: string;
  hp: number;
  stam: number;
  hurt: number;
  cut: number;
  injury: { name: string; sev: number; weeks: number; debuff: Partial<Skills> } | null;
  kd: number;
  str: number;
  strAtt: number;
  td: number;
  tdAtt: number;
  subAtt: number;
  ctrl: number;
  dmg: number; // damage dealt
  fouls: number;
  ded: number;
  aggression: number;
  r: { str: number; dmg: number; td: number; ctrl: number; agg: number; kd: number };
  pressure: number;
  kickRate: number;
  shootRate: number;
  subRate: number;
  counter: number;
}

interface Finish {
  method: Method;
  detail: string;
  winner: 0 | 1 | -1;
}

const DEFAULT_TICKER: Record<string, string[]> = {};

const SUBS_CHOKE = ['Rear-Naked Choke', 'Guillotine Choke', 'Arm-Triangle Choke', "D'Arce Choke", 'Triangle Choke', 'Anaconda Choke', 'North-South Choke', 'Ezekiel Choke', 'Von Flue Choke'];
const SUBS_LIMB = ['Armbar', 'Kimura', 'Heel Hook', 'Kneebar', 'Americana', 'Calf Slicer', 'Toe Hold'];
const SUBS_RARE = ['Twister', 'Gogoplata', 'Suloev Stretch', 'Banana Split (somehow)'];

export function simulateFight(a: Fighter, b: Fighter, opts: FightOpts, rng: Rng): FightResult {
  const tpl = opts.ticker ?? DEFAULT_TICKER;
  const realism = opts.realism ?? 1;
  const ticker: TickerLine[] = [];
  const corners: CornerReport[] = [];
  const ref = opts.referee;
  const stopTend = ref.bias === 'early' ? 0 : ref.bias === 'late' ? 2 : 1;
  const foulPolicy = ref.fouls ?? 'fair';
  const standupAfter = ref.standups === 'fast' ? 2 : ref.standups === 'slow' ? 6 : 4;
  const refName = ref.name;

  const mk = (f: Fighter): Side => {
    const has = (s: string) => f.styles.includes(s);
    return {
      f, sk: { ...f.skills }, name: f.last, hp: 100, stam: 100, hurt: 0, cut: 0, injury: null, kd: 0,
      str: 0, strAtt: 0, td: 0, tdAtt: 0, subAtt: 0, ctrl: 0, dmg: 0, fouls: 0, ded: 0, aggression: 0,
      r: { str: 0, dmg: 0, td: 0, ctrl: 0, agg: 0, kd: 0 },
      pressure: 1 + (has('Pressure Striker') ? 0.5 : 0) + (has('Brawler') ? 0.4 : 0) - (has('Counter Striker') ? 0.3 : 0) + (f.traits.includes('Hothead') ? 0.2 : 0),
      kickRate: 0.22 + (has('Kickboxer') ? 0.15 : 0) + (has('Muay Thai') ? 0.15 : 0) - (has('Brawler') ? 0.1 : 0),
      shootRate: 0.06 + f.skills.wrestling / 700 + (has('Wrestler') ? 0.2 : 0) + (has('Ground & Pound') ? 0.12 : 0) + (has('Boring But Effective') ? 0.12 : 0) + (has('Judoka') ? 0.08 : 0) - (has('Kickboxer') ? 0.04 : 0),
      subRate: 0.12 + f.skills.grappling / 400 + (has('Sub Hunter') ? 0.25 : 0) + (has('Leg Locker') ? 0.2 : 0),
      counter: has('Counter Striker') ? 0.3 : 0.08 + f.skills.fightIQ / 900,
    };
  };
  const S: [Side, Side] = [mk(a), mk(b)];
  let pos: Pos = 'stand';
  let stall = 0;
  let round = 1;
  let t = 0;
  let finish: Finish | null = null;
  let finishRound = 0;
  let finishT = 0;
  const fouls: FightResult['fouls'] = [];
  const injuries: FightResult['injuries'] = [];
  const roundScores: [number, number][][] = [];
  const keep = opts.keepTicker !== false;

  const female = a.gender === 'W' && b.gender === 'W';
  const fem = (x: string) =>
    female ? x.replace(/\bhe\b/g, 'she').replace(/\bHe\b/g, 'She').replace(/\bhis\b/g, 'her').replace(/\bHis\b/g, 'Her').replace(/\bhim\b/g, 'her').replace(/\bman\b/g, 'woman').replace(/\bHe's\b/g, "She's").replace(/\bhe's\b/g, "she's") : x;
  const fill = (s: string, ai: number) =>
    fem(s).replace(/\{a\}/g, S[ai < 0 ? 0 : ai].name).replace(/\{b\}/g, S[ai < 0 ? 1 : 1 - ai].name).replace(/\{ref\}/g, refName).replace(/\{r\}/g, String(round)).replace(/\b([Aa]) ([AEIOU])/g, '$1n $2');
  const say = (key: string, ai: number, act: string, intensity = 1, extra?: Record<string, string>) => {
    if (!keep) return;
    const list = tpl[key];
    let line = list && list.length ? list[Math.floor(rng.next() * list.length)] : `{a}: ${key}`;
    if (extra) for (const k in extra) line = line.replace(new RegExp('\\{' + k + '\\}', 'g'), extra[k]);
    ticker.push({
      round, t, text: fill(line, ai), side: ai as 0 | 1 | -1, intensity, act, pos, key,
      hp: [Math.round(Math.max(0, S[0].hp)), Math.round(Math.max(0, S[1].hp))],
    });
  };
  const sayN = (key: string, act: string, intensity = 1, extra?: Record<string, string>) => say(key, -1 as any, act, intensity, extra);

  const eff = (s: Side, k: keyof Skills) => {
    let v = s.sk[k];
    if (s.injury?.debuff[k]) v -= s.injury.debuff[k]!;
    return v * (0.55 + 0.45 * (s.stam / 100));
  };

  const doInjury = (vi: number, name: string, sev: number, weeks: number, debuff: Partial<Skills>, key: string, act = 'injury') => {
    const v = S[vi];
    if (v.injury && v.injury.sev >= sev) return;
    v.injury = { name, sev, weeks, debuff };
    injuries.push({ fighter: v.f.id, name, weeks });
    say(key, vi, act, 3);
    if (sev >= 3) end({ method: 'TKO', detail: `Injury (${name})`, winner: (1 - vi) as 0 | 1 });
  };

  function end(fin: Finish) {
    if (finish) return;
    finish = fin;
    finishRound = round;
    finishT = t;
  }

  const strike = (ai: number) => {
    const A = S[ai];
    const B = S[1 - ai];
    const kick = rng.chance(A.kickRate * (pos === 'clinch' ? 0.3 : 1));
    let type: string;
    if (pos === 'clinch') type = rng.pick(['knee', 'elbow', 'knee', 'dirty']);
    else if (kick) type = rng.pick(['legkick', 'legkick', 'bodykick', 'headkick', 'calfkick']);
    else type = rng.pick(['jab', 'jab', 'jab', 'cross', 'hook', 'hook', 'uppercut', 'body', 'combo', 'overhand']);
    if (rng.chance(0.03 * A.pressure)) type = rng.pick(['spinning', 'flying', 'superman']);
    A.strAtt++;
    A.aggression += 1;
    A.r.agg += 1;
    const mult: Record<string, number> = {
      jab: 0.45, cross: 1, hook: 1.15, uppercut: 1.15, body: 0.8, combo: 1.3, overhand: 1.3,
      legkick: 0.7, calfkick: 0.8, bodykick: 1, headkick: 1.7, knee: 1.2, elbow: 1.1, dirty: 0.6, spinning: 1.6, flying: 1.8, superman: 1.1,
    };
    const head = ['jab', 'cross', 'hook', 'uppercut', 'combo', 'overhand', 'headkick', 'knee', 'elbow', 'spinning', 'flying', 'superman', 'dirty'].includes(type);
    let acc = 0.4 + (eff(A, 'striking') - eff(B, 'striking') * 0.7 - eff(B, 'fightIQ') * 0.25) / 180 + B.hurt * 0.2;
    if (type === 'jab') acc += 0.12;
    if (['headkick', 'spinning', 'flying'].includes(type)) acc -= 0.15;
    acc += (A.f.reach - B.f.reach) / 400;
    if (!rng.chance(Math.max(0.12, Math.min(0.85, acc)))) {
      // miss — maybe eat a counter
      if (rng.chance(B.counter * 0.6)) {
        say('counter', 1 - ai, 'cross', 2);
        land(1 - ai, 'cross', 1.1, true);
      } else if (rng.chance(0.25)) say('miss_' + (kick ? 'kick' : 'punch'), ai, kick ? 'kick' : 'jab', 0);
      // checked leg kick can break the kicker's shin
      if ((type === 'legkick' || type === 'calfkick') && rng.chance(0.0035 + eff(B, 'fightIQ') / 40000)) {
        doInjury(ai, 'broken shin', 3, 40, {}, 'injury_shin');
      }
      return;
    }
    land(ai, type, mult[type] ?? 1, head);
  };

  const land = (ai: number, type: string, m: number, head: boolean) => {
    const A = S[ai];
    const B = S[1 - ai];
    A.str++;
    A.r.str += head ? 1.2 : 0.8;
    const powerEff = eff(A, 'power');
    let dmg = (2.0 + powerEff / 16) * m * rng.float(0.6, 1.4) * (1.15 - eff(B, 'durability') / 220);
    if (B.hurt > 0.6) dmg *= 1.2;
    B.hp -= dmg;
    A.dmg += dmg;
    A.r.dmg += dmg;
    B.hurt = Math.min(2, B.hurt + dmg / 28);
    const legs = type === 'legkick' || type === 'calfkick';
    if (legs && rng.chance(0.1)) {
      B.sk.cardio -= 1;
      B.sk.wrestling -= 1;
    }
    // cuts (elbows & big punches)
    if (head && rng.chance((type === 'elbow' ? 0.14 : 0.04) * m * (1.2 - B.f.cutman.rating / 140))) {
      B.cut = Math.min(10, B.cut + rng.int(2, 4));
      say('cut', ai, 'cut', 2);
    }
    // injuries to the attacker's hand / defender's face
    if (['cross', 'hook', 'overhand', 'uppercut'].includes(type) && rng.chance(0.0025)) doInjury(ai, 'broken hand', 1, 10, { power: 15, striking: 8 }, 'injury_hand');
    if (head && m >= 1.1 && rng.chance(0.002 * m)) doInjury(1 - ai, 'broken orbital', 2, 14, { striking: 6, fightIQ: 8 }, 'injury_orbital');
    if (finish) return;
    // knockout / knockdown check
    if (head) {
      const chin = eff(B, 'chin');
      let ko = Math.pow(powerEff / 100, 2.2) * m * 0.034 * (1 + (100 - chin) / 55) * (1 + (100 - B.hp) / 70) * (0.5 + B.hurt);
      ko *= 0.6 + 0.4 * realism + (1 - realism) * 0.6;
      if (rng.chance(ko)) {
        if (rng.chance(0.42 + (100 - chin) / 300)) {
          say('ko_' + (type === 'headkick' ? 'kick' : type === 'knee' ? 'knee' : type === 'elbow' ? 'elbow' : 'punch'), ai, 'ko', 3);
          end({ method: 'KO', detail: koDetail(type), winner: ai as 0 | 1 });
          return;
        }
        B.kd++;
        A.r.kd++;
        B.hurt = 1.8;
        B.hp -= 6;
        say('knockdown', ai, 'kd', 3);
        refCheck(ai, 1.0);
        return;
      }
    }
    say(head ? 'land_' + type : 'land_' + type, ai, actFor(type), dmg > 9 ? 2 : 1);
    if (B.hurt > 1.1 && rng.chance(0.4)) say('rocked', ai, 'rocked', 2);
    refCheck(ai, 0);
  };

  const refCheck = (ai: number, kdBoost: number) => {
    const B = S[1 - ai];
    const threshold = [22, 13, 6][stopTend];
    const urgency = (threshold - B.hp) / 20 + kdBoost * [0.7, 0.45, 0.22][stopTend] + (B.hurt > 1.4 ? 0.2 : 0);
    if (B.hp < threshold || kdBoost) {
      if (rng.chance(Math.max(0, Math.min(0.95, urgency)))) {
        say('tko_' + (pos === 'atop' || pos === 'btop' ? 'gnp' : 'punches'), ai, 'tko', 3);
        end({ method: 'TKO', detail: pos === 'atop' || pos === 'btop' ? 'Ground & Pound' : 'Punches', winner: ai as 0 | 1 });
      } else if (stopTend === 2 && B.hp < threshold + 10 && rng.chance(0.35)) {
        B.hp -= 4; // the late ref lets the beating continue
        say('late_ref', ai, 'gnp', 2);
      }
    }
  };

  const takedown = (ai: number) => {
    const A = S[ai];
    const B = S[1 - ai];
    A.tdAtt++;
    A.aggression += 1;
    A.r.agg += 0.6;
    const p = 0.3 + (eff(A, 'wrestling') - eff(B, 'wrestling') * 0.85) / 110 + (B.hurt > 0.8 ? 0.15 : 0);
    A.stam -= 3;
    if (rng.chance(Math.max(0.06, Math.min(0.85, p)))) {
      A.td++;
      A.r.td++;
      pos = ai === 0 ? 'atop' : 'btop';
      B.hp -= 2;
      say('takedown', ai, 'td', 1);
      if (rng.chance(0.0025)) doInjury(1 - ai, 'torn ACL', 3, 40, {}, 'injury_knee');
      else if (rng.chance(0.003)) doInjury(ai, 'dislocated shoulder', 2, 16, { wrestling: 15, grappling: 12, power: 6 }, 'injury_shoulder');
    } else {
      B.stam -= 1;
      say('sprawl', 1 - ai, 'sprawl', 1);
      if (rng.chance(0.06) && eff(B, 'grappling') > 65) {
        // guillotine counter
        subAttempt(1 - ai, 'Guillotine Choke');
      }
    }
  };

  const subAttempt = (ai: number, forced?: string) => {
    const A = S[ai];
    const B = S[1 - ai];
    A.subAtt++;
    A.r.agg += 0.8;
    A.r.dmg += 2;
    A.stam -= 2;
    const roll = rng.next();
    const hold = forced ?? (roll < 0.62 ? rng.pick(SUBS_CHOKE) : roll < 0.985 ? rng.pick(SUBS_LIMB) : rng.pick(SUBS_RARE));
    const p = 0.05 + (eff(A, 'grappling') - eff(B, 'grappling')) / 240 + (1 - B.stam / 100) * 0.1 + B.hurt * 0.08 + (A.f.styles.includes('Sub Hunter') ? 0.04 : 0);
    say('sub_attempt', ai, 'sub', 2, { hold });
    if (rng.chance(Math.max(0.02, Math.min(0.6, p)))) {
      const limb = SUBS_LIMB.includes(hold);
      if (limb && B.sk.heart > 80 && rng.chance(0.3)) {
        const part = hold === 'Heel Hook' || hold === 'Kneebar' || hold === 'Calf Slicer' || hold === 'Toe Hold' ? 'knee' : 'arm';
        doInjury(1 - ai, part === 'arm' ? 'broken arm' : 'shredded knee ligaments', 2, 30, {}, 'wont_tap');
        say('limb_snap', ai, 'tap', 3, { hold });
        end({ method: 'SUB', detail: `Technical Submission (${hold})`, winner: ai as 0 | 1 });
        return;
      }
      say('tap', ai, 'tap', 3, { hold });
      end({ method: 'SUB', detail: hold, winner: ai as 0 | 1 });
    } else {
      say('escape', 1 - ai, 'escape', 1, { hold });
      if (SUBS_LIMB.includes(hold) && rng.chance(0.03)) doInjury(1 - ai, 'sprained elbow', 1, 6, { striking: 5, grappling: 5 }, 'injury_elbow');
    }
  };

  const foul = (ai: number) => {
    const A = S[ai];
    const B = S[1 - ai];
    const roll = rng.next();
    const kind = roll < 0.3 ? 'eyepoke' : roll < 0.5 ? 'groin' : roll < 0.65 ? 'fence' : roll < 0.8 ? (pos === 'stand' ? 'backhead' : 'knee_grounded') : roll < 0.9 ? 'headbutt' : 'glove';
    const accidental = kind === 'eyepoke' || kind === 'groin';
    const severe = kind === 'knee_grounded' || kind === 'headbutt';
    A.fouls++;
    const catchP = foulPolicy === 'lenient' ? 0.35 : foulPolicy === 'strict' ? 0.95 : 0.75;
    const seen = rng.chance(catchP);
    let penalized = false;
    if (!seen) {
      say('foul_missed_' + kind, ai, 'foul', 2);
    } else {
      const deductP = foulPolicy === 'strict' ? (severe ? 0.8 : A.fouls > 1 ? 0.6 : 0.25) : foulPolicy === 'lenient' ? (severe ? 0.3 : 0.03) : severe ? 0.55 : A.fouls > 2 ? 0.5 : 0.08;
      if (rng.chance(deductP)) {
        A.ded++;
        penalized = true;
        say('deduction', ai, 'foul', 2, { foul: FOUL_NAMES[kind] });
      } else say('foul_' + kind, ai, 'foul', 1);
    }
    fouls.push({ fighter: A.f.id, text: FOUL_NAMES[kind], penalized });
    B.hp -= severe ? 8 : 3;
    // can the victim continue?
    const cannot = rng.chance(severe ? 0.18 : accidental ? 0.05 : 0.01);
    if (cannot) {
      if (accidental) {
        const early = round === 1 || (round === 2 && t < 150);
        say('cannot_continue', 1 - ai, 'stop', 3);
        if (early) end({ method: 'NC', detail: `No Contest (accidental ${FOUL_NAMES[kind].toLowerCase()})`, winner: -1 });
        else end({ method: 'DEC', detail: 'Technical Decision', winner: -1 });
      } else if (seen) {
        say('dq', ai, 'stop', 3);
        end({ method: 'DQ', detail: `Disqualification (${FOUL_NAMES[kind]})`, winner: (1 - ai) as 0 | 1 });
      }
    } else if (seen && A.ded >= 3 && foulPolicy !== 'lenient') {
      say('dq', ai, 'stop', 3);
      end({ method: 'DQ', detail: 'Disqualification (repeated fouls)', winner: (1 - ai) as 0 | 1 });
    }
  };

  const groundExchange = () => {
    const top = pos === 'atop' ? 0 : 1;
    const bot = 1 - top;
    const T = S[top];
    const Bt = S[bot];
    T.ctrl += 15;
    T.r.ctrl += 15;
    stall++;
    const roll = rng.next();
    const botEsc = 0.12 + (eff(Bt, 'wrestling') - eff(T, 'wrestling')) / 300 + Bt.stam / 1000;
    if (stall >= standupAfter && rng.chance(0.55)) {
      pos = 'stand';
      stall = 0;
      sayN('standup', 'standup', 0);
      return;
    }
    if (roll < botEsc) {
      pos = 'stand';
      stall = 0;
      say('getup', bot, 'getup', 1);
    } else if (roll < botEsc + Bt.subRate * 0.25) {
      stall = 0;
      subAttempt(bot);
    } else if (roll < botEsc + Bt.subRate * 0.25 + 0.05 + eff(Bt, 'grappling') / 2000) {
      pos = pos === 'atop' ? 'btop' : 'atop';
      stall = 0;
      say('sweep', bot, 'sweep', 2);
    } else if (rng.chance(T.subRate * 0.35)) {
      stall = 0;
      subAttempt(top);
    } else if (rng.chance(0.55 + (T.f.styles.includes('Ground & Pound') ? 0.25 : 0))) {
      stall = 0;
      T.strAtt++;
      if (rng.chance(0.55 + (eff(T, 'striking') - eff(Bt, 'grappling')) / 250)) {
        T.str++;
        T.r.str += 0.7;
        let dmg = (1.8 + eff(T, 'power') / 18) * rng.float(0.6, 1.5) * (1.1 - eff(Bt, 'durability') / 250);
        if (rng.chance(0.15)) {
          dmg *= 1.5;
          say('gnp_elbow', top, 'gnp', 2);
          if (rng.chance(0.08 * (1.2 - Bt.f.cutman.rating / 140))) {
            Bt.cut = Math.min(10, Bt.cut + rng.int(1, 3));
            say('cut', top, 'cut', 2);
          }
        } else say('gnp', top, 'gnp', 1);
        Bt.hp -= dmg;
        Bt.hurt = Math.min(2, Bt.hurt + dmg / 35);
        T.dmg += dmg;
        T.r.dmg += dmg;
        refCheck(top, 0);
      }
    } else {
      say('ground_control', top, 'ctrl', 0);
    }
    if (!finish && rng.chance(0.012 * (T.f.traits.includes('Hothead') ? 2 : 1))) foul(top);
  };

  const standExchange = () => {
    stall = 0;
    // who leads
    const wA = S[0].pressure * (0.6 + S[0].stam / 250) * (S[0].hurt > 1 ? 0.6 : 1);
    const wB = S[1].pressure * (0.6 + S[1].stam / 250) * (S[1].hurt > 1 ? 0.6 : 1);
    const ai = rng.chance(wA / (wA + wB)) ? 0 : 1;
    const A = S[ai];
    if (pos === 'clinch') {
      const r = rng.next();
      if (r < 0.35) strike(ai);
      else if (r < 0.55) takedown(ai);
      else if (r < 0.72) {
        pos = 'stand';
        say('break_clinch', ai, 'break', 0);
      } else {
        A.ctrl += 10;
        A.r.ctrl += 8;
        say('clinch_work', ai, 'clinch', 0);
      }
      return;
    }
    const r = rng.next();
    const hurtOpp = S[1 - ai].hurt > 0.9;
    if (r < A.shootRate * (hurtOpp ? 0.5 : 1)) takedown(ai);
    else if (r < A.shootRate + 0.05) {
      pos = 'clinch';
      say('clinch', ai, 'clinch', 0);
    } else if (r < 0.92 || hurtOpp) {
      strike(ai);
      if (!finish && rng.chance(0.35 + A.pressure * 0.1)) strike(ai);
    } else if (rng.chance(0.4)) say('feint', ai, 'idle', 0);
    else if (rng.chance(0.15) && A.f.styles.includes('Showboat')) {
      say('showboat', ai, 'taunt', 2);
      A.r.agg += 0.5;
    }
    if (!finish && rng.chance(0.006 * (A.f.traits.includes('Hothead') ? 2 : 1) * (A.stam < 40 ? 1.6 : 1))) foul(ai);
  };

  const scoreRound = () => {
    const rs: [number, number][] = [];
    const domA = S[0].r.dmg - S[1].r.dmg;
    for (let j = 0; j < opts.judges.length; j++) {
      const judge = opts.judges[j];
      const w = { s: 1, d: 0.6, t: 3, c: 0.06, a: 0.15, noise: 3 };
      if (judge.bias === 'striking') { w.s = 1.4; w.d = 0.9; w.t = 1.8; }
      if (judge.bias === 'grappling') { w.t = 5; w.c = 0.12; w.s = 0.8; }
      if (judge.bias === 'aggression') { w.a = 0.5; }
      if (judge.bias === 'bad') w.noise = 12;
      const sc = (s: Side) => s.r.str * w.s + s.r.dmg * w.d + s.r.td * w.t + s.r.ctrl * w.c + s.r.agg * w.a + s.r.kd * 8;
      let diff = sc(S[0]) - sc(S[1]) + rng.gauss() * w.noise * (2 - realism);
      if (judge.bias === 'hometown' && opts.homeSide !== undefined && opts.homeSide >= 0) diff += opts.homeSide === 0 ? 5 : -5;
      let pa = 10;
      let pb = 10;
      if (Math.abs(diff) < 0.6 && rng.chance(0.25)) {
        // 10-10
      } else if (diff > 0) {
        pb = 9;
        if ((S[0].r.kd >= 2 || (domA > 55 && S[0].r.kd >= 1) || domA > 85) && rng.chance(0.7)) pb = 8;
      } else {
        pa = 9;
        if ((S[1].r.kd >= 2 || (-domA > 55 && S[1].r.kd >= 1) || -domA > 85) && rng.chance(0.7)) pa = 8;
      }
      rs.push([pa, pb]);
    }
    roundScores.push(rs);
  };

  const cornerPhase = (): boolean => {
    for (const i of [0, 1] as const) {
      const s = S[i];
      // cutman work between rounds: better cutmen close cuts
      const fix = s.f.cutman.rating / 45;
      s.cut = Math.max(0, s.cut - Math.floor(fix * rng.float(0.3, 1)));
      const losing = roundScores.length && roundScores.reduce((acc, rr) => acc + (rr[0][i] - rr[0][1 - i]), 0) < -1;
      let quitP = 0;
      if (s.injury) quitP += [0, 0.18, 0.38, 0.9][s.injury.sev];
      if (s.hp < 30) quitP += 0.18;
      if (s.hp < 15) quitP += 0.25;
      if (losing && round >= 2) quitP += 0.06;
      quitP -= s.sk.heart / 140;
      quitP = Math.max(0, quitP * (0.8 + (1 - realism) * 0.4));
      const quit = round < opts.rounds && rng.chance(quitP);
      let doctor = false;
      if (!quit && s.cut >= 5 && rng.chance((s.cut - 4) * 0.15 * (1.3 - s.f.cutman.rating / 100))) doctor = true;
      const coachKey = quit ? 'coach_quit' : s.injury ? 'coach_injured' : losing ? 'coach_losing' : s.hp < 50 ? 'coach_hurt' : 'coach_winning';
      const cutKey = s.cut >= 6 ? 'cutman_bad' : s.cut > 0 ? 'cutman_cut' : 'cutman_fine';
      const pickT = (k: string) => {
        const l = tpl[k];
        return l && l.length ? fill(rng.pick(l), i) : k;
      };
      const tot = roundScores.reduce((acc, rr) => acc + rr[0][i] - rr[0][1 - i], 0);
      corners.push({
        round, side: i, coach: pickT(coachKey), cutman: pickT(cutKey), hp: Math.round(Math.max(0, s.hp)), cut: s.cut,
        injury: s.injury?.name ?? null, quit, scoreGuess: tot > 0 ? 'Up on the cards' : tot < 0 ? 'Down on the cards' : 'Even',
      });
      if (quit) {
        say('stool', i, 'stool', 3);
        end({ method: 'TKO', detail: `Corner Stoppage (${s.injury ? s.injury.name : 'retired on stool'})`, winner: (1 - i) as 0 | 1 });
        finishT = 300;
        return true;
      }
      if (doctor) {
        say('doctor', i, 'stop', 3);
        end({ method: 'DOC', detail: 'Doctor Stoppage (cut)', winner: (1 - i) as 0 | 1 });
        finishT = 300;
        return true;
      }
      s.stam = Math.min(100, s.stam + 22 + s.sk.cardio / 5);
      s.hp = Math.min(100, s.hp + 3 + s.sk.durability / 25);
      s.hurt = Math.max(0, s.hurt - 0.7);
    }
    return false;
  };

  // ---------------------------------------------------------------- main loop
  for (round = 1; round <= opts.rounds && !finish; round++) {
    t = 0;
    for (const s of S) s.r = { str: 0, dmg: 0, td: 0, ctrl: 0, agg: 0, kd: 0 };
    pos = 'stand';
    if (keep) sayN(round === 1 ? 'opening' : 'round_start', 'idle', 1);
    while (!finish) {
      t += rng.int(8, 20);
      if (t >= 300) break;
      if ((pos as Pos) === 'atop' || (pos as Pos) === 'btop') groundExchange();
      else standExchange();
      for (const s of S) {
        const burn = 0.9 + (100 - s.sk.cardio) / 60 + (s.f.addiction > 50 ? 0.5 : 0);
        s.stam = Math.max(5, s.stam - burn * rng.float(0.5, 1.2));
        s.hurt = Math.max(0, s.hurt - 0.05);
        if (s.cut > 0) s.hp -= s.cut * 0.04;
      }
      if (!finish && S[0].hp <= 0) end({ method: 'TKO', detail: 'Strikes', winner: 1 });
      if (!finish && S[1].hp <= 0) end({ method: 'TKO', detail: 'Strikes', winner: 0 });
      if (!finish && rng.chance(0.02)) sayN('crowd', 'idle', 1);
    }
    if (finish) break;
    t = 300;
    scoreRound();
    sayN('round_end', 'bell', 1);
    if (round < opts.rounds && cornerPhase()) break;
  }
  if (finish) round = Math.min(round, opts.rounds);

  // ---------------------------------------------------------------- result
  const totals: [number, number][] = opts.judges.map((_, j) => {
    let x = 0;
    let y = 0;
    for (const rs of roundScores) {
      x += rs[j][0];
      y += rs[j][1];
    }
    return [x - S[0].ded, y - S[1].ded];
  });
  let method: Method;
  let detail: string;
  let winner: 0 | 1 | -1;
  let robbery = false;
  const fin = finish as Finish | null;
  if (fin && !(fin.method === 'DEC' && fin.detail === 'Technical Decision')) {
    method = fin.method;
    detail = fin.detail;
    winner = fin.winner;
  } else {
    const technical = !!fin;
    if (technical && roundScores.length === 0) {
      method = 'NC';
      detail = 'No Contest';
      winner = -1;
    } else {
      let va = 0, vb = 0;
      for (const [x, y] of totals) {
        if (x > y) va++;
        else if (y > x) vb++;
      }
      const n = totals.length;
      if (va > vb) {
        winner = 0;
        method = 'DEC';
        detail = va === n ? 'Unanimous Decision' : vb === 0 ? 'Majority Decision' : 'Split Decision';
      } else if (vb > va) {
        winner = 1;
        method = 'DEC';
        detail = vb === n ? 'Unanimous Decision' : va === 0 ? 'Majority Decision' : 'Split Decision';
      } else {
        winner = -1;
        method = 'DRAW';
        detail = va === 0 && vb === 0 ? (n === 3 ? 'Unanimous Draw' : 'Draw') : va === 1 && vb === 1 ? 'Split Draw' : 'Majority Draw';
      }
      if (technical) detail = 'Technical ' + detail;
      // robbery: judges' winner clearly lost on damage & output
      const truth = S[0].dmg + S[0].str * 0.6 + S[0].td * 3 + S[0].kd * 10 - (S[1].dmg + S[1].str * 0.6 + S[1].td * 3 + S[1].kd * 10);
      if ((winner === 0 && truth < -18) || (winner === 1 && truth > 18) || (winner === -1 && Math.abs(truth) > 40)) robbery = true;
      round = opts.rounds;
      t = 300;
      if (keep) sayN(robbery ? 'decision_robbery' : 'decision', 'end', robbery ? 3 : 2, { detail });
    }
  }
  if (method === 'DRAW' || method === 'NC') winner = -1;

  // fight quality for performance bonuses
  const action = (S[0].str + S[1].str) / 4 + (S[0].kd + S[1].kd) * 12 + (S[0].subAtt + S[1].subAtt) * 3;
  const close = 20 - Math.min(20, Math.abs(S[0].dmg - S[1].dmg) / 4);
  const finishBonus = method === 'KO' ? 30 : method === 'SUB' ? 22 : method === 'TKO' ? 18 : 0;
  const fotn = Math.round(Math.min(100, action * 0.6 + close + finishBonus + (finishRound >= 3 ? 8 : 0)));

  const mm = Math.floor(finishT / 60);
  const ss = Math.floor(finishT % 60);
  return {
    winner: winner === -1 ? null : S[winner].f.id,
    loser: winner === -1 ? null : S[1 - winner].f.id,
    method,
    detail,
    round: fin ? finishRound : opts.rounds,
    time: fin ? `${mm}:${ss.toString().padStart(2, '0')}` : '5:00',
    scores: totals,
    judges: opts.judges.map((j) => j.name),
    referee: ref.name,
    robbery,
    fotn,
    damage: [Math.round(100 - Math.max(0, S[0].hp)), Math.round(100 - Math.max(0, S[1].hp))],
    ticker: keep ? ticker : undefined,
    corners: keep ? corners : undefined,
    roundScores: keep ? roundScores : undefined,
    stats: {
      strikes: [S[0].str, S[1].str],
      takedowns: [S[0].td, S[1].td],
      knockdowns: [S[1].kd, S[0].kd],
    },
    injuries,
    fouls,
    pointDeductions: [S[0].ded, S[1].ded],
    cuts: [S[0].cut, S[1].cut],
  };
}

const FOUL_NAMES: Record<string, string> = {
  eyepoke: 'Eye Poke', groin: 'Groin Strike', fence: 'Fence Grab', backhead: 'Strikes to the Back of the Head',
  knee_grounded: 'Illegal Knee to a Grounded Opponent', headbutt: 'Headbutt', glove: 'Holding the Gloves',
};

function koDetail(type: string): string {
  switch (type) {
    case 'headkick': return 'Head Kick';
    case 'knee': return 'Knee';
    case 'elbow': return 'Elbow';
    case 'spinning': return 'Spinning Back Fist';
    case 'flying': return 'Flying Knee';
    case 'superman': return 'Superman Punch';
    case 'uppercut': return 'Uppercut';
    case 'hook': return 'Left Hook';
    case 'overhand': return 'Overhand Right';
    default: return 'Punch';
  }
}

function actFor(type: string): string {
  if (type.includes('kick')) return type === 'headkick' ? 'headkick' : type === 'bodykick' ? 'kick' : 'legkick';
  if (type === 'knee' || type === 'flying') return 'knee';
  if (type === 'elbow' || type === 'dirty') return 'elbow';
  if (type === 'jab') return 'jab';
  return 'punch';
}

/** Quick win-probability estimate (used by matchmaking and betting odds). */
export function quickOdds(a: Fighter, b: Fighter): number {
  const sc = (f: Fighter) =>
    f.skills.striking * 0.2 + f.skills.power * 0.15 + f.skills.wrestling * 0.15 + f.skills.grappling * 0.13 + f.skills.cardio * 0.1 +
    f.skills.chin * 0.1 + f.skills.fightIQ * 0.12 + f.skills.durability * 0.05;
  const d = sc(a) - sc(b);
  return 1 / (1 + Math.exp(-d / 6));
}

export function oddsString(p: number): string {
  if (p >= 0.5) return '-' + Math.round((p / (1 - p)) * 100);
  return '+' + Math.round(((1 - p) / p) * 100);
}
