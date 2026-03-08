<br/>

<p align="center">
  <svg width="100" height="100" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="5" fill="#0d1f14"/>
    <path d="M12 3L12 21" stroke="#22d472" stroke-width="2" stroke-linecap="round"/>
    <path d="M12 8Q8 6 6 9" stroke="#22d472" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <path d="M12 12Q17 10 19 13" stroke="#22d472" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <path d="M12 16Q8 14 7 17" stroke="#22d472" stroke-width="1.5" stroke-linecap="round" fill="none"/>
  </svg>
</p>

<h1 align="center">ROOT</h1>

<p align="center">
  Zero-Knowledge personal workspace.<br/>
  Notes, Kanban, Calendar — fully local, fully encrypted, zero server.
</p>

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=nextdotjs"/>
  <img alt="AES-GCM 256" src="https://img.shields.io/badge/AES--GCM-256--bit-22d472?style=flat-square"/>
  <img alt="PBKDF2" src="https://img.shields.io/badge/PBKDF2-600k_iter-22d472?style=flat-square"/>
  <img alt="Docker" src="https://img.shields.io/badge/Docker-ready-2496ed?style=flat-square&logo=docker"/>
</p>

---

## What it is

ROOT is a single-user, offline-first workspace that lives entirely in your browser's IndexedDB. There is no account, no API, no telemetry. Your Master Password never leaves your device — it derives a `CryptoKey` that is `extractable: false` and used exclusively in-RAM. Everything written to disk (IndexedDB) is an AES-GCM ciphertext.

---

## Features

<table>
<tr>
<td width="50%" valign="top">

<h3>
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d472" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
Notes
</h3>

Rich block editor powered by TipTap. Paragraphs, headings, lists, code blocks, quotes, callouts, dividers. Every block is encrypted individually — the storage engine never sees plaintext.

Pages live in a tree. Folders group them. Drag-and-drop reorders anything. Double-click a folder to get a terminal-style tree view with `├──` navigation.

</td>
<td width="50%" valign="top">

<h3>
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d472" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><rect x="3" y="3" width="5" height="12" rx="1.5"/><rect x="9.5" y="3" width="5" height="7" rx="1.5"/><rect x="16" y="3" width="5" height="16" rx="1.5"/></svg>
Kanban
</h3>

Persistent task board with status columns. Cards carry priority, due date, and tags. Tasks are stored as encrypted blocks, indistinguishable from any other content in the database.

</td>
</tr>
<tr>
<td width="50%" valign="top">

<h3>
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d472" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="8" cy="15" r="1" fill="#22d472" stroke="none"/><circle cx="12" cy="15" r="1" fill="#22d472" stroke="none"/><circle cx="16" cy="15" r="1" fill="#22d472" stroke="none"/></svg>
Calendar + CalDAV
</h3>

FullCalendar view with two-way sync to any CalDAV server (Infomaniak, Fastmail, iCloud, Nextcloud…). Credentials are encrypted at rest. Sync runs through a local nginx reverse proxy that handles CORS — no data transits a third-party.

Each calendar can be mapped to either the calendar view or the Kanban board.

</td>
<td width="50%" valign="top">

<h3>
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d472" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
Zero-Knowledge vault
</h3>

Unlock with a Master Password. PBKDF2 (SHA-256, 600 000 iterations) derives the key. A sentinel value proves the password is correct without storing it. The `CryptoKey` is `extractable: false` — the browser will never hand it back to JavaScript.

Lock at any time. The key is erased from memory. The app returns to the password screen.

</td>
</tr>
</table>

---

## Security model

| Layer | Mechanism |
|---|---|
| Key derivation | PBKDF2-SHA256, 600 000 iterations, 256-bit random salt |
| Encryption | AES-GCM 256-bit, unique 96-bit IV per ciphertext |
| Key storage | `CryptoKey { extractable: false }` — in RAM only, never persisted |
| Password verification | Encrypted sentinel constant, compared after decryption |
| Plaintext surface | Zero — titles, content, settings, credentials all encrypted before IndexedDB write |
| Network | Static export only. CalDAV sync via local nginx proxy (no external relay) |

---

## Data management

| Action | What it does |
|---|---|
| **Backup** | Exports raw IndexedDB rows as `.json`. Data stays encrypted  —the file is useless without your Master Password. |
| **Restore** | Imports a backup. Replaces current content. Requires the same Master Password. |
| **Export MD** | Decrypts and exports all pages as `.md` files. |
| **Import MD** | Creates a new encrypted page from a `.md` file. |
| **Nuke** | Deletes the entire IndexedDB database and localStorage. |

---

## Stack

| | |
|---|---|
| Framework | Next.js 15 (static export no server runtime) |
| Editor | TipTap 2 |
| Storage | Dexie.js (IndexedDB) |
| Crypto | Web Crypto API (native browser) |
| State | Zustand |
| Calendar | FullCalendar 6 |
| Drag & drop | dnd-kit |
| Serving | nginx (static files + CalDAV reverse proxy) |
| Container | Docker (multi-stage: node:20-alpine → nginx:1.27-alpine) |

---

## Run with Docker

```bash
docker run -p 8080:80 ghcr.io/Dansnts/root:latest
```

Then open `http://localhost:8080`. On first launch, create your vault with a Master Password. Nothing else is required.

### Build from source

```bash
git clone <this-repo>
cd ROOT/root
docker build -t root .
docker run -p 8080:80 root
```

---

## Architecture

```
browser
  └── Next.js SPA (static)
        ├── VaultGate      — password screen, key derivation
        ├── AppShell       — layout, routing between views
        │     ├── Sidebar  — page tree, drag-and-drop, navigation
        │     ├── Notes    — TipTap block editor
        │     ├── Kanban   — task board
        │     └── Calendar — FullCalendar + CalDAV sync
        └── IndexedDB (Dexie)
              ├── vault_meta  — salt + encrypted sentinel
              ├── pages       — encrypted titles, tree structure
              ├── blocks      — encrypted content, one row per block
              └── settings    — encrypted CalDAV config, preferences

nginx (container)
  ├── /            → static Next.js build
  └── /caldav-proxy/<host><path>  → reverse proxy to CalDAV server
```

All reads and writes go through `VaultService` (encrypt/decrypt) before touching IndexedDB. There is no code path that stores plaintext.

---

<p align="center">
  <sub>Zero-Knowledge · AES-GCM 256 · PBKDF2 600k · local-first</sub>
</p>
