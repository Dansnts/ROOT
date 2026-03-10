"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid/index.js";
import timeGridPlugin from "@fullcalendar/timegrid/index.js";
import listPlugin from "@fullcalendar/list/index.js";
import interactionPlugin from "@fullcalendar/interaction/index.js";
import frLocale from "@fullcalendar/core/locales/fr.js";
import type { EventClickArg, EventDropArg } from "@fullcalendar/core/index.js";
import type { DateClickArg } from "@fullcalendar/interaction/index.js";
import { useCalendarStore, type StoreEvent } from "@/stores/calendarStore";
import { useCategoriesStore } from "@/stores/categoriesStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTagsStore } from "@/stores/tagsStore";
import EventModal from "./EventModal";
import { COLOR_PALETTE } from "@/lib/constants";
import { TrashIcon, XIcon, RefreshIcon } from "@/components/ui/icons";

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

export default function CalendarView() {
  const {
    events, syncStatus, lastSyncAt,
    loadEvents, sync, updateEvent, deleteCalendarEvents,
  } = useCalendarStore();

  const { categories, updateCategory, deleteCategory, loadCategories } = useCategoriesStore();
  const { caldav, loadSettings } = useSettingsStore();
  const { tags } = useTagsStore();
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const calRef = useRef<FullCalendar>(null);

  const [createDate,   setCreateDate]   = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<StoreEvent | null>(null);
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);

  async function handleCategoryColorChange(catId: string, newColor: string) {
    await updateCategory(catId, { color: newColor });
    await loadEvents();
    setColorPickerId(null);
  }

  async function handleClearCategory(catId: string) {
    if (!confirm("Supprimer tous les événements de cette catégorie ?")) return;
    await deleteCalendarEvents(catId);
    setColorPickerId(null);
  }

  async function handleRemoveCategory(catId: string) {
    if (!confirm("Supprimer cette catégorie ? (les événements déjà importés seront supprimés)")) return;
    await deleteCalendarEvents(catId);
    await deleteCategory(catId);
    // Retirer le lien categoryId dans la config CalDAV
    const caldavState = useSettingsStore.getState().caldav;
    if (caldavState) {
      const { saveCalDAV } = useSettingsStore.getState();
      await saveCalDAV({
        ...caldavState,
        calendars: caldavState.calendars.map((c) =>
          c.categoryId === catId ? { ...c, categoryId: undefined } : c
        ),
      });
    }
    await loadEvents();
    setColorPickerId(null);
  }

  useEffect(() => {
    // Charger settings → catégories → events dans l'ordre pour éviter
    // que loadEvents() tourne avec catById vide (race condition)
    loadSettings().then(() => loadCategories()).then(() => loadEvents());
  }, [loadEvents, loadSettings, loadCategories]);

  useEffect(() => {
    if (!caldav?.calendars?.length) return;
    sync();
    const timer = setInterval(() => sync(), SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caldav?.serverUrl]);

  const handleEventDrop = useCallback(async (info: EventDropArg) => {
    const newDate = info.event.startStr.split("T")[0];
    const endDate = info.event.endStr ? info.event.endStr.split("T")[0] : undefined;
    await updateEvent(info.event.id, { dtstart: newDate, dtend: endDate });
  }, [updateEvent]);

  const handleDateClick = useCallback((info: DateClickArg) => {
    setCreateDate(info.dateStr);
    setEditingEvent(null);
  }, []);

  const handleEventClick = useCallback((info: EventClickArg) => {
    const ev = events.find((e) => e.id === info.event.id);
    if (ev) { setEditingEvent(ev); setCreateDate(null); }
  }, [events]);

  const fcEvents = events.map((e) => ({
    id: e.id,
    title: e.title,
    start: e.start,
    // Pour les allDay events FullCalendar: end doit être > start (exclusif)
    // Si end === start ou undefined → on laisse undefined (event 1 jour)
    end: e.end && e.end > e.start ? e.end : undefined,
    allDay: true,
    backgroundColor: e.color,
    borderColor: e.synced ? e.color : "rgba(255,255,255,0.15)",
    extendedProps: { synced: e.synced, tags: e.tags ?? [] },
  }));

  const syncLabel = (() => {
    if (syncStatus === "syncing") return "Synchronisation…";
    if (syncStatus === "error")   return "Erreur de sync";
    if (syncStatus === "success") return "Synchronisé";
    if (lastSyncAt) return `Sync : ${new Date(lastSyncAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
    return null;
  })();

  // Compter les événements par catégorie
  const countByCategory = new Map<string, number>();
  for (const ev of events) {
    countByCategory.set(ev.categoryId, (countByCategory.get(ev.categoryId) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" onClick={() => setColorPickerId(null)}>
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--border)] shrink-0 flex-wrap" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold shrink-0">Calendrier</h2>
        <span className="text-xs text-[var(--text-faint)] shrink-0">{events.length} événement{events.length !== 1 ? "s" : ""}</span>

        {/* Légende des catégories */}
        {categories.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            {categories.map((cat) => (
              <div key={cat.id} className="relative">
                <button
                  onClick={() => setColorPickerId(colorPickerId === cat.id ? null : cat.id)}
                  className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors group"
                  title="Modifier la catégorie"
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0 ring-2 ring-transparent group-hover:ring-[var(--border-light)] transition-all"
                    style={{ backgroundColor: cat.color }}
                  />
                  {cat.name}
                  {countByCategory.has(cat.id) && (
                    <span className="text-[10px] opacity-50">({countByCategory.get(cat.id)})</span>
                  )}
                </button>
                {colorPickerId === cat.id && (
                  <div className="absolute top-full left-0 mt-2 z-30 bg-[var(--surface-2)] border border-[var(--border-light)] rounded-xl shadow-xl p-3 flex flex-col gap-2 min-w-[180px]">
                    <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider">Couleur — {cat.name}</p>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_PALETTE.map((c) => (
                        <button
                          key={c}
                          onClick={() => handleCategoryColorChange(cat.id, c)}
                          className="w-6 h-6 rounded-full border-2 transition-all hover:scale-110"
                          style={{
                            backgroundColor: c,
                            borderColor: cat.color === c ? "var(--text)" : "transparent",
                          }}
                          title={c}
                        />
                      ))}
                    </div>
                    <div className="border-t border-[var(--border)] pt-2 mt-1 flex flex-col gap-0.5">
                      <button
                        onClick={() => handleClearCategory(cat.id)}
                        className="w-full text-left text-[10px] text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors py-1 px-1 rounded hover:bg-red-900/20 flex items-center gap-1.5"
                      >
                        <TrashIcon size={12} /> Vider la catégorie
                      </button>
                      <button
                        onClick={() => handleRemoveCategory(cat.id)}
                        className="w-full text-left text-[10px] text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors py-1 px-1 rounded hover:bg-red-900/20 flex items-center gap-1.5"
                      >
                        <XIcon size={12} /> Supprimer la catégorie
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          {syncLabel && (
            <span className={`text-xs ${syncStatus === "error" ? "text-[var(--danger)]" : syncStatus === "success" ? "text-[var(--success)]" : "text-[var(--text-muted)]"}`}>
              {syncLabel}
            </span>
          )}
          {caldav && (
            <button
              onClick={() => sync()}
              disabled={syncStatus === "syncing"}
              className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors disabled:opacity-40"
              title="Synchroniser maintenant"
            >
              <RefreshIcon size={13} /> Sync
            </button>
          )}
          <button
            onClick={() => { setCreateDate(new Date().toISOString().split("T")[0]); setEditingEvent(null); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border-light)] transition-colors"
          >
            + Événement
          </button>
        </div>
      </div>

      {/* Calendrier */}
      <div className="flex-1 p-5 overflow-auto root-calendar">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={frLocale}
          headerToolbar={{
            left:   "prev,next today",
            center: "title",
            right:  "dayGridMonth,timeGridDay,listMonth",
          }}
          events={fcEvents}
          editable={true}
          selectable={true}
          eventDrop={handleEventDrop}
          eventClick={handleEventClick}
          dateClick={handleDateClick}
          eventContent={(info) => {
            const evTags: string[] = info.event.extendedProps.tags ?? [];
            const tagDefs = evTags.map((id) => tagById.get(id)).filter(Boolean) as { id: string; name: string; color: string }[];
            return (
              <div className="flex flex-col px-1 py-0.5 w-full overflow-hidden">
                <div className="flex items-center gap-1">
                  {!info.event.extendedProps.synced && caldav && (
                    <span className="text-[10px] opacity-50 shrink-0" title="Non synchronisé">●</span>
                  )}
                  <span className="truncate text-xs font-medium">{info.event.title}</span>
                </div>
                {tagDefs.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                    {tagDefs.map((tag) => (
                      <span
                        key={tag.id}
                        className="px-1 rounded text-white leading-tight"
                        style={{ backgroundColor: tag.color, fontSize: 9 }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          }}
          height="100%"
          dayMaxEvents={3}
          moreLinkClick="popover"
        />
      </div>

      {/* Modals */}
      {createDate && (
        <EventModal
          initialDate={createDate}
          onClose={() => setCreateDate(null)}
        />
      )}
      {editingEvent && (
        <EventModal
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
        />
      )}
    </div>
  );
}
