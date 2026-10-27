/**
 * Online two-player, inside the Discord Activity (the High Road Arcade). The arcade opens the game
 * with ?room=<its Activity instance>, so everyone in the same Activity lands in the same room on the
 * bot's relay. Two players to a room: the first in hosts (red corner: runs the fight), the second
 * is the guest (blue corner: sends its hands and draws the fight from the host's snapshots).
 * A third person gets told the room is full. Outside the arcade there is no room and none of this runs.
 */

export type Role = 'host' | 'guest';
/** A message between the two players (or from the relay: hello, peer, role, full). */
export type DuelMsg = { t: string } & Record<string, unknown>;
export type DuelStatus = 'connecting' | 'open' | 'full' | 'offline';

/** The arcade's Activity instance this copy was opened for, or null. */
export function duelRoom(): string | null {
  try {
    const r = new URLSearchParams(location.search).get('room');
    return r && /^[\w-]{1,100}$/.test(r) ? r : null;
  } catch {
    return null; // no location (tests)
  }
}

/** The relay sits behind the Activity's /relay URL mapping; ?relay=ws://host:port/relay points elsewhere (testing). */
function relayUrl(room: string): string {
  const q = new URLSearchParams(location.search).get('relay');
  const base = q && /^wss?:\/\//.test(q) ? q.replace(/\/$/, '') : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/relay`;
  return `${base}/${encodeURIComponent(room)}`;
}

export class Duel {
  role: Role | null = null;
  /** the other player is in the room */
  peer = false;
  status: DuelStatus = 'connecting';
  private ws: WebSocket | null = null;
  private handlers = new Set<(m: DuelMsg) => void>();
  private retryT: ReturnType<typeof setTimeout> | null = null;
  private fails = 0;

  constructor(readonly room: string) {
    this.open();
  }

  /** Every message (and status change, as { t: 'status' }); returns the unsubscribe. */
  on(h: (m: DuelMsg) => void): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  /** To the other player (dropped when nobody's there). */
  send(m: DuelMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.peer) this.ws.send(JSON.stringify(m));
  }

  private emit(m: DuelMsg): void {
    for (const h of [...this.handlers]) {
      try {
        h(m);
      } catch (e) {
        console.warn('[duel]', e);
      }
    }
  }

  private open(): void {
    this.retryT = null;
    let ws: WebSocket;
    try {
      ws = new WebSocket(relayUrl(this.room));
    } catch {
      this.down();
      return;
    }
    this.ws = ws;
    ws.onmessage = (e) => {
      let m: DuelMsg;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'hello') {
        this.role = m.you === 'host' ? 'host' : 'guest';
        this.peer = !!m.peer;
        this.status = 'open';
        this.fails = 0;
      } else if (m.t === 'peer') this.peer = !!m.here;
      else if (m.t === 'role') this.role = m.you === 'host' ? 'host' : 'guest';
      else if (m.t === 'full') this.status = 'full';
      this.emit(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.peer = false;
      if (this.status !== 'full') this.down();
      else this.emit({ t: 'status' });
    };
  }

  /** No relay (the bot's PC is off, or no tunnel): say so and try again, less often the longer it's gone (5 s up to a minute). */
  private down(): void {
    this.status = 'offline';
    this.role = null;
    this.emit({ t: 'status' });
    this.fails++;
    if (!this.retryT) this.retryT = setTimeout(() => this.open(), Math.min(60_000, 5000 * 2 ** Math.min(this.fails - 1, 4)));
  }
}

let shared: Duel | null = null;
/** The page's one relay connection (the lobby and the fight share it), or null outside the arcade. */
export function duel(): Duel | null {
  const room = duelRoom();
  if (!room) return null;
  return (shared ??= new Duel(room));
}
