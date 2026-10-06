/**
 * Desktop shell for CAGE BOSS. Wraps the built game (dist/) in a native window:
 * fullscreen by default, no browser chrome, saves kept in the app's own profile.
 */
const { app, BrowserWindow, ipcMain, shell } = require('electron');
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

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
