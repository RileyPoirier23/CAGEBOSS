/**
 * In-game menu: save slots, export / import, settings, quit to title.
 */
import type { Game } from '../app';
import { PAL } from '../../art/palette';
import { text, button } from '../kit';
import { openWindow, confirm, downloadText, alertBox } from '../widgets';
import { SLOTS, saveToSlot, slotMeta, exportSave } from '../../core/save';
import { openSettings } from './settings';
import { openLoad } from './loadmenu';
import { TitleScene } from './title';
import { exportRosterPack, importRosterPack } from '../rosterpack';
import { openJukebox } from './jukebox';
import { desktop } from '../../desktop';

export function openGameMenu(g: Game, onClose: () => void): void {
  const s = g.state!;
  const win = openWindow(g, 'Menu', 220, desktop ? 247 : 232, { onClose });
  let y = 4;
  win.body.addChild(text(s.difficulty === 'ironman' ? 'IRONMAN: autosave only.' : 'Save to slot:', 8, y, { small: true, color: PAL.ash }));
  y += 10;
  for (const slot of SLOTS.filter((x) => x !== 'auto')) {
    const meta = slotMeta(slot);
    win.body.addChild(button(`SLOT ${slot}${meta ? ` - ${meta.date}` : ' - empty'}`, 8, y, 204, 13, () => {
      const go = () => {
        const ok = saveToSlot(s, slot);
        g.toast(ok ? `Saved to slot ${slot}` : 'Save failed', ok ? PAL.moss : PAL.blood);
        win.close();
      };
      if (meta) confirm(g, `Overwrite slot ${slot}?`, go);
      else go();
    }, { small: true, disabled: s.difficulty === 'ironman' }));
    y += 15;
  }
  y += 4;
  win.body.addChild(button('EXPORT SAVE TO FILE', 8, y, 204, 13, () => downloadText(`cageboss-${s.promotion.name.replace(/\W+/g, '_')}-wk${s.week}.json`, exportSave(s)), { small: true }));
  y += 15;
  win.body.addChild(button('EXPORT ROSTER PACK', 8, y, 100, 13, () => exportRosterPack(g), { small: true }));
  win.body.addChild(button('IMPORT ROSTER PACK', 112, y, 100, 13, () => importRosterPack(g, () => {}), { small: true }));
  y += 15;
  win.body.addChild(button('LOAD...', 8, y, 204, 13, () => { win.close(); openLoad(g); }, { small: true, disabled: s.difficulty === 'ironman' }));
  y += 15;
  win.body.addChild(button('SETTINGS', 8, y, 100, 13, () => openSettings(g), { small: true }));
  win.body.addChild(button('JUKEBOX', 112, y, 100, 13, () => openJukebox(g), { small: true, fill: PAL.plum }));
  y += 15;
  win.body.addChild(button('HOW TO PLAY', 8, y, 204, 13, () => alertBox(g, 'How to play',
    'Each turn is a week. Read the paper, then work the desk: inspect documents (I), compare fields with the file card and the rulebook (R), and stamp APPROVE / DENY / ESCALATE / BURY. Answer calls and visitors. Build fight cards on the corkboard, scout and sign fighters in the filing cabinet. Fight night: weigh-ins, presser, the event, post-fight interviews. Then the ledger. Keep the owners happy, the fans entertained, and yourself out of prison.'), { small: true }));
  y += 15;
  win.body.addChild(button('QUIT TO TITLE', 8, y, 204, 13, () => confirm(g, 'Quit to title? Progress since the last autosave (start of today) is lost.', () => {
    g.state = null;
    g.goto(new TitleScene(g));
  }), { small: true, fill: PAL.blood }));
  if (desktop) {
    y += 15;
    win.body.addChild(button('QUIT TO DESKTOP', 8, y, 204, 13, () => confirm(g, 'Quit the game? Progress since the last autosave (start of today) is lost.', () => desktop!.quit()), { small: true, fill: PAL.blood }));
  }
}
