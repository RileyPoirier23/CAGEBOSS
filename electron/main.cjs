/**
 * Desktop shell for CAGE BOSS. Wraps the built game (dist/) in a native window:
 * fullscreen by default, no browser chrome, saves kept in the app's own profile.
 */
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');

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
      detail: 'Download the new portable .exe and replace this one. Your saves carry over.',
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

app.whenReady().then(() => {
  createWindow();
  if (!app.isPackaged) return;
  setTimeout(() => (process.env.PORTABLE_EXECUTABLE_DIR ? checkPortable() : checkInstalled()), 4000);
});
app.on('window-all-closed', () => app.quit());
