import React, { useState } from 'react';

const api = window.api;

const empty = {
  label: '',
  type: 'http',
  host: '',
  port: '',
  username: '',
  password: '',
  rotating: false,
};

export default function ProxyModal({ editing, notify, onClose, onSaved }) {
  const isEdit = Boolean(editing);
  const [form, setForm] = useState(isEdit ? { ...empty, ...editing } : empty);
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) =>
    setForm((f) => ({
      ...f,
      [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        label: form.label,
        type: form.type,
        host: form.host,
        port: form.port,
        username: form.username || undefined,
        password: form.password || undefined,
        rotating: form.rotating,
      };
      if (isEdit) {
        await api.proxies.update(editing.id, payload);
        notify('Proxy updated', 'success');
      } else {
        await api.proxies.add(payload);
        notify('Proxy added', 'success');
      }
      await onSaved();
    } catch (err) {
      notify(err.message || String(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{isEdit ? 'Edit Proxy' : 'Add Proxy'}</h2>
        <p className="subtitle">Residential / datacenter HTTP, HTTPS, or SOCKS5 proxies.</p>

        <div className="field">
          <label>Label</label>
          <input value={form.label} onChange={set('label')} placeholder="e.g. US residential #1" />
        </div>
        <div className="field">
          <div className="row">
            <div>
              <label>Type</label>
              <select value={form.type} onChange={set('type')}>
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
                <option value="socks5">SOCKS5</option>
              </select>
            </div>
            <div>
              <label>Port</label>
              <input value={form.port} onChange={set('port')} placeholder="8080" />
            </div>
          </div>
        </div>
        <div className="field">
          <label>Host</label>
          <input value={form.host} onChange={set('host')} placeholder="proxy.example.com" />
        </div>
        <div className="field">
          <div className="row">
            <div>
              <label>Username (optional)</label>
              <input value={form.username} onChange={set('username')} autoComplete="off" />
            </div>
            <div>
              <label>Password (optional)</label>
              <input
                type="password"
                value={form.password}
                onChange={set('password')}
                autoComplete="off"
              />
            </div>
          </div>
        </div>
        {form.type === 'socks5' && (form.username || form.password) && (
          <p className="muted" style={{ marginTop: -4 }}>
            ⚠ Chromium does not support SOCKS5 username/password auth; credentials will be
            ignored at launch. See README for a local-forwarder workaround.
          </p>
        )}
        <div className="field">
          <label className="checkbox">
            <input type="checkbox" checked={form.rotating} onChange={set('rotating')} />
            Mark as rotating (flag only — for future use)
          </label>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? <span className="spinner" /> : isEdit ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}
