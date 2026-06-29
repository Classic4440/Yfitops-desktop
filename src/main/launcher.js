'use strict';

// Launches and tracks isolated profile browser windows.
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');
const net = require('net');
const { BrowserWindow, session } = require('electron');
const { getProfileLogger } = require('./logger');
const { generateFingerprint } = require('./fingerprintGenerator');
const { startSocksForwarder } = require('./socksForwarder');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

// profileId -> BrowserWindow
const runningWindows = new Map();
// profileId -> ChildProcess (socksForwarder)
const runningForwarders = new Map();

function partitionName(profileId) {
  return `persist:profile-${profileId}`;
}

function buildProxyUrl(proxy) {
  const auth =
    proxy.username != null
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password || '')}@`
      : '';
  const scheme = proxy.type === 'socks5' ? 'socks5' : proxy.type;
  return `${scheme}://${auth}${proxy.host}:${proxy.port}`;
}

function isRunning(profileId) {
  const win = runningWindows.get(profileId);
  return Boolean(win && !win.isDestroyed());
}

function listRunning() {
  return Array.from(runningWindows.keys()).filter(isRunning);
}

/**
 * Apply per-window proxy settings.
 */
async function applyProxy(ses, win, proxy, logger) {
  if (!proxy) return;

  const scheme = proxy.type === 'socks5' ? 'socks5' : 'http';
  const proxyRules = `${scheme}://${proxy.host}:${proxy.port}`;
  await ses.setProxy({ proxyRules, proxyBypassRules: '<local>' });
  logger.info(`Proxy set: ${proxyRules} (type=${proxy.type})`);

  if (proxy.username && proxy.type !== 'socks5') {
    win.webContents.on('login', (event, _details, authInfo, callback) => {
      if (authInfo.isProxy) {
        event.preventDefault();
        callback(proxy.username, proxy.password || '');
      }
    });
  }
}

async function applyEmulation(wc, fp, logger) {
  wc.enableDeviceEmulation({
    screenPosition: 'desktop',
    screenSize: { width: fp.screenWidth, height: fp.screenHeight },
    viewSize: { width: fp.screenWidth, height: fp.screenHeight },
    viewPosition: { x: 0, y: 0 },
    deviceScaleFactor: 0,
    scale: 1,
  });

  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Emulation.setTimezoneOverride', {
      timezoneId: fp.timezone,
    });
    await wc.debugger.sendCommand('Emulation.setLocaleOverride', {
      locale: fp.language,
    });
    logger.info(`Emulation: tz=${fp.timezone} locale=${fp.language}`);
  } catch (err) {
    logger.warn(`CDP emulation override failed: ${err.message}`);
  }
}

function attachLogging(wc, logger) {
  wc.on('console-message', (_e, level, message, line, sourceId) => {
    logger.info(`[console:${level}] ${message} (${sourceId}:${line})`);
  });
  wc.on('render-process-gone', (_e, details) => {
    logger.error(`Renderer gone: ${details.reason} (${details.exitCode})`);
  });
  wc.session.webRequest.onCompleted((details) => {
    logger.debug(`[net] ${details.statusCode} ${details.method} ${details.url}`);
  });
  wc.session.webRequest.onErrorOccurred((details) => {
    logger.warn(`[net:error] ${details.method} ${details.url} -> ${details.error}`);
  });
}

async function launchProfileWindow(profile, proxy, ctx) {
  if (isRunning(profile.id)) {
    throw new Error(`Profile "${profile.name}" is already running.`);
  }

  const logger = getProfileLogger(profile.id, ctx.userDataPath);

  // --- SOCKS5 Forwarder Integration ---
  let effectiveProxy = proxy;
  if (proxy && proxy.type === 'socks5' && proxy.username) {
    const { port, child } = await startSocksForwarder(proxy);
    logger.info(`Spawning SOCKS5 forwarder for ${proxy.host}:${proxy.port} on local port ${port}`);

    runningForwarders.set(profile.id, child);
    // Point the browser to the local forwarder (which doesn't require auth)
    effectiveProxy = {
      ...proxy,
      host: '127.0.0.1',
      port: port,
      username: '',
      password: ''
    };
  }

  let geo = null;
  if (proxy) {
    try {
      const url = buildProxyUrl(proxy);
      const agent = proxy.type === 'socks5' ? new SocksProxyAgent(url) : new HttpsProxyAgent(url);
      const resp = await axios.get('http://ip-api.com/json', {
        httpAgent: agent,
        httpsAgent: agent,
        proxy: false,
        timeout: 5000,
      });
      geo = resp.data;
    } catch (e) {
      logger.warn(`Proxy geo fetch failed: ${e.message}. Using seed-only timezone.`);
    }
  }

  const fp = generateFingerprint(profile.seed, geo, profile.deviceId);
  const ses = session.fromPartition(partitionName(profile.id));
  ses.setUserAgent(fp.userAgent);

  const win = new BrowserWindow({
    width: Math.min(fp.screenWidth, 1600),
    height: Math.min(fp.screenHeight, 1000),
    title: `SocketObit — ${profile.name} (${fp.deviceName})`,
    webPreferences: {
      partition: partitionName(profile.id),
      preload: ctx.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [`--profile-id=${profile.id}`, `--fp=${JSON.stringify(fp)}`],
    },
  });

  runningWindows.set(profile.id, win);
  attachLogging(win.webContents, logger);

  win.on('closed', () => {
    runningWindows.delete(profile.id);
    const forwarder = runningForwarders.get(profile.id);
    if (forwarder) {
      forwarder.kill();
      runningForwarders.delete(profile.id);
      logger.info(`SOCKS5 forwarder for profile ${profile.id} stopped`);
    }
    logger.info(`Profile "${profile.name}" window closed`);
    if (ctx.onStatus) ctx.onStatus(profile.id, 'stopped');
  });

  try {
    await applyProxy(ses, win, effectiveProxy, logger);
    await applyEmulation(win.webContents, fp, logger);

    const startUrl = profile.startUrl || ctx.defaultStartUrl || 'about:blank';
    await win.loadURL(startUrl);
    if (ctx.onStatus) ctx.onStatus(profile.id, 'running');
    return { profileId: profile.id };
  } catch (err) {
    const forwarder = runningForwarders.get(profile.id);
    if (forwarder) {
      forwarder.kill();
      runningForwarders.delete(profile.id);
    }
    if (ctx.onStatus) ctx.onStatus(profile.id, 'error');
    if (!win.isDestroyed()) win.destroy();
    runningWindows.delete(profile.id);
    throw err;
  }
}

function stopProfileWindow(profileId) {
  const win = runningWindows.get(profileId);
  if (win && !win.isDestroyed()) {
    win.close();
    return true;
  }
  return false;
}

async function openTestPage(profile, proxy, ctx, testUrl) {
  if (!isRunning(profile.id)) {
    await launchProfileWindow(profile, proxy, ctx);
  }
  const win = runningWindows.get(profile.id);
  await win.loadURL(testUrl);
  return { profileId: profile.id };
}

async function clearProfileStorage(profileId, userDataPath) {
  if (isRunning(profileId)) {
    throw new Error('Stop the profile before clearing its storage.');
  }
  const ses = session.fromPartition(partitionName(profileId));
  await ses.clearStorageData();
  await ses.clearCache();
  const partitionDir = path.join(userDataPath, 'Partitions', `profile-${profileId}`);
  try {
    fs.rmSync(partitionDir, { recursive: true, force: true });
  } catch {}
  return true;
}

module.exports = {
  launchProfileWindow,
  stopProfileWindow,
  openTestPage,
  clearProfileStorage,
  isRunning,
  listRunning,
  partitionName,
};
