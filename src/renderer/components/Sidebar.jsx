import React from 'react';

const NAV = [
  { key: 'profiles', label: 'Profiles', icon: '🗂️' },
  { key: 'proxies', label: 'Proxies', icon: '🌐' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function Sidebar({ view, setView }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="dot" />
        SpotCheck Lab
      </div>
      {NAV.map((item) => (
        <button
          key={item.key}
          className={`nav-item ${view === item.key ? 'active' : ''}`}
          onClick={() => setView(item.key)}
        >
          <span>{item.icon}</span>
          {item.label}
        </button>
      ))}
      <div className="sidebar-footer">
        QA browser testing
        <br />
        Isolated profiles · proxies · emulation
      </div>
    </aside>
  );
}
