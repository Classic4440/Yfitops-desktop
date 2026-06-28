import React, { useState } from 'react';
import ProfileWizard from './ProfileWizard.jsx';

const api = window.api;

function StatusBadge({ status }) {
  return <span className={`badge ${status}`}>{status}</span>;
}

function partialProxy(proxy) {
  if (!proxy) return 'none';
  const ip = proxy.lastTest && proxy.lastTest.ip;
  const shown = ip || proxy.host;
  // Show only a partial address to avoid surfacing full proxy details at a glance.
  const parts = String(shown).split('.');
  const masked = parts.length === 4 ? `${parts[0]}.${parts[1]}.•.•` : shown;
  return `${masked} (${proxy.type})`;
}

function formatTime(ts) {
  if (!ts) return 'never';
  return new Date(ts).toLocaleString();
}

export default function ProfilesView({ profiles, proxies, refresh, notify }) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState({}); // profileId -> bool

  const proxyById = Object.fromEntries(proxies.map((p) => [p.id, p]));

  const withBusy = async (id, fn, okMsg) => {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await fn();
      if (okMsg) notify(okMsg, 'success');
      await refresh();
    } catch (err) {
      notify(err.message || String(err), 'error');
      await refresh();
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  const launch = (p) =>
    withBusy(p.id, () => api.profiles.launch(p.id), `Launched "${p.name}"`);
  const stop = (p) => withBusy(p.id, () => api.profiles.stop(p.id), `Stopped "${p.name}"`);
  const duplicate = (p) =>
    withBusy(p.id, () => api.profiles.duplicate(p.id), 'Profile duplicated');
  const remove = (p) => {
    if (!confirm(`Delete profile "${p.name}"? This cannot be undone.`)) return;
    withBusy(p.id, () => api.profiles.remove(p.id), 'Profile deleted');
  };
  const clearStorage = (p) => {
    if (!confirm(`Clear all browsing data for "${p.name}"?`)) return;
    withBusy(p.id, () => api.profiles.clearStorage(p.id), 'Storage cleared');
  };
  const openTest = (p) =>
    withBusy(p.id, () => api.profiles.openTest(p.id, 'https://www.whatismybrowser.com/'));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Profiles</h1>
          <p>Isolated browser environments with per-profile proxy and device emulation.</p>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            setEditing(null);
            setWizardOpen(true);
          }}
        >
          + New Profile
        </button>
      </div>

      {profiles.length === 0 ? (
        <div className="empty">
          No profiles yet. Click <strong>New Profile</strong> to create your first isolated
          testing environment.
        </div>
      ) : (
        <div className="card-grid">
          {profiles.map((p) => {
            const proxy = proxyById[p.proxyId];
            const isBusy = busy[p.id];
            const running = p.status === 'running';
            return (
              <div className="card" key={p.id}>
                <div className="card-top">
                  <span className="card-title">{p.name}</span>
                  <StatusBadge status={p.status} />
                </div>
                <div className="card-meta">
                  Proxy: <code>{partialProxy(proxy)}</code>
                  <br />
                  Seed: <code>{p.seed}</code>
                  <br />
                  Last used: {formatTime(p.lastUsed)}
                </div>
                <div className="card-actions">
                  {running ? (
                    <button className="btn small danger" disabled={isBusy} onClick={() => stop(p)}>
                      Stop
                    </button>
                  ) : (
                    <button
                      className="btn small primary"
                      disabled={isBusy}
                      onClick={() => launch(p)}
                    >
                      {isBusy ? <span className="spinner" /> : 'Launch'}
                    </button>
                  )}
                  <button className="btn small" disabled={isBusy} onClick={() => openTest(p)}>
                    Test
                  </button>
                  <button
                    className="btn small"
                    disabled={isBusy || running}
                    onClick={() => {
                      setEditing(p);
                      setWizardOpen(true);
                    }}
                  >
                    Edit
                  </button>
                  <button className="btn small" disabled={isBusy} onClick={() => duplicate(p)}>
                    Duplicate
                  </button>
                  <button
                    className="btn small"
                    disabled={isBusy || running}
                    onClick={() => clearStorage(p)}
                  >
                    Clear
                  </button>
                  <button
                    className="btn small danger"
                    disabled={isBusy || running}
                    onClick={() => remove(p)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {wizardOpen && (
        <ProfileWizard
          proxies={proxies}
          editing={editing}
          notify={notify}
          onClose={() => setWizardOpen(false)}
          onSaved={async () => {
            setWizardOpen(false);
            await refresh();
          }}
        />
      )}
    </>
  );
}
