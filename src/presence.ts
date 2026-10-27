/**
 * Discord Rich Presence (the desktop build only). The Electron shell shows "Playing CAGE BOSS" on
 * the player's Discord profile (electron/presence.cjs); this tells it what they're up to: the mode,
 * the week, a fight in progress. In a browser, the Discord Activity and the phone apps there's no
 * bridge and this does nothing.
 */
import type { Game } from './ui/app';
import { bus } from './core/events';
import { TIER_NAME } from './sim/fighter';
import { TitleScene } from './ui/scenes/title';
import { ModesScene } from './ui/scenes/modes';
import { NewGameScene } from './ui/scenes/newgame';
import { FMCreateScene } from './ui/scenes/fmcreate';
import { QuickFightScene } from './ui/scenes/quickfight';
import { PaperScene } from './ui/scenes/paper';
import { LedgerScene } from './ui/scenes/ledger';
import { FightNightScene } from './ui/scenes/fightnight';
import { ContenderScene } from './ui/scenes/contender';
import { EndingScene } from './ui/scenes/ending';

/** The two lines under "Playing CAGE BOSS". */
export interface Activity {
  details: string;
  state?: string;
}

interface PresenceBridge {
  presence?: (a: Activity) => void;
}

/** What the Discord profile should say right now. */
export function describe(g: Game): Activity {
  const sc = g.scene;
  const cage = g.inLiveFight;
  if (sc instanceof QuickFightScene) return { details: 'Quick Fight', state: cage ? 'In the cage' : 'Picking fighters' };
  if (sc instanceof NewGameScene || sc instanceof FMCreateScene) return { details: 'Starting a new career' };
  const s = g.state;
  if (!s || sc instanceof TitleScene || sc instanceof ModesScene) return { details: 'In the menus' };
  const week = `Week ${s.week + 1}`;
  if (s.mode === 'fighter' && s.fm) {
    const details = s.fm.legacy ? 'Legacy Mode' : 'Road To Champion';
    const tier = TIER_NAME[s.fm.tier];
    if (cage) return { details, state: `In the cage • ${tier}` };
    if (s.fm.retired || sc instanceof EndingScene) return { details, state: 'Retired' };
    if (sc instanceof FightNightScene) return { details, state: `Fight night • ${tier}` };
    return { details, state: `${tier} • ${week}` };
  }
  const details = s.mode === 'sandbox' ? 'Sandbox' : 'Running the promotion';
  if (s.phase === 'ended' || sc instanceof EndingScene) return { details, state: 'Career over' };
  if (cage) return { details, state: `In the cage • ${week}` };
  if (sc instanceof ContenderScene) return { details, state: `Contender Series • ${week}` };
  if (sc instanceof FightNightScene) return { details, state: `Fight night • ${week}` };
  if (sc instanceof PaperScene) return { details, state: `Reading the paper • ${week}` };
  if (sc instanceof LedgerScene) return { details, state: `Closing the books • ${week}` };
  return { details, state: `At the desk • ${week}` };
}

/** Keep the Discord profile up to date (call once the game is running). */
export function installPresence(g: Game): void {
  const send = (globalThis as { cagebossDesktop?: PresenceBridge }).cagebossDesktop?.presence;
  if (!send) return;
  let last = '';
  const push = () => {
    try {
      const a = describe(g);
      const key = a.details + '\n' + (a.state ?? '');
      if (key === last) return;
      last = key;
      send(a);
    } catch {
      /* the profile line never gets in the game's way */
    }
  };
  bus.on('scene', push);
  // a new week, a fight starting: things that change without a new screen
  setInterval(push, 5000);
  push();
}
