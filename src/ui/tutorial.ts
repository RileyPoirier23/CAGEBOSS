/**
 * Skippable tutorial. A new career asks "play the tutorial?" on the first
 * morning; after that, the first visit to each screen shows a few short cards
 * with a highlight box around the part being explained. Skippable at any time;
 * Settings → "Tutorial on new careers" turns the offer off, "Replay tutorial"
 * resets it for the current save.
 */
import { Container, Graphics } from 'pixi.js';
import type { Game } from './app';
import { PAL } from '../art/palette';
import { W, H, text, box, button } from './kit';
import { npcPortrait } from './sprites';
import { sfx } from '../audio/sfx';

type Rect = [number, number, number, number];
interface Step { title: string; text: string; rect?: Rect }

const STEPS: Record<string, Step[]> = {
  paper: [
    { title: 'THE MORNING PAPER', text: "Every week starts here. The front page is whatever the internet is screaming about, plus whatever your fighters did last night. Read it: storylines, injuries and scandals show up here first." },
    { title: 'YOUR BOSS', text: "The owner drops by every few weeks with objectives. Hit them and you earn CLOUT, which unlocks new toys: the Contender Series, scouting, bigger venues, PPV, international shows. Check progress any time with CAREER." },
    { title: 'TO THE DESK', text: "When you're done reading, head to the desk. That's where the actual work (and the actual lying) happens." },
  ],
  desk: [
    { title: 'THE INBOX', text: 'Paperwork lands here: bout agreements, medicals, expenses, licences. Click one to open it.', rect: [366, 84, 108, 108] },
    { title: 'THE DOCUMENT', text: 'Read it carefully. Names, weights, purses, dates and signatures all have to line up with the file card and the rulebook.', rect: [120, 84, 256, 130] },
    { title: 'THE FILE CARD', text: "The fighter's file: what you actually agreed to. Forgers and 'creative' managers count on you not checking it.", rect: [2, 84, 118, 62] },
    { title: 'RULEBOOK & INSPECT', text: "The RULEBOOK lists every rule in force (new ones arrive by Commission bulletin). Press INSPECT (I), click a field, then the field it should match. Catch a mismatch and you can question the fighter about it.", rect: [4, 226, 116, 40] },
    { title: 'STAMP IT', text: "Decide: FILE it if it's clean, SHRED it if it's bad, send it to LEGAL or BURY it. Approve something that breaks a rule and the Commission sends a citation, and the first two are warnings.", rect: [368, 198, 108, 68] },
    { title: 'RUN THE COMPANY', text: 'ROSTER = your fighters and free agents. CARDS = build fight cards. RANKS = the rankings. When the inbox is done, END DAY. On fight week that takes you to fight night.', rect: [394, 2, 86, 72] },
  ],
  fightnight: [
    { title: 'FIGHT NIGHT', text: 'Prelims first, main event last. WATCH a fight to see it live with commentary, or SIM it if you just want the result.' },
    { title: 'WATCHING', text: 'During a fight: change the camera, speed it up, or skip to the end. The Bleeter feed shows the internet losing its mind in real time.' },
    { title: 'AFTER THE CARD', text: 'Pay performance bonuses (fighters remember who got skipped), survive the press conference, then watch the TV recap.' },
  ],
  ledger: [
    { title: 'THE LEDGER', text: "The week's money in and money out. Keep the owner's quarterly target in mind. Miss it badly enough and he starts looking at other bald men." },
    { title: "THAT'S THE LOOP", text: "Paper, desk, card, fight night, ledger. Repeat until you're a global juggernaut or in prison. Good luck, Boss." },
  ],
  contender: [
    { title: 'CONTENDER SERIES', text: 'Young prospects fight for a contract. Watch or sim the card, then decide who gets signed. Losers can come back on a later card.' },
  ],
};

const done = (g: Game, key: string) => !!g.state?.flags['tut_' + key];

/** Called whenever a scene with a tutorial key is entered. */
export function maybeTutorial(g: Game, key: string): void {
  const s = g.state;
  if (!s || s.mode !== 'career' || !STEPS[key]) return;
  if (s.flags.tutorial === 'off' || done(g, key)) return;
  const start = performance.now();
  const go = () => {
    if (g.state !== s || done(g, key)) return;
    // let the owner's check-in and other popups go first
    if (g.modals.length) {
      if (performance.now() - start < 60000) setTimeout(go, 400);
      return;
    }
    if (s.flags.tutorial === undefined) return offer(g, () => go());
    if (s.flags.tutorial === 'on') run(g, key);
  };
  setTimeout(go, 1200);
}

function offer(g: Game, then: () => void): void {
  const s = g.state!;
  if (g.settings.tutorial === false) {
    s.flags.tutorial = 'off';
    return;
  }
  const frame = new Container();
  const wrap = g.modal(frame, { dim: 0.7 });
  const bw = 280;
  const bh = 74;
  const bx = (W - bw) / 2;
  const by = (H - bh) / 2;
  frame.addChild(box(bw, bh, PAL.night, PAL.gold, { bevel: true })).position.set(bx, by);
  const por = npcPortrait('assistant', 'manager', 32);
  por.position.set(bx + 8, by + 8);
  frame.addChild(por);
  frame.addChild(text('FIRST DAY ON THE JOB?', bx + 46, by + 8, { color: PAL.gold }));
  frame.addChild(text("I'm your assistant. I can walk you through the paperwork, the cards and fight night as you get to each part. Takes two minutes. Skip any time.", bx + 46, by + 22, { small: true, width: bw - 54, color: PAL.bone }));
  frame.addChild(button('SHOW ME THE ROPES', bx + 46, by + bh - 24, 112, 16, () => {
    s.flags.tutorial = 'on';
    g.closeModal(wrap);
    sfx('click');
    then();
  }, { small: true, fill: PAL.moss }));
  frame.addChild(button("I'VE GOT THIS", bx + bw - 96, by + bh - 24, 88, 16, () => {
    s.flags.tutorial = 'off';
    g.closeModal(wrap);
    g.toast('Tutorial skipped. Replay it from Settings any time.', PAL.ash, { small: true });
  }, { small: true, fill: PAL.shadow }));
}

function run(g: Game, key: string): void {
  const s = g.state!;
  const steps = STEPS[key];
  s.flags['tut_' + key] = 1;
  const frame = new Container();
  const wrap = g.modal(frame, { dim: 0 });
  let i = 0;
  const show = () => {
    frame.removeChildren().forEach((c) => c.destroy({ children: true }));
    const st = steps[i];
    // dim everything except the highlighted rect
    const dim = new Graphics();
    if (st.rect) {
      const [x, y, w, h] = st.rect;
      dim.rect(0, 0, W, y).rect(0, y + h, W, H - y - h).rect(0, y, x, h).rect(x + w, y, W - x - w, h).fill({ color: 0x000000, alpha: 0.6 });
      dim.rect(x - 1, y - 1, w + 2, h + 2).stroke({ color: PAL.gold, width: 1 });
    } else dim.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.55 });
    dim.eventMode = 'static';
    frame.addChild(dim);
    // the card goes wherever the highlight isn't
    const bw = 236;
    const bh = 78;
    let bx = (W - bw) / 2;
    let by = H - bh - 8;
    if (st.rect) {
      const [x, y, w, h] = st.rect;
      const cx = x + w / 2;
      bx = cx > W / 2 ? Math.max(4, x - bw - 8) : Math.min(W - bw - 4, x + w + 8);
      by = Math.max(4, Math.min(H - bh - 4, y + h / 2 - bh / 2));
      // too wide to sit beside it: go above or below
      if (w > W - bw - 24) {
        bx = (W - bw) / 2;
        by = y > H / 2 ? Math.max(4, y - bh - 6) : Math.min(H - bh - 4, y + h + 6);
      }
    }
    const card = new Container();
    card.addChild(box(bw, bh, PAL.night, PAL.gold, { bevel: true }));
    card.addChild(text(st.title, 8, 6, { color: PAL.gold }));
    card.addChild(text(`${i + 1}/${steps.length}`, bw - 30, 6, { small: true, color: PAL.ash }));
    card.addChild(text(st.text, 8, 19, { small: true, width: bw - 16, color: PAL.bone, maxLines: 6 }));
    const last = i === steps.length - 1;
    card.addChild(button(last ? 'GOT IT' : 'NEXT →', bw - 64, bh - 18, 56, 13, () => {
      sfx('click');
      if (last) g.closeModal(wrap);
      else {
        i++;
        show();
      }
    }, { small: true, fill: PAL.moss }));
    card.addChild(button('SKIP TUTORIAL', 8, bh - 18, 72, 13, () => {
      s.flags.tutorial = 'off';
      g.closeModal(wrap);
    }, { small: true, fill: PAL.shadow }));
    card.position.set(Math.round(bx), Math.round(by));
    frame.addChild(card);
  };
  show();
}

/** Settings → "Replay tutorial": turns it back on for this save. */
export function resetTutorial(g: Game): void {
  const s = g.state;
  if (!s) return;
  for (const k of Object.keys(STEPS)) delete s.flags['tut_' + k];
  s.flags.tutorial = 'on';
}
