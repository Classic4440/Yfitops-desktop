# SpotCheck Lab

A multi-profile browser testing desktop app (Electron) for **QA, regional content
checks, and client-environment testing**. Launch multiple **isolated** browser
windows — each with its own profile (cookies, cache, localStorage), an assigned
proxy, and **official Chromium device emulation** (screen size, user agent,
language, timezone, reported CPU/memory).

> **Scope / ethics:** This tool uses only Chromium's *official* emulation APIs.
> It does **not** override `navigator.webdriver` and performs **no** canvas /
> WebGL / audio fingerprint noise injection. It is intended for testing your own
> web applications under different client environments — not for evading the
> anti-fraud or anti-bot systems of third-party sites. You are responsible for
> using it in compliance with the terms of service of any site you visit.

---

## Features

- **Profile management** — name, assigned proxy, deterministic seed, optional
  overrides (resolution, language, timezone, user agent, start URL). Cards show
  status (Stopped / Running / Error), partial proxy IP, and last-used time, with
  Launch / Stop / Edit / Delete / Duplicate / Clear / Test actions.
- **Isolation** — each profile uses its own persistent Chromium partition; data
  is never shared, and a profile can only run one window at a time.
- **Proxy pool** — add HTTP/HTTPS/SOCKS5 proxies (with username/password), import
  from CSV/JSON, test connectivity via a geo-IP endpoint. Launch is **blocked**
  if the assigned proxy fails its test.
- **Device emulation (official APIs only)** — user agent + `Accept-Language`
  (`session.setUserAgent`), screen/viewport metrics
  (`webContents.enableDeviceEmulation`), timezone + locale (CDP
  `Emulation.setTimezoneOverride` / `setLocaleOverride`), and
  `navigator.hardwareConcurrency` / `deviceMemory` (preload). Values are
  **deterministic per seed**.
- **Encrypted storage** — profiles, proxies, and settings stored via
  `electron-store` with encryption.
- **Per-profile logging** — console messages and network requests written to
  `<userData>/logs/profile-<id>.log` via `electron-log`.
- **Quick-create wizard** — Name → Proxy → Seed/Identity → Review & Launch.
- **Packaging** — `electron-builder` produces a Windows installer (`.exe`).

---

## Tech stack

Electron · React · Vite · electron-store · electron-log · axios ·
https-proxy-agent · socks-proxy-agent · electron-builder.

---

## Project layout

```
spotcheck-lab/
├── src/
│   ├── main/                  # Electron main process (Node)
│   │   ├── main.js            # Entry point + IPC handlers
│   │   ├── store.js           # Encrypted electron-store instances
│   │   ├── profileManager.js  # Profile CRUD
│   │   ├── proxyManager.js    # Proxy CRUD + connectivity testing
│   │   ├── emulation.js       # Deterministic seed → emulation values
│   │   ├── launcher.js        # Isolated BrowserWindow + emulation + proxy
│   │   └── logger.js          # Per-profile electron-log transports
│   ├── preload/
│   │   ├── dashboard-preload.js   # contextBridge API for the dashboard
│   │   └── profile-preload.js     # hardwareConcurrency/deviceMemory overrides
│   ├── renderer/              # React dashboard (built by Vite)
│   │   ├── index.html
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── styles.css
│   │   └── components/
│   └── assets/               # icon.ico, etc.
├── electron-builder.yml
├── vite.config.js
└── package.json
```

---

## Getting started

### Prerequisites

- Node.js 18+ (developed on Node 22)
- Windows for producing the `.exe` (building Windows targets on macOS/Linux is
  possible but not the default path here)

### Install

```bash
npm install
```

### Run in development

Runs the Vite dev server and Electron together with hot-reloaded UI:

```bash
npm run dev
```

### Run the production renderer locally (no dev server)

```bash
npm start
```

### Build the Windows installer

```bash
npm run build
```

The installer is written to `build/` (e.g. `build/SpotCheck Lab Setup <version>.exe`).
To produce an unpacked directory build (faster, for smoke testing):

```bash
npm run build:dir
```

---

## Using the app

### Adding proxies

1. Go to the **Proxies** tab → **Add Proxy**.
2. Choose type (HTTP/HTTPS/SOCKS5), enter host, port, and optional
   username/password. Optionally mark it **rotating** (a label only).
3. Click **Test** to verify connectivity and record the exit IP/location.

**Bulk import** — click **Import CSV/JSON**:

- **CSV** with a header row:
  ```csv
  label,type,host,port,username,password,rotating
  US res #1,http,proxy.example.com,8080,user,pass,false
  ```
- **JSON** — an array of objects with the same keys:
  ```json
  [{ "label": "US res #1", "type": "http", "host": "proxy.example.com", "port": 8080, "username": "user", "password": "pass" }]
  ```

### Creating profiles

1. **Profiles** tab → **New Profile**.
2. Wizard: **Name** → **Proxy** (pick from pool or none) → **Identity** (auto seed,
   regenerate for a new identity) → **Review** (optional overrides + live emulation
   preview).
3. **Create**, or **Create & Launch**.

On launch the app tests the assigned proxy, opens an isolated window, applies the
emulation, and navigates to the start URL (default configurable in **Settings**).

### Verifying it works

Create two profiles with **different proxies and seeds**, launch both, and visit
a site like `https://www.whatismybrowser.com/`. You should see **different exit
IPs, screen sizes, user agents, and languages** per profile, and the **same**
values each time you relaunch a given profile.

---

## Extending the emulation logic

All deterministic values come from `src/main/emulation.js`:

- Edit the candidate pools (`RESOLUTIONS`, `LANGUAGES`, `TIMEZONES`,
  `HARDWARE_CONCURRENCY`, `DEVICE_MEMORY`, `USER_AGENTS`).
- `computeEmulation(profile)` derives values from the seed (preserving order so
  existing profiles stay stable) and applies explicit per-profile overrides.
- To emulate additional *legitimate* signals, add the value in
  `computeEmulation`, then apply it in `src/main/launcher.js` (`applyEmulation`)
  via an official Electron/CDP API, or in `src/preload/profile-preload.js` for
  navigator properties without a first-class API.

---

## Proxy notes & limitations

- **HTTP/HTTPS auth** is supported via the window's `login` event.
- **SOCKS5 auth is not supported by Chromium's built-in proxy.** If you configure
  a SOCKS5 proxy with username/password, the credentials are **ignored** at
  launch (a warning is logged and shown in the UI). Workarounds:
  - Use an HTTP/HTTPS proxy instead, or
  - Run a **local SOCKS forwarder** that handles upstream auth and expose it to
    the app as an unauthenticated `socks5://127.0.0.1:<port>` (e.g. via a small
    `socks-proxy-agent`-based forwarder or a tool like `gost`/`microsocks`).

---

## Security notes

- The renderer runs with `contextIsolation: true` and `nodeIntegration: false`;
  it talks to the main process only through the small `window.api` surface in
  `dashboard-preload.js`.
- `electron-store` encryption obfuscates the on-disk JSON but the key ships with
  the app. For real deployments, set a custom key via the `SPOTCHECK_STORE_KEY`
  environment variable before first run.
- Proxy passwords are stored in the encrypted store and never logged.

---

## License

MIT
