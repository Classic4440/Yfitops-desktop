import React, { useRef, useState } from 'react';
import ProxyModal from './ProxyModal.jsx';

const api = window.api;

// Parse a CSV string with a header row into proxy objects.
// Expected headers (case-insensitive): type,host,port,username,password,label,rotating
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] || '').trim();
    });
    return row;
  });
}

function lastTestLabel(proxy) {
  if (!proxy.lastTest) return <span className="muted">not tested</span>;
  if (proxy.lastTest.ok) {
    return (
      <span style={{ color: 'var(--green)' }}>
        OK · {proxy.lastTest.ip}
        {proxy.lastTest.country ? ` · ${proxy.lastTest.country}` : ''}
      </span>
    );
  }
  return <span style={{ color: 'var(--red)' }}>failed</span>;
}

export default function ProxiesView({ proxies, refresh, notify }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [testing, setTesting] = useState({});
  const fileRef = useRef(null);

  const test = async (proxy) => {
    setTesting((t) => ({ ...t, [proxy.id]: true }));
    try {
      const res = await api.proxies.test(proxy.id);
      notify(
        res.ok ? `Proxy OK — exit IP ${res.ip}` : `Proxy failed: ${res.error}`,
        res.ok ? 'success' : 'error'
      );
      await refresh();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setTesting((t) => ({ ...t, [proxy.id]: false }));
    }
  };

  const remove = async (proxy) => {
    if (!confirm(`Delete proxy "${proxy.label}"?`)) return;
    try {
      await api.proxies.remove(proxy.id);
      notify('Proxy deleted', 'success');
      await refresh();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const onImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rows = file.name.toLowerCase().endsWith('.json')
        ? JSON.parse(text)
        : parseCsv(text);
      const { added, errors } = await api.proxies.import(rows);
      notify(
        `Imported ${added.length} proxies${errors.length ? `, ${errors.length} skipped` : ''}`,
        errors.length ? 'info' : 'success'
      );
      await refresh();
    } catch (err) {
      notify(`Import failed: ${err.message}`, 'error');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Proxies</h1>
          <p>Global proxy pool. HTTP/HTTPS support auth; SOCKS5 auth is limited (see README).</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" onClick={() => fileRef.current.click()}>
            Import CSV/JSON
          </button>
          <button
            className="btn primary"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            + Add Proxy
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.json"
            style={{ display: 'none' }}
            onChange={onImportFile}
          />
        </div>
      </div>

      {proxies.length === 0 ? (
        <div className="empty">No proxies yet. Add one manually or import a CSV/JSON file.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Label</th>
              <th>Type</th>
              <th>Host:Port</th>
              <th>Auth</th>
              <th>Rotating</th>
              <th>Last test</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {proxies.map((p) => (
              <tr key={p.id}>
                <td>{p.label}</td>
                <td className="mono">{p.type}</td>
                <td className="mono">
                  {p.host}:{p.port}
                </td>
                <td>{p.username ? 'yes' : 'no'}</td>
                <td>{p.rotating ? 'yes' : 'no'}</td>
                <td>{lastTestLabel(p)}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button
                    className="btn small"
                    disabled={testing[p.id]}
                    onClick={() => test(p)}
                  >
                    {testing[p.id] ? <span className="spinner" /> : 'Test'}
                  </button>{' '}
                  <button
                    className="btn small"
                    onClick={() => {
                      setEditing(p);
                      setModalOpen(true);
                    }}
                  >
                    Edit
                  </button>{' '}
                  <button className="btn small danger" onClick={() => remove(p)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modalOpen && (
        <ProxyModal
          editing={editing}
          notify={notify}
          onClose={() => setModalOpen(false)}
          onSaved={async () => {
            setModalOpen(false);
            await refresh();
          }}
        />
      )}
    </>
  );
}
