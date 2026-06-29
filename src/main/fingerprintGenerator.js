const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load device profiles
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

function validateDevice(profile) {
  const errors = [];
  if (profile.os.includes('Windows') && profile.platform !== 'Win32') {
    errors.push('OS mismatch: Windows but platform not Win32');
  }
  if (profile.os.includes('Mac') && profile.platform !== 'MacIntel') {
    errors.push('OS mismatch: macOS but platform not MacIntel');
  }
  if (profile.webglVendor.includes('NVIDIA') && !profile.webglRenderer.includes('NVIDIA')) {
    errors.push('WebGL vendor/renderer mismatch');
  }
  
  if (errors.length > 0) {
    console.warn('Device validation failed for:', profile.id, errors);
    return false;
  }
  return true;
}

function getDeviceProfile(deviceId) {
  const profile = deviceProfiles.find(d => d.id === deviceId);
  if (profile && validateDevice(profile)) {
    return profile;
  }
  // Fallback to the first valid profile
  console.warn(`Device ${deviceId} not found or invalid, using fallback.`);
  return deviceProfiles.find(validateDevice) || deviceProfiles[0];
}

function generateFingerprint(seed, proxyGeo = null, deviceId = null) {
  // If no deviceId is provided, use the seed to pick one consistently
  let profile;
  if (deviceId) {
    profile = getDeviceProfile(deviceId);
  } else {
    profile = deviceProfiles[Math.floor(seededHash(seed, 'device') * deviceProfiles.length)];
    // Ensure the randomly selected profile is valid
    if (!validateDevice(profile)) {
        profile = deviceProfiles.find(validateDevice) || deviceProfiles[0];
    }
  }

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
