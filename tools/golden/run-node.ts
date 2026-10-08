// Runs the golden scenarios in Node and writes port/godot/tests/golden/<name>.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadContent, ROOT } from '../loadContent';
import { SCENARIOS, runScenario } from './scenarios';

loadContent();
const dir = join(ROOT, 'port/godot/tests/golden');
mkdirSync(dir, { recursive: true });
const only = process.argv[2] ? process.argv[2].split(',') : SCENARIOS;
for (const name of only) {
  const t = Date.now();
  writeFileSync(join(dir, `${name}.node.json`), JSON.stringify(runScenario(name)));
  console.log(`${name}: ${Date.now() - t} ms`);
}
