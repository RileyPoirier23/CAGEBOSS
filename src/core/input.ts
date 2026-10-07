/**
 * Unified input: gamepads (Gamepad API, standard mapping / Xbox layout), keyboard,
 * mouse and touch behind one action-based API.
 *
 *   import { input } from './core/input';
 *   input.start();                      // once, at boot (adds the DOM listeners)
 *   input.update();                     // once per frame, before reading
 *   if (input.pressed('confirm')) ...   // went down this frame (any bound pad button / key)
 *   input.down('block')                 // held
 *   input.stick('move')                 // {x, y} in -1..1, radial deadzone applied (pad or WASD/arrows)
 *   input.trigger('RT')                 // 0..1 analog
 *   input.on('press', (e) => ...)       // button/key events with the action(s) they map to
 *   input.rumble(0.6, 0.3, 120)         // vibrationActuator when the pad has one
 *   input.lastDevice                    // 'gamepad' | 'keyboard' | 'mouse' | 'touch' (for prompt glyphs)
 *
 * Bindings are data (`input.bind(action, [...])`) so Fighter Mode can add strikes and
 * grappling actions later without touching this file. Synthetic (untrusted) DOM events
 * are ignored for device tracking, so the virtual cursor's own events don't count.
 */

export type Device = 'gamepad' | 'keyboard' | 'mouse' | 'touch';

/** Xbox-layout names for the W3C "standard" gamepad mapping, in index order. */
export const PAD_BUTTONS = [
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', 'Up', 'Down', 'Left', 'Right', 'Guide',
] as const;
export type PadButton = (typeof PAD_BUTTONS)[number];

export type Action =
  | 'confirm' | 'back' | 'menu' | 'help' | 'inspect' | 'alt'
  | 'prev' | 'next' | 'up' | 'down' | 'left' | 'right' | 'scrollUp' | 'scrollDown'
  // Fighter Mode is free to add its own (strings are accepted everywhere)
  | (string & {});

export type Binding = { pad: PadButton } | { key: string };

export interface InputEvent {
  device: Device;
  /** pad button name, or KeyboardEvent.code for keys */
  button: string;
  /** which pad (gamepad index) for pad events */
  pad?: number;
  actions: Action[];
}

export interface PadState {
  index: number;
  id: string;
  mapping: string;
  buttons: number[]; // 0..1 per PAD_BUTTONS index
  axes: number[]; // raw
  connected: boolean;
}

type Handler = (e: InputEvent) => void;
type EventName = 'press' | 'release' | 'connect' | 'disconnect' | 'device';

const DEFAULT_BINDINGS: Record<string, Binding[]> = {
  confirm: [{ pad: 'A' }, { key: 'Enter' }, { key: 'Space' }],
  back: [{ pad: 'B' }, { key: 'Escape' }],
  menu: [{ pad: 'Menu' }],
  help: [{ pad: 'View' }, { key: 'F1' }],
  inspect: [{ pad: 'X' }],
  alt: [{ pad: 'Y' }],
  prev: [{ pad: 'LB' }, { key: 'PageUp' }],
  next: [{ pad: 'RB' }, { key: 'PageDown' }],
  up: [{ pad: 'Up' }, { key: 'ArrowUp' }, { key: 'KeyW' }],
  down: [{ pad: 'Down' }, { key: 'ArrowDown' }, { key: 'KeyS' }],
  left: [{ pad: 'Left' }, { key: 'ArrowLeft' }, { key: 'KeyA' }],
  right: [{ pad: 'Right' }, { key: 'ArrowRight' }, { key: 'KeyD' }],
  scrollUp: [{ pad: 'LT' }],
  scrollDown: [{ pad: 'RT' }],
};

/** Pad button press threshold (with hysteresis) for analog triggers. */
const PRESS_ON = 0.5;
const PRESS_OFF = 0.35;

/** Radial deadzone, rescaled so output starts at 0 just outside it. */
export function applyDeadzone(x: number, y: number, dz: number): { x: number; y: number } {
  const mag = Math.hypot(x, y);
  if (mag <= dz) return { x: 0, y: 0 };
  const m = Math.min(1, (mag - dz) / (1 - dz));
  return { x: (x / mag) * m, y: (y / mag) * m };
}

/** Optional source of pads from a native host (e.g. the Xbox UWP shell forwarding Windows.Gaming.Input). */
let hostPads: PadState[] = [];

export class Input {
  stickDeadzone = 0.22;
  triggerDeadzone = 0.06;
  lastDevice: Device = 'mouse';
  /** the pad most recently used (for single-player menus); -1 = none */
  activePad = -1;

  private bindings = new Map<string, Binding[]>();
  private pads = new Map<number, PadState>();
  private padDown = new Map<number, boolean[]>();
  private keys = new Set<string>();
  private keysPressed = new Set<string>();
  private keysReleased = new Set<string>();
  private padPressed = new Set<string>(); // `${index}:${button}` this frame
  private padReleased = new Set<string>();
  private handlers = new Map<EventName, Set<Handler>>();
  private started = false;
  private frame = 0;

  constructor() {
    for (const [a, b] of Object.entries(DEFAULT_BINDINGS)) this.bindings.set(a, b.slice());
  }

  // ------------------------------------------------------------ setup

  start(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    window.addEventListener('keydown', (e) => {
      if (!e.isTrusted) return;
      this.setDevice('keyboard');
      if (!this.keys.has(e.code)) {
        this.keys.add(e.code);
        this.keysPressed.add(e.code);
        this.emit('press', { device: 'keyboard', button: e.code, actions: this.actionsForKey(e.code) });
      }
    }, true);
    window.addEventListener('keyup', (e) => {
      if (!e.isTrusted) return;
      if (this.keys.delete(e.code)) {
        this.keysReleased.add(e.code);
        this.emit('release', { device: 'keyboard', button: e.code, actions: this.actionsForKey(e.code) });
      }
    }, true);
    window.addEventListener('blur', () => this.keys.clear());
    const ptr = (e: PointerEvent) => {
      if (!e.isTrusted) return;
      this.setDevice(e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'mouse');
    };
    window.addEventListener('pointerdown', ptr, true);
    window.addEventListener('pointermove', (e) => {
      // tiny mouse jitter shouldn't steal the device away from a controller
      if (e.pointerType === 'mouse' && Math.abs(e.movementX) + Math.abs(e.movementY) < 3) return;
      ptr(e);
    }, true);
    window.addEventListener('wheel', (e) => e.isTrusted && this.setDevice('mouse'), { capture: true, passive: true });
    window.addEventListener('gamepadconnected', () => this.poll());
    window.addEventListener('gamepaddisconnected', () => this.poll());
    // legacy Edge/UWP WebView: deliver the pad to the page instead of driving a mouse cursor
    try {
      (navigator as unknown as { gamepadInputEmulation?: string }).gamepadInputEmulation = 'gamepad';
    } catch {
      /* not supported */
    }
  }

  // ------------------------------------------------------------ bindings

  bind(action: Action, bindings: Binding[]): void {
    this.bindings.set(action, bindings.slice());
  }

  getBindings(action: Action): Binding[] {
    return this.bindings.get(action) ?? [];
  }

  private actionsForKey(code: string): Action[] {
    const out: Action[] = [];
    for (const [a, bs] of this.bindings) if (bs.some((b) => 'key' in b && b.key === code)) out.push(a);
    return out;
  }

  private actionsForPad(btn: PadButton): Action[] {
    const out: Action[] = [];
    for (const [a, bs] of this.bindings) if (bs.some((b) => 'pad' in b && b.pad === btn)) out.push(a);
    return out;
  }

  // ------------------------------------------------------------ events

  on(ev: EventName, h: Handler): () => void {
    let s = this.handlers.get(ev);
    if (!s) this.handlers.set(ev, (s = new Set()));
    s.add(h);
    return () => s!.delete(h);
  }

  private emit(ev: EventName, e: InputEvent): void {
    this.handlers.get(ev)?.forEach((h) => {
      try {
        h(e);
      } catch (err) {
        console.error(err);
      }
    });
  }

  private setDevice(d: Device): void {
    if (d === this.lastDevice) return;
    this.lastDevice = d;
    this.emit('device', { device: d, button: '', actions: [] });
  }

  // ------------------------------------------------------------ polling

  /** Call once per frame before reading state. Clears the per-frame edges. */
  update(): void {
    this.frame++;
    this.keysPressed.clear();
    this.keysReleased.clear();
    this.padPressed.clear();
    this.padReleased.clear();
    this.poll();
  }

  private readPads(): PadState[] {
    let raw: (Gamepad | null)[] = [];
    try {
      raw = typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    } catch {
      raw = [];
    }
    const out: PadState[] = [];
    for (const gp of raw) {
      if (!gp || gp.connected === false) continue;
      out.push({
        index: gp.index,
        id: gp.id,
        mapping: gp.mapping,
        buttons: gp.buttons.map((b) => (typeof b === 'number' ? b : b.value || (b.pressed ? 1 : 0))),
        axes: Array.from(gp.axes),
        connected: true,
      });
    }
    // the host (Xbox shell) forwards Windows.Gaming.Input pads when the web view doesn't expose any
    if (!out.length && hostPads.length) return hostPads;
    return out;
  }

  private poll(): void {
    const now = this.readPads();
    const seen = new Set<number>();
    for (const p of now) {
      seen.add(p.index);
      if (!this.pads.has(p.index)) {
        this.pads.set(p.index, p);
        this.padDown.set(p.index, []);
        this.emit('connect', { device: 'gamepad', button: p.id, pad: p.index, actions: [] });
      }
      this.pads.set(p.index, p);
      const prev = this.padDown.get(p.index)!;
      let active = false;
      for (let i = 0; i < PAD_BUTTONS.length; i++) {
        const v = p.buttons[i] ?? 0;
        const was = !!prev[i];
        const is = was ? v > PRESS_OFF : v > PRESS_ON;
        prev[i] = is;
        if (is !== was) {
          const name = PAD_BUTTONS[i];
          const ev: InputEvent = { device: 'gamepad', button: name, pad: p.index, actions: this.actionsForPad(name) };
          if (is) {
            active = true;
            this.padPressed.add(`${p.index}:${name}`);
            this.activePad = p.index;
            this.setDevice('gamepad');
            this.emit('press', ev);
          } else {
            this.padReleased.add(`${p.index}:${name}`);
            this.emit('release', ev);
          }
        }
      }
      if (!active) {
        const [lx = 0, ly = 0, rx = 0, ry = 0] = p.axes;
        if (Math.hypot(lx, ly) > 0.5 || Math.hypot(rx, ry) > 0.5) {
          this.activePad = p.index;
          this.setDevice('gamepad');
        }
      }
      if (this.activePad < 0) this.activePad = p.index;
    }
    for (const idx of [...this.pads.keys()]) {
      if (seen.has(idx)) continue;
      const p = this.pads.get(idx)!;
      this.pads.delete(idx);
      this.padDown.delete(idx);
      if (this.activePad === idx) this.activePad = seen.size ? [...seen][0] : -1;
      this.emit('disconnect', { device: 'gamepad', button: p.id, pad: idx, actions: [] });
      if (!this.pads.size && this.lastDevice === 'gamepad') this.setDevice('mouse');
    }
  }

  // ------------------------------------------------------------ queries

  get connected(): boolean {
    return this.pads.size > 0;
  }

  padList(): PadState[] {
    return [...this.pads.values()];
  }

  /** Pad button held. `pad` defaults to any connected pad. */
  button(btn: PadButton, pad?: number): boolean {
    const i = PAD_BUTTONS.indexOf(btn);
    for (const [idx, d] of this.padDown) if ((pad === undefined || pad === idx) && d[i]) return true;
    return false;
  }

  buttonPressed(btn: PadButton, pad?: number): boolean {
    for (const k of this.padPressed) {
      const [idx, name] = k.split(':');
      if (name === btn && (pad === undefined || pad === +idx)) return true;
    }
    return false;
  }

  buttonReleased(btn: PadButton, pad?: number): boolean {
    for (const k of this.padReleased) {
      const [idx, name] = k.split(':');
      if (name === btn && (pad === undefined || pad === +idx)) return true;
    }
    return false;
  }

  key(code: string): boolean {
    return this.keys.has(code);
  }

  /** Action held on any device. */
  down(action: Action, pad?: number): boolean {
    for (const b of this.bindings.get(action) ?? []) {
      if ('pad' in b ? this.button(b.pad, pad) : this.keys.has(b.key)) return true;
    }
    return false;
  }

  /** Action went down this frame. */
  pressed(action: Action, pad?: number): boolean {
    for (const b of this.bindings.get(action) ?? []) {
      if ('pad' in b ? this.buttonPressed(b.pad, pad) : this.keysPressed.has(b.key)) return true;
    }
    return false;
  }

  released(action: Action, pad?: number): boolean {
    for (const b of this.bindings.get(action) ?? []) {
      if ('pad' in b ? this.buttonReleased(b.pad, pad) : this.keysReleased.has(b.key)) return true;
    }
    return false;
  }

  private padFor(pad?: number): PadState | undefined {
    if (pad !== undefined) return this.pads.get(pad);
    return this.pads.get(this.activePad) ?? this.pads.values().next().value;
  }

  /**
   * Analog stick with radial deadzone. 'move' = left stick, falling back to
   * WASD / arrow keys; 'look' = right stick.
   */
  stick(which: 'move' | 'look' | 'left' | 'right', pad?: number): { x: number; y: number } {
    const p = this.padFor(pad);
    const left = which === 'move' || which === 'left';
    let v = { x: 0, y: 0 };
    if (p) v = applyDeadzone(p.axes[left ? 0 : 2] ?? 0, p.axes[left ? 1 : 3] ?? 0, this.stickDeadzone);
    if (which === 'move' && v.x === 0 && v.y === 0 && pad === undefined) {
      const kx = (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0);
      const ky = (this.keys.has('ArrowDown') || this.keys.has('KeyS') ? 1 : 0) - (this.keys.has('ArrowUp') || this.keys.has('KeyW') ? 1 : 0);
      if (kx || ky) {
        const m = Math.hypot(kx, ky);
        v = { x: kx / m, y: ky / m };
      }
    }
    return v;
  }

  /** Analog trigger 0..1 (LT / RT) with a small deadzone. */
  trigger(which: 'LT' | 'RT', pad?: number): number {
    const p = this.padFor(pad);
    if (!p) return 0;
    const v = p.buttons[PAD_BUTTONS.indexOf(which)] ?? 0;
    return v <= this.triggerDeadzone ? 0 : Math.min(1, (v - this.triggerDeadzone) / (1 - this.triggerDeadzone));
  }

  /** Rumble (strong = low-frequency motor, weak = high-frequency), 0..1, duration ms. */
  rumble(strong: number, weak = strong, ms = 150, pad?: number): void {
    const p = this.padFor(pad);
    if (!p) return;
    try {
      const gp = navigator.getGamepads?.()[p.index] as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }) | null;
      gp?.vibrationActuator?.playEffect?.('dual-rumble', {
        startDelay: 0,
        duration: ms,
        strongMagnitude: Math.max(0, Math.min(1, strong)),
        weakMagnitude: Math.max(0, Math.min(1, weak)),
      })?.catch?.(() => {});
    } catch {
      /* no rumble */
    }
  }

  /** Friendly pad name for toasts ("Xbox Wireless Controller"). */
  static padName(id: string): string {
    const clean = id.replace(/\s*\(.*?\)\s*/g, ' ').replace(/Vendor:.*$/i, '').trim();
    if (/xbox|xinput|045e/i.test(id)) return /xinput/i.test(clean) || !clean ? 'Xbox controller' : clean;
    if (/dualsense|dualshock|054c/i.test(id)) return 'PlayStation controller';
    return clean || 'Controller';
  }
}

/** Native hosts call this (via a web message) with their pads, in standard mapping. */
export function setHostPads(pads: PadState[]): void {
  hostPads = pads;
}

export const input = new Input();
