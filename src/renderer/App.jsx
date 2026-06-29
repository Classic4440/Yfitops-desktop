import React, { useCallback, useEffect, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import ProfilesView from './components/ProfilesView.jsx';
import ProxiesView from './components/ProxiesView.jsx';
import SettingsView from './components/SettingsView.jsx';
import Toasts from './components/Toasts.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// `window.api` is exposed by the dashboard preload (contextBridge).
const api = window.api;

export default function App() {
  const [view, setView] = useState('profiles');
  const [profiles, setProfiles] = useState([]);
  const [proxies, setProxies] = useState([]);
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const refreshProfiles = useCallback(async () => {
    setProfiles(await api.profiles.list());
  }, []);

  const refreshProxies = useCallback(async () => {
    setProxies(await api.proxies.list());
  }, []);

  useEffect(() => {
    refreshProfiles();
    refreshProxies();
    // Live status updates from the main process when windows open/close.
    const unsub = api.onProfileStatus(() => refreshProfiles());
    return unsub;
  }, [refreshProfiles, refreshProxies]);

  return (
    <ErrorBoundary>
      <div className="app">
        <Sidebar view={view} setView={setView} />
        <main className="main">
          {view === 'profiles' && (
            <ProfilesView
              profiles={profiles}
              proxies={proxies}
              refresh={refreshProfiles}
              notify={notify}
            />
          )}
          {view === 'proxies' && (
            <ProxiesView proxies={proxies} refresh={refreshProxies} notify={notify} />
          )}
          {view === 'settings' && <SettingsView notify={notify} />}
        </main>
        <Toasts toasts={toasts} />
      </div>
    </ErrorBoundary>
  );
}
