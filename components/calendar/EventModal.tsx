"use client";

import { useState } from "react";
import { useCalendarStore, type StoreEvent } from "@/stores/calendarStore";
import { useCategoriesStore } from "@/stores/categoriesStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTagsStore } from "@/stores/tagsStore";
import { Drawer, DrawerContent, DrawerClose } from "@/components/ui/drawer";
import { Calendar, dateFromStr, strFromDate } from "@/components/ui/calendar";
import { toast } from "@/components/ui/sonner";
import { ArrowsUpDownIcon, XIcon, CalendarDaysIcon } from "@/components/ui/icons";

interface Props {
  initialDate?: string;
  event?: StoreEvent;
  onClose: () => void;
}

export default function EventModal({ initialDate, event, onClose }: Props) {
  const [open, setOpen] = useState(true);

  function handleClose() {
    setOpen(false);
    setTimeout(onClose, 300); // laisse l'animation se terminer avant de démonter
  }
  const { createEvent, updateEvent, deleteEvent, moveEventToCategory } = useCalendarStore();
  const { categories } = useCategoriesStore();
  const { caldav } = useSettingsStore();
  const { tags } = useTagsStore();

  const eventTagDefs = (event?.tags ?? [])
    .map((id) => tags.find((t) => t.id === id))
    .filter(Boolean) as { id: string; name: string; color: string }[];

  const isEdit = !!event;

  const calByCategoryId = new Map(
    (caldav?.calendars ?? []).map((c) => [c.categoryId, c])
  );

  const defaultCategoryId = isEdit
    ? event.categoryId
    : (categories[0]?.id ?? "");

  const [summary,     setSummary]     = useState(event?.title       ?? "");
  const [dtstart,     setDtstart]     = useState(event?.start       ?? initialDate ?? "");
  const [dtend,       setDtend]       = useState(event?.end         ?? "");
  const [allDay,      setAllDay]      = useState(!event?.startTime);
  const [startTime,   setStartTime]   = useState(event?.startTime   ?? "09:00");
  const [endTime,     setEndTime]     = useState(event?.endTime     ?? "10:00");
  const [description, setDescription] = useState(event?.description ?? "");
  const [location,    setLocation]    = useState(event?.location    ?? "");
  const [categoryId,  setCategoryId]  = useState<string>(defaultCategoryId);
  const [saving,      setSaving]      = useState(false);
  const [deleting,    setDeleting]    = useState(false);

  const [showStartCal, setShowStartCal] = useState(false);
  const [showEndCal,   setShowEndCal]   = useState(false);

  const selectedEntry = calByCategoryId.get(categoryId);

  async function handleSave() {
    if (!summary.trim() || !dtstart) return;
    setSaving(true);
    try {
      const data = {
        summary: summary.trim(),
        dtstart,
        dtend: dtend || undefined,
        startTime: allDay ? undefined : startTime || undefined,
        endTime: allDay ? undefined : endTime || undefined,
        description: description || undefined,
        location: location || undefined,
      };
      if (isEdit) {
        await updateEvent(event.id, data);
        if (categoryId !== event.categoryId) {
          await moveEventToCategory(event.id, categoryId);
        }
        toast.success("Événement enregistré");
      } else {
        await createEvent(data, categoryId, selectedEntry);
        toast.success("Événement créé");
      }
      handleClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!event) return;
    setDeleting(true);
    try {
      await deleteEvent(event.id);
      toast("Événement supprimé", { description: event.title });
      handleClose();
    } finally {
      setDeleting(false);
    }
  }

  function dateDisplay(str: string) {
    if (!str) return null;
    return new Date(str + "T00:00:00").toLocaleDateString("fr-FR", {
      day: "numeric", month: "long", year: "numeric",
    });
  }

  // Quand on passe de "avec heure" à "journée entière", effacer l'heure de fin si elle dépasse minuit
  function handleAllDayToggle(checked: boolean) {
    setAllDay(checked);
    if (!checked && !startTime) setStartTime("09:00");
    if (!checked && !endTime)   setEndTime("10:00");
  }

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DrawerContent>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="view-header flex items-center justify-between px-6 py-4 border-b border-[var(--border)] shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-[0.14em] font-mono flex items-center gap-2">
                <span className="text-[var(--accent)]">▸</span>
                {isEdit ? "Modifier l'événement" : "Nouvel événement"}
              </h3>
              {event?.synced && (
                <span className="flex items-center gap-1 text-xs text-[var(--accent-hover)] bg-[var(--surface-3)] px-2 py-0.5 rounded-full">
                  <ArrowsUpDownIcon size={12} /> CalDAV
                </span>
              )}
              {event && !event.synced && caldav && (
                <span className="text-xs text-[var(--text-faint)] bg-[var(--surface-3)] px-2 py-0.5 rounded-full">
                  local
                </span>
              )}
            </div>
            <DrawerClose
              onClick={handleClose}
              className="text-[var(--text-faint)] hover:text-[var(--text-muted)] text-sm w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--surface-3)] transition-colors"
            >
              <XIcon size={14} />
            </DrawerClose>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
            {/* Tags (lecture seule) */}
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

            {/* Journée entière toggle */}
            <div className="flex items-center justify-between">
              <label className={labelCls}>Journée entière</label>
              <button
                type="button"
                role="switch"
                aria-checked={allDay}
                onClick={() => handleAllDayToggle(!allDay)}
                className={`relative w-9 h-5 rounded-full border transition-all duration-200 ${
                  allDay
                    ? "bg-[var(--accent)] border-[var(--accent)]"
                    : "bg-[var(--surface-3)] border-[var(--border)]"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                    allDay ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Date début */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Date de début *</label>
              <button
                type="button"
                onClick={() => { setShowStartCal((v) => !v); setShowEndCal(false); }}
                className={`${inputCls} text-left flex items-center gap-2`}
              >
                <span className="text-[var(--text-faint)]"><CalendarDaysIcon size={14} /></span>
                <span className={dateDisplay(dtstart) ? "text-[var(--text)]" : "text-[var(--text-faint)]"}>
                  {dateDisplay(dtstart) ?? "Choisir une date…"}
                </span>
              </button>
              {showStartCal && (
                <div className="rounded-xl bg-[var(--surface-3)] border border-[var(--border)]">
                  <Calendar
                    mode="single"
                    selected={dateFromStr(dtstart)}
                    onSelect={(date) => {
                      setDtstart(date ? strFromDate(date) : "");
                      setShowStartCal(false);
                    }}
                  />
                </div>
              )}
            </div>

            {/* Heures début / fin — uniquement si pas journée entière */}
            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Heure de début</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Heure de fin</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
            )}

            {/* Date fin */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Date de fin</label>
              <button
                type="button"
                onClick={() => { setShowEndCal((v) => !v); setShowStartCal(false); }}
                className={`${inputCls} text-left flex items-center gap-2`}
              >
                <span className="text-[var(--text-faint)]"><CalendarDaysIcon size={14} /></span>
                <span className={dateDisplay(dtend) ? "text-[var(--text)]" : "text-[var(--text-faint)]"}>
                  {dateDisplay(dtend) ?? "Optionnel…"}
                </span>
                {dtend && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDtend(""); setShowEndCal(false); }}
                    className="ml-auto text-[var(--text-faint)] hover:text-[var(--danger)] transition-colors"
                  >
                    <XIcon size={11} />
                  </button>
                )}
              </button>
              {showEndCal && (
                <div className="rounded-xl bg-[var(--surface-3)] border border-[var(--border)]">
                  <Calendar
                    mode="single"
                    selected={dateFromStr(dtend)}
                    disabled={dtstart ? { before: dateFromStr(dtstart)! } : undefined}
                    onSelect={(date) => {
                      setDtend(date ? strFromDate(date) : "");
                      setShowEndCal(false);
                    }}
                  />
                </div>
              )}
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
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
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-6 py-4 border-t border-[var(--border)] shrink-0">
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
              onClick={handleClose}
              className="ml-auto px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:bg-[var(--surface-3)] transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !summary.trim() || !dtstart}
              className="btn-cta px-4 py-2 rounded-lg text-sm border font-medium disabled:opacity-40"
            >
              {saving ? "Sauvegarde…" : isEdit ? "Enregistrer" : selectedEntry ? "Créer et synchroniser" : "Créer"}
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

const inputCls = "input-glow w-full bg-[var(--surface-3)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm outline-none transition-colors";
const labelCls = "text-[10px] text-[var(--text-faint)] uppercase tracking-[0.12em] font-mono";
