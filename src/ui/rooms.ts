/**
 * The room around the cage (ArenaView draws the cage and the crowd in front of it). Every
 * league has its own room (the canvas style picks it); a fight booked at a special venue
 * (sim/sponsorship.ts venueRoom: a beach, a rooftop, an aircraft carrier, Uncle Dale's barn...)
 * gets that venue's. The art is the band behind the crowd, 480 wide; outdoor rooms paint down
 * to the floor too. roomFx animates the bits that move (waves, neon, searchlights).
 */
import type { Graphics } from 'pixi.js';
import type { Room } from '../sim/sponsorship';

export type { Room };

export interface RoomInfo {
  /** how full the seats are (0..1) and how many rows show */
  fill: number;
  rows: 2 | 4;
  /** moving-head beams over the cage (indoors at night) */
  beams: boolean;
  /** jumbotrons: up in the rig, lower down (a ballroom's rented screens), or none */
  screens: 'high' | 'low' | null;
  /** the LED chase along the top of the fence */
  led: boolean;
  /** daylight: the spotlight cone is faint */
  day?: boolean;
  /** what the crowd wears (orange jumpsuits in the yard, navy on the carrier) */
  shirts?: number[];
  /** the floor round the cage, seen from above */
  top: number;
  /** a sign painted over the room (centred on x) */
  sign?: { text: string; x: number; y: number; color: number };
}

export const ROOMS: Record<Room, RoomInfo> = {
  arena: { fill: 1, rows: 4, beams: true, screens: 'high', led: true, top: 0x1c171b },
  hall: { fill: 0.45, rows: 2, beams: true, screens: null, led: false, top: 0x2a2016 },
  warehouse: { fill: 0.55, rows: 2, beams: true, screens: null, led: false, top: 0x24201e },
  casino: { fill: 0.8, rows: 4, beams: true, screens: 'low', led: true, top: 0x2a1420 },
  lounge: { fill: 0.85, rows: 4, beams: true, screens: 'high', led: true, top: 0x160c1e },
  beach: { fill: 0.5, rows: 2, beams: false, screens: null, led: false, day: true, shirts: [0xe8d8c0, 0x3aa0c8, 0xe86a4a, 0xf0c040, 0x60b070], top: 0xd8c08a },
  rooftop: { fill: 0.55, rows: 2, beams: true, screens: null, led: false, top: 0x3a3a40 },
  carrier: { fill: 0.7, rows: 2, beams: false, screens: null, led: false, day: true, shirts: [0x1e2a4a, 0x2a3a5a, 0xe8e8e0, 0x1e2a4a], top: 0x4a4e54 },
  barn: { fill: 0.5, rows: 2, beams: false, screens: null, led: false, shirts: [0x6a4a2a, 0x3a5a8a, 0x8a2a2a, 0x4a6a3a], top: 0x5a4020, sign: { text: "UNCLE DALE'S", x: 240, y: 22, color: 0xe8d8b0 } },
  yard: { fill: 0.6, rows: 2, beams: false, screens: null, led: false, shirts: [0xe8701e, 0xd8641a, 0xf07a24], top: 0x5a5a5a, sign: { text: 'CHARITY FIGHT NIGHT', x: 240, y: 28, color: 0xf0f0e8 } },
  lot: { fill: 0.4, rows: 2, beams: false, screens: null, led: false, top: 0x26262a, sign: { text: 'WAFFLE HUT', x: 240, y: 19, color: 0x1a1a1a } },
  gym: { fill: 0.6, rows: 2, beams: false, screens: null, led: false, top: 0xa8743a, sign: { text: 'NO DUNKING  •  NO SWEARING', x: 240, y: 29, color: 0x2a3a8a } },
  lanes: { fill: 0.55, rows: 2, beams: true, screens: null, led: false, top: 0x2a1a2a, sign: { text: 'LUCKY STRIKE', x: 240, y: 19, color: 0xff5ab0 } },
  cruise: { fill: 0.55, rows: 2, beams: false, screens: null, led: false, day: true, shirts: [0xf0f0f0, 0xe86aa0, 0x3ac0d8, 0xf0d040, 0x8ad86a], top: 0x8a6a4a },
  lawn: { fill: 0.6, rows: 2, beams: false, screens: null, led: false, day: true, shirts: [0x1a1a22, 0x22222a, 0x2a2a34, 0xe8e8e8], top: 0x3a7a3a },
  hangar: { fill: 0.7, rows: 2, beams: true, screens: null, led: false, shirts: [0x4a5a3a, 0x5a6a44, 0x3e4e32], top: 0x3a3e3a, sign: { text: 'HANGAR 9', x: 240, y: 25, color: 0xe8d040 } },
};

/** The rooms the leagues fight in (by canvas style). */
export function leagueRoom(style: string): Room {
  return style === 'local' ? 'hall' : style === 'bk' ? 'warehouse' : style === 'regional' ? 'casino' : style === 'pfl' ? 'lounge' : 'arena';
}

const W = 480;

/** A cheap repeatable noise (positions and colours that stay put). */
function hash(n: number): number {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

function sky(g: Graphics, top: number, bottom: number, h: number, lerp: (a: number, b: number, t: number) => number): void {
  for (let y = 0; y < h; y += 2) g.rect(0, y, W, 2).fill(lerp(top, bottom, y / h));
}

function palm(g: Graphics, x: number, base: number, lean: number): void {
  for (let i = 0; i < 10; i++) g.rect(Math.round(x + lean * i * i * 0.08), base - i * 4, 4, 5).fill(i % 2 ? 0x6a4a2a : 0x7a5632);
  const tx = Math.round(x + lean * 7.2) + 2;
  const ty = base - 40;
  for (const [dx, dy] of [[-16, 6], [16, 6], [-12, -4], [12, -4], [0, -8], [-20, 12], [20, 12]]) {
    g.moveTo(tx, ty).lineTo(tx + dx, ty + dy).stroke({ color: 0x2a7a3a, width: 3 });
  }
  g.circle(tx - 2, ty + 3, 2).fill(0x5a3a1a).circle(tx + 2, ty + 3, 2).fill(0x5a3a1a);
}

function windows(g: Graphics, x: number, y: number, w: number, h: number, seed: number, lit: number, dark: number): void {
  for (let yy = y + 3; yy < y + h - 2; yy += 5) for (let xx = x + 2; xx < x + w - 3; xx += 5) g.rect(xx, yy, 2, 3).fill(hash(seed + xx * 3.1 + yy * 7.7) > 0.55 ? lit : dark);
}

/** Paint the room. `lerp` is palette.lerpColor (passed in so this file stays art-only). */
export function paintRoom(g: Graphics, room: Room, lerp: (a: number, b: number, t: number) => number, bottom = 144): void {
  /** the ground in front, down to `bottom` (a preview stops at the band) */
  const ground = (y: number, color: number) => {
    if (bottom > y) g.rect(0, y, W, bottom - y).fill(color);
  };
  switch (room) {
    case 'beach': {
      sky(g, 0x4a9ad8, 0xbfe4f4, 40, lerp);
      g.circle(408, 12, 8).fill(0xfff4c0).circle(408, 12, 11).fill({ color: 0xfff4c0, alpha: 0.25 });
      for (const [cx, cy, w] of [[90, 10, 34], [250, 6, 26], [330, 16, 20]]) g.ellipse(cx, cy, w, 4).fill({ color: 0xffffff, alpha: 0.8 }).ellipse(cx + 8, cy - 3, w * 0.5, 3).fill({ color: 0xffffff, alpha: 0.8 });
      g.rect(0, 38, W, 12).fill(0x1e7ab0);
      for (let i = 0; i < 30; i++) g.rect(Math.round(hash(i) * W), 39 + Math.round(hash(i + 50) * 9), 6 + Math.round(hash(i + 9) * 8), 1).fill({ color: 0xbfe8ff, alpha: 0.6 });
      ground(50, 0xe0c890);
      for (let i = 0; i < 80; i++) {
        const y = 52 + Math.round(hash(i + 7) * 80);
        if (y < bottom) g.rect(Math.round(hash(i + 3) * W), y, 1, 1).fill(0xc8ac70);
      }
      palm(g, 14, 58, 1);
      palm(g, 452, 58, -1);
      g.rect(120, 30, 3, 10).fill(0x7a5632).poly([110, 30, 133, 30, 121, 24]).fill(0xe8e0d0); // a lifeguard's umbrella
      return;
    }
    case 'cruise': {
      sky(g, 0x5a3a7a, 0xf09a5a, 36, lerp);
      g.circle(240, 34, 12).fill(0xffc870);
      g.rect(0, 34, W, 10).fill(0x2a3a6a);
      for (let i = 0; i < 20; i++) g.rect(Math.round(hash(i + 1) * W), 35 + Math.round(hash(i + 31) * 8), 8, 1).fill({ color: 0xffb070, alpha: 0.6 });
      ground(44, 0x9a7450); // teak deck
      for (let y = 46; y < Math.min(140, bottom); y += 4) g.rect(0, y, W, 1).fill(0x84623e);
      g.rect(0, 40, W, 2).fill(0xf0f0f0); // the rail
      for (let x = 4; x < W; x += 12) g.rect(x, 40, 1, 8).fill(0xd8d8d8);
      for (const x of [70, 410]) g.circle(x, 46, 5).fill(0xf06a2a).circle(x, 46, 2).fill(0x9a7450).rect(x - 5, 45, 2, 2).fill(0xf0f0f0).rect(x + 3, 45, 2, 2).fill(0xf0f0f0);
      // the water slide nobody is allowed on during the fight
      g.moveTo(8, 4).bezierCurveTo(60, 10, 20, 30, 40, 44).stroke({ color: 0x3ab0e8, width: 5 });
      g.rect(4, 2, 12, 4).fill(0xf0d040);
      // a funnel
      g.rect(440, 4, 26, 30).fill(0xf0f0f0).rect(440, 4, 26, 6).fill(0x2a3a8a).rect(440, 12, 26, 3).fill(0xc82a2a);
      return;
    }
    case 'carrier': {
      sky(g, 0x6a8ab8, 0xe8c8a0, 40, lerp);
      g.rect(0, 38, W, 6).fill(0x2a4a6a);
      ground(44, 0x4a4e54);
      g.rect(0, 52, W, 1).fill(0xe8d040).rect(0, 58, W, 1).fill({ color: 0xf0f0f0, alpha: 0.6 });
      // the island: bridge, mast, radar, the hull number
      g.rect(380, 8, 46, 36).fill(0x6a6e74).rect(384, 12, 38, 4).fill(0x2a3a4a).rect(388, 20, 30, 2).fill(0x2a3a4a);
      g.rect(400, 0, 2, 8).fill(0x3a3e44).rect(392, 2, 18, 1).fill(0x3a3e44);
      g.rect(386, 30, 8, 8).fill(0xf0f0f0).rect(388, 32, 4, 4).fill(0x6a6e74);
      // parked jets: grey arrows with tails
      for (const x of [40, 120, 290]) {
        g.poly([x, 50, x + 30, 46, x + 34, 50, x + 30, 54]).fill(0x8a9098);
        g.poly([x + 10, 50, x + 18, 40, x + 22, 40, x + 20, 50]).fill(0x7a8088);
        g.rect(x + 2, 48, 4, 4).fill(0x6a7078);
      }
      return;
    }
    case 'rooftop': {
      sky(g, 0x070a1a, 0x1a1a3a, 50, lerp);
      for (let i = 0; i < 40; i++) g.rect(Math.round(hash(i + 100) * W), Math.round(hash(i + 200) * 22), 1, 1).fill(0xd8d8f0);
      g.circle(60, 10, 5).fill(0xe8e8d0);
      // the skyline
      let x = 0;
      for (let i = 0; x < W; i++) {
        const w = 18 + Math.round(hash(i + 300) * 26);
        const h = 14 + Math.round(hash(i + 400) * 30);
        g.rect(x, 50 - h, w - 2, h).fill(i % 2 ? 0x141a2a : 0x101522);
        windows(g, x, 50 - h, w - 2, h, i * 17, 0xe8c870, 0x1a2234);
        x += w;
      }
      ground(48, 0x4a4a50); // concrete
      g.rect(0, 48, W, 3).fill(0x5a5a60);
      if (bottom > 60) for (let xx = 10; xx < W; xx += 46) g.rect(xx, 60, 2, Math.min(70, bottom - 60)).fill({ color: 0xe8e8e8, alpha: 0.35 }); // stall lines
      for (const lx of [100, 380]) g.rect(lx, 12, 2, 38).fill(0x2a2a30).rect(lx - 6, 10, 14, 3).fill(0x3a3a40).rect(lx - 4, 13, 10, 1).fill(0xffe8a0);
      return;
    }
    case 'lot': {
      sky(g, 0x060812, 0x141626, 50, lerp);
      // the diner: long low building, lit windows, the yellow sign on a pole
      g.rect(150, 26, 200, 26).fill(0x8a7a5a).rect(150, 24, 200, 4).fill(0x5a4a3a);
      for (let wx = 158; wx < 342; wx += 22) g.rect(wx, 31, 16, 11).fill(0xffe8a0).rect(wx, 31, 16, 2).fill(0xfff4d0);
      g.rect(236, 36, 14, 16).fill(0x3a2a1a);
      g.rect(196, 15, 88, 13).fill(0xf0c818).rect(197, 16, 86, 11).stroke({ color: 0x1a1a1a, width: 1 });
      ground(50, 0x2a2a2e);
      for (let xx = 20; xx < W; xx += 40) g.rect(xx, 54, 2, 12).fill(0xe8e0a0);
      // a pickup with its lights on (somebody's ride home)
      g.rect(30, 38, 50, 12).fill(0x7a1e1e).rect(40, 30, 24, 9).fill(0x6a1a1a).rect(43, 32, 18, 5).fill(0x1a2a3a);
      g.circle(40, 50, 4).fill(0x101010).circle(70, 50, 4).fill(0x101010);
      g.rect(78, 41, 3, 3).fill(0xfff4c0);
      g.rect(420, 6, 2, 46).fill(0x3a3a40).rect(414, 4, 14, 3).fill(0x4a4a50).rect(416, 7, 10, 1).fill(0xfff0b0); // street lamp
      return;
    }
    case 'barn': {
      g.rect(0, 0, W, 60).fill(0x6a3a22);
      for (let xx = 0; xx < W; xx += 10) g.rect(xx, 0, 1, 60).fill(0x4e2a18);
      for (let y = 0; y < 60; y += 20) for (let xx = 0; xx < W; xx += 30) g.rect(xx + 4, y + 9, 1, 1).fill(0x3a2010); // nail heads
      g.rect(180, 18, 120, 14).fill(0xd8d0b8).rect(181, 19, 118, 12).fill(0x8a2a1a); // the hand-painted sign
      g.poly([0, 0, 60, 0, 0, 24]).fill(0x4e2a18).poly([W, 0, W - 60, 0, W, 24]).fill(0x4e2a18); // rafters
      // hay bales stacked at both ends
      for (const [bx, by] of [[6, 42], [36, 42], [20, 30], [404, 42], [434, 42], [418, 30]]) {
        g.rect(bx, by, 30, 12).fill(0xd8b050).rect(bx, by + 4, 30, 1).fill(0xb08a30).rect(bx, by + 8, 30, 1).fill(0xb08a30);
        g.rect(bx + 9, by, 1, 12).fill(0x8a6a2a).rect(bx + 20, by, 1, 12).fill(0x8a6a2a);
      }
      // a stall window and the goat who watches every fight with judgement
      g.rect(80, 12, 30, 24).fill(0x1a0e08).rect(80, 12, 30, 2).fill(0x8a5a3a);
      g.rect(88, 20, 14, 10).fill(0xe8e4dc).rect(90, 30, 10, 3).fill(0xe8e4dc); // head, long face
      g.rect(89, 15, 2, 5).fill(0x9a9088).rect(99, 15, 2, 5).fill(0x9a9088); // horns
      g.rect(84, 21, 4, 2).fill(0xe8e4dc).rect(102, 21, 4, 2).fill(0xe8e4dc); // ears out sideways
      g.rect(91, 23, 2, 2).fill(0xd8a020).rect(97, 23, 2, 2).fill(0xd8a020).rect(91, 24, 2, 1).fill(0x1a1a1a).rect(97, 24, 2, 1).fill(0x1a1a1a); // those eyes
      g.rect(94, 33, 2, 4).fill(0xc8c0b4); // the beard
      for (const lx of [150, 330]) g.rect(lx, 0, 1, 18).fill(0x2a2a2a).rect(lx - 3, 18, 7, 6).fill(0x3a2a1a).rect(lx - 2, 19, 5, 4).fill(0xffd070);
      ground(58, 0x5a4020);
      return;
    }
    case 'yard': {
      sky(g, 0x8a9aa8, 0xb8c0c8, 30, lerp);
      g.rect(0, 20, W, 40).fill(0x7a7870); // the wall
      for (let y = 22; y < 60; y += 6) for (let xx = (y / 6) % 2 ? 0 : 10; xx < W; xx += 20) g.rect(xx, y, 19, 5).fill(0x84827a);
      // the fence in front of it, with razor wire
      g.rect(0, 14, W, 1).fill(0x5a5a5a);
      for (let xx = 0; xx < W; xx += 6) g.circle(xx + 3, 12, 3).stroke({ color: 0xa8a8b0, width: 1 });
      for (let xx = 0; xx < W; xx += 60) g.rect(xx, 12, 2, 48).fill(0x5a5a5a);
      // guard tower
      g.rect(420, 0, 34, 22).fill(0x5a5a5e).rect(424, 4, 26, 8).fill(0x1a2030).rect(416, 0, 42, 3).fill(0x3a3a3e);
      g.rect(432, 22, 4, 38).fill(0x4a4a4e).rect(444, 22, 4, 38).fill(0x4a4a4e);
      g.rect(140, 24, 200, 13).fill(0x2a4a8a); // the banner (the sign goes on it)
      ground(58, 0x6a6a66);
      return;
    }
    case 'gym': {
      g.rect(0, 0, W, 60).fill(0xd8ccb0); // painted cinderblock
      for (let y = 0; y < 60; y += 6) for (let xx = (y / 6) % 2 ? 0 : 8; xx < W; xx += 16) g.rect(xx, y, 15, 5).fill(0xe2d6bc);
      g.rect(0, 36, W, 3).fill(0x2a3a8a).rect(0, 39, W, 2).fill(0xc8a030);
      for (const x of [60, 420]) {
        g.rect(x - 16, 4, 32, 20).fill(0xf0f0f0).rect(x - 16, 4, 32, 20).stroke({ color: 0x8a2a2a, width: 1 });
        g.rect(x - 6, 14, 12, 8).stroke({ color: 0x8a2a2a, width: 1 });
        g.rect(x - 7, 24, 14, 2).fill(0xe86a1a);
        for (let k = 0; k < 4; k++) g.rect(x - 6 + k * 4, 26, 1, 6).fill(0xe8e8e8);
      }
      g.rect(150, 26, 180, 11).fill(0xf0ece0); // the banner (the sign goes on it)
      for (const x of [140, 240, 340]) g.rect(x, 0, 60, 2).fill(0xf0f4ff).rect(x, 2, 60, 1).fill(0xa0a8b0); // tube lights
      ground(58, 0xb8844a);
      if (bottom > 58) for (let xx = 0; xx < W; xx += 14) g.rect(xx, 58, 1, bottom - 58).fill(0xa47440);
      return;
    }
    case 'lanes': {
      g.rect(0, 0, W, 60).fill(0x140a18);
      // the pin decks across the back wall, lane by lane
      for (let i = 0; i < 12; i++) {
        const x = 4 + i * 40;
        g.rect(x, 26, 36, 24).fill(0x2a1a10).rect(x + 2, 42, 32, 8).fill(0xc89a5a);
        for (const [px, py] of [[17, 0], [13, 3], [21, 3], [9, 6], [17, 6], [25, 6]]) g.rect(x + px, 34 + py, 2, 4).fill(0xf8f8f0).rect(x + px, 35 + py, 2, 1).fill(0xd82a2a);
        g.rect(x, 18, 36, 7).fill(0x0a0a14).rect(x + 2, 19, 32, 5).fill(i % 3 === 0 ? 0x2a4ad8 : 0x1a2a6a);
      }
      g.rect(0, 14, W, 2).fill(0xff5ab0).rect(0, 52, W, 1).fill(0x5ad8ff);
      g.rect(196, 16, 88, 10).fill(0x0a0a14).rect(196, 16, 88, 10).stroke({ color: 0xff5ab0, width: 1 }); // the neon sign's panel
      ground(58, 0x2a1a2a);
      return;
    }
    case 'lawn': {
      sky(g, 0x6aa8e0, 0xd8ecf8, 40, lerp);
      // the big white house with the columns
      g.rect(150, 10, 180, 34).fill(0xf4f2ec).rect(150, 10, 180, 3).fill(0xe0ddd4);
      g.poly([190, 10, 290, 10, 240, 0]).fill(0xf8f6f0);
      for (let k = 0; k < 9; k++) g.rect(160 + k * 20, 14, 4, 30).fill(0xe4e0d6);
      for (let k = 0; k < 8; k++) g.rect(168 + k * 20, 20, 6, 8).fill(0x3a4a5a);
      g.rect(238, 0, 1, 6).fill(0x5a5a5a).rect(239, 0, 7, 4).fill(0xc82a2a);
      ground(40, 0x4a9a4a);
      for (let i = 0; i < 70; i++) {
        const y = 42 + Math.round(hash(i + 90) * 90);
        if (y < bottom) g.rect(Math.round(hash(i + 70) * W), y, 2, 1).fill(0x3a8a3a);
      }
      for (const x of [30, 90, 390, 450]) g.circle(x, 30, 12).fill(0x2a6a2a).rect(x - 1, 38, 3, 6).fill(0x5a3a1a); // hedges and trees
      return;
    }
    case 'hangar': {
      g.rect(0, 0, W, 60).fill(0x3a3e38);
      for (let xx = 0; xx < W; xx += 30) g.moveTo(xx, 0).lineTo(xx + 30, 20).stroke({ color: 0x2a2e28, width: 2 }); // trusses
      g.rect(0, 20, W, 2).fill(0x2a2e28);
      // the big doors, half open on the night
      g.rect(150, 22, 180, 36).fill(0x0a0e18);
      for (let i = 0; i < 18; i++) g.rect(150 + Math.round(hash(i + 500) * 178), 24 + Math.round(hash(i + 600) * 14), 1, 1).fill(0xd8d8f0);
      g.rect(120, 22, 30, 36).fill(0x4a4e46).rect(330, 22, 30, 36).fill(0x4a4e46);
      // a parked helicopter, an American flag the size of a house
      g.rect(30, 38, 40, 12).fill(0x4a5a3a).rect(70, 42, 30, 3).fill(0x4a5a3a).rect(14, 34, 72, 2).fill(0x2a2e28).rect(40, 50, 24, 2).fill(0x2a2e28);
      g.rect(380, 24, 80, 30).fill(0xe8e8e8);
      for (let k = 0; k < 7; k++) g.rect(380, 24 + k * 4 + (k > 3 ? 2 : 0), 80, 2).fill(0xc82a2a);
      g.rect(380, 24, 32, 16).fill(0x2a3a8a);
      for (const x of [60, 240, 420]) g.rect(x, 0, 1, 10).fill(0x1a1a1a).rect(x - 8, 10, 16, 4).fill(0x2a2a2a).rect(x - 6, 14, 12, 1).fill(0xfff0c0);
      ground(58, 0x3a3e3a);
      return;
    }
    default:
      paintLeagueRoom(g, room);
  }
}

/** The leagues' own rooms: the CBFC's arena, the Lounge, a casino ballroom, a bingo hall, a warehouse. */
function paintLeagueRoom(g: Graphics, style: Room): void {
    const rig = (n: number, col = 0xe8d8a0) => {
      g.rect(0, 14, W, 2).fill(0x2a2228);
      for (let i = 0; i < n; i++) {
        const x = 18 + i * (W / n);
        g.rect(x, 10, 12, 5).fill(0x3a3032).rect(x + 3, 15, 6, 2).fill(col);
      }
    };
    if (style === 'hall') {
      // a bingo hall on fight night: wood panelling, the number board, strip lights, folding chairs
      g.rect(0, 0, W, 60).fill(0x3a2a1a);
      for (let x = 0; x < W; x += 12) g.rect(x, 0, 1, 60).fill(0x2e2114);
      g.rect(0, 58, W, 3).fill(0x24180e);
      g.rect(W / 2 - 70, 2, 140, 18).fill(0x0c0c0e);
      for (let c = 0; c < 15; c++) for (let r = 0; r < 3; r++) g.rect(W / 2 - 66 + c * 9, 5 + r * 5, 7, 3).fill((c * 3 + r * 7) % 5 === 0 ? 0xffd860 : 0x2a2a20);
      for (const x of [60, 180, 300, 420]) g.rect(x, 1, 50, 2).fill(0xe8f0ff).rect(x, 3, 50, 1).fill(0x8a9098);
      g.rect(30, 24, 70, 14).fill(0x8e2f2f).rect(W - 100, 24, 70, 14).fill(0x2a4a86); // paper banners
      return;
    }
    if (style === 'warehouse') {
      // a warehouse: brick, roller doors, bare bulbs on cords, a forklift nobody moved
      g.rect(0, 0, W, 60).fill(0x3a2420);
      for (let y = 0; y < 60; y += 6) for (let x = (y / 6) % 2 ? -8 : 0; x < W; x += 16) g.rect(x + 1, y + 1, 14, 4).fill(((x + y) % 5) ? 0x4a2c26 : 0x40261f);
      for (const x of [40, W - 120]) {
        g.rect(x, 10, 80, 50).fill(0x5a5a62);
        for (let y = 12; y < 60; y += 4) g.rect(x, y, 80, 1).fill(0x46464e);
      }
      for (let i = 0; i < 8; i++) {
        const x = 30 + i * 60;
        g.rect(x, 0, 1, 12 + (i % 3) * 4).fill(0x1a1a1a).circle(x, 13 + (i % 3) * 4, 2).fill(0xffe8a0);
      }
      return;
    }
    if (style === 'casino') {
      // a casino ballroom: chandeliers, swagged curtains, a carpet only a casino could love
      g.rect(0, 0, W, 60).fill(0x3a1424);
      for (let x = 0; x < W; x += 20) g.rect(x, 0, 10, 60).fill(0x42182a);
      for (let x = 0; x < W; x += 40) g.poly([x, 0, x + 40, 0, x + 20, 8]).fill(0x8a2a3a);
      for (const cx of [80, W / 2, W - 80]) {
        g.rect(cx, 0, 1, 6).fill(0xc4a04a);
        for (let k = -3; k <= 3; k++) g.circle(cx + k * 5, 9 + Math.abs(k), 1.5).fill(0xfff2c8);
        g.rect(cx - 14, 8, 28, 1).fill(0xc4a04a);
      }
      g.rect(150, 14, 60, 9).fill(0x0e1420).rect(270, 14, 60, 9).fill(0x0e1420); // rented screens
      return;
    }
    if (style === 'lounge') {
      // the Lounge: smaller room, purple neon, a VIP couch row, cameras everywhere
      g.rect(0, 0, W, 60).fill(0x140a1c);
      g.rect(0, 18, W, 1).fill(0xb04aff).rect(0, 46, W, 1).fill(0x4a2aff);
      for (let x = 20; x < W; x += 70) g.roundRect(x, 48, 40, 10, 3).fill(0x5a2a6a);
      for (const x of [100, W - 110]) g.rect(x, 22, 10, 7).fill(0x2a2a30).rect(x + 10, 24, 5, 3).fill(0x1a1a1e).circle(x + 3, 25, 1).fill(0xff2020);
      rig(8, 0xd8b0ff);
      g.rect(150, 1, 60, 8).fill(0x0e1420).rect(270, 1, 60, 8).fill(0x0e1420);
      return;
    }
    // the CBFC: a proper arena. Championship banners in the rafters, the lighting rig, the big screens
    rig(10);
    for (let i = 0; i < 6; i++) {
      const x = 22 + i * 82 + (i > 2 ? 40 : 0);
      if (x > 140 && x < 340) continue;
      g.rect(x, 0, 14, 12).fill(i % 2 ? 0x8e2f2f : 0x1a2a4a).rect(x + 4, 4, 6, 3).fill(0xc4a04a).poly([x, 12, x + 14, 12, x + 7, 15]).fill(i % 2 ? 0x8e2f2f : 0x1a2a4a);
    }
    g.rect(150, 1, 60, 8).fill(0x0e1420).rect(270, 1, 60, 8).fill(0x0e1420);
}

/** What moves in the room (drawn on the lights layer every frame). */
export function roomFx(l: Graphics, room: Room, t: number): void {
  switch (room) {
    case 'beach':
    case 'cruise': {
      const base = room === 'beach' ? 40 : 36;
      for (let i = 0; i < 8; i++) {
        const x = (hash(i + 700) * W + t * (6 + i)) % W;
        l.rect(Math.round(x), base + (i % 4) * 2, 10, 1).fill({ color: 0xffffff, alpha: 0.5 });
      }
      const gx = (t * 18) % (W + 40) - 20; // a gull
      l.moveTo(gx - 3, 16).lineTo(gx, 18 + Math.round(Math.sin(t * 8))).lineTo(gx + 3, 16).stroke({ color: 0x2a2a2a, width: 1 });
      return;
    }
    case 'carrier': {
      const a = t * 2;
      l.rect(Math.round(401 + Math.cos(a) * 6) - 1, 1, 2, 2).fill(0xd8d8d8);
      if (Math.sin(t * 3) > 0.6) l.rect(400, 0, 2, 1).fill(0xff3030);
      return;
    }
    case 'rooftop':
    case 'lot': {
      // red lights on the towers blink; the diner sign hums
      if (room === 'rooftop') for (let i = 0; i < 6; i++) if (Math.sin(t * 2 + i * 1.3) > 0.5) l.rect(Math.round(hash(i + 900) * W), 6 + i * 3, 2, 1).fill(0xff3030);
      if (room === 'lot' && Math.sin(t * 13) > -0.9) l.rect(194, 13, 92, 17).fill({ color: 0xffe860, alpha: 0.12 });
      return;
    }
    case 'barn': {
      for (const lx of [150, 330]) l.circle(lx, 21, 7 + Math.sin(t * 9 + lx) * 1.2).fill({ color: 0xffc860, alpha: 0.12 });
      return;
    }
    case 'yard': {
      // the tower's searchlight sweeps the crowd
      const x = 240 + Math.sin(t * 0.6) * 200;
      l.poly([436, 8, 440, 8, x + 18, 60, x - 18, 60]).fill({ color: 0xfff8d8, alpha: 0.08 });
      l.ellipse(x, 58, 18, 3).fill({ color: 0xfff8d8, alpha: 0.12 });
      return;
    }
    case 'lanes': {
      const i = Math.floor(t * 0.7) % 12; // somebody's always bowling a strike
      l.rect(4 + i * 40 + 2, 19, 32, 5).fill({ color: 0xff5ab0, alpha: 0.5 + 0.5 * Math.sin(t * 10) });
      return;
    }
    case 'hangar': {
      if (Math.sin(t * 1.7) > 0.7) l.rect(0, 0, W, 60).fill({ color: 0xffffff, alpha: 0.03 });
      return;
    }
    default:
      return;
  }
}
