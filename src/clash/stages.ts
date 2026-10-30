import type { StageDef } from './types';

/* Six stages, six universes. Every layout keeps the same fight geometry at the
   top so a combo route learned on one stage works on the others. The dressing
   changes; the blast zones do not. */

const blast = { left: -330, right: 1930, top: -430, bottom: 1090 };

export const STAGES: StageDef[] = [
  {
    id: 'rooftop',
    name: 'Capital Rooftop',
    subtitle: 'The parade is still going.',
    theme: 'rooftop',
    universe: 'capital',
    blast,
    spawns: [{ x: 670, y: 320 }, { x: 930, y: 320 }],
    platforms: [
      { id: 'main', x: 300, y: 650, w: 1000, h: 110, soft: false },
      { id: 'left', x: 430, y: 505, w: 220, h: 18, soft: true },
      { id: 'right', x: 950, y: 505, w: 220, h: 18, soft: true },
      { id: 'top', x: 700, y: 372, w: 200, h: 16, soft: true },
    ],
    music: 'brass',
  },
  {
    id: 'scroll',
    name: 'Scroll Bridge',
    subtitle: 'The ink has not dried.',
    theme: 'scroll',
    universe: 'oldink',
    blast,
    spawns: [{ x: 670, y: 320 }, { x: 930, y: 320 }],
    platforms: [
      { id: 'main', x: 320, y: 650, w: 960, h: 110, soft: false },
      { id: 'left', x: 390, y: 498, w: 210, h: 14, soft: true },
      { id: 'right', x: 1000, y: 498, w: 210, h: 14, soft: true },
      { id: 'top', x: 705, y: 360, w: 190, h: 14, soft: true },
    ],
    music: 'guqin',
  },
  {
    id: 'cabinet',
    name: 'Cabinet 1987',
    subtitle: 'Insert coin. Lose teeth.',
    theme: 'cabinet',
    universe: 'arcade',
    blast,
    spawns: [{ x: 670, y: 320 }, { x: 930, y: 320 }],
    platforms: [
      { id: 'main', x: 310, y: 650, w: 980, h: 110, soft: false },
      { id: 'left', x: 360, y: 492, w: 190, h: 18, soft: true },
      { id: 'right', x: 1050, y: 492, w: 190, h: 18, soft: true },
      { id: 'top', x: 690, y: 356, w: 220, h: 18, soft: true },
    ],
    music: 'chiptune',
  },
  {
    id: 'crypt',
    name: 'The Crypt',
    subtitle: 'The choir has stopped.',
    theme: 'crypt',
    universe: 'chapel',
    blast,
    spawns: [{ x: 670, y: 320 }, { x: 930, y: 320 }],
    platforms: [
      { id: 'main', x: 330, y: 650, w: 940, h: 110, soft: false },
      { id: 'left', x: 465, y: 512, w: 200, h: 20, soft: true },
      { id: 'right', x: 935, y: 512, w: 200, h: 20, soft: true },
      { id: 'top', x: 700, y: 382, w: 200, h: 18, soft: true },
    ],
    music: 'organ',
  },
  {
    id: 'soundstage',
    name: 'Soundstage 6',
    subtitle: 'Mind the painted floor.',
    theme: 'soundstage',
    universe: 'saturday',
    blast,
    spawns: [{ x: 670, y: 320 }, { x: 930, y: 320 }],
    platforms: [
      { id: 'main', x: 290, y: 650, w: 1020, h: 110, soft: false },
      { id: 'left', x: 390, y: 490, w: 230, h: 20, soft: true },
      { id: 'right', x: 980, y: 490, w: 230, h: 20, soft: true },
      { id: 'top', x: 690, y: 348, w: 220, h: 20, soft: true },
    ],
    music: 'cartoon',
  },
  {
    id: 'hangar',
    name: 'Hangar 9',
    subtitle: 'No insignia on the crates.',
    theme: 'hangar',
    universe: 'blacksite',
    blast,
    spawns: [{ x: 670, y: 320 }, { x: 930, y: 320 }],
    platforms: [
      { id: 'main', x: 300, y: 650, w: 1000, h: 110, soft: false },
      { id: 'left', x: 405, y: 500, w: 210, h: 18, soft: true },
      { id: 'right', x: 985, y: 500, w: 210, h: 18, soft: true },
      { id: 'top', x: 700, y: 366, w: 200, h: 18, soft: true },
    ],
    music: 'drone',
  },
];

export const STAGE_BY_ID: Record<string, StageDef> = Object.fromEntries(
  STAGES.map((s) => [s.id, s]),
);

export function stageById(id: string): StageDef {
  return STAGE_BY_ID[id] ?? STAGES[0];
}

/* Which universe gets to bleed into a stage. A mirror match has no Clash. */
export function clashUniverses(
  stageUniverse: string,
  a: string,
  b: string,
): { a: boolean; b: boolean; active: boolean } {
  if (a === b) return { a: false, b: false, active: false };
  return {
    a: a !== stageUniverse,
    b: b !== stageUniverse,
    active: a !== b,
  };
}
