import type { Game } from '../app';
import { PAL } from '../../art/palette';
import { text, button, box } from '../kit';
import { openWindow, confirm, pickTextFile, alertBox } from '../widgets';
import { slotsFor, slotMeta, loadFromSlot, deleteSlot, parseSave, saveToSlot, familyOf, isAutoSlot, ALL_SLOTS, FAMILY_NAME, type SaveFamily, type SlotId, type SaveMeta } from '../../core/save';
import { money } from '../../core/format';
import { startGameFromState } from '../flow';

const slotLabel = (slot: SlotId) => (isAutoSlot(slot) ? 'AUTOSAVE' : 'SLOT ' + slot.replace(/^[rl]/, ''));

/** The most recent save of any kind (for CONTINUE on the title screen). */
export function latestSave(): { slot: SlotId; meta: SaveMeta } | null {
  let best: { slot: SlotId; meta: SaveMeta } | null = null;
  for (const slot of ALL_SLOTS) {
    const meta = slotMeta(slot);
    if (meta && !meta.ending && (!best || (meta.savedAt ?? 0) > (best.meta.savedAt ?? 0))) best = { slot, meta };
  }
  return best;
}

export function continueLatest(g: Game): boolean {
  const l = latestSave();
  if (!l) return false;
  const st = loadFromSlot(l.slot);
  if (!st) {
    alertBox(g, 'Error', 'That save is corrupted.');
    return false;
  }
  startGameFromState(g, st, st.mode === 'fighter' ? 'Back to camp' : 'Loading your empire');
  return true;
}

/** Load: one tab per kind of game (promoter career, Road To Champion, Legacy Mode). */
export function openLoad(g: Game, fam: SaveFamily = 'career'): void {
  const win = openWindow(g, 'Load', 300, 212);
  const b = win.body;
  (['career', 'rtc', 'legacy'] as SaveFamily[]).forEach((f, i) => {
    const n = slotsFor(f).filter((x) => slotMeta(x)).length;
    b.addChild(button(`${FAMILY_NAME[f].toUpperCase()}${n ? ` (${n})` : ''}`, 6 + i * 97, 2, 93, 13, () => { win.close(); openLoad(g, f); }, { small: true, fill: f === fam ? PAL.gold : PAL.shadow }));
  });
  let y = 20;
  for (const slot of slotsFor(fam)) {
    const meta = slotMeta(slot);
    b.addChild(box(288, 34, PAL.ink, PAL.slate)).position.set(6, y);
    const label = slotLabel(slot);
    b.addChild(text(label, 10, y + 3, { small: true, color: PAL.gold }));
    if (meta) {
      const fighter = meta.mode === 'fighter';
      b.addChild(text(fighter ? `${meta.name}  •  ${meta.record ?? ''}` : `${meta.name}  •  ${meta.date}  •  Act ${meta.act}`, 10, y + 11, { color: PAL.bone, width: 222, maxLines: 1 }));
      b.addChild(text(fighter ? `${(meta.league ?? '').toUpperCase()}  •  ${meta.date}  •  ${money(meta.cash)}` : `${meta.mode.toUpperCase()} / ${meta.difficulty.toUpperCase()}  CASH ${money(meta.cash)}${meta.ending ? '  [ENDED]' : ''}`, 10, y + 23, { small: true, color: PAL.ash, width: 222, maxLines: 1 }));
      b.addChild(button('LOAD', 236, y + 4, 52, 12, () => {
        const st = loadFromSlot(slot);
        if (!st) return alertBox(g, 'Error', 'That save is corrupted.');
        win.close();
        startGameFromState(g, st, fighter ? 'Back to camp' : 'Loading your empire');
      }, { small: true, fill: PAL.moss }));
      b.addChild(button('DEL', 236, y + 18, 52, 12, () => confirm(g, `Delete ${label}?`, () => { deleteSlot(slot); win.close(); openLoad(g, fam); }), { small: true, fill: PAL.blood }));
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

/** Save the current game to one of its kind's manual slots. */
export function openSaveSlots(g: Game): void {
  const s = g.state!;
  const fam = familyOf(s);
  const win = openWindow(g, `Save: ${FAMILY_NAME[fam]}`, 240, 82);
  let y = 4;
  for (const slot of slotsFor(fam).filter((x) => !isAutoSlot(x))) {
    const meta = slotMeta(slot);
    win.body.addChild(button(`${slotLabel(slot)}${meta ? ` - ${meta.name.slice(0, 18)} ${meta.record ?? meta.date}` : ' - empty'}`, 6, y, 228, 14, () => {
      const go = () => {
        const ok = saveToSlot(s, slot);
        g.toast(ok ? `Saved to ${slotLabel(slot).toLowerCase()}` : 'Save failed', ok ? PAL.moss : PAL.blood, { small: true });
        win.close();
      };
      if (meta) confirm(g, `Overwrite ${slotLabel(slot).toLowerCase()}?`, go);
      else go();
    }, { small: true, disabled: s.difficulty === 'ironman' }));
    y += 17;
  }
  win.body.addChild(text('The autosave is written every week.', 6, y + 2, { small: true, color: PAL.ash }));
}
