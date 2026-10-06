/** Browser-side content loader: Vite bundles every JSON file under data/. */
import { buildContent, setContent, type Content } from './core/content';

const modules = import.meta.glob('/data/**/*.json', { eager: true, import: 'default' });

export function loadBrowserContent(): Content {
  const c = buildContent(modules as Record<string, unknown>);
  setContent(c);
  return c;
}
