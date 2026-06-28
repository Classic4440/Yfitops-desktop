'use strict';

// Deterministic device-emulation value generation.
//
// Given a profile's `seed`, this module derives a consistent set of *emulation*
// values (screen size, user agent, language, timezone, hardwareConcurrency,
// deviceMemory). The same seed always yields the same values, so a profile keeps
// a stable identity across launches.
//
// These are legitimate QA emulation values applied through official Chromium
// emulation APIs (see launcher.js). This module does NOT spoof anti-detection
// signals (no navigator.webdriver tampering, no canvas/WebGL/audio noise).

// --- Candidate value pools (common, realistic desktop configurations) -------
const RESOLUTIONS = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
];

const LANGUAGES = ['en-US', 'en-GB', 'en-CA', 'fr-FR', 'de-DE', 'es-ES'];

const TIMEZONES = [
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Australia/Sydney',
  'Asia/Tokyo',
];

const HARDWARE_CONCURRENCY = [4, 8, 12, 16];
const DEVICE_MEMORY = [4, 8, 16];

// A small set of realistic, current desktop Chrome user agents. The emulated
// Chrome version is kept generic so it does not misrepresent the running engine
// in a way that breaks feature detection.
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

/**
 * Create a deterministic 32-bit hash from a string seed (xfnv1a).
 * @param {string} str
 * @returns {number}
 */
function xfnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/**
 * Build a seeded PRNG (mulberry32). Returns a function producing floats [0, 1).
 * @param {string} seedStr
 */
function seededRng(seedStr) {
  let a = xfnv1a(String(seedStr || 'default'));
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Compute the full emulation profile for a stored profile object.
 * Explicit per-profile overrides take precedence over seed-derived values.
 *
 * @param {object} profile - stored profile (may contain explicit overrides)
 * @returns {{
 *   screen: {width:number,height:number},
 *   userAgent: string,
 *   language: string,
 *   languages: string[],
 *   timezone: string,
 *   hardwareConcurrency: number,
 *   deviceMemory: number,
 *   startUrl: string|undefined
 * }}
 */
function computeEmulation(profile) {
  const rng = seededRng(profile && profile.seed);

  // Derive in a fixed order so adding fields later does not shift earlier ones.
  const derivedScreen = pick(rng, RESOLUTIONS);
  const derivedUserAgent = pick(rng, USER_AGENTS);
  const derivedLanguage = pick(rng, LANGUAGES);
  const derivedTimezone = pick(rng, TIMEZONES);
  const derivedConcurrency = pick(rng, HARDWARE_CONCURRENCY);
  const derivedMemory = pick(rng, DEVICE_MEMORY);

  // Explicit overrides from the profile (UI lets users pin these).
  const screen = parseResolution(profile && profile.resolution) || derivedScreen;
  const language = (profile && profile.language) || derivedLanguage;
  const timezone = (profile && profile.timezone) || derivedTimezone;
  const userAgent = (profile && profile.userAgent) || derivedUserAgent;

  return {
    screen,
    userAgent,
    language,
    languages: buildLanguages(language),
    timezone,
    hardwareConcurrency: derivedConcurrency,
    deviceMemory: derivedMemory,
    startUrl: profile && profile.startUrl,
  };
}

function parseResolution(res) {
  if (!res || typeof res !== 'string') return null;
  const m = res.toLowerCase().match(/^(\d+)\s*x\s*(\d+)$/);
  if (!m) return null;
  return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
}

// navigator.languages: primary language plus its base (e.g. en-US -> [en-US, en]).
function buildLanguages(primary) {
  const base = primary.split('-')[0];
  return base && base !== primary ? [primary, base] : [primary];
}

module.exports = {
  computeEmulation,
  seededRng,
  // Exported for the UI (e.g. to show available options).
  RESOLUTIONS,
  LANGUAGES,
  TIMEZONES,
};
