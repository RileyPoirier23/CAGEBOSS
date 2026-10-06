/**
 * Procedural multi-paragraph fighter backstories from templates
 * (data/documents/backstories.json) plus trait & off-cage colour.
 */
import type { Fighter } from '../core/types';
import { content } from '../core/content';
import { hashString } from '../core/rng';
import { pronouns } from './fighters';
import { divisionName } from './divisions';

export function fillBio(text: string, f: Fighter): string {
  const p = pronouns(f);
  const vars: Record<string, string> = {
    first: f.first, last: f.last, nick: f.nick, hometown: f.hometown, country: f.country, gym: f.gym, coach: f.coach,
    division: divisionName(f.division), style: f.styles[0] ?? 'brawler',
    he: p.he, his: p.his, him: p.him, He: p.He, His: p.His, himself: f.gender === 'W' ? 'herself' : 'himself',
  };
  return text.replace(/\{([a-zA-Z]+)\}/g, (m, k) => vars[k] ?? m);
}

export function bioFor(f: Fighter, revealSkeletons = false): string {
  if (f.bio) return fillBio(f.bio, f);
  const bs = content().backstories.find((b) => b.id === f.backstory) ?? content().backstories[0];
  const h = hashString(f.id + ':bio');
  const paras: string[] = [];
  if (bs) bs.paragraphs.forEach((alts, i) => paras.push(fillBio(alts[(h >>> (i * 3)) % alts.length], f)));
  const traitLines = content().templates.misc?.traitLines ?? [];
  const extra: string[] = [];
  for (const t of f.traits.slice(0, 3)) {
    const line = traitLines.find((l) => l.startsWith(t + '|'));
    if (line) extra.push(fillBio(line.split('|')[1], f));
  }
  const p = pronouns(f);
  if (f.family.spouse) extra.push(fillBio(`${p.He} is married to ${f.family.spouse}${f.family.kids ? ` and has ${f.family.kids} kid${f.family.kids > 1 ? 's' : ''}` : ''}.`, f));
  else if (f.family.kids) extra.push(`${p.He} has ${f.family.kids} kid${f.family.kids > 1 ? 's' : ''} and a complicated custody calendar.`);
  if (f.business.length) extra.push(`On the side, ${p.he} runs ${f.business.join(' and ')}.`);
  if (f.vices.length) extra.push(`Known weaknesses: ${f.vices.join(', ')}.`);
  if (revealSkeletons && f.skeletons.length) extra.push(fillBio(`SCOUT'S NOTE: ${p.he} ${f.skeletons.join('; ')}.`, f));
  if (extra.length) paras.push(extra.join(' '));
  return paras.join('\n\n');
}
