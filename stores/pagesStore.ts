"use client";

import { create } from "zustand";
import { db, type PageRecord, type BlockRecord } from "@/lib/database";
import {
  loadAllPages,
  createPage,
  updatePageTitle,
  softDeletePage,
  reorderPage,
  type DecryptedPage,
} from "@/lib/BlockService";

interface PagesState {
  pages: DecryptedPage[];
  activePageId: string | null;
  isLoading: boolean;

  // Actions
  loadPages: () => Promise<void>;
  newPage: (title?: string, parentId?: string | null) => Promise<DecryptedPage>;
  newFolder: (title?: string, parentId?: string | null) => Promise<DecryptedPage>;
  renamePage: (id: string, title: string) => Promise<void>;
  deletePage: (id: string) => Promise<void>;
  movePage: (id: string, newOrder: number, newParentId?: string | null) => Promise<void>;
  setActivePage: (id: string | null) => void;
  setPageTags: (id: string, tagIds: string[]) => Promise<void>;
  restorePage: (id: string) => Promise<void>;
  permanentlyDeletePage: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  lock: () => void;
}

export const usePagesStore = create<PagesState>()((set, get) => ({
  pages: [],
  activePageId: null,
  isLoading: false,

  loadPages: async () => {
    set({ isLoading: true });
    const pages = await loadAllPages();
    set({ pages, isLoading: false });
  },

  newPage: async (title = "Nouvelle page", parentId = null) => {
    const page = await createPage(title, parentId, false);
    set((s) => ({ pages: [...s.pages, page], activePageId: page.id }));
    return page;
  },

  newFolder: async (title = "Nouveau dossier", parentId = null) => {
    const folder = await createPage(title, parentId, true);
    // Un dossier ne devient pas la page active
    set((s) => ({ pages: [...s.pages, folder] }));
    return folder;
  },

  renamePage: async (id, title) => {
    await updatePageTitle(id, title);
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, title } : p)),
    }));
  },

  deletePage: async (id) => {
    await softDeletePage(id);
    const { activePageId, pages } = get();
    const remaining = pages.filter((p) => p.id !== id && p.parentId !== id);
    const newActive = activePageId === id ? (remaining[0]?.id ?? null) : activePageId;
    set({ pages: remaining, activePageId: newActive });
  },

  movePage: async (id, newOrder, newParentId) => {
    await reorderPage(id, newOrder, newParentId);
    set((s) => ({
      pages: s.pages.map((p) =>
        p.id === id
          ? { ...p, order: newOrder, parentId: newParentId !== undefined ? newParentId : p.parentId }
          : p
      ),
    }));
  },

  setActivePage: (id) => set({ activePageId: id }),

  setPageTags: async (id, tagIds) => {
    await db.pages.update(id, { tagIds });
    set((s) => ({ pages: s.pages.map((p) => p.id === id ? { ...p, tagIds } : p) }));
  },

  restorePage: async (id) => {
    await db.pages.update(id, { isDeleted: false, updatedAt: Date.now() });
    await get().loadPages();
  },

  permanentlyDeletePage: async (id) => {
    await db.blocks.where("pageId").equals(id).delete();
    // Supprimer aussi les enfants directs (eux-mêmes supprimés)
    const children = await db.pages.filter((p: PageRecord) => p.parentId === id).primaryKeys();
    for (const childId of children as string[]) {
      await db.blocks.where("pageId").equals(childId as string).delete();
      await db.pages.delete(childId as string);
    }
    await db.pages.delete(id);
  },

  emptyTrash: async () => {
    const deletedPages = await db.pages.filter((p: PageRecord) => p.isDeleted).toArray();
    for (const p of deletedPages) {
      await db.blocks.where("pageId").equals(p.id).delete();
    }
    await db.pages.filter((p: PageRecord) => p.isDeleted).delete();
    await db.blocks.filter((b: BlockRecord) => b.isDeleted).delete();
    await get().loadPages();
  },

  lock: () => set({ pages: [], activePageId: null, isLoading: false }),
}));
