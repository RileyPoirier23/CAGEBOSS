/**
 * Achievements: pure checks on the game state. Unlocks are remembered across saves by the UI
 * (src/ui/achievements.ts), which also plays the congratulations screen.
 */
import type { GameState } from '../core/types';
import type { FMState } from './fighter';

export type AchMode = 'career' | 'rtc' | 'legacy' | 'fighter' | 'any';
export interface Achievement {
  id: string;
  name: string;
  desc: string;
  mode: AchMode;
  icon: 'belt' | 'glove' | 'money' | 'paper' | 'skull' | 'star' | 'soup' | 'mic';
  test: (s: GameState) => boolean;
}

const fmS = (s: GameState): FMState | null => (s.mode === 'fighter' ? (s.fm as FMState | undefined) ?? null : null);
const hist = (s: GameState) => fmS(s)?.history ?? [];
const wins = (s: GameState) => hist(s).filter((h) => h.result === 'W');
const isChamp = (s: GameState) => {
  const st = fmS(s);
  return !!st && Object.values(s.belts).some((b) => b.holder === st.player && !b.symbolic);
};
const done = (s: GameState) => s.events.filter((e) => e.status === 'done');

export const ACHIEVEMENTS: Achievement[] = [
  // ---------------- the fighter (both fighter modes)
  { id: 'fm_first_w', name: 'FIRST BLOOD', desc: 'Win your first fight.', mode: 'fighter', icon: 'glove', test: (s) => wins(s).length >= 1 },
  { id: 'fm_ko', name: 'LIGHTS OUT', desc: 'Win a fight by KO or TKO.', mode: 'fighter', icon: 'skull', test: (s) => wins(s).some((h) => /^T?KO/.test(h.method)) },
  { id: 'fm_sub', name: 'TAP, SNAP OR NAP', desc: 'Win a fight by submission.', mode: 'fighter', icon: 'glove', test: (s) => wins(s).some((h) => /^SUB/.test(h.method)) },
  { id: 'fm_dec', name: 'JUDGES\' DARLING', desc: 'Win a decision. Somebody had to.', mode: 'fighter', icon: 'paper', test: (s) => wins(s).some((h) => /^DEC/.test(h.method)) },
  { id: 'fm_pro', name: 'GOING PRO', desc: 'Turn pro: your record starts over at 0-0.', mode: 'fighter', icon: 'star', test: (s) => fmS(s)?.turnedPro !== undefined },
  { id: 'fm_first_belt', name: 'SHINY', desc: 'Win your first belt.', mode: 'fighter', icon: 'belt', test: (s) => (fmS(s)?.stats?.belts ?? 0) >= 1 },
  { id: 'fm_lounge', name: 'LOUNGE ACT', desc: "Make it to the Professional Fighters' Lounge.", mode: 'fighter', icon: 'star', test: (s) => fmS(s)?.tier === 'pfl' || fmS(s)?.tier === 'of' },
  { id: 'fm_show', name: 'THE BIG SHOW', desc: 'Sign with the CBFC.', mode: 'fighter', icon: 'star', test: (s) => fmS(s)?.tier === 'of' },
  { id: 'fm_champ', name: 'UNDISPUTED', desc: 'Become CBFC champion.', mode: 'fighter', icon: 'belt', test: (s) => fmS(s)?.tier === 'of' && isChamp(s) },
  { id: 'fm_streak5', name: 'HEATER', desc: 'Win five in a row.', mode: 'fighter', icon: 'glove', test: (s) => (fmS(s)?.stats?.best ?? 0) >= 5 },
  { id: 'fm_10w', name: 'DOUBLE DIGITS', desc: 'Win ten fights.', mode: 'fighter', icon: 'glove', test: (s) => wins(s).length >= 10 },
  { id: 'fm_reader', name: 'READ THE FINE PRINT', desc: 'Catch five bad lines in your paperwork.', mode: 'fighter', icon: 'paper', test: (s) => (fmS(s)?.stats?.docsCaught ?? 0) >= 5 },
  { id: 'fm_binding', name: 'LEGALLY BINDING', desc: 'Sign a contract with a mistake in it. Live with it.', mode: 'fighter', icon: 'paper', test: (s) => (fmS(s)?.stats?.badSigned ?? 0) >= 1 },
  { id: 'fm_rap', name: 'A FILE THIS THICK', desc: 'Get three entries on your rap sheet.', mode: 'fighter', icon: 'skull', test: (s) => (fmS(s)?.rap?.length ?? 0) >= 3 },
  { id: 'fm_jerky', name: 'CONTAMINATED JERKY', desc: 'Fail a drug test.', mode: 'fighter', icon: 'skull', test: (s) => (fmS(s)?.ped.caught ?? 0) >= 1 },
  { id: 'fm_creator', name: 'CONTENT CREATOR', desc: 'Join Only Fighters.', mode: 'fighter', icon: 'mic', test: (s) => !!fmS(s)?.ofa.joined },
  { id: 'fm_bk', name: 'BARE KNUCKLES, BARE MINIMUM', desc: "Fight on Bradie's bareknuckle circuit.", mode: 'fighter', icon: 'skull', test: (s) => ((fmS(s)?.bk.w ?? 0) + (fmS(s)?.bk.l ?? 0)) >= 1 },
  { id: 'fm_media', name: 'MEDIA DARLING', desc: 'Do five interviews.', mode: 'fighter', icon: 'mic', test: (s) => (fmS(s)?.stats?.interviews ?? 0) >= 5 },
  { id: 'fm_rich', name: 'FIGHT MONEY', desc: 'Have $100,000 in the bank.', mode: 'fighter', icon: 'money', test: (s) => (fmS(s)?.money ?? 0) >= 100000 },
  // ---------------- Road To Champion (the story)
  { id: 'rtc_soup', name: 'SAVE THE SOUP', desc: "Pay off Ray's back rent.", mode: 'rtc', icon: 'soup', test: (s) => !!fmS(s)?.story?.gymSaved },
  { id: 'rtc_rival', name: 'TRUST FUND, BANKRUPT', desc: 'Beat Tyler "Trust Fund" Vance.', mode: 'rtc', icon: 'glove', test: (s) => wins(s).some((h) => h.opp === 'rival') },
  { id: 'rtc_epilogue', name: 'THE ROAD', desc: 'Finish the Road To Champion story.', mode: 'rtc', icon: 'belt', test: (s) => !!fmS(s)?.story?.seen.includes('c4_champ') },
  // ---------------- Legacy Mode
  { id: 'leg_start', name: 'NO SCRIPT', desc: 'Start a Legacy Mode career.', mode: 'legacy', icon: 'star', test: (s) => !!fmS(s)?.legacy },
  { id: 'leg_chaos', name: 'MORE F***ING AROUND', desc: 'Legacy Mode: five entries on your rap sheet.', mode: 'legacy', icon: 'skull', test: (s) => !!fmS(s)?.legacy && (fmS(s)?.rap?.length ?? 0) >= 5 },
  // ---------------- the promoter
  { id: 'c_first_event', name: 'DOORS OPEN', desc: 'Run your first event.', mode: 'career', icon: 'mic', test: (s) => done(s).length >= 1 },
  { id: 'c_ten_events', name: 'THE MACHINE', desc: 'Run ten events.', mode: 'career', icon: 'mic', test: (s) => done(s).length >= 10 },
  { id: 'c_ppv', name: 'PAY TO WATCH', desc: 'Run a pay-per-view.', mode: 'career', icon: 'money', test: (s) => done(s).some((e) => e.ppv) },
  { id: 'c_sellout', name: 'STANDING ROOM', desc: 'Draw 15,000 to one event.', mode: 'career', icon: 'star', test: (s) => done(s).some((e) => (e.fin?.attendance ?? 0) >= 15000) },
  { id: 'c_presented', name: 'BROUGHT TO YOU BY', desc: 'Have a sponsor present an event.', mode: 'career', icon: 'money', test: (s) => done(s).some((e) => !!e.presentedBy) },
  { id: 'c_act2', name: 'STILL HERE', desc: 'Reach Act 2.', mode: 'career', icon: 'star', test: (s) => s.mode !== 'fighter' && s.act >= 2 },
  { id: 'c_act3', name: 'TOO BIG TO FAIL', desc: 'Reach Act 3.', mode: 'career', icon: 'star', test: (s) => s.mode !== 'fighter' && s.act >= 3 },
  { id: 'c_rich', name: 'EIGHT FIGURES', desc: 'Have $10,000,000 in the bank.', mode: 'career', icon: 'money', test: (s) => s.mode !== 'fighter' && s.promotion.cash >= 10_000_000 },
  { id: 'c_clean', name: 'BY THE BOOK', desc: 'Stamp 50 documents correctly.', mode: 'career', icon: 'paper', test: (s) => s.mode !== 'fighter' && s.desk.log.filter((x) => x.correct).length >= 50 },
  { id: 'c_ending', name: 'ONE WAY OR ANOTHER', desc: 'Reach an ending.', mode: 'career', icon: 'belt', test: (s) => s.mode !== 'fighter' && !!s.ending },
];

/** Which achievements this state has earned (whatever was unlocked before). */
export function earned(s: GameState): Achievement[] {
  const legacy = !!fmS(s)?.legacy;
  return ACHIEVEMENTS.filter((a) => {
    if (a.mode === 'career' && s.mode === 'fighter') return false;
    if ((a.mode === 'fighter' || a.mode === 'rtc' || a.mode === 'legacy') && s.mode !== 'fighter') return false;
    if (a.mode === 'rtc' && legacy) return false;
    if (a.mode === 'legacy' && !legacy) return false;
    try {
      return a.test(s);
    } catch {
      return false;
    }
  });
}
