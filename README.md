<br/>

<p align="center">
  <img src="public/logo.svg" width="100" alt="ROOT logo"/>
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
  <img alt="License" src="https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey?style=flat-square"/>
</p>

---

## What it is

ROOT is a single-user, offline-first workspace that lives entirely in your browser's IndexedDB. There is no account, no API, no telemetry. Your Master Password never leaves your device — it derives a `CryptoKey` that is `extractable: false` and used exclusively in-RAM. Everything written to disk (IndexedDB) is an AES-GCM ciphertext.

---

## Features

<table>
<tr>


<h3>
<img src="public/icon-notes.svg" width="16" height="16" style="vertical-align:middle;margin-right:6px" alt=""/>
Notes
</h3>

Rich block editor powered by TipTap. Paragraphs, headings, lists, code blocks, quotes, callouts, dividers. Every block is encrypted individually — the storage engine never sees plaintext.

Pages live in a tree. Folders group them. Drag-and-drop reorders anything. Double-click a folder to get a terminal-style tree view with `├──` navigation.

<img src="docs/images/page.png" alt=""/>


</tr>
<tr>

<h3>
<img src="public/icon-kanban.svg" width="16" height="16" style="vertical-align:middle;margin-right:6px" alt=""/>
Kanban
</h3>

Persistent task board with status columns. Cards carry priority, due date, and tags. Tasks are stored as encrypted blocks, indistinguishable from any other content in the database.

<img src="docs/images/kanban.png" alt=""/>

</tr>
<tr>


<h3>
<img src="public/icon-calendar.svg" width="16" height="16" style="vertical-align:middle;margin-right:6px" alt=""/>
Calendar + CalDAV
</h3>

FullCalendar view with two-way sync to any CalDAV server (Infomaniak, Fastmail, iCloud, Nextcloud…). Credentials are encrypted at rest. Sync runs through a local nginx reverse proxy that handles CORS — no data transits a third-party.

<img src="docs/images/CreateEvent.png" alt=""/>


Each calendar can be mapped to either the calendar view or the Kanban board.
</tr>
<tr>

<h3>
<img src="public/icon-lock.svg" width="16" height="16" style="vertical-align:middle;margin-right:6px" alt=""/>
Zero-Knowledge vault
</h3>

Unlock with a Master Password. PBKDF2 (SHA-256, 600 000 iterations) derives the key. A sentinel value proves the password is correct without storing it. The `CryptoKey` is `extractable: false` — the browser will never hand it back to JavaScript.

Lock at any time. The key is erased from memory. The app returns to the password screen.


<img src="docs/images/themeCompariason.png" alt=""/>


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
| **Backup** | Exports raw IndexedDB rows as `.json`. Data stays encrypted — the file is useless without your Master Password. |
| **Restore** | Imports a backup. Replaces current content. Requires the same Master Password. |
| **Export MD** | Decrypts and exports all pages as `.md` files. |
| **Import MD** | Creates a new encrypted page from a `.md` file. |
| **Nuke** | Deletes the entire IndexedDB database and localStorage. Type `NUKE` to confirm. |

---

## Stack

| | |
|---|---|
| Framework | Next.js 15 (static export — no server runtime) |
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

## Changelog

| Version | Date | Changes |
|---|---|---|
| **v1.0.0** | 2026-03-08 | Major refactor: `constants.ts`, `BackupService`, `useAppInit`, `KanbanService.updateTask()`. CalDAV bug fix. TablePicker 6×6 restored. Image paste/drop. Cursor jumping fixed. `/bold` and `/italic` slash commands. SVG icons in Help modal. Transparent logos & sprites. |
| **v0.9.0** | 2026-03-07 | Trash with restore. Tag system. Standalone calendar + two-way CalDAV sync. MD export (ZIP/single/multiple/folder). Portable JSON backup. Bubble toolbar. Table picker (6×6 grid). Images (URL / paste / drag-drop). |
| **v0.8.0** | 2026-03-07 | TipTap block editor (H1–H3, lists, code, quote, divider). Kanban with 4 columns. Card drag & drop. Task detail (priority, tags, due date). Tasks shown in Calendar. |
| **v0.7.0** | 2026-03-07 | Zero-Knowledge vault (AES-256-GCM + PBKDF2 600k). Hierarchical page tree in sidebar. Page drag & drop. Light/dark theme with persistence. |

---

## License

[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — free to use, share, and adapt with attribution, non-commercially, under the same license.

<p align="center">
  <sub>Zero-Knowledge · AES-GCM 256 · PBKDF2 600k · local-first</sub>
</p>
