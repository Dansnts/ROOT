"use client";

import { create } from "zustand";
import { db } from "@/lib/database";
import { encryptValue, decryptValue } from "@/stores/vaultStore";
import type { TagDefinition } from "@/lib/database";

interface TagsState {
  tags: TagDefinition[];
  loadTags: () => Promise<void>;
  createTag: (name: string, color: string) => Promise<TagDefinition>;
  updateTag: (id: string, name: string, color: string) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;
  setTaskTags: (blockId: string, tagIds: string[]) => Promise<void>;
  lock: () => void;
}

async function persist(tags: TagDefinition[]) {
  await db.settings.put({
    key: "app_tags",
    encryptedValue: await encryptValue(tags),
    updatedAt: Date.now(),
  });
}

export const useTagsStore = create<TagsState>()((set, get) => ({
  tags: [],

  loadTags: async () => {
    const row = await db.settings.get("app_tags");
    if (!row) { set({ tags: [] }); return; }
    const tags = await decryptValue<TagDefinition[]>(row.encryptedValue) ?? [];
    set({ tags });
  },

  createTag: async (name, color) => {
    const tag: TagDefinition = { id: crypto.randomUUID(), name, color, createdAt: Date.now() };
    const tags = [...get().tags, tag];
    await persist(tags);
    set({ tags });
    return tag;
  },

  updateTag: async (id, name, color) => {
    const tags = get().tags.map((t) => t.id === id ? { ...t, name, color } : t);
    await persist(tags);
    set({ tags });
  },

  deleteTag: async (id) => {
    const tags = get().tags.filter((t) => t.id !== id);
    await persist(tags);
    set({ tags });
    // Retirer le tag de toutes les pages
    const pages = await db.pages.filter((p) => (p.tagIds ?? []).includes(id)).toArray();
    for (const p of pages) {
      await db.pages.update(p.id, { tagIds: (p.tagIds ?? []).filter((tid) => tid !== id) });
    }
    // Retirer le tag de tous les blocs (tasks)
    const blocks = await db.blocks.filter((b) => (b.tagIds ?? []).includes(id)).toArray();
    for (const b of blocks) {
      await db.blocks.update(b.id, { tagIds: (b.tagIds ?? []).filter((tid) => tid !== id) });
    }
  },

  setTaskTags: async (blockId, tagIds) => {
    await db.blocks.update(blockId, { tagIds });
  },

  lock: () => set({ tags: [] }),
}));
