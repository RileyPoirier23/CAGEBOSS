/**
 * QUICK FIGHT: pick any two fighters from the roster and fight it out hands-on.
 * Against the CPU, local 2-player versus (two controllers, a controller and the
 * keyboard, or both of you on one keyboard), or, inside the Discord Activity, 2-player
 * online against the other person in it (src/net/duel.ts). Nothing is saved; nobody's
 * career is touched.
 */
import { Graphics } from 'pixi.js';
import { isConsole, isTouchDevice } from '../../core/platform';
import { Scene } from '../app';
import type { Bout, FightEvent, FightResult, Fighter, GameState } from '../../core/types';
import { PAL } from '../../art/palette';
import { W, H, SW, OX, text, button, box } from '../kit';
import { selector, alertBox } from '../widgets';
import { fighterPortrait } from '../sprites';
import { createNewGame } from '../../sim/newgame';
import { makeBout, officialsFor } from '../../sim/events';
import { DIVISION_ORDER, divisionName } from '../../sim/divisions';
import { overall } from '../../sim/fighters';
import { record } from '../../core/format';
import { content } from '../../core/content';
import { sponsorColor, venueRoom } from '../../sim/sponsorship';
import { ROOMS, leagueRoom, paintRoom, type Room } from '../rooms';
import { lerpColor } from '../../art/palette';
import { openLiveFight } from '../livefight';
import { input } from '../../core/input';
import { Rng } from '../../core/rng';
import type { KeyboardShare } from '../../core/fightinput';
import type { CanvasStyle } from '../arena';
import { sfx } from '../../audio/sfx';
import { unlockedStoryFighters } from '../../sim/cast';
import { duel, type DuelMsg, type Role } from '../../net/duel';

type Mode = 'cpu' | 'versus' | 'online';

/** Where the fight is: the leagues' rooms and the venues nobody should have booked. */
interface QFVenue {
  label: string;
  /** data/venues id (its name and blurb); none for the warehouse */
  venue?: string;
  style: CanvasStyle;
  logo?: string;
  bare?: boolean;
  event: string;
}
const VENUES: QFVenue[] = [
  { label: 'The Ape-X', venue: 'ape_x', style: 'cbfc', event: 'CBFC Exhibition' },
  { label: 'The Lounge', venue: 'nightclub', style: 'pfl', logo: 'PFL LOUNGE', event: 'Lounge Fight Night' },
  { label: 'Casino Ballroom', venue: 'casino_ballroom', style: 'regional', logo: 'LUCKY BUCK', event: 'Lucky Buck Brawl' },
  { label: 'VFW Hall', venue: 'vfw_hall', style: 'local', logo: 'POST 1138', event: 'Bingo Night Fights' },
  { label: 'Warehouse', style: 'bk', logo: 'BAREKNUCKLE', bare: true, event: 'Bareknuckle Exhibition' },
  { label: 'Fight Island', venue: 'fight_island', style: 'cbfc', event: 'Fight Island Exhibition' },
  { label: 'USS Sponsorship', venue: 'aircraft_carrier', style: 'cbfc', event: 'Fleet Week Fights' },
  { label: 'Rooftop', venue: 'rooftop', style: 'regional', logo: 'LEVEL 7', event: 'Rooftop Rumble' },
  { label: "Dale's Barn", venue: 'barn', style: 'local', logo: "DALE'S", event: "Uncle Dale's Barn Burner" },
  { label: 'The Yard', venue: 'prison_yard', style: 'local', logo: 'GOOD BEHAVIOR', event: 'Charity Fight Night' },
  { label: 'Waffle Hut Lot', venue: 'waffle_lot', style: 'local', logo: 'MIDNIGHT', event: 'Midnight Waffle Brawl' },
  { label: 'Church Gym', venue: 'church_gym', style: 'regional', logo: 'EAGLES', event: 'Fellowship Fight Night' },
  { label: 'Bowling Alley', venue: 'bowling_alley', style: 'regional', logo: 'LUCKY STRIKE', event: 'Lanes & Brawl' },
  { label: 'Cruise Deck', venue: 'cruise_ship', style: 'pfl', logo: 'AT SEA', event: 'Fights At Sea' },
  { label: 'The Big Lawn', venue: 'white_house_lawn', style: 'cbfc', event: 'Fights On The Lawn' },
  { label: 'Hangar 9', venue: 'military_base', style: 'cbfc', event: 'Troops Fight Night' },
];
const roomOf = (v: QFVenue): Room => (v.venue && venueRoom(v.venue)) || leagueRoom(v.style);
type Plan = 'balanced' | 'pressure' | 'counter' | 'wrestle';
/** Online: the fight the host starts, sent to the guest so both build the same one. */
interface OnlineSpec {
  a: string;
  b: string;
  rounds: 3 | 5;
  venue: number;
  seed: number;
  judges: string[];
  referee: string;
  sponsors: string[];
  at: number;
}
/** The other player's corner, as they last said. */
interface Them {
  /** on the Quick Fight screen with 2P online picked */
  on: boolean;
  pick: string | null;
  ready: boolean;
}
const NOBODY: Them = { on: false, pick: null, ready: false };

let world: GameState | null = null;
/** A throwaway world with the full roster (built once per session). */
function roster(): GameState {
  if (!world) world = createNewGame({ seed: 1606, mode: 'sandbox', difficulty: 'normal', promotionName: 'Cage Boss Fighting Championship', presidentName: 'Dane Whyte' });
  return world;
}

export class QuickFightScene extends Scene {
  music = 'title' as const;
  /** the first visit: the QUICK FIGHT lesson (src/ui/guidelessons.ts) */
  tutorialKey = 'quickfight';
  private div = 'light';
  private pick: [number, number] = [0, 1];
  private mode: Mode = 'cpu';
  private rounds: 3 | 5 = 3;
  private venue = 0;
  private cpu: Plan = 'balanced';
  /** online: the relay link (null outside the Discord Activity), the other corner, and our READY */
  private link = duel();
  private them: Them = { ...NOBODY };
  private ready = false;
  private sent = '';
  private unLink: (() => void) | null = null;

  enter(): void {
    // someone else is already here: straight to 2P online
    if (this.link?.peer) this.mode = 'online';
    if (this.link) this.unLink = this.link.on((m) => this.onNet(m));
    super.enter();
  }

  exit(): void {
    this.unLink?.();
    this.unLink = null;
    this.ready = false;
    this.mode = 'cpu';
    this.share();
  }

  /** Online: your corner (the host is red, the guest blue). */
  private get me(): 0 | 1 {
    return this.link?.role === 'guest' ? 1 : 0;
  }

  private list(): Fighter[] {
    const s = roster();
    if (this.div === 'story' && this.mode !== 'online') {
      // the Road To Champion bosses you've beaten (and Han)
      const out = unlockedStoryFighters();
      for (const f of out) s.fighters[f.id] = f;
      return out;
    }
    const ranked = (s.rankings[this.div] ?? []).map((id) => s.fighters[id]).filter(Boolean);
    const rest = Object.values(s.fighters)
      .filter((f) => f.division === this.div && f.status !== 'retired' && !ranked.includes(f))
      .sort((a, b) => overall(b.skills) - overall(a.skills));
    return [...ranked, ...rest].slice(0, 40);
  }

  /** phones: the corners move out to the screen's real edges */
  private get FW(): number {
    return isTouchDevice() ? SW : W;
  }

  build(): void {
    const r = this.root;
    const FW = this.FW;
    r.x = FW === W ? 0 : -OX;
    const bg = new Graphics().rect(0, 0, FW, H).fill(0x15121a);
    for (let y = 0; y < H; y += 6) bg.rect(0, y, FW, 1).fill({ color: 0x000000, alpha: 0.25 });
    r.addChild(bg);
    r.addChild(text('QUICK FIGHT', 0, 6, { width: FW, align: 'center', color: PAL.gold, scale: 2 }));
    r.addChild(text('Any two fighters. No careers on the line. Probably some brain damage.', 0, 24, { width: FW, align: 'center', small: true, color: PAL.ash }));
    const fighters = this.list();
    const online = this.mode === 'online';
    this.pick = [Math.min(this.pick[0], fighters.length - 1), Math.min(this.pick[1], fighters.length - 1)];
    if (this.pick[0] === this.pick[1] && !online) this.pick[1] = (this.pick[0] + 1) % fighters.length;
    // the two corners (online: yours to pick, theirs as they pick it on their screen)
    for (const side of [0, 1] as const) {
      const x = side === 0 ? 8 : FW - 172;
      const theirs = online && side !== this.me;
      const f = theirs ? this.theirFighter() : fighters[this.pick[side]];
      r.addChild(box(164, 150, PAL.night, side === 0 ? 0x9e2a2a : 0x284a86, { bevel: true })).position.set(x, 36);
      const who = online ? (theirs ? (this.them.ready ? 'THEM  •  READY' : 'THEM') : 'YOU') : this.mode === 'versus' ? (side === 0 ? 'P1' : 'P2') : side === 0 ? 'YOU' : 'CPU';
      r.addChild(text(`${side === 0 ? 'RED' : 'BLUE'} CORNER  •  ${who}`, x + 6, 40, { small: true, color: side === 0 ? 0xd86a6a : 0x6a8ad8 }));
      if (theirs && !f) r.addChild(text(this.link?.peer ? 'Picking...' : 'Nobody else in this Activity yet.', x + 8, 92, { width: 148, align: 'center', small: true, color: PAL.ash, maxLines: 3 }));
      if (!f) continue;
      const por = fighterPortrait(f, 64);
      por.position.set(x + 50, 50);
      r.addChild(por);
      r.addChild(text(`${f.first} ${f.last}`.toUpperCase(), x + 4, 118, { width: 156, align: 'center', color: PAL.bone, maxLines: 1 }));
      r.addChild(text(f.nick ? `"${f.nick}"` : ' ', x + 4, 129, { width: 156, align: 'center', small: true, color: PAL.gold, maxLines: 1 }));
      r.addChild(text(`${record(f.record)}  •  OVR ${Math.round(overall(f.skills))}  •  ${f.country}`, x + 4, 139, { width: 156, align: 'center', small: true, color: PAL.ash, maxLines: 1 }));
      if (theirs) continue;
      r.addChild(selector(x + 6, 152, 152, fighters.map((x2, i) => ({ value: i, label: `${x2.first[0]}. ${x2.last}` })), this.pick[side], (v) => { this.pick[side] = v; this.refresh(); }));
      r.addChild(button('RANDOM', x + 6, 168, 74, 13, () => { this.pick[side] = Math.floor(Math.random() * fighters.length); this.refresh(); }, { small: true, fill: PAL.shadow }));
      r.addChild(button('VS ANYONE', x + 84, 168, 74, 13, () => this.anyone(side), { small: true, fill: PAL.shadow }));
    }
    // the middle: settings
    const mx = Math.round((FW - 120) / 2);
    const row = (label: string, y: number) => r.addChild(text(label, mx, y + 3, { small: true, color: PAL.ash }));
    row('DIVISION', 40);
    const divOpts = DIVISION_ORDER.map((d) => ({ value: d, label: divisionName(d) }));
    // story fighters are yours alone (the other player may not have them): not online
    if (unlockedStoryFighters().length >= 2 && !online) divOpts.unshift({ value: 'story', label: 'Story fighters' });
    r.addChild(selector(mx + 40, 40, 80, divOpts, this.div, (v) => { this.div = v; this.pick = [0, 1]; this.refresh(); }));
    if (unlockedStoryFighters().length < 2) r.addChild(text('Beat Road To Champion chapters to unlock its fighters here.', mx, 172, { small: true, width: 120, color: PAL.grey, maxLines: 2 }));
    row('PLAYERS', 58);
    const modes = [{ value: 'cpu' as Mode, label: '1P vs CPU' }, { value: 'versus' as Mode, label: '2P versus' }];
    if (this.link) modes.push({ value: 'online' as Mode, label: '2P online' });
    r.addChild(selector(mx + 40, 58, 80, modes, this.mode, (v) => {
      this.mode = v;
      this.ready = false;
      if (v === 'online' && this.div === 'story') {
        this.div = 'light';
        this.pick = [0, 1];
      }
      this.refresh();
    }));
    row('ROUNDS', 76);
    // online: the host picks the rounds and the room
    if (online && this.me === 1) r.addChild(text(`${this.rounds} (their call)`, mx + 42, 79, { small: true, color: PAL.bone }));
    else r.addChild(selector(mx + 40, 76, 80, [{ value: 3 as const, label: '3 rounds' }, { value: 5 as const, label: '5 rounds' }], this.rounds, (v) => { this.rounds = v; this.share(); }));
    if (this.mode === 'cpu') {
      row('CPU PLAN', 94);
      r.addChild(selector(mx + 40, 94, 80, [{ value: 'balanced' as Plan, label: 'Balanced' }, { value: 'pressure' as Plan, label: 'Pressure' }, { value: 'counter' as Plan, label: 'Counter' }, { value: 'wrestle' as Plan, label: 'Wrestle' }], this.cpu, (v) => (this.cpu = v)));
    }
    r.addChild(text(online ? this.onlineNote() : this.controlsNote(), mx, online ? 96 : 114, { small: true, width: 120, color: online ? PAL.bone : PAL.ash, maxLines: online ? 10 : 8 }));
    this.venuePanel();
    r.addChild(button('← BACK', 8, H - 20, 60, 14, () => void import('./title').then((m) => this.g.goto(new m.TitleScene(this.g))), { small: true }));
    if (online && this.me === 1) {
      const can = !!this.link?.peer && this.them.on;
      r.addChild(button(this.ready ? 'READY!' : 'READY', FW / 2 - 50, H - 24, 100, 18, () => { this.ready = !this.ready; this.refresh(); }, { fill: this.ready ? PAL.moss : PAL.blood, disabled: !can }));
    } else r.addChild(button('FIGHT!', FW / 2 - 50, H - 24, 100, 18, () => this.fight(), { fill: PAL.blood, disabled: online && !this.canStart() }));
    this.share();
  }

  // ------------------------------------------------------------ online

  private theirFighter(): Fighter | null {
    return (this.them.pick && roster().fighters[this.them.pick]) || null;
  }

  /** Host: both corners picked and the guest is ready. */
  private canStart(): boolean {
    return this.link?.status === 'open' && this.link.peer && this.them.on && this.them.ready && !!this.theirFighter() && !!this.list()[this.pick[0]];
  }

  private onlineNote(): string {
    const l = this.link;
    if (!l || l.status === 'connecting') return 'Connecting to the 2-player server...';
    if (l.status === 'full') return 'Two people are already fighting in this Activity. 1P vs CPU still works.';
    if (l.status === 'offline') return "Can't reach the 2-player server right now. 1P vs CPU still works.";
    if (!l.peer) return 'Waiting for a second player. Anyone who joins this Activity and opens CAGE BOSS can fight you here.';
    if (!this.them.on) return 'They are in CAGE BOSS: they need QUICK FIGHT, then PLAYERS: 2P online.';
    if (this.me === 0) return this.them.ready ? 'They are ready. FIGHT! when you are.' : "Pick your fighter. FIGHT! lights up when they're READY. You pick the rounds and the room.";
    return this.ready ? 'Ready. They start the fight.' : 'Pick your fighter, then READY. They pick the rounds and the room.';
  }

  /** Tell the other player what's on your screen (only when it changed). */
  private share(): void {
    const l = this.link;
    if (!l) return;
    const on = this.mode === 'online';
    const f = on ? this.list()[this.pick[this.me]] : null;
    const m = { t: 'lobby', on, pick: f?.id ?? null, ready: on && this.me === 1 && this.ready, rounds: this.rounds, venue: this.venue };
    const key = JSON.stringify(m);
    if (key === this.sent || !l.peer) return;
    this.sent = key;
    l.send(m);
  }

  private onNet(m: DuelMsg): void {
    if (m.t === 'lobby') {
      // they just got to this screen: they need your corner too
      if (m.on && !this.them.on) this.sent = '';
      this.them = { on: !!m.on, pick: typeof m.pick === 'string' ? m.pick : null, ready: !!m.ready };
      if (this.me === 1 && m.on) {
        if (m.rounds === 3 || m.rounds === 5) this.rounds = m.rounds;
        if (typeof m.venue === 'number' && VENUES[m.venue]) this.venue = m.venue;
      }
    } else if (m.t === 'peer') {
      this.them = { ...NOBODY };
      this.sent = '';
      if (m.here && this.mode !== 'online') this.g.toast('Someone joined the Activity: PLAYERS, 2P online to fight them', PAL.gold, { small: true });
    } else if (m.t === 'hello' || m.t === 'role' || m.t === 'status') {
      this.ready = false;
      this.sent = '';
    } else if (m.t === 'start') {
      if (this.me === 1 && this.mode === 'online' && !this.g.inLiveFight) this.startOnline(m.spec as OnlineSpec, 'guest');
      return;
    } else return;
    if (!this.g.inLiveFight) this.refresh();
  }

  /** Host: FIGHT! Send the fight to the guest, then both start it. */
  private hostOnline(): void {
    if (!this.canStart()) return;
    const A = this.list()[this.pick[0]];
    const B = this.theirFighter()!;
    if (A.id === B.id) return alertBox(this.g, 'Same fighter', 'You both picked the same fighter. One of you pick somebody else.');
    const rng = new Rng(Date.now() & 0xffffff);
    const { ev } = this.card(A, B, 'qf_pick');
    const off = officialsFor(roster(), ev, rng);
    const spec: OnlineSpec = {
      a: A.id, b: B.id, rounds: this.rounds, venue: this.venue, seed: rng.int(1, 1e9), at: Date.now(),
      judges: off.judges.map((j) => j.name), referee: off.referee.name,
      sponsors: rng.sample(content().sponsors, 5).map((x) => x.name.replace(/ \(.*\)$/, '')),
    };
    this.link!.send({ t: 'start', spec });
    this.startOnline(spec, 'host');
  }

  /** Both: the same fight on both screens, from the host's spec. */
  private startOnline(raw: OnlineSpec, role: Role): void {
    const s = roster();
    const str = (x: unknown) => String(x ?? '').slice(0, 60);
    const spec: OnlineSpec = {
      a: str(raw?.a), b: str(raw?.b), rounds: raw?.rounds === 5 ? 5 : 3, venue: Number(raw?.venue) | 0, seed: Number(raw?.seed) | 0, at: Number(raw?.at) || Date.now(),
      judges: (Array.isArray(raw?.judges) ? raw.judges : []).slice(0, 3).map(str), referee: str(raw?.referee), sponsors: (Array.isArray(raw?.sponsors) ? raw.sponsors : []).slice(0, 6).map(str),
    };
    const A = s.fighters[spec.a];
    const B = s.fighters[spec.b];
    if (!A || !B || !VENUES[spec.venue]) return alertBox(this.g, 'Online fight', "Your two games don't match. One of you needs to reload CAGE BOSS to get the latest version.");
    this.rounds = spec.rounds;
    this.venue = spec.venue;
    // after this fight, both READY again for the next
    this.ready = false;
    this.them.ready = false;
    const v = VENUES[spec.venue];
    const { ev, bout } = this.card(A, B, 'qf_online_' + spec.at);
    sfx('bell');
    const prev = this.g.state;
    this.g.state = s;
    openLiveFight(this.g, {
      bout, A, B, skills: [A.skills, B.skills], player: role === 'host' ? 0 : 1, plan: 'balanced', oppPlan: 'balanced', cutTier: 2, seed: spec.seed,
      event: ev.name, judges: spec.judges, referee: spec.referee,
      sponsors: spec.sponsors.map((name) => ({ name, color: sponsorColor(name) })), canvas: { style: v.style, logo: v.logo, room: roomOf(v) },
      bare: !!v.bare, state: s, ev, online: { link: this.link!, role },
      done: (res) => this.done(res, prev),
    });
  }

  /** Tonight's event and its one bout. */
  private card(A: Fighter, B: Fighter, id: string): { ev: FightEvent; bout: Bout } {
    const s = roster();
    const v = VENUES[this.venue];
    const ev: FightEvent = { id, name: v.event, number: null, week: s.week, venue: v.venue ?? 'ape_x', region: 'na', card: [], status: 'scheduled', ppv: false, notes: ['started'] };
    const bout: Bout = makeBout(s, ev, A, B, 0, null);
    bout.rounds = this.rounds;
    ev.card.push(bout);
    return { ev, bout };
  }

  private done(res: FightResult, prev: GameState | null): void {
    this.g.state = prev;
    // the lobby again (and online, the other player hears you're not READY yet)
    this.refresh();
    const s = roster();
    const w = res.winner ? s.fighters[res.winner] : null;
    const why = res.method === 'NC' ? `No contest (${res.detail}).` : w ? `${w.first} ${w.last} wins by ${res.method} (${res.detail}), round ${res.round} at ${res.time}.` : `A draw (${res.detail}).`;
    alertBox(this.g, 'RESULT', why, () => this.refresh());
  }

  /** Under the corners: where tonight's fight is, with a look at the room. */
  private venuePanel(): void {
    const r = this.root;
    const v = VENUES[this.venue];
    const room = roomOf(v);
    const info = v.venue ? content().venues.find((x) => x.id === v.venue) : undefined;
    const y = 190;
    const FW = this.FW;
    r.addChild(box(FW - 16, 52, PAL.night, PAL.slate, { bevel: true })).position.set(8, y);
    // the room, small: its band, a row of heads, the top of the cage
    const pv = new Graphics();
    paintRoom(pv, room, lerpColor, 60);
    for (let x = 4; x < 480; x += 9) if (Math.sin(x * 7.3) > 1 - ROOMS[room].fill * 1.6) pv.circle(x, 52, 3).fill(0x141016).rect(x - 3, 54, 7, 6).fill(0x141016);
    pv.rect(0, 57, 480, 3).fill(0x2a2a30);
    pv.scale.set(0.42);
    pv.position.set(13, y + 5);
    r.addChild(pv);
    r.addChild(box(202, 26, 0x000000, PAL.slate, { alpha: 0 })).position.set(12, y + 4);
    r.addChild(text('VENUE', 220, y + 6, { small: true, color: PAL.ash }));
    if (this.mode === 'online' && this.me === 1) r.addChild(text(`${v.label.toUpperCase()} (their call)`, 252, y + 7, { small: true, color: PAL.bone, width: FW - 266, maxLines: 1 }));
    else r.addChild(selector(250, y + 4, FW - 264, VENUES.map((x, i) => ({ value: i, label: x.label })), this.venue, (i) => { this.venue = i; this.refresh(); }));
    const name = info?.name ?? 'An Unmarked Warehouse';
    const blurb = info?.blurb ?? 'No permits, no gloves, no address on the flyer. Bring cash.';
    r.addChild(text(name.toUpperCase(), 220, y + 21, { small: true, color: PAL.gold, width: FW - 234, maxLines: 1 }));
    r.addChild(text(blurb, 220, y + 29, { small: true, color: PAL.ash, width: FW - 234, maxLines: 2 }));
    const cap = info ? `CAPACITY ${info.capacity.toLocaleString('en-US')}` : 'CAPACITY: WHOEVER FITS';
    r.addChild(text(`${v.bare ? 'BARE KNUCKLE  •  ' : ''}${ROOMS[room].day ? 'DAYLIGHT  •  ' : ''}${cap}`, 13, y + 36, { small: true, color: PAL.grey, width: 200, maxLines: 1 }));
  }

  /** Who plays with what. */
  private assign(): { p1: { pad?: number; kb: KeyboardShare }; p2: { pad?: number; kb: KeyboardShare } } {
    const pads = input.padList().map((p) => p.index);
    if (pads.length >= 2) return { p1: { pad: pads[0], kb: 'full' }, p2: { pad: pads[1], kb: 'none' } };
    if (pads.length === 1) return { p1: { pad: -1, kb: 'full' }, p2: { pad: pads[0], kb: 'none' } };
    return { p1: { pad: -1, kb: 'left' }, p2: { pad: -1, kb: 'right' } };
  }

  private controlsNote(): string {
    if (this.mode === 'cpu') return 'You fight in the red corner with your usual controls. HELP has the full move list.';
    const n = input.padList().length;
    if (n >= 2) return 'P1: controller 1.\nP2: controller 2.\nPlug in a third and nobody cares.';
    if (isConsole) return n >= 2 ? 'P1: controller 1.\nP2: controller 2.' : 'Connect a second controller for two players.';
    if (isTouchDevice()) return n === 1 ? 'P1: the touch screen.\nP2: the controller.\n(Pair a second controller to give P1 one too.)' : 'Pair a controller with this phone or tablet: P1 plays on the touch screen, P2 on the controller.';
    if (n === 1) return 'P1: keyboard.\nP2: the controller.\n(Plug in a second controller to give P1 one too.)';
    return 'One keyboard, two people.\nP1: WASD move, J K L punch/kick, I block, Space grab.\nP2: arrows move, , . / punch/kick, R-Shift block, Enter grab.';
  }

  /** Pick a random opponent from any division (silly mismatches welcome). */
  private anyone(side: 0 | 1): void {
    const all = Object.values(roster().fighters).filter((f) => f.status !== 'retired' && !f.division.startsWith('w') === !this.div.startsWith('w'));
    const f = all[Math.floor(Math.random() * all.length)];
    this.div = f.division;
    const l = this.list();
    this.pick[side] = Math.max(0, l.indexOf(f));
    this.refresh();
  }

  private fight(): void {
    if (this.mode === 'online') return this.hostOnline();
    const s = roster();
    const l = this.list();
    const A = l[this.pick[0]];
    const B = l[this.pick[1]];
    if (!A || !B || A === B) return alertBox(this.g, 'Pick two fighters', 'Pick two different fighters.');
    sfx('bell');
    const v = VENUES[this.venue];
    const { ev, bout } = this.card(A, B, 'qf_' + Date.now());
    const rng = new Rng(Date.now() & 0xffffff);
    const sp = rng.sample(content().sponsors, 5).map((x) => x.name.replace(/ \(.*\)$/, ''));
    const off = officialsFor(s, ev, rng);
    const prev = this.g.state;
    this.g.state = s; // the booth and the Butler read the world they're in
    openLiveFight(this.g, {
      bout, A, B, skills: [A.skills, B.skills], player: 0, plan: 'balanced', oppPlan: this.cpu, cutTier: 2, seed: rng.int(1, 1e9),
      event: ev.name, judges: off.judges.map((j) => j.name), referee: off.referee.name,
      sponsors: sp.map((name) => ({ name, color: sponsorColor(name) })), canvas: { style: v.style, logo: v.logo, room: roomOf(v) },
      bare: !!v.bare, state: s, ev, versus: this.mode === 'versus' ? this.assign() : undefined,
      done: (res) => this.done(res, prev),
    });
  }
}
