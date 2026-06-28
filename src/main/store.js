'use strict';

// Encrypted local storage for profiles and proxies using electron-store.
//
// NOTE ON ENCRYPTION: electron-store's `encryptionKey` provides obfuscation /
// at-rest tamper-resistance for the JSON file. It is NOT a substitute for OS
// keychain-grade secrecy because the key must live in the app bundle. For a
// shippable build you should override the key via the SPOTCHECK_STORE_KEY
// environment variable (see README) rather than relying on the default below.
const Store = require('electron-store');

const ENCRYPTION_KEY =
  process.env.SPOTCHECK_STORE_KEY || 'spotcheck-lab-default-key-change-me';

const profilesStore = new Store({
  name: 'profiles',
  encryptionKey: ENCRYPTION_KEY,
  defaults: { profiles: [] },
});

const proxiesStore = new Store({
  name: 'proxies',
  encryptionKey: ENCRYPTION_KEY,
  defaults: { proxies: [] },
});

const settingsStore = new Store({
  name: 'settings',
  encryptionKey: ENCRYPTION_KEY,
  defaults: {
    defaultStartUrl: 'https://www.whatismybrowser.com/',
    proxyTestUrl: 'http://ip-api.com/json',
    proxyTestTimeoutMs: 10000,
  },
});

module.exports = { profilesStore, proxiesStore, settingsStore };
