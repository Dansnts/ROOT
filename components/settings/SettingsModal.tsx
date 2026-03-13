"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { XIcon, RefreshIcon, CheckIcon } from "@/components/ui/icons";
import { useSettingsStore } from "@/stores/settingsStore";
import OnboardingModal from "@/components/onboarding/OnboardingModal";
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
import { exportBackup, importBackup, nukeVault } from "@/lib/BackupService";
import type { CalDAVConfig, CalendarEntry } from "@/lib/database";
import { db } from "@/lib/database";
import { vaultService } from "@/lib/VaultService";

type Tab = "profil" | "caldav" | "export" | "données";

interface Props { onClose: () => void }

export default function SettingsModal({ onClose }: Props) {
  const [tab, setTab]     = useState<Tab>("profil");
  const { caldav, userName, userAvatar, loadSettings, saveCalDAV, clearCalDAV, saveUserName, saveUserAvatar, clearUserAvatar } = useSettingsStore();
  const { loadPages } = usePagesStore();
  const { sync } = useCalendarStore();
  const { categories, createCategory } = useCategoriesStore();
  const fileRef    = useRef<HTMLInputElement>(null);
  const importRef  = useRef<HTMLInputElement>(null);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-10 bg-black/20 backdrop-blur-[2px]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[54rem] bg-[var(--surface-2)] border border-[var(--border-light)] rounded-2xl shadow-2xl flex flex-col overflow-hidden h-[82vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--border)] shrink-0">
          <h2 className="text-sm font-semibold text-[var(--text)]">Paramètres</h2>
          <button onClick={onClose} className="ml-auto text-[var(--text-faint)] hover:text-[var(--text-muted)] flex items-center justify-center w-6 h-6"><XIcon /></button>
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
            <ProfilTab
              userName={userName}
              userAvatar={userAvatar}
              onSave={saveUserName}
              onSaveAvatar={saveUserAvatar}
              onClearAvatar={clearUserAvatar}
            />
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

/** Extrait la zone recadrée de l'image source et retourne un dataURL JPEG 256×256. */
async function cropImageToDataUrl(imageSrc: string, pixelCrop: Area): Promise<string> {
  const img = new Image();
  img.src = imageSrc;
  await new Promise<void>((resolve) => { img.onload = () => resolve(); });
  const SIZE   = 256;
  const canvas = document.createElement("canvas");
  canvas.width  = SIZE;
  canvas.height = SIZE;
  canvas.getContext("2d")!.drawImage(
    img,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, SIZE, SIZE,
  );
  return canvas.toDataURL("image/jpeg", 0.88);
}

function ProfilTab({
  userName, userAvatar, onSave, onSaveAvatar, onClearAvatar,
}: {
  userName: string | null;
  userAvatar: string | null;
  onSave: (n: string) => Promise<void>;
  onSaveAvatar: (dataUrl: string) => Promise<void>;
  onClearAvatar: () => Promise<void>;
}) {
  const [value, setValue]         = useState(userName ?? "");
  const [saved, setSaved]         = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  // URL objet temporaire de l'image sélectionnée (libérée après crop)
  const [cropSrc, setCropSrc]     = useState<string | null>(null);
  const avatarInputRef            = useRef<HTMLInputElement>(null);

  const initials = userName ? userName.slice(0, 2).toUpperCase() : "?";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await onSave(value);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Libérer l'ancienne URL objet si elle existait
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(URL.createObjectURL(file));
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  }

  async function handleCropConfirm(croppedDataUrl: string) {
    // Libérer l'URL objet temporaire immédiatement
    if (cropSrc) { URL.revokeObjectURL(cropSrc); setCropSrc(null); }
    // Supprimer l'ancien avatar avant d'enregistrer le nouveau (libère la mémoire store)
    await onClearAvatar();
    await onSaveAvatar(croppedDataUrl);
  }

  function handleCropCancel() {
    if (cropSrc) { URL.revokeObjectURL(cropSrc); setCropSrc(null); }
  }

  return (
    <>
      {/* Modal de recadrage (monte au-dessus de tout) */}
      {cropSrc && (
        <AvatarCropModal
          src={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}

      {/* Onboarding modal (relecture) */}
      {showOnboarding && (
        <OnboardingModal dismissible onDone={() => setShowOnboarding(false)} />
      )}

      <div className="flex flex-col gap-6">
        {/* Avatar */}
        <div className="flex flex-col gap-3">
          <p className="text-xs text-[var(--text-faint)] uppercase tracking-wider">Photo de profil</p>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[var(--surface-3)] border border-[var(--border-light)] flex items-center justify-center overflow-hidden shrink-0">
              {userAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userAvatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl font-bold text-[var(--text-muted)] font-mono">{initials}</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={() => avatarInputRef.current?.click()}
                className={`${btnCls} text-xs`}
              >
                Choisir une image
              </button>
              {userAvatar && (
                <button
                  onClick={onClearAvatar}
                  className="text-xs text-[var(--text-faint)] hover:text-[var(--danger)] transition-colors"
                >
                  Supprimer la photo
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--border)]" />

        {/* Onboarding */}
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[var(--text-faint)] uppercase tracking-wider">Confidentialité & contraintes</p>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Relisez les engagements et contraintes de ROOT à tout moment.
          </p>
          <button onClick={() => setShowOnboarding(true)} className={btnCls}>
            Relire l&apos;onboarding
          </button>
        </div>

        <div className="border-t border-[var(--border)]" />

        {/* Nom */}
        <div className="flex flex-col gap-3">
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
            <button type="submit" className={`${btnCls} flex items-center gap-1.5`}>
              {saved ? <><CheckIcon size={13} /> Sauvegardé</> : "Sauvegarder"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

// ── Modal de recadrage avatar ─────────────────────────────────────────────────

function AvatarCropModal({
  src, onConfirm, onCancel,
}: {
  src: string;
  onConfirm: (dataUrl: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [crop,   setCrop]   = useState({ x: 0, y: 0 });
  const [zoom,   setZoom]   = useState(1);
  const [saving, setSaving] = useState(false);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, pixelCrop: Area) => {
    setCroppedArea(pixelCrop);
  }, []);

  async function handleConfirm() {
    if (!croppedArea) return;
    setSaving(true);
    const dataUrl = await cropImageToDataUrl(src, croppedArea);
    await onConfirm(dataUrl);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[var(--surface-2)] border border-[var(--border-light)] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ width: 420, maxWidth: "95vw" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <p className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-widest">Recadrer la photo</p>
          <button onClick={onCancel} className="text-[var(--text-faint)] hover:text-[var(--text-muted)] w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--surface-3)] transition-colors">
            <XIcon size={14} />
          </button>
        </div>

        {/* Zone de crop */}
        <div className="relative bg-black" style={{ height: 320 }}>
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            style={{
              containerStyle: { background: "#000" },
              cropAreaStyle: { border: "2px solid var(--accent)", boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" },
            }}
          />
        </div>

        {/* Zoom slider */}
        <div className="px-5 py-3 flex items-center gap-3 border-t border-[var(--border)]">
          <span className="text-xs text-[var(--text-faint)] shrink-0">Zoom</span>
          <input
            type="range"
            min={1} max={3} step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-[var(--accent)] h-1 rounded-full cursor-pointer"
          />
          <span className="text-xs text-[var(--text-faint)] font-mono w-8 text-right shrink-0">{zoom.toFixed(1)}×</span>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-3 border-t border-[var(--border)]">
          <button onClick={onCancel} className="ml-auto px-4 py-1.5 rounded-lg text-sm text-[var(--text-muted)] hover:bg-[var(--surface-3)] transition-colors">
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || !croppedArea}
            className="px-4 py-1.5 rounded-lg text-sm bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {saving ? "Sauvegarde…" : "Appliquer"}
          </button>
        </div>
      </div>
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
        <button onClick={handleDiscover} disabled={busy} className={`${btnCls} border-[var(--accent-hover)] flex items-center gap-1.5`}>
          <RefreshIcon size={13} /> Découvrir les calendriers
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
          <button onClick={() => setCreating(false)} className="text-[var(--text-faint)] flex items-center justify-center w-5 h-5"><XIcon size={12} /></button>
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

  // Modal de confirmation unifié export / import
  const [modal, setModal] = useState<{ mode: "export" | "import"; file?: File } | null>(null);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  function openModal(mode: "export" | "import", file?: File) {
    setModal({ mode, file });
    setPwInput("");
    setPwError(null);
  }
  function closeModal() { setModal(null); setPwInput(""); setPwError(null); }

  async function handleConfirm() {
    if (!modal) return;
    setPwError(null);
    setBusy(true);
    try {
      const meta = await db.vault_meta.get(1);
      if (!meta) { setPwError("Vault introuvable."); setBusy(false); return; }
      const salt  = vaultService.b64ToSalt(meta.salt);
      const key   = await vaultService.deriveKey(pwInput, salt);
      const valid = await vaultService.verifyKey(key, meta.verifier);
      if (!valid) { setPwError("Mot de passe incorrect."); setBusy(false); return; }

      if (modal.mode === "export") {
        closeModal();
        await exportBackup();
        setStatus("Backup téléchargé.");
      } else if (modal.mode === "import" && modal.file) {
        const file = modal.file;
        closeModal();
        setStatus("Import en cours…");
        await importBackup(file, setStatus);
        setStatus("Import terminé — rechargement…");
        setTimeout(() => window.location.reload(), 800);
      }
    } catch (err) {
      setPwError(`Erreur : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleNuke() {
    if (nukeText !== "NUKE") return;
    setBusy(true);
    try { await nukeVault(); }
    catch { setBusy(false); setStatus("Erreur lors de la suppression."); }
  }

  return (
    <>
      {/* ── Modal de confirmation ────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 bg-[var(--surface-2)] border border-[var(--border-light)] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]">
              <span className="text-base">{modal.mode === "import" ? "⚠️" : "🔒"}</span>
              <h3 className="text-sm font-semibold text-[var(--text)]">
                {modal.mode === "export" ? "Confirmer l'export" : "Confirmer la restauration"}
              </h3>
              <button onClick={closeModal} className="ml-auto text-[var(--text-faint)] hover:text-[var(--text-muted)] w-6 h-6 flex items-center justify-center">
                <XIcon size={14} />
              </button>
            </div>

            <div className="flex flex-col gap-4 p-5">
              {/* Avertissement import */}
              {modal.mode === "import" && (
                <div className="flex gap-3 p-3 rounded-xl bg-orange-500/10 border border-orange-500/25">
                  <span className="text-orange-400 text-lg shrink-0 leading-none mt-0.5">⚠</span>
                  <p className="text-xs text-orange-300 leading-relaxed">
                    <strong className="font-semibold">Toutes vos données actuelles seront effacées</strong> — pages, blocs,
                    événements, paramètres — et remplacées par le contenu du fichier sélectionné.
                    Cette opération est <strong className="font-semibold">irréversible</strong>.
                  </p>
                </div>
              )}

              <p className="text-xs text-[var(--text-muted)]">
                Entrez votre Master Password pour confirmer.
              </p>

              <input
                type="password"
                autoFocus
                value={pwInput}
                onChange={(e) => { setPwInput(e.target.value); setPwError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); if (e.key === "Escape") closeModal(); }}
                placeholder="Master Password"
                className={inputCls}
              />

              {pwError && (
                <p className="text-xs text-red-400 bg-red-900/20 px-3 py-2 rounded-lg">{pwError}</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-5 py-4 border-t border-[var(--border)]">
              <button onClick={closeModal} className="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:bg-[var(--surface-3)] transition-colors">
                Annuler
              </button>
              <button
                onClick={handleConfirm}
                disabled={busy || !pwInput}
                className={`ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${
                  modal.mode === "import"
                    ? "bg-orange-600/80 hover:bg-orange-600 text-white border border-orange-500/40"
                    : "bg-[var(--accent)]/20 hover:bg-[var(--accent)]/30 text-[var(--accent)] border border-[var(--accent)]/30"
                }`}
              >
                {busy ? "Vérification…" : <><CheckIcon size={13} />{modal.mode === "export" ? "Exporter" : "Restaurer"}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6">

        {/* Backup export */}
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-[var(--text)]">Sauvegarder</h3>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Exporte toutes vos données déchiffrées dans un fichier JSON portable.
            Ce backup peut être importé par n&apos;importe quel vault, quel que soit le Master Password.
          </p>
          <button onClick={() => openModal("export")} disabled={busy} className={btnCls}>
            ↓ Télécharger le backup (.json)
          </button>
        </div>

        <div className="border-t border-[var(--border)]" />

        {/* Backup import */}
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-[var(--text)]">Restaurer</h3>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Importe un backup ROOT (.json). Les données actuelles seront <strong className="text-[var(--text)]">entièrement remplacées</strong> et
            ré-chiffrées avec le Master Password de ce vault.
          </p>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (importRef.current) importRef.current.value = "";
              if (f) openModal("import", f);
            }}
          />
          <button onClick={() => importRef.current?.click()} disabled={busy} className={btnCls}>
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
    </>
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

