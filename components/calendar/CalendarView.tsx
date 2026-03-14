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
import { RefreshIcon } from "@/components/ui/icons";

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

export default function CalendarView() {
  const {
    events, syncStatus, lastSyncAt,
    loadEvents, sync, updateEvent,
  } = useCalendarStore();

  const { categories, loadCategories } = useCategoriesStore();
  const { caldav, loadSettings } = useSettingsStore();
  const { tags } = useTagsStore();
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const calRef = useRef<FullCalendar>(null);

  const [createDate,   setCreateDate]   = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<StoreEvent | null>(null);
  const [hiddenCatIds, setHiddenCatIds] = useState<Set<string>>(new Set());
  const [morePopover,     setMorePopover]     = useState<{
    x: number; y: number;
    evIds: string[];
  } | null>(null);

  function toggleCategoryVisibility(catId: string) {
    setHiddenCatIds((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
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
    // Preserve time component if the event had one before dragging
    const startTimePart = info.event.startStr.includes("T")
      ? info.event.startStr.split("T")[1]?.slice(0, 5)
      : undefined;
    const endTimePart = info.event.endStr?.includes("T")
      ? info.event.endStr.split("T")[1]?.slice(0, 5)
      : undefined;
    await updateEvent(info.event.id, {
      dtstart: newDate,
      dtend: endDate,
      startTime: startTimePart,
      endTime: endTimePart,
    });
  }, [updateEvent]);

  const handleDateClick = useCallback((info: DateClickArg) => {
    setCreateDate(info.dateStr);
    setEditingEvent(null);
  }, []);

  const handleEventClick = useCallback((info: EventClickArg) => {
    const ev = events.find((e) => e.id === info.event.id);
    if (ev) { setEditingEvent(ev); setCreateDate(null); }
  }, [events]);

  const fcEvents = events.filter((e) => !hiddenCatIds.has(e.categoryId)).map((e) => {
    const isTimed = !!e.startTime;
    const start = isTimed ? `${e.start}T${e.startTime}` : e.start;
    let end: string | undefined;
    if (isTimed) {
      const endDate = e.end ?? e.start;
      end = `${endDate}T${e.endTime ?? e.startTime}`;
    } else {
      // allDay: FullCalendar end est exclusif → end > start requis
      end = e.end && e.end > e.start ? e.end : undefined;
    }
    return {
      id: e.id,
      title: e.title,
      start,
      end,
      allDay: !isTimed,
      backgroundColor: e.color,
      borderColor: e.synced ? e.color : "rgba(255,255,255,0.15)",
      extendedProps: { synced: e.synced, tags: e.tags ?? [], startTime: e.startTime, endTime: e.endTime },
    };
  });

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
    <div className="flex flex-col h-full overflow-hidden" onClick={() => setMorePopover(null)}>
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--border)] shrink-0 flex-wrap" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold shrink-0">Calendrier</h2>
        <span className="text-xs text-[var(--text-faint)] shrink-0">{events.length} événement{events.length !== 1 ? "s" : ""}</span>

        {/* Filtres catégories — toggle visibilité */}
        {categories.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {categories.map((cat) => {
              const hidden = hiddenCatIds.has(cat.id);
              return (
                <button
                  key={cat.id}
                  onClick={() => toggleCategoryVisibility(cat.id)}
                  title={hidden ? `Afficher ${cat.name}` : `Masquer ${cat.name}`}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all ${
                    hidden
                      ? "border-[var(--border)] text-[var(--text-faint)] opacity-50"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                  style={!hidden ? { borderColor: cat.color + "80", backgroundColor: cat.color + "18" } : {}}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color, opacity: hidden ? 0.4 : 1 }}
                  />
                  {cat.name}
                  {!hidden && countByCategory.has(cat.id) && (
                    <span className="opacity-50 text-[10px]">{countByCategory.get(cat.id)}</span>
                  )}
                </button>
              );
            })}
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
            const startTime: string | undefined = info.event.extendedProps.startTime;
            const endTime: string | undefined   = info.event.extendedProps.endTime;
            return (
              <div className="flex flex-col px-1 py-0.5 w-full overflow-hidden">
                <div className="flex items-center gap-1">
                  {!info.event.extendedProps.synced && caldav && (
                    <span className="text-[10px] opacity-50 shrink-0" title="Non synchronisé">●</span>
                  )}
                  <span className="truncate text-xs font-medium">{info.event.title}</span>
                </div>
                {startTime && (
                  <span className="text-[10px] opacity-70 font-mono leading-tight">
                    {startTime}{endTime && endTime !== startTime ? ` → ${endTime}` : ""}
                  </span>
                )}
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
          moreLinkClick={(info) => {
            info.jsEvent.stopPropagation();
            const el = (info.jsEvent.target as HTMLElement).closest("a,button") as HTMLElement ?? (info.jsEvent.target as HTMLElement);
            const rect = el.getBoundingClientRect();
            setMorePopover({
              x: rect.left,
              y: rect.bottom + 6,
              evIds: info.allSegs.map((s) => s.event.id),
            });
          }}
        />
      </div>

      {/* Popover "+X en plus" */}
      {morePopover && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMorePopover(null)} />
          <div
            className="fixed z-50 bg-[var(--surface-2)] border border-[var(--border-light)] rounded-xl shadow-2xl py-1.5 flex flex-col min-w-[200px] max-w-[260px] max-h-[320px] overflow-y-auto"
            style={{ left: morePopover.x, top: morePopover.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-3 py-1 text-[10px] text-[var(--text-faint)] uppercase tracking-widest border-b border-[var(--border)] mb-1">
              {morePopover.evIds.length} événement{morePopover.evIds.length > 1 ? "s" : ""}
            </p>
            {morePopover.evIds.map((evId) => {
              const ev = events.find((e) => e.id === evId);
              if (!ev) return null;
              return (
                <button
                  key={evId}
                  onClick={() => { setEditingEvent(ev); setCreateDate(null); setMorePopover(null); }}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--surface-3)] transition-colors text-left"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: ev.color }}
                  />
                  <span className="text-sm text-[var(--text-muted)] truncate">{ev.title}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

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
