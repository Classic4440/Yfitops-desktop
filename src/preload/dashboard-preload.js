'use strict';

// Preload for the dashboard window. Exposes a typed, minimal `window.api`
// surface to the React renderer via contextBridge. No Node APIs are leaked to
// the renderer; everything goes through validated IPC channels.
const { contextBridge, ipcRenderer } = require('electron');

const api = {
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'),
    create: (data) => ipcRenderer.invoke('profiles:create', data),
    update: (id, patch) => ipcRenderer.invoke('profiles:update', id, patch),
    remove: (id) => ipcRenderer.invoke('profiles:delete', id),
    duplicate: (id) => ipcRenderer.invoke('profiles:duplicate', id),
    generateSeed: () => ipcRenderer.invoke('profiles:generateSeed'),
    emulation: (id) => ipcRenderer.invoke('profiles:emulation', id),
    launch: (id) => ipcRenderer.invoke('profiles:launch', id),
    stop: (id) => ipcRenderer.invoke('profiles:stop', id),
    openTest: (id, testUrl) => ipcRenderer.invoke('profiles:openTest', id, testUrl),
    clearStorage: (id) => ipcRenderer.invoke('profiles:clearStorage', id),
  },
  proxies: {
    list: () => ipcRenderer.invoke('proxies:list'),
    add: (data) => ipcRenderer.invoke('proxies:add', data),
    update: (id, patch) => ipcRenderer.invoke('proxies:update', id, patch),
    remove: (id) => ipcRenderer.invoke('proxies:delete', id),
    import: (rows) => ipcRenderer.invoke('proxies:import', rows),
    test: (id) => ipcRenderer.invoke('proxies:test', id),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
  },
  // Subscribe to live status changes; returns an unsubscribe function.
  onProfileStatus: (handler) => {
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on('profile-status-changed', listener);
    return () => ipcRenderer.removeListener('profile-status-changed', listener);
  },
};

contextBridge.exposeInMainWorld('api', api);
