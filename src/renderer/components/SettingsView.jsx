import React, { useEffect, useState } from 'react';

const api = window.api;

export default function SettingsView({ notify }) {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.settings.get().then(setSettings);
  }, []);

  if (!settings) return <div className="muted">Loading…</div>;

  const set = (key) => (e) => setSettings((s) => ({ ...s, [key]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      await api.settings.set({
        defaultStartUrl: settings.defaultStartUrl,
        proxyTestUrl: settings.proxyTestUrl,
        proxyTestTimeoutMs: Number(settings.proxyTestTimeoutMs) || 10000,
      });
      notify('Settings saved', 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Defaults applied across profile launches and proxy testing.</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="field">
          <label>Default start URL</label>
          <input value={settings.defaultStartUrl} onChange={set('defaultStartUrl')} />
        </div>
        <div className="field">
          <label>Proxy test endpoint (geo-IP JSON)</label>
          <input value={settings.proxyTestUrl} onChange={set('proxyTestUrl')} />
        </div>
        <div className="field">
          <label>Proxy test timeout (ms)</label>
          <input
            type="number"
            value={settings.proxyTestTimeoutMs}
            onChange={set('proxyTestTimeoutMs')}
          />
        </div>
        <div className="modal-actions">
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? <span className="spinner" /> : 'Save settings'}
          </button>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560, marginTop: 16 }}>
        <div className="card-meta">
          <strong>About isolation & emulation</strong>
          <br />
          Each profile runs in its own persistent Chromium partition (separate cookies, cache,
          storage). Device emulation uses official Chromium APIs only — user agent,
          Accept-Language, screen/viewport metrics, timezone &amp; locale overrides, and reported
          CPU/memory. No anti-detection tampering is performed.
        </div>
      </div>
    </>
  );
}
