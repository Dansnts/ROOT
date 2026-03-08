"use client";

import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useCategoriesStore } from "@/stores/categoriesStore";
import { testCalDAVConnection, discoverCalendars, type DiscoveredCalendar } from "@/lib/CalDAVService";
import {
  exportAllPagesZip,
  exportAllPagesSingleFile,
  exportAllPagesMultiple,
  exportAllPagesFolder,
  importMarkdownFile,
} from "@/lib/ExportService";
import { usePagesStore } from "@/stores/pagesStore";
import { useCalendarStore } from "@/stores/calendarStore";
import Dexie from "dexie";
import { db, type PageRecord, type BlockRecord } from "@/lib/database";
import { encryptValue, decryptValue } from "@/stores/vaultStore";
import type { CalDAVConfig, CalendarEntry } from "@/lib/database";

type Tab = "profil" | "caldav" | "export" | "données";

interface Props { onClose: () => void }

export default function SettingsModal({ onClose }: Props) {
  const [tab, setTab]     = useState<Tab>("profil");
  const { caldav, userName, loadSettings, saveCalDAV, clearCalDAV, saveUserName } = useSettingsStore();
  const { loadPages } = usePagesStore();
  const { sync } = useCalendarStore();
  const { categories, createCategory } = useCategoriesStore();
  const fileRef    = useRef<HTMLInputElement>(null);
  const importRef  = useRef<HTMLInputElement>(null);

  useEffect(() => { loadSettings(); }, [loadSettings]);

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
              categories={categories}
              onCreateCategory={createCategory}
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
  config, categories, onCreateCategory, onSave, onClear, onSync,
}: {
  config: CalDAVConfig | null;
  categories: import("@/lib/database").CalendarCategory[];
  onCreateCategory: (name: string, color: string) => Promise<import("@/lib/database").CalendarCategory>;
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
        categoryId: undefined,
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
              categories={categories}
              onCreateCategory={onCreateCategory}
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
  entry, categories, onCreateCategory, onChange,
}: {
  entry: CalendarEntry;
  categories: import("@/lib/database").CalendarCategory[];
  onCreateCategory: (name: string, color: string) => Promise<import("@/lib/database").CalendarCategory>;
  onChange: (patch: Partial<CalendarEntry>) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  async function handleCreateAndAssign() {
    if (!newCatName.trim()) return;
    const cat = await onCreateCategory(newCatName.trim(), entry.color ?? "#5b6a7a");
    onChange({ categoryId: cat.id });
    setCreating(false);
    setNewCatName("");
  }

  return (
    <div className="flex flex-col gap-2 p-3 bg-[var(--surface-3)] border border-[var(--border)] rounded-xl">
      <div className="flex items-center gap-2">
        {entry.color && (
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
        )}
        <span className="text-sm text-[var(--text)] truncate flex-1">{entry.displayName}</span>
        <select
          value={entry.mode}
          onChange={(e) => onChange({ mode: e.target.value as "calendar" | "kanban" })}
          className="text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1 text-[var(--text-muted)] outline-none shrink-0"
        >
          <option value="calendar">Calendrier</option>
          <option value="kanban">Kanban</option>
        </select>
      </div>

      {/* Catégorie cible */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-[var(--text-faint)] shrink-0">Catégorie :</label>
        <select
          value={entry.categoryId ?? ""}
          onChange={(e) => {
            if (e.target.value === "__new__") { setCreating(true); }
            else { onChange({ categoryId: e.target.value || undefined }); }
          }}
          className="flex-1 text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1 text-[var(--text-muted)] outline-none"
        >
          <option value="">— Choisir une catégorie —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
          <option value="__new__">+ Nouvelle catégorie…</option>
        </select>
      </div>

      {creating && (
        <div className="flex gap-2">
          <input
            autoFocus
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateAndAssign(); if (e.key === "Escape") setCreating(false); }}
            placeholder="Nom de la nouvelle catégorie"
            className="flex-1 text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1 text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />
          <button onClick={handleCreateAndAssign} className="text-xs px-2 py-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border-light)] text-[var(--accent)] hover:border-[var(--accent)]">OK</button>
          <button onClick={() => setCreating(false)} className="text-xs text-[var(--text-faint)]">✕</button>
        </div>
      )}

      <p className="text-[10px] text-[var(--text-faint)] truncate">{entry.url}</p>
    </div>
  );
}

// ── Onglet Export ─────────────────────────────────────────────────────────────

type ExportFormat = "zip" | "single" | "multiple" | "folder";

const EXPORT_FORMATS: { id: ExportFormat; label: string; desc: string }[] = [
  { id: "zip",      label: "ZIP",             desc: "Un .zip avec un fichier .md par page" },
  { id: "single",   label: "Fichier unique",  desc: "Toutes les pages dans un seul .md" },
  { id: "multiple", label: "Fichiers séparés", desc: "Un téléchargement par page" },
  { id: "folder",   label: "Dossier",         desc: "Enregistrer dans un dossier (Chrome/Edge)" },
];

function ExportTab({ onImport, fileRef }: {
  onImport: (f: File) => Promise<void>;
  fileRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [format, setFormat]       = useState<ExportFormat>("zip");
  const [exportErr, setExportErr] = useState<string | null>(null);

  async function handleExport() {
    setExportErr(null);
    setExporting(true);
    try {
      if (format === "zip")      await exportAllPagesZip();
      if (format === "single")   await exportAllPagesSingleFile();
      if (format === "multiple") await exportAllPagesMultiple();
      if (format === "folder")   await exportAllPagesFolder();
    } catch (err) {
      setExportErr(String(err instanceof Error ? err.message : err));
    } finally {
      setExporting(false);
    }
  }

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
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-[var(--text)]">Export Markdown</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Toutes vos pages sont exportées en fichiers .md déchiffrés.
        </p>
        <div className="flex flex-col gap-1.5">
          {EXPORT_FORMATS.map((f) => (
            <label
              key={f.id}
              className="flex items-start gap-3 cursor-pointer p-2 rounded-lg hover:bg-[var(--surface-3)] transition-colors"
            >
              <input
                type="radio"
                name="export-format"
                value={f.id}
                checked={format === f.id}
                onChange={() => setFormat(f.id)}
                className="mt-0.5 shrink-0 accent-[var(--accent)]"
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-[var(--text)]">{f.label}</span>
                <span className="text-xs text-[var(--text-faint)]">{f.desc}</span>
              </div>
            </label>
          ))}
        </div>
        {exportErr && (
          <p className="text-xs text-[var(--danger)]">{exportErr}</p>
        )}
        <button onClick={handleExport} disabled={exporting} className={btnCls}>
          {exporting ? "Export en cours…" : "↓ Exporter"}
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
      const [pageRecs, blockRecs, settingRecs] = await Promise.all([
        db.pages.toArray(),
        db.blocks.toArray(),
        db.settings.toArray(),
      ]);

      // Déchiffrer tout — le backup est portable entre vaults (mots de passe différents)
      const pages = await Promise.all(pageRecs.map(async (p: PageRecord) => ({
        id: p.id, parentId: p.parentId, order: p.order,
        createdAt: p.createdAt, updatedAt: p.updatedAt,
        isDeleted: p.isDeleted, isFolder: p.isFolder,
        title: await decryptValue<string>(p.encryptedTitle),
        icon:  p.encryptedIcon ? await decryptValue<string>(p.encryptedIcon) : undefined,
      })));

      const blocks = await Promise.all(blockRecs.map(async (b: BlockRecord) => ({
        id: b.id, pageId: b.pageId, parentBlockId: b.parentBlockId,
        type: b.type, order: b.order,
        createdAt: b.createdAt, updatedAt: b.updatedAt, isDeleted: b.isDeleted,
        content:    await decryptValue<Record<string, unknown>>(b.encryptedContent),
        properties: await decryptValue<Record<string, unknown>>(b.encryptedProperties),
      })));

      const settings = await Promise.all(settingRecs.map(async (s: import("@/lib/database").SettingRecord) => ({
        key: s.key, updatedAt: s.updatedAt,
        value: await decryptValue<unknown>(s.encryptedValue),
      })));

      const backup = { version: 2, exportedAt: Date.now(), pages, blocks, settings };
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
      const backup = JSON.parse(text) as Record<string, unknown>;

      if (!Array.isArray(backup.pages) || !Array.isArray(backup.blocks)) {
        setStatus("Fichier invalide — champs pages/blocks manquants.");
        return;
      }
      // Version 1 : blocks avaient "content"/"properties" en clair
      // Version 2 : idem mais avec "settings"
      // On supporte les deux tant que pages+blocks sont présents
      const version = (backup.version as number) ?? 1;
      if (version > 2) {
        setStatus(`Format de backup v${version} non supporté par cette version de ROOT.`);
        return;
      }

      setStatus("Ré-chiffrement des données…");

      // Ré-chiffrer avec la clé du vault courant
      const pageRecs = await Promise.all((backup.pages as {
        id: string; parentId: string | null; order: number;
        createdAt: number; updatedAt: number; isDeleted: boolean; isFolder?: boolean;
        title: string; icon?: string;
      }[]).map(async (p) => ({
        id: p.id, parentId: p.parentId ?? null, order: p.order ?? 0,
        createdAt: p.createdAt ?? Date.now(), updatedAt: p.updatedAt ?? Date.now(),
        isDeleted: p.isDeleted ?? false,
        isFolder: p.isFolder ?? false,
        encryptedTitle: await encryptValue(p.title ?? ""),
        ...(p.icon ? { encryptedIcon: await encryptValue(p.icon) } : {}),
      })));

      const blockRecs = await Promise.all((backup.blocks as {
        id: string; pageId: string; parentBlockId: string | null;
        type: string; order: number; createdAt: number; updatedAt: number; isDeleted: boolean;
        content: Record<string, unknown>; properties: Record<string, unknown>;
      }[]).map(async (b) => ({
        id: b.id, pageId: b.pageId, parentBlockId: b.parentBlockId ?? null,
        type: b.type, order: b.order ?? 0,
        createdAt: b.createdAt ?? Date.now(), updatedAt: b.updatedAt ?? Date.now(),
        isDeleted: b.isDeleted ?? false,
        encryptedContent:    await encryptValue(b.content ?? {}),
        encryptedProperties: await encryptValue(b.properties ?? {}),
      })));

      const settingRecs = await Promise.all(((backup.settings ?? []) as {
        key: string; updatedAt: number; value: unknown;
      }[]).map(async (s) => ({
        key: s.key, updatedAt: s.updatedAt ?? Date.now(),
        encryptedValue: await encryptValue(s.value),
      })));

      setStatus("Écriture en base…");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as unknown as Dexie).transaction("rw", db.pages as any, db.blocks as any, db.settings as any, async () => {
        await db.pages.clear();
        await db.blocks.clear();
        await db.settings.clear();
        if (pageRecs.length)    await db.pages.bulkPut(pageRecs as never);
        if (blockRecs.length)   await db.blocks.bulkPut(blockRecs as never);
        if (settingRecs.length) await db.settings.bulkPut(settingRecs as never);
      });

      setStatus("Import terminé — rechargement…");
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setStatus(`Erreur : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
      if (importRef.current) importRef.current.value = "";
    }
  }

  async function handleNuke() {
    if (nukeText !== "NUKE") return;
    setBusy(true);
    try {
      await (db as unknown as Dexie).delete();
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
          Exporte toutes vos données déchiffrées dans un fichier JSON portable.
          Ce backup peut être importé par n&apos;importe quel vault, quel que soit le Master Password.
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
          Importe un backup ROOT (.json). Les données actuelles seront remplacées
          et ré-chiffrées avec le Master Password de ce vault.
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
