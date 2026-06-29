const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load device profiles once
const profilesPath = path.join(__dirname, 'deviceProfiles.json');
let deviceProfiles = [];
try {
  deviceProfiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8')).devices;
} catch (err) {
  console.error('Failed to load device profiles:', err);
}

function seededHash(seed, key) {
  const h = crypto.createHash('sha256');
  h.update(seed + key);
  return parseInt(h.digest('hex').slice(0, 8), 16) / 0xFFFFFFFF;
}

function getDeviceProfile(deviceId) {
  return deviceProfiles.find(d => d.id === deviceId) || deviceProfiles[0];
}

function generateFingerprint(seed, proxyGeo = null, deviceId = null) {
  // If no deviceId is provided, use the seed to pick one consistently
  const profile = deviceId ? getDeviceProfile(deviceId) : deviceProfiles[Math.floor(seededHash(seed, 'device') * deviceProfiles.length)];

  // Override timezone if proxy geo provides it
  let timezone = profile.timezone;
  if (proxyGeo && proxyGeo.timezone) {
    timezone = proxyGeo.timezone;
  }

  // Canvas noise (deterministic per seed)
  const canvasNoise = [];
  for (let i = 0; i < 10; i++) {
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
    userAgent: profile.userAgent,
    screenWidth: profile.screenWidth,
    screenHeight: profile.screenHeight,
    language: profile.language,
    languages: [profile.language, 'en'],
    timezone,
    hardwareConcurrency: profile.hardwareConcurrency,
    deviceMemory: profile.deviceMemory,
    platform: profile.platform,
    plugins: profile.plugins.map(name => ({ name, filename: '', description: '' })),
    canvasNoise,
    webgl: {
      vendor: profile.webglVendor,
      renderer: profile.webglRenderer
    },
    audioSampleRate: profile.audioSampleRate,
    seed
  };
}

module.exports = { generateFingerprint, getDeviceProfile, deviceProfiles };
