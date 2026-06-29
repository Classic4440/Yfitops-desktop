'use strict';

const Store = require('electron-store');
const { appLog } = require('./logger');

const ENCRYPTION_KEY =
  process.env.SPOTCHECK_STORE_KEY || 'spotcheck-lab-default-key-change-me';

/**
 * Creates a store with automatic recovery on initialization errors.
 */
function createResilientStore(options) {
  try {
    return new Store(options);
  } catch (err) {
    appLog.error(`Store initialization failed for ${options.name}, resetting:`, err);
    // If loading fails (e.g. corruption), delete the file and try once more
    const fs = require('fs');
    const path = require('path');
    const storePath = path.join(require('electron').app.getPath('userData'), `${options.name}.json`);
    
    try {
      if (fs.existsSync(storePath)) fs.unlinkSync(storePath);
      return new Store(options);
    } catch (retryErr) {
      appLog.error(`Critical: Store reset failed for ${options.name}`, retryErr);
      throw retryErr;
    }
  }
}

const profilesStore = createResilientStore({
  name: 'profiles',
  encryptionKey: ENCRYPTION_KEY,
  defaults: { profiles: [] },
});

const proxiesStore = createResilientStore({
  name: 'proxies',
  encryptionKey: ENCRYPTION_KEY,
  defaults: { proxies: [] },
});

const settingsStore = createResilientStore({
  name: 'settings',
  encryptionKey: ENCRYPTION_KEY,
  defaults: {
    defaultStartUrl: 'https://www.whatismybrowser.com/',
    proxyTestUrl: 'http://ip-api.com/json',
    proxyTestTimeoutMs: 10000,
  },
});

module.exports = { profilesStore, proxiesStore, settingsStore };
