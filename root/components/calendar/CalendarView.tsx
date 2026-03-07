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
import { useSettingsStore } from "@/stores/settingsStore";
import EventModal from "./EventModal";

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export default function CalendarView() {
  const {
    events, syncStatus, lastSyncAt,
    loadEvents, sync, updateEvent,
  } = useCalendarStore();

  const { caldav, loadSettings } = useSettingsStore();
  const calRef = useRef<FullCalendar>(null);

  // Modal state
  const [createDate,   setCreateDate]   = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<StoreEvent | null>(null);

  // Chargement initial
  useEffect(() => {
    loadSettings().then(() => loadEvents());
  }, [loadEvents, loadSettings]);

  // Sync initiale + auto-sync toutes les 5 min si CalDAV configuré
  useEffect(() => {
    if (!caldav?.calendars?.length) return;
    sync();
    const timer = setInterval(() => sync(), SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caldav?.serverUrl]);

  // Drag & drop → mise à jour de la date
  const handleEventDrop = useCallback(async (info: EventDropArg) => {
    const newDate = info.event.startStr.split("T")[0];
    const endDate = info.event.endStr ? info.event.endStr.split("T")[0] : undefined;
    await updateEvent(info.event.id, { dtstart: newDate, dtend: endDate });
  }, [updateEvent]);

  // Clic sur une date vide → créer
  const handleDateClick = useCallback((info: DateClickArg) => {
    setCreateDate(info.dateStr);
    setEditingEvent(null);
  }, []);

  // Clic sur un événement → éditer
  const handleEventClick = useCallback((info: EventClickArg) => {
    const ev = events.find((e) => e.id === info.event.id);
    if (ev) { setEditingEvent(ev); setCreateDate(null); }
  }, [events]);

  const fcEvents = events.map((e) => ({
    id: e.id,
    title: e.title,
    start: e.start,
    end: e.end,
    allDay: true,
    backgroundColor: e.color,
    borderColor: e.synced ? e.color : "rgba(255,255,255,0.15)",
    extendedProps: { synced: e.synced },
  }));

  const syncLabel = (() => {
    if (syncStatus === "syncing") return "Synchronisation…";
    if (syncStatus === "error")   return "Erreur de sync";
    if (syncStatus === "success") return "Synchronisé ✓";
    if (lastSyncAt) return `Sync : ${new Date(lastSyncAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
    return null;
  })();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--border)] shrink-0">
        <h2 className="text-lg font-semibold">Calendrier</h2>
        <span className="text-xs text-[var(--text-faint)]">{events.length} événement{events.length !== 1 ? "s" : ""}</span>

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
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors disabled:opacity-40"
              title="Synchroniser maintenant"
            >
              ↻ Sync
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
            right:  "dayGridMonth,listMonth",
          }}
          events={fcEvents}
          editable={true}
          selectable={true}
          eventDrop={handleEventDrop}
          eventClick={handleEventClick}
          dateClick={handleDateClick}
          eventContent={(info) => (
            <div className="flex items-center gap-1 px-1 py-0.5 truncate w-full">
              {!info.event.extendedProps.synced && caldav && (
                <span className="text-[10px] opacity-50 shrink-0" title="Non synchronisé">●</span>
              )}
              <span className="truncate text-xs">{info.event.title}</span>
            </div>
          )}
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
