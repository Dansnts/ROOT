"use client";

import { create } from "zustand";
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

  lock: () => set({ pages: [], activePageId: null, isLoading: false }),
}));
