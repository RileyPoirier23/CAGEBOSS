import type { Game } from '../app';
import { PAL } from '../../art/palette';
import { text, button } from '../kit';
import { openJukebox } from './jukebox';
import { openWindow, selector, checkbox, stepper } from '../widgets';

export function openSettings(g: Game, onClose?: () => void): void {
  const win = openWindow(g, 'Settings', 260, 253, { onClose });
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
  y += 15;
  b.addChild(checkbox(8, y, 'Reduce screen shake', s.reduceShake, (v) => { s.reduceShake = v; save(); }));
  y += 15;
  b.addChild(checkbox(8, y, 'Mute all audio (M)', s.mute, (v) => { s.mute = v; save(); }));
  y += 15;
  b.addChild(checkbox(8, y, 'Soundtrack (N = next track)', s.music, (v) => { s.music = v; save(); }));
  y += 15;
  b.addChild(checkbox(8, y, 'Juiced Butler intros before watched fights', s.intros !== false, (v) => { s.intros = v; save(); }));
  y += 15;
  b.addChild(checkbox(8, y, 'Bleep the swearing (streamer mode)', !!s.bleep, (v) => { s.bleep = v; save(); g.scene?.refresh(); }));
  y += 15;
  b.addChild(button('JUKEBOX...', 8, y, 80, 13, () => openJukebox(g), { small: true, fill: PAL.plum }));
}
