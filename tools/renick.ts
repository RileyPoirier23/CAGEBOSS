/**
 * Re-roll nicknames on the generated roster without touching anything else.
 *   npx tsx tools/renick.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Rng } from '../src/core/rng';
import { makeNickname } from '../src/sim/generate';
import type { NameTables } from '../src/core/content';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const names: NameTables = JSON.parse(readFileSync(join(ROOT, 'data/roster/names.json'), 'utf8'));
const path = join(ROOT, 'data/roster/generated.json');
const data = JSON.parse(readFileSync(path, 'utf8'));
const cultureOf = (country: string) => names.cultures.find((c) => c.countries.includes(country))?.id;
const used = new Map<string, number>();
for (const f of data.fighters) {
  let h = 2166136261;
  for (const ch of f.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rng = new Rng(h >>> 0);
  let nick = '';
  for (let tries = 0; tries < 8; tries++) {
    nick = makeNickname(rng, names, { styles: f.styles, traits: f.traits, culture: cultureOf(f.country), division: f.division, gender: f.gender });
    if ((used.get(nick) ?? 0) < 1) break;
  }
  used.set(nick, (used.get(nick) ?? 0) + 1);
  f.nick = nick;
}
writeFileSync(path, JSON.stringify(data, null, 0).replace(/\},\{/g, '},\n{'));
console.log(`Re-nicked ${data.fighters.length} fighters, ${used.size} unique nicknames`);
