/* UNIVERSE CLASH - the CPU.
   A deterministic input generator: same state, same seed, same buttons. The
   brain is allowed a little memory (a plan and a reaction delay), but every
   decision comes from the match state, so rollback can replay it. */

import { charDef } from './characters';
import { stageById } from './stages';
import type { Fighter, InputFrame, MatchState, MoveKey } from './types';
import { emptyInput } from './types';
import { hash } from './art';

export interface AiBrain {
  side: 0 | 1;
  level: number;
  seed: number;
  /** 0..1: how well the CPU reads its opponent (rival memory). */
  read: number;
  plan: string;
  planTicks: number;
  decisionAt: number;
  holdHeavy: number;
  holdLight: number;
  chargeWithDrive: boolean;
  lastHeavy: boolean;
  lastLight: boolean;
  lastDodge: boolean;
  lastJump: boolean;
  lastThrow: boolean;
  lastSuper: boolean;
  lastDrive: boolean;
  aggression: number;
}

export function createAi(side: 0 | 1, level: number, seed: number, read = 0): AiBrain {
  return {
    side,
    level: Math.max(1, Math.min(5, Math.round(level))),
    seed: seed >>> 0,
    read: Math.max(0, Math.min(1, read)),
    plan: 'neutral',
    planTicks: 0,
    decisionAt: 0,
    holdHeavy: 0,
    holdLight: 0,
    chargeWithDrive: false,
    lastHeavy: false,
    lastLight: false,
    lastDodge: false,
    lastJump: false,
    lastThrow: false,
    lastSuper: false,
    lastDrive: false,
    aggression: 0.5,
  };
}

export function resetAi(brain: AiBrain, level = brain.level, seed = brain.seed, read = brain.read): void {
  const fresh = createAi(brain.side, level, seed, read);
  Object.assign(brain, fresh);
}

function rnd(brain: AiBrain, m: MatchState, salt: number): number {
  return hash(brain.seed * 7919 + m.tick * 104729 + brain.side * 15485863 + salt * 32452843);
}

function meleeRange(f: Fighter): number {
  const def = charDef(f.char);
  return 86 + def.stats.range * 16;
}

function canAct(f: Fighter): boolean {
  return f.state === 'idle' || f.state === 'run' || f.state === 'jump' || f.state === 'fall' || f.state === 'land';
}

function edgeDanger(m: MatchState, f: Fighter, dir: number): boolean {
  const x = f.x + dir * 100;
  return x < 280 || x > 1320;
}

function sideOut(m: MatchState, f: Fighter): boolean {
  const stage = stageById(m.stageId);
  return f.x < stage.blast.left + 140 || f.x > stage.blast.right - 140;
}

/** Pick the best distance tool this character owns. */
function rangedKey(f: Fighter): MoveKey {
  const def = charDef(f.char);
  if (def.moves.nSig.projectile) return 'nSig';
  if (def.moves.sSig.projectile) return 'sSig';
  if (def.moves.dSig.projectile) return 'dSig';
  if (def.moves.airSig.projectile) return 'airSig';
  return 'sLight';
}

function hasProjectile(f: Fighter): boolean {
  const def = charDef(f.char);
  return !!(def.moves.nSig.projectile || def.moves.sSig.projectile || def.moves.dSig.projectile || def.moves.airSig.projectile);
}

export function aiInput(brain: AiBrain, m: MatchState): InputFrame {
  const input = emptyInput();
  const f = m.fighters[brain.side];
  const o = m.fighters[brain.side === 0 ? 1 : 0];
  if (m.phase !== 'fight' || f.state === 'ko' || f.stocks <= 0) return input;

  const level = brain.level;
  const dx = o.x - f.x;
  const dy = o.y - f.y;
  const adx = Math.abs(dx);
  const dir = dx === 0 ? (f.side === 0 ? 1 : -1) : dx > 0 ? 1 : -1;
  const toward = dir;
  const away = -dir;
  const stage = stageById(m.stageId);
  const offstage = f.x < stage.platforms[0].x - 40 || f.x > stage.platforms[0].x + stage.platforms[0].w + 40 || f.y > 720;
  const opponentOff = !o.grounded && (o.x < stage.platforms[0].x - 20 || o.x > stage.platforms[0].x + stage.platforms[0].w + 20);

  if (brain.holdHeavy > 0) {
    brain.holdHeavy--;
    input.heavy = true;
    input.drive = brain.chargeWithDrive;
    if (brain.holdHeavy === 0) {
      brain.chargeWithDrive = false;
      brain.decisionAt = m.tick + 10;
    }
  }
  if (brain.holdLight > 0) {
    brain.holdLight--;
    input.light = true;
  }

  // Recover first. The CPU is allowed to be stupid, not suicidal.
  if (offstage || f.state === 'jump' || f.state === 'fall') {
    if (f.x < 300 && f.vx < 0) input.right = true;
    if (f.x > 1300 && f.vx > 0) input.left = true;
    if (f.y > 640 && f.vy > 0 && !f.grounded) {
      input.left = f.x > 800;
      input.right = f.x < 800;
      if (brain.holdHeavy <= 0 && f.jumps > 0) {
        input.jumpPressed = true;
        input.jump = true;
      } else if (brain.holdHeavy <= 0) {
        input.up = true;
        input.heavyPressed = true;
        input.heavy = true;
      }
    } else if (!f.grounded && adx < 130 && dy < 0 && level >= 3) {
      input.lightPressed = true;
      input.light = true;
      input.right = dir > 0;
      input.left = dir < 0;
    }
    if (offstage && brain.holdHeavy <= 0 && f.y > 580) {
      input.up = true;
      input.heavyPressed = true;
      input.heavy = true;
    }
    if (offstage && !f.grounded && adx < 130) {
      input.dodgePressed = true;
      input.dodge = true;
      input.right = toward > 0;
      input.left = toward < 0;
    }
    return edge(brain, input);
  }

  // Burst out of a long combo.
  if (f.state === 'hitstun') {
    if (
      level >= 3 && f.hitstun > 14 && f.drive >= 2 && f.burnout <= 0 &&
      rnd(brain, m, 1) < 0.35 + level * 0.08 + brain.read * 0.2
    ) {
      input.drivePressed = true;
      input.drive = true;
    }
    return edge(brain, input);
  }

  if (m.training) {
    // Training CPU walks back and forth and throws a light every second.
    if (m.tick % 90 < 50) input.right = brain.side === 1 ? false : true;
    if (m.tick % 90 < 50) input.left = brain.side === 1 ? true : false;
    if (m.tick % 90 === 60 && adx < meleeRange(f) + 40) {
      input.lightPressed = true;
      input.light = true;
    }
    return edge(brain, input);
  }

  // Where are we relative to the opponent and the ledge?
  const danger = edgeDanger(m, f, toward);
  if (!canAct(f) && f.state !== 'parry' && f.state !== 'dodge') {
    // Can't act; drift toward the stage while the move plays out.
    if (f.x < 320) input.right = true;
    if (f.x > 1280) input.left = true;
    return edge(brain, input);
  }

  // Face the opponent and drift, but never walk off the stage on purpose.
  if (adx > 40) {
    if (!danger) {
      input.right = toward > 0;
      input.left = toward < 0;
    } else {
      input.right = f.x < 800;
      input.left = f.x > 800;
    }
  }

  // Parry when the opponent is in startup and close. Rival memory raises the odds.
  if (
    level >= 2 && !o.grounded && adx < 150 && o.state === 'attack' && o.move !== null &&
    f.drive >= 1 && f.burnout <= 0 && f.dodgeCooldown <= 0 &&
    rnd(brain, m, 2) < 0.1 + level * 0.06 + brain.read * 0.18
  ) {
    input.dodgePressed = true;
    input.dodge = true;
    input.heavy = true;
    return edge(brain, input);
  }
  if (
    level >= 2 && o.state === 'attack' && adx < 180 && f.dodgeCooldown <= 0 &&
    rnd(brain, m, 3) < 0.12 + level * 0.07 + brain.read * 0.14
  ) {
    input.dodgePressed = true;
    input.dodge = true;
    input.right = away > 0;
    input.left = away < 0;
    return edge(brain, input);
  }

  if (m.tick < brain.decisionAt) {
    // Stay on target between decisions.
    if (adx > meleeRange(f) + 20) {
      input.right = toward > 0;
      input.left = toward < 0;
    }
    return edge(brain, input);
  }

  const reaction = level >= 5 ? 4 : level >= 3 ? 7 : level >= 2 ? 11 : 16;
  brain.decisionAt = m.tick + reaction + Math.floor(rnd(brain, m, 4) * 8);

  // Super / comeback.
  if (
    (f.superFree || (f.drive >= 2 && f.burnout <= 0)) &&
    adx < 230 && Math.abs(dy) < 150 &&
    rnd(brain, m, 5) < (f.superFree ? 0.9 : 0.18 + level * 0.04)
  ) {
    input.superPressed = true;
    input.super = true;
    return edge(brain, input);
  }

  // Item in hand: throw it.
  const held = m.items.find((i) => i.heldBy === brain.side);
  if (held && adx < 420 && rnd(brain, m, 6) < 0.75) {
    input.throwPressed = true;
    input.throw = true;
    return edge(brain, input);
  }
  // Item on the floor: grab it if the fight is not on top of us.
  if (!held && adx > 150) {
    const item = m.items.find((i) => i.heldBy === -1 && Math.abs(i.x - f.x) < 100);
    if (item && rnd(brain, m, 7) < 0.5) {
      input.throwPressed = true;
      input.throw = true;
      return edge(brain, input);
    }
  }

  // Drive Impact through a predictable opponent.
  if (
    level >= 3 && f.drive >= 1 && f.burnout <= 0 && adx > 100 && adx < 220 && Math.abs(dy) < 70 &&
    o.state === 'attack' && rnd(brain, m, 8) < 0.1 + level * 0.04 + brain.read * 0.12
  ) {
    input.light = true;
    input.heavy = true;
    input.drive = false;
    return edge(brain, input);
  }

  // Anti-air.
  if (dy < -90 && adx < 160 && level >= 2 && f.grounded && rnd(brain, m, 9) < 0.3 + level * 0.1 + brain.read * 0.1) {
    input.jumpPressed = true;
    input.jump = true;
    input.up = true;
    input.heavyPressed = true;
    input.heavy = true;
    return edge(brain, input);
  }

  // Close range.
  if (adx < meleeRange(f) && Math.abs(dy) < 110) {
    const choice = rnd(brain, m, 10);
    if (choice < 0.34) {
      input.lightPressed = true;
      input.light = true;
      input.down = level >= 4 && rnd(brain, m, 11) < 0.3;
      return edge(brain, input);
    }
    if (choice < 0.64) {
      input.heavyPressed = true;
      input.heavy = true;
      if (level >= 3 && f.drive >= 1 && !f.burnout && rnd(brain, m, 12) < 0.42) {
        input.drive = true;
        brain.chargeWithDrive = true;
      }
      if (rnd(brain, m, 13) < 0.55) {
        brain.holdHeavy = 8 + Math.floor(rnd(brain, m, 14) * (level * 9));
      }
      return edge(brain, input);
    }
    if (choice < 0.8 && adx < 90) {
      input.throwPressed = true;
      input.throw = true;
      return edge(brain, input);
    }
    input.dodgePressed = true;
    input.dodge = true;
    input.right = away > 0;
    input.left = away < 0;
    return edge(brain, input);
  }

  // Mid range: projectiles and approach.
  if (hasProjectile(f) && adx > 190 && adx < 780 && rnd(brain, m, 15) < 0.34 + level * 0.05) {
    input.heavyPressed = true;
    input.heavy = true;
    input.down = !f.grounded && rnd(brain, m, 16) < 0.5;
    input.right = dir > 0;
    input.left = dir < 0;
    return edge(brain, input);
  }

  // Chase a falling opponent off the stage, but not into the blast zone.
  if (opponentOff && level >= 3 && rnd(brain, m, 17) < 0.45) {
    input.right = o.x > f.x;
    input.left = o.x < f.x;
    if (f.grounded) {
      input.jumpPressed = true;
      input.jump = true;
    }
    return edge(brain, input);
  }

  // Approach: run in, sometimes dash-dance or jump in.
  if (adx > 200 && level >= 2 && rnd(brain, m, 18) < 0.16) {
    input.jumpPressed = true;
    input.jump = true;
    input.right = toward > 0;
    input.left = toward < 0;
    input.down = rnd(brain, m, 19) < 0.4;
    return edge(brain, input);
  }
  input.right = toward > 0 && !danger;
  input.left = toward < 0 && !danger;
  return edge(brain, input);
}

/** Turn held buttons into the edge flags the sim reads, then remember them. */
function edge(brain: AiBrain, next: InputFrame): InputFrame {
  const out = { ...next };
  if (out.light && !brain.lastLight) out.lightPressed = true;
  if (out.heavy && !brain.lastHeavy) out.heavyPressed = true;
  if (out.dodge && !brain.lastDodge) out.dodgePressed = true;
  if (out.jump && !brain.lastJump) out.jumpPressed = true;
  if (out.throw && !brain.lastThrow) out.throwPressed = true;
  if (out.super && !brain.lastSuper) out.superPressed = true;
  if (out.drive && !brain.lastDrive) out.drivePressed = true;
  brain.lastLight = out.light;
  brain.lastHeavy = out.heavy;
  brain.lastDodge = out.dodge;
  brain.lastJump = out.jump;
  brain.lastThrow = out.throw;
  brain.lastSuper = out.super;
  brain.lastDrive = out.drive;
  return out;
}
