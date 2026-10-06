/**
 * Jukebox: pick a track from the CAGE BOSS soundtrack.
 */
import { Container } from 'pixi.js';
import type { Game } from '../app';
import { PAL } from '../../art/palette';
import { text, box, button, clickable } from '../kit';
import { openWindow } from '../widgets';
import { TRACKS, playTrack, nowPlaying, skipTrack } from '../../audio/music';

export function openJukebox(g: Game): void {
  const ROW = 15;
  const win = openWindow(g, 'Jukebox', 300, 44 + TRACKS.length * ROW);
  const draw = () => {
    win.body.removeChildren().forEach((c) => c.destroy({ children: true }));
    const now = nowPlaying();
    win.body.addChild(text('THE CAGE BOSS SOUNDTRACK  •  local artists, all killer', 6, 2, { small: true, color: PAL.ash }));
    TRACKS.forEach((t, i) => {
      const playing = now?.id === t.id;
      const row = clickable(new Container(), () => {
        if (!g.settings.music) {
          g.settings.music = true;
          g.applySettings();
        }
        playTrack(t);
        draw();
      });
      row.addChild(box(288, ROW - 1, playing ? 0x3a3020 : i % 2 ? 0x2a2630 : 0x24212a, playing ? PAL.gold : undefined));
      const title = text(`${playing ? '▶ ' : ''}${t.title}`, 5, 3, { color: playing ? PAL.gold : PAL.bone, width: 150, maxLines: 1 });
      row.addChild(title);
      row.addChild(text(t.artist, 160, 5, { small: true, color: PAL.ash, width: 124, maxLines: 1 }));
      row.position.set(0, 12 + i * ROW);
      win.body.addChild(row);
    });
    win.body.addChild(button('NEXT TRACK (N)', 6, 14 + TRACKS.length * ROW, 90, 12, () => {
      skipTrack();
      draw();
    }, { small: true, fill: PAL.steel }));
  };
  draw();
}
