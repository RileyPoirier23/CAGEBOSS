// Compares port/godot/tests/golden/<name>.node.json with <name>.godot.json; prints the first differences.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = join(dirname(fileURLToPath(import.meta.url)), '../../port/godot/tests/golden');
const names = process.argv[2] ? process.argv[2].split(',') : ['rng', 'content', 'generate', 'newgame', 'weeks', 'fights', 'live', 'road'];
let bad = 0;
for (const n of names) {
  const a = join(dir, `${n}.node.json`), b = join(dir, `${n}.godot.json`);
  if (!existsSync(b)) { console.log(`${n}: no Godot output`); bad++; continue; }
  const A = JSON.parse(readFileSync(a, 'utf8')), B = JSON.parse(readFileSync(b, 'utf8'));
  const diffs = [];
  const walk = (x, y, p) => {
    if (diffs.length > 12) return;
    if (typeof x === 'number' && typeof y === 'number') { if (x !== y && !(Object.is(x, -0) && y === 0) && !(x === 0 && Object.is(y, -0))) diffs.push(`${p}: ${x} != ${y}`); return; }
    if (x === null || y === null || typeof x !== 'object' || typeof y !== 'object') { if (x !== y) diffs.push(`${p}: ${JSON.stringify(x)?.slice(0, 80)} != ${JSON.stringify(y)?.slice(0, 80)}`); return; }
    if (Array.isArray(x) !== Array.isArray(y)) { diffs.push(`${p}: array vs object`); return; }
    if (Array.isArray(x)) { if (x.length !== y.length) diffs.push(`${p}: length ${x.length} != ${y.length}`); for (let i = 0; i < Math.min(x.length, y.length); i++) walk(x[i], y[i], `${p}[${i}]`); return; }
    const ka = Object.keys(x).filter((k) => x[k] !== undefined), kb = Object.keys(y).filter((k) => y[k] !== null || x[k] === null);
    for (const k of ka) if (!(k in y)) diffs.push(`${p}.${k}: missing in Godot`);
    for (const k of kb) if (!(k in x)) diffs.push(`${p}.${k}: extra in Godot (${JSON.stringify(y[k])?.slice(0, 60)})`);
    for (const k of ka) if (k in y) walk(x[k], y[k], `${p}.${k}`);
  };
  walk(A, B, n);
  if (diffs.length) { bad++; console.log(`${n}: DIFFERENT`); for (const d of diffs) console.log('   ' + d); } else console.log(`${n}: identical`);
}
process.exitCode = bad ? 1 : 0;
