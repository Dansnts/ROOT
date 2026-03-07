"use client";

import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { testCalDAVConnection, discoverCalendars, type DiscoveredCalendar } from "@/lib/CalDAVService";
import { exportAllPagesAsMarkdown, importMarkdownFile } from "@/lib/ExportService";
import { usePagesStore } from "@/stores/pagesStore";
import { useCalendarStore } from "@/stores/calendarStore";
import { db } from "@/lib/database";
import type { CalDAVConfig, CalendarEntry } from "@/lib/database";

type Tab = "profil" | "caldav" | "export" | "données";

interface Props { onClose: () => void }

export default function SettingsModal({ onClose }: Props) {
  const [tab, setTab]     = useState<Tab>("profil");
  const { caldav, userName, loadSettings, saveCalDAV, clearCalDAV, saveUserName } = useSettingsStore();
  const { pages, activePageId, loadPages } = usePagesStore();
  const { sync } = useCalendarStore();
  const fileRef    = useRef<HTMLInputElement>(null);
  const importRef  = useRef<HTMLInputElement>(null);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const availablePages = pages.filter((p) => !p.isDeleted);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[54rem] bg-[var(--surface-2)] border border-[var(--border-light)] rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--border)] shrink-0">
          <h2 className="text-sm font-semibold text-[var(--text)]">Paramètres</h2>
          <button onClick={onClose} className="ml-auto text-[var(--text-faint)] hover:text-[var(--text-muted)]">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 shrink-0">
          {(["profil", "caldav", "export", "données"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${
                tab === t
                  ? "bg-[var(--surface-3)] text-[var(--text)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {t === "profil" ? "Profil" : t === "caldav" ? "CalDAV" : t === "export" ? "Export MD" : "Données"}
            </button>
          ))}
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          {tab === "profil" && (
            <ProfilTab userName={userName} onSave={saveUserName} />
          )}
          {tab === "caldav" && (
            <CalDAVTab
              config={caldav}
              pages={availablePages}
              activePageId={activePageId}
              onSave={saveCalDAV}
              onClear={clearCalDAV}
              onSync={sync}
            />
          )}
          {tab === "export" && (
            <ExportTab
              onImport={async (f) => { await importMarkdownFile(f); await loadPages(); onClose(); }}
              fileRef={fileRef}
            />
          )}
          {tab === "données" && (
            <DataTab onClose={onClose} importRef={importRef} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Onglet Profil ─────────────────────────────────────────────────────────────

function ProfilTab({ userName, onSave }: { userName: string | null; onSave: (n: string) => Promise<void> }) {
  const [value, setValue] = useState(userName ?? "");
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await onSave(value);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
        Votre prénom est chiffré et stocké localement. Il est utilisé pour le message de bienvenue à l&apos;ouverture.
      </p>
      <form onSubmit={handleSave} className="flex flex-col gap-3">
        <Field label="Votre prénom">
          <input
            type="text"
            value={value}
            onChange={(e) => { setValue(e.target.value); setSaved(false); }}
            placeholder="Ex : Alice"
            autoComplete="given-name"
            className={inputCls}
          />
        </Field>
        <button type="submit" className={btnCls}>
          {saved ? "✓ Sauvegardé" : "Sauvegarder"}
        </button>
      </form>
    </div>
  );
}

// ── Onglet CalDAV ─────────────────────────────────────────────────────────────

function CalDAVTab({
  config, pages, activePageId, onSave, onClear, onSync,
}: {
  config: CalDAVConfig | null;
  pages: { id: string; title: string }[];
  activePageId: string | null;
  onSave: (c: CalDAVConfig) => Promise<void>;
  onClear: () => Promise<void>;
  onSync: () => Promise<void>;
}) {
  const [url,      setUrl]      = useState(config?.serverUrl ?? "");
  const [username, setUsername] = useState(config?.username  ?? "");
  const [password, setPassword] = useState("");
  const [status,   setStatus]   = useState<string | null>(null);
  const [busy,     setBusy]     = useState(false);

  // Discovered + configured calendars
  const [discovered,  setDiscovered]  = useState<DiscoveredCalendar[]>([]);
  const [calEntries,  setCalEntries]  = useState<CalendarEntry[]>(config?.calendars ?? []);
  const [discovered2, setDiscovered2] = useState(calEntries.length > 0);

  async function handleTest() {
    if (!url || !username || !password) { setStatus("Remplissez tous les champs."); return; }
    setBusy(true); setStatus(null);
    const result = await testCalDAVConnection({ serverUrl: url, username, password });
    setStatus(result.message);
    setBusy(false);
  }

  async function handleDiscover() {
    if (!url || !username || !password) { setStatus("Remplissez URL, utilisateur et mot de passe."); return; }
    setBusy(true); setStatus("Découverte des calendriers…");
    const result = await discoverCalendars({ serverUrl: url, username, password });
    if (result.error) {
      setStatus(result.error);
    } else if (result.calendars.length === 0) {
      setStatus("Aucun calendrier trouvé. Vérifiez l'URL.");
    } else {
      setStatus(null);
      setDiscovered(result.calendars);
      // Merge with existing entries (preserve mode/targetPageId if already configured)
      const existing = new Map(calEntries.map((e) => [e.url, e]));
      setCalEntries(result.calendars.map((cal) => existing.get(cal.url) ?? {
        url: cal.url,
        displayName: cal.displayName,
        color: cal.color,
        mode: "calendar" as const,
        targetPageId: undefined,
      }));
      setDiscovered2(true);
    }
    setBusy(false);
  }

  async function handleSave() {
    if (!url || !username || !password) { setStatus("Remplissez tous les champs."); return; }
    setBusy(true);
    await onSave({ serverUrl: url, username, password, calendars: calEntries });
    setStatus("Configuration sauvegardée.");
    setBusy(false);
  }

  async function handleSync() {
    setBusy(true); setStatus("Synchronisation…");
    await onSync();
    const { syncStatus, lastSyncError } = useCalendarStore.getState();
    if (syncStatus === "error") {
      setStatus(lastSyncError ?? "Erreur lors de la synchronisation.");
    } else {
      setStatus("Synchronisation terminée.");
    }
    setBusy(false);
  }

  function updateEntry(index: number, patch: Partial<CalendarEntry>) {
    setCalEntries((prev) => prev.map((e, i) => i === index ? { ...e, ...patch } : e));
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
        Les credentials sont chiffrés (AES-GCM) avant d&apos;être stockés.
        Déchiffrés en RAM uniquement lors des requêtes réseau.
      </p>

      {/* Credentials */}
      <Field label="URL du serveur CalDAV">
        <input value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="https://caldav.infomaniak.com/calendars/user@example.com/"
          className={inputCls} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Utilisateur">
          <input value={username} onChange={(e) => setUsername(e.target.value)}
            autoComplete="username" className={inputCls} />
        </Field>
        <Field label="Mot de passe">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password" className={inputCls} />
        </Field>
      </div>

      {/* Discover button */}
      <div className="flex gap-2">
        <button onClick={handleTest}     disabled={busy} className={btnCls}>Tester</button>
        <button onClick={handleDiscover} disabled={busy} className={`${btnCls} border-[var(--accent-hover)]`}>
          ↻ Découvrir les calendriers
        </button>
      </div>

      {/* Per-calendar configuration */}
      {discovered2 && calEntries.length > 0 && (
        <div className="flex flex-col gap-2 mt-1">
          <p className="text-xs text-[var(--text-faint)] uppercase tracking-wider">Calendriers</p>
          {calEntries.map((entry, i) => (
            <CalendarEntryRow
              key={entry.url}
              entry={entry}
              pages={pages}
              onChange={(patch) => updateEntry(i, patch)}
            />
          ))}
        </div>
      )}

      {status && (
        <pre className={`text-xs px-3 py-2 rounded-lg whitespace-pre-wrap font-sans leading-relaxed ${
          status.includes("réseau") || status.includes("refusée") || status.includes("interdit") || status.includes("Aucun")
            ? "bg-red-900/20 text-red-400"
            : "bg-[var(--surface-3)] text-[var(--text-muted)]"
        }`}>
          {status}
        </pre>
      )}

      <div className="flex gap-2 flex-wrap pt-1">
        <button onClick={handleSave} disabled={busy} className={btnCls}>Sauvegarder</button>
        {config && <button onClick={handleSync} disabled={busy} className={btnCls}>Synchroniser maintenant</button>}
        {config && (
          <button onClick={onClear} disabled={busy} className={`${btnCls} text-[var(--danger)]`}>Supprimer</button>
        )}
      </div>
    </div>
  );
}

// ── Ligne de configuration d'un calendrier ────────────────────────────────────

function CalendarEntryRow({
  entry, pages, onChange,
}: {
  entry: CalendarEntry;
  pages: { id: string; title: string }[];
  onChange: (patch: Partial<CalendarEntry>) => void;
}) {
  return (
    <div className="flex flex-col gap-2 p-3 bg-[var(--surface-3)] border border-[var(--border)] rounded-xl">
      <div className="flex items-center gap-2">
        {entry.color && (
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
        )}
        <span className="text-sm text-[var(--text)] truncate flex-1">{entry.displayName}</span>

        {/* Mode selector */}
        <select
          value={entry.mode}
          onChange={(e) => onChange({ mode: e.target.value as "calendar" | "kanban" })}
          className="text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1 text-[var(--text-muted)] outline-none shrink-0"
        >
          <option value="calendar">Calendrier</option>
          <option value="kanban">Kanban</option>
        </select>
      </div>

      {/* Target page selector */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-[var(--text-faint)] shrink-0">Page cible :</label>
        <select
          value={entry.targetPageId ?? ""}
          onChange={(e) => onChange({ targetPageId: e.target.value || undefined })}
          className="flex-1 text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1 text-[var(--text-muted)] outline-none"
        >
          <option value="">— Choisir une page —</option>
          {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </div>

      <p className="text-[10px] text-[var(--text-faint)] truncate">{entry.url}</p>
    </div>
  );
}

// ── Onglet Export ─────────────────────────────────────────────────────────────

function ExportTab({ onImport, fileRef }: {
  onImport: (f: File) => Promise<void>;
  fileRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [importing, setImporting] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    await onImport(file);
    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Export */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-[var(--text)]">Export Markdown</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Toutes vos pages sont exportées en fichier(s) .md déchiffrés.
        </p>
        <button onClick={exportAllPagesAsMarkdown} className={btnCls}>
          ↓ Télécharger toutes les pages (.md)
        </button>
      </div>

      <div className="border-t border-[var(--border)]" />

      {/* Import */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-[var(--text)]">Import Markdown</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Importez un fichier .md — une nouvelle page chiffrée est créée.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".md,text/markdown"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className={btnCls}
        >
          {importing ? "Import en cours…" : "↑ Importer un fichier .md"}
        </button>
      </div>
    </div>
  );
}

// ── Onglet Données ────────────────────────────────────────────────────────────

function DataTab({ onClose, importRef }: {
  onClose: () => void;
  importRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [nukeText, setNukeText] = useState("");
  const [busy, setBusy]         = useState(false);
  const [status, setStatus]     = useState<string | null>(null);

  async function handleExport() {
    setBusy(true);
    try {
      const [pages, blocks, settings] = await Promise.all([
        db.pages.toArray(),
        db.blocks.toArray(),
        db.settings.toArray(),
      ]);
      const backup = { version: 1, exportedAt: Date.now(), pages, blocks, settings };
      const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `root-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("Backup téléchargé.");
    } catch {
      setStatus("Erreur lors de l'export.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(file: File) {
    setBusy(true);
    setStatus("Import en cours…");
    try {
      const text   = await file.text();
      const backup = JSON.parse(text);
      if (backup.version !== 1 || !Array.isArray(backup.pages) || !Array.isArray(backup.blocks)) {
        setStatus("Fichier invalide — ce n'est pas un backup ROOT.");
        return;
      }
      await db.transaction("rw", db.pages, db.blocks, db.settings, async () => {
        await db.pages.clear();
        await db.blocks.clear();
        await db.settings.clear();
        if (backup.pages.length)    await db.pages.bulkAdd(backup.pages);
        if (backup.blocks.length)   await db.blocks.bulkAdd(backup.blocks);
        if (backup.settings?.length) await db.settings.bulkAdd(backup.settings);
      });
      setStatus("Import terminé — rechargement…");
      setTimeout(() => window.location.reload(), 800);
    } catch {
      setStatus("Erreur lors de l'import — fichier corrompu ?");
    } finally {
      setBusy(false);
      if (importRef.current) importRef.current.value = "";
    }
  }

  async function handleNuke() {
    if (nukeText !== "NUKE") return;
    setBusy(true);
    try {
      await db.delete();
      localStorage.clear();
      window.location.reload();
    } catch {
      setBusy(false);
      setStatus("Erreur lors de la suppression.");
    }
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Backup export */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-[var(--text)]">Sauvegarder</h3>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          Exporte toutes vos données (pages, blocs, paramètres) dans un fichier JSON.
          Les données restent chiffrées — vous avez besoin de votre Master Password pour les relire.
        </p>
        <button onClick={handleExport} disabled={busy} className={btnCls}>
          ↓ Télécharger le backup (.json)
        </button>
      </div>

      <div className="border-t border-[var(--border)]" />

      {/* Backup import */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-[var(--text)]">Restaurer</h3>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          Importe un backup ROOT (.json). Les données actuelles seront remplacées.
          Le vault doit avoir le même Master Password que lors de l&apos;export.
        </p>
        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); }}
        />
        <button
          onClick={() => importRef.current?.click()}
          disabled={busy}
          className={btnCls}
        >
          ↑ Importer un backup (.json)
        </button>
      </div>

      <div className="border-t border-[var(--border)]" />

      {/* Nuke */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-red-400">Zone de danger</h3>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          Efface intégralement toutes vos données (vault, pages, blocs, paramètres).
          Cette action est <strong className="text-[var(--text)]">irréversible</strong>.
          Tapez <code className="font-mono text-red-400 bg-red-900/20 px-1 rounded">NUKE</code> pour confirmer.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={nukeText}
            onChange={(e) => setNukeText(e.target.value)}
            placeholder="NUKE"
            className={`${inputCls} font-mono text-red-400 flex-1`}
          />
          <button
            onClick={handleNuke}
            disabled={busy || nukeText !== "NUKE"}
            className="px-4 py-2 rounded-lg text-sm bg-red-900/30 border border-red-700/40 text-red-400 hover:bg-red-900/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-medium"
          >
            Tout effacer
          </button>
        </div>
      </div>

      {status && (
        <p className={`text-xs px-3 py-2 rounded-lg ${
          status.includes("Erreur") || status.includes("invalide") || status.includes("corrompu")
            ? "bg-red-900/20 text-red-400"
            : "bg-[var(--surface-3)] text-[var(--text-muted)]"
        }`}>
          {status}
        </p>
      )}
    </div>
  );
}

// ── Helpers UI ────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-[var(--text-faint)] uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full bg-[var(--surface-3)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm outline-none focus:border-[var(--accent-hover)] transition-colors";

const btnCls =
  "px-4 py-2 rounded-lg text-sm bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border-light)] transition-colors disabled:opacity-40";
