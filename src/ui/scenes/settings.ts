import type { Game } from '../app';
import { resetTutorial } from '../tutorial';
import { PAL } from '../../art/palette';
import { text, button } from '../kit';
import { openJukebox } from './jukebox';
import { desktop } from '../../desktop';
import { isTenFoot } from '../../core/platform';
import { openWindow, selector, checkbox, stepper } from '../widgets';

export function openSettings(g: Game, onClose?: () => void): void {
  const win = openWindow(g, 'Settings', 260, desktop ? 262 : isTenFoot ? 266 : 250, { onClose });
  const b = win.body;
  const s = g.settings;
  const save = () => g.applySettings();
  let y = 4;
  const row = (label: string) => {
    b.addChild(text(label, 8, y + 3, { color: PAL.ash }));
  };
  row('Text speed');
  b.addChild(selector(110, y, 140, [
    { value: 1, label: 'Slow' }, { value: 2, label: 'Normal' }, { value: 3, label: 'Fast' }, { value: 4, label: 'Instant' },
  ], s.textSpeed, (v) => { s.textSpeed = v; save(); }));
  y += 17;
  row('UI scale');
  b.addChild(selector(110, y, 140, [
    { value: 0, label: 'Auto (fit)' }, { value: 1, label: '1x' }, { value: 2, label: '2x' }, { value: 3, label: '3x' }, { value: 4, label: '4x' }, { value: 5, label: '5x' },
  ], s.uiScale, (v) => { s.uiScale = v; save(); }));
  y += 17;
  row('Fight speed');
  b.addChild(selector(110, y, 140, [
    { value: 1, label: 'Slow-mo' }, { value: 2, label: 'Normal' }, { value: 3, label: 'Fast' }, { value: 4, label: 'Blitz' },
  ], s.fightSpeed, (v) => { s.fightSpeed = v; save(); }));
  y += 17;
  row('Desk clock');
  b.addChild(selector(110, y, 140, [
    { value: 0.5, label: 'Relaxed' }, { value: 1, label: 'Normal' }, { value: 1.5, label: 'Hectic' },
  ], s.clockSpeed, (v) => { s.clockSpeed = v; save(); }));
  y += 17;
  row('SFX volume');
  b.addChild(stepper(110, y, 140, Math.round(s.sfxVolume * 10), 0, 10, 1, (v) => v * 10 + '%', (v) => { s.sfxVolume = v / 10; save(); }));
  y += 17;
  row('Music volume');
  b.addChild(stepper(110, y, 140, Math.round((s.musicVolume ?? 0.6) * 10), 0, 10, 1, (v) => v * 10 + '%', (v) => { s.musicVolume = v / 10; save(); }));
  y += 20;
  b.addChild(checkbox(8, y, 'Colour-blind palette', s.colorblind, (v) => { s.colorblind = v; save(); g.scene?.refresh(); }));
  y += 12;
  b.addChild(checkbox(8, y, 'Reduce screen shake', s.reduceShake, (v) => { s.reduceShake = v; save(); }));
  y += 12;
  b.addChild(checkbox(8, y, 'Mute all audio (M)', s.mute, (v) => { s.mute = v; save(); }));
  y += 12;
  b.addChild(checkbox(8, y, 'Soundtrack (N = next track)', s.music, (v) => { s.music = v; save(); }));
  y += 12;
  b.addChild(checkbox(8, y, 'Juiced Butler intros before watched fights', s.intros !== false, (v) => { s.intros = v; save(); }));
  y += 12;
  b.addChild(checkbox(8, y, 'Live Bleeter feed during fights', s.bleets !== false, (v) => { s.bleets = v; save(); }));
  y += 12;
  b.addChild(checkbox(8, y, 'Bleep the swearing (streamer mode)', !!s.bleep, (v) => { s.bleep = v; save(); g.scene?.refresh(); }));
  y += 12;
  b.addChild(checkbox(8, y, 'Offer the tutorial on new careers', s.tutorial !== false, (v) => { s.tutorial = v; save(); }));
  if (g.state?.mode === 'career') b.addChild(button('REPLAY', 196, y - 1, 46, 11, () => { resetTutorial(g); g.toast('Tutorial back on for this career.', PAL.moss, { small: true }); }, { small: true, fill: PAL.steel }));
  y += 12;
  b.addChild(checkbox(8, y, 'Hands-on fights in Fighter Mode', s.handsOn !== false, (v) => { s.handsOn = v; save(); }));
  y += 12;
  if (desktop) {
    b.addChild(checkbox(8, y, 'Fullscreen (F11)', s.fullscreen !== false, (v) => { s.fullscreen = v; save(); }));
    y += 12;
  }
  if (isTenFoot) {
    // consoles: shrink the picture away from TV overscan
    row('TV-safe margin');
    b.addChild(stepper(110, y, 140, s.tvSafe ?? 0, 0, 5, 1, (v) => v + '%', (v) => { s.tvSafe = v; save(); }));
    y += 17;
  }
  b.addChild(button('JUKEBOX...', 8, y, 80, 13, () => openJukebox(g), { small: true, fill: PAL.plum }));
}
