/** Node-side content loader: reads every JSON file under data/. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildContent, setContent, type Content } from '../src/core/content';

export const ROOT = new URL('..', import.meta.url).pathname;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

export function loadRawFiles(): Record<string, unknown> {
  const files: Record<string, unknown> = {};
  for (const p of walk(join(ROOT, 'data'))) {
    const rel = '/' + relative(ROOT, p).replace(/\\/g, '/');
    try {
      files[rel] = JSON.parse(readFileSync(p, 'utf8'));
    } catch (e) {
      throw new Error(`Invalid JSON in ${rel}: ${(e as Error).message}`);
    }
  }
  return files;
}

export function loadContent(): Content {
  const c = buildContent(loadRawFiles());
  setContent(c);
  return c;
}
