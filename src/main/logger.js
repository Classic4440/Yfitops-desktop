'use strict';

// Per-profile logging using electron-log. Each profile gets its own log file at
// <userData>/logs/profile-<id>.log capturing lifecycle events, console messages
// from the profile window, and a summary of network requests.
const path = require('path');
const log = require('electron-log');

// Cache of per-profile logger instances so repeated launches reuse one transport.
const loggers = new Map();

/**
 * Get (or create) a scoped logger for a profile.
 * @param {string} profileId
 * @param {string} userDataPath - app.getPath('userData')
 */
function getProfileLogger(profileId, userDataPath) {
  if (loggers.has(profileId)) return loggers.get(profileId);

  const scoped = log.create({ logId: `profile-${profileId}` });
  scoped.transports.file.resolvePathFn = () =>
    path.join(userDataPath, 'logs', `profile-${profileId}.log`);
  scoped.transports.file.level = 'silly';
  // Avoid duplicating profile logs into the shared console transport.
  scoped.transports.console.level = false;

  loggers.set(profileId, scoped);
  return scoped;
}

// Shared application logger (main-process diagnostics).
const appLog = log.create({ logId: 'app' });

module.exports = { getProfileLogger, appLog };
