"use client";

import { create } from "zustand";
import { db } from "@/lib/database";
import { encryptValue, decryptValue } from "@/stores/vaultStore";
import { loadAllPages } from "@/lib/BlockService";
import {
  pushEventToCalDAV,
  deleteEventFromCalDAV,
  syncCalDAV,
  type EventFormData,
  type CalDAVBlockProps,
} from "@/lib/CalDAVService";
import { useSettingsStore } from "@/stores/settingsStore";
import type { CalendarEntry } from "@/lib/database";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoreEvent {
  id: string;        // blockId
  uid: string;       // CalDAV UID (généré si local)
  title: string;
  start: string;     // YYYY-MM-DD
  end?: string;
  description?: string;
  location?: string;
  pageId: string;
  pageTitle: string;
  caldavUrl?: string;
  caldavEtag?: string;
  color: string;
  synced: boolean;
}

export type SyncStatus = "idle" | "syncing" | "error" | "success";

interface CalendarState {
  events: StoreEvent[];
  syncStatus: SyncStatus;
  lastSyncAt: number | null;
  lastSyncError: string | null;

  // Actions
  loadEvents: () => Promise<void>;
  sync: () => Promise<void>;
  createEvent: (data: EventFormData, pageId: string, calendarEntry?: CalendarEntry) => Promise<void>;
  updateEvent: (blockId: string, data: Partial<EventFormData>) => Promise<void>;
  deleteEvent: (blockId: string) => Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractText(node: Record<string, unknown>): string {
  if (typeof node.text === "string") return node.text;
  if (Array.isArray(node.content))
    return (node.content as Record<string, unknown>[]).map(extractText).join("");
  return "";
}

function statusColor(caldavStatus?: string): string {
  if (caldavStatus === "COMPLETED") return "#3d8a5c";
  if (caldavStatus === "CANCELLED") return "#6b3333";
  return "#5b6a7a";
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useCalendarStore = create<CalendarState>()((set, get) => ({
  events: [],
  syncStatus: "idle",
  lastSyncAt: null,
  lastSyncError: null,

  // ── Charger tous les événements depuis IndexedDB ───────────────────────────
  loadEvents: async () => {
    const pages = await loadAllPages();
    const pageMap = new Map(pages.map((p) => [p.id, p.title]));

    // Load both task and calendar-event block types with a dueDate
    const allBlocks = await db.blocks.filter((b) => !b.isDeleted).toArray();
    const events: StoreEvent[] = [];

    for (const block of allBlocks) {
      if (block.type !== "task" && block.type !== "calendar-event") continue;
      try {
        const props = await decryptValue<CalDAVBlockProps>(block.encryptedProperties);
        if (!props.dueDate) continue;

        const content = await decryptValue<Record<string, unknown>>(block.encryptedContent);
        const title = extractText(content) || "Sans titre";

        events.push({
          id: block.id,
          uid: props.caldavEventId ?? block.id,
          title,
          start: props.dueDate,
          end: props.endDate,
          description: props.description,
          location: props.location,
          pageId: block.pageId,
          pageTitle: pageMap.get(block.pageId) ?? "—",
          caldavUrl: props.caldavUrl,
          caldavEtag: props.caldavEtag,
          color: statusColor(props.status),
          synced: !!props.caldavEventId,
        });
      } catch { /* bloc inaccessible */ }
    }

    events.sort((a, b) => a.start.localeCompare(b.start));
    set({ events });
  },

  // ── Sync pull depuis tous les calendriers CalDAV ───────────────────────────
  sync: async () => {
    const caldav = useSettingsStore.getState().caldav;

    if (!caldav || !caldav.calendars?.length) {
      set({ syncStatus: "error", lastSyncError: "Configurez CalDAV dans les paramètres." });
      return;
    }

    set({ syncStatus: "syncing" });
    try {
      let hasError = false;
      const errors: string[] = [];

      const calendarsToSync = caldav.calendars.filter((e) => !!e.targetPageId);
      if (calendarsToSync.length === 0) {
        set({
          syncStatus: "error",
          lastSyncError:
            "Aucun calendrier n'a de page cible. Dans Paramètres → CalDAV, assignez une page à chaque calendrier puis sauvegardez.",
        });
        return;
      }

      for (const entry of calendarsToSync) {
        const result = await syncCalDAV(caldav, entry);
        if (result.errorMessage) {
          hasError = true;
          errors.push(`${entry.displayName}: ${result.errorMessage}`);
        }
      }

      await get().loadEvents();

      if (hasError) {
        set({ syncStatus: "error", lastSyncError: errors.join("\n") });
      } else {
        set({ syncStatus: "success", lastSyncAt: Date.now(), lastSyncError: null });
        setTimeout(() => set({ syncStatus: "idle" }), 3000);
      }
    } catch (err) {
      set({ syncStatus: "error", lastSyncError: String(err) });
    }
  },

  // ── Créer un événement local + push CalDAV ────────────────────────────────
  createEvent: async (data, pageId, calendarEntry?) => {
    const uid = data.uid ?? crypto.randomUUID();
    const now = Date.now();
    const blockType = calendarEntry?.mode === "kanban" ? "task" : "calendar-event";

    const content = { type: "paragraph", content: [{ type: "text", text: data.summary }] };

    // Tentative push CalDAV si un calendrier cible est fourni
    const caldav = useSettingsStore.getState().caldav;
    let caldavUrl: string | undefined;
    let caldavEtag: string | undefined;

    if (caldav && calendarEntry) {
      const pushResult = await pushEventToCalDAV(caldav, {
        ...data,
        uid,
        caldavUrl: calendarEntry.url
          ? calendarEntry.url.replace(/\/?$/, "/") + uid + ".ics"
          : undefined,
      });
      if (pushResult.ok) {
        caldavUrl = pushResult.url;
        caldavEtag = pushResult.etag;
      }
    }

    const props: CalDAVBlockProps = {
      dueDate: data.dtstart,
      endDate: data.dtend,
      description: data.description,
      location: data.location,
      caldavEventId: uid,
      caldavUrl,
      caldavEtag,
    };

    const count = await db.blocks.where("pageId").equals(pageId).count();
    await db.blocks.add({
      id: crypto.randomUUID(),
      pageId,
      parentBlockId: null,
      type: blockType,
      encryptedContent: await encryptValue(content),
      encryptedProperties: await encryptValue(props),
      order: count,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    });

    await get().loadEvents();
  },

  // ── Mettre à jour un événement local + push CalDAV ────────────────────────
  updateEvent: async (blockId, data) => {
    const block = await db.blocks.get(blockId);
    if (!block) return;

    const oldProps = await decryptValue<CalDAVBlockProps>(block.encryptedProperties);
    const oldContent = await decryptValue<Record<string, unknown>>(block.encryptedContent);
    const oldTitle = extractText(oldContent);

    const newTitle = data.summary ?? oldTitle;
    const newContent = { type: "paragraph", content: [{ type: "text", text: newTitle }] };

    const newProps: CalDAVBlockProps = {
      ...oldProps,
      dueDate: data.dtstart ?? oldProps.dueDate,
      endDate: data.dtend ?? oldProps.endDate,
      description: data.description ?? oldProps.description,
      location: data.location ?? oldProps.location,
    };

    // Push CalDAV si l'événement est synchronisé
    const caldav = useSettingsStore.getState().caldav;
    if (caldav && oldProps.caldavEventId) {
      const pushResult = await pushEventToCalDAV(caldav, {
        uid: oldProps.caldavEventId,
        summary: newTitle,
        dtstart: newProps.dueDate ?? data.dtstart ?? "",
        dtend: newProps.endDate,
        description: newProps.description,
        location: newProps.location,
        caldavUrl: oldProps.caldavUrl,
        caldavEtag: oldProps.caldavEtag,
      });
      if (pushResult.ok) {
        newProps.caldavEtag = pushResult.etag;
      }
    }

    await db.blocks.update(blockId, {
      encryptedContent: await encryptValue(newContent),
      encryptedProperties: await encryptValue(newProps),
      updatedAt: Date.now(),
    });

    await get().loadEvents();
  },

  // ── Supprimer un événement local + DELETE CalDAV ──────────────────────────
  deleteEvent: async (blockId) => {
    const block = await db.blocks.get(blockId);
    if (!block) return;

    const props = await decryptValue<CalDAVBlockProps>(block.encryptedProperties);

    // Supprimer sur CalDAV si synchronisé
    const caldav = useSettingsStore.getState().caldav;
    if (caldav && props.caldavUrl) {
      await deleteEventFromCalDAV(caldav, props.caldavUrl, props.caldavEtag);
    }

    await db.blocks.update(blockId, { isDeleted: true, updatedAt: Date.now() });
    await get().loadEvents();
  },
}));
