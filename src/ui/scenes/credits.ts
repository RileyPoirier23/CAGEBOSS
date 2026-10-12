import type { Game } from '../app';
import { PAL } from '../../art/palette';
import { text, button, ScrollBox } from '../kit';
import { openWindow } from '../widgets';
import { openMemorial } from '../endcredits';

export function openCredits(g: Game): void {
  const win = openWindow(g, 'Credits', 300, 262, { paper: 'cream' });
  // the words scroll; the memorial has its own row under them
  const sb = new ScrollBox(292, 214);
  sb.position.set(4, 2);
  win.body.addChild(sb);
  sb.content.addChild(text(
    'CAGE BOSS\n\n' +
    'Created by Riley "Monkey Man" Poirier\n' +
    'Instagram: rpoirier07\n' +
    'TikTok: iheartgrannies69\n' +
    'Discord: gldmonkey\n\n' +
    'SOUNDTRACK (local artists, used with permission)\n' +
    'SANDO: Champion, fu2, Your Mom Hates Me\n' +
    'SANDO x RUIN: Doin Shit\n' +
    'RUIN143: ossa, Bloodhound for You, Come Closer (feat. SANDO)\n' +
    'Zuddha: All Hustle, A Moment w/ Grace (ft. FTB VON), Open to You, some interlude\n' +
    'F.O.K.: BAG ft. Hope Nikku (prod. Miler)\n' +
    'EYE-V: Gen Apathy\n\n' +
    'Font: "Cagebook", an original pixel font (public domain).\n' +
    'Engine: PixiJS, TypeScript, Vite.\n\n' +
    'Every fighter, promoter, journalist, outlet, company, commission and event in this game is fictional. ' +
    'Characters are satirical archetypes. If you think one of them is about you, that says more about you than about us.\n\n' +
    'No energy drinks were harmed. Several were consumed.',
    4, 4, { width: 278, color: PAL.ink }));
  sb.refresh();
  // the memorial is always here, on every device (the end of Road To Champion plays it too)
  win.body.addChild(button('IN MEMORIAM', 150 - 60, 222, 120, 20, () => openMemorial(g), { fill: 0x2a262c, border: PAL.gold }));
}
