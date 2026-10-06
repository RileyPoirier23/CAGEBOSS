/** In-game calendar. Week 0 is the first week of January, Year 1. */
export const WEEKS_PER_YEAR = 52;
export const CAREER_WEEKS = 520;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface GameDate {
  year: number;
  month: number; // 0..11
  day: number; // 1..31 (monday of the week)
  weekOfYear: number;
}

export function dateOf(week: number): GameDate {
  const year = Math.floor(week / WEEKS_PER_YEAR) + 1;
  const weekOfYear = ((week % WEEKS_PER_YEAR) + WEEKS_PER_YEAR) % WEEKS_PER_YEAR;
  const dayOfYear = weekOfYear * 7;
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let m = 0;
  let d = dayOfYear;
  while (m < 11 && d >= lengths[m]) {
    d -= lengths[m];
    m++;
  }
  return { year, month: m, day: d + 1, weekOfYear };
}

export function fmtDate(week: number): string {
  const d = dateOf(week);
  return `${MONTHS[d.month]} ${d.day}, Y${d.year}`;
}

export function fmtDateLong(week: number): string {
  const d = dateOf(week);
  return `${MONTHS_LONG[d.month]} ${d.day}, Year ${d.year}`;
}

/** Saturday of the given week (fight nights). */
export function fmtFightDate(week: number): string {
  const d = dateOf(week);
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let day = d.day + 5;
  let m = d.month;
  if (day > lengths[m]) {
    day -= lengths[m];
    m = (m + 1) % 12;
  }
  return `SAT ${MONTHS[m]} ${day}`;
}

export function yearOf(week: number): number {
  return Math.floor(week / WEEKS_PER_YEAR) + 1;
}

export function quarterOf(week: number): number {
  return Math.floor(week / 13);
}

export function fmtClock(minutes: number): string {
  const total = 9 * 60 + Math.floor(minutes);
  let h = Math.floor(total / 60);
  const m = total % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export const DAY_MINUTES = 9 * 60; // 9am..6pm
