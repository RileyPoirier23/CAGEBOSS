/**
 * Desktop shell for CAGE BOSS. Wraps the built game (dist/) in a native window:
 * fullscreen by default, no browser chrome, saves kept in the app's own profile.
 */
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// music should start without waiting for a click, like a real game
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.setName('CAGE BOSS');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 810,
    minWidth: 480,
    minHeight: 270,
    fullscreen: !process.argv.includes('--windowed'),
    backgroundColor: '#0d0b0c',
    title: 'CAGE BOSS',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });
  win.setMenu(null);
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  // links (credits socials) open in the real browser, never inside the game window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) win.setFullScreen(!win.isFullScreen());
  });
}

// ------------------------------------------------------------------ save files
// Every save / setting / achievement is mirrored to <userData>/saves/<key>.txt. Those files
// are the source of truth at startup, so Steam Auto-Cloud (or a USB stick) can carry them.
const saveDir = () => path.join(app.getPath('userData'), 'saves');
const fileFor = (key) => path.join(saveDir(), encodeURIComponent(key).replace(/%/g, '_') + '.txt');
ipcMain.on('cageboss:files:readAll', (e) => {
  const out = {};
  try {
    fs.mkdirSync(saveDir(), { recursive: true });
    for (const f of fs.readdirSync(saveDir())) {
      if (!f.endsWith('.txt')) continue;
      const raw = fs.readFileSync(path.join(saveDir(), f), 'utf8');
      const nl = raw.indexOf('\n');
      if (nl > 0) out[raw.slice(0, nl)] = raw.slice(nl + 1);
    }
  } catch {
    /* no saves yet */
  }
  e.returnValue = out;
});
ipcMain.on('cageboss:files:write', (_e, key, value) => {
  try {
    fs.mkdirSync(saveDir(), { recursive: true });
    const f = fileFor(key);
    // the key goes on the first line (file names can't hold every key); write then rename, so a crash can't half-write a save
    fs.writeFileSync(f + '.tmp', key + '\n' + value, 'utf8');
    fs.renameSync(f + '.tmp', f);
  } catch {
    /* disk full / read-only: local storage still has it */
  }
});
ipcMain.on('cageboss:files:remove', (_e, key) => {
  try {
    fs.rmSync(fileFor(key), { force: true });
  } catch {
    /* already gone */
  }
});

// ------------------------------------------------------------------ Steam
// Optional. With steamworks.js installed and an App ID (steam_appid.txt next to the game, or
// STEAM_APPID), achievements unlocked in-game unlock on Steam. Without either: nothing happens.
let steam = null;
function initSteam() {
  try {
    const candidates = [path.join(path.dirname(process.execPath), 'steam_appid.txt'), path.join(process.resourcesPath || '', 'steam_appid.txt'), path.join(__dirname, '..', 'steam_appid.txt')];
    const file = candidates.find((f) => fs.existsSync(f));
    const appId = Number(process.env.STEAM_APPID || (file ? fs.readFileSync(file, 'utf8').trim() : 0));
    if (!appId) return;
    const steamworks = require('steamworks.js');
    steam = steamworks.init(appId);
    try {
      steamworks.electronEnableSteamOverlay();
    } catch {
      /* overlay is a nice-to-have */
    }
  } catch {
    steam = null; // not installed, or Steam isn't running
  }
}
ipcMain.on('cageboss:achievement', (_e, id) => {
  try {
    if (steam && !steam.achievement.isActivated(id)) steam.achievement.activate(id);
  } catch {
    /* unknown achievement id on the Steam side */
  }
});

ipcMain.on('cageboss:quit', () => app.quit());
ipcMain.on('cageboss:fullscreen', (_e, on) => win && win.setFullScreen(!!on));
ipcMain.handle('cageboss:isFullscreen', () => (win ? win.isFullScreen() : false));

// ------------------------------------------------------------------ updates
// Installed copies update themselves from GitHub Releases. The portable .exe can't
// replace itself, so it just tells you a new version is out and opens the download page.
const RELEASES = 'https://github.com/RileyPoirier23/CAGEBOSS/releases/latest';

function newer(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

async function checkPortable() {
  try {
    const res = await fetch('https://api.github.com/repos/RileyPoirier23/CAGEBOSS/releases/latest', { headers: { 'User-Agent': 'cage-boss' } });
    if (!res.ok) return;
    const rel = await res.json();
    if (!rel.tag_name || !newer(rel.tag_name, app.getVersion())) return;
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'CAGE BOSS update',
      message: `CAGE BOSS ${rel.tag_name} is out. You're on v${app.getVersion()}.`,
      detail: process.platform === 'darwin' ? 'Download the new Mac build and drag it into Applications. Your saves carry over.' : 'Download the new version and replace this one. Your saves carry over.',
      buttons: ['Download', 'Later'],
      defaultId: 0,
    });
    if (response === 0) shell.openExternal(RELEASES);
  } catch {
    // offline: try again next launch
  }
}

function checkInstalled() {
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'CAGE BOSS update',
      message: `CAGE BOSS v${info.version} is ready to install.`,
      detail: 'Restart now to update, or it will install the next time you quit. Your saves carry over.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on('error', () => {}); // offline or no release yet: stay quiet
  autoUpdater.checkForUpdates().catch(() => {});
}

initSteam();

app.whenReady().then(() => {
  createWindow();
  // Steam builds are updated by Steam
  if (!app.isPackaged || steam) return;
  // Windows installer and Linux AppImage update themselves; the portable .exe and the (unsigned)
  // Mac build can't replace themselves, so they just say a new version is out
  const self = process.platform === 'win32' ? !process.env.PORTABLE_EXECUTABLE_DIR : process.platform === 'linux' ? !!process.env.APPIMAGE : false;
  setTimeout(() => (self ? checkInstalled() : checkPortable()), 4000);
});
app.on('window-all-closed', () => app.quit());
