'use strict';

// Electron entry point: creates the dashboard window and wires all IPC handlers
// that the renderer uses to manage profiles/proxies and launch isolated windows.
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { app, BrowserWindow, ipcMain } = require('electron');

const profileManager = require('./profileManager');
const proxyManager = require('./proxyManager');
const launcher = require('./launcher');
const { generateFingerprint } = require('./fingerprintGenerator');
const { settingsStore } = require('./store');
const { appLog } = require('./logger');


const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const PROFILE_PRELOAD = path.join(__dirname, '../preload/profile-preload.js');
const DASHBOARD_PRELOAD = path.join(__dirname, '../preload/dashboard-preload.js');

let mainWindow = null;

// Helper to load fresh devices
function loadDevices() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'deviceProfiles.json'), 'utf8')).devices;
}

function registerIpc() {
  // Helper to safely wrap IPC handlers
  const handle = (channel, handler) => {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        return await handler(event, ...args);
      } catch (err) {
        appLog.error(`IPC error on ${channel}:`, err);
        throw err; // Re-throw so renderer gets the error
      }
    });
  };

  // --- Profiles ---
  handle('profiles:getDevices', () => loadDevices());
  handle('random-device', () => {
    const devices = loadDevices();
    return devices[Math.floor(Math.random() * devices.length)];
  });
  handle('import-devices', (_e, filePath) => {
    const data = fs.readFileSync(filePath, 'utf8');
    const imported = JSON.parse(data).devices;
    fs.writeFileSync(path.join(__dirname, 'deviceProfiles.json'), JSON.stringify({ devices: imported }, null, 2));
    return { success: true, count: imported.length };
  });
  handle('export-devices', () => {
    const devices = loadDevices();
    const exportPath = path.join(app.getPath('downloads'), `socketobit_devices_${Date.now()}.json`);
    fs.writeFileSync(exportPath, JSON.stringify({ devices }, null, 2));
    return exportPath;
  });
  handle('fetch-online-devices', async () => {
    const response = await axios.get('https://raw.githubusercontent.com/Classic4440/Yfitops-desktop/main/src/main/deviceProfiles.json');
    const devices = response.data.devices;
    fs.writeFileSync(path.join(__dirname, 'deviceProfiles.json'), JSON.stringify({ devices }, null, 2));
    return { success: true, count: devices.length };
  });

  handle('profiles:list', () => profilesWithRuntime());
  handle('profiles:create', (_e, data) => profileManager.createProfile(data));
  handle('profiles:update', (_e, id, patch) => profileManager.updateProfile(id, patch));
  handle('profiles:delete', (_e, id) => {
    if (launcher.isRunning(id)) throw new Error('Stop the profile before deleting it.');
    return profileManager.deleteProfile(id);
  });
  handle('profiles:duplicate', (_e, id) => profileManager.duplicateProfile(id));
  handle('profiles:generateSeed', () => profileManager.generateSeed());
  handle('profiles:emulation', (_e, data) => {
    return generateFingerprint(data.seed, null, data.deviceId);
  });

  // --- Proxies ---
  handle('proxies:list', () => proxyManager.listProxies());
  handle('proxies:add', (_e, data) => proxyManager.addProxy(data));
  handle('proxies:update', (_e, id, patch) => proxyManager.updateProxy(id, patch));
  handle('proxies:delete', (_e, id) => proxyManager.deleteProxy(id));
  handle('proxies:import', (_e, rows) => proxyManager.importProxies(rows));
  handle('proxies:test', (_e, id) => proxyManager.testProxy(id));

  // --- Settings ---
  handle('settings:get', () => settingsStore.store);
  handle('settings:set', (_e, patch) => {
    Object.entries(patch || {}).forEach(([k, v]) => settingsStore.set(k, v));
    return settingsStore.store;
  });

  // --- Launch / lifecycle ---
  handle('profiles:launch', async (_e, profileId) => {
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

  handle('profiles:stop', (_e, profileId) => {
    const stopped = launcher.stopProfileWindow(profileId);
    if (stopped) profileManager.setStatus(profileId, 'stopped');
    return stopped;
  });

  handle('profiles:openTest', async (_e, profileId, testUrl) => {
    const profile = profileManager.getProfile(profileId);
    if (!profile) throw new Error('Profile not found');
    const proxy = profile.proxyId ? proxyManager.getProxy(profile.proxyId) : null;
    return launcher.openTestPage(profile, proxy, launchContext(), testUrl);
  });

  handle('profiles:clearStorage', (_e, profileId) =>
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
