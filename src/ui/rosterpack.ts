/**
 * Roster packs: export your fighters to a JSON file, import someone else's
 * (they arrive as free agents). Works in career and sandbox.
 */
import type { Game } from './app';
import type { Fighter } from '../core/types';
import { PAL } from '../art/palette';
import { downloadText, pickTextFile, alertBox } from './widgets';
import { hydrateFighter } from '../sim/generate';
import { content } from '../core/content';
import { Rng } from '../core/rng';

const STRIP: (keyof Fighter)[] = ['contract', 'injuries', 'legal', 'legalUntil', 'rivals', 'friends', 'beefReporters', 'beefWithYou', 'storyHistory', 'careerLog', 'h2h'];

export function exportRosterPack(g: Game): void {
  const s = g.state!;
  const fighters = Object.values(s.fighters)
    .filter((f) => f.promotion === 'us' && f.status !== 'retired')
    .map((f) => {
      const c: Record<string, unknown> = { ...f };
      for (const k of STRIP) delete c[k];
      return c;
    });
  downloadText(`cageboss-roster-${s.promotion.name.replace(/\W+/g, '_')}.json`, JSON.stringify({ kind: 'cageboss-roster', version: 1, from: s.promotion.name, fighters }, null, 1));
  g.toast(`Exported ${fighters.length} fighters.`, PAL.moss);
}

export function importRosterPack(g: Game, onDone: () => void): void {
  pickTextFile((txt) => {
    const s = g.state!;
    try {
      const data = JSON.parse(txt);
      const list: Partial<Fighter>[] = Array.isArray(data) ? data : data.fighters;
      if (!Array.isArray(list) || !list.length) throw new Error('No fighters in that file.');
      const rng = new Rng(s.rng ^ 0x9e37);
      let n = 0;
      for (const raw of list.slice(0, 200)) {
        if (!raw || typeof raw !== 'object' || !raw.first || !raw.last) continue;
        let id = String(raw.id ?? `${raw.first}_${raw.last}`).toLowerCase().replace(/[^a-z0-9_]/g, '_');
        while (s.fighters[id]) id += '_x';
        const divs = content().divisions.map((d) => d.id);
        const f = hydrateFighter({ ...raw, id, division: divs.includes(String(raw.division)) ? raw.division : divs[2] } as Partial<Fighter> & { id: string }, rng, content().names);
        f.promotion = null;
        f.status = 'active';
        f.contract = null;
        f.injuries = [];
        f.legal = 'free';
        s.fighters[id] = f;
        n++;
      }
      g.toast(`Imported ${n} fighters as free agents.`, PAL.moss);
      onDone();
    } catch (e) {
      alertBox(g, 'Import failed', String((e as Error).message ?? e));
    }
  });
}
