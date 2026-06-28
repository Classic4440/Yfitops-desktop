'use strict';

// Preload injected into every isolated profile window. It runs before any page
// script and applies the two emulation values that have no first-class Electron
// API: navigator.hardwareConcurrency and navigator.deviceMemory.
//
// These are legitimate QA emulation overrides (they let you test how a site
// adapts to different reported core counts / memory). This preload does NOT
// touch navigator.webdriver and performs NO canvas/WebGL/audio tampering.
const { contextBridge, ipcRenderer } = require('electron');

// The profile id is passed via additionalArguments in the launcher.
const profileArg = process.argv.find((a) => a.startsWith('--profile-id='));
const profileId = profileArg ? profileArg.split('=')[1] : null;

if (profileId) {
  // Synchronously fetch this profile's deterministic emulation values.
  const emu = ipcRenderer.sendSync('emulation:getSync', profileId);

  if (emu) {
    defineGetter(navigator, 'hardwareConcurrency', emu.hardwareConcurrency);
    defineGetter(navigator, 'deviceMemory', emu.deviceMemory);

    // Expose a tiny, read-only helper for in-page test scripts / debugging.
    contextBridge.exposeInMainWorld('spotCheck', {
      profileId,
      emulation: {
        hardwareConcurrency: emu.hardwareConcurrency,
        deviceMemory: emu.deviceMemory,
        screen: emu.screen,
        language: emu.language,
        timezone: emu.timezone,
        userAgent: emu.userAgent,
      },
    });
  }
}

/**
 * Define a stable, non-enumerable getter override on an object.
 * @param {object} target
 * @param {string} prop
 * @param {*} value
 */
function defineGetter(target, prop, value) {
  try {
    Object.defineProperty(target, prop, {
      get: () => value,
      configurable: true,
      enumerable: true,
    });
  } catch {
    // Some properties may be non-configurable in certain contexts; ignore.
  }
}
