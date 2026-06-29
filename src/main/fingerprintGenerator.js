const crypto = require('crypto');

function seededHash(seed, key) {
  const h = crypto.createHash('sha256');
  h.update(seed + key);
  return parseInt(h.digest('hex').slice(0, 8), 16) / 0xFFFFFFFF;
}

function pick(arr, seed, key) {
  const idx = Math.floor(seededHash(seed, key) * arr.length);
  return arr[idx];
}

/**
 * Real Device Hardware Profiles
 * Coordinated sets of hardware specs to avoid "impossible" combinations.
 */
const DEVICE_PROFILES = [
  {
    name: 'MacBook Pro 16 (M2 Max)',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    hwConcurrency: 12,
    deviceMemory: 16,
    res: '3456x2234',
    vendor: 'Apple Inc.',
    renderer: 'Apple M2 Max',
    platform: 'MacIntel'
  },
  {
    name: 'Dell XPS 15 (Windows 11)',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    hwConcurrency: 16,
    deviceMemory: 8,
    res: '1920x1200',
    vendor: 'Google Inc. (Intel)',
    renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)',
    platform: 'Win32'
  },
  {
    name: 'Surface Laptop 5',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    hwConcurrency: 8,
    deviceMemory: 4,
    res: '2256x1504',
    vendor: 'Google Inc. (Intel)',
    renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)',
    platform: 'Win32'
  },
  {
    name: 'High-End Gaming PC (NVIDIA)',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    hwConcurrency: 24,
    deviceMemory: 16,
    res: '2560x1440',
    vendor: 'Google Inc. (NVIDIA)',
    renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0)',
    platform: 'Win32'
  }
];

function generateFingerprint(seed, proxyGeo = null, forcedProfile = null) {
  const profile = forcedProfile || pick(DEVICE_PROFILES, seed, 'device');
  
  const [width, height] = profile.res.split('x').map(Number);
  const languages = [['en-US','en'], ['en-GB','en'], ['fr-FR','fr'], ['de-DE','de']];
  const timezones = ['America/New_York','Europe/London','Europe/Paris','Australia/Sydney'];

  const langPair = pick(languages, seed, 'lang');
  const primaryLang = langPair[0];
  const langList = [primaryLang, ...(seededHash(seed, 'langExtra') > 0.5 ? ['en'] : [])];
  
  let timezone = pick(timezones, seed, 'tz');
  if (proxyGeo && proxyGeo.timezone) timezone = proxyGeo.timezone;

  // Plugins (Standard modern Chrome set)
  const plugins = [
    { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
    { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: '' },
    { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: '' },
    { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: '' }
  ].slice(0, 3);

  // Canvas noise
  const canvasNoise = [];
  for (let i=0; i<10; i++) {
    canvasNoise.push({
      x: Math.floor(seededHash(seed, `cnx${i}`) * 200),
      y: Math.floor(seededHash(seed, `cny${i}`) * 200),
      r: Math.floor(seededHash(seed, `cnr${i}`) * 4) - 2,
      g: Math.floor(seededHash(seed, `cng${i}`) * 4) - 2,
      b: Math.floor(seededHash(seed, `cnb${i}`) * 4) - 2
    });
  }

  return {
    deviceName: profile.name,
    userAgent: profile.ua,
    screenWidth: width,
    screenHeight: height,
    language: primaryLang,
    languages: langList,
    timezone,
    hardwareConcurrency: profile.hwConcurrency,
    deviceMemory: profile.deviceMemory,
    platform: profile.platform,
    plugins: plugins,
    canvasNoise,
    webgl: {
      vendor: profile.vendor,
      renderer: profile.renderer
    },
    seed
  };
}

module.exports = { generateFingerprint, DEVICE_PROFILES };
