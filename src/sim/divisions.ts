/** Division constants that the sim needs without loading content. */
export const DIVISION_LIMITS: Record<string, number> = {
  fly: 125, bantam: 135, feather: 145, light: 155, welter: 170, middle: 185, lightheavy: 205, heavy: 265,
  wstraw: 115, wfly: 125, wbantam: 135,
};

export const DIVISION_ORDER = ['fly', 'bantam', 'feather', 'light', 'welter', 'middle', 'lightheavy', 'heavy', 'wstraw', 'wfly', 'wbantam'];

export function divisionName(id: string): string {
  return ({
    fly: 'Flyweight', bantam: 'Bantamweight', feather: 'Featherweight', light: 'Lightweight', welter: 'Welterweight',
    middle: 'Middleweight', lightheavy: 'Light Heavyweight', heavy: 'Heavyweight', wstraw: "Women's Strawweight",
    wfly: "Women's Flyweight", wbantam: "Women's Bantamweight",
  } as Record<string, string>)[id] ?? id;
}

export function divisionShort(id: string): string {
  return ({ fly: 'FLY', bantam: 'BW', feather: 'FW', light: 'LW', welter: 'WW', middle: 'MW', lightheavy: 'LHW', heavy: 'HW', wstraw: 'WSW', wfly: 'WFLY', wbantam: 'WBW' } as Record<string, string>)[id] ?? id;
}
