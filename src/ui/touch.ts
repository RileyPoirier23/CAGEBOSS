/**
 * Phone / tablet support:
 *  - no page scroll, rubber-band bounce, double-tap zoom or iOS pinch-zoom of the page
 *  - two-finger pinch = magnifier: zooms / pans the whole game canvas (CSS transform, so
 *    Pixi's hit testing follows automatically); the second finger never reaches the game
 *  - zoom buttons (+ / - / 1:1) in the letterbox margin when touch is the input
 *  - "rotate your phone" prompt in portrait
 *
 * installTouch() must run BEFORE Pixi's EventSystem is created (i.e. before game.init) so
 * its window capture listeners see pointer events first.
 */
import { input } from '../core/input';
import { isTouchDevice } from '../core/platform';

const MAX_ZOOM = 3;

let canvas: HTMLCanvasElement | null = null;
let zoom = 1;
let pan = { x: 0, y: 0 };
const touches = new Map<number, { x: number; y: number }>();
let gesture: { d0: number; z0: number; u: { x: number; y: number } } | null = null;
let ui: HTMLDivElement | null = null;
/** off during hands-on fights: two thumbs (stick + a button) are not a pinch */
let pinchOn = true;

/** Hands-on fights turn the magnifier off (and reset it) while they run. */
export function setPinchZoom(on: boolean): void {
  pinchOn = on;
  if (!on) {
    touches.clear();
    gesture = null;
    resetZoom();
  }
  updateUi();
}

function center(): { x: number; y: number } {
  // untransformed canvas centre in client coordinates
  const r = canvas!.getBoundingClientRect();
  return { x: r.left + r.width / 2 - pan.x, y: r.top + r.height / 2 - pan.y };
}

function apply(): void {
  if (!canvas) return;
  const cw = canvas.offsetWidth;
  const ch = canvas.offsetHeight;
  zoom = Math.max(1, Math.min(MAX_ZOOM, zoom));
  const mx = ((zoom - 1) * cw) / 2;
  const my = ((zoom - 1) * ch) / 2;
  pan.x = Math.max(-mx, Math.min(mx, pan.x));
  pan.y = Math.max(-my, Math.min(my, pan.y));
  if (zoom <= 1.001) {
    zoom = 1;
    pan = { x: 0, y: 0 };
    canvas.style.transform = '';
  } else canvas.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  updateUi();
}

/** Zoom by a factor about the screen centre (zoom buttons). */
export function zoomBy(f: number): void {
  const z = Math.max(1, Math.min(MAX_ZOOM, zoom * f));
  pan = { x: (pan.x * z) / zoom, y: (pan.y * z) / zoom };
  zoom = z;
  apply();
}

export function resetZoom(): void {
  zoom = 1;
  apply();
}

export function getZoom(): number {
  return zoom;
}

function mid(): { x: number; y: number; d: number } {
  const [a, b] = [...touches.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
}

function startGesture(): void {
  const m = mid();
  const c = center();
  gesture = { d0: m.d, z0: zoom, u: { x: (m.x - c.x - pan.x) / zoom, y: (m.y - c.y - pan.y) / zoom } };
}

function onPointer(e: PointerEvent): void {
  if (!e.isTrusted || e.pointerType !== 'touch' || !pinchOn) return;
  const onCanvas = e.target === canvas;
  if (e.type === 'pointerdown') {
    if (!onCanvas && !gesture) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2 && !gesture) {
      // cancel whatever the first finger started (button press / drag) without clicking it
      const [firstId, p] = [...touches.entries()].find(([id]) => id !== e.pointerId)!;
      document.body.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, pointerId: firstId, pointerType: 'touch', isPrimary: true, clientX: p.x, clientY: p.y, button: 0, buttons: 0,
      }));
      startGesture();
    }
    if (gesture) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
    return;
  }
  if (!touches.has(e.pointerId)) return;
  if (e.type === 'pointermove') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture && touches.size >= 2) {
      const m = mid();
      zoom = Math.max(1, Math.min(MAX_ZOOM, (gesture.z0 * m.d) / gesture.d0));
      const c = center();
      pan = { x: m.x - c.x - zoom * gesture.u.x, y: m.y - c.y - zoom * gesture.u.y };
      apply();
    }
  } else {
    touches.delete(e.pointerId);
    if (gesture && touches.size === 1) startGesture(); // keep the remaining finger swallowed
  }
  if (gesture) {
    e.stopImmediatePropagation();
    if (touches.size === 0) gesture = null;
  }
}

// ------------------------------------------------------------ zoom buttons

function updateUi(): void {
  if (!ui || !canvas) return;
  const show = pinchOn && input.lastDevice === 'touch' && !document.body.classList.contains('portrait');
  ui.style.display = show ? 'flex' : 'none';
  if (!show) return;
  (ui.querySelector('[data-z="reset"]') as HTMLElement).style.visibility = zoom > 1 ? 'visible' : 'hidden';
  // the untransformed game box (the magnifier transform is about its centre)
  const c = center();
  const left = c.x - canvas.offsetWidth / 2;
  const top = c.y - canvas.offsetHeight / 2;
  const right = window.innerWidth - (left + canvas.offsetWidth);
  ui.style.top = `${Math.round(top + canvas.offsetHeight / 2 - 60)}px`;
  if (right >= 40) {
    ui.style.left = `${Math.round(left + canvas.offsetWidth + (right - 34) / 2)}px`;
    ui.style.opacity = '1';
  } else if (left >= 40) {
    ui.style.left = `${Math.round((left - 34) / 2)}px`;
    ui.style.opacity = '1';
  } else {
    ui.style.left = `${Math.round(left + canvas.offsetWidth - 36)}px`;
    ui.style.opacity = '0.6';
  }
}

function buildUi(): void {
  ui = document.createElement('div');
  ui.id = 'zoom-ui';
  const mk = (label: string, key: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.z = key;
    b.setAttribute('aria-label', key === 'reset' ? 'Reset zoom' : key === 'in' ? 'Zoom in' : 'Zoom out');
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
    ui!.appendChild(b);
  };
  mk('+', 'in', () => zoomBy(1.5));
  mk('-', 'out', () => zoomBy(1 / 1.5));
  mk('1:1', 'reset', resetZoom);
  document.body.appendChild(ui);
}

// ------------------------------------------------------------ rotate prompt

function buildRotate(): HTMLDivElement {
  const d = document.createElement('div');
  d.id = 'rotate';
  // pixel phone turning sideways, drawn with crisp SVG rects
  d.innerHTML = `
    <svg class="phone" viewBox="0 0 16 16" width="96" height="96" shape-rendering="crispEdges" aria-hidden="true">
      <rect x="5" y="1" width="6" height="14" fill="#e6dcc4"/>
      <rect x="6" y="2" width="4" height="11" fill="#262128"/>
      <rect x="7" y="14" width="2" height="1" fill="#6f6974"/>
      <rect x="7" y="4" width="2" height="1" fill="#c4a04a"/>
    </svg>
    <div class="t1">ROTATE YOUR PHONE</div>
    <div class="t2">CAGE BOSS PLAYS IN LANDSCAPE</div>`;
  document.body.appendChild(d);
  return d;
}

function checkOrientation(): void {
  const portrait = isTouchDevice() && window.innerHeight > window.innerWidth;
  document.body.classList.toggle('portrait', portrait);
  updateUi();
}

// ------------------------------------------------------------ install

export function installTouch(): void {
  // page-level guards: no scroll, bounce, double-tap or pinch zoom of the page itself
  const notInput = (e: Event) => {
    const t = e.target as HTMLElement | null;
    return !(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'));
  };
  document.addEventListener('touchmove', (e) => notInput(e) && e.preventDefault(), { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('contextmenu', (e) => {
    if ((e as PointerEvent).pointerType === 'touch' || isTouchDevice()) e.preventDefault();
  });
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const) window.addEventListener(t, onPointer, { capture: true, passive: false });

  buildRotate();
  buildUi();
  window.addEventListener('resize', () => {
    checkOrientation();
    resetZoom();
  });
  window.addEventListener('orientationchange', checkOrientation);
  input.on('device', () => updateUi());
  checkOrientation();
}

/** Call once the canvas exists. */
export function attachTouchCanvas(c: HTMLCanvasElement): void {
  canvas = c;
  canvas.style.transformOrigin = '50% 50%';
  apply();
}
