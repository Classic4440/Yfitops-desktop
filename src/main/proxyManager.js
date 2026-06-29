'use strict';

// CRUD for the global proxy pool plus connectivity testing.
//
// A proxy shape:
// {
//   id: string,
//   label: string,
//   type: 'http'|'https'|'socks5',
//   host: string,
//   port: number,
//   username: string|undefined,
//   password: string|undefined,
//   rotating: boolean,          // flag only (future use)
//   lastTest: {
//     ok: boolean, ip?: string, country?: string, city?: string,
//     error?: string, at: number
//   } | null
// }
const crypto = require('crypto');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { proxiesStore, settingsStore } = require('./store');
const { appLog } = require('./logger');

const VALID_TYPES = ['http', 'https', 'socks5'];

function listProxies() {
  return proxiesStore.get('proxies', []);
}

function getProxy(id) {
  return listProxies().find((p) => p.id === id) || null;
}

function normalizeProxy(data = {}) {
  const type = String(data.type || 'http').toLowerCase();
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`Unsupported proxy type "${data.type}". Use http, https, or socks5.`);
  }
  const port = parseInt(data.port, 10);
  if (!data.host || Number.isNaN(port)) {
    throw new Error('Proxy requires a host and a numeric port.');
  }
  return {
    label: data.label && String(data.label).trim() ? String(data.label).trim() : `${data.host}:${port}`,
    type,
    host: String(data.host).trim(),
    port,
    username: data.username ? String(data.username) : undefined,
    password: data.password ? String(data.password) : undefined,
    rotating: Boolean(data.rotating),
  };
}

function addProxy(data) {
  const proxies = listProxies();
  const proxy = { id: crypto.randomUUID(), ...normalizeProxy(data), lastTest: null };
  proxies.push(proxy);
  proxiesStore.set('proxies', proxies);
  return proxy;
}

function updateProxy(id, patch = {}) {
  const proxies = listProxies();
  const idx = proxies.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error(`Proxy ${id} not found`);
  const merged = normalizeProxy({ ...proxies[idx], ...patch });
  proxies[idx] = { ...proxies[idx], ...merged };
  proxiesStore.set('proxies', proxies);
  return proxies[idx];
}

function deleteProxy(id) {
  const proxies = listProxies().filter((p) => p.id !== id);
  proxiesStore.set('proxies', proxies);
  return true;
}

/**
 * Bulk import proxies from an array of plain objects (already parsed from
 * CSV/JSON in the renderer or main). Invalid rows are reported, not fatal.
 * @param {object[]} rows
 * @returns {{added: object[], errors: {row:number, error:string}[]}}
 */
function importProxies(rows = []) {
  const added = [];
  const errors = [];
  const proxies = listProxies();
  rows.forEach((row, i) => {
    try {
      const proxy = { id: crypto.randomUUID(), ...normalizeProxy(row), lastTest: null };
      proxies.push(proxy);
      added.push(proxy);
    } catch (err) {
      errors.push({ row: i + 1, error: err.message });
    }
  });
  proxiesStore.set('proxies', proxies);
  return { added, errors };
}

/**
 * Build a proxy URL with credentials embedded (used by the test agents).
 * @param {object} proxy
 */
function buildProxyUrl(proxy) {
  const auth =
    proxy.username != null
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password || '')}@`
      : '';
  const scheme = proxy.type === 'socks5' ? 'socks5' : proxy.type;
  return `${scheme}://${auth}${proxy.host}:${proxy.port}`;
}

/**
 * Test a proxy by routing a request to the configured geo-IP endpoint.
 * On success it records the observed exit IP / location.
 *
 * @param {string} id - proxy id
 * @returns {Promise<object>} the test result (also persisted on the proxy)
 */
async function testProxy(id) {
  const proxy = getProxy(id);
  if (!proxy) throw new Error(`Proxy ${id} not found`);

  appLog.info(`Testing proxy: ${proxy.host}:${proxy.port} (type=${proxy.type})`);

  const url = buildProxyUrl(proxy);
  const agent =
    proxy.type === 'socks5' ? new SocksProxyAgent(url) : new HttpsProxyAgent(url);
  const testUrl = settingsStore.get('proxyTestUrl', 'http://ip-api.com/json');
  const timeout = settingsStore.get('proxyTestTimeoutMs', 10000);

  let result;
  try {
    const res = await axios.get(testUrl, {
      httpAgent: agent,
      httpsAgent: agent,
      proxy: false, // disable axios' own proxy handling; we use the agent
      timeout,
    });
    const data = res.data || {};
    result = {
      ok: true,
      ip: data.query || data.ip,
      country: data.country,
      city: data.city,
      at: Date.now(),
    };
    appLog.info(`Proxy OK: ${proxy.host}:${proxy.port} -> exit IP: ${result.ip}`);
  } catch (err) {
    result = { ok: false, error: err.message, at: Date.now() };
    appLog.warn(`Proxy failed: ${proxy.host}:${proxy.port} -> ${err.message}`);
  }

  // Persist the latest test outcome on the proxy record.
  const proxies = listProxies();
  const idx = proxies.findIndex((p) => p.id === id);
  if (idx !== -1) {
    proxies[idx] = { ...proxies[idx], lastTest: result };
    proxiesStore.set('proxies', proxies);
  }
  return result;
}

module.exports = {
  listProxies,
  getProxy,
  addProxy,
  updateProxy,
  deleteProxy,
  importProxies,
  testProxy,
  buildProxyUrl,
};
