import type { Game } from '../app';
import { PAL } from '../../art/palette';
import { text } from '../kit';
import { openWindow } from '../widgets';

export function openCredits(g: Game): void {
  const win = openWindow(g, 'Credits', 300, 200, { paper: 'cream' });
  win.body.addChild(text(
    'CAGE BOSS\n\n' +
    'Design, code, procedural art & sound: built with Claude Code from the CAGE BOSS spec.\n\n' +
    'Font: "Cagebook", an original pixel font (public domain).\n' +
    'Engine: PixiJS, TypeScript, Vite.\n\n' +
    'Every fighter, promoter, journalist, outlet, company, commission and event in this game is fictional. ' +
    'Characters are satirical archetypes. If you think one of them is about you, that says more about you than about us.\n\n' +
    'No energy drinks were harmed. Several were consumed.',
    8, 6, { width: 284, color: PAL.ink }));
}
