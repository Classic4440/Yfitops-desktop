'use strict';

// Electron entry point: creates the dashboard window and wires all IPC handlers
// that the renderer uses to manage profiles/proxies and launch isolated windows.
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');

const profileManager = require('./profileManager');
const proxyManager = require('./proxyManager');
const launcher = require('./launcher');
const { computeEmulation } = require('./emulation');
const { settingsStore } = require('./store');
const { appLog } = require('./logger');

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const PROFILE_PRELOAD = path.join(__dirname, '../preload/profile-preload.js');
const DASHBOARD_PRELOAD = path.join(__dirname, '../preload/dashboard-preload.js');

let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0f1117',
    title: 'SocketObit Dashboard',
    webPreferences: {
      preload: DASHBOARD_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Build the shared launch context passed into the launcher.
function launchContext() {
  return {
    userDataPath: app.getPath('userData'),
    defaultStartUrl: settingsStore.get('defaultStartUrl'),
    preloadPath: PROFILE_PRELOAD,
    onStatus: (profileId, status) => {
      try {
        profileManager.setStatus(profileId, status);
      } catch (err) {
        appLog.warn(`setStatus failed: ${err.message}`);
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('profile-status-changed', { profileId, status });
      }
    },
  };
}

// Annotate stored profiles with their current live running state for the UI.
function profilesWithRuntime() {
  return profileManager.listProfiles().map((p) => ({
    ...p,
    status: launcher.isRunning(p.id) ? 'running' : p.status === 'running' ? 'stopped' : p.status,
  }));
}

function registerIpc() {
  // --- Profiles ---
  ipcMain.handle('profiles:getDevices', () => require('./fingerprintGenerator').deviceProfiles);
  ipcMain.handle('profiles:list', () => profilesWithRuntime());
  ipcMain.handle('profiles:create', (_e, data) => profileManager.createProfile(data));
  ipcMain.handle('profiles:update', (_e, id, patch) => profileManager.updateProfile(id, patch));
  ipcMain.handle('profiles:delete', (_e, id) => {
    if (launcher.isRunning(id)) throw new Error('Stop the profile before deleting it.');
    return profileManager.deleteProfile(id);
  });
  ipcMain.handle('profiles:duplicate', (_e, id) => profileManager.duplicateProfile(id));
  ipcMain.handle('profiles:generateSeed', () => profileManager.generateSeed());
  ipcMain.handle('profiles:emulation', (_e, data) => {
    return generateFingerprint(data.seed, null, data.deviceId);
  });

  // --- Proxies ---
  ipcMain.handle('proxies:list', () => proxyManager.listProxies());
  ipcMain.handle('proxies:add', (_e, data) => proxyManager.addProxy(data));
  ipcMain.handle('proxies:update', (_e, id, patch) => proxyManager.updateProxy(id, patch));
  ipcMain.handle('proxies:delete', (_e, id) => proxyManager.deleteProxy(id));
  ipcMain.handle('proxies:import', (_e, rows) => proxyManager.importProxies(rows));
  ipcMain.handle('proxies:test', (_e, id) => proxyManager.testProxy(id));

  // --- Settings ---
  ipcMain.handle('settings:get', () => settingsStore.store);
  ipcMain.handle('settings:set', (_e, patch) => {
    Object.entries(patch || {}).forEach(([k, v]) => settingsStore.set(k, v));
    return settingsStore.store;
  });

  // --- Launch / lifecycle ---
  ipcMain.handle('profiles:launch', async (_e, profileId) => {
    const profile = profileManager.getProfile(profileId);
    if (!profile) throw new Error('Profile not found');

    let proxy = null;
    if (profile.proxyId) {
      proxy = proxyManager.getProxy(profile.proxyId);
      if (!proxy) throw new Error('Assigned proxy not found');
      // Test the proxy and block launch on failure.
      const result = await proxyManager.testProxy(proxy.id);
      if (!result.ok) {
        throw new Error(`Proxy test failed: ${result.error || 'unknown error'}`);
      }
    }
    return launcher.launchProfileWindow(profile, proxy, launchContext());
  });

  ipcMain.handle('profiles:stop', (_e, profileId) => {
    const stopped = launcher.stopProfileWindow(profileId);
    if (stopped) profileManager.setStatus(profileId, 'stopped');
    return stopped;
  });

  ipcMain.handle('profiles:openTest', async (_e, profileId, testUrl) => {
    const profile = profileManager.getProfile(profileId);
    if (!profile) throw new Error('Profile not found');
    const proxy = profile.proxyId ? proxyManager.getProxy(profile.proxyId) : null;
    return launcher.openTestPage(profile, proxy, launchContext(), testUrl);
  });

  ipcMain.handle('profiles:clearStorage', (_e, profileId) =>
    launcher.clearProfileStorage(profileId, app.getPath('userData'))
  );

  ipcMain.on('emulation:getSync', (event, profileId) => {
    const profile = profileManager.getProfile(profileId);
    event.returnValue = profile ? generateFingerprint(profile.seed, null, profile.deviceId) : null;
  });
}

app.whenReady().then(() => {
  registerIpc();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
