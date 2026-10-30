/* UNIVERSE CLASH - real netplay over WebRTC with hand-carried signalling.

   There is no server. The host makes an invite code, hands it to the guest by
   any channel (chat, a message, a QR), the guest pastes it and hands back a
   reply code, and a peer-to-peer data channel opens between the two browsers.
   STUN is used to find a public address; symmetric NATs that need a relay
   will fail to connect and say so.

   Inputs ride an unordered, no-retransmit channel. Every packet repeats the
   last few ticks, so a dropped packet costs nothing. Config, readiness and
   checksums ride a reliable channel. The rollback core on each side is the
   same one the in-page netplay sim uses. */

import { compressToBase64, decompressFromBase64 } from 'lz-string';
import type { CharId, InputFrame, MatchConfig, MatchEvent } from './types';
import { packInput, type Rollback } from './rollback';

export type LinkStatus = 'idle' | 'gathering' | 'waiting' | 'connecting' | 'open' | 'closed' | 'failed';

export type NetMessage =
  | { t: 'hello'; name: string; char: CharId; modern: boolean; v: number }
  | { t: 'cfg'; cfg: MatchConfig; name: string }
  | { t: 'go' }
  | { t: 'in'; p: 0 | 1; from: number; packed: number[] }
  | { t: 'cs'; tick: number; hash: number }
  | { t: 'ping'; at: number }
  | { t: 'pong'; at: number }
  | { t: 'bye' };

export interface LinkEvents {
  status(s: LinkStatus, detail: string): void;
  message(msg: NetMessage): void;
}

const PROTOCOL = 1;
const CODE_PREFIX = 'UC1.';
const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
/** How long to wait for ICE candidates before handing out a code. */
const GATHER_MS = 2500;

export function encodeCode(desc: RTCSessionDescriptionInit): string {
  return CODE_PREFIX + compressToBase64(JSON.stringify({ type: desc.type, sdp: desc.sdp }));
}

export function decodeCode(code: string): RTCSessionDescriptionInit | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith(CODE_PREFIX)) return null;
  try {
    const json = decompressFromBase64(trimmed.slice(CODE_PREFIX.length));
    if (!json) return null;
    const o = JSON.parse(json) as { type: RTCSdpType; sdp: string };
    if ((o.type !== 'offer' && o.type !== 'answer') || typeof o.sdp !== 'string') return null;
    return o;
  } catch {
    return null;
  }
}

export class PeerLink {
  private pc: RTCPeerConnection | null = null;
  private ctl: RTCDataChannel | null = null;
  private fast: RTCDataChannel | null = null;
  status: LinkStatus = 'idle';
  detail = '';
  rtt = 0;
  private pingTimer: number | null = null;
  readonly role: 'host' | 'guest';

  constructor(role: 'host' | 'guest', private ev: LinkEvents) {
    this.role = role;
  }

  static supported(): boolean {
    return typeof RTCPeerConnection !== 'undefined';
  }

  private set(s: LinkStatus, detail = ''): void {
    this.status = s;
    this.detail = detail;
    this.ev.status(s, detail);
  }

  private make(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    this.pc = pc;
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') this.set('failed', 'No route between the two machines. Both behind strict NATs; try a different network or a hotspot.');
      else if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') this.set('closed', 'The link dropped.');
    };
    pc.ondatachannel = (e) => this.attach(e.channel);
    return pc;
  }

  private attach(ch: RTCDataChannel): void {
    ch.binaryType = 'arraybuffer';
    if (ch.label === 'in') this.fast = ch;
    else this.ctl = ch;
    ch.onmessage = (e) => {
      try {
        const msg = JSON.parse(typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data)) as NetMessage;
        if (msg.t === 'ping') this.send({ t: 'pong', at: msg.at });
        else if (msg.t === 'pong') this.rtt = Math.round(performance.now() - msg.at);
        else this.ev.message(msg);
      } catch {
        /* a packet we cannot read is a packet we drop */
      }
    };
    ch.onopen = () => {
      if (this.ctl?.readyState === 'open' && this.fast?.readyState === 'open') {
        this.set('open', 'Connected.');
        if (this.pingTimer === null) {
          this.pingTimer = window.setInterval(() => this.send({ t: 'ping', at: performance.now() }), 1000);
        }
      }
    };
    ch.onclose = () => this.set('closed', 'The link closed.');
  }

  private async gather(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete') return;
    await new Promise<void>((resolve) => {
      const done = () => {
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      };
      const check = () => {
        if (pc.iceGatheringState === 'complete') done();
      };
      pc.addEventListener('icegatheringstatechange', check);
      window.setTimeout(done, GATHER_MS);
    });
  }

  /** Host: build the invite code. */
  async host(): Promise<string> {
    const pc = this.make();
    this.attach(pc.createDataChannel('ctl', { ordered: true }));
    this.attach(pc.createDataChannel('in', { ordered: false, maxRetransmits: 0 }));
    this.set('gathering', 'Finding a public address…');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.gather(pc);
    this.set('waiting', 'Send the invite code. Paste the reply when it comes back.');
    return encodeCode(pc.localDescription ?? offer);
  }

  /** Guest: take the invite, build the reply code. */
  async join(invite: string): Promise<string> {
    const desc = decodeCode(invite);
    if (!desc || desc.type !== 'offer') throw new Error('That is not an invite code.');
    const pc = this.make();
    this.set('gathering', 'Finding a public address…');
    await pc.setRemoteDescription(desc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this.gather(pc);
    this.set('connecting', 'Send the reply code to the host.');
    return encodeCode(pc.localDescription ?? answer);
  }

  /** Host: take the guest's reply. */
  async accept(reply: string): Promise<void> {
    const desc = decodeCode(reply);
    if (!desc || desc.type !== 'answer') throw new Error('That is not a reply code.');
    if (!this.pc) throw new Error('Make an invite first.');
    this.set('connecting', 'Connecting…');
    await this.pc.setRemoteDescription(desc);
  }

  send(msg: NetMessage, fast = false): void {
    const ch = fast ? this.fast : this.ctl;
    if (!ch || ch.readyState !== 'open') return;
    try {
      ch.send(JSON.stringify(msg));
    } catch {
      /* channel closing under us */
    }
  }

  get open(): boolean {
    return this.status === 'open';
  }

  close(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    try {
      this.send({ t: 'bye' });
    } catch {
      /* already gone */
    }
    this.ctl?.close();
    this.fast?.close();
    this.pc?.close();
    this.ctl = this.fast = null;
    this.pc = null;
    if (this.status !== 'closed') this.set('closed', 'Left.');
  }
}

/** The rollback core wired to a live link. Both sides run one of these. */
export class OnlineMatch {
  private ring: number[] = [];
  private ringFrom = 0;
  stalled = 0;
  desync = false;
  desyncTick = -1;
  remoteConfirmed = 0;
  /** Checksums the other side sent, by tick, compared once we confirm that tick. */
  private theirs = new Map<number, number>();
  static readonly REDUNDANCY = 8;

  constructor(readonly link: PeerLink, readonly core: Rollback, readonly local: 0 | 1) {}

  get remote(): 0 | 1 {
    return this.local === 0 ? 1 : 0;
  }

  /** Too far ahead of what the other side has sent: wait rather than predict into the void. */
  get stalledNow(): boolean {
    return this.core.tick - this.core.confirmed >= this.core.opts.maxRollback - 4;
  }

  /** One tick: stamp the local input, send it, step. Null when stalled (nothing stamped). */
  tick(input: InputFrame): MatchEvent[] | null {
    if (this.stalledNow) {
      this.stalled++;
      return null;
    }
    this.pushLocal(input);
    const core = this.core;
    const ev = core.step();
    if (core.tick % 20 === 0 && core.confirmed > 0) {
      const t = core.confirmed;
      const h = core.checksumAt(t);
      if (h !== undefined) this.link.send({ t: 'cs', tick: t, hash: h });
      this.compare();
    }
    return ev;
  }

  /** Stamp the local input and put it on the wire with the last few ticks repeated. */
  private pushLocal(input: InputFrame): void {
    const t = this.core.stampTick;
    const packed = packInput(input);
    this.core.addInput(this.local, t, packed);
    if (this.ring.length === 0) this.ringFrom = t;
    this.ring.push(packed);
    while (this.ring.length > OnlineMatch.REDUNDANCY) {
      this.ring.shift();
      this.ringFrom++;
    }
    this.link.send({ t: 'in', p: this.local, from: this.ringFrom, packed: this.ring }, true);
  }

  onMessage(msg: NetMessage): void {
    if (msg.t === 'in') {
      if (msg.p === this.local) return;
      for (let i = 0; i < msg.packed.length; i++) this.core.addInput(msg.p, msg.from + i, msg.packed[i]);
      this.remoteConfirmed = Math.max(this.remoteConfirmed, msg.from + msg.packed.length - 1);
    } else if (msg.t === 'cs') {
      this.theirs.set(msg.tick, msg.hash);
      this.compare();
    }
  }

  private compare(): void {
    for (const [tick, hash] of this.theirs) {
      if (tick > this.core.confirmed) continue;
      const mine = this.core.checksumAt(tick);
      this.theirs.delete(tick);
      if (mine !== undefined && mine !== hash && !this.desync) {
        this.desync = true;
        this.desyncTick = tick;
      }
    }
  }

}

export const NET_PROTOCOL = PROTOCOL;
