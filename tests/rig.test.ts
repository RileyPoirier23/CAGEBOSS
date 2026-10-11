import { describe, it, expect } from 'vitest';
import { frameFor, stanceGuard, lookFor, type Look2 } from '../src/ui/rig';
import { content as loadTestContent } from './setup';
import { createFighterGame, me } from '../src/sim/fighter';

loadTestContent();

describe('the fighter models', () => {
  it('a heavyweight is drawn bigger than a flyweight, a lightweight is the reference', () => {
    expect(frameFor('heavy')).toBeGreaterThan(frameFor('lightheavy'));
    expect(frameFor('lightheavy')).toBeGreaterThan(frameFor('middle'));
    expect(frameFor('middle')).toBeGreaterThan(frameFor('welter'));
    expect(frameFor('welter')).toBeGreaterThan(frameFor('light'));
    expect(frameFor('light')).toBe(1);
    expect(frameFor('feather')).toBeGreaterThan(frameFor('bantam'));
    expect(frameFor('bantam')).toBeGreaterThan(frameFor('fly'));
    expect(frameFor('wstraw')).toBeLessThan(frameFor('wfly'));
  });

  it('a fighter\'s look carries his frame', () => {
    const s = createFighterGame({ seed: 2, first: 'Test', last: 'Guy', nick: '', gender: 'M', culture: 'us_urban', division: 'light', archetype: 'striker', look: { head: 0, skin: 1, hair: 1, hairColor: 1, beard: 0, brows: 0, eyes: 0, nose: 0, ears: 0, scar: 0, tattoo: 0, build: 1 } as never });
    const f = me(s);
    expect(lookFor(f, 0).frame).toBe(frameFor(f.division));
  });

  it('a gassed man\'s hands come down and his head drops', () => {
    const base: Look2 = { skin: 0x8d5a3b, hairStyle: 0, hairColor: 0x1a1412, beard: 0, build: 1, trunks: 0, trim: 0, glove: 0x8e1e1e, stance: 'upright', female: false, tattoo: 0 };
    const fresh = stanceGuard(base, 0);
    const gassed = stanceGuard({ ...base, gassed: 1 }, 0);
    expect(gassed.haF[1]).toBeGreaterThan(fresh.haF[1]); // y down: lower hands are a bigger y
    expect(gassed.haB[1]).toBeGreaterThan(fresh.haB[1]);
    expect(gassed.head[0]).toBeGreaterThan(fresh.head[0]); // leaning in
  });
});

import { koPoseFor, KO_POSES, HEAVY_POSES, POSES } from '../src/ui/rig';

describe('the final round: how a man goes down', () => {
  it('an uppercut puts him on his back, a hook folds him, the body puts him on his face', () => {
    expect(koPoseFor('ko_uppercut uppercut')).toBe('ko');
    expect(koPoseFor('headkick')).toBe('ko');
    expect(koPoseFor('a left hook')).toBe('koCrumple');
    expect(koPoseFor('overhand right')).toBe('koCrumple');
    expect(koPoseFor('to the body')).toBe('koFace');
    expect(koPoseFor('ground and pound')).toBe('koFace');
    expect(koPoseFor('something else')).toBe('ko');
    for (const p of KO_POSES) expect(POSES[p]).toBeDefined();
  });
  it('the new poses exist and the big shots coil first', () => {
    for (const p of ['koFace', 'koCrumple', 'legBuckle', 'coil'] as const) expect(Object.keys(POSES[p])).toHaveLength(13);
    expect(HEAVY_POSES.has('overhand')).toBe(true);
    expect(HEAVY_POSES.has('jab')).toBe(false);
  });
});
