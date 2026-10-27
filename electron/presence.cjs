/**
 * Discord Rich Presence: "Playing CAGE BOSS" on the player's Discord profile, with the game's icon,
 * what they're up to (the game sends that over the bridge: the mode, the week, a fight) and how
 * long they've been playing. It talks to the Discord app on this computer over its local pipe: no
 * login, no token, no secret. Discord not running, Discord quitting mid-game, the library missing:
 * nothing happens, it looks for Discord again every 30 seconds, and the game never waits on it.
 */
// the CAGE BOSS app in the 506clicks Discord developer team (a client ID is public)
const CLIENT_ID = '1564513128614731826';
// the large picture: the game's icon on the website. An Art Asset uploaded under the app's
// Rich Presence settings can be used instead by putting its key here.
const LARGE_IMAGE = 'https://www.506clicks.ca/play/cageboss/icon-512.png';
const RETRY_MS = 30000;
// Discord takes 5 activity updates per 20 seconds: a burst of screen changes sends only the last one
const GAP_MS = 4000;

let RPC = null;
let client = null;
let ready = false;
let stopped = false;
let retryTimer = null;
let sendTimer = null;
let lastSend = 0;
let sent = '';
let version = '';
let activity = { details: 'In the menus' };
const startTimestamp = Date.now();

function retry() {
  if (!stopped && !retryTimer) retryTimer = setTimeout(connect, RETRY_MS);
}

function connect() {
  retryTimer = null;
  if (stopped || client) return;
  try {
    RPC = RPC || require('@xhayper/discord-rpc');
  } catch {
    return; // not packaged with this build: no presence
  }
  let c;
  try {
    c = new RPC.Client({ clientId: CLIENT_ID });
  } catch {
    return retry();
  }
  client = c;
  c.on('error', () => {});
  c.on('disconnected', () => drop(c));
  c.login()
    .then(() => {
      if (client !== c) return;
      // The library leaves the open pipe without an error listener, and when the pipe closes on its
      // own (Discord quitting) it never says so. Watch it here: Discord going away can't crash the
      // game, and the next Discord to open gets found again.
      const pipe = c.transport.socket;
      if (pipe) {
        pipe.on('error', () => {});
        pipe.once('close', () => drop(c));
      }
      ready = true;
      sent = '';
      flush();
    })
    .catch(() => drop(c));
}

/** Lost Discord (or never found it): forget this connection and look again later. */
function drop(c) {
  if (client !== c) return;
  client = null;
  ready = false;
  close(c);
  retry();
}

function close(c) {
  try {
    c.rest.clearHashSweeper();
    c.rest.clearHandlerSweeper();
    // a pipe that died on its own: the library would keep pinging it forever
    clearInterval(c.transport.heartbeatTimer);
    clearTimeout(c.transport.timeoutTimer);
  } catch {
    /* nothing left running */
  }
  Promise.resolve()
    .then(() => c.destroy())
    .catch(() => {});
}

function flush() {
  if (!ready || !client || sendTimer) return;
  const key = JSON.stringify(activity);
  if (key === sent) return;
  const wait = lastSend + GAP_MS - Date.now();
  if (wait > 0) {
    sendTimer = setTimeout(() => {
      sendTimer = null;
      flush();
    }, wait);
    return;
  }
  const c = client;
  sent = key;
  lastSend = Date.now();
  Promise.resolve()
    .then(() =>
      c.user.setActivity({
        ...activity,
        startTimestamp,
        largeImageKey: LARGE_IMAGE,
        largeImageText: version ? `CAGE BOSS v${version}` : 'CAGE BOSS',
      }),
    )
    .catch(() => {
      // try it again with the next update
      if (client === c) sent = '';
    });
}

const line = (v) => (typeof v === 'string' ? v.trim().slice(0, 128) : '');

module.exports = {
  /** Look for Discord (call once the app is ready). */
  start(appVersion) {
    version = appVersion || '';
    connect();
  },
  /** What the profile should say: { details, state? }, straight from the game. */
  update(a) {
    const details = line(a && a.details);
    const state = line(a && a.state);
    if (details.length < 2) return;
    activity = state.length >= 2 ? { details, state } : { details };
    flush();
  },
  stop() {
    stopped = true;
    clearTimeout(retryTimer);
    clearTimeout(sendTimer);
    if (client) close(client);
    client = null;
    ready = false;
  },
};
