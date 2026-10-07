/**
 * HELP: everything you need to go from "which button punches" to running the sport.
 * Opened from the title menu, the in-game menus and the fight pause menu (above SETTINGS).
 * Topics on the left, a scrolling page on the right: headings, plain text, button rows
 * (pad glyph + keyboard key) and little illustrations drawn with the fight rig.
 */
import { Container, Graphics } from 'pixi.js';
import type { Game } from './app';
import { PAL } from '../art/palette';
import { text, button, box, ScrollBox } from './kit';
import { openWindow } from './widgets';
import { padGlyph, keyGlyph, type GlyphName } from './glyphs';
import { POSES, drawRig, type Look2, type Pose } from './rig';

export type HelpTopic = 'start' | 'fight' | 'clinch' | 'ground' | 'defence' | 'rtc' | 'career' | 'desk' | 'night' | 'sandbox' | 'tips';

type Keys = [GlyphName | null, string | null, string];
type Block =
  | { h: string }
  | { p: string }
  | { keys: Keys[] }
  | { pic: Pic; cap?: string }
  | { icon: IconKind; p: string };

/** An illustration: a pair of fighters in a pose (a = red corner, b = blue corner), or a ground pair drawn in one frame. */
type Pic = { stand: [Pose, Pose] } | { ground: [Pose, Pose] };
type IconKind = 'stamp' | 'paper' | 'money' | 'belt' | 'heart' | 'gas' | 'body' | 'mic' | 'phone' | 'cal' | 'glove' | 'scale';

const RED: Look2 = { skin: 0xc68a5e, hairStyle: 1, hairColor: 0x2a1a10, beard: 0, build: 1, trunks: 0x8e1e1e, trim: 0xe8e8e8, glove: 0x8e1e1e, stance: 'bouncy', female: false, tattoo: 0 };
const BLUE: Look2 = { skin: 0x8a5a3a, hairStyle: 0, hairColor: 0x101010, beard: 1, build: 1, trunks: 0x1e3a7a, trim: 0xf2c12e, glove: 0x1e3a7a, stance: 'bouncy', female: false, tattoo: 0 };

const TOPICS: { id: HelpTopic; label: string; icon: IconKind }[] = [
  { id: 'start', label: 'GETTING STARTED', icon: 'glove' },
  { id: 'fight', label: 'FIGHTING: STRIKING', icon: 'glove' },
  { id: 'clinch', label: 'FIGHTING: CLINCH', icon: 'glove' },
  { id: 'ground', label: 'FIGHTING: GROUND', icon: 'glove' },
  { id: 'defence', label: 'DEFENCE & SURVIVAL', icon: 'heart' },
  { id: 'rtc', label: 'ROAD TO CHAMPION', icon: 'belt' },
  { id: 'career', label: 'CAREER: PROMOTER', icon: 'money' },
  { id: 'desk', label: 'CAREER: THE DESK', icon: 'stamp' },
  { id: 'night', label: 'FIGHT NIGHT', icon: 'mic' },
  { id: 'sandbox', label: 'SANDBOX', icon: 'cal' },
  { id: 'tips', label: 'PRO TIPS', icon: 'belt' },
];

const PAGES: Record<HelpTopic, Block[]> = {
  start: [
    { h: 'THREE WAYS TO PLAY' },
    { icon: 'money', p: 'CAREER: you are the promoter. Work the desk, build cards, sign fighters, keep the money, the fans and the Commission happy, and stay out of prison.' },
    { icon: 'belt', p: 'ROAD TO CHAMPION: you are the fighter. Start on a garbage local circuit and fight your way up through regional shows and the Lounge to the CBFC title.' },
    { icon: 'cal', p: 'SANDBOX: career mode with the rules off. Edit fighters, money and meters, and book whatever you like.' },
    { h: 'MENUS & SAVING' },
    { keys: [['A', 'Enter', 'Confirm / click'], ['B', 'Esc', 'Back / close'], ['Menu', 'Esc', 'Pause / menu'], ['LStick', null, 'Move the cursor (pad)']] },
    { p: 'The game autosaves at the start of every week. Career mode also has three save slots (MENU). Ironman difficulty only keeps the autosave.' },
    { p: 'Settings has text speed, the swear bleep, fight speed, hands-on fights on/off, controller remapping (CONTROLS) and audio.' },
    { p: 'This page lives above SETTINGS in every menu and in the fight pause menu. When the game updates, WHAT\'S NEW tells you what changed.' },
  ],
  fight: [
    { h: 'THE BASICS' },
    { p: 'Hands-on fights put you in the cage in Road To Champion (turn them off in Settings to sim instead). Your man is on the left in red unless the card says otherwise. Move with the left stick / A-D.' },
    { keys: [['RB', 'J', 'Lead hand'], ['RT', 'K', 'Rear hand'], ['A', 'L', 'Kick'], ['LB', 'I', 'Block (tap = parry)'], ['B', 'Space', 'Grab: clinch / shoot / sprawl'], ['Y', 'U', 'Feint'], ['LT', 'O', 'Hold: strikes go to the body']] },
    { h: 'DIRECTIONAL STRIKES' },
    { p: 'Where the stick points when you PRESS the button picks the strike. How long you HOLD it picks the power: tap = light and fast, hold = medium, long hold = heavy (slow, big damage, big gas). On a pad a full trigger squeeze adds power.' },
    { keys: [[null, null, 'NEUTRAL: jab (lead) / straight (rear)'], [null, null, 'TOWARD: hooks'], [null, null, 'UP: lead hook / OVERHAND (rear)'], [null, null, 'DOWN: body jab / body straight'], [null, null, 'DOWN + TOWARD: uppercuts'], [null, null, 'AWAY: pull-counter jab / SPINNING BACKFIST (rear)']] },
    { pic: { stand: ['overhand', 'guard'] }, cap: 'Up + rear hand: the overhand.' },
    { p: 'Hold the body button (LT / O) and jabs, straights and hooks all go downstairs. Body shots get through a high guard far better than head shots, drain his gas and can fold him over.' },
    { h: 'KICKS' },
    { keys: [[null, null, 'NEUTRAL + kick: body kick'], [null, null, 'UP + kick: head kick (slow, huge)'], [null, null, 'DOWN + kick: leg kick (wrecks his movement)'], [null, null, 'TOWARD + kick: front kick (shoves him off, stops his attack)'], [null, null, 'AWAY + kick: spinning back kick (big, very punishable)']] },
    { pic: { stand: ['frontKick', 'guard'] }, cap: 'Toward + kick: the teep. Great against a man walking you down.' },
    { h: 'COMBOS & COUNTERS' },
    { p: 'Land something and the next strike comes out faster for a moment: chain jab, straight, hook. Press the next strike while one is still out and it is buffered, never lost.' },
    { p: 'Make him miss (slip, roll, pull, parry) and your next shot is a COUNTER: 1.5x damage. A good feint makes him flinch and also opens a counter.' },
  ],
  clinch: [
    { h: 'GETTING IN' },
    { p: 'HOLD grab (B / Space) close to him to tie up. Stick TOWARD while holding grab shoots a takedown instead. Whoever starts the clinch gets the first tie: a collar tie.' },
    { h: 'GRIP FIGHTING (TAP GRAB + STICK)' },
    { keys: [[null, null, 'UP + grab: THAI PLUM (head control: knees to the face)'], [null, null, 'TOWARD + grab: DOUBLE UNDERHOOKS (body lock, drive to the fence)'], [null, null, 'NEUTRAL + grab: PUMMEL (break his tie back to even)'], [null, null, 'DOWN + grab: TRIP / TAKEDOWN'], [null, null, 'AWAY + grab: BREAK AWAY']] },
    { pic: { stand: ['plum', 'clinchDef'] }, cap: 'Red has the plum. Blue is eating knees until he pummels out.' },
    { p: 'You can\'t go from his plum straight to yours: pummel back to even first. The better wrestler wins more grip battles, and so does the fresher man.' },
    { h: 'THE FENCE' },
    { p: 'Push the stick toward him to walk him backwards; with double underhooks you drive him to the fence on your own. Pinned on the fence he burns gas, can\'t break away as easily and your knees and trips get better.' },
    { pic: { stand: ['underhook', 'cageBack'] }, cap: 'Underhooks, back to the cage.' },
    { h: 'STRIKING IN THE CLINCH' },
    { keys: [[null, null, 'Punch: short hooks, uppercuts (down + toward)'], [null, null, 'Heavy punch: ELBOW (cuts people open)'], [null, null, 'Body modifier: body shots'], [null, null, 'Kick: knee to the body / UP: to the head (plum only) / DOWN: thigh']] },
    { p: 'The man with the better tie hits harder; the man in the plum hits weakly. Do nothing for too long and the referee breaks you up.' },
  ],
  ground: [
    { h: 'POSITIONS' },
    { p: 'From worst to best for the man on top: FULL GUARD > HALF GUARD > SIDE CONTROL > MOUNT > THE BACK. Better positions mean harder ground and pound and more submissions. Every pass, sweep and escape scores on the cards.' },
    { pic: { ground: ['hTop', 'hBot'] }, cap: 'Half guard: one leg trapped. One more pass to side control.' },
    { h: 'ON TOP: KICK BUTTON + STICK' },
    { keys: [[null, null, 'TOWARD: pass (guard > half > side > mount)'], [null, null, 'UP: take the back (from half, side, mount) / stand up out of guard'], [null, null, 'AWAY: stand up and let him up'], [null, null, 'DOWN: heavy pressure (drains him, kills his escape)'], [null, null, 'Punches: ground and pound (heavy = elbows)']] },
    { p: 'Each tap fills the bar under the position name. Switching what you are working on loses most of the progress, so commit.' },
    { pic: { ground: ['passTop', 'passBot'] }, cap: 'Passing the guard.' },
    { h: 'UNDERNEATH: KICK BUTTON + STICK' },
    { keys: [[null, null, 'TOWARD: sweep (from guard or half guard)'], [null, null, 'AWAY: recover guard (mount/side > half > guard)'], [null, null, 'UP: get back to your feet (easiest from guard)'], [null, null, 'DOWN: frame and hip escape (undo his passing)'], [null, null, 'Block: cover up from ground and pound']] },
    { h: 'SUBMISSIONS: GRAB + STICK' },
    { p: 'What you go for depends on where you are and where the stick points:' },
    { keys: [[null, null, 'BACK: rear-naked choke / up: neck crank / down: bow and arrow'], [null, null, 'MOUNT: armbar / toward: ezekiel / up: arm-triangle / down: americana'], [null, null, 'SIDE: arm-triangle / toward: americana / up: north-south / down: kimura / away: armbar'], [null, null, 'HALF (top): kimura / up: d\'arce / down: americana / away: kneebar'], [null, null, 'GUARD (bottom): triangle / toward: armbar / up: guillotine / down: heel hook / away: omoplata'], [null, null, 'HALF (bottom): kimura / up: guillotine / down: kneebar / away: heel hook'], [null, null, 'GUARD (top): down or away: ankle lock']] },
    { pic: { ground: ['triAtk', 'triVic'] }, cap: 'Triangle from the bottom.' },
    { p: 'Once it is on: mash grab / kick and rotate the stick to crank it (or to escape). Tired, hurt men tap faster. A failed sub costs position; a failed leg lock turns into a scramble.' },
  ],
  defence: [
    { h: 'BLOCK, PARRY, MOVE YOUR HEAD' },
    { p: 'Hold block for a high guard: it stops most of a head shot but less of a body shot or a leg kick (checked leg kicks hurt the kicker). Tap block just before a punch lands to PARRY: he is stunned, you counter.' },
    { keys: [['RStick', 'Up', 'Flick up: SLIP (beats jabs, straights, overhands)'], ['RStick', 'Down', 'Flick down: ROLL (beats hooks, overhands, head kicks; NOT body shots)'], ['RStick', null, 'Flick away: PULL (beats almost everything)'], ['RStick', null, 'Flick toward: LEAN IN']] },
    { p: 'On the keyboard the arrow keys do the same (left/right follow which way you face).' },
    { h: 'SPRAWL' },
    { p: 'When he shoots, TAP grab to sprawl. Stuff it and he is stunned and you score.' },
    { h: 'THE HUD' },
    { icon: 'heart', p: 'BPM: your heart rate. Throwing, moving and getting hurt push it up. Above ~165 you are redlining.' },
    { icon: 'gas', p: 'GAS: everything costs gas. Low gas = slower, weaker strikes, and your takedown defence goes.' },
    { icon: 'body', p: 'The little body shows damage: head, body, legs. A red body folds; red legs slow you and can drop you.' },
    { h: 'KNOCKED DOWN' },
    { keys: [['LT', 'Q', 'then'], ['RT', 'E', 'alternate in rhythm to beat the count']] },
    { p: 'Not too fast, not too slow: a steady left-right. Hitting the same side twice fumbles. Three knockdowns in a round and it is waved off.' },
    { h: 'BETWEEN ROUNDS' },
    { p: 'Your cutman works the face (a quick mini game) and the coach picks the gameplan for the next round. Pause any time for AUTOPILOT, SIM THE REST, or this page.' },
  ],
  rtc: [
    { h: 'THE ROAD' },
    { p: 'Create your fighter, then climb: a scrappy LOCAL CIRCUIT, one or two REGIONAL PROMOTIONS, the PROFESSIONAL FIGHTERS\' LOUNGE (season, playoffs, final) and finally the CBFC. Win the belt where you are and the next promotion calls. In the CBFC the rankings follow the real ones.' },
    { p: 'As your rank and hype climb you move up the card: early prelims, prelims, main card, co-main, main event. Better slots pay better.' },
    { h: 'YOUR WEEK' },
    { p: 'You get 3 actions a week (the gold pips). TRAIN a skill, SPAR (big gains, real risk), CUT WEIGHT, WORK A SHIFT for money, REST, GO OUT, or work BLEETER for hype and callouts. PAPERWORK, CONDITION, STAFF and RANKINGS are free.' },
    { icon: 'heart', p: 'CONDITION: energy, morale and health set your training multiplier. PEAK CONDITION gives the biggest gains. The jump rope and tyre mini games boost a session.' },
    { icon: 'scale', p: 'WEIGHT: training burns weight, and CUT WEIGHT has roadwork, a strict diet or the sauna (fast, but the water comes back unless it is fight week). Miss weight and you lose part of your purse.' },
    { icon: 'paper', p: 'PAPERWORK: contracts, bout agreements and your opponent\'s medicals. Read them before you weigh in. Unread paperwork gets signed as-is.' },
    { h: 'BRADIE & THE BAREKNUCKLE STUFF' },
    { p: 'Bradie runs Only Fighters (a content site) and the bareknuckle circuit. His contracts come with odd clauses. Read every line. The money is real; so are the consequences.' },
    { h: 'FIGHT WEEK' },
    { p: 'Weigh in, pick a gameplan, then fight hands-on (or sim). Sponsors may pay you to plug them. After the fight: purse, rankings, Bleeter.' },
  ],
  career: [
    { h: 'THE JOB' },
    { p: 'Every turn is a week. Read the paper, work the desk, answer calls and visitors, build fight cards on the corkboard, scout and sign fighters in the filing cabinet, run fight night, then check the ledger.' },
    { icon: 'money', p: 'MONEY: gates, PPV buys, TV deals and sponsors in; purses, staff, venues and fines out. The ledger shows where it went.' },
    { icon: 'phone', p: 'METERS: owners, fans, fighters, the Commission, sponsors and the press. Let one hit the floor and something bad happens. Several bad things end the run.' },
    { h: 'MATCHMAKING' },
    { p: 'Good cards mix rankings, rivalries and styles. Champions need real contenders. Hype sells tickets; mismatches sell injuries. Rematches get numbered (II, III).' },
    { h: 'SPONSORS' },
    { p: 'Companies ask to PRESENT your events through the weeks (INBOX > OFFERS). Their names go on the canvas, the ribbon boards and the screens. Banned categories annoy the Commission.' },
    { h: 'FIGHTERS' },
    { p: 'Scout before you sign: the file card and the scouting report. Contracts have purses, bout counts and clauses. Unhappy fighters talk to the press.' },
  ],
  desk: [
    { h: 'INSPECTION' },
    { icon: 'paper', p: 'Fighters, managers and promoters bring documents: licences, medicals, bout agreements, visas, sponsor forms. Your job is to catch what is wrong.' },
    { keys: [[null, 'I', 'Inspect mode: click two things that disagree'], [null, 'R', 'Open the rulebook (drag it, zoom it, highlight)']] },
    { p: 'Compare every field against the file card and the rulebook: names, dates, weights, expiry dates, signatures, stamps. Click the mismatch and CITE IT.' },
    { icon: 'stamp', p: 'Then stamp: APPROVE, DENY, ESCALATE or BURY. Wrong calls cost Commission trust, money, or worse. Citations show up at the end of the day.' },
    { p: 'The clock is always running. Faster, cleaner days mean more time for everything else.' },
  ],
  night: [
    { h: 'BEFORE THE FIGHTS' },
    { p: 'Weigh-ins (misses can be replaced from the roster), the press conference, then the card. WATCH a fight or SIM it; SIM ALL PRELIMS / SIM EVERYTHING to hurry.' },
    { h: 'WATCHING' },
    { p: 'Three cameras: SIDE, TV (broadcast cuts and close-ups) and TOP-DOWN. The booth calls it, the Juiced Butler announces it. Between rounds the corner and the cutman work.' },
    { pic: { stand: ['collar', 'clinchDef'] }, cap: 'Clinch ties, passes, sweeps and scrambles all play out in every camera.' },
    { h: 'AFTER' },
    { p: 'Decisions are read out, the winner gets interviewed, and the news recap tells you what the world thinks.' },
  ],
  sandbox: [
    { h: 'SANDBOX' },
    { p: 'Career mode without the guard rails: open the editors to change fighters, skills and records, give yourself money, and set the meters. Import and export roster packs (MENU) to share your universe.' },
  ],
  tips: [
    { h: 'STRIKING' },
    { p: 'Work the body early: it drains his gas and drops his hands later. When he covers up high, go downstairs; when he drops his hands, go up.' },
    { p: 'Leg kicks win long fights. Front kicks keep pressure fighters off you. Spinning stuff is a great finisher and a terrible opener.' },
    { p: 'Light shots are fast and cheap. Save the heavy ones for counters and hurt opponents.' },
    { h: 'GRAPPLING' },
    { p: 'Clinch against a better striker; get the underhooks and walk him to the fence, then trip. Against a wrestler, pummel and break.' },
    { p: 'On top: pass to half, then side, then take the back. Do not throw a submission from guard. Use DOWN (pressure) to stop him standing.' },
    { p: 'Underneath: recover guard first, then sweep or stand. Subs from the bottom work best on a tired man.' },
    { h: 'THE CAREER' },
    { p: 'Peak condition before camp. Cut weight steadily, not all in fight week. Read the paperwork. Never sign the first Bradie contract.' },
  ],
};

function icon(kind: IconKind): Graphics {
  const g = new Graphics();
  switch (kind) {
    case 'stamp':
      g.rect(3, 0, 4, 5).fill(0x6a4a2a).rect(0, 5, 10, 3).fill(PAL.blood).rect(0, 8, 10, 1).fill(0x5a1010);
      break;
    case 'paper':
      g.rect(1, 0, 8, 10).fill(PAL.bone).rect(2, 2, 6, 1).fill(PAL.ash).rect(2, 4, 6, 1).fill(PAL.ash).rect(2, 6, 4, 1).fill(PAL.ash);
      break;
    case 'money':
      g.rect(0, 2, 10, 6).fill(PAL.moss).rect(4, 3, 2, 4).fill(0xb8e0a0);
      break;
    case 'belt':
      g.rect(0, 3, 10, 4).fill(0x6a4a2a).rect(3, 1, 4, 8).fill(PAL.gold).rect(4, 3, 2, 4).fill(0xfff0a0);
      break;
    case 'heart':
      g.rect(1, 1, 3, 2).fill(0xd04050).rect(6, 1, 3, 2).fill(0xd04050).rect(0, 2, 10, 3).fill(0xd04050).rect(1, 5, 8, 1).fill(0xd04050).rect(2, 6, 6, 1).fill(0xd04050).rect(3, 7, 4, 1).fill(0xd04050).rect(4, 8, 2, 1).fill(0xd04050);
      break;
    case 'gas':
      g.rect(0, 3, 10, 4).fill(PAL.night).rect(0, 3, 6, 4).fill(PAL.steel);
      break;
    case 'body':
      g.rect(4, 0, 3, 3).fill(PAL.moss).rect(3, 3, 5, 4).fill(PAL.gold).rect(3, 7, 2, 3).fill(PAL.blood).rect(6, 7, 2, 3).fill(PAL.moss);
      break;
    case 'mic':
      g.circle(5, 3, 3).fill(PAL.ash).rect(4, 5, 2, 5).fill(PAL.slate);
      break;
    case 'phone':
      g.rect(2, 0, 6, 10).fill(PAL.slate).rect(3, 1, 4, 6).fill(PAL.sky);
      break;
    case 'cal':
      g.rect(0, 1, 10, 9).fill(PAL.bone).rect(0, 1, 10, 3).fill(PAL.blood).rect(2, 5, 2, 2).fill(PAL.ash).rect(6, 5, 2, 2).fill(PAL.ash);
      break;
    case 'glove':
      g.rect(1, 1, 7, 6).fill(PAL.blood).rect(0, 3, 2, 3).fill(PAL.blood).rect(2, 7, 5, 3).fill(PAL.bone);
      break;
    case 'scale':
      g.rect(0, 7, 10, 3).fill(PAL.slate).rect(2, 2, 6, 5).fill(PAL.ash).rect(4, 3, 2, 2).fill(PAL.blood);
      break;
  }
  return g;
}

function picture(pic: Pic, w: number): Container {
  const c = new Container();
  c.addChild(box(w, 64, 0x15121a, PAL.slate));
  const g = new Graphics();
  // canvas + a strip of fence
  g.rect(1, 50, w - 2, 13).fill(0x3a3a42).rect(1, 50, w - 2, 1).fill(0x5a5a62);
  for (let x = 6; x < w - 2; x += 8) g.rect(x, 4, 1, 46).fill({ color: 0x2a2a32, alpha: 0.8 });
  const cx = Math.round(w / 2);
  if ('stand' in pic) {
    drawRig(g, POSES[pic.stand[0]], cx - 13, 58, 1, RED, 0.72);
    drawRig(g, POSES[pic.stand[1]], cx + 13, 58, -1, BLUE, 0.72);
  } else {
    drawRig(g, POSES[pic.ground[1]], cx, 58, 1, { ...BLUE, faceUp: true }, 0.72);
    drawRig(g, POSES[pic.ground[0]], cx, 58, 1, RED, 0.72);
  }
  c.addChild(g);
  return c;
}

function keyRow(k: Keys): Container {
  const c = new Container();
  let x = 0;
  if (k[0]) {
    const p = padGlyph(k[0]);
    c.addChild(p);
    x += Math.ceil(p.width) + 2;
  }
  if (k[1]) {
    const kg = keyGlyph(k[1]);
    kg.x = x;
    c.addChild(kg);
    x += Math.ceil(kg.width) + 2;
  }
  if (!k[0] && !k[1]) {
    c.addChild(new Graphics().rect(1, 3, 3, 3).fill(PAL.gold));
    x = 7;
  }
  c.addChild(text(k[2], x + 2, 2, { small: true, color: PAL.bone }));
  return c;
}

function renderPage(sb: ScrollBox, topic: HelpTopic): void {
  sb.content.removeChildren().forEach((c) => c.destroy({ children: true }));
  const w = sb.w - 8;
  let y = 2;
  for (const b of PAGES[topic]) {
    if ('h' in b) {
      if (y > 2) y += 4;
      sb.content.addChild(text(b.h, 0, y, { color: PAL.gold }));
      y += 12;
    } else if ('keys' in b) {
      for (const k of b.keys) {
        const r = keyRow(k);
        r.position.set(2, y);
        sb.content.addChild(r);
        y += 11;
      }
      y += 2;
    } else if ('pic' in b) {
      const p = picture(b.pic, 150);
      p.position.set(2, y);
      sb.content.addChild(p);
      if (b.cap) sb.content.addChild(text(b.cap, 158, y + 4, { small: true, width: w - 160, color: PAL.ash }));
      y += 68;
    } else if ('icon' in b) {
      const ic = icon(b.icon);
      ic.position.set(1, y + 1);
      sb.content.addChild(ic);
      const t = text(b.p, 14, y, { small: true, width: w - 14, color: PAL.bone });
      sb.content.addChild(t);
      y += Math.max(12, t.textHeight + 4);
    } else {
      const t = text(b.p, 0, y, { small: true, width: w, color: PAL.bone });
      sb.content.addChild(t);
      y += t.textHeight + 4;
    }
  }
  sb.scrollY = 0;
  sb.refresh();
  sb.scrollTo(0);
}

/** Open the help screen, optionally on a topic. */
export function openHelp(g: Game, start: HelpTopic = 'start'): void {
  const win = openWindow(g, 'Help: how to be a pro', 464, 252, { dim: 0.7 });
  const sb = new ScrollBox(330, 226);
  sb.position.set(128, 4);
  win.body.addChild(sb);
  let cur = start;
  const list = new Container();
  win.body.addChild(list);
  const draw = () => {
    list.removeChildren().forEach((c) => c.destroy({ children: true }));
    TOPICS.forEach((t, i) => {
      const b = button(t.label, 16, 4 + i * 20, 104, 16, () => {
        cur = t.id;
        draw();
        renderPage(sb, cur);
      }, { small: true, fill: t.id === cur ? PAL.gold : PAL.shadow });
      list.addChild(b);
      const ic = icon(t.icon);
      ic.position.set(3, 7 + i * 20);
      list.addChild(ic);
    });
  };
  draw();
  renderPage(sb, cur);
  const pop = g.pushKeyHandler((e) => {
    if (e.type !== 'keydown') return true;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') sb.scrollTo(sb.scrollY + (e.key === 'PageDown' ? 120 : 24));
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') sb.scrollTo(sb.scrollY - (e.key === 'PageUp' ? 120 : 24));
    else if (e.key === 'Escape') win.close();
    else return false;
    return true;
  });
  win.frame.once('destroyed', pop);
}
