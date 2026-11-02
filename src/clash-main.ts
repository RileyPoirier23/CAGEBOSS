/* UNIVERSE CLASH - the page boot.
   Its own entry point, its own bundle. Nothing here is imported by CAGE BOSS or
   CAGE BOSS II. */

import './clash/style.css';
import { ClashApp } from './clash/app';

function boot(): void {
  const app = new ClashApp();
  // Console handle for the same poking about that __game allows in CAGE BOSS.
  (window as unknown as { __clash: ClashApp }).__clash = app;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
