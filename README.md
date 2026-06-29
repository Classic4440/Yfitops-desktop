# SocketObit

A multi-profile browser testing desktop app (Electron) for **QA, regional content
checks, and client-environment testing**. Launch multiple **isolated** browser
windows — each with its own profile (cookies, cache, localStorage), an assigned
proxy, and **real device fingerprinting** (hardware specs, GPU, OS platform, and more).

> **Scope / ethics:** This tool is intended for testing your own
> web applications under different client environments — not for evading the
> anti-fraud or anti-bot systems of third-party sites. You are responsible for
> using it in compliance with the terms of service of any site you visit.

---

## Features

- **Profile management** — name, assigned proxy, real device profile, optional
  overrides (resolution, language, timezone, user agent, start URL).
- **Isolation** — each profile uses its own persistent Chromium partition; data
  is never shared, and a profile can only run one window at a time.
- **Proxy pool** — add HTTP/HTTPS/SOCKS5 proxies (with username/password), import
  from CSV/JSON, test connectivity. SOCKS5 proxies with authentication are supported via local forwarding.
- **Real device fingerprinting** — includes deterministic GPU vendor/renderer, 
  hardware concurrency, device memory, canvas noise injection, and OS-matched user agents.
- **Encrypted storage** — profiles, proxies, and settings stored via
  `electron-store` with encryption.
- **Packaging** — `electron-builder` produces a Windows installer (`.exe`).

---

## Tech stack

Electron · React · Vite · electron-store · electron-log · axios ·
https-proxy-agent · socks-proxy-agent · socks · get-port · electron-builder.

---

## Project layout

```
socketobit/
├── src/
│   ├── main/                  # Electron main process (Node)
│   │   ├── main.js            # Entry point + IPC handlers
│   │   ├── store.js           # Encrypted electron-store instances
│   │   ├── profileManager.js  # Profile CRUD
│   │   ├── proxyManager.js    # Proxy CRUD + connectivity testing
│   │   ├── fingerprintGenerator.js # Device database and fingerprinting
│   │   ├── socksForwarder.js  # SOCKS5 auth bridge
│   │   ├── launcher.js        # Isolated BrowserWindow + emulation + proxy
│   │   └── logger.js          # Per-profile electron-log transports
...
```

---

## Getting started

### Prerequisites

- Node.js 18+ (developed on Node 22)
- Windows for producing the `.exe`

### Install

```bash
npm install
```

### Run in development

```bash
npm run dev
```

### Build the Windows installer

```bash
npm run build
```

The installer is written to `build/` (e.g. `build/SocketObit Setup <version>.exe`).

---

## Security notes

- The renderer runs with `contextIsolation: true` and `nodeIntegration: false`.
- `electron-store` encryption obfuscates the on-disk JSON but the key ships with
  the app. For real deployments, set a custom key via the `SOCKETOBIT_STORE_KEY`
  environment variable before first run.
- Proxy passwords are stored in the encrypted store and never logged.

---

## License

MIT
