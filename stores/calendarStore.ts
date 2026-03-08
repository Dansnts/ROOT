"use client";

import { create } from "zustand";
import { db } from "@/lib/database";
import { encryptValue, decryptValue } from "@/stores/vaultStore";
import {
  pushEventToCalDAV,
  deleteEventFromCalDAV,
  syncCalDAV,
  type EventFormData,
  type CalDAVBlockProps,
} from "@/lib/CalDAVService";
import { useSettingsStore } from "@/stores/settingsStore";
import { useCategoriesStore } from "@/stores/categoriesStore";
import { useTagsStore } from "@/stores/tagsStore";
import { KANBAN_PAGE_ID } from "@/lib/KanbanService";
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
  categoryId: string;
  categoryName: string;
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

  loadEvents: () => Promise<void>;
  sync: () => Promise<void>;
  createEvent: (data: EventFormData, categoryId: string, calendarEntry?: CalendarEntry) => Promise<void>;
  updateEvent: (blockId: string, data: Partial<EventFormData>) => Promise<void>;
  deleteEvent: (blockId: string) => Promise<void>;
  deleteEventLocal: (blockId: string) => Promise<void>;
  deleteCalendarEvents: (categoryId: string) => Promise<void>;
  moveEventToCategory: (blockId: string, newCategoryId: string) => Promise<void>;
}

// ID virtuel pour les events sans catégorie — jamais stocké en DB, 100% local
export const UNCATEGORIZED_ID = "__uncategorized__";

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractText(node: Record<string, unknown>): string {
  if (typeof node.text === "string") return node.text;
  if (Array.isArray(node.content))
    return (node.content as Record<string, unknown>[]).map(extractText).join("");
  return "";
}

function fallbackColor(caldavStatus?: string): string {
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
    // Si les catégories ne sont pas encore chargées, les charger maintenant
    let { categories } = useCategoriesStore.getState();
    if (categories.length === 0) {
      await useCategoriesStore.getState().loadCategories();
      categories = useCategoriesStore.getState().categories;
    }
    const catById = new Map(categories.map((c) => [c.id, c]));

    const { tags } = useTagsStore.getState();
    const tagById = new Map(tags.map((t) => [t.id, t]));

    const allBlocks = await db.blocks.filter((b) => !b.isDeleted).toArray();
    const events: StoreEvent[] = [];

    for (const block of allBlocks) {
      if (block.type !== "task" && block.type !== "calendar-event") continue;
      try {
        const props = await decryptValue<CalDAVBlockProps>(block.encryptedProperties);
        if (!props.dueDate) continue;

        const content = await decryptValue<Record<string, unknown>>(block.encryptedContent);
        const title = extractText(content) || "Sans titre";

        const cat = catById.get(block.pageId);
        let color: string;
        let categoryId: string;
        let categoryName: string;

        if (cat) {
          // Événement CalDAV avec catégorie
          color = cat.color;
          categoryId = block.pageId;
          categoryName = cat.name;
        } else if (block.pageId === KANBAN_PAGE_ID) {
          // Tâche Kanban : couleur basée sur les tags
          const taskTagIds: string[] = (props as unknown as { tags?: string[] }).tags ?? [];
          const taskTags = taskTagIds.map((id) => tagById.get(id)).filter(Boolean);
          color = taskTags.length === 1
            ? taskTags[0]!.color
            : taskTags.length > 1
              ? "#6b7280"
              : fallbackColor(props.status);
          categoryId = KANBAN_PAGE_ID;
          categoryName = "Kanban";
        } else {
          // Événement sans catégorie connue
          color = fallbackColor(props.status);
          categoryId = UNCATEGORIZED_ID;
          categoryName = "Sans catégorie";
        }

        events.push({
          id: block.id,
          uid: props.caldavEventId ?? block.id,
          title,
          start: props.dueDate,
          end: props.endDate,
          description: props.description,
          location: props.location,
          categoryId,
          categoryName,
          caldavUrl: props.caldavUrl,
          caldavEtag: props.caldavEtag,
          color,
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
      const calendarsToSync = caldav.calendars.filter((e) => !!e.categoryId);
      if (calendarsToSync.length === 0) {
        set({
          syncStatus: "error",
          lastSyncError: "Aucun calendrier n'a de catégorie. Assignez une catégorie dans Paramètres → CalDAV.",
        });
        return;
      }

      const errors: string[] = [];
      for (const entry of calendarsToSync) {
        const result = await syncCalDAV(caldav, entry);
        if (result.errorMessage) {
          errors.push(`${entry.displayName}: ${result.errorMessage}`);
        }
      }

      await get().loadEvents();

      if (errors.length > 0) {
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
  createEvent: async (data, categoryId, calendarEntry?) => {
    const uid = data.uid ?? crypto.randomUUID();
    const now = Date.now();
    const blockType = calendarEntry?.mode === "kanban" ? "task" : "calendar-event";

    const content = { type: "paragraph", content: [{ type: "text", text: data.summary }] };

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

    const count = await db.blocks.where("pageId").equals(categoryId).count();
    await db.blocks.add({
      id: crypto.randomUUID(),
      pageId: categoryId,
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

  // ── Supprimer localement tous les events importés d'une catégorie ──────────
  // NE supprime PAS sur le serveur CalDAV (action locale uniquement).
  // La suppression d'un event individuel depuis le modal pousse bien le DELETE.
  deleteCalendarEvents: async (categoryId) => {
    const blocks = await db.blocks
      .where("pageId").equals(categoryId)
      .filter((b) => !b.isDeleted && (b.type === "calendar-event" || b.type === "task"))
      .toArray();

    for (const block of blocks) {
      try {
        await db.blocks.update(block.id, { isDeleted: true, updatedAt: Date.now() });
      } catch { /* skip */ }
    }
    await get().loadEvents();
  },

  // ── Déplacer un événement vers une autre catégorie ────────────────────────
  moveEventToCategory: async (blockId, newCategoryId) => {
    await db.blocks.update(blockId, { pageId: newCategoryId, updatedAt: Date.now() });
    await get().loadEvents();
  },

  // ── Supprimer un événement localement uniquement (sans push serveur) ─────
  deleteEventLocal: async (blockId) => {
    await db.blocks.update(blockId, { isDeleted: true, updatedAt: Date.now() });
    await get().loadEvents();
  },

  // ── Supprimer un événement local + DELETE CalDAV ──────────────────────────
  deleteEvent: async (blockId) => {
    const block = await db.blocks.get(blockId);
    if (!block) return;

    const props = await decryptValue<CalDAVBlockProps>(block.encryptedProperties);

    const caldav = useSettingsStore.getState().caldav;
    if (caldav && props.caldavUrl) {
      await deleteEventFromCalDAV(caldav, props.caldavUrl, props.caldavEtag);
    }

    await db.blocks.update(blockId, { isDeleted: true, updatedAt: Date.now() });
    await get().loadEvents();
  },
}));
