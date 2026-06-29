'use strict';

// Launches and tracks isolated profile browser windows.
//
// Isolation strategy:
//  - Each profile uses a dedicated persistent session partition
//    (`persist:profile-<id>`), giving it its own cookies, cache, localStorage,
//    IndexedDB, etc. Chromium stores these under a per-partition folder inside
//    userData/Partitions, so profiles never share browsing data.
//  - A profile can only have one live window at a time (enforced below), which
//    also prevents two windows writing the same partition concurrently.
//
// Emulation strategy (official Chromium APIs only):
//  - User agent + Accept-Language: session.setUserAgent(ua, acceptLanguages)
//  - Screen / viewport metrics: webContents.enableDeviceEmulation(...)
//  - Timezone + locale: CDP Emulation.setTimezoneOverride / setLocaleOverride
//  - hardwareConcurrency / deviceMemory: defined in the profile preload
//
// No anti-detection tampering is performed.
const path = require('path');
const fs = require('fs');
const { BrowserWindow, session } = require('electron');
const { computeEmulation } = require('./emulation');
const { getProfileLogger } = require('./logger');
const { generateFingerprint } = require('./fingerprintGenerator');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

// profileId -> BrowserWindow
const runningWindows = new Map();

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
 * Apply per-window proxy settings, including HTTP/HTTPS proxy authentication.
 * SOCKS5 auth is not supported by Chromium's built-in proxy (documented).
 *
 * @param {Electron.Session} ses
 * @param {Electron.BrowserWindow} win
 * @param {object} proxy
 * @param {object} logger
 */
async function applyProxy(ses, win, proxy, logger) {
  if (!proxy) return;

  const scheme = proxy.type === 'socks5' ? 'socks5' : 'http';
  // proxyRules maps every protocol through the proxy; <local> is bypassed.
  const proxyRules = `${scheme}://${proxy.host}:${proxy.port}`;
  await ses.setProxy({ proxyRules, proxyBypassRules: '<local>' });
  logger.info(`Proxy set: ${proxyRules} (type=${proxy.type})`);

  if (proxy.username) {
    if (proxy.type === 'socks5') {
      logger.warn(
        'SOCKS5 username/password auth is not supported by Chromium proxy. ' +
          'Credentials will be ignored. Use an HTTP/HTTPS proxy or a local SOCKS forwarder.'
      );
    } else {
      // Respond to the proxy auth challenge for this window only.
      win.webContents.on('login', (event, _details, authInfo, callback) => {
        if (authInfo.isProxy) {
          event.preventDefault();
          callback(proxy.username, proxy.password || '');
        }
      });
    }
  }
}

/**
 * Apply official Chromium device emulation to a window's webContents.
 * @param {Electron.WebContents} wc
 * @param {object} fp - output of generateFingerprint()
 * @param {object} logger
 */
async function applyEmulation(wc, fp, logger) {
  // Screen + viewport metrics. screenPosition 'desktop' emulates a desktop
  // device; viewSize controls window.innerWidth/Height, screenSize controls
  // window.screen.width/height.
  wc.enableDeviceEmulation({
    screenPosition: 'desktop',
    screenSize: { width: fp.screenWidth, height: fp.screenHeight },
    viewSize: { width: fp.screenWidth, height: fp.screenHeight },
    viewPosition: { x: 0, y: 0 },
    deviceScaleFactor: 0,
    scale: 1,
  });

  // Timezone + locale via the Chrome DevTools Protocol (official emulation).
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

/**
 * Wire console + network logging for a profile window.
 * @param {Electron.WebContents} wc
 * @param {object} logger
 */
function attachLogging(wc, logger) {
  wc.on('console-message', (_e, level, message, line, sourceId) => {
    logger.info(`[console:${level}] ${message} (${sourceId}:${line})`);
  });
  wc.on('render-process-gone', (_e, details) => {
    logger.error(`Renderer gone: ${details.reason} (${details.exitCode})`);
  });

  // Lightweight network request logging via the session's webRequest API.
  wc.session.webRequest.onCompleted((details) => {
    logger.debug(`[net] ${details.statusCode} ${details.method} ${details.url}`);
  });
  wc.session.webRequest.onErrorOccurred((details) => {
    logger.warn(`[net:error] ${details.method} ${details.url} -> ${details.error}`);
  });
}

/**
 * Launch a profile in its own isolated browser window.
 *
 * @param {object} profile
 * @param {object|null} proxy
 * @param {object} ctx - { userDataPath, defaultStartUrl, preloadPath, onStatus }
 * @returns {Promise<{ profileId: string }>}
 */
async function launchProfileWindow(profile, proxy, ctx) {
  if (isRunning(profile.id)) {
    throw new Error(`Profile "${profile.name}" is already running.`);
  }

  const logger = getProfileLogger(profile.id, ctx.userDataPath);

  // Fetch proxy geo for timezone sync
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

  const fp = generateFingerprint(profile.seed, geo);
  const ses = session.fromPartition(partitionName(profile.id));
  // setUserAgent applies the UA and the Accept-Language header / navigator.languages.
  ses.setUserAgent(fp.userAgent, fp.languages.join(','));

  const win = new BrowserWindow({
    width: Math.min(fp.screenWidth, 1600),
    height: Math.min(fp.screenHeight, 1000),
    title: `SpotCheck — ${profile.name}`,
    webPreferences: {
      partition: partitionName(profile.id),
      preload: ctx.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Pass fingerprint to preload via additionalArguments
      additionalArguments: [`--profile-id=${profile.id}`, `--fp=${JSON.stringify(fp)}`],
    },
  });

  runningWindows.set(profile.id, win);
  attachLogging(win.webContents, logger);
  logger.info(`Launching profile "${profile.name}" (${profile.id})`);

  win.on('closed', () => {
    runningWindows.delete(profile.id);
    logger.info(`Profile "${profile.name}" window closed`);
    if (ctx.onStatus) ctx.onStatus(profile.id, 'stopped');
  });

  try {
    await applyProxy(ses, win, proxy, logger);
    await applyEmulation(win.webContents, fp, logger);

    const startUrl = profile.startUrl || ctx.defaultStartUrl || 'about:blank';
    await win.loadURL(startUrl);
    logger.info(`Loaded start URL: ${startUrl}`);
    if (ctx.onStatus) ctx.onStatus(profile.id, 'running');
    return { profileId: profile.id };
  } catch (err) {
    logger.error(`Launch failed: ${err.message}`);
    if (ctx.onStatus) ctx.onStatus(profile.id, 'error');
    if (!win.isDestroyed()) win.destroy();
    runningWindows.delete(profile.id);
    throw err;
  }
}

/**
 * Stop (close) a running profile window.
 * @param {string} profileId
 */
function stopProfileWindow(profileId) {
  const win = runningWindows.get(profileId);
  if (win && !win.isDestroyed()) {
    win.close();
    return true;
  }
  return false;
}

/**
 * Open a fingerprint/emulation test page inside the profile's own window,
 * launching the profile first if needed.
 * @param {object} profile
 * @param {object|null} proxy
 * @param {object} ctx
 * @param {string} testUrl
 */
async function openTestPage(profile, proxy, ctx, testUrl) {
  if (!isRunning(profile.id)) {
    await launchProfileWindow(profile, proxy, ctx);
  }
  const win = runningWindows.get(profile.id);
  await win.loadURL(testUrl);
  return { profileId: profile.id };
}

/**
 * Permanently clear a profile's isolated storage (cookies, cache, etc.) and
 * delete its on-disk partition folder. The profile must be stopped first.
 * @param {string} profileId
 * @param {string} userDataPath
 */
async function clearProfileStorage(profileId, userDataPath) {
  if (isRunning(profileId)) {
    throw new Error('Stop the profile before clearing its storage.');
  }
  const ses = session.fromPartition(partitionName(profileId));
  await ses.clearStorageData();
  await ses.clearCache();

  // Best-effort removal of the on-disk partition folder.
  const partitionDir = path.join(
    userDataPath,
    'Partitions',
    `profile-${profileId}`
  );
  try {
    fs.rmSync(partitionDir, { recursive: true, force: true });
  } catch {
    // Folder may not exist yet; storage was already cleared above.
  }
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
