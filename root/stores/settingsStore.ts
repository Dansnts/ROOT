"use client";

import { create } from "zustand";
import { db } from "@/lib/database";
import { encryptValue, decryptValue } from "@/stores/vaultStore";
import type { CalDAVConfig } from "@/lib/database";

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
        db.settings.get("caldav_config"),
        db.settings.get("user_name"),
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
              targetPageId: raw.calendarPath,
            }],
          };
        } else {
          caldav = { ...raw, calendars: raw?.calendars ?? [] };
        }
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
      key: "caldav_config",
      encryptedValue: await encryptValue(config),
      updatedAt: Date.now(),
    });
    set({ caldav: config });
  },

  clearCalDAV: async () => {
    await db.settings.delete("caldav_config");
    set({ caldav: null });
  },

  saveUserName: async (name: string) => {
    const trimmed = name.trim();
    await db.settings.put({
      key: "user_name",
      encryptedValue: await encryptValue(trimmed),
      updatedAt: Date.now(),
    });
    // Aussi dans localStorage pour affichage sur l'écran de verrouillage (avant unlock)
    try { localStorage.setItem("root-username", trimmed); } catch { /* ignore */ }
    set({ userName: trimmed });
  },
}));
