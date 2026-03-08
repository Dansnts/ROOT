"use client";

import { useState } from "react";
import { useCalendarStore, type StoreEvent } from "@/stores/calendarStore";
import { useCategoriesStore } from "@/stores/categoriesStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTagsStore } from "@/stores/tagsStore";

interface Props {
  initialDate?: string;
  event?: StoreEvent;
  onClose: () => void;
}

export default function EventModal({ initialDate, event, onClose }: Props) {
  const { createEvent, updateEvent, deleteEvent, moveEventToCategory } = useCalendarStore();
  const { categories } = useCategoriesStore();
  const { caldav } = useSettingsStore();
  const { tags } = useTagsStore();

  const eventTagDefs = (event?.tags ?? [])
    .map((id) => tags.find((t) => t.id === id))
    .filter(Boolean) as { id: string; name: string; color: string }[];

  const isEdit = !!event;

  // Calendriers CalDAV indexés par categoryId
  const calByCategoryId = new Map(
    (caldav?.calendars ?? []).map((c) => [c.categoryId, c])
  );

  // Catégorie courante de l'événement en édition
  const defaultCategoryId = isEdit
    ? event.categoryId
    : (categories[0]?.id ?? "");

  const [summary,     setSummary]     = useState(event?.title       ?? "");
  const [dtstart,     setDtstart]     = useState(event?.start       ?? initialDate ?? "");
  const [dtend,       setDtend]       = useState(event?.end         ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [location,    setLocation]    = useState(event?.location    ?? "");
  const [categoryId,  setCategoryId]  = useState<string>(defaultCategoryId);
  const [saving,      setSaving]      = useState(false);
  const [deleting,    setDeleting]    = useState(false);

  const selectedEntry = calByCategoryId.get(categoryId);

  async function handleSave() {
    if (!summary.trim() || !dtstart) return;
    setSaving(true);
    try {
      const data = {
        summary: summary.trim(),
        dtstart,
        dtend: dtend || undefined,
        description: description || undefined,
        location: location || undefined,
      };
      if (isEdit) {
        await updateEvent(event.id, data);
        if (categoryId !== event.categoryId) {
          await moveEventToCategory(event.id, categoryId);
        }
      } else {
        await createEvent(data, categoryId, selectedEntry);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!event) return;
    setDeleting(true);
    try {
      await deleteEvent(event.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-[var(--surface-2)] border border-[var(--border-light)] rounded-2xl shadow-2xl p-6 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-widest">
            {isEdit ? "Modifier l'événement" : "Nouvel événement"}
          </h3>
          <div className="flex items-center gap-2">
            {event?.synced && (
              <span className="text-xs text-[var(--accent-hover)] bg-[var(--surface-3)] px-2 py-0.5 rounded-full">
                ↕ CalDAV
              </span>
            )}
            {event && !event.synced && caldav && (
              <span className="text-xs text-[var(--text-faint)] bg-[var(--surface-3)] px-2 py-0.5 rounded-full">
                local
              </span>
            )}
            <button onClick={onClose} className="text-[var(--text-faint)] hover:text-[var(--text-muted)]">✕</button>
          </div>
        </div>

        {/* Tags (lecture seule — assignés depuis le Kanban) */}
        {eventTagDefs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {eventTagDefs.map((tag) => (
              <span
                key={tag.id}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-white font-medium"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {/* Titre */}
        <input
          autoFocus
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          placeholder="Titre de l'événement"
          className={inputCls}
        />

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Date de début *</label>
            <input
              type="date"
              value={dtstart}
              onChange={(e) => setDtstart(e.target.value)}
              className={`${inputCls} [color-scheme:dark]`}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Date de fin</label>
            <input
              type="date"
              value={dtend}
              min={dtstart}
              onChange={(e) => setDtend(e.target.value)}
              className={`${inputCls} [color-scheme:dark]`}
            />
          </div>
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Notes…"
            className={`${inputCls} resize-none`}
          />
        </div>

        {/* Lieu */}
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Lieu</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Salle, adresse…"
            className={inputCls}
          />
        </div>

        {/* Catégorie */}
        {categories.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Catégorie</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={inputCls}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {isEdit && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 rounded-lg text-sm text-[var(--danger)] hover:bg-red-900/20 transition-colors disabled:opacity-40"
            >
              {deleting ? "…" : "Supprimer"}
            </button>
          )}
          <button
            onClick={onClose}
            className="ml-auto px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:bg-[var(--surface-3)] transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !summary.trim() || !dtstart}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--surface-3)] border border-[var(--border-light)] text-[var(--text)] hover:border-[var(--accent)] transition-colors disabled:opacity-40"
          >
            {saving ? "Sauvegarde…" : isEdit ? "Enregistrer" : selectedEntry ? "Créer et synchroniser" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full bg-[var(--surface-3)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm outline-none focus:border-[var(--accent-hover)] transition-colors";
const labelCls = "text-xs text-[var(--text-faint)] uppercase tracking-wider";
