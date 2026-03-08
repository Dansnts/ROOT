"use client";

import { create } from "zustand";
import { db } from "@/lib/database";
import { encryptValue, decryptValue } from "@/stores/vaultStore";
import type { CalendarCategory } from "@/lib/database";

export type { CalendarCategory };

interface CategoriesState {
  categories: CalendarCategory[];
  loadCategories: () => Promise<void>;
  saveCategories: (cats: CalendarCategory[]) => Promise<void>;
  createCategory: (name: string, color: string) => Promise<CalendarCategory>;
  updateCategory: (id: string, patch: Partial<Omit<CalendarCategory, "id">>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  lock: () => void;
}

export const useCategoriesStore = create<CategoriesState>()((set, get) => ({
  categories: [],

  loadCategories: async () => {
    const row = await db.settings.get("calendar_categories");
    if (!row) { set({ categories: [] }); return; }
    const cats = await decryptValue<CalendarCategory[]>(row.encryptedValue);
    set({ categories: cats ?? [] });
  },

  saveCategories: async (cats) => {
    await db.settings.put({
      key: "calendar_categories",
      encryptedValue: await encryptValue(cats),
      updatedAt: Date.now(),
    });
    set({ categories: cats });
  },

  createCategory: async (name, color) => {
    const cat: CalendarCategory = { id: crypto.randomUUID(), name, color };
    await get().saveCategories([...get().categories, cat]);
    return cat;
  },

  updateCategory: async (id, patch) => {
    await get().saveCategories(
      get().categories.map((c) => c.id === id ? { ...c, ...patch } : c)
    );
  },

  deleteCategory: async (id) => {
    await get().saveCategories(get().categories.filter((c) => c.id !== id));
  },

  lock: () => set({ categories: [] }),
}));
