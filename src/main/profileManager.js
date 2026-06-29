'use strict';

// CRUD for browser profiles, persisted via the encrypted profiles store.
//
// A profile shape:
// {
//   id: string,
//   name: string,
//   proxyId: string|null,
//   seed: string,
//   resolution: string|undefined,   // explicit override "1920x1080"
//   language: string|undefined,     // explicit override "en-US"
//   timezone: string|undefined,     // explicit override "Europe/London"
//   userAgent: string|undefined,    // explicit override
//   startUrl: string|undefined,
//   status: 'stopped'|'running'|'error',
//   lastUsed: number|null,          // epoch ms
//   createdAt: number
// }
const crypto = require('crypto');
const { profilesStore } = require('./store');

function listProfiles() {
  return profilesStore.get('profiles', []);
}

function getProfile(id) {
  return listProfiles().find((p) => p.id === id) || null;
}

function generateSeed() {
  return crypto.randomBytes(8).toString('hex');
}

function createProfile(data = {}) {
  const profiles = listProfiles();
  const id = crypto.randomUUID();
  const newProfile = {
    id,
    name: data.name && String(data.name).trim() ? String(data.name).trim() : `Profile ${profiles.length + 1}`,
    proxyId: data.proxyId || null,
    seed: data.seed && String(data.seed).trim() ? String(data.seed).trim() : generateSeed(),
    deviceId: data.deviceId || undefined,
    resolution: data.resolution || undefined,
    language: data.language || undefined,
    timezone: data.timezone || undefined,
    userAgent: data.userAgent || undefined,
    startUrl: data.startUrl || undefined,
    status: 'stopped',
    lastUsed: null,
    createdAt: Date.now(),
  };
  profiles.push(newProfile);
  profilesStore.set('profiles', profiles);
  return newProfile;
}

function updateProfile(id, patch = {}) {
  const profiles = listProfiles();
  const idx = profiles.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error(`Profile ${id} not found`);
  // Never allow overwriting immutable identity fields from a patch.
  const { id: _ignoreId, createdAt: _ignoreCreated, ...safe } = patch;
  profiles[idx] = { ...profiles[idx], ...safe };
  profilesStore.set('profiles', profiles);
  return profiles[idx];
}

function setStatus(id, status) {
  const patch = { status };
  if (status === 'running') patch.lastUsed = Date.now();
  return updateProfile(id, patch);
}

function deleteProfile(id) {
  const profiles = listProfiles().filter((p) => p.id !== id);
  profilesStore.set('profiles', profiles);
  return true;
}

function duplicateProfile(id) {
  const original = getProfile(id);
  if (!original) throw new Error(`Profile ${id} not found`);
  // Duplicate gets a fresh identity (new id + new seed) but copies settings.
  return createProfile({
    ...original,
    name: `${original.name} (copy)`,
    seed: generateSeed(),
  });
}

module.exports = {
  listProfiles,
  getProfile,
  createProfile,
  updateProfile,
  setStatus,
  deleteProfile,
  duplicateProfile,
  generateSeed,
};
