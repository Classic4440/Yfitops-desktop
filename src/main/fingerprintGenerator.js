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

function generateFingerprint(seed, proxyGeo = null) {
  const uas = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];

  const screenRes = ['1920x1080', '1366x768', '1536x864', '1440x900', '1280x720'];
  const languages = [['en-US','en'], ['en-GB','en'], ['fr-FR','fr'], ['de-DE','de']];
  const timezones = ['America/New_York','Europe/London','Europe/Paris','Australia/Sydney'];
  const hwConcurrency = [2,4,6,8,12,16];
  const deviceMemory = [2,4,8,16];

  const userAgent = pick(uas, seed, 'ua');
  const res = pick(screenRes, seed, 'res');
  const [width, height] = res.split('x').map(Number);
  const langPair = pick(languages, seed, 'lang');
  const primaryLang = langPair[0];
  const langList = [primaryLang, ...(seededHash(seed, 'langExtra') > 0.5 ? ['en'] : [])];
  let timezone = pick(timezones, seed, 'tz');
  if (proxyGeo && proxyGeo.timezone) timezone = proxyGeo.timezone;

  // Plugins
  const plugins = [
    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
    { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
  ];
  const shuffledPlugins = plugins.slice().sort((a,b) => {
    return seededHash(seed, 'plugin_'+a.name) - seededHash(seed, 'plugin_'+b.name);
  });

  // Canvas noise (10 points)
  const canvasNoise = [];
  for (let i=0; i<10; i++) {
    canvasNoise.push({
      x: Math.floor(seededHash(seed, `cnx${i}`) * 200),
      y: Math.floor(seededHash(seed, `cny${i}`) * 200),
      r: Math.floor(seededHash(seed, `cnr${i}`) * 6) - 3,
      g: Math.floor(seededHash(seed, `cng${i}`) * 6) - 3,
      b: Math.floor(seededHash(seed, `cnb${i}`) * 6) - 3
    });
  }

  // WebGL
  const vendors = ['Google Inc. (Intel)', 'Google Inc. (NVIDIA)'];
  const renderers = [
    'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)',
    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 Direct3D11 vs_5_0 ps_5_0)'
  ];

  return {
    userAgent,
    screenWidth: width,
    screenHeight: height,
    language: primaryLang,
    languages: langList,
    timezone,
    hardwareConcurrency: pick(hwConcurrency, seed, 'hw'),
    deviceMemory: pick(deviceMemory, seed, 'mem'),
    plugins: shuffledPlugins,
    canvasNoise,
    webgl: {
      vendor: pick(vendors, seed, 'webglvendor'),
      renderer: pick(renderers, seed, 'webglrenderer')
    },
    seed // including seed for audio hash in preload
  };
}

module.exports = { generateFingerprint };
