import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LESSONS, GROUPS, FIGHT_LESSONS, DIR_SETS, lessonByKey, stepText, tokenGlyphs, parsePose, isDiagram, type CtlMode } from '../src/ui/guidelessons';
import { PICS } from '../src/ui/guidepics';
import { POSES } from '../src/ui/rig';

const PUBLIC = join(__dirname, '..', 'public', 'tutorial');
const MODES: CtlMode[] = ['kb', 'pad', 'touch'];
/** Pictures a lesson may name before they've been taken (none at the moment). */
const OPTIONAL_PICS = new Set<string>();

/** A PNG's size from its header. */
function pngSize(file: string): [number, number] {
  const b = readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe('the tutorial lessons', () => {
  it('every lesson has a unique key, and the keys old saves remember are still there', () => {
    const keys = LESSONS.map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of ['paper', 'desk', 'fightnight', 'ledger', 'contender', 'fmhub', 'fm_fightnight', 'fm_live']) expect(lessonByKey(k), k).not.toBeNull();
  });

  it('the TUTORIALS list has every lesson exactly once', () => {
    const listed = GROUPS.flatMap(([, , keys]) => keys);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(LESSONS.map((l) => l.key).sort());
    for (const [group, , keys] of GROUPS) for (const k of keys) expect(lessonByKey(k)!.group, k).toBe(group);
    for (const k of FIGHT_LESSONS) expect(lessonByKey(k)!.mode, k).toBe('fight');
  });

  it('lessons are 3 to 8 steps, titles fit the card', () => {
    for (const l of LESSONS) {
      expect(l.steps.length, l.key).toBeGreaterThanOrEqual(3);
      expect(l.steps.length, l.key).toBeLessThanOrEqual(8);
      expect(l.title.length, l.key).toBeLessThanOrEqual(22);
      expect(l.blurb.length, l.key).toBeLessThanOrEqual(52);
      for (const st of l.steps) expect(st.title.length, `${l.key}: ${st.title}`).toBeLessThanOrEqual(22);
    }
  });

  it('every step reads right on a keyboard, a controller and a phone: no tokens left, short enough', () => {
    for (const l of LESSONS) {
      for (const st of l.steps) {
        for (const mode of MODES) {
          const t = stepText(st, mode);
          const where = `${l.key} / ${st.title} / ${mode}: ${t}`;
          expect(t.includes('['), where).toBe(false);
          expect(t.includes(']'), where).toBe(false);
          expect(t.includes('||'), where).toBe(false);
          expect(t.split(/\s+/).filter(Boolean).length, where).toBeLessThanOrEqual(48);
          expect(t.trim().length, where).toBeGreaterThan(20);
        }
        // phones never say click; controllers never say click or ESC
        expect(/\bclick/i.test(stepText(st, 'touch')), `${l.key} / ${st.title}`).toBe(false);
        expect(/\bclick|\bESC\b|keyboard/i.test(stepText(st, 'pad')), `${l.key} / ${st.title}: ${stepText(st, 'pad')}`).toBe(false);
      }
    }
  });

  it('device words come from the real bindings', () => {
    const live = lessonByKey('fm_live')!.steps.find((s) => s.title === 'MOVE & PUNCH')!;
    expect(stepText(live, 'kb')).toContain('J throws your lead hand');
    expect(stepText(live, 'pad')).toContain('RB throws your lead hand');
    expect(stepText(live, 'touch')).toContain('LEAD is a jab');
    const sub = lessonByKey('fight_ground')!.steps.find((s) => s.title === 'SUBMISSIONS')!;
    expect(stepText(sub, 'kb')).toContain('W, D, S, A');
    expect(stepText(sub, 'pad')).toContain('left stick');
  });

  it('tryIt targets are plain button labels (no patterns but PREFIX*)', () => {
    for (const l of LESSONS) {
      if (!l.tryIt) continue;
      expect(/[\\^$[\]|]/.test(l.tryIt), l.key).toBe(false);
    }
  });
});

describe('the tutorial pictures', () => {
  it('every picture a step names exists: a diagram, or a screenshot in public/tutorial', () => {
    for (const l of LESSONS) {
      for (const st of l.steps) {
        const pic = st.pic ?? '';
        const where = `${l.key} / ${st.title}: ${pic}`;
        if (!pic || OPTIONAL_PICS.has(pic)) continue;
        if (pic.startsWith('dirs:')) {
          expect(DIR_SETS[pic.slice(5)], where).toBeTruthy();
          continue;
        }
        if (isDiagram(pic)) {
          const p = parsePose(pic);
          expect(p, where).not.toBeNull();
          expect((POSES as Record<string, unknown>)[p!.red], where).toBeTruthy();
          expect((POSES as Record<string, unknown>)[p!.blue], where).toBeTruthy();
          continue;
        }
        expect(PICS[pic]?.pc, where).toBeTruthy();
      }
    }
  });

  it('every screenshot file exists, has the size the manifest says, and fits the card', () => {
    for (const [name, e] of Object.entries(PICS)) {
      for (const info of [e.pc, e.phone]) {
        if (!info) continue;
        const file = join(PUBLIC, info.file);
        expect(existsSync(file), `${name}: ${info.file}`).toBe(true);
        const r = info.r ?? 1;
        expect(pngSize(file), `${name}: ${info.file}`).toEqual([info.w * r, info.h * r]);
        // at most a phone screen: bigger than its frame on the card is fine (shrunk to fit), bigger than the screen is a bad crop
        expect(info.w, name).toBeLessThanOrEqual(532);
        expect(info.h, name).toBeLessThanOrEqual(270);
        expect([1, 2, 3], name).toContain(info.r ?? 1);
        if (info.file.startsWith('pc/') && e.pc === info && (info.r ?? 1) === 1) {
          // PC pictures fit a frame 1:1: beside the text (340 x 204) or above it (468 x 152); only 2x ones may shrink
          expect((info.w <= 340 && info.h <= 204) || (info.w <= 468 && info.h <= 152), `${name} ${info.w}x${info.h}`).toBe(true);
        }
      }
    }
  });

  it('every mark sits inside its picture, slots count 1, 2, 3 with no gaps, legends use known tokens', () => {
    for (const [name, e] of Object.entries(PICS)) {
      for (const info of [e.pc, e.phone]) {
        if (!info) continue;
        const slots = new Set<number>();
        for (const m of info.marks) {
          const where = `${name} ${info.file} ${JSON.stringify(m)}`;
          slots.add(m.n ?? 1);
          expect(m.x, where).toBeGreaterThanOrEqual(0);
          expect(m.y, where).toBeGreaterThanOrEqual(0);
          expect(m.x + (m.w ?? 0), where).toBeLessThanOrEqual(info.w);
          expect(m.y + (m.h ?? 0), where).toBeLessThanOrEqual(info.h);
          if (m.x2 !== undefined) expect(m.x2 >= 0 && m.x2 <= info.w && m.y2! >= 0 && m.y2! <= info.h, where).toBe(true);
          if (m.k === 'legend') for (const [tok] of m.items ?? []) {
            expect(tokenGlyphs(tok, 'kb').length, where).toBeGreaterThan(0);
            expect(tokenGlyphs(tok, 'pad').length, where).toBeGreaterThan(0);
          }
        }
        const sorted = [...slots].sort((a, b) => a - b);
        sorted.forEach((n, i) => expect(n, `${name} ${info.file} slots ${sorted}`).toBe(i + 1));
      }
    }
  });

  it('picture names are plain identifiers', () => {
    for (const name of Object.keys(PICS)) expect(/^[a-z0-9_]+$/.test(name), name).toBe(true);
  });
});
