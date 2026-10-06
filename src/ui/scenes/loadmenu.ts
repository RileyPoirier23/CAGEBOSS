import type { Game } from '../app';
import { PAL } from '../../art/palette';
import { text, button, box } from '../kit';
import { openWindow, confirm, pickTextFile, alertBox } from '../widgets';
import { SLOTS, slotMeta, loadFromSlot, deleteSlot, parseSave } from '../../core/save';
import { money } from '../../core/format';
import { startGameFromState } from '../flow';

export function openLoad(g: Game): void {
  const win = openWindow(g, 'Load career', 300, 190);
  const b = win.body;
  let y = 4;
  for (const slot of SLOTS) {
    const meta = slotMeta(slot);
    b.addChild(box(288, 34, PAL.ink, PAL.slate)).position.set(6, y);
    const label = slot === 'auto' ? 'AUTOSAVE' : 'SLOT ' + slot;
    b.addChild(text(label, 10, y + 3, { small: true, color: PAL.gold }));
    if (meta) {
      b.addChild(text(`${meta.name}  •  ${meta.date}  •  Act ${meta.act}`, 10, y + 11, { color: PAL.bone, width: 222, maxLines: 1 }));
      b.addChild(text(`${meta.mode.toUpperCase()} / ${meta.difficulty.toUpperCase()}  CASH ${money(meta.cash)}${meta.ending ? '  [ENDED]' : ''}`, 10, y + 23, { small: true, color: PAL.ash }));
      b.addChild(button('LOAD', 236, y + 4, 52, 12, () => {
        const st = loadFromSlot(slot);
        if (!st) return alertBox(g, 'Error', 'That save is corrupted.');
        win.close();
        startGameFromState(g, st);
      }, { small: true, fill: PAL.moss }));
      b.addChild(button('DEL', 236, y + 18, 52, 12, () => confirm(g, `Delete ${label}?`, () => { deleteSlot(slot); win.close(); openLoad(g); }), { small: true, fill: PAL.blood }));
    } else {
      b.addChild(text('- empty -', 10, y + 15, { color: PAL.grey }));
    }
    y += 38;
  }
  b.addChild(button('IMPORT SAVE FROM FILE...', 6, y + 2, 288, 14, () => {
    pickTextFile((s) => {
      try {
        const f = parseSave(s);
        win.close();
        startGameFromState(g, f.state);
      } catch (e) {
        alertBox(g, 'Import failed', String((e as Error).message));
      }
    });
  }));
}
