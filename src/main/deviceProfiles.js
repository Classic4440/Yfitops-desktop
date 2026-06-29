// src/main/deviceProfiles.js
const fs = require('fs');
const path = require('path');

// Realistic component lists
const osList = [
  'Windows NT 10.0', // Win10
  'Windows NT 10.0', // Win11 (same)
  'Mac OS X 10_15_7', // macOS Catalina
  'Mac OS X 11_0_0', // Big Sur
  'Mac OS X 12_0_0', // Monterey
];

const platforms = ['Win32', 'Win32', 'MacIntel', 'MacIntel', 'MacIntel'];
const uaWindows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const uaMac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const screenRes = ['1920x1080','1366x768','2560x1440','3840x2160','1536x864','1440x900'];
const languages = ['en-US','en-GB','fr-FR','de-DE','es-ES','it-IT','pt-BR','nl-NL','ja-JP'];
const timezones = ['America/New_York','Europe/London','Europe/Paris','Asia/Tokyo','Australia/Sydney','America/Chicago','America/Los_Angeles'];
const cpus = [2,4,6,8,12,16];
const mem = [2,4,8,16,32];

const webglVendors = [
  'Google Inc. (NVIDIA)',
  'Google Inc. (Intel)',
  'Google Inc. (AMD)',
  'Google Inc. (Apple)',
];
const webglRenderers = [
  'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (AMD, Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (Apple, Apple M1, OpenGL 4.1)',
];

const pluginsList = [
  ['Chrome PDF Plugin','internal-pdf-viewer','Portable Document Format'],
  ['Chrome PDF Viewer','mhjfbmdgcfjbbpaeojofohoefgiehjai',''],
  ['Native Client','internal-nacl-plugin',''],
  ['Widevine Content Decryption Module','widevinecdmadapter',''],
];

function generateProfiles(count = 250) {
  const profiles = [];
  for (let i = 0; i < count; i++) {
    const osIndex = i % osList.length;
    const isWin = osList[osIndex].includes('Windows');
    const ua = isWin ? uaWindows : uaMac;
    const platform = isWin ? 'Win32' : 'MacIntel';
    const res = screenRes[i % screenRes.length];
    const [w, h] = res.split('x').map(Number);
    const lang = languages[i % languages.length];
    const tz = timezones[i % timezones.length];
    const cpu = cpus[i % cpus.length];
    const memVal = mem[i % mem.length];
    const vendor = webglVendors[i % webglVendors.length];
    const renderer = webglRenderers[i % webglRenderers.length];
    const name = `${isWin ? 'Windows' : 'macOS'} ${osList[osIndex].slice(-4)} / ${res}`;

    profiles.push({
      id: `device_${String(i).padStart(3,'0')}`,
      name,
      os: osList[osIndex],
      platform,
      userAgent: ua,
      screenWidth: w,
      screenHeight: h,
      language: lang,
      languages: [lang, 'en'],
      timezone: tz,
      hardwareConcurrency: cpu,
      deviceMemory: memVal,
      webglVendor: vendor,
      webglRenderer: renderer,
      audioSampleRate: [44100, 48000][i % 2],
      plugins: pluginsList.map(p => ({ name: p[0], filename: p[1], description: p[2] })),
    });
  }
  return profiles;
}

// Write to file
const devices = generateProfiles(250);
const jsonPath = path.join(__dirname, 'deviceProfiles.json');
fs.writeFileSync(jsonPath, JSON.stringify({ devices }, null, 2));

console.log(`Generated ${devices.length} device profiles -> ${jsonPath}`);
