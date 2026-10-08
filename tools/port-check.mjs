// The TypeScript side of port/godot/tests/rng_check.gd: same seed, same draws, same output.
// npx esbuild tools/port-check.mjs --bundle --platform=node --format=esm --outfile=/tmp/pc.mjs && node /tmp/pc.mjs
import { Rng, hashString } from '../src/core/rng';

const r = new Rng(hashString('cage boss'));
const out = [String(hashString('Spadam Biggs'))];
for (let i = 0; i < 100000; i++) {
  const v = r.next();
  if (i % 10000 === 0) out.push(String(Math.round(v * 4294967296)));
}
out.push(String(r.int(1, 100)));
out.push(r.gauss().toFixed(15));
out.push(String(r.state));
console.log(out.join('\n'));
