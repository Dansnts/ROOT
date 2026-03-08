"use client";

import { create } from "zustand";
import { db } from "@/lib/database";
import { encryptValue, decryptValue } from "@/stores/vaultStore";
import type { CalDAVConfig, CalendarCategory } from "@/lib/database";
import { DB_KEYS, LS_KEYS } from "@/lib/constants";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UIPreferences {
  sidebarWidth: number;
}

interface SettingsState {
  caldav: CalDAVConfig | null;
  ui: UIPreferences;
  userName: string | null;
  isLoading: boolean;

  loadSettings: () => Promise<void>;
  saveCalDAV: (config: CalDAVConfig) => Promise<void>;
  clearCalDAV: () => Promise<void>;
  saveUserName: (name: string) => Promise<void>;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsState>()((set) => ({
  caldav: null,
  ui: { sidebarWidth: 240 },
  userName: null,
  isLoading: false,

  loadSettings: async () => {
    set({ isLoading: true });
    try {
      const [caldavRow, nameRow] = await Promise.all([
        db.settings.get(DB_KEYS.caldavConfig),
        db.settings.get(DB_KEYS.userName),
      ]);

      let caldav: CalDAVConfig | null = null;
      if (caldavRow) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = await decryptValue<any>(caldavRow.encryptedValue);
        if (raw && !raw.calendars && raw.calendarPath) {
          caldav = {
            serverUrl: raw.serverUrl,
            username: raw.username,
            password: raw.password,
            calendars: [{
              url: raw.serverUrl,
              displayName: "Calendrier",
              mode: "calendar",
              categoryId: raw.calendarPath,
            }],
          };
        } else {
          caldav = { ...raw, calendars: raw?.calendars ?? [] };
        }
      }

      // ── Migration : targetPageId → categoryId ────────────────────────────
      if (caldav?.calendars?.some((c) => c.targetPageId && !c.categoryId)) {
        const catRow = await db.settings.get(DB_KEYS.calendarCategories);
        const existingCats: CalendarCategory[] = catRow
          ? (await decryptValue<CalendarCategory[]>(catRow.encryptedValue) ?? [])
          : [];
        const catMap = new Map(existingCats.map((c) => [c.id, c]));
        const newCats = [...existingCats];
        caldav = {
          ...caldav,
          calendars: caldav.calendars.map((entry) => {
            if (entry.targetPageId && !entry.categoryId) {
              if (!catMap.has(entry.targetPageId)) {
                const cat: CalendarCategory = {
                  id: entry.targetPageId,
                  name: entry.displayName,
                  color: entry.color ?? "#5b6a7a",
                };
                newCats.push(cat);
                catMap.set(cat.id, cat);
              }
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { targetPageId: _, ...rest } = entry;
              return { ...rest, categoryId: entry.targetPageId };
            }
            return entry;
          }),
        };
        // Persist migrated data
        await db.settings.put({
          key: DB_KEYS.calendarCategories,
          encryptedValue: await encryptValue(newCats),
          updatedAt: Date.now(),
        });
        await db.settings.put({
          key: DB_KEYS.caldavConfig,
          encryptedValue: await encryptValue(caldav),
          updatedAt: Date.now(),
        });
      }

      let userName: string | null = null;
      if (nameRow) {
        userName = await decryptValue<string>(nameRow.encryptedValue);
      }

      set({ caldav, userName, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  saveCalDAV: async (config) => {
    await db.settings.put({
      key: DB_KEYS.caldavConfig,
      encryptedValue: await encryptValue(config),
      updatedAt: Date.now(),
    });
    set({ caldav: config });
  },

  clearCalDAV: async () => {
    await db.settings.delete(DB_KEYS.caldavConfig);
    set({ caldav: null });
  },

  saveUserName: async (name: string) => {
    const trimmed = name.trim();
    await db.settings.put({
      key: DB_KEYS.userName,
      encryptedValue: await encryptValue(trimmed),
      updatedAt: Date.now(),
    });
    // Aussi dans localStorage pour affichage sur l'écran de verrouillage (avant unlock)
    try { localStorage.setItem(LS_KEYS.username, trimmed); } catch { /* ignore */ }
    set({ userName: trimmed });
  },
}));
